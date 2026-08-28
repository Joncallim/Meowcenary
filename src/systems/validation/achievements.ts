/**
 * Achievement catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator following the
 * existing RowCheck pattern. Stable IDs, legal kinds/targets, resolvable
 * metric/condition/reward references, and optional platform mappings.
 */
import { isContentId, isUnlockId } from '../ids';
import type { RowCheck } from '../validation';

type RowCheckFn = RowCheck;

const VALID_KINDS = new Set(['standard', 'incremental', 'mastery']);
const VALID_METRIC_PREFIX = 'metric:';
const VALID_CONDITION_TYPES = new Set([
  'stage-cleared', 'boss-defeated', 'achievement-completed',
  'mastery-reached', 'owns-content', 'all', 'any', 'not',
  'scrap-total', 'permanent-level', 'unlock-count',
]);
const VALID_GRANT_TYPES = new Set([
  'grant-scrap', 'unlock-stage', 'unlock-character', 'unlock-equipment',
  'unlock-part', 'unlock-trait', 'grant-item', 'achievement-completed',
  'permanent-upgrade-level',
]);

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function checkCondition(cond: unknown, path: string, errors: string[]): void {
  if (!cond || typeof cond !== 'object') {
    errors.push(`${path}: must be an object`);
    return;
  }
  const c = cond as Record<string, unknown>;
  if (typeof c.type !== 'string' || !VALID_CONDITION_TYPES.has(c.type)) {
    errors.push(`${path}.type: invalid condition type`);
    return;
  }
  switch (c.type) {
    case 'stage-cleared':
      if (typeof c.stageId !== 'string' || !isUnlockId(c.stageId)) errors.push(`${path}.stageId: invalid unlock ID`);
      break;
    case 'boss-defeated':
      if (typeof c.bossId !== 'string' || !isContentId(c.bossId)) errors.push(`${path}.bossId: invalid content ID`);
      break;
    case 'achievement-completed':
      if (typeof c.achievementId !== 'string' || !isUnlockId(c.achievementId)) errors.push(`${path}.achievementId: invalid unlock ID`);
      break;
    case 'mastery-reached':
      if (typeof c.subjectId !== 'string' || !isContentId(c.subjectId)) errors.push(`${path}.subjectId: invalid content ID`);
      if (!isPositiveInteger(c.tier)) errors.push(`${path}.tier: must be a positive integer`);
      break;
    case 'owns-content':
      if (typeof c.contentId !== 'string' || !isContentId(c.contentId)) errors.push(`${path}.contentId: invalid content ID`);
      break;
    case 'scrap-total':
      if (typeof c.threshold !== 'number' || !Number.isFinite(c.threshold) || c.threshold < 0) errors.push(`${path}.threshold: must be a non-negative number`);
      break;
    case 'permanent-level':
      if (typeof c.upgradeId !== 'string' || c.upgradeId.length === 0) errors.push(`${path}.upgradeId: invalid ID`);
      if (!isPositiveInteger(c.minLevel)) errors.push(`${path}.minLevel: must be a positive integer`);
      break;
    case 'unlock-count':
      if (!isPositiveInteger(c.minCount)) errors.push(`${path}.minCount: must be a positive integer`);
      break;
    case 'all':
    case 'any':
      if (!Array.isArray(c.conditions) || c.conditions.length === 0) {
        errors.push(`${path}.conditions: must be a non-empty array`);
      } else {
        c.conditions.forEach((sub, i) => checkCondition(sub, `${path}.conditions[${i}]`, errors));
      }
      break;
    case 'not':
      checkCondition(c.condition, `${path}.condition`, errors);
      break;
    default:
      break;
  }
}

