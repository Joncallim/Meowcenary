import { describe, expect, it } from 'vitest';
import { DataEnemyRegistry, ELITE_MULTIPLIERS } from '../src/systems/enemies';
import type { EnemyDefinition } from '../src/systems/types';
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
    expect(() => new DataEnemyRegistry({ enemies: [...shipped, shipped[0]] })).toThrow(/duplicate id/);

    const invalids: EnemyDefinition[] = [
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
    expect(() => new DataEnemyRegistry({ enemies: [...shipped, invalids[1]] })).toThrow(/unknown enemyId/);
    expect(() => new DataEnemyRegistry({ enemies: [...shipped, ranged, invalids[2]] })).toThrow(/direct chaser/);
  });

  it('validates the complete catalog before constructing canonical state', () => {
    const shipped = structuredClone(loadGameData().enemies) as unknown as Record<string, unknown>[];
    const cases: unknown[] = [];

    const missing = structuredClone(shipped);
    delete missing[0].health;
    cases.push(missing);

    const unknown = structuredClone(shipped);
    unknown[0].surprise = true;
    cases.push(unknown);

    const invalid = structuredClone(shipped);
    invalid[0].health = -1;
    cases.push(invalid);

    const nonFinite = structuredClone(shipped);
    nonFinite[0].damage = Number.NaN;
    cases.push(nonFinite);

    const sparse = new Array(shipped.length + 1);
    shipped.forEach((enemy, index) => { sparse[index] = enemy; });
    cases.push(sparse);

    const cyclic = structuredClone(shipped);
    cyclic[0].cycle = cyclic[0];
    cases.push(cyclic);

    for (const enemies of cases) {
      let registry: DataEnemyRegistry | undefined;
      expect(() => { registry = new DataEnemyRegistry({ enemies }); }).toThrow();
      expect(registry).toBeUndefined();
    }
  });

  it('leaves rejected caller input untouched', () => {
    const enemies = structuredClone(loadGameData().enemies) as unknown as Record<string, unknown>[];
    enemies[0].health = -1;
    enemies[0].surprise = 'preserve me';
    const before = structuredClone(enemies);

    expect(() => new DataEnemyRegistry({ enemies })).toThrow();
    expect(enemies).toEqual(before);
  });

  it('uses the shared spawnability authority for all six archetypes', () => {
    const data = loadGameData();
    const shells: EnemyDefinition[] = [
      {
        id: 'ranged-shell', name: 'Ranged shell', archetype: 'ranged', health: 1,
        damage: 0, speed: 0, xpValue: 0, scrapValue: 0, contactDamage: false,
        attack: { range: 1, telegraphMs: 1, cooldownMs: 1 },
      },
      { id: 'boss-shell', name: 'Boss shell', archetype: 'boss', health: 1, damage: 0, speed: 0, xpValue: 0, scrapValue: 0, contactDamage: false },
      elite,
    ];
    const registry = new DataEnemyRegistry({ enemies: [...data.enemies, ...shells] });
    const expected = new Map([
      ['dust-mite', true],
      ['junk-rusher', true],
      ['trash-brute', true],
      ['ranged-shell', false],
      ['elite-dust-mite', false],
      ['boss-shell', false],
    ]);
    for (const [id, isSpawnable] of expected) {
      expect(registry.spawnableById(id) !== undefined).toBe(isSpawnable);
    }
  });

  it('rejects every elite-derived stat overflow without returning partial state or mutating input', () => {
    const overflowCases: ReadonlyArray<[string, number]> = [
      ['health', Number.MAX_VALUE],
      ['damage', Number.MAX_VALUE],
      ['speed', Number.MAX_VALUE],
      ['xpValue', Number.MAX_SAFE_INTEGER],
      ['scrapValue', Number.MAX_SAFE_INTEGER],
    ];

    for (const [stat, value] of overflowCases) {
      const enemies = structuredClone(loadGameData().enemies);
      const base = enemies.find((enemy) => enemy.id === 'dust-mite');
      if (base?.archetype !== 'chaser') throw new Error('missing dust-mite chaser');
      base[stat as keyof typeof base] = value as never;
      const input = { enemies: [...enemies, elite] };
      const before = structuredClone(input);
      let registry: DataEnemyRegistry | undefined;

      expect(() => { registry = new DataEnemyRegistry(input); }).toThrow(
        new RegExp(`Elite "elite-dust-mite" base "dust-mite".*"${stat}"`),
      );
      expect(registry).toBeUndefined();
      expect(input).toEqual(before);
    }
  });

  it('publishes large elite-derived values when every result remains valid', () => {
    const enemies = structuredClone(loadGameData().enemies);
    const base = enemies.find((enemy) => enemy.id === 'dust-mite');
    if (base?.archetype !== 'chaser') throw new Error('missing dust-mite chaser');
    base.health = Number.MAX_VALUE / 4;
    base.damage = Number.MAX_VALUE / 4;
    base.speed = Number.MAX_VALUE / 4;
    base.xpValue = Math.floor(Number.MAX_SAFE_INTEGER / 2);
    base.scrapValue = Math.floor(Number.MAX_SAFE_INTEGER / 2);
    const input = { enemies: [...enemies, elite] };
    const before = structuredClone(input);

    const resolved = new DataEnemyRegistry(input).resolvedById('elite-dust-mite');
    if (!resolved || resolved.archetype !== 'elite') throw new Error('missing resolved elite');
    expect(Number.isFinite(resolved.health)).toBe(true);
    expect(Number.isFinite(resolved.damage)).toBe(true);
    expect(Number.isFinite(resolved.speed)).toBe(true);
    expect(Number.isSafeInteger(resolved.xpValue)).toBe(true);
    expect(Number.isSafeInteger(resolved.scrapValue)).toBe(true);
    expect(resolved).toMatchObject({
      health: Number.MAX_VALUE / 2,
      xpValue: Math.floor(Number.MAX_SAFE_INTEGER / 2) * 2,
      scrapValue: Math.floor(Number.MAX_SAFE_INTEGER / 2) * 2,
    });
    expect(input).toEqual(before);
  });
});
