import { describe, expect, it } from 'vitest';
import { angleBetweenDeg, projectileDirections } from '../src/gameplay/projectilePattern';

describe('projectile pattern', () => {
  it('uses the direct normalized direction for a single projectile', () => {
    expect(
      projectileDirections({
        origin: { x: 0, y: 0 },
        target: { x: 10, y: 0 },
        projectileCount: 1,
        spreadDeg: 45,
      }),
    ).toEqual([{ x: 1, y: 0 }]);
  });

  it('returns one direction per shotgun pellet', () => {
    const directions = projectileDirections({
      origin: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      projectileCount: 5,
      spreadDeg: 40,
    });

    expect(directions).toHaveLength(5);
  });

  it('bounds spread directions by spreadDeg', () => {
    const direct = { x: 1, y: 0 };
    const directions = projectileDirections({
      origin: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      projectileCount: 5,
      spreadDeg: 40,
    });

    expect(Math.max(...directions.map((direction) => angleBetweenDeg(direct, direction)))).toBeLessThanOrEqual(
      20.000001,
    );
  });
});
