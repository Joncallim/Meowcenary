import { describe, expect, it } from 'vitest';
import { createRunState } from '../src/gameplay/runState';
import { resolveWeaponStats } from '../src/gameplay/weaponStats';
import { projectileDirections } from '../src/gameplay/projectilePattern';
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

  function weaponById(id: string) {
    const def = registry.weaponById(id);
    if (!def) {
      throw new Error(`missing weapon: ${id}`);
    }
    return def;
  }

  it('gives SMG T3 a tight double-tap — the immediately perceptible, non-numeric tier-3 change (D2)', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    const stats = resolveWeaponStats(runState, weaponById('can-smg-t3'));

    expect(stats.projectileCount).toBe(2);
    // Tight and forward-biased, not a shotgun-width fan (bolt-shotgun spreads 34-42deg).
    expect(stats.spreadDeg).toBeGreaterThan(0);
    expect(stats.spreadDeg).toBeLessThan(15);

    const directions = projectileDirections({
      origin: { x: 0, y: 0 },
      target: { x: 100, y: 0 },
      projectileCount: stats.projectileCount,
      spreadDeg: stats.spreadDeg,
    });
    expect(directions).toHaveLength(2);
    // Both shots stay forward-biased: neither strays far from the straight-line target.
    for (const dir of directions) {
      expect(dir.x).toBeGreaterThan(0.99);
    }
  });

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

  describe('weapon-family-scoped modifiers (Epic 18 D4)', () => {
    it('applies a pistol-scoped damage modifier only to pistol, never to another family', () => {
      const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
      runState.stats.add({
        stat: 'damage',
        op: 'mult',
        value: 2,
        sourceId: 'pistol-scoped',
        scope: { kind: 'weapon-family', family: 'pistol' },
      });

      const pistolStats = resolveWeaponStats(runState, pistol());
      const smgStats = resolveWeaponStats(runState, weaponById('can-smg-t1'));

      expect(pistolStats.damage).toBe(pistol().damage * 2);
      expect(smgStats.damage).toBe(weaponById('can-smg-t1').damage);
    });

    it('routes pierce and spreadDeg through modifiers with post-resolution clamps', () => {
      const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
      runState.stats.add({ stat: 'pierce', op: 'add', value: 1.9, sourceId: 'punch-through' });
      runState.stats.add({ stat: 'spreadDeg', op: 'add', value: 4, sourceId: 'split-shot' });

      const stats = resolveWeaponStats(runState, pistol());

      expect(stats.pierce).toBe(pistol().pierce + 1); // floored, never fractional
      expect(stats.spreadDeg).toBe(pistol().spreadDeg + 4);

      const negative = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
      negative.stats.add({ stat: 'pierce', op: 'mult', value: 0, sourceId: 'zero' });
      negative.stats.add({ stat: 'spreadDeg', op: 'mult', value: 0, sourceId: 'zero-spread' });

      expect(resolveWeaponStats(negative, pistol()).pierce).toBe(0);
      expect(resolveWeaponStats(negative, pistol()).spreadDeg).toBe(0);
    });

    it('scopes attackSpeed by family so a family-specific fire-rate card does not affect other families', () => {
      const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
      runState.stats.add({
        stat: 'attackSpeed',
        op: 'mult',
        value: 2,
        sourceId: 'smg-overclock',
        scope: { kind: 'weapon-family', family: 'smg' },
      });

      const smg = weaponById('can-smg-t1');
      const pistolStats = resolveWeaponStats(runState, pistol());
      const smgStats = resolveWeaponStats(runState, smg);

      expect(pistolStats.intervalMs).toBe(pistol().fireRateMs);
      expect(smgStats.intervalMs).toBe(smg.fireRateMs / 2);
    });
  });
});
