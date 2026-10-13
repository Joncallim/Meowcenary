import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the real prepared observer and its real helper dependencies. Polling
// is single-read here so each diagnostic/frame boundary is deterministic.
function preparedObserver(globals: Record<string, unknown>) {
  const path = 'browser-tests/integration-rehearsal.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(node => ts.isFunctionDeclaration(node));
  const body = declarations.map(node => node.getText(source)).join('\n');
  const singleReadExpect = new Proxy(expect, { get(target, key) {
    if (key === 'poll') return (read: () => unknown) => ({
      toBe: async (value: unknown) => expect(await read()).toBe(value),
      toMatchObject: async (value: object) => expect(await read()).toMatchObject(value),
    });
    return Reflect.get(target, key);
  } });
  return runInNewContext(ts.transpileModule(body + '\nprepared;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { expect: singleReadExpect, observedReceipts: new WeakMap(), SAVE_KEY: 'meowcenary.save.v2',
    console: { info: vi.fn() }, ...globals }) as
    (page: { evaluate: (read: (arg?: unknown) => unknown, arg?: unknown) => Promise<unknown> }, request: unknown,
      arenaId: string, beforeSave: string | null) => Promise<unknown>;
}

type Identity = { characterId: string; stageId: string; arenaId: string; seed: number; contentVersion: string };
type Layout = { arenaId: string; seed: number; hash: string; generationVersion: number; contentVersion: string };
type Scenario = {
  initialIdentity?: Partial<Identity>;
  initialLayout?: Partial<Layout>;
  afterFinalFrameIdentity?: Partial<Identity>;
  afterFinalFrameLayout?: Partial<Layout>;
  afterFinalFrameIntro?: { runStart?: { count: number }; enemies?: number; terminalEvents?: number };
  saveAfterFinalFrame?: string | null;
  finalFrameResult?: unknown;
  deferredFinalFrame?: Promise<unknown>;
};

function harness(scenario: Scenario = {}) {
  const identity: Identity = { characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', arenaId: 'junkyard-lot', seed: 42,
    contentVersion: 'content-v1', ...scenario.initialIdentity };
  const layout: Layout = { arenaId: 'junkyard-lot', seed: 42, hash: 'a1', generationVersion: 1,
    contentVersion: 'content-v1', ...scenario.initialLayout };
  const beforeSave = '{"version":4,"unchanged":true}';
  let save: string | null = beforeSave, frameCount = 0;
  const seam = {
    waitForPreparedGame: vi.fn(async () => true),
    waitForInputFrame: vi.fn(async () => {
      frameCount++;
      if (frameCount === 2) {
        if (scenario.deferredFinalFrame) await scenario.deferredFinalFrame;
        if (scenario.saveAfterFinalFrame !== undefined) save = scenario.saveAfterFinalFrame;
        if (scenario.afterFinalFrameIdentity) Object.assign(identity, scenario.afterFinalFrameIdentity);
        if (scenario.afterFinalFrameLayout) Object.assign(layout, scenario.afterFinalFrameLayout);
        if (Object.hasOwn(scenario, 'finalFrameResult')) return scenario.finalFrameResult;
      }
      return true;
    }),
    isSceneActive: vi.fn(() => false),
    isMenuInputNeutral: vi.fn(() => true),
    runStartIntroDiagnostics: vi.fn(() => ({ visible: true, phase: 'brief', status: 'intro', timeMs: 0, inputNeutral: true,
      inputQuarantined: false, enemies: 0,
      runStart: { count: 0 }, terminalEvents: 0, identity: { ...identity },
      ...(frameCount >= 2 ? scenario.afterFinalFrameIntro : {}) })),
    arenaLayoutDiagnostics: vi.fn(() => ({ status: 'intro', timeMs: 0, layout: { ...layout } })),
  };
  const localStorage = { getItem: vi.fn(() => save) };
  const run = preparedObserver({ __MEOWCENARY_VISUAL_TEST__: seam, localStorage })(
    { evaluate: async (read, arg) => read(arg) },
    { kind: 'stage', characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 }, 'junkyard-lot', beforeSave);
  return { run, seam, localStorage, frameCount: () => frameCount };
}

describe('integration prepared observation boundary', () => {
  it('accepts the unchanged request, layout, and durable save', async () => {
    const h = harness();
    await expect(h.run).resolves.toMatchObject({ arenaId: 'junkyard-lot', seed: 42, hash: 'a1' });
  });

  it.each([
    ['intro identity seed', { afterFinalFrameIdentity: { seed: 99 } }],
    ['resolved arena layout hash', { afterFinalFrameLayout: { hash: 'b2' } }],
    ['consumed intro with unchanged time and identity', { afterFinalFrameIntro: { runStart: { count: 1 } } }],
  ] as const)('rejects a replaced %s after the final owning frame', async (_label, scenario) => {
    const h = harness(scenario);
    await expect(h.run).rejects.toThrow();
  });

  it('rejects an initial request identity mismatch', async () => {
    const h = harness({ initialIdentity: { seed: 99 } });
    await expect(h.run).rejects.toThrow();
    expect(h.frameCount()).toBe(1); // neutral's owner frame only
  });

  it('rejects a durable save change across the final owner frame', async () => {
    const h = harness({ saveAfterFinalFrame: '{"version":4,"changed":true}' });
    await expect(h.run).rejects.toThrow();
  });

  it.each([false, undefined, null, 'not-true'])('fails closed when the final owner frame returns %s', async finalFrameResult => {
    const h = harness({ finalFrameResult });
    await expect(h.run).rejects.toThrow();
    expect(h.seam.runStartIntroDiagnostics).toHaveBeenCalledTimes(2);
    expect(h.seam.arenaLayoutDiagnostics).toHaveBeenCalledTimes(1);
    expect(h.localStorage.getItem).not.toHaveBeenCalled();
  });

  it('does not read final intro, layout, or save diagnostics before the final owner frame resolves', async () => {
    let release!: () => void;
    const deferredFinalFrame = new Promise<void>(resolve => { release = resolve; });
    const h = harness({ deferredFinalFrame });
    const pending = h.run;
    await vi.waitFor(() => expect(h.frameCount()).toBe(2));
    expect(h.seam.runStartIntroDiagnostics).toHaveBeenCalledTimes(2);
    expect(h.seam.arenaLayoutDiagnostics).toHaveBeenCalledTimes(1);
    expect(h.localStorage.getItem).not.toHaveBeenCalled();
    release();
    await expect(pending).resolves.toMatchObject({ seed: 42, hash: 'a1' });
    expect(h.seam.runStartIntroDiagnostics).toHaveBeenCalledTimes(3);
    expect(h.localStorage.getItem).toHaveBeenCalledTimes(1);
  });
});
