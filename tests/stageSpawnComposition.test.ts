import { describe, expect, it } from 'vitest';
import { composeStageSpawnCurve } from '../src/gameplay/stage/spawnComposition';
import type { ResolvedRunPlan } from '../src/gameplay/stage/stageContracts';
import type { SpawnCurveDefinition } from '../src/systems/types';

const curve: SpawnCurveDefinition = {
  id: 'legacy', durationSeconds: 300,
  scaling: { healthPerMinute: 0.1, damagePerMinute: 0.1 },
  waves: [
    { startSecond: 0, enemyId: 'legacy-a', spawnEveryMs: 1000, maxAlive: 2 },
    { startSecond: 10, enemyId: 'legacy-b', spawnEveryMs: 1200, maxAlive: 3 },
  ],
};

function plan(): Pick<ResolvedRunPlan, 'encounter' | 'difficulty'> {
  return {
    encounter: { profileId: 'encounter:proof', enemyIds: ['enemy:one', 'enemy:two'], compositionWeights: { 'enemy:one': 2, 'enemy:two': 1 } },
    difficulty: { profileId: 'difficulty:proof', healthMultiplier: 1.5, damageMultiplier: 1.25, speedMultiplier: 1.1, spawnPressure: 0.5 },
  };
}

describe('stage spawn composition', () => {
  it('makes resolved encounter membership and difficulty pressure authoritative over legacy curve rows', () => {
    const composed = composeStageSpawnCurve(curve, plan());
    expect(composed.waves.map((wave) => wave.enemyId)).toEqual(['enemy:one', 'enemy:two']);
    expect(composed.waves.map((wave) => wave.spawnEveryMs)).toEqual([333, 800]);
    expect(composed.waves.map((wave) => wave.maxAlive)).toEqual([3, 5]);
    expect(curve.waves.map((wave) => wave.enemyId)).toEqual(['legacy-a', 'legacy-b']);
  });

  it('materialises every archetype in a second data-only encounter roster without a runtime source change', () => {
    const second = composeStageSpawnCurve(curve, {
      ...plan(), encounter: { profileId: 'encounter:second-fixture', enemyIds: ['enemy:third', 'enemy:fourth', 'enemy:fifth'] },
    });
    expect(second.waves.map((wave) => wave.enemyId)).toEqual(['enemy:third', 'enemy:fourth', 'enemy:fifth']);
  });

  it('preserves authored roster order as evenly spaced pressure layers', () => {
    const ordered = composeStageSpawnCurve({ ...curve, durationSeconds: 120 }, {
      ...plan(),
      encounter: {
        profileId: 'encounter:ordered',
        enemyIds: ['swarm', 'flanker', 'charger', 'ranged'],
        compositionWeights: { swarm: 2, flanker: 1, charger: 1, ranged: 1 },
      },
    });
    expect(ordered.waves.map((wave) => [wave.enemyId, wave.startSecond])).toEqual([
      ['swarm', 0], ['flanker', 30], ['charger', 60], ['ranged', 90],
    ]);
  });

  it('projects five- and six-member rosters across the source curve without wrapping late support into swarm pressure', () => {
    const shaped: SpawnCurveDefinition = {
      ...curve,
      waves: [
        { startSecond: 0, enemyId: 'legacy-swarm', spawnEveryMs: 1600, maxAlive: 12 },
        { startSecond: 25, enemyId: 'legacy-flanker', spawnEveryMs: 2400, maxAlive: 6 },
        { startSecond: 50, enemyId: 'legacy-ranged', spawnEveryMs: 3200, maxAlive: 4 },
        { startSecond: 80, enemyId: 'legacy-heavy', spawnEveryMs: 6500, maxAlive: 3 },
      ],
    };
    const neutralDifficulty = { ...plan().difficulty, spawnPressure: 0 };
    const six = composeStageSpawnCurve(shaped, {
      difficulty: neutralDifficulty,
      encounter: {
        profileId: 'encounter:six-layer-proof',
        enemyIds: ['one', 'two', 'three', 'four', 'five', 'six'],
        compositionWeights: { one: 1, two: 1, three: 1, four: 1, five: 1, six: 1 },
      },
    });
    expect(six.waves.map((wave) => wave.spawnEveryMs)).toEqual([1600, 2400, 2400, 3200, 3200, 6500]);
    expect(six.waves.map((wave) => wave.maxAlive)).toEqual([12, 6, 6, 4, 4, 3]);
    expect(six.waves.at(-1)).toMatchObject({ enemyId: 'six', spawnEveryMs: 6500, maxAlive: 3 });

    const five = composeStageSpawnCurve(shaped, {
      difficulty: neutralDifficulty,
      encounter: {
        profileId: 'encounter:five-layer-proof',
        enemyIds: ['one', 'two', 'three', 'four', 'five'],
      },
    });
    expect(five.waves.map((wave) => wave.spawnEveryMs)).toEqual([1600, 2400, 3200, 3200, 6500]);
    expect(five.waves.at(-1)).toMatchObject({ enemyId: 'five', spawnEveryMs: 6500, maxAlive: 3 });
  });

  it('caps composed active counts at the spawn director boundary', () => {
    const crowded: SpawnCurveDefinition = {
      ...curve,
      waves: Array.from({ length: 4 }, (_, index) => ({
        startSecond: index * 10, enemyId: `legacy-${index}`, spawnEveryMs: 1000, maxAlive: 100,
      })),
    };
    const composed = composeStageSpawnCurve(crowded, { ...plan(), difficulty: { ...plan().difficulty, spawnPressure: 1 } });
    expect(composed.waves.reduce((sum, wave) => sum + wave.maxAlive, 0)).toBeLessThanOrEqual(256);
    expect(composed.waves.every((wave) => wave.maxAlive >= 1)).toBe(true);
  });
});
