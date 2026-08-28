/**
 * Stage catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator following
 * the existing RowCheck pattern.
 */
import type { StageDefinition, EncounterProfile, RewardProfile } from '../../gameplay/stage/stageContracts';
import { isContentId, isUnlockId } from '../ids';
import type { RowCheck } from '../validation';

// Re-exported for use by this module's public API.
type RowCheckFn = RowCheck;

const VALID_OBJECTIVE_TYPES = new Set(['kill', 'collect', 'survive', 'defeat']);
const VALID_CONDITION_TYPES = new Set([
  'stage-cleared', 'boss-defeated', 'achievement-completed',
  'mastery-reached', 'owns-content', 'all', 'any', 'not',
  'scrap-total', 'permanent-level', 'unlock-count',
]);

/** Row-level check for a single StageDefinition. */
export const checkStage: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const s = row as Record<string, unknown>;

  // id
  if (typeof s.id !== 'string' || !isUnlockId(s.id)) {
    errors.push('id: must be a valid unlock ID (e.g. stage:junkyard-01)');
  }
  if (typeof s.name !== 'string' || s.name.trim().length === 0) {
    errors.push('name: must be a non-empty string');
  }
  if (typeof s.chapterId !== 'string' || !isUnlockId(s.chapterId)) {
    errors.push('chapterId: must be a valid unlock ID (e.g. chapter:junkyard)');
  }
  if (typeof s.displayOrder !== 'number' || !Number.isSafeInteger(s.displayOrder) || s.displayOrder < 1) {
    errors.push('displayOrder: must be a positive safe integer');
  }
  if (typeof s.arenaId !== 'string' || !isContentId(s.arenaId)) {
    errors.push('arenaId: must be a valid content ID');
  }

  // objective
  if (!s.objective || typeof s.objective !== 'object') {
    errors.push('objective: must be an object');
  } else {
    const obj = s.objective as Record<string, unknown>;
    if (typeof obj.type !== 'string' || !VALID_OBJECTIVE_TYPES.has(obj.type)) {
      errors.push('objective.type: must be one of kill, collect, survive, defeat');
    }
    const otype = obj.type as string;
    if (otype === 'kill') {
      if (typeof obj.count !== 'number' || !Number.isSafeInteger(obj.count) || obj.count < 1) {
        errors.push('objective.count: must be a positive safe integer for kill');
      }
      if (obj.enemyTag !== undefined && (typeof obj.enemyTag !== 'string' || obj.enemyTag.length === 0)) {
        errors.push('objective.enemyTag: must be a non-empty string when present');
      }
    } else if (otype === 'collect') {
      if (typeof obj.itemId !== 'string' || !isUnlockId(obj.itemId)) {
        errors.push('objective.itemId: must be a valid unlock ID for collect');
      }
      if (typeof obj.count !== 'number' || !Number.isSafeInteger(obj.count) || obj.count < 1) {
        errors.push('objective.count: must be a positive safe integer for collect');
      }
    } else if (otype === 'survive') {
      if (typeof obj.seconds !== 'number' || !Number.isSafeInteger(obj.seconds) || obj.seconds < 1) {
        errors.push('objective.seconds: must be a positive safe integer for survive');
      }
    } else if (otype === 'defeat') {
      if (typeof obj.enemyId !== 'string' || !isContentId(obj.enemyId)) {
        errors.push('objective.enemyId: must be a valid content ID for defeat');
      }
    }
  }

  // profile references
  if (typeof s.encounterProfileId !== 'string' || !isUnlockId(s.encounterProfileId)) {
    errors.push('encounterProfileId: must be a valid unlock ID');
  }
  if (typeof s.difficultyProfileId !== 'string' || !isUnlockId(s.difficultyProfileId)) {
    errors.push('difficultyProfileId: must be a valid unlock ID');
  }
  if (typeof s.rewardProfileId !== 'string' || !isUnlockId(s.rewardProfileId)) {
    errors.push('rewardProfileId: must be a valid unlock ID');
  }

  // optional bossId
  if (s.bossId !== undefined && (typeof s.bossId !== 'string' || !isContentId(s.bossId))) {
    errors.push('bossId: must be a valid content ID when present');
  }

  // unlock condition
  if (!s.unlock || typeof s.unlock !== 'object') {
    errors.push('unlock: must be a condition object');
  } else {
    const unlockErrors = validateConditionRecursive(s.unlock as Record<string, unknown>, 'unlock');
    errors.push(...unlockErrors);
  }

  return errors;
};

