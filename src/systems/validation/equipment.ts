/**
 * Equipment catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator.
 */
import { EQUIPMENT_SLOTS, EQUIPMENT_TIERS, SET_BONUSES } from '../../gameplay/equipment';
import { RUN_UPGRADE_STAT_KEYS } from '../../gameplay/stats';
import { isUnlockId } from '../ids';
import type { RowCheck } from '../validation';

type RowCheckFn = RowCheck;

const STAT_KEYS = new Set<string>(RUN_UPGRADE_STAT_KEYS);
const KNOWN_SETS = new Set(Object.keys(SET_BONUSES));

/** Row-level check for a single EquipmentDefinition. */
export const checkEquipment: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const e = row as Record<string, unknown>;

  if (typeof e.id !== 'string' || !isUnlockId(e.id) || !e.id.startsWith('equipment:')) {
    errors.push('id: must be a valid unlock ID prefixed with "equipment:"');
  }
  if (typeof e.name !== 'string' || e.name.trim().length === 0) {
    errors.push('name: must be a non-empty string');
  }
  if (typeof e.setId !== 'string' || !KNOWN_SETS.has(e.setId)) {
    errors.push(`setId: must be a known set id (${[...KNOWN_SETS].join(', ')})`);
  }
  if (typeof e.slot !== 'string' || !EQUIPMENT_SLOTS.includes(e.slot as never)) {
    errors.push(`slot: must be one of ${EQUIPMENT_SLOTS.join(', ')}`);
  }
  if (typeof e.tier !== 'number' || !Number.isSafeInteger(e.tier) || e.tier < 1 || e.tier > EQUIPMENT_TIERS.length) {
    errors.push(`tier: must be a safe integer 1-${EQUIPMENT_TIERS.length}`);
  }

  if (!Array.isArray(e.effects)) {
    errors.push('effects: must be an array');
  } else {
    e.effects.forEach((effect, i) => {
      if (!effect || typeof effect !== 'object') {
        errors.push(`effects[${i}]: must be an object`);
        return;
      }
      const m = effect as Record<string, unknown>;
      if (typeof m.stat !== 'string' || !STAT_KEYS.has(m.stat)) errors.push(`effects[${i}].stat: invalid stat`);
      if (m.op !== 'add' && m.op !== 'mult') errors.push(`effects[${i}].op: must be add or mult`);
      if (typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value === 0) errors.push(`effects[${i}].value: must be a non-zero finite number`);
      if (typeof m.sourceId !== 'string' || m.sourceId.length === 0) errors.push(`effects[${i}].sourceId: must be a non-empty string`);
    });
  }

  return errors;
};

/** Cross-catalog assertion: effect sourceIds equal the owning piece id. */
export function assertEquipmentEffectSources(
  pieces: readonly { id: string; effects: readonly { sourceId: string }[] }[],
): void {
  for (const piece of pieces) {
    for (const effect of piece.effects) {
      if (effect.sourceId !== piece.id) {
        throw new Error(`equipment.${piece.id}: effect sourceId "${effect.sourceId}" must equal the piece id`);
      }
    }
  }
}
