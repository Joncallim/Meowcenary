import { describe, expect, it, vi } from 'vitest';
import { clamp, growth, lerp, linearGrowth, weightedPick } from '../src/gameplay/curves';
import { createRng, type Rng } from '../src/engine/rng';

describe('lerp', () => {
  it('returns the endpoints and midpoint', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
  });

  it('extrapolates for t outside [0, 1]', () => {
    expect(lerp(0, 10, 2)).toBe(20);
    expect(lerp(0, 10, -1)).toBe(-10);
  });

  it('throws on non-finite inputs', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => lerp(bad, 1, 0)).toThrow(/finite/);
      expect(() => lerp(1, bad, 0)).toThrow(/finite/);
      expect(() => lerp(1, 1, bad)).toThrow(/finite/);
    }
  });

  it('throws when the result overflows to non-finite', () => {
    // Three finite inputs whose arithmetic overflows: (b - a) * t exceeds
    // MAX_VALUE. Matches the growth/linearGrowth result guards.
    expect(() => lerp(Number.MAX_VALUE, 0, -1)).toThrow(/result must be finite/);
    expect(() => lerp(1, Number.MAX_VALUE, 2)).toThrow(/result must be finite/);
    // Overflow in the subtraction itself: (b - a) = -Infinity before the
    // multiplication runs, so the result guard must fire on that path too.
    expect(() => lerp(Number.MAX_VALUE, -Number.MAX_VALUE, 2)).toThrow(/result must be finite/);
  });
});

describe('clamp', () => {
  it('clamps below, inside, and above', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('throws when min exceeds max', () => {
    expect(() => clamp(5, 10, 0)).toThrow(/min must not exceed max/);
  });

  it('throws on non-finite inputs', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => clamp(bad, 0, 1)).toThrow(/finite/);
      expect(() => clamp(1, bad, 1)).toThrow(/finite/);
      expect(() => clamp(1, 0, bad)).toThrow(/finite/);
    }
  });
});

describe('growth', () => {
  it('is exact rate ** step compounding', () => {
    expect(growth(2, 2, 10)).toBe(2048);
    expect(growth(5, 1.35, 0)).toBe(5);
  });

  it('handles fractional steps', () => {
    expect(growth(1, 4, 0.5)).toBe(2);
  });

  it('throws on non-finite inputs and results', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => growth(bad, 2, 1)).toThrow(/finite/);
      expect(() => growth(2, bad, 1)).toThrow(/finite/);
      expect(() => growth(2, 2, bad)).toThrow(/finite/);
    }
    expect(() => growth(Number.MAX_VALUE, 2, 2)).toThrow(/result must be finite/);
  });
});

describe('linearGrowth', () => {
  it('returns base for zero rate and follows the formula exactly', () => {
    expect(linearGrowth(10, 0, 5)).toBe(10);
    expect(linearGrowth(10, 0.18, 2)).toBe(10 * (1 + 0.18 * 2));
  });

  it('allows negative rates', () => {
    expect(linearGrowth(10, -0.5, 2)).toBe(0);
  });

  it('throws on non-finite inputs and results', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => linearGrowth(bad, 1, 1)).toThrow(/finite/);
      expect(() => linearGrowth(1, bad, 1)).toThrow(/finite/);
      expect(() => linearGrowth(1, 1, bad)).toThrow(/finite/);
    }
    expect(() => linearGrowth(Number.MAX_VALUE, 1, 1)).toThrow(/result must be finite/);
  });
});

describe('weightedPick', () => {
  it('delegates to rng.weighted', () => {
    const entries = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 3 },
    ];
    const rng: Rng = {
      ...createRng(7),
      weighted: vi.fn(() => 'b') as unknown as Rng['weighted'],
    };
    expect(weightedPick(entries, rng)).toBe('b');
    expect(rng.weighted).toHaveBeenCalledWith(entries);
  });

  it('propagates the empty-selection error from Rng', () => {
    const rng = createRng(1);
    expect(() => weightedPick([], rng)).toThrow(/at least one positive weight/);
  });

  it('propagates the all-zero-weight error from Rng', () => {
    const rng = createRng(1);
    expect(() => weightedPick([{ item: 'a', weight: 0 }], rng)).toThrow(
      /at least one positive weight/,
    );
  });

  it('draws with real seeded Rng according to weights', () => {
    const rng = createRng(42);
    const picks = Array.from({ length: 200 }, () =>
      weightedPick([
        { item: 'common', weight: 90 },
        { item: 'rare', weight: 10 },
      ], rng),
    );
    const rare = picks.filter((pick) => pick === 'rare').length;
    expect(rare).toBeGreaterThan(0);
    expect(rare).toBeLessThan(60);
  });
});