function validateConditionRecursive(
  cond: Record<string, unknown>,
  path: string,
): string[] {
  const errors: string[] = [];
  if (typeof cond.type !== 'string' || !VALID_CONDITION_TYPES.has(cond.type)) {
    errors.push(`${path}.type: must be a valid condition type`);
    return errors;
  }

  const ctype = cond.type as string;
  switch (ctype) {
    case 'stage-cleared':
      if (typeof cond.stageId !== 'string' || !isUnlockId(cond.stageId)) {
        errors.push(`${path}.stageId: must be a valid unlock ID`);
      }
      break;
    case 'boss-defeated':
      if (typeof cond.bossId !== 'string' || !isContentId(cond.bossId)) {
        errors.push(`${path}.bossId: must be a valid content ID`);
      }
      break;
    case 'achievement-completed':
      if (typeof cond.achievementId !== 'string' || !isUnlockId(cond.achievementId)) {
        errors.push(`${path}.achievementId: must be a valid unlock ID`);
      }
      break;
    case 'mastery-reached':
      if (typeof cond.subjectId !== 'string' || !isContentId(cond.subjectId)) {
        errors.push(`${path}.subjectId: must be a valid content ID`);
      }
      if (typeof cond.tier !== 'number' || !Number.isSafeInteger(cond.tier) || cond.tier < 1) {
        errors.push(`${path}.tier: must be a positive safe integer`);
      }
      break;
    case 'owns-content':
      if (typeof cond.contentId !== 'string' || !isUnlockId(cond.contentId)) {
        errors.push(`${path}.contentId: must be a valid unlock ID`);
      }
      break;
    case 'scrap-total':
      if (typeof cond.threshold !== 'number' || !Number.isSafeInteger(cond.threshold) || cond.threshold < 0) {
        errors.push(`${path}.threshold: must be a non-negative safe integer`);
      }
      break;
    case 'permanent-level':
      if (typeof cond.upgradeId !== 'string' || !isContentId(cond.upgradeId)) {
        errors.push(`${path}.upgradeId: must be a valid content ID`);
      }
      if (typeof cond.minLevel !== 'number' || !Number.isSafeInteger(cond.minLevel) || cond.minLevel < 1) {
        errors.push(`${path}.minLevel: must be a positive safe integer`);
      }
      break;
    case 'unlock-count':
      if (typeof cond.minCount !== 'number' || !Number.isSafeInteger(cond.minCount) || cond.minCount < 0) {
        errors.push(`${path}.minCount: must be a non-negative safe integer`);
      }
      break;
    case 'all':
    case 'any': {
      if (!Array.isArray(cond.conditions)) {
        errors.push(`${path}.conditions: must be an array`);
      } else {
        for (let i = 0; i < cond.conditions.length; i++) {
          const sub = cond.conditions[i];
          if (!sub || typeof sub !== 'object') {
            errors.push(`${path}.conditions[${i}]: must be a condition object`);
          } else {
            errors.push(...validateConditionRecursive(sub as Record<string, unknown>, `${path}.conditions[${i}]`));
          }
        }
      }
      break;
    }
    case 'not': {
      if (!cond.condition || typeof cond.condition !== 'object') {
        errors.push(`${path}.condition: must be a condition object`);
      } else {
        errors.push(...validateConditionRecursive(cond.condition as Record<string, unknown>, `${path}.condition`));
      }
      break;
    }
  }

  return errors;
}

