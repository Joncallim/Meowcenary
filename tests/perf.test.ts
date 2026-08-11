import { describe, expect, it } from 'vitest';
import { createPerfSampler } from '../src/gameplay/perf';

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
