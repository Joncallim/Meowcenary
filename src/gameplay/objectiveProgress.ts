/**
 * Pure objective progress helpers — kill, collect, survive, defeat.
 * Alpha 3 architecture §3.4: objective completion exactly once, cannot double-bank.
 *
 * These are pure functions: they take the current progress and event data,
 * return the new progress. No side effects, no I/O, no Phaser.
 */
import type { ObjectiveType, ObjectiveProgress } from '../gameplay/stage/stageContracts';

/**
 * Creates initial objective progress for a given objective definition.
 */
export function createObjectiveProgress(objective: ObjectiveType): ObjectiveProgress {
  const target = computeTarget(objective);
  return Object.freeze({
    type: objective.type,
    current: 0,
    target,
  });
}

function computeTarget(objective: ObjectiveType): number {
  switch (objective.type) {
    case 'kill': return objective.count;
    case 'collect': return objective.count;
    case 'survive': return objective.seconds;
    case 'defeat': return 1;
  }
}

/**
 * Records a kill. Returns updated progress (new frozen object) or the same
 * reference if no change (already complete or wrong objective type).
 */
export function recordKill(
  progress: ObjectiveProgress,
  enemyArchetype?: string,
  enemyTag?: string,
): ObjectiveProgress {
  if (progress.type !== 'kill') return progress;
  if (progress.current >= progress.target) return progress;

  // If a tag filter is active, only count matching kills
  // (enemyTag is stored on the objective definition, not progress;
  //  the caller provides the archetype for matching)
  if (enemyTag !== undefined && enemyArchetype !== enemyTag) return progress;

  const next = progress.current + 1;
  if (next > progress.target) return progress;
  return Object.freeze({ ...progress, current: next });
}

/**
 * Records a collection event. Returns updated progress or same reference if
 * no change (wrong type, already complete, or wrong item).
 */
export function recordCollect(
  progress: ObjectiveProgress,
  collectedItemId: string,
  requiredItemId: string,
): ObjectiveProgress {
  if (progress.type !== 'collect') return progress;
  if (progress.current >= progress.target) return progress;
  if (collectedItemId !== requiredItemId) return progress;

  const next = progress.current + 1;
  if (next > progress.target) return progress;
  return Object.freeze({ ...progress, current: next });
}

/**
 * Advances a survive timer. Returns updated progress or same reference.
 */
export function tickSurvive(
  progress: ObjectiveProgress,
  deltaMs: number,
): ObjectiveProgress {
  if (progress.type !== 'survive') return progress;
  if (progress.current >= progress.target) return progress;

  const deltaSeconds = deltaMs / 1000;
  const next = Math.min(progress.target, progress.current + deltaSeconds);
  if (next === progress.current) return progress;
  return Object.freeze({ ... progress, current: next });
}

/**
 * Records a boss/elite defeat. Returns updated progress or same reference.
 */
export function recordDefeat(
  progress: ObjectiveProgress,
  defeatedEnemyId: string,
  requiredEnemyId: string,
): ObjectiveProgress {
  if (progress.type !== 'defeat') return progress;
  if (progress.current >= progress.target) return progress;
  if (defeatedEnemyId !== requiredEnemyId) return progress;

  return Object.freeze({ ...progress, current: 1 });
}

/**
 * Returns true if the objective is completed (current >= target).
 */
export function isObjectiveComplete(progress: ObjectiveProgress): boolean {
  return progress.current >= progress.target;
}

/**
 * Returns a human-readable description of the objective.
 */
export function describeObjective(objective: ObjectiveType): string {
  switch (objective.type) {
    case 'kill': {
      const tag = objective.enemyTag ? ` ${objective.enemyTag}` : '';
      return `Defeat ${objective.count}${tag} enemies`;
    }
    case 'collect':
      return `Collect ${objective.count} ${objective.itemId}`;
    case 'survive':
      return `Survive ${objective.seconds} seconds`;
    case 'defeat':
      return `Defeat ${objective.enemyId}`;
  }
}
