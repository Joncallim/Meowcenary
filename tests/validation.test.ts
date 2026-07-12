import { describe, expect, it } from 'vitest';
import {
  collectValidationErrors,
  loadGameData,
  validateGameData,
} from '../src/systems/validation';

describe('game data validation', () => {
  it('validates starter JSON', () => {
    const data = loadGameData();

    expect(data.weapons.length).toBeGreaterThan(0);
    expect(data.enemies.length).toBeGreaterThan(0);
    expect(data.upgrades.length).toBeGreaterThan(0);
    expect(data.spawnCurves.length).toBeGreaterThan(0);
  });

  it('fails missing fields with file, index, and field', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    Reflect.deleteProperty(broken.weapons[0], 'damage');

    expect(() => validateGameData(broken)).toThrow(/weapons\.json\[0\]\.damage/);
  });

  it('fails bad spawn enemy references with file, index, and field', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.spawnCurves[0].waves[0].enemyId = 'missing-enemy';

    expect(() => validateGameData(broken)).toThrow(
      /spawn-curves\.json\[0\]\.waves\[0\]\.enemyId/,
    );
  });

  it('rejects spawn content that cannot produce a playable run', () => {
    const data = loadGameData();

    const missingCurves = structuredClone(data);
    missingCurves.spawnCurves = [];
    expect(() => validateGameData(missingCurves)).toThrow(/at least one spawn curve/);

    const missingWaves = structuredClone(data);
    missingWaves.spawnCurves[0].waves = [];
    expect(() => validateGameData(missingWaves)).toThrow(/at least one wave/);

    const unreachableWave = structuredClone(data);
    unreachableWave.spawnCurves[0].waves[0].startSecond =
      unreachableWave.spawnCurves[0].durationSeconds;
    expect(() => validateGameData(unreachableWave)).toThrow(/must be before durationSeconds/);
  });

  it('rejects fractional integer fields', () => {
    const data = loadGameData();

    const fractionalMergeTier = structuredClone(data);
    fractionalMergeTier.weapons[0].mergeTier = 1.5;
    expect(() => validateGameData(fractionalMergeTier)).toThrow(/weapons\.json\[0\]\.mergeTier/);

    const fractionalMaxStacks = structuredClone(data);
    fractionalMaxStacks.upgrades[0].maxStacks = 2.5;
    expect(() => validateGameData(fractionalMaxStacks)).toThrow(/upgrades\.json\[0\]\.maxStacks/);

    const fractionalMaxAlive = structuredClone(data);
    fractionalMaxAlive.spawnCurves[0].waves[0].maxAlive = 3.5;
    expect(() => validateGameData(fractionalMaxAlive)).toThrow(
      /spawn-curves\.json\[0\]\.waves\[0\]\.maxAlive/,
    );
  });

  it('validates shipped weapon family tiers', () => {
    const data = loadGameData();

    expect(data.weapons.map((weapon) => weapon.id)).toEqual([
      'scrap-pistol-t1',
      'scrap-pistol-t2',
      'scrap-pistol-t3',
      'can-smg-t1',
      'can-smg-t2',
      'can-smg-t3',
      'bolt-shotgun-t1',
      'bolt-shotgun-t2',
      'bolt-shotgun-t3',
    ]);
  });

  it('rejects non-contiguous weapon family tiers', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.weapons = broken.weapons.filter((weapon) => weapon.id !== 'scrap-pistol-t2');

    expect(() => validateGameData(broken)).toThrow(/family "pistol" missing mergeTier 2/);
  });

  it('rejects catalogs that cannot build the default starter loadout', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.weapons = broken.weapons.filter((weapon) => weapon.family !== 'shotgun');

    expect(() => validateGameData(broken)).toThrow(
      /missing required starter family "shotgun" at mergeTier 1/,
    );
  });

  it('rejects weapon merge tiers above max tier', () => {
    const data = loadGameData();
    const broken = structuredClone(data);
    broken.weapons[0].mergeTier = 4;

    expect(() => validateGameData(broken)).toThrow(/mergeTier: 4 exceeds maxTier 3/);
  });

  it('rejects invalid projectile count, pierce, and spread values', () => {
    const data = loadGameData();

    const badProjectileCount = structuredClone(data);
    badProjectileCount.weapons[0].projectileCount = 0;
    expect(() => validateGameData(badProjectileCount)).toThrow(
      /weapons\.json\[0\]\.projectileCount/,
    );

    const badPierce = structuredClone(data);
    badPierce.weapons[0].pierce = -1;
    expect(() => validateGameData(badPierce)).toThrow(/weapons\.json\[0\]\.pierce/);

    const badSpread = structuredClone(data);
    badSpread.weapons[0].spreadDeg = Number.NaN;
    expect(() => validateGameData(badSpread)).toThrow(/weapons\.json\[0\]\.spreadDeg/);
  });

  it('can collect row errors without throwing', () => {
    const errors = collectValidationErrors('example.json', [{ id: '' }, {}], (row) =>
      typeof row === 'object' && row !== null && 'id' in row ? [] : ['id: required string'],
    );

    expect(errors).toEqual(['example.json[1].id: required string']);
  });
});
