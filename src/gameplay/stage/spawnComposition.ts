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
  if (legacyCurve.waves.length === 0) throw new Error(`Spawn curve "${legacyCurve.id}" has no waves`);
  const cadenceMultiplier = 1 + plan.difficulty.spawnPressure;
  const aliveMultiplier = 1 + plan.difficulty.spawnPressure;
  // One layer per canonical enemy means SpawnDirector's per-enemy active cap
  // cannot be bypassed by duplicate weighted rows. Weights change cadence,
  // not identity multiplicity, and every authored archetype gets a layer.
  const layerCount = roster.length;
  const candidates = Array.from({ length: layerCount }, (_, index) => {
    const wave = legacyCurve.waves[projectedWaveIndex(index, layerCount, legacyCurve.waves.length)]!;
    return Math.max(1, Math.ceil(wave.maxAlive * aliveMultiplier));
  });
  const cappedAlive = capActiveCounts(candidates);
  return deepFreeze({
    ...structuredClone(legacyCurve),
    waves: Array.from({ length: layerCount }, (_, index) => {
      const wave = legacyCurve.waves[projectedWaveIndex(index, layerCount, legacyCurve.waves.length)]!;
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

/** Resample the complete source pressure shape over an arbitrary roster.
 * Endpoints stay endpoints and intermediate layers share their nearest source
 * role; late support can therefore never wrap back to the opening swarm. */
function projectedWaveIndex(layerIndex: number, layerCount: number, sourceCount: number): number {
  if (layerCount <= 1 || sourceCount <= 1) return 0;
  return Math.round(layerIndex * (sourceCount - 1) / (layerCount - 1));
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