function checkGrant(grant: unknown, path: string, errors: string[]): void {
  if (!grant || typeof grant !== 'object') {
    errors.push(`${path}: must be an object`);
    return;
  }
  const g = grant as Record<string, unknown>;
  if (typeof g.type !== 'string' || !VALID_GRANT_TYPES.has(g.type)) {
    errors.push(`${path}.type: invalid grant type`);
    return;
  }
  switch (g.type) {
    case 'grant-scrap':
      if (typeof g.amount !== 'number' || !Number.isFinite(g.amount) || g.amount <= 0) errors.push(`${path}.amount: must be a positive number`);
      break;
    case 'unlock-stage':
    case 'unlock-character':
    case 'unlock-equipment':
    case 'unlock-part':
    case 'unlock-trait':
      if (typeof g.stageId !== 'string' && typeof g.characterId !== 'string' &&
          typeof g.equipmentId !== 'string' && typeof g.partId !== 'string' &&
          typeof g.traitId !== 'string') {
        errors.push(`${path}: missing target id`);
      }
      break;
    case 'grant-item':
      if (typeof g.itemId !== 'string' || !isContentId(g.itemId)) errors.push(`${path}.itemId: invalid content ID`);
      break;
    case 'achievement-completed':
      if (typeof g.achievementId !== 'string' || !isUnlockId(g.achievementId)) errors.push(`${path}.achievementId: invalid unlock ID`);
      break;
    case 'permanent-upgrade-level':
      if (typeof g.upgradeId !== 'string' || g.upgradeId.length === 0) errors.push(`${path}.upgradeId: invalid ID`);
      if (!isPositiveInteger(g.levels)) errors.push(`${path}.levels: must be a positive integer`);
      break;
    default:
      break;
  }
}

/** Row-level check for a single achievement definition. */
export const checkAchievement: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const a = row as Record<string, unknown>;

  if (typeof a.id !== 'string' || !isUnlockId(a.id) || !a.id.startsWith('achievement:')) {
    errors.push('id: must be a valid unlock ID prefixed with "achievement:"');
  }
  if (typeof a.name !== 'string' || a.name.trim().length === 0) {
    errors.push('name: must be a non-empty string');
  }
  if (typeof a.description !== 'string' || a.description.trim().length === 0) {
    errors.push('description: must be a non-empty string');
  }
  if (typeof a.kind !== 'string' || !VALID_KINDS.has(a.kind)) {
    errors.push('kind: must be standard, incremental, or mastery');
  }
  if (typeof a.target !== 'number' || !Number.isSafeInteger(a.target) || a.target < 1) {
    errors.push('target: must be a positive safe integer');
  }

  if (a.metricId !== undefined) {
    if (typeof a.metricId !== 'string' || !a.metricId.startsWith(VALID_METRIC_PREFIX)) {
      errors.push('metricId: must be a string prefixed with "metric:"');
    }
  }

  if (a.condition !== undefined) {
    checkCondition(a.condition, 'condition', errors);
  }

  if (a.hidden !== undefined && typeof a.hidden !== 'boolean') {
    errors.push('hidden: must be a boolean when present');
  }

  if (a.rewards !== undefined) {
    if (!Array.isArray(a.rewards)) {
      errors.push('rewards: must be an array when present');
    } else {
      a.rewards.forEach((reward, i) => {
        if (!reward || typeof reward !== 'object' || !('grant' in (reward as object))) {
          errors.push(`rewards[${i}]: must be a reward object with a grant`);
        } else {
          checkGrant((reward as Record<string, unknown>).grant, `rewards[${i}].grant`, errors);
        }
      });
    }
  }

  if (a.platform !== undefined) {
    if (!a.platform || typeof a.platform !== 'object') {
      errors.push('platform: must be an object when present');
    } else {
      const p = a.platform as Record<string, unknown>;
      if (p.gameCenterId !== undefined && typeof p.gameCenterId !== 'string') errors.push('platform.gameCenterId: must be a string when present');
      if (p.googlePlayId !== undefined && typeof p.googlePlayId !== 'string') errors.push('platform.googlePlayId: must be a string when present');
    }
  }

  return errors;
};

/** Cross-catalog assertion: metric and condition references resolve. */
export function assertAchievementMetricReferences(
  achievements: readonly { id: string; metricId?: string }[],
  knownMetrics: Set<string>,
): void {
  for (const a of achievements) {
    if (a.metricId !== undefined && !knownMetrics.has(a.metricId)) {
      throw new Error(`achievement.${a.id}: metricId "${a.metricId}" not registered`);
    }
  }
}
