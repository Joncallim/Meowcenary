import { describe, expect, it } from 'vitest';
import { nearestTarget } from '../src/gameplay/targeting';
import { createRunState } from '../src/gameplay/runState';
import { resolveWeaponStats } from '../src/gameplay/weaponStats';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';

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

  it('accepts the exact resolved range boundary and rejects its epsilon beyond it', () => {
    const registry = new DataWeaponRegistry(loadGameData());
    const smg = registry.weaponById('can-smg-t1');
    if (!smg) throw new Error('missing SMG');
    const run = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    run.stats.add({ stat: 'range', op: 'mult', value: 1.10, sourceId: 'long-barrel' });
    const range = resolveWeaponStats(run, smg).range;

    expect(nearestTarget({ x: 0, y: 0 }, [{ id: 'edge', x: range, y: 0, active: true }], range)?.id)
      .toBe('edge');
    expect(nearestTarget({ x: 0, y: 0 }, [{ id: 'outside', x: range + 1e-7, y: 0, active: true }], range))
      .toBeNull();
  });
});
