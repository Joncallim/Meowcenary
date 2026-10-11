import { describe, expect, it } from 'vitest';
import { waitForPerformanceRunStart } from '../scripts/performance-run-start.mjs';

// Actual page callbacks run against one simulated browser/input boundary.
// Only a fresh admitted gesture can execute a semantic controller command.
function pageHarness({ initial = 'intro', input = 'keyboard', dialogue = false, invalid, physicallyHeld = false } = {}) {
  let status = initial, phase = 'brief', revision = 0, neutral = false, quarantined = true, held = false, pointerTarget;
  let runStart = { count: 0 }; const actions = []; let focus = 'return-menu';
  let presented = { status, atMs: 100, seed: 1 };
  const commands = () => (phase === 'brief' && dialogue ? ['return-menu', 'skip-dialogue', 'continue'] : ['return-menu', 'start']).map((command, index) => ({
    command, label: command, enabled: invalid !== 'disabled', bounds: { x: 10 + index * 110, y: invalid === 'offscreen' ? 900 : 20, width: 100, height: 44 },
  }));
  const activate = command => {
    if (!neutral || quarantined || status !== 'intro') return;
    actions.push(['command', command]); quarantined = true; neutral = false;
    if (command === 'continue') { phase = 'boss'; revision++; focus = 'return-menu'; }
    else if (command === 'start') { status = 'active'; phase = 'consumed'; revision++; runStart = { count: 1, timeMs: 0, atMs: performance.now() }; }
  };
  const frame = () => {
    if (!held && !physicallyHeld) { neutral = true; quarantined = false; }
    if (status === 'active') presented = { status, atMs: 200, seed: 1 };
    actions.push('frame'); return true;
  };
  const facade = {
    __MEOWCENARY_PERFORMANCE__: { snapshot: () => ({ presentedRun: presented }) },
    __MEOWCENARY_VISUAL_TEST__: {
      waitForInputFrame: frame,
      runStartIntroDiagnostics: () => {
        let rows = commands();
        if (invalid === 'missing') rows = rows.filter(row => row.command !== 'start');
        if (invalid === 'duplicate') rows.push(rows.find(row => row.command === 'start'));
        return { visible: status === 'intro', status, phase, revision, timeMs: 0, focusedCommand: focus,
          identity: { seed: 1 }, objective: { kind: 'stage' }, commands: rows,
          inputNeutral: neutral, inputQuarantined: quarantined, ready: neutral && !quarantined, runStart, terminalEvents: 0 };
      },
    },
  };
  const evaluate = async (callback, arg) => {
    const old = Object.fromEntries(Object.keys(facade).map(key => [key, globalThis[key]])); Object.assign(globalThis, facade);
    try { return await callback(arg); } finally {
      for (const key of Object.keys(facade)) { if (old[key] === undefined) delete globalThis[key]; else globalThis[key] = old[key]; }
    }
  };
  const hit = (x, y) => commands().find(row => x >= row.bounds.x && x <= row.bounds.x + row.bounds.width && y >= row.bounds.y && y <= row.bounds.y + row.bounds.height)?.command;
  let point = { x: -1, y: -1 };
  const page = {
    evaluate, viewportSize: () => ({ width: 400, height: 640 }),
    waitForFunction: async callback => { if (!await evaluate(callback)) throw new Error('launch stalled: no admitted input'); },
    keyboard: {
      down: async key => {
        actions.push(['keyDown', key]);
        if (neutral && !quarantined && key === 'ArrowRight') { const rows = commands(); focus = rows[(rows.findIndex(row => row.command === focus) + 1) % rows.length].command; }
        if (input === 'keyboard' && key === 'Enter') activate(focus); held = true;
      },
      up: async key => { actions.push(['keyUp', key]); held = false; },
    },
    mouse: {
      move: async (x, y) => { point = { x, y }; actions.push(['move', x, y]); },
      down: async () => { pointerTarget = neutral && !quarantined ? hit(point.x, point.y) : undefined; held = true; },
      up: async () => { held = false; if (input === 'mouse' && pointerTarget && pointerTarget === hit(point.x, point.y)) activate(pointerTarget); pointerTarget = undefined; },
    },
    context: () => ({ newCDPSession: async () => {
      let contact = false;
      return {
        send: async (_method, { type, touchPoints }) => {
          actions.push(type);
          if (type === 'touchStart') { contact = true; const p = touchPoints[0]; pointerTarget = neutral && !quarantined ? hit(p.x, p.y) : undefined; held = true; }
          else {
            if (!contact) throw new Error('cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.');
            contact = false; held = false;
            if (type === 'touchEnd' && input === 'touch') activate(pointerTarget);
            pointerTarget = undefined;
          }
        }, detach: async () => { actions.push('detach'); },
      };
    } }),
  };
  return { page, actions };
}

describe('semantic performance launch compatibility', () => {
  it('preserves historical active launch without a new input or timing endpoint', async () => {
    const { page, actions } = pageHarness({ initial: 'active' });
    const result = await waitForPerformanceRunStart(page);
    expect(result).toEqual({ preparedRun: { status: 'active', atMs: 100, seed: 1 }, compatibility: 'already-active' });
    expect(actions).toEqual([]); expect(result.startCommandAtMs).toBeUndefined();
  });
  for (const input of ['keyboard', 'mouse', 'touch']) for (const dialogue of [false, true]) {
    it(`uses neutral semantic ${input} commands with dialogue=${dialogue}, preserving preparation separately`, async () => {
      const { page, actions } = pageHarness({ input, dialogue });
      const result = await waitForPerformanceRunStart(page, input);
      expect(result.preparedRun).toEqual({ status: 'intro', atMs: 100, seed: 1 });
      expect(result.compatibility).toBe('explicit-intro'); expect(result.startCommandAtMs).toEqual(expect.any(Number));
      expect(result.startedAtMs).toBeGreaterThanOrEqual(result.startCommandAtMs);
      expect(result.dialogueCommands).toHaveLength(dialogue ? 1 : 0);
      expect(actions.filter(row => Array.isArray(row) && row[0] === 'command')).toEqual(dialogue ? [['command', 'continue'], ['command', 'start']] : [['command', 'start']]);
      if (dialogue) expect(result.dialogueCommands[0].completedAtMs).toBeLessThanOrEqual(result.startCommandAtMs);
      expect(actions.at(-1)).toBe('frame');
      expect(await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun.status)).toBe('active');
    });
  }
  for (const invalid of ['missing', 'duplicate', 'disabled', 'offscreen']) it(`rejects ${invalid} semantic Start targets`, async () => {
    await expect(waitForPerformanceRunStart(pageHarness({ input: 'mouse', invalid }).page, 'mouse')).rejects.toThrow();
  });
  it('does not treat a logically neutral wrapper as physical admission', async () => {
    const { page, actions } = pageHarness({ physicallyHeld: true });
    await expect(waitForPerformanceRunStart(page)).rejects.toThrow('no admitted input');
    expect(actions.filter(row => Array.isArray(row) && row[0] === 'command')).toEqual([]);
  });
});
