import { describe, expect, it } from 'vitest';
import { formatNumber, formatStat, formatTime } from '../src/ui/format';
import { STAT_KEYS, type StatKey } from '../src/gameplay/stats';

describe('formatTime', () => {
  it('formats zero and whole seconds as minutes:seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5_000)).toBe('0:05');
    expect(formatTime(65_000)).toBe('1:05');
  });

  it('rolls over minutes without an upper bound', () => {
    expect(formatTime(7_200_000)).toBe('120:00');
    expect(formatTime(7_203_000)).toBe('120:03');
  });

  it('clamps negative and non-finite values to zero', () => {
    expect(formatTime(-1)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(Number.NEGATIVE_INFINITY)).toBe('0:00');
  });

  it('floors partial seconds', () => {
    expect(formatTime(1_999)).toBe('0:01');
    expect(formatTime(59_999)).toBe('0:59');
  });
});

describe('formatNumber', () => {
  it('returns an em dash for non-finite values', () => {
    expect(formatNumber(Number.NaN)).toBe('\u2014');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('\u2014');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('\u2014');
  });

  it('normalizes negative zero', () => {
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(0)).toBe('0');
  });

  it('adds deterministic comma grouping to integers', () => {
    expect(formatNumber(1_000)).toBe('1,000');
    expect(formatNumber(1_234_567)).toBe('1,234,567');
    expect(formatNumber(-1_000)).toBe('-1,000');
  });

  it('shows at most one decimal and strips trailing .0', () => {
    expect(formatNumber(1)).toBe('1');
    expect(formatNumber(1.2)).toBe('1.2');
    expect(formatNumber(1.25)).toBe('1.3');
    expect(formatNumber(1.04)).toBe('1');
  });
});

describe('formatStat', () => {
  it('formats critChance as a percentage', () => {
    expect(formatStat('critChance', 0.25)).toBe('25%');
    expect(formatStat('critChance', 1)).toBe('100%');
  });

  it('formats multipliers with the multiplication sign', () => {
    expect(formatStat('attackSpeed', 1.2)).toBe('\u00d71.2');
    expect(formatStat('xpGain', 2)).toBe('\u00d72');
    expect(formatStat('currencyGain', 0.5)).toBe('\u00d70.5');
  });

  it('truncates projectileCount to an integer display', () => {
    expect(formatStat('projectileCount', 3.9)).toBe('3');
  });

  it('delegates remaining stat keys to formatNumber', () => {
    const multiplierStats: readonly StatKey[] = ['attackSpeed', 'xpGain', 'currencyGain'];
    const percentageStats: readonly StatKey[] = ['critChance'];
    const integerStats: readonly StatKey[] = ['projectileCount'];
    const special = new Set<StatKey>([
      ...multiplierStats,
      ...percentageStats,
      ...integerStats,
    ]);

    for (const key of STAT_KEYS) {
      if (special.has(key)) continue;
      expect(formatStat(key, 1_234.5)).toBe(formatNumber(1_234.5));
    }
  });

  it('returns an em dash for non-finite values for every stat key', () => {
    for (const key of STAT_KEYS) {
      expect(formatStat(key, Number.NaN)).toBe('\u2014');
    }
  });
});
