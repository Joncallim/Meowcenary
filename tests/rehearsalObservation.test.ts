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
    if (key === 'poll') return (read: () => unknown) => ({
      toBe: async (value: unknown) => expect(await read()).toBe(value),
      toMatchObject: async (value: object) => expect(await read()).toMatchObject(value),
    });
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

  it('reads trusted held-touch contacts only from the same true owner-frame sample', async () => {
    let ownerFrame = false;
    const contacts: Array<{ type: string; trusted: boolean; contacts: number; atMs: number }> = [];
    const events = new Proxy(contacts, { get(target, key, receiver) {
      if (key === 'filter' && !ownerFrame) throw new Error('touch contacts read outside true owner-frame sample');
      return Reflect.get(target, key, receiver);
    } });
    const seam = {
      waitForInputFrame: async () => { ownerFrame = true; return true; },
      runPreparationDiagnostics: () => ({ active: true, state: 'loading' }),
      isSceneActive: (key: string) => key === 'MenuScene',
      isMenuInputNeutral: () => true,
    };
    const run = observer('touch', {
      performance: { now: () => 123 }, __REHEARSAL_EVENTS__: events,
      __MEOWCENARY_VISUAL_TEST__: seam,
      console: { info: vi.fn() },
    });
    const sent: string[] = [];
    const session = { send: vi.fn(async (_method: string, { type }: { type: string }) => {
      sent.push(type);
      ownerFrame = false;
      if (type === 'touchStart') contacts.push({ type: 'touchstart', trusted: true, contacts: 1, atMs: 123 });
      if (type === 'touchEnd') contacts.push({ type: 'touchend', trusted: true, contacts: 0, atMs: 124 });
    }), detach: vi.fn(async () => {}) };
    const page = {
      viewportSize: () => ({ width: 200, height: 200 }),
      context: () => ({ newCDPSession: async () => session }),
      evaluate: vi.fn(async (read: (arg?: unknown) => unknown, arg?: unknown) => {
        ownerFrame = false;
        return read(arg);
      }),
    };
    await run(page, { x: 10, y: 10, width: 60, height: 60 }, { kind: 'load' });
    expect(sent).toEqual(['touchStart', 'touchEnd', 'touchCancel']);
    expect(contacts.filter(event => event.type.startsWith('touch'))).toHaveLength(2);
    expect(page.evaluate).toHaveBeenCalled();
  });

  it.each([false, null, 'stale-frame'])('does not read touch command/contact facts after %s owner frame', async completed => {
    let factsRead = 0;
    const events = new Proxy([], { get(target, key, receiver) {
      if (key === 'filter') { factsRead++; throw new Error('touch facts read before an accepted owner frame'); }
      return Reflect.get(target, key, receiver);
    } });
    const seam = {
      waitForInputFrame: async () => completed,
      runPreparationDiagnostics: () => { factsRead++; return { active: true, state: 'loading' }; },
      isSceneActive: () => { factsRead++; return false; },
      isMenuInputNeutral: () => true,
    };
    const run = observer('observeReceipt', { __REHEARSAL_EVENTS__: events, __MEOWCENARY_VISUAL_TEST__: seam });
    await expect(run({ evaluate: async (read: (arg: unknown) => unknown, arg: unknown) => read(arg) },
      { kind: 'load' }, undefined, 123)).rejects.toThrow();
    expect(factsRead).toBe(0);
  });

  it.each(['missing', 'untrusted'])('does not retry a %s touch-end after command admission', async fault => {
    const events: Array<{ type: string; trusted: boolean; contacts: number; atMs: number }> = [];
    let ended = false, pollingReads = 0;
    const pollingExpect = new Proxy(expect, { get(target, key) {
      if (key === 'poll') return (read: () => Promise<unknown>) => ({
        toBe: async (value: unknown) => { pollingReads++; expect(await read()).toBe(value); },
        // A combined receipt/contact poll could conceal this first invalid
        // physical record by observing a later repaired record instead.
        toMatchObject: async (value: object) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            pollingReads++;
            try { expect(await read()).toMatchObject(value); return; }
            catch (error) { if (attempt === 1) throw error; }
            events.splice(1, events.length, { type: 'touchend', trusted: true, contacts: 0, atMs: 124 });
          }
        },
      });
      return Reflect.get(target, key);
    } });
    const seam = { waitForInputFrame: async () => true,
      runPreparationDiagnostics: () => ({ active: ended, state: ended ? 'loading' : 'idle' }),
      isSceneActive: (key: string) => key === 'MenuScene', isMenuInputNeutral: () => true };
    const run = observer('touch', { expect: pollingExpect, performance: { now: () => 123 },
      __REHEARSAL_EVENTS__: events, __MEOWCENARY_VISUAL_TEST__: seam, console: { info: vi.fn() } });
    const session = { send: async (_method: string, { type }: { type: string }) => {
      if (type === 'touchStart') events.push({ type: 'touchstart', trusted: true, contacts: 1, atMs: 123 });
      if (type === 'touchEnd') {
        ended = true;
        if (fault === 'untrusted') events.push({ type: 'touchend', trusted: false, contacts: 0, atMs: 124 });
      }
    }, detach: async () => {} };
    const page = { viewportSize: () => ({ width: 200, height: 200 }),
      context: () => ({ newCDPSession: async () => session }),
      evaluate: async (read: (arg?: unknown) => unknown, arg?: unknown) => read(arg) };
    await expect(run(page, { x: 10, y: 10, width: 60, height: 60 }, { kind: 'load' })).rejects.toThrow();
    expect(pollingReads).toBe(1);
  });

  it('snapshots summary seed, actions and Main Menu point in one fresh touch pre-action read', async () => {
    let generation = 0;
    const seam = {
      runStartIntroDiagnostics: () => ({ generation: ++generation, identity: { seed: 42 } }),
      summaryActionDiagnostics: () => ({ generation, actions: [{ label: 'Main Menu', enabled: true }] }),
      summaryMenuTarget: () => ({ generation, x: 10, y: 20 }),
    };
    const run = observer('touchSummarySnapshot', { __MEOWCENARY_VISUAL_TEST__: seam });
    const evaluate = vi.fn(async (read: () => unknown) => structuredClone(await read()));
    const sample = await run({ evaluate });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(sample).toMatchObject({ intro: { generation: 1, identity: { seed: 42 } }, summary: { generation: 1 }, menuTarget: { generation: 1 } });
  });

  it('keeps two separate warm-idle owner-frame receipts with preparation and Game state sampled together', async () => {
    let frameId = 0, ownerId = 0;
    const preparation = vi.fn(() => { expect(ownerId).toBeGreaterThan(0); return { active: true, state: 'idle', frameId: ownerId }; });
    const active = vi.fn(() => { expect(ownerId).toBeGreaterThan(0); return false; });
    const seam = { waitForInputFrame: async () => { ownerId = ++frameId; return true; },
      runPreparationDiagnostics: preparation, isSceneActive: active };
    const run = observer('warmIdleObservation', { __MEOWCENARY_VISUAL_TEST__: seam, console: { info: vi.fn() } });
    const evaluate = vi.fn(async (read: () => unknown) => { ownerId = 0; return read(); });
    const first = await run({ evaluate }) as { preparation: { frameId: number }; completed: boolean; gameActive: boolean };
    const firstFrame = first.preparation.frameId;
    const second = await run({ evaluate }) as { preparation: { frameId: number } };
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(preparation).toHaveBeenCalledTimes(2); expect(active).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({ completed: true, preparation: { active: true, state: 'idle' }, gameActive: false });
    expect(second.preparation.frameId).toBeGreaterThan(firstFrame);
  });

  it.each([false, null, 'stale-frame'])('warm-idle %s frame cannot read preparation or Game activity', async completed => {
    const preparation = vi.fn(), active = vi.fn();
    const run = observer('warmIdleObservation', { __MEOWCENARY_VISUAL_TEST__: {
      waitForInputFrame: async () => completed, runPreparationDiagnostics: preparation, isSceneActive: active,
    } });
    await expect(run({ evaluate: async (read: () => unknown) => read() })).rejects.toThrow();
    expect(preparation).not.toHaveBeenCalled(); expect(active).not.toHaveBeenCalled();
  });

  it('emits a bounded synchronous receipt after each completed owner sample', async () => {
    const log = vi.fn(), page = {}, facts = { completed: true, accepted: true }, receipts = new WeakMap();
    const run = observer('retainObservation', { console: { info: log }, observedReceipts: receipts });
    for (let index = 0; index < 20; index++) await run(page, 'receipt', { ...facts, index });
    expect(log).toHaveBeenCalledTimes(20);
    expect(log.mock.calls.at(-1)?.[0]).toContain('"index":19');
    expect(receipts.get(page)).toHaveLength(12);
    expect(receipts.get(page).at(-1).facts.index).toBe(19);
  });
});
