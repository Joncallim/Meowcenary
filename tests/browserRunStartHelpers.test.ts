import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';
import { activateIntroCommand, completeRunStartIntro } from '../browser-tests/run-start-helpers';
// The performance tooling deliberately remains JavaScript, outside the runtime build.
// @ts-expect-error no declaration file for the existing standalone performance script
import { waitForPerformanceRunStart } from '../scripts/performance-run-start.mjs';

// Exercise the real exported browser helper with bounded unit polling. This is
// an assertion adapter, not a replacement implementation of its input logic.
vi.mock('@playwright/test', async () => {
  const { expect: assertion } = await import('vitest');
  return { expect: new Proxy(assertion, { get(target, key) {
    if (key === 'poll') return (read: () => unknown) => ({ toBe: async (value: unknown) => assertion(await read()).toBe(value) });
    return Reflect.get(target, key);
  } }) };
});

const NO_CONTACT = 'cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.';
const WRAPPED_NO_CONTACT = NO_CONTACT.replace('cdpSession.send:', 'cdpSession.apply:');
const NO_CONTACT_VARIANTS = [NO_CONTACT, WRAPPED_NO_CONTACT];
type Options = { frameResult?: boolean; frameFailure?: Error; rejectAdjacentSnapshotReads?: boolean; noContactMessage?: string; dialogue?: boolean; heldPad?: boolean; cancelFailure?: unknown; createFailure?: unknown; detachFailure?: unknown;
  interrupt?: 'touchStart' | 'touchEnd' | 'frame'; operationFailure?: unknown; ownedCancelFailure?: unknown };