/** Row-level check for a single EncounterProfile. */
export const checkEncounterProfile: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const ep = row as Record<string, unknown>;

  if (typeof ep.id !== 'string' || !isUnlockId(ep.id)) {
    errors.push('id: must be a valid unlock ID');
  }
  if (!Array.isArray(ep.enemyIds)) {
    errors.push('enemyIds: must be an array');
  } else {
    for (let i = 0; i < ep.enemyIds.length; i++) {
      if (typeof ep.enemyIds[i] !== 'string' || !isContentId(ep.enemyIds[i])) {
        errors.push(`enemyIds[${i}]: must be a valid content ID`);
      }
    }
    if (ep.enemyIds.length === 0) {
      errors.push('enemyIds: must contain at least one enemy');
    }
  }
  if (ep.compositionWeights !== undefined) {
    if (!ep.compositionWeights || typeof ep.compositionWeights !== 'object') {
      errors.push('compositionWeights: must be an object when present');
    } else {
      const weights = ep.compositionWeights as Record<string, unknown>;
      for (const key of Object.keys(weights)) {
        if (typeof weights[key] !== 'number' || (weights[key] as number) <= 0 || !Number.isSafeInteger(weights[key])) {
          errors.push(`compositionWeights.${key}: must be a positive safe integer`);
        }
      }
    }
  }
  // Epic 21: optional boss composition (boss milestone stages).
  if (ep.bossId !== undefined && (typeof ep.bossId !== 'string' || !isContentId(ep.bossId))) {
    errors.push('bossId: must be a valid content ID when present');
  }

  return errors;
};

/** Row-level check for a single DifficultyProfile. */
export const checkDifficultyProfile: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const dp = row as Record<string, unknown>;

  if (typeof dp.id !== 'string' || !isUnlockId(dp.id)) {
    errors.push('id: must be a valid unlock ID');
  }
  if (typeof dp.healthMultiplier !== 'number' || dp.healthMultiplier <= 0) {
    errors.push('healthMultiplier: must be a positive number');
  }
  if (typeof dp.damageMultiplier !== 'number' || dp.damageMultiplier <= 0) {
    errors.push('damageMultiplier: must be a positive number');
  }
  if (typeof dp.speedMultiplier !== 'number' || dp.speedMultiplier <= 0) {
    errors.push('speedMultiplier: must be a positive number');
  }
  if (typeof dp.spawnPressure !== 'number' || dp.spawnPressure < 0 || dp.spawnPressure > 1) {
    errors.push('spawnPressure: must be a number between 0 and 1');
  }

  return errors;
};

/** Row-level check for a single RewardProfile. */
export const checkRewardProfile: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const rp = row as Record<string, unknown>;

  if (typeof rp.id !== 'string' || !isUnlockId(rp.id)) {
    errors.push('id: must be a valid unlock ID');
  }
  if (typeof rp.scrapBase !== 'number' || !Number.isSafeInteger(rp.scrapBase) || rp.scrapBase < 0) {
    errors.push('scrapBase: must be a non-negative safe integer');
  }
  if (typeof rp.scrapPerMinute !== 'number' || !Number.isSafeInteger(rp.scrapPerMinute) || rp.scrapPerMinute < 0) {
    errors.push('scrapPerMinute: must be a non-negative safe integer');
  }
  if (rp.lootTableId !== undefined && (typeof rp.lootTableId !== 'string' || !isContentId(rp.lootTableId))) {
    errors.push('lootTableId: must be a valid content ID when present');
  }

  return errors;
};

// ── Cross-catalog assertions ──────────────────────────────────────────

export function assertStageArenaReferences(
  stages: readonly StageDefinition[],
  arenaIds: Set<string>,
): void {
  for (const stage of stages) {
    if (!arenaIds.has(stage.arenaId)) {
      throw new Error(`stage.${stage.id}: arenaId "${stage.arenaId}" not found in arena catalog`);
    }
  }
}

