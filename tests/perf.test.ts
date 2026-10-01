import { describe, expect, it, vi } from 'vitest';
import { createPerfSampler, GAMEPLAY_PERF_OWNERS } from '../src/gameplay/perf';

describe('createPerfSampler', () => {
  it('returns an empty snapshot before any samples', () => {
    const sampler = createPerfSampler();
    const snapshot = sampler.snapshot();

    expect(snapshot.sampleCount).toBe(0);
    expect(snapshot.averageFrameMs).toBe(0);
    expect(snapshot.averageFps).toBe(0);
    expect(snapshot.overBudgetFrames).toBe(0);
    expect(snapshot.overBudgetRatio).toBe(0);
  });

  it('averages a single sample', () => {
    const sampler = createPerfSampler();
    sampler.recordFrame(16);

    const snapshot = sampler.snapshot();
    expect(snapshot.sampleCount).toBe(1);
    expect(snapshot.averageFrameMs).toBe(16);
    expect(snapshot.averageFps).toBeCloseTo(62.5, 1);
  });

  it('averages multiple samples', () => {
    const sampler = createPerfSampler();
    sampler.recordFrame(16);
    sampler.recordFrame(20);
    sampler.recordFrame(24);

    const snapshot = sampler.snapshot();
    expect(snapshot.sampleCount).toBe(3);
    expect(snapshot.averageFrameMs).toBe(20);
  });

  it('rolls over the fixed window and subtracts old samples', () => {
    const sampler = createPerfSampler(3, 60);
    sampler.recordFrame(10);
    sampler.recordFrame(20);
    sampler.recordFrame(30);
    sampler.recordFrame(40);

    const snapshot = sampler.snapshot();
    expect(snapshot.sampleCount).toBe(3);
    expect(snapshot.averageFrameMs).toBe(30);
  });

  it('counts a frame over budget only when dt is strictly greater than budget', () => {
    const sampler = createPerfSampler(60, 60);
    sampler.recordFrame(1000 / 60); // exactly budget
    sampler.recordFrame(1000 / 60 + 0.01);

    const snapshot = sampler.snapshot();
    expect(snapshot.overBudgetFrames).toBe(1);
  });

  it('ignores invalid dt values', () => {
    const sampler = createPerfSampler();
    sampler.recordFrame(Number.NaN);
    sampler.recordFrame(0);
    sampler.recordFrame(-5);
    sampler.recordFrame(Number.POSITIVE_INFINITY);

    expect(sampler.snapshot().sampleCount).toBe(0);
  });

  it('throws for invalid constructor arguments', () => {
    expect(() => createPerfSampler(0, 60)).toThrow();
    expect(() => createPerfSampler(3.5, 60)).toThrow();
    expect(() => createPerfSampler(-1, 60)).toThrow();
    expect(() => createPerfSampler(60, 0)).toThrow();
    expect(() => createPerfSampler(60, Number.NaN)).toThrow();
  });

  it('reports the over-budget ratio after rollover', () => {
    const sampler = createPerfSampler(4, 60);
    sampler.recordFrame(100);
    sampler.recordFrame(100);
    sampler.recordFrame(10);
    sampler.recordFrame(10);
    sampler.recordFrame(10);

    const snapshot = sampler.snapshot();
    expect(snapshot.overBudgetFrames).toBe(1);
    expect(snapshot.overBudgetRatio).toBe(0.25);
  });

  it('resets to empty and remains reusable', () => {
    const sampler = createPerfSampler();
    sampler.recordFrame(16);
    sampler.recordFrame(20);
    sampler.reset();

    expect(sampler.snapshot().sampleCount).toBe(0);

    sampler.recordFrame(32);
    expect(sampler.snapshot().averageFrameMs).toBe(32);
  });

  it('does not grow storage beyond the window size', () => {
    const windowSize = 10;
    const sampler = createPerfSampler(windowSize, 60);
    for (let i = 0; i < windowSize * 3; i += 1) {
      sampler.recordFrame(16 + (i % 5));
    }

    expect(sampler.snapshot().sampleCount).toBe(windowSize);
  });

  it('sanitizes impossible non-finite derived results to zero', () => {
    const sampler = createPerfSampler();
    sampler.recordFrame(Number.MAX_VALUE);

    const snapshot = sampler.snapshot();
    expect(Number.isFinite(snapshot.averageFrameMs)).toBe(true);
    expect(Number.isFinite(snapshot.averageFps)).toBe(true);
    expect(Number.isFinite(snapshot.overBudgetRatio)).toBe(true);
  });
});


