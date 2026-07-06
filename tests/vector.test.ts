import { describe, expect, it } from 'vitest';
import { clampLength, distanceSq, length, normalize, towards } from '../src/engine/vector';

describe('vector helpers', () => {
  it('normalizes zero as zero', () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('keeps diagonal normalize length at or below 1', () => {
    expect(length(normalize({ x: 1, y: 1 }))).toBeLessThanOrEqual(1);
  });

  it('clamps length', () => {
    expect(length(clampLength({ x: 6, y: 8 }, 5))).toBeCloseTo(5);
    expect(clampLength({ x: 1, y: 2 }, 5)).toEqual({ x: 1, y: 2 });
  });

  it('computes direction and squared distance', () => {
    expect(towards({ x: 0, y: 0 }, { x: 0, y: 4 })).toEqual({ x: 0, y: 1 });
    expect(distanceSq({ x: 1, y: 2 }, { x: 4, y: 6 })).toBe(25);
  });
});

