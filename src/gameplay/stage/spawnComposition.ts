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
  const roster = plan.encounter.enemyIds;
  if (roster.length === 0) throw new Error(`Encounter "${plan.encounter.profileId}" has no enemies`);
  const cadenceMultiplier = 1 + plan.difficulty.spawnPressure;
  const aliveMultiplier = 1 + plan.difficulty.spawnPressure;
  // One layer per canonical enemy means SpawnDirector's per-enemy active cap
  // cannot be bypassed by duplicate weighted rows. Weights change cadence,
  // not identity multiplicity, and every authored archetype gets a layer.
  const layerCount = roster.length;
  const candidates = Array.from({ length: layerCount }, (_, index) => {
    const wave = legacyCurve.waves[index % legacyCurve.waves.length]!;
    return Math.max(1, Math.ceil(wave.maxAlive * aliveMultiplier));
  });
  const cappedAlive = capActiveCounts(candidates);
  return deepFreeze({
    ...structuredClone(legacyCurve),
    waves: Array.from({ length: layerCount }, (_, index) => {
      const wave = legacyCurve.waves[index % legacyCurve.waves.length]!;
      return {
      ...wave,
      enemyId: roster[index]!,
      startSecond: Math.floor(index * legacyCurve.durationSeconds / layerCount),
      spawnEveryMs: Math.max(200, Math.round(wave.spawnEveryMs / (cadenceMultiplier * (plan.encounter.compositionWeights?.[roster[index]!] ?? 1)))),
      maxAlive: cappedAlive[index],
      };
    }),
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