function harness(options: Options = {}) {
  let phase = 'brief', status = 'intro', revision = 0, quarantined = true, focus = 'return-menu';
  let runStart = { count: 0, timeMs: 0, atMs: 0 }, activeMouse: string | undefined, point = { x: -1, y: -1 };
  const keys = new Set<string>(), contacts = new Map<number, string | undefined>();
  const events: Array<{ event: string; session?: number; command?: string }> = [];
  const sessions: Array<{ send(method: string, args: { type: string; touchPoints: Array<{ x: number; y: number }> }): Promise<void>; detach(): Promise<void> }> = [];
  const commands = () => (phase === 'brief' && options.dialogue ? ['return-menu', 'skip-dialogue', 'continue'] : ['return-menu', 'start'])
    .map((command, index) => ({ command, label: command, enabled: true, bounds: { x: 10 + index * 110, y: 20, width: 100, height: 44 } }));
  const neutral = () => !keys.size && !contacts.size && activeMouse === undefined && !options.heldPad;
  const read = () => ({ visible: status === 'intro', phase, status, revision, timeMs: 0, inputNeutral: neutral(), inputQuarantined: quarantined,
    ready: !quarantined, commands: commands(), focusedCommand: focus, runStart, terminalEvents: 0, identity: { seed: 12 }, objective: { kind: 'stage' } });
  const activate = (command: string | undefined) => {
    if (!command || quarantined || status !== 'intro') return;
    events.push({ event: 'command', command }); quarantined = true; revision++;
    if (command === 'continue') { phase = 'boss'; focus = 'return-menu'; }
    else if (command === 'return-menu') { phase = 'cancelled'; status = 'menu'; }
    else { phase = 'consumed'; status = 'active'; runStart = { count: 1, timeMs: 0, atMs: performance.now() }; }
  };
  const hit = (x: number, y: number) => commands().find(row => x >= row.bounds.x && x <= row.bounds.x + row.bounds.width && y >= 20 && y <= 64)?.command;
  let snapshotReadInFrame = false;
  const frame = () => {
    snapshotReadInFrame = false;
    events.push({ event: 'frame' });
    if (options.frameFailure) throw options.frameFailure;
    if (options.frameResult === false) return false;
    if (contacts.size && options.interrupt === 'frame') { options.interrupt = undefined; throw options.operationFailure; }
    if (neutral()) quarantined = false;
    return true;
  };
  const globals = {
    __MEOWCENARY_VISUAL_TEST__: { runStartIntroDiagnostics: () => {
      if (options.rejectAdjacentSnapshotReads && snapshotReadInFrame) throw new Error('duplicate unchanged-owner-frame snapshot transport');
      snapshotReadInFrame = true; return read();
    }, waitForInputFrame: frame, isSceneActive: () => status === 'menu' },
    __MEOWCENARY_PERFORMANCE__: { snapshot: () => ({ presentedRun: { status, atMs: 100, seed: 12 } }) },
  };
  const evaluate = async (callback: (arg?: unknown) => unknown, arg?: unknown) => {
    const target = globalThis as unknown as Record<string, unknown>;
    const old = Object.fromEntries(Object.keys(globals).map(key => [key, target[key]])); Object.assign(target, globals);
    try { return await callback(arg); } finally {
      for (const key of Object.keys(globals)) { if (old[key] === undefined) delete target[key]; else target[key] = old[key]; }
    }
  };
  const newSession = async () => {
    if ('createFailure' in options) throw options.createFailure;
    const id = sessions.length;
    const session = {
      send: async (_method: string, { type, touchPoints }: { type: string; touchPoints: Array<{ x: number; y: number }> }) => {
        events.push({ event: type, session: id });
        if (type === 'touchCancel' && 'cancelFailure' in options) throw options.cancelFailure;
        if (type === 'touchCancel' && contacts.has(id) && 'ownedCancelFailure' in options) throw options.ownedCancelFailure;
        if (type === options.interrupt && type !== 'frame') { options.interrupt = undefined; throw options.operationFailure; }
        if (type === 'touchStart') contacts.set(id, neutral() && !quarantined ? hit(touchPoints[0].x, touchPoints[0].y) : undefined);
        else {
          if (!contacts.has(id)) throw new Error(options.noContactMessage ?? NO_CONTACT);
          const command = contacts.get(id); contacts.delete(id);
          if (type === 'touchEnd') activate(command);
          else events.push({ event: 'actualCancel', session: id });
        }
      },
      detach: async () => { events.push({ event: 'detach', session: id }); if ('detachFailure' in options) throw options.detachFailure; },
    };
    sessions.push(session); return session;
  };
  const page = {
    evaluate, viewportSize: () => ({ width: 400, height: 640 }), context: () => ({ newCDPSession: newSession }),
    waitForFunction: async (callback: () => unknown) => { if (!await evaluate(callback)) throw new Error('not physically admitted'); },
    keyboard: {
      up: async (key: string) => { keys.delete(key); },
      down: async (key: string) => {
        if (neutral() && !quarantined) {
          if (key === 'ArrowRight') { const rows = commands(); focus = rows[(rows.findIndex(row => row.command === focus) + 1) % rows.length].command; }
          if (key === 'Enter') activate(focus);
        }
        keys.add(key);
      },
    },
    mouse: {
      move: async (x: number, y: number) => { point = { x, y }; },
      down: async () => { if (neutral() && !quarantined) activeMouse = hit(point.x, point.y); },
      up: async () => { const target = activeMouse; activeMouse = undefined; if (target === hit(point.x, point.y)) activate(target); },
    },
  };
  return { page: page as unknown as Page, events, read, frame, newSession, contacts, options };
}

