/**
 * Gun-part catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator following the
 * existing RowCheck pattern.
 */
import { PART_SLOTS, BEHAVIOR_TRAITS, MAX_EFFECTIVE_TRAITS_PER_PART } from '../../gameplay/gunsmith';
import { WEAPON_MODIFIER_STAT_KEYS } from '../../gameplay/stats';
import { isUnlockId } from '../ids';
import { validateProgressionCondition } from '../../gameplay/conditionValidation';
import type { VisualArtCatalog } from '../types';
import type { RewardProfile } from '../types';
import type { RowCheck } from '../validation';

type RowCheckFn = RowCheck;

const VALID_RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const STAT_KEYS = new Set<string>(WEAPON_MODIFIER_STAT_KEYS);

/** Row-level check for a single PartDefinition. */
export const checkPart: RowCheckFn = (row: unknown, _index: number): string[] => {
  const errors: string[] = [];
  if (!row || typeof row !== 'object') return ['not an object'];
  const p = row as Record<string, unknown>;

  if (typeof p.id !== 'string' || !isUnlockId(p.id) || !p.id.startsWith('part:')) {
    errors.push('id: must be a valid unlock ID prefixed with "part:"');
  }
  if (typeof p.name !== 'string' || p.name.trim().length === 0) {
    errors.push('name: must be a non-empty string');
  }
  if (typeof p.slot !== 'string' || !PART_SLOTS.includes(p.slot as never)) {
    errors.push(`slot: must be one of ${PART_SLOTS.join(', ')}`);
  }
  if (typeof p.rarity !== 'string' || !VALID_RARITIES.has(p.rarity)) {
    errors.push('rarity: must be common, uncommon, rare, epic, or legendary');
  }
  if (p.tier !== undefined) errors.push('tier: retired; owned instances carry tier');
  if (!p.presentation || typeof p.presentation !== 'object' || Array.isArray(p.presentation)
      || typeof (p.presentation as Record<string, unknown>).iconArtId !== 'string') {
    errors.push('presentation.iconArtId: required canonical visual-art ID');
  }

  if (!Array.isArray(p.effects)) {
    errors.push('effects: must be an array');
  } else {
    p.effects.forEach((effect, i) => {
      if (!effect || typeof effect !== 'object') {
        errors.push(`effects[${i}]: must be an object`);
        return;
      }
      const e = effect as Record<string, unknown>;
      if (typeof e.stat !== 'string' || !STAT_KEYS.has(e.stat)) {
        errors.push(`effects[${i}].stat: invalid weapon modifier stat`);
      }
      if (e.op !== 'add' && e.op !== 'mult') {
        errors.push(`effects[${i}].op: must be add or mult`);
      }
      if (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value === 0) {
        errors.push(`effects[${i}].value: must be a non-zero finite number`);
      }
      if (e.sourceId !== undefined) errors.push(`effects[${i}].sourceId: static modifiers must be source-free`);
    });
  }

  if (!Array.isArray(p.traits)) {
    errors.push('traits: must be an array');
  } else {
    if (p.traits.length > MAX_EFFECTIVE_TRAITS_PER_PART) {
      errors.push(`traits: at most ${MAX_EFFECTIVE_TRAITS_PER_PART} traits per part`);
    }
    p.traits.forEach((trait, i) => {
      if (typeof trait !== 'string' || !BEHAVIOR_TRAITS.includes(trait as never)) {
        errors.push(`traits[${i}]: invalid behavior trait`);
      }
    });
  }
  if (p.unlock !== undefined) errors.push(...validateProgressionCondition(p.unlock, 'unlock'));
  if (p.rewardPoolId !== undefined && (typeof p.rewardPoolId !== 'string' || p.rewardPoolId.trim().length === 0)) {
    errors.push('rewardPoolId: must be a non-empty string when provided');
  }
  if (p.fabricationCost !== undefined && (!Number.isSafeInteger(p.fabricationCost) || (p.fabricationCost as number) <= 0)) {
    errors.push('fabricationCost: must be a positive safe integer when provided');
  }

  return errors;
};

export function assertPartArtReferences(parts: readonly { presentation: { iconArtId: string } }[], catalog: VisualArtCatalog): void {
  const bindings = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  parts.forEach((part, index) => {
    const binding = bindings.get(part.presentation.iconArtId);
    if (!binding) throw new Error(`gun-parts.json[${index}].presentation.iconArtId: unknown visual-art id "${part.presentation.iconArtId}"`);
    if (binding.kind !== 'upgrade-icon' || !binding.required) throw new Error(`gun-parts.json[${index}].presentation.iconArtId: must resolve to a required upgrade-icon binding`);
  });
}

/**
 * Every shipping part must be earnable deliberately.  Definitions are
 * blueprints, not inventory; this closes the quiet "present in JSON but
 * impossible to receive" failure mode before it reaches a save file.
 */
export function assertPartAcquisitionRoutes(
  parts: readonly { id: string; fabricationCost?: number }[],
  rewards: readonly RewardProfile[],
): void {
  const rewarded = new Set<string>();
  for (const reward of rewards) {
    for (const grant of reward.grants ?? []) {
      if (grant.type === 'grant-part-instance' && typeof grant.partId === 'string') {
        rewarded.add(grant.partId);
      }
    }
  }
  for (const part of parts) {
    if (part.fabricationCost === undefined && !rewarded.has(part.id)) {
      throw new Error(`gun-parts.${part.id}: has no persistent reward or fabricable blueprint route`);
    }
  }
}
