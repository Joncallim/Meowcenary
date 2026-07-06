import { describe, expect, it } from 'vitest';
import { nearestTarget } from '../src/gameplay/targeting';

describe('nearestTarget', () => {
  it('returns the closest active target in range', () => {
    const target = nearestTarget(
      { x: 0, y: 0 },
      [
        { id: 'far', x: 80, y: 0, active: true },
        { id: 'near', x: 10, y: 0, active: true },
        { id: 'inactive', x: 2, y: 0, active: false },
      ],
      100,
    );

    expect(target?.id).toBe('near');
  });

  it('returns null when no active target is in range', () => {
    expect(
      nearestTarget(
        { x: 0, y: 0 },
        [
          { id: 'far', x: 80, y: 0, active: true },
          { id: 'inactive', x: 2, y: 0, active: false },
        ],
        20,
      ),
    ).toBeNull();
  });
});
