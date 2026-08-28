/**
 * Stage catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator following
 * the existing RowCheck pattern.
 */
import type { StageDefinition, EncounterProfile, RewardProfile } from '../../gameplay/stage/stageContracts';
import { isContentId, isUnlockId } from '../ids';
import { validateProgressionCondition } from '../../gameplay/conditionValidation';
import { isValidProgressionGrant, type ProgressionGrant } from '../../gameplay/grantProcessor';
import type { RowCheck } from '../validation';

// Re-exported for use by this module's public API.
type RowCheckFn = RowCheck;

const VALID_OBJECTIVE_TYPES = new Set(['kill', 'collect', 'survive', 'defeat']);

/** Row-level check for a single StageDefinition. */
export const checkStage: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const s = row as Record<string, unknown>;

  // id
  if (typeof s.id !== 'string' || !isUnlockId(s.id) || !s.id.startsWith('stage:')) {
    errors.push('id: must be a valid unlock ID (e.g. stage:junkyard-01)');
  }
  if (typeof s.name !== 'string' || s.name.trim().length === 0) {
    errors.push('name: must be a non-empty string');
  }
  if (typeof s.chapterId !== 'string' || !isUnlockId(s.chapterId) || !s.chapterId.startsWith('chapter:')) {
    errors.push('chapterId: must be a valid unlock ID (e.g. chapter:junkyard)');
  }
  if (typeof s.displayOrder !== 'number' || !Number.isSafeInteger(s.displayOrder) || s.displayOrder < 1) {
    errors.push('displayOrder: must be a positive safe integer');
  }
  if (typeof s.arenaId !== 'string' || !isContentId(s.arenaId)) {
    errors.push('arenaId: must be a valid content ID');
  }
  if (typeof s.assetBundleId !== 'string' || !isUnlockId(s.assetBundleId) || !s.assetBundleId.startsWith('bundle:')) {
    errors.push('assetBundleId: must be a valid bundle ID');
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
  if (typeof s.encounterProfileId !== 'string' || !isUnlockId(s.encounterProfileId) || !s.encounterProfileId.startsWith('encounter:')) {
    errors.push('encounterProfileId: must be a valid unlock ID');
  }
  if (typeof s.difficultyProfileId !== 'string' || !isUnlockId(s.difficultyProfileId) || !s.difficultyProfileId.startsWith('difficulty:')) {
    errors.push('difficultyProfileId: must be a valid unlock ID');
  }
  if (typeof s.rewardProfileId !== 'string' || !isUnlockId(s.rewardProfileId) || !s.rewardProfileId.startsWith('reward:')) {
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
    const unlockErrors = validateProgressionCondition(s.unlock, 'unlock');
    errors.push(...unlockErrors);
  }

  return errors;
};

/** Row-level check for a single EncounterProfile. */
export const checkEncounterProfile: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const ep = row as Record<string, unknown>;

  if (typeof ep.id !== 'string' || !isUnlockId(ep.id) || !ep.id.startsWith('encounter:')) {
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
        if (!Array.isArray(ep.enemyIds) || !ep.enemyIds.includes(key)) {
          errors.push(`compositionWeights.${key}: must name an enemyId in the encounter roster`);
        }
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

  if (typeof dp.id !== 'string' || !isUnlockId(dp.id) || !dp.id.startsWith('difficulty:')) {
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

  if (typeof rp.id !== 'string' || !isUnlockId(rp.id) || !rp.id.startsWith('reward:')) {
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
  if (rp.grants !== undefined && (!Array.isArray(rp.grants) || !rp.grants.every(isValidProgressionGrant))) {
    errors.push('grants: must contain valid shared progression grants');
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

/** Every defeat objective must name a spawnable catalog enemy. Boss stages
 * additionally require the same identity in the encounter declaration. */
export function assertStageDefeatEnemyReferences(
  stages: readonly StageDefinition[],
  enemyIds: Set<string>,
): void {
  for (const stage of stages) {
    if (stage.objective.type === 'defeat' && !enemyIds.has(stage.objective.enemyId)) {
      throw new Error(`stage.${stage.id}: defeat objective enemyId "${stage.objective.enemyId}" not found in enemy catalog`);
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

/** Reward profiles are content, so durable owned-instance grants must resolve
 * to real definitions before any stage can issue them. */
export function assertStageRewardGrantReferences(
  rewards: readonly RewardProfile[],
  catalogs: {
    readonly partIds: Set<string>;
    readonly equipmentIds: Set<string>;
    readonly traitIds: Set<string>;
    readonly stageIds: Set<string>;
    readonly characterIds: Set<string>;
    readonly achievementIds: Set<string>;
    readonly metaUpgradeIds: Set<string>;
  },
): void {
  for (const reward of rewards) {
    for (const grant of reward.grants ?? []) {
      const checked = grant as ProgressionGrant;
      switch (checked.type) {
        case 'unlock-part':
        case 'grant-part-instance':
          if (!catalogs.partIds.has(checked.partId)) throw new Error(`reward.${reward.id}: part grant references unknown "${checked.partId}"`);
          break;
        case 'unlock-equipment':
        case 'grant-equipment-instance':
          if (!catalogs.equipmentIds.has(checked.equipmentId)) throw new Error(`reward.${reward.id}: equipment grant references unknown "${checked.equipmentId}"`);
          break;
        case 'unlock-trait':
          if (!catalogs.traitIds.has(checked.traitId)) throw new Error(`reward.${reward.id}: trait grant references unknown "${checked.traitId}"`);
          break;
        case 'unlock-stage':
          if (!catalogs.stageIds.has(checked.stageId)) throw new Error(`reward.${reward.id}: stage grant references unknown "${checked.stageId}"`);
          break;
        case 'unlock-character':
          if (!catalogs.characterIds.has(checked.characterId)) throw new Error(`reward.${reward.id}: character grant references unknown "${checked.characterId}"`);
          break;
        case 'achievement-completed':
          if (!catalogs.achievementIds.has(checked.achievementId)) throw new Error(`reward.${reward.id}: achievement grant references unknown "${checked.achievementId}"`);
          break;
        case 'permanent-upgrade-level':
          if (!catalogs.metaUpgradeIds.has(checked.upgradeId)) throw new Error(`reward.${reward.id}: upgrade grant references unknown "${checked.upgradeId}"`);
          break;
        case 'grant-item':
          throw new Error(`reward.${reward.id}: grant-item is unsupported without an item catalog`);
        default:
          break;
      }
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
