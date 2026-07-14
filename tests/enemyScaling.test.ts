import { describe, expect, it } from 'vitest';
import { scaleEnemy } from '../src/gameplay/enemyScaling';
import { DataEnemyRegistry } from '../src/systems/enemies';
import { loadGameData } from '../src/systems/validation';

describe('scaleEnemy', () => {
  const data = loadGameData();
  const registry = new DataEnemyRegistry({
    enemies: [...data.enemies, {
      id: 'elite-dust-mite', name: 'Elite Dust Mite', archetype: 'elite', baseEnemyId: 'dust-mite',
    }],
  });
  const scaling = data.spawnCurves[0].scaling;

  it('matches the dust-mite golden vectors without rounding', () => {
    const dustMite = registry.resolvedById('dust-mite');
    if (!dustMite) throw new Error('missing dust-mite');
    expect(scaleEnemy(dustMite, 0, scaling)).toMatchObject({ maxHealth: 10, damage: 5, speed: 68, xpValue: 1, scrapValue: 1 });
    const oneMinute = scaleEnemy(dustMite, 60_000, scaling);
    expect(oneMinute.maxHealth).toBeCloseTo(11.8);
    expect(oneMinute.damage).toBeCloseTo(5.5);
    const twoMinutes = scaleEnemy(dustMite, 120_000, scaling);
    expect(twoMinutes.maxHealth).toBeCloseTo(13.6);
    expect(twoMinutes.damage).toBeCloseTo(6);
  });

  it('resolves elite multipliers before time scaling', () => {
    const elite = registry.resolvedById('elite-dust-mite');
    if (!elite) throw new Error('missing elite');
    expect(elite).toMatchObject({ health: 20, damage: 7.5, xpValue: 2, scrapValue: 2 });
    expect(elite.speed).toBeCloseTo(74.8);
    const scaled = scaleEnemy(elite, 60_000, scaling);
    expect(scaled.maxHealth).toBeCloseTo(23.6);
    expect(scaled.damage).toBeCloseTo(8.25);
    expect(scaled.speed).toBeCloseTo(74.8);
    expect(scaled).toMatchObject({ xpValue: 2, scrapValue: 2 });
  });

  it('clamps negative time and returns a new value without mutation', () => {
    const dustMite = registry.resolvedById('dust-mite');
    if (!dustMite) throw new Error('missing dust-mite');
    const before = structuredClone(dustMite);
    const scaled = scaleEnemy(dustMite, -1, scaling);
    expect(scaled).toEqual({ maxHealth: 10, damage: 5, speed: 68, xpValue: 1, scrapValue: 1 });
    expect(dustMite).toEqual(before);
    expect(scaled).not.toBe(dustMite);

    const fractional = scaleEnemy(dustMite, 30_000.5, scaling);
    const minutes = 30_000.5 / 60_000;
    expect(fractional.maxHealth).toBeCloseTo(10 * (1 + 0.18 * minutes));
    expect(fractional.damage).toBeCloseTo(5 * (1 + 0.1 * minutes));
    expect(dustMite).toEqual(before);
  });

  it('throws for non-finite input or result', () => {
    const dustMite = registry.resolvedById('dust-mite');
    if (!dustMite) throw new Error('missing dust-mite');
    for (const time of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => scaleEnemy(dustMite, time, scaling)).toThrow(/finite/);
    }
    expect(() => scaleEnemy({ ...dustMite, health: Number.NaN }, 0, scaling)).toThrow(/finite/);
    expect(() => scaleEnemy(dustMite, 0, { ...scaling, damagePerMinute: Number.POSITIVE_INFINITY })).toThrow(/finite/);
    for (const invalidRate of [-0.01, 1.01]) {
      expect(() => scaleEnemy(dustMite, 0, { ...scaling, healthPerMinute: invalidRate })).toThrow(/0 through 1/);
      expect(() => scaleEnemy(dustMite, 0, { ...scaling, damagePerMinute: invalidRate })).toThrow(/0 through 1/);
    }
    expect(() => scaleEnemy({ ...dustMite, health: Number.MAX_VALUE }, Number.MAX_VALUE, { healthPerMinute: 1, damagePerMinute: 1 })).toThrow(/result must be finite/);
  });
});
