/**
 * Ability catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator.
 */
import { RUN_UPGRADE_STAT_KEYS } from '../../gameplay/stats';
import { isUnlockId } from '../ids';
import type { RowCheck } from '../validation';

type RowCheckFn = RowCheck;

const VALID_EFFECT_KINDS = new Set([
  'knockback', 'stat-burst', 'invulnerable', 'heal', 'elemental-burst', 'loot-pulse',
]);
const STAT_KEYS = new Set<string>(RUN_UPGRADE_STAT_KEYS);

/** Row-level check for a single AbilityDefinition. */
export const checkAbility: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const a = row as Record<string, unknown>;

  if (typeof a.id !== 'string' || !isUnlockId(a.id) || !a.id.startsWith('ability:')) {
    errors.push('id: must be a valid unlock ID prefixed with "ability:"');
  }
  if (typeof a.name !== 'string' || a.name.trim().length === 0) {
    errors.push('name: must be a non-empty string');
  }
  if (typeof a.description !== 'string' || a.description.trim().length === 0) {
    errors.push('description: must be a non-empty string');
  }
  if (typeof a.cooldownMs !== 'number' || !Number.isFinite(a.cooldownMs) || a.cooldownMs <= 0) {
    errors.push('cooldownMs: must be a positive finite number');
  }
  if (typeof a.durationMs !== 'number' || !Number.isFinite(a.durationMs) || a.durationMs < 0) {
    errors.push('durationMs: must be a non-negative finite number');
  }

  const effect = a.effect as Record<string, unknown> | undefined;
  if (!effect || typeof effect !== 'object') {
    errors.push('effect: must be an object');
    return errors;
  }
  if (typeof effect.kind !== 'string' || !VALID_EFFECT_KINDS.has(effect.kind)) {
    errors.push(`effect.kind: must be one of ${[...VALID_EFFECT_KINDS].join(', ')}`);
    return errors;
  }
  switch (effect.kind) {
    case 'knockback':
      if (typeof effect.radius !== 'number' || effect.radius <= 0) errors.push('effect.radius: must be positive');
      if (typeof effect.power !== 'number' || effect.power <= 0) errors.push('effect.power: must be positive');
      break;
    case 'stat-burst': {
      if (!Array.isArray(effect.modifiers)) {
        errors.push('effect.modifiers: must be an array');
        break;
      }
      effect.modifiers.forEach((m, i) => {
        if (!m || typeof m !== 'object') {
          errors.push(`effect.modifiers[${i}]: must be an object`);
          return;
        }
        const mod = m as Record<string, unknown>;
        if (typeof mod.stat !== 'string' || !STAT_KEYS.has(mod.stat)) errors.push(`effect.modifiers[${i}].stat: invalid stat`);
        if (mod.op !== 'add' && mod.op !== 'mult') errors.push(`effect.modifiers[${i}].op: must be add or mult`);
        if (typeof mod.value !== 'number' || !Number.isFinite(mod.value)) errors.push(`effect.modifiers[${i}].value: must be finite`);
      });
      break;
    }
    case 'heal':
      if (typeof effect.amount !== 'number' || effect.amount <= 0) errors.push('effect.amount: must be positive');
      break;
    case 'elemental-burst':
      if (typeof effect.radius !== 'number' || effect.radius <= 0) errors.push('effect.radius: must be positive');
      if (typeof effect.power !== 'number' || effect.power <= 0) errors.push('effect.power: must be positive');
      if (typeof effect.trait !== 'string' || effect.trait.length === 0) errors.push('effect.trait: must be a trait id');
      break;
    case 'loot-pulse':
      if (typeof effect.radius !== 'number' || effect.radius <= 0) errors.push('effect.radius: must be positive');
      break;
    default:
      break;
  }

  return errors;
};
