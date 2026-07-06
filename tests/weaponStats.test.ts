import { describe, expect, it } from 'vitest';
import { createRunState } from '../src/gameplay/runState';
import { resolveWeaponStats } from '../src/gameplay/weaponStats';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';

describe('weapon stats', () => {
  const registry = new DataWeaponRegistry(loadGameData());

  function pistol() {
    const def = registry.weaponById('scrap-pistol-t1');
    if (!def) {
      throw new Error('missing pistol');
    }
    return def;
  }

  it('reduces interval as attackSpeed increases', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.stats.add({ stat: 'attackSpeed', op: 'mult', value: 2, sourceId: 'test' });

    expect(resolveWeaponStats(runState, pistol()).intervalMs).toBe(325);
  });

  it('applies damage modifiers', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.stats.add({ stat: 'damage', op: 'add', value: 4, sourceId: 'add' });
    runState.stats.add({ stat: 'damage', op: 'mult', value: 2, sourceId: 'mult' });

    expect(resolveWeaponStats(runState, pistol()).damage).toBe(24);
  });

  it('applies projectileCount modifiers and floors/clamps to one', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.stats.add({ stat: 'projectileCount', op: 'add', value: 1.9, sourceId: 'more' });

    expect(resolveWeaponStats(runState, pistol()).projectileCount).toBe(2);

    const clamped = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    clamped.stats.add({ stat: 'projectileCount', op: 'mult', value: 0, sourceId: 'zero' });

    expect(resolveWeaponStats(clamped, pistol()).projectileCount).toBe(1);
  });

  it('applies range and projectile speed modifiers', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.stats.add({ stat: 'range', op: 'add', value: 20, sourceId: 'range' });
    runState.stats.add({ stat: 'projectileSpeed', op: 'mult', value: 1.5, sourceId: 'speed' });

    const stats = resolveWeaponStats(runState, pistol());

    expect(stats.range).toBe(320);
    expect(stats.projectileSpeed).toBe(540);
  });
});
