import { describe, expect, it } from 'vitest';
import { motionDuration, shouldUseHeavyMotion } from '../src/engine/motion';

describe('shouldUseHeavyMotion', () => {
  it('returns true only when reduced motion is false', () => {
    expect(shouldUseHeavyMotion(false)).toBe(true);
    expect(shouldUseHeavyMotion(true)).toBe(false);
  });
});

describe('motionDuration', () => {
  it('preserves a finite positive duration when reduced motion is off', () => {
    expect(motionDuration(120, false)).toBe(120);
    expect(motionDuration(16.67, false)).toBe(16.67);
  });

  it('returns zero duration under reduced motion', () => {
    expect(motionDuration(120, true)).toBe(0);
  });

  it('returns zero for zero, negative, and non-finite durations', () => {
    expect(motionDuration(0, false)).toBe(0);
    expect(motionDuration(-10, false)).toBe(0);
    expect(motionDuration(Number.NaN, false)).toBe(0);
    expect(motionDuration(Number.POSITIVE_INFINITY, false)).toBe(0);
    expect(motionDuration(Number.NEGATIVE_INFINITY, false)).toBe(0);
  });
});