describe('detailed performance windows', () => {
  it('reports nearest-rank percentiles, worst and exact frame budget counts', () => {
    const sampler = createPerfSampler(100, 100);
    for (let duration = 100; duration >= 1; duration -= 1) sampler.recordFrame(duration);
    expect(sampler.detailedSnapshot()).toEqual({
      frame: { sampleCount: 100, averageMs: 50.5, p50Ms: 50, p95Ms: 95, p99Ms: 99,
        worstMs: 100, budgetMs: 10, overBudgetSamples: 90, overBudgetRatio: 0.9 },
      owners: [],
    });
    expect(sampler.snapshot().averageFrameMs).toBe(50.5);
  });

  it('keeps named owners independent of frame samples and reports configured budgets', () => {
    const sampler = createPerfSampler(3, 100, [{ name: 'input', budgetMs: 2 }, { name: 'hud' }]);
    sampler.recordFrame(10);
    sampler.recordOwner('input', 0);
    sampler.recordOwner('input', 2);
    sampler.recordOwner('input', 4);
    sampler.recordOwner('hud', 12);
    expect(sampler.detailedSnapshot().owners).toEqual([
      { name: 'input', sampleCount: 3, averageMs: 2, p50Ms: 2, p95Ms: 4, p99Ms: 4,
        worstMs: 4, budgetMs: 2, overBudgetSamples: 1, overBudgetRatio: 1 / 3 },
      { name: 'hud', sampleCount: 1, averageMs: 12, p50Ms: 12, p95Ms: 12, p99Ms: 12,
        worstMs: 12, budgetMs: 10, overBudgetSamples: 1, overBudgetRatio: 1 },
    ]);
    expect(sampler.snapshot().sampleCount).toBe(1);
  });

  it('ignores unknown owners and invalid durations without evicting valid samples', () => {
    const sampler = createPerfSampler(2, 100, [{ name: 'audio' }]);
    sampler.recordOwner('audio', 3);
    for (const duration of [NaN, Infinity, -1]) sampler.recordOwner('audio', duration);
    sampler.recordOwner('unregistered', 99);
    expect(sampler.detailedSnapshot().owners).toEqual([
      { name: 'audio', sampleCount: 1, averageMs: 3, p50Ms: 3, p95Ms: 3, p99Ms: 3,
        worstMs: 3, budgetMs: 10, overBudgetSamples: 0, overBudgetRatio: 0 },
    ]);
  });

  it('evicts old worst/budget samples across repeated owner and frame rollovers', () => {
    const sampler = createPerfSampler(3, 100, [{ name: 'weapons', budgetMs: 2 }]);
    for (const duration of [90, 80, 70, 6, 5, 4, 3, 2, 1]) {
      sampler.recordFrame(duration);
      sampler.recordOwner('weapons', duration);
    }
    const detail = sampler.detailedSnapshot();
    expect(detail.frame).toMatchObject({ sampleCount: 3, averageMs: 2, p50Ms: 2,
      p95Ms: 3, p99Ms: 3, worstMs: 3, overBudgetSamples: 0 });
    expect(detail.owners[0]).toMatchObject({ sampleCount: 3, averageMs: 2,
      worstMs: 3, overBudgetSamples: 1, overBudgetRatio: 1 / 3 });
  });

  it('resets every registered window and reuses it without mutating previous snapshots', () => {
    const sampler = createPerfSampler(2, 100, [{ name: 'drops' }]);
    sampler.recordFrame(20);
    sampler.recordOwner('drops', 30);
    const previous = sampler.detailedSnapshot();
    sampler.reset();
    expect(sampler.detailedSnapshot().frame).toMatchObject({ sampleCount: 0, p50Ms: 0,
      p95Ms: 0, p99Ms: 0, worstMs: 0, overBudgetSamples: 0, overBudgetRatio: 0 });
    expect(sampler.detailedSnapshot().owners[0]).toMatchObject({ name: 'drops', sampleCount: 0,
      averageMs: 0, worstMs: 0, budgetMs: 10 });
    sampler.recordFrame(5);
    sampler.recordOwner('drops', 0);
    expect(sampler.detailedSnapshot().frame.worstMs).toBe(5);
    expect(sampler.detailedSnapshot().owners[0].sampleCount).toBe(1);
    expect(previous.frame.worstMs).toBe(20);
    expect(previous.owners[0].worstMs).toBe(30);
  });

  it('does not sort on either record path or the per-frame HUD snapshot', () => {
    const sort = vi.spyOn(Float64Array.prototype, 'sort');
    try {
      const sampler = createPerfSampler(3, 60, [{ name: 'player' }]);
      for (const duration of [3, 1, 2, 4]) {
        sampler.recordFrame(duration);
        sampler.recordOwner('player', duration);
        sampler.snapshot();
      }
      expect(sort).not.toHaveBeenCalled();
      expect(sampler.detailedSnapshot().frame.p50Ms).toBe(2);
      expect(sort).toHaveBeenCalledTimes(2);
      expect(sampler.snapshot().averageFrameMs).toBe(7 / 3);
    } finally { sort.mockRestore(); }
  });

  it('allocates owner windows only when explicitly registered and preserves their order', () => {
    expect(createPerfSampler().detailedSnapshot().owners).toEqual([]);
    expect(createPerfSampler(2, 60, GAMEPLAY_PERF_OWNERS).detailedSnapshot().owners.map(owner => owner.name))
      .toEqual(['input', 'stage', 'player', 'spawning', 'passives', 'hazards', 'weapons', 'drops', 'feedback', 'hud', 'audio']);
    const config = [{ name: 'boot', budgetMs: 5 }];
    const sampler = createPerfSampler(2, 60, config);
    config[0].name = 'changed';
    sampler.recordOwner('boot', 1);
    expect(sampler.detailedSnapshot().owners[0]).toMatchObject({ name: 'boot', sampleCount: 1 });
  });

  it('rejects ambiguous registration and invalid budgets at startup', () => {
    for (const owners of [[{ name: '' }], [{ name: ' ' }], [{ name: 'input' }, { name: 'input' }],
      [{ name: 'input', budgetMs: 0 }], [{ name: 'input', budgetMs: NaN }],
      [{ name: 'input', budgetMs: Infinity }], [{ name: 'input', budgetMs: -1 }]]) {
      expect(() => createPerfSampler(3, 60, owners)).toThrow();
    }
  });
});
