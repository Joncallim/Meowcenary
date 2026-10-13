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

function contactObserverHarness(hook: () => Promise<void>) {
  const path = 'browser-tests/ability-comprehension.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'observedContactPage');
  if (!fn) throw new Error('Missing real contact observer');
  const observer = runInNewContext(ts.transpileModule(fn.getText(source) + '\nobservedContactPage;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText) as (page: { evaluate: (sample: unknown) => Promise<unknown> }, events: unknown[], start: undefined, hook: () => Promise<void>) => { evaluate: (sample: unknown) => Promise<unknown> };
  return observer({ evaluate: async sample => sample }, [], undefined, hook);
}
it('contact observer parks only the helper continuation after its genuine first completed frame', async () => {
  let entered!: () => void, release!: () => void;
  const observed = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const hook = vi.fn(async () => { entered(); await held; });
  const page = contactObserverHarness(hook);
  const sample = { completed: true, state: { inputNeutral: false, inputQuarantined: false } };
  let settled = false; const pending = page.evaluate(sample).then(value => { settled = true; return value; });
  await Promise.race([observed, pending.then(() => { throw new Error('helper continued before held-owner rendezvous'); })]);
  expect(hook).toHaveBeenCalledTimes(1); expect(settled).toBe(false);
  release(); expect(await pending).toBe(sample); expect(sample.state.inputNeutral).toBe(false);
  expect(await page.evaluate(sample)).toBe(sample); expect(hook).toHaveBeenCalledTimes(1);
});
it.each([undefined, false, { completed: false }, { state: { inputNeutral: false } }])('contact observer never invents a completed input frame for %s', async sample => {
  const hook = vi.fn(async () => {}), page = contactObserverHarness(hook);
  expect(await page.evaluate(sample)).toBe(sample); expect(hook).not.toHaveBeenCalled();
});
it('contact observer preserves a held-observation rejection before admission', async () => {
  const reason = new Error('held owner assertion failed');
  const page = contactObserverHarness(async () => { throw reason; });
  await expect(page.evaluate({ completed: true, state: { inputNeutral: false } })).rejects.toBe(reason);
});

function heldAdmissionJoin() {
  const path = 'browser-tests/ability-comprehension.pw.ts';
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'awaitHeldAdmissionObservation');
  if (!fn) throw new Error('Missing real held-owner admission join');
  return runInNewContext(ts.transpileModule(fn.getText(source) + '\nawaitHeldAdmissionObservation;', {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText) as (observed: Promise<void>, pending: Promise<unknown>) => Promise<void>;
}
it('held-owner join exposes an early real helper rejection without waiting for a never-observed frame', async () => {
  const reason = new Error('real session creation failed');
  await expect(heldAdmissionJoin()(new Promise(() => {}), Promise.reject(reason))).rejects.toBe(reason);
});
it('held-owner join rejects helper success before the genuine observation', async () => {
  await expect(heldAdmissionJoin()(new Promise(() => {}), Promise.resolve({}))).rejects.toThrow('before its held-owner frame');
});
it('held-owner join accepts the observed frame while the real helper remains pending', async () => {
  await heldAdmissionJoin()(Promise.resolve(), new Promise(() => {}));
});
