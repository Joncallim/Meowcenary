import { describe, expect, it } from 'vitest';
import { createFixtureSequence, createGameSoakHarness, PERF_LATE_WINDOW_POLLS, PERF_PROXY_DT_MS, PERF_PROXY_POLLS, EPIC19_SOAK_SEEDS } from './helpers/epic19SoakHarness';

describe('Epic 19 Slice 5 late-wave performance proxy', () => {
  it('runs an 18,000-poll five-minute-equivalent deterministic input schedule with bounded state and exact effects', () => {
    const h = createGameSoakHarness({ fixtureSeed: EPIC19_SOAK_SEEDS.performanceProxy, runSeed: 1907, storageKey: 'e19-performance' });
    const s = createFixtureSequence(EPIC19_SOAK_SEEDS.performanceProxy); let elapsed = 0; let late = 0;
    for (let poll = 0; poll < PERF_PROXY_POLLS; poll += 1) {
      if (s.nextInt(11) === 0) h.padDown(13); else h.padUp(13);
      if (poll >= PERF_PROXY_POLLS - PERF_LATE_WINDOW_POLLS) late += PERF_PROXY_DT_MS;
      h.poll(PERF_PROXY_DT_MS); elapsed += PERF_PROXY_DT_MS;
    }
    h.padUp(13); h.poll();
    expect(elapsed).toBeCloseTo(300_000, 7); expect(late).toBeCloseTo(30_000, 7);
    expect(h.runState.status).toBe('active'); expect(h.inputController.getMoveVector()).toEqual({ x: 0, y: 0 }); h.destroy();
  });
});
