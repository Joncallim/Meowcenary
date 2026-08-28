/** Shared structural validator for the cross-domain condition vocabulary.
 * Catalog validators call this rather than maintaining subtly different ID
 * rules. Evaluation remains in conditionEvaluator.ts. */
import { isContentId, isUnlockId } from '../systems/ids';

const CONDITION_TYPES = new Set([
  'stage-cleared', 'boss-defeated', 'achievement-completed', 'mastery-reached',
  'owns-content', 'all', 'any', 'not', 'scrap-total', 'permanent-level', 'unlock-count',
]);

const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
const canonical = (value: unknown, prefix: string): value is string => typeof value === 'string' && isUnlockId(value) && value.startsWith(prefix);

export function validateProgressionCondition(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (value === null || typeof value !== 'object') return [`${path}: must be a condition object`];
  const condition = value as Record<string, unknown>;
  if (typeof condition.type !== 'string' || !CONDITION_TYPES.has(condition.type)) {
    return [`${path}.type: must be a valid condition type`];
  }
  switch (condition.type) {
    case 'stage-cleared':
      if (!canonical(condition.stageId, 'stage:')) errors.push(`${path}.stageId: must be a canonical stage ID`);
      break;
    case 'boss-defeated':
      if (typeof condition.bossId !== 'string' || !isContentId(condition.bossId)) errors.push(`${path}.bossId: must be a valid content ID`);
      break;
    case 'achievement-completed':
      if (!canonical(condition.achievementId, 'achievement:')) errors.push(`${path}.achievementId: must be a canonical achievement ID`);
      break;
    case 'mastery-reached':
      if (typeof condition.subjectId !== 'string' || !isContentId(condition.subjectId)) errors.push(`${path}.subjectId: must be a valid content ID`);
      if (!positiveInteger(condition.tier)) errors.push(`${path}.tier: must be a positive safe integer`);
      break;
    case 'owns-content':
      if (typeof condition.contentId !== 'string' || !isUnlockId(condition.contentId)) errors.push(`${path}.contentId: must be a canonical unlock ID`);
      break;
    case 'scrap-total':
      if (!Number.isSafeInteger(condition.threshold) || (condition.threshold as number) < 0) errors.push(`${path}.threshold: must be a non-negative safe integer`);
      break;
    case 'permanent-level':
      if (typeof condition.upgradeId !== 'string' || !isContentId(condition.upgradeId)) errors.push(`${path}.upgradeId: must be a valid content ID`);
      if (!positiveInteger(condition.minLevel)) errors.push(`${path}.minLevel: must be a positive safe integer`);
      break;
    case 'unlock-count':
      if (!Number.isSafeInteger(condition.minCount) || (condition.minCount as number) < 0) errors.push(`${path}.minCount: must be a non-negative safe integer`);
      break;
    case 'all':
    case 'any':
      if (!Array.isArray(condition.conditions) || condition.conditions.length === 0) {
        errors.push(`${path}.conditions: must be a non-empty array`);
      } else {
        condition.conditions.forEach((child, index) => errors.push(...validateProgressionCondition(child, `${path}.conditions[${index}]`)));
      }
      break;
    case 'not':
      errors.push(...validateProgressionCondition(condition.condition, `${path}.condition`));
      break;
  }
  return errors;
}
