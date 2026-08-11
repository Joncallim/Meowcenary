import { describe, expect, it } from 'vitest';
import { createDpsMeter } from '../src/gameplay/metrics';

const WINDOW_MS = 5000;

describe('createDpsMeter factory', () => {
  it('defaults to a five-second window', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    expect(meter.windowDps(6000)).toBe(2);
  });

  it('accepts a custom positive window', () => {
    const meter = createDpsMeter(1000);
    meter.record(5, 100);
    expect(meter.windowDps(1100)).toBe(5);
  });

  it.each([0, -100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects an invalid window of %s',
    (windowMs) => {
      expect(() => createDpsMeter(windowMs)).toThrow(
        'DPS window must be a positive finite number',
      );
    },
  );
});

describe('record and windowDps accumulation', () => {
  it('reports one sample across the window', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    expect(meter.windowDps(6000)).toBe(2);
    expect(meter.totalDamage).toBe(10);
  });

  it('accumulates several samples across the window', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    meter.record(20, 3000);
    expect(meter.windowDps(6000)).toBe(6);
    expect(meter.totalDamage).toBe(30);
  });

  it('accumulates samples recorded at the same timestamp', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    meter.record(20, 1000);
    expect(meter.windowDps(6000)).toBe(6);
    expect(meter.totalDamage).toBe(30);
  });

  it('includes a sample exactly on the lower window boundary', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    expect(meter.windowDps(6000)).toBe(2);
  });

  it('prunes a sample that has just expired', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    expect(meter.windowDps(6001)).toBe(0);
  });

  it('keeps lifetime total intact when the rolling window prunes', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    meter.record(20, 5000);
    expect(meter.windowDps(6001)).toBe(4);
    expect(meter.totalDamage).toBe(30);
  });

  it('drops invalid and negative amounts and timestamps', () => {
    const meter = createDpsMeter();
    meter.record(Number.NaN, 1000);
    meter.record(Number.POSITIVE_INFINITY, 1000);
    meter.record(-1, 1000);
    meter.record(10, Number.NaN);
    meter.record(10, Number.POSITIVE_INFINITY);
    meter.record(10, -5);
    expect(meter.totalDamage).toBe(0);
    expect(meter.windowDps(1000)).toBe(0);
  });

  it('leaves results unchanged for zero damage while advancing the clock', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    meter.record(0, 5000);
    expect(meter.windowDps(6000)).toBe(2);
    expect(meter.totalDamage).toBe(10);
    // The zero record advanced latestMs, so a backdated record is dropped.
    meter.record(10, 4000);
    expect(meter.totalDamage).toBe(10);
  });

  it('drops out-of-order records', () => {
    const meter = createDpsMeter();
    meter.record(10, 5000);
    meter.record(5, 1000);
    expect(meter.totalDamage).toBe(10);
    expect(meter.windowDps(6000)).toBe(2);
  });

  it('drops records backdated behind a later query', () => {
    const meter = createDpsMeter();
    meter.record(10, 3000);
    expect(meter.windowDps(5000)).toBe(2);
    meter.record(5, 2000);
    expect(meter.totalDamage).toBe(10);
  });

  it('returns zero for backwards or non-finite query time without losing samples', () => {
    const meter = createDpsMeter();
    meter.record(10, 3000);
    expect(meter.windowDps(1000)).toBe(0);
    expect(meter.windowDps(Number.NaN)).toBe(0);
    expect(meter.windowDps(-5)).toBe(0);
    expect(meter.totalDamage).toBe(10);
    expect(meter.windowDps(8000)).toBe(2);
  });

  it('returns 0 rather than -0', () => {
    const meter = createDpsMeter();
    meter.record(0, 1000);
    expect(Object.is(meter.windowDps(6000), -0)).toBe(false);
    expect(meter.windowDps(6000)).toBe(0);
  });

  it('is stable across repeated queries at the same time', () => {
    const meter = createDpsMeter();
    meter.record(10, 1000);
    expect(meter.windowDps(6000)).toBe(2);
    expect(meter.windowDps(6000)).toBe(2);
    expect(meter.totalDamage).toBe(10);
  });
});

describe('overflow guards', () => {
  it('drops a rolling overflow while keeping totals finite', () => {
    const meter = createDpsMeter();
    meter.record(Number.MAX_VALUE, 1000);
    meter.record(Number.MAX_VALUE, 2000);
    expect(meter.totalDamage).toBe(Number.MAX_VALUE);
    expect(Number.isFinite(meter.windowDps(2000))).toBe(true);
  });

  it('drops a lifetime overflow even when the rolling window would accept it', () => {
    const meter = createDpsMeter();
    meter.record(Number.MAX_VALUE, 1000);
    // Expires the first sample from the rolling window but not from lifetime.
    meter.record(Number.MAX_VALUE, 6000);
    expect(meter.totalDamage).toBe(Number.MAX_VALUE);
    expect(Number.isFinite(meter.windowDps(6000))).toBe(true);
  });
});

describe('compaction', () => {
  it('matches the mathematical reference after heavy pruning', () => {
    const meter = createDpsMeter();
    const recorded: Array<{ amount: number; atMs: number }> = [];
    // 301 samples spread well beyond the window so the discarded prefix grows.
    for (let index = 0; index <= 300; index += 1) {
      const atMs = index * 2000;
      meter.record(10, atMs);
      recorded.push({ amount: 10, atMs });
    }

    const nowMs = 600000;
    const expectedSum = recorded
      .filter((sample) => sample.atMs >= nowMs - WINDOW_MS)
      .reduce((sum, sample) => sum + sample.amount, 0);
    const expectedDps = expectedSum / (WINDOW_MS / 1000);

    expect(meter.windowDps(nowMs)).toBe(expectedDps);
    expect(expectedDps).toBeGreaterThan(0);
    // Lifetime damage survives every prune and compaction.
    expect(meter.totalDamage).toBe(3010);
  });
});
