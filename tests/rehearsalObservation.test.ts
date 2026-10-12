import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual test observer, rather than a second implementation. This
// adapter polls once so resource-starved renderer transport is deterministic.
function observer(name: string, globals: Record<string, unknown>) {
  const path = 'browser-tests/integration-rehearsal.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(node => ts.isFunctionDeclaration(node));
  const body = declarations.map(node => node.getText(source)).join('\n');
  const assertion = new Proxy(expect, { get(target, key) {
    if (key === 'poll') return (read: () => unknown) => ({ toBe: async (value: unknown) => expect(await read()).toBe(value) });
    return Reflect.get(target, key);
  } });
  return runInNewContext(ts.transpileModule(body + `\n${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { expect: assertion, observedReceipts: new WeakMap(), ...globals }) as (...args: unknown[]) => Promise<unknown>;
}

describe('rehearsal event-owned observation transport', () => {
  it('joins the neutral receipt to its completed owner frame in one round trip', async () => {
    let finish!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { finish = resolve; });
    const reads = vi.fn(() => true);
    const seam = { waitForInputFrame: () => pending, isSceneActive: () => true, isMenuInputNeutral: reads };
    const run = observer('neutral', { __MEOWCENARY_VISUAL_TEST__: seam });
    const evaluate = vi.fn(async (read: (arg?: unknown) => unknown, arg?: unknown) => read(arg));
    const done = run({ evaluate });
    expect(reads).not.toHaveBeenCalled();
    finish(true); await done;
    expect(reads).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
  it.each([false, null, 'stale-frame'])('cannot read or accept neutral state after a %s frame', async completed => {
    const reads = vi.fn(() => true);
    const seam = { waitForInputFrame: async () => completed, isSceneActive: () => true, isMenuInputNeutral: reads };
    const run = observer('neutral', { __MEOWCENARY_VISUAL_TEST__: seam });
    await expect(run({ evaluate: async (read: () => unknown) => read() })).rejects.toThrow();
    expect(reads).not.toHaveBeenCalled();
  });
  it.each([
    { inputNeutral: false, inputQuarantined: false },
    { inputNeutral: true, inputQuarantined: true },
  ])('requires both Game input neutrality and released quarantine: %j', async state => {
    const seam = { waitForInputFrame: async () => true, isSceneActive: () => false, runStartIntroDiagnostics: () => state };
    const run = observer('neutral', { __MEOWCENARY_VISUAL_TEST__: seam });
    await expect(run({ evaluate: async (read: () => unknown) => read() })).rejects.toThrow();
  });
  it('attaches intro, preparation and physical receipts from one browser sample', async () => {
    let generation = 0;
    const seam = { runStartIntroDiagnostics: () => ({ generation }), runPreparationDiagnostics: () => ({ generation }) };
    const events = { get generation() { return generation; } };
    const writeFile = vi.fn(), attach = vi.fn();
    const run = observer('capture', { __MEOWCENARY_VISUAL_TEST__: seam, __REHEARSAL_EVENTS__: events, writeFile });
    const evaluate = vi.fn(async (read: (arg?: unknown) => unknown, arg?: unknown) => { generation++; return structuredClone(await read(arg)); });
    const page = { evaluate, viewportSize: () => ({ width: 1920, height: 1080 }), screenshot: vi.fn() };
    await run(page, { project: { name: 'desktop' }, outputPath: (path: string) => path, attach }, 'state', {});
    const facts = JSON.parse(writeFile.mock.calls[0][1] as string);
    expect(facts.intro.generation).toBe(facts.preparation.generation);
    expect(facts.intro.generation).toBe(facts.physicalEvents.generation);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(2); expect(page.screenshot).toHaveBeenCalledTimes(1);
  });
  it('records accepted physical holds before another owner frame or protocol request', async () => {
    let finish!: (value: boolean) => void;
    const pending = new Promise<boolean>(resolve => { finish = resolve; });
    const state = { runStart: { count: 1 }, identity: { seed: 42 }, inputMode: 'keyboard', confirmHeld: true, inputNeutral: false };
    const reads = vi.fn(() => state), events: unknown[] = [];
    const run = observer('observeReceipt', { performance: { now: () => 123 }, __REHEARSAL_EVENTS__: events,
      __MEOWCENARY_VISUAL_TEST__: { waitForInputFrame: () => pending, runStartIntroDiagnostics: reads } });
    const evaluate = vi.fn(async (read: (arg: unknown) => unknown, arg: unknown) => read(arg));
    const done = run({ evaluate }, { kind: 'start' }, { key: 'Enter', button: 0 });
    expect(events).toEqual([]); expect(reads).not.toHaveBeenCalled();
    finish(true); expect(await done).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'held-post-step', key: 'Enter', button: 0, atMs: 123, sampledAtMs: 123,
      inputMode: 'keyboard', confirmHeld: true, neutral: false }]);
  });
  it.each([false, null, 'stale-frame'])('a %s receipt frame cannot record admission', async completed => {
    const reads = vi.fn(() => ({ runStart: { count: 1 } })), events: unknown[] = [];
    const run = observer('observeReceipt', { __REHEARSAL_EVENTS__: events,
      __MEOWCENARY_VISUAL_TEST__: { waitForInputFrame: async () => completed, runStartIntroDiagnostics: reads } });
    await expect(run({ evaluate: async (read: (arg: unknown) => unknown, arg: unknown) => read(arg) },
      { kind: 'start' }, { key: 'Enter', button: 0 })).rejects.toThrow();
    expect(reads).not.toHaveBeenCalled(); expect(events).toEqual([]);
  });
  it('propagates a destroyed frame owner without reading receipts', async () => {
    const error = new Error('game destroyed'), reads = vi.fn();
    const run = observer('observeReceipt', { __MEOWCENARY_VISUAL_TEST__: {
      waitForInputFrame: async () => { throw error; }, runStartIntroDiagnostics: reads } });
    await expect(run({ evaluate: async (read: (arg: unknown) => unknown, arg: unknown) => read(arg) }, { kind: 'start' })).rejects.toBe(error);
    expect(reads).not.toHaveBeenCalled();
  });
  it('a disappeared summary is not a successful focus change', async () => {
    const run = observer('observeReceipt', { __MEOWCENARY_VISUAL_TEST__: {
      waitForInputFrame: async () => true, summaryActionDiagnostics: () => undefined } });
    await expect(run({ evaluate: async (read: (arg: unknown) => unknown, arg: unknown) => read(arg) },
      { kind: 'focus', surface: 'summary', previous: 'Retry' })).rejects.toThrow();
  });
  it.each([
    { menu: true, game: true, accepted: false },
    { menu: false, game: false, accepted: false },
    { menu: true, game: false, accepted: true },
  ])('Main Menu admission requires Menu active and Game stopped: %j', async state => {
    const run = observer('observeReceipt', { __MEOWCENARY_VISUAL_TEST__: {
      waitForInputFrame: async () => true, isSceneActive: (key: string) => key === 'MenuScene' ? state.menu : state.game } });
    expect(await run({ evaluate: async (read: (arg: unknown) => unknown, arg: unknown) => read(arg) },
      { kind: 'summary', label: 'Main Menu', previousSeed: 42 })).toBe(state.accepted);
  });
});
