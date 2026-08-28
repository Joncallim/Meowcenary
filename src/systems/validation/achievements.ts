/**
 * Achievement catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator following the
 * existing RowCheck pattern. Stable IDs, legal kinds/targets, resolvable
 * metric/condition/reward references, and optional platform mappings.
 */
import { isContentId, isUnlockId } from '../ids';
import { validateProgressionCondition } from '../../gameplay/conditionValidation';
import type { RowCheck } from '../validation';

type RowCheckFn = RowCheck;

const VALID_KINDS = new Set(['standard', 'incremental', 'mastery']);
const VALID_METRIC_PREFIX = 'metric:';
const VALID_GRANT_TYPES = new Set([
  'grant-scrap', 'unlock-stage', 'unlock-character', 'unlock-equipment',
  'unlock-part', 'unlock-trait', 'grant-item', 'achievement-completed',
  'permanent-upgrade-level',
]);

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
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
      if (!isPositiveInteger(g.amount)) errors.push(`${path}.amount: must be a positive safe integer`);
      break;
    case 'unlock-stage':
      if (typeof g.stageId !== 'string' || !isUnlockId(g.stageId) || !g.stageId.startsWith('stage:')) errors.push(`${path}.stageId: must be a canonical stage ID`);
      break;
    case 'unlock-character':
      if (typeof g.characterId !== 'string' || !isUnlockId(g.characterId) || !g.characterId.startsWith('character:')) errors.push(`${path}.characterId: must be a canonical character ID`);
      break;
    case 'unlock-equipment':
      if (typeof g.equipmentId !== 'string' || !isUnlockId(g.equipmentId) || !g.equipmentId.startsWith('equipment:')) errors.push(`${path}.equipmentId: must be a canonical equipment ID`);
      break;
    case 'unlock-part':
      if (typeof g.partId !== 'string' || !isUnlockId(g.partId) || !g.partId.startsWith('part:')) errors.push(`${path}.partId: must be a canonical part ID`);
      break;
    case 'unlock-trait':
      if (typeof g.traitId !== 'string' || !isUnlockId(g.traitId) || !g.traitId.startsWith('trait:')) errors.push(`${path}.traitId: must be a canonical trait ID`);
      break;
    case 'grant-item':
      if (typeof g.itemId !== 'string' || !isUnlockId(g.itemId) || !g.itemId.startsWith('item:')) errors.push(`${path}.itemId: must be a canonical item ID`);
      if (g.amount !== undefined && !isPositiveInteger(g.amount)) errors.push(`${path}.amount: must be a positive safe integer when present`);
      break;
    case 'achievement-completed':
      if (typeof g.achievementId !== 'string' || !isUnlockId(g.achievementId) || !g.achievementId.startsWith('achievement:')) errors.push(`${path}.achievementId: must be a canonical achievement ID`);
      break;
    case 'permanent-upgrade-level':
      if (typeof g.upgradeId !== 'string' || !isContentId(g.upgradeId)) errors.push(`${path}.upgradeId: must be a valid content ID`);
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
    errors.push(...validateProgressionCondition(a.condition, 'condition'));
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

/** External mirrors are optional, but a configured platform identifier must
 * designate exactly one canonical local achievement. */
export function assertUniqueAchievementPlatformMappings(
  achievements: readonly { id: string; platform?: { gameCenterId?: string; googlePlayId?: string } }[],
): void {
  for (const key of ['gameCenterId', 'googlePlayId'] as const) {
    const seen = new Map<string, string>();
    for (const achievement of achievements) {
      const value = achievement.platform?.[key];
      if (!value) continue;
      const previous = seen.get(value);
      if (previous !== undefined) {
        throw new Error(`achievement.${achievement.id}: platform.${key} "${value}" already maps to ${previous}`);
      }
      seen.set(value, achievement.id);
    }
  }
}
