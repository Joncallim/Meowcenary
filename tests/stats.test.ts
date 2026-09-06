import { describe, expect, it } from 'vitest';
import { scaleModifierByTier, type ModifierSpec } from '../src/gameplay/stats';

describe('ModifierSpec tier scaling', () => {
  it('scales additive modifiers linearly by tier', () => {
    const spec: ModifierSpec = { stat: 'range', op: 'add', value: 35 };
    expect(scaleModifierByTier(spec, 1)).toBe(35);
    expect(scaleModifierByTier(spec, 2)).toBe(70);
    expect(scaleModifierByTier(spec, 3)).toBe(105);
    expect(scaleModifierByTier(spec, 4)).toBe(140);
    expect(scaleModifierByTier(spec, 5)).toBe(175);
  });

  it('scales multiplicative modifiers using delta scaling', () => {
    const spec: ModifierSpec = { stat: 'damage', op: 'mult', value: 1.12 };
    // T1: 1.12
    // T2: 1 + (1.12 - 1) * 2 = 1 + 0.12 * 2 = 1.24
    // T3: 1 + (1.12 - 1) * 3 = 1 + 0.12 * 3 = 1.36
    expect(scaleModifierByTier(spec, 1)).toBeCloseTo(1.12);
    expect(scaleModifierByTier(spec, 2)).toBeCloseTo(1.24);
    expect(scaleModifierByTier(spec, 3)).toBeCloseTo(1.36);
    expect(scaleModifierByTier(spec, 4)).toBeCloseTo(1.48);
    expect(scaleModifierByTier(spec, 5)).toBeCloseTo(1.60);
  });

  it('scales fractional multiplicative deltas correctly', () => {
    // 0.94 at T2 => 1 + (0.94 - 1) * 2 = 1 + (-0.06) * 2 = 0.88
    const spec: ModifierSpec = { stat: 'spreadDeg', op: 'mult', value: 0.94 };
    expect(scaleModifierByTier(spec, 1)).toBeCloseTo(0.94);
    expect(scaleModifierByTier(spec, 2)).toBeCloseTo(0.88);
    expect(scaleModifierByTier(spec, 3)).toBeCloseTo(0.82);
  });

  it('returns base value for tier 1', () => {
    const spec: ModifierSpec = { stat: 'damage', op: 'mult', value: 1.5 };
    expect(scaleModifierByTier(spec, 1)).toBe(1.5);
  });

  it('handles add with value 0', () => {
    const spec: ModifierSpec = { stat: 'range', op: 'add', value: 0 };
    expect(scaleModifierByTier(spec, 1)).toBe(0);
    expect(scaleModifierByTier(spec, 5)).toBe(0);
  });

  it('handles mult with value 1 (no-op)', () => {
    const spec: ModifierSpec = { stat: 'damage', op: 'mult', value: 1 };
    expect(scaleModifierByTier(spec, 1)).toBe(1);
    expect(scaleModifierByTier(spec, 5)).toBe(1);
  });
});