export function assertStageEncounterReferences(
  stages: readonly StageDefinition[],
  encounterProfileIds: Set<string>,
): void {
  for (const stage of stages) {
    if (!encounterProfileIds.has(stage.encounterProfileId)) {
      throw new Error(`stage.${stage.id}: encounterProfileId "${stage.encounterProfileId}" not found`);
    }
  }
}

export function assertStageDifficultyReferences(
  stages: readonly StageDefinition[],
  difficultyProfileIds: Set<string>,
): void {
  for (const stage of stages) {
    if (!difficultyProfileIds.has(stage.difficultyProfileId)) {
      throw new Error(`stage.${stage.id}: difficultyProfileId "${stage.difficultyProfileId}" not found`);
    }
  }
}

export function assertStageRewardReferences(
  stages: readonly StageDefinition[],
  rewardProfileIds: Set<string>,
): void {
  for (const stage of stages) {
    if (!rewardProfileIds.has(stage.rewardProfileId)) {
      throw new Error(`stage.${stage.id}: rewardProfileId "${stage.rewardProfileId}" not found`);
    }
  }
}

export function assertStageEncounterEnemyReferences(
  encounterProfiles: readonly EncounterProfile[],
  enemyIds: Set<string>,
): void {
  for (const ep of encounterProfiles) {
    for (const eid of ep.enemyIds) {
      if (!enemyIds.has(eid)) {
        throw new Error(`encounterProfile.${ep.id}: enemyId "${eid}" not found in enemy catalog`);
      }
    }
    // Epic 21: boss composition must reference a real boss archetype enemy.
    if (ep.bossId !== undefined && !enemyIds.has(ep.bossId)) {
      throw new Error(`encounterProfile.${ep.id}: bossId "${ep.bossId}" not found in enemy catalog`);
    }
  }
}

/** Boss milestone semantics are one identity end-to-end: stage declaration,
 * defeat objective and resolved encounter must name the same enemy. */
export function assertBossStageSemantics(
  stages: readonly StageDefinition[],
  encounters: readonly EncounterProfile[],
): void {
  const byId = new Map(encounters.map((encounter) => [encounter.id, encounter]));
  for (const stage of stages) {
    if (stage.bossId === undefined) continue;
    const encounter = byId.get(stage.encounterProfileId);
    if (stage.objective.type !== 'defeat' || stage.objective.enemyId !== stage.bossId || encounter?.bossId !== stage.bossId) {
      throw new Error(`stage.${stage.id}: bossId, defeat objective and encounter bossId must match`);
    }
  }
}

export function assertStageRewardLootTableReferences(
  rewardProfiles: readonly RewardProfile[],
  lootTableIds: Set<string>,
): void {
  for (const rp of rewardProfiles) {
    if (rp.lootTableId !== undefined && !lootTableIds.has(rp.lootTableId)) {
      throw new Error(`rewardProfile.${rp.id}: lootTableId "${rp.lootTableId}" not found`);
    }
  }
}

export function assertStageUnlockReferences(
  stages: readonly StageDefinition[],
  stageIds: Set<string>,
): void {
  // All unlock condition stageId references must point to real stages
  for (const stage of stages) {
    collectConditionStageRefs(stage.unlock as Record<string, unknown>, stageIds, stage.id);
  }
}

function collectConditionStageRefs(
  cond: Record<string, unknown>,
  stageIds: Set<string>,
  sourceStageId: string,
): void {
  const ctype = cond.type as string;
  if (ctype === 'stage-cleared') {
    const stageId = cond.stageId as string;
    if (!stageIds.has(stageId)) {
      throw new Error(`stage.${sourceStageId}: unlock references unknown stage "${stageId}"`);
    }
  } else if (ctype === 'all' || ctype === 'any') {
    const conditions = cond.conditions as readonly Record<string, unknown>[];
    for (const sub of conditions) {
      collectConditionStageRefs(sub, stageIds, sourceStageId);
    }
  } else if (ctype === 'not') {
    collectConditionStageRefs(cond.condition as Record<string, unknown>, stageIds, sourceStageId);
  }
}
