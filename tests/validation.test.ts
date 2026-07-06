import { describe, expect, it } from 'vitest';
import { loadGameData, validateGameData } from '../src/systems/validation';

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
});