for (const helper of ['browser', 'performance'] as const) describe(`${helper} exported helper touch ownership`, () => {
  const complete = (page: Page, input: 'keyboard' | 'mouse' | 'touch' = 'keyboard') => helper === 'browser' ? completeRunStartIntro(page, input) : waitForPerformanceRunStart(page, input);
  for (const input of ['keyboard', 'mouse', 'touch'] as const) for (const dialogue of [false, true])
    it(`uses the accepted immutable snapshot without duplicate unchanged-frame transport: ${input}, dialogue=${dialogue}`, async () => {
      const h = harness({ dialogue, rejectAdjacentSnapshotReads: true });
      await complete(h.page, input);
      expect(h.events.filter(event => event.event === 'command').map(event => event.command))
        .toEqual(dialogue ? ['continue', 'start'] : ['start']);
      expect(h.read().runStart).toMatchObject({ count: 1, timeMs: 0 });
      expect(h.contacts.size).toBe(0);
      expect(h.events.filter(event => event.event === 'detach')).toHaveLength((dialogue ? 2 : 1) * (input === 'touch' ? 2 : 1));
      for (const { session } of h.events.filter(event => event.event === 'detach'))
        expect(h.events.filter(event => event.event === 'detach' && event.session === session)).toHaveLength(1);
    });
  for (const failure of ['false', 'rejected'] as const)
    it(`a ${failure} neutral frame stops observation and admission after cleanup`, async () => {
      const reason = new Error('input owner shutdown');
      const h = harness(failure === 'false' ? { frameResult: false } : { frameFailure: reason });
      const error = await complete(h.page, 'touch').catch((value: unknown) => value);
      if (failure === 'rejected') expect(error).toBe(reason);
      else expect(error).toBeInstanceOf(Error);
      expect(h.events.filter(event => event.event === 'frame')).toHaveLength(1);
      expect(h.events.filter(event => event.event === 'command')).toEqual([]);
      expect(h.events.filter(event => event.event === 'detach')).toHaveLength(1);
      expect(h.contacts.size).toBe(0);
      expect(h.read().runStart.count).toBe(0);
    });
  it('releases independent keys together but admits no frame or command until every physical release settles', async () => {
    const h = harness(), originalUp = h.page.keyboard.up.bind(h.page.keyboard);
    const pending: Array<() => void> = []; let releaseOpen = false;
    h.page.keyboard.up = async key => {
      if (!releaseOpen) await new Promise<void>(resolve => pending.push(resolve));
      await originalUp(key);
    };
    const completion = complete(h.page);
    try {
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      expect(pending).toHaveLength(14);
      for (const resolve of pending.slice(0, -1)) resolve();
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      expect(h.events).toEqual([]);
      expect(h.read().runStart.count).toBe(0);
    } finally {
      releaseOpen = true; pending.forEach(resolve => resolve()); await completion;
    }
    expect(h.read().runStart.count).toBe(1);
  });
  for (const multiple of [false, true]) it(`joins failed key releases without admitting input or losing errors, multiple=${multiple}`, async () => {
    const h = harness(), originalUp = h.page.keyboard.up.bind(h.page.keyboard);
    const first = new Error('Enter release failed'), second = new Error('q release failed');
    const attempted: string[] = [];
    h.page.keyboard.up = async key => {
      attempted.push(key);
      if (key === 'Enter') throw first;
      if (multiple && key === 'q') throw second;
      await originalUp(key);
    };
    const error = await complete(h.page).catch((value: unknown) => value);
    expect(attempted).toHaveLength(14);
    if (multiple) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([first, second]);
    } else expect(error).toBe(first);
    expect(h.events).toEqual([]);
    expect(h.read().runStart.count).toBe(0);
  });
  for (const noContactMessage of NO_CONTACT_VARIANTS) for (const input of ['keyboard', 'mouse', 'touch'] as const) for (const dialogue of [false, true]) it(`admits ${input}, dialogue=${dialogue}, despite session-local ${noContactMessage.split(':')[0]} no-contact`, async () => {
    const h = harness({ dialogue, noContactMessage }); await complete(h.page, input);
    expect(h.events.filter(e => e.event === 'command').map(e => e.command)).toEqual(dialogue ? ['continue', 'start'] : ['start']);
    expect(h.read().runStart).toMatchObject({ count: 1, timeMs: 0 });
    const detached = h.events.filter(e => e.event === 'detach'); expect(detached.length).toBe((dialogue ? 2 : 1) * (input === 'touch' ? 2 : 1));
    for (const { session } of detached) expect(h.events.filter(e => e.event === 'detach' && e.session === session)).toHaveLength(1);
  });
  const failures = [new Error('unrelated transport failure'), ...NO_CONTACT_VARIANTS.flatMap(message => [
    new Error(message + ' extra'), new Error(message + '\n'),
    new Error(message.replace('Input.dispatchTouchEvent', 'Other.method')),
    new Error(message.replace('TouchStart first', 'TouchEnd first')),
    new Error(message.replace(message.split(':')[0], 'cdpSession.detach')),
    new Error('unexpected prefix ' + message), message, { message },
  ])];
  for (const [index, failure] of failures.entries()) it(`propagates unrelated cancellation failure ${index} unchanged before admission`, async () => {
    const h = harness({ cancelFailure: failure }); await expect(complete(h.page)).rejects.toBe(failure);
    expect(h.events.map(e => e.event)).toEqual(['touchCancel', 'detach']);
  });
  for (const noContactMessage of NO_CONTACT_VARIANTS) for (const mode of ['createFailure', 'detachFailure'] as const) it(`propagates ${mode} even with the exact ${noContactMessage.split(':')[0]} benign message`, async () => {
    const error = new Error(noContactMessage), h = harness({ [mode]: error, noContactMessage }); await expect(complete(h.page)).rejects.toBe(error);
    expect(h.events.map(e => e.event)).toEqual(mode === 'createFailure' ? [] : ['touchCancel', 'detach']);
  });
  for (const noContactMessage of NO_CONTACT_VARIANTS) for (const interrupt of ['touchStart', 'touchEnd', 'frame'] as const) it(`keeps ${interrupt} ${noContactMessage.split(':')[0]} errors visible and cancels on the owning session before detach`, async () => {
    const failure = new Error(noContactMessage), h = harness({ interrupt, operationFailure: failure, noContactMessage });
    await expect(complete(h.page, 'touch')).rejects.toBe(failure);
    expect(h.read()).toMatchObject({ status: 'intro', phase: 'brief', revision: 0, runStart: { count: 0 }, terminalEvents: 0 });
    expect(h.contacts.size).toBe(0);
    const ownerEvents = h.events.filter(e => e.session === 1).map(e => e.event);
    expect(ownerEvents).toEqual(interrupt === 'touchStart' ? ['touchStart', 'touchCancel', 'detach'] : interrupt === 'frame' ? ['touchStart', 'touchCancel', 'actualCancel', 'detach'] : ['touchStart', 'touchEnd', 'touchCancel', 'actualCancel', 'detach']);
    await complete(h.page, 'touch'); expect(h.read().runStart.count).toBe(1);
  });
  it('retains both an operation failure and failed cancellation, and still detaches', async () => {
    const operation = new Error('frame failed'), cleanup = new Error('cancel failed');
    const h = harness({ interrupt: 'frame', operationFailure: operation, ownedCancelFailure: cleanup });
    const error = await complete(h.page, 'touch').catch((value: unknown) => value);
    expect(error).toBeInstanceOf(AggregateError); expect((error as AggregateError).errors).toEqual([operation, cleanup]);
    expect(h.events.at(-1)).toEqual({ event: 'detach', session: 1 }); expect(h.read().runStart.count).toBe(0);
  });
  it('retains cancellation and detach failures without reporting success', async () => {
    const send = new Error('cancel failed'), detach = new Error('detach failed'), h = harness({ cancelFailure: send, detachFailure: detach });
    const error = await complete(h.page).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(AggregateError); expect((error as AggregateError).errors).toEqual([send, detach]);
    expect(h.events.map(e => e.event)).toEqual(['touchCancel', 'detach']);
  });
  for (const noContactMessage of NO_CONTACT_VARIANTS) it(`a separate session contact blocks admission until its original owner cancels and a frame completes (${noContactMessage.split(':')[0]})`, async () => {
    const h = harness({ noContactMessage }); h.frame(); const owner = await h.newSession();
    await owner.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 50, y: 40 }] });
    await expect(complete(h.page)).rejects.toThrow(); expect(h.read().inputNeutral).toBe(false); expect(h.contacts.size).toBe(1);
    expect(h.events.filter(e => e.event === 'command')).toEqual([]);
    await owner.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await owner.detach(); h.frame();
    expect(h.read()).toMatchObject({ status: 'intro', phase: 'brief', revision: 0, inputNeutral: true });
    await complete(h.page); expect(h.events.filter(e => e.event === 'command').map(e => e.command)).toEqual(['start']);
  });
  for (const noContactMessage of NO_CONTACT_VARIANTS) it(`a held physical pad survives the benign cancellation response and blocks all commands (${noContactMessage.split(':')[0]})`, async () => {
    const h = harness({ heldPad: true, noContactMessage }); await expect(complete(h.page)).rejects.toThrow();
    expect(h.events.filter(e => e.event === 'command')).toEqual([]); expect(h.read().inputNeutral).toBe(false);
    h.options.heldPad = false; h.frame(); await complete(h.page); expect(h.read().runStart.count).toBe(1);
  });
});

it('the actual browser command helper cancels a successful owned Return gesture without a second command', async () => {
  const h = harness(); await activateIntroCommand(h.page, 'return-menu', 'touch');
  expect(h.events.filter(e => e.event === 'command').map(e => e.command)).toEqual(['return-menu']);
  expect(h.events.filter(e => e.session === 1).map(e => e.event)).toEqual(['touchStart', 'touchEnd', 'touchCancel', 'detach']);
});
