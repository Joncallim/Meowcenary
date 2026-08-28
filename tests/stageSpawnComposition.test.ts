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
    encounter: { profileId: 'encounter:proof', enemyIds: ['enemy:one', 'enemy:two'] },
    difficulty: { profileId: 'difficulty:proof', healthMultiplier: 1.5, damageMultiplier: 1.25, speedMultiplier: 1.1, spawnPressure: 0.5 },
  };
}

describe('stage spawn composition', () => {
  it('makes resolved encounter membership and difficulty pressure authoritative over legacy curve rows', () => {
    const composed = composeStageSpawnCurve(curve, plan());
    expect(composed.waves.map((wave) => wave.enemyId)).toEqual(['enemy:one', 'enemy:two']);
    expect(composed.waves.map((wave) => wave.spawnEveryMs)).toEqual([667, 800]);
    expect(composed.waves.map((wave) => wave.maxAlive)).toEqual([3, 5]);
    expect(curve.waves.map((wave) => wave.enemyId)).toEqual(['legacy-a', 'legacy-b']);
  });

  it('accepts a second data-only encounter roster without a runtime source change', () => {
    const second = composeStageSpawnCurve(curve, {
      ...plan(), encounter: { profileId: 'encounter:second-fixture', enemyIds: ['enemy:third'] },
    });
    expect(second.waves.every((wave) => wave.enemyId === 'enemy:third')).toBe(true);
  });
});
