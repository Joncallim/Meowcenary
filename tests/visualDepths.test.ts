import { describe, expect, it } from 'vitest';
import { VisualDepth } from '../src/systems/visualDepths';

describe('Epic 16 visual depth contract', () => {
  it('keeps presentation bands ordered and pinned for future art consumers', () => {
    expect(VisualDepth).toEqual({
      floor: -4,
      groundDecoration: -3,
      lowDecoration: -2,
      boundary: 0,
      obstacle: 1,
      dropBody: 2,
      pickup: 3,
      projectile: 3,
      enemy: 4,
      player: 5,
      heldWeapon: 6,
    });
    expect(Object.isFrozen(VisualDepth)).toBe(true);
  });
});
