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

  it('can collect row errors without throwing', () => {
    const errors = collectValidationErrors('example.json', [{ id: '' }, {}], (row) =>
      typeof row === 'object' && row !== null && 'id' in row ? [] : ['id: required string'],
    );

    expect(errors).toEqual(['example.json[1].id: required string']);
  });
});
