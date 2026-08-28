import { deepFreeze } from '../../engine/freeze';
import type { SpawnCurveDefinition } from '../../systems/types';
import type { ResolvedRunPlan } from './stageContracts';

/** Builds the normal-stage spawn input from the resolved encounter and
 * difficulty profile. The legacy curve contributes cadence/scaling shape,
 * but it cannot choose the stage's enemy roster or final pressure. */
export function composeStageSpawnCurve(
  legacyCurve: Readonly<SpawnCurveDefinition>,
  plan: Pick<ResolvedRunPlan, 'encounter' | 'difficulty'>,
): Readonly<SpawnCurveDefinition> {
  const weightedRoster = expandWeightedRoster(
    plan.encounter.enemyIds,
    plan.encounter.compositionWeights,
    plan.encounter.profileId,
  );
  const cadenceMultiplier = 1 + plan.difficulty.spawnPressure;
  const aliveMultiplier = 1 + plan.difficulty.spawnPressure;
  const candidates = legacyCurve.waves.map((wave) =>
    Math.max(1, Math.ceil(wave.maxAlive * aliveMultiplier)),
  );
  const cappedAlive = capActiveCounts(candidates);
  return deepFreeze({
    ...structuredClone(legacyCurve),
    waves: legacyCurve.waves.map((wave, index) => ({
      ...wave,
      enemyId: weightedRoster[index % weightedRoster.length],
      spawnEveryMs: Math.max(200, Math.round(wave.spawnEveryMs / cadenceMultiplier)),
      maxAlive: cappedAlive[index],
    })),
  });
}

/** Preserve every wave while enforcing the spawn director's global cap. */
function capActiveCounts(candidates: readonly number[]): readonly number[] {
  const total = candidates.reduce((sum, value) => sum + value, 0);
  if (total <= 256) return candidates;
  let remainingExtra = 256 - candidates.length;
  return candidates.map((candidate) => {
    const extra = Math.min(candidate - 1, Math.max(0, remainingExtra));
    remainingExtra -= extra;
    return 1 + extra;
  });
}

function expandWeightedRoster(
  enemyIds: readonly string[],
  weights: Readonly<Record<string, number>> | undefined,
  profileId: string,
): readonly string[] {
  if (enemyIds.length === 0) throw new Error(`Encounter "${profileId}" has no enemies`);
  // The profile validator guarantees every weighted member is in the roster
  // and carries a positive integer weight. Cycling the expanded sequence is
  // deterministic while preserving authored composition ratios.
  const weighted = enemyIds.flatMap((enemyId) =>
    Array.from({ length: weights?.[enemyId] ?? 1 }, () => enemyId),
  );
  return Object.freeze(weighted);
}
