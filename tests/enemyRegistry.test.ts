import { describe, expect, it } from 'vitest';
import { DataEnemyRegistry, ELITE_MULTIPLIERS } from '../src/systems/enemies';
import type { EnemyArchetype, EnemyDefinition } from '../src/systems/types';
import { loadGameData } from '../src/systems/validation';

const elite = {
  id: 'elite-dust-mite',
  name: 'Elite Dust Mite',
  archetype: 'elite' as const,
  baseEnemyId: 'dust-mite',
};

describe('DataEnemyRegistry', () => {
  it('resolves shipped definitions and missing lookups', () => {
    const registry = new DataEnemyRegistry(loadGameData());
    expect(registry.enemyById('dust-mite')?.name).toBe('Dust Mite');
    expect(registry.spawnableById('junk-rusher')?.archetype).toBe('charger');
    expect(registry.enemyById('missing')).toBeUndefined();
    expect(registry.resolvedById('missing')).toBeUndefined();
    expect(registry.spawnableById('missing')).toBeUndefined();
  });

  it('clones and recursively freezes canonical definitions and the snapshot', () => {
    const data = structuredClone(loadGameData());
    const registry = new DataEnemyRegistry(data);
    data.enemies[0].name = 'Mutated source';

    const lookup = registry.enemyById('dust-mite');
    expect(lookup?.name).toBe('Dust Mite');
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(registry.all())).toBe(true);
    expect(Reflect.set(lookup as object, 'name', 'Mutated lookup')).toBe(false);
    expect(() => (registry.all() as EnemyDefinition[]).push(data.enemies[0])).toThrow();

    const charger = registry.enemyById('junk-rusher');
    expect(charger?.archetype).toBe('charger');
    if (charger?.archetype === 'charger') expect(Object.isFrozen(charger.attack)).toBe(true);
  });

  it('resolves elite multipliers exactly without changing its base', () => {
    const data = loadGameData();
    const registry = new DataEnemyRegistry({ enemies: [...data.enemies, elite] });
    const before = registry.enemyById('dust-mite');
    const resolved = registry.resolvedById('elite-dust-mite');

    expect(ELITE_MULTIPLIERS).toEqual({ health: 2, damage: 1.5, speed: 1.1, xpValue: 2, scrapValue: 2 });
    expect(Object.isFrozen(ELITE_MULTIPLIERS)).toBe(true);
    expect(resolved).toMatchObject({
      id: 'elite-dust-mite',
      name: 'Elite Dust Mite',
      archetype: 'elite',
      baseArchetype: 'chaser',
      baseEnemyId: 'dust-mite',
      health: 20,
      damage: 7.5,
      xpValue: 2,
      scrapValue: 2,
      contactDamage: true,
    });
    expect(resolved && 'speed' in resolved ? resolved.speed : undefined).toBeCloseTo(74.8);
    expect(registry.enemyById('dust-mite')).toBe(before);
    expect(before).toMatchObject({ health: 10, damage: 5, speed: 68, xpValue: 1, scrapValue: 1 });
    expect(registry.spawnableById('elite-dust-mite')).toBeUndefined();
  });

  it('inherits charger behavior and a deeply frozen attack configuration', () => {
    const data = loadGameData();
    const registry = new DataEnemyRegistry({
      enemies: [...data.enemies, { ...elite, id: 'elite-rusher', baseEnemyId: 'junk-rusher' }],
    });
    const resolved = registry.resolvedById('elite-rusher');
    expect(resolved).toMatchObject({ archetype: 'elite', baseArchetype: 'charger', contactDamage: true });
    expect(resolved && 'attack' in resolved ? resolved.attack : undefined).toEqual({
      triggerRange: 150,
      telegraphMs: 650,
      dashSpeed: 260,
      dashDurationMs: 700,
      cooldownMs: 1200,
    });
    expect(resolved && 'attack' in resolved ? Object.isFrozen(resolved.attack) : false).toBe(true);
  });

  it('defensively rejects duplicate ids and invalid elite bases', () => {
    const shipped = loadGameData().enemies;
    expect(() => new DataEnemyRegistry({ enemies: [...shipped, shipped[0]] })).toThrow(/Duplicate enemy id/);

    const invalids: EnemyDefinition<EnemyArchetype>[] = [
      { ...elite, baseEnemyId: 'elite-dust-mite' },
      { ...elite, baseEnemyId: 'missing' },
      { ...elite, baseEnemyId: 'ranged-shell' },
    ];
    const ranged = {
      id: 'ranged-shell', name: 'Ranged', archetype: 'ranged' as const,
      health: 1, damage: 1, speed: 1, xpValue: 0, scrapValue: 0, contactDamage: false as const,
      attack: { range: 1, telegraphMs: 1, cooldownMs: 1 },
    };
    expect(() => new DataEnemyRegistry({ enemies: [...shipped, invalids[0]] })).toThrow(/cannot reference itself/);
    expect(() => new DataEnemyRegistry({ enemies: [...shipped, invalids[1]] })).toThrow(/missing base/);
    expect(() => new DataEnemyRegistry({ enemies: [...shipped, ranged, invalids[2]] })).toThrow(/direct chaser/);
  });
});
