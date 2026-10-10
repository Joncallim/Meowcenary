import { describe, expect, it } from 'vitest';
import { waitForPerformanceRunStart } from '../scripts/performance-run-start.mjs';

// Execute the actual page callbacks against a simulated browser boundary.
// Intro never becomes active without a distinct accepted real input gesture.
function pageHarness(initial = 'intro', input = 'keyboard') {
  let status = initial;
  let neutral = false;
  let held = false;
  const actions = [];
  let presented = { status, atMs: 100, seed: 1 };
  const frame = () => {
    if (!held) neutral = true;
    if (status === 'active') presented = { status, atMs: 200, seed: 1 };
    actions.push('frame');
    return true;
  };
  const facade = {
    __MEOWCENARY_PERFORMANCE__: { snapshot: () => ({ presentedRun: presented }) },
    __MEOWCENARY_VISUAL_TEST__: {
      waitForInputFrame: frame,
      runStartBriefDiagnostics: () => ({ visible: status === 'intro', status, timeMs: 0,
        buttons: [{ x: 10, y: 20, width: 100, height: 40 }, {}] }),
    },
  };
  const evaluate = async (callback) => {
    const old = Object.fromEntries(Object.keys(facade).map(key => [key, globalThis[key]]));
    Object.assign(globalThis, facade);
    try { return await callback(); } finally {
      for (const key of Object.keys(facade)) {
        if (old[key] === undefined) delete globalThis[key]; else globalThis[key] = old[key];
      }
    }
  };
  const down = async () => { actions.push('down'); held = true; if (neutral && input === 'keyboard') status = 'active'; };
  const up = async () => { actions.push('up'); held = false; if (neutral && input !== 'keyboard') status = 'active'; };
  const page = {
    evaluate,
    waitForFunction: async (callback) => {
      if (!await evaluate(callback)) throw new Error('launch stalled: no Start input');
    },
    keyboard: { down, up },
    mouse: { move: async (x, y) => actions.push(['move', x, y]), down, up },
    touchscreen: { tap: async (x, y) => { actions.push(['tap', x, y]); if (neutral) status = 'active'; held = false; } },
  };
  return { page, actions };
}

describe('performance launch compatibility', () => {
  it('preserves historical active launch without a new input or timing endpoint', async () => {
    const { page, actions } = pageHarness('active');
    const result = await waitForPerformanceRunStart(page);
    expect(result.preparedRun).toEqual({ status: 'active', atMs: 100, seed: 1 });
    expect(actions).toEqual([]);
    expect(result.startCommandAtMs).toBeUndefined();
  });
  for (const input of ['keyboard', 'mouse', 'touch']) {
    it(`starts intro with neutral ${input} input and retains its preparation timestamp`, async () => {
      const { page, actions } = pageHarness('intro', input);
      const result = await waitForPerformanceRunStart(page, input);
      expect(result.preparedRun).toEqual({ status: 'intro', atMs: 100, seed: 1 });
      expect(result.startCommandAtMs).toEqual(expect.any(Number));
      expect(actions[0]).toBe('frame');
      expect(actions.at(-1)).toBe('frame');
      if (input === 'keyboard') expect(actions).toContain('up');
      if (input === 'mouse') expect(actions).toContainEqual(['move', 60, 40]);
      if (input === 'touch') expect(actions).toContainEqual(['tap', 60, 40]);
      expect(await page.evaluate(() => globalThis.__MEOWCENARY_PERFORMANCE__.snapshot().presentedRun.status)).toBe('active');
    });
  }
});
