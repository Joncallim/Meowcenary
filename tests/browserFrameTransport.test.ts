import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual browser helper. The frame promises below are deliberately
// deferred; transport batching must never batch the owner updates themselves.
function harness(waitForInputFrame: () => Promise<boolean>) {
  const path = 'browser-tests/ability-comprehension.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'frame');
  if (!fn) throw new Error('Missing browser owner-frame helper');
  const frame = runInNewContext(ts.transpileModule(fn.getText(source) + '\nframe;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { expect, __MEOWCENARY_VISUAL_TEST__: { waitForInputFrame } }) as
    (page: { evaluate: (callback: (count: number) => Promise<boolean[]>, count: number) => Promise<boolean[]> }, count?: number) => Promise<void>;
  const evaluate = vi.fn(async (callback: (count: number) => Promise<boolean[]>, count: number) => callback(count));
  return { run: (count?: number) => frame({ evaluate }, count), evaluate };
}

describe('browser owner-frame transport', () => {
  it.each([1, 2, 4])('joins exactly %s sequential owner frames through one transport', async count => {
    const waits = vi.fn(async () => true), h = harness(waits);
    await h.run(count);
    expect(waits).toHaveBeenCalledTimes(count);
    expect(h.evaluate).toHaveBeenCalledTimes(1);
  });
  it('cannot request the next frame while the previous frame remains unresolved', async () => {
    const pending: Array<(value: boolean) => void> = [];
    const signals: Array<() => void> = [];
    const started = Array.from({ length: 4 }, () => new Promise<void>(resolve => signals.push(resolve)));
    const waits = vi.fn(() => new Promise<boolean>(resolve => {
      const index = pending.length; pending.push(resolve); signals[index]();
    })), h = harness(waits);
    const done = h.run(4);
    for (let index = 0; index < 4; index++) {
      await started[index];
      expect(waits).toHaveBeenCalledTimes(index + 1);
      pending[index](true);
    }
    await done; expect(h.evaluate).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1, 2])('a false frame at %s prevents all later owner waits', async failureAt => {
    let calls = 0;
    const waits = vi.fn(async () => calls++ !== failureAt), h = harness(waits);
    await expect(h.run(4)).rejects.toThrow();
    expect(waits).toHaveBeenCalledTimes(failureAt + 1);
  });
  it('preserves the original rejection and requests no following frame', async () => {
    const reason = new Error('scene shutdown');
    const waits = vi.fn(async () => { throw reason; }), h = harness(waits);
    await expect(h.run(4)).rejects.toBe(reason);
    expect(waits).toHaveBeenCalledTimes(1);
  });
});

it('missing Ability diagnostics cannot produce a successful evidence attachment', async () => {
  const path = 'browser-tests/ability-comprehension.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'captureFacts');
  if (!fn) throw new Error('Missing browser evidence helper');
  const writeFile = vi.fn(), attach = vi.fn();
  const capture = runInNewContext(ts.transpileModule(fn.getText(source) + '\ncaptureFacts;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { expect, writeFile, devicePixelRatio: 1,
    __MEOWCENARY_VISUAL_TEST__: { runStartIntroDiagnostics: () => undefined } }) as
    (page: unknown, info: unknown, name: string) => Promise<void>;
  const page = { evaluate: async (callback: () => unknown) => callback(), viewportSize: () => ({ width: 1920, height: 1080 }) };
  const info = { outputPath: () => 'discarded-test-evidence.json', attach, project: { name: 'desktop' } };
  await expect(capture(page, info, 'missing-owner')).rejects.toThrow();
  expect(writeFile).not.toHaveBeenCalled(); expect(attach).not.toHaveBeenCalled();
});

it.each([null, 'stale-owner'])('a malformed %s frame stops before any following wait', async value => {
  const waits = vi.fn(async () => value as unknown as boolean), h = harness(waits);
  await expect(h.run(4)).rejects.toThrow();
  expect(waits).toHaveBeenCalledTimes(1);
});

function menuGestureSampleHarness(homeSettled = true) {
  const path = 'browser-tests/menu-gesture-ownership.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'sample');
  if (!fn) throw new Error('Missing actual gesture observation helper');
  const calls: string[] = [];
  const seam = {
    waitForMenuPresentation: async () => { calls.push('menu'); return homeSettled; },
    showMenu: (panel: string) => { calls.push(panel); return true; },
    waitForInputFrame: async () => { calls.push('frame'); return true; },
    menuLoadoutDiagnostics: () => { calls.push('diagnostic'); return { panel: 'equipment' }; },
    isMenuInputNeutral: () => true,
  };
  const run = runInNewContext(ts.transpileModule(fn.getText(source) + '\nsample;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { __MEOWCENARY_VISUAL_TEST__: seam,
    document: { querySelector: () => ({ dataset: {} }) }, localStorage: { getItem: () => 'same durable save' } }) as
    (page: unknown, prepare: boolean) => Promise<{ homeSettled: boolean; shown?: boolean; equipmentSettled?: boolean }>;
  const evaluate = vi.fn(async (callback: (prepare: boolean) => unknown, prepare: boolean) => callback(prepare));
  return { run: () => run({ evaluate }, true), evaluate, calls };
}

it('joins Home readiness, Equipment hydration and both real owner frames in one gesture-setup transport', async () => {
  const h = menuGestureSampleHarness();
  expect(await h.run()).toMatchObject({ homeSettled: true, shown: true, equipmentSettled: true });
  expect(h.calls).toEqual(['menu', 'equipment', 'menu', 'frame', 'frame', 'diagnostic']);
  expect(h.evaluate).toHaveBeenCalledTimes(1);
});

it('failed Home readiness cannot mount Equipment or read a fabricated gesture baseline', async () => {
  const h = menuGestureSampleHarness(false);
  expect(await h.run()).toMatchObject({ homeSettled: false });
  expect(h.calls).toEqual(['menu']);
});

function abilityObservationHarness(waits: Array<() => Promise<boolean>>, owner: unknown = { status: 'intro', timeMs: 0 }) {
  const path = 'browser-tests/ability-comprehension.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'observeAbilityFrame');
  if (!fn) throw new Error('Missing actual same-frame Ability observer');
  const state = vi.fn(() => owner), saved = vi.fn(() => 'durable'), frame = vi.fn(() => waits.shift()!());
  const observe = runInNewContext(ts.transpileModule(fn.getText(source) + '\nobserveAbilityFrame;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { expect, localStorage: { getItem: saved }, __TOUCH_REPAIR_EVENTS__: [{ type: 'touchcancel', trusted: true }],
    __MEOWCENARY_VISUAL_TEST__: { waitForInputFrame: frame, runStartIntroDiagnostics: state } }) as
    (page: unknown, count: number) => Promise<{ state: unknown; saved: string; contacts: unknown[] }>;
  const evaluate = vi.fn(async (callback: (count: number) => unknown, count: number) => callback(count));
  return { run: (count: number) => observe({ evaluate }, count), state, saved, frame, evaluate };
}

it('preserves immediate cancellation facts before the separate admission owner frame', async () => {
  const h = abilityObservationHarness([async () => true]);
  h.state.mockReturnValueOnce({ status: 'intro', timeMs: 0, inputNeutral: false });
  const immediate = await h.run(0);
  expect(immediate.state).toMatchObject({ status: 'intro', timeMs: 0, inputNeutral: false });
  expect(immediate.contacts).toEqual([{ type: 'touchcancel', trusted: true }]);
  expect(immediate.saved).toBe('durable');
  expect(h.frame).not.toHaveBeenCalled();
  h.state.mockReturnValueOnce({ status: 'intro', timeMs: 0, inputNeutral: true });
  const admitted = await h.run(1);
  expect(admitted.state).toMatchObject({ inputNeutral: true });
  expect(h.frame).toHaveBeenCalledOnce();
  expect(h.evaluate).toHaveBeenCalledTimes(2);
  expect(immediate.state).toMatchObject({ inputNeutral: false });
});

it('captures state, save and physical contacts only after every sequential owner frame, in one transport', async () => {
  let finishFirst!: (value: boolean) => void, finishSecond!: (value: boolean) => void;
  const first = new Promise<boolean>(resolve => { finishFirst = resolve; });
  const second = new Promise<boolean>(resolve => { finishSecond = resolve; });
  let secondEntered!: () => void;
  const entered = new Promise<void>(resolve => { secondEntered = resolve; });
  const h = abilityObservationHarness([() => first, () => { secondEntered(); return second; }]);
  const pending = h.run(2);
  expect(h.frame).toHaveBeenCalledTimes(1); expect(h.state).not.toHaveBeenCalled();
  finishFirst(true); await entered;
  expect(h.frame).toHaveBeenCalledTimes(2); expect(h.state).not.toHaveBeenCalled();
  finishSecond(true);
  expect(await pending).toMatchObject({ state: { status: 'intro', timeMs: 0 }, saved: 'durable', contacts: [{ type: 'touchcancel', trusted: true }] });
  expect(h.state).toHaveBeenCalledOnce(); expect(h.saved).toHaveBeenCalledOnce(); expect(h.evaluate).toHaveBeenCalledOnce();
});

it.each([false, null, 'stale-owner'])('a %s owner frame cannot become an Ability receipt or read durable state', async value => {
  const h = abilityObservationHarness([async () => value as boolean, async () => true]);
  await expect(h.run(2)).rejects.toThrow();
  expect(h.frame).toHaveBeenCalledOnce(); expect(h.state).not.toHaveBeenCalled(); expect(h.saved).not.toHaveBeenCalled();
});

it('missing Ability state after a completed frame cannot produce a successful receipt', async () => {
  const h = abilityObservationHarness([async () => true], undefined);
  // Passing undefined explicitly uses the fixture default; remove the actual
  // owner through its diagnostic return instead.
  h.state.mockReturnValueOnce(undefined);
  await expect(h.run(1)).rejects.toThrow();
});
