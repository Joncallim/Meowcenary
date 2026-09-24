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
  if (!p.presentation || typeof p.presentation !== 'object' || Array.isArray(p.presentation)) {
    errors.push('presentation: required object');
  } else {
    const presentation = p.presentation as Record<string, unknown>;
    const expectedFields = new Set(['iconArtId', 'slotIconArtId', 'assemblyArtId', 'traitIconArtIds']);
    for (const field of Object.keys(presentation)) if (!expectedFields.has(field)) errors.push(`presentation.${field}: unknown field`);
    const tail = typeof p.id === 'string' && p.id.startsWith('part:') ? p.id.slice('part:'.length) : undefined;
    if (typeof presentation.iconArtId !== 'string') errors.push('presentation.iconArtId: required canonical visual-art ID');
    else if (tail !== undefined && presentation.iconArtId !== `gun-part-icon:${tail}`) errors.push(`presentation.iconArtId: must be exactly "gun-part-icon:${tail}"`);
    if (typeof presentation.slotIconArtId !== 'string') errors.push('presentation.slotIconArtId: required canonical visual-art ID');
    else if (typeof p.slot === 'string' && presentation.slotIconArtId !== `gun-slot-icon:${p.slot}`) errors.push(`presentation.slotIconArtId: must be exactly "gun-slot-icon:${p.slot}"`);
    if (p.slot === 'trait') {
      if (presentation.assemblyArtId !== undefined) errors.push('presentation.assemblyArtId: trait cores render in schematic sockets and must not define an overlay');
    } else if (typeof presentation.assemblyArtId !== 'string') {
      errors.push('presentation.assemblyArtId: required for a physical Part');
    } else if (tail !== undefined && presentation.assemblyArtId !== `gun-build-part:${tail}`) {
      errors.push(`presentation.assemblyArtId: must be exactly "gun-build-part:${tail}"`);
    }
    const traitIcons = presentation.traitIconArtIds;
    if (!traitIcons || typeof traitIcons !== 'object' || Array.isArray(traitIcons)) {
      errors.push('presentation.traitIconArtIds: required object');
    } else if (Array.isArray(p.traits)) {
      const expectedTraits = new Set(p.traits.filter((trait): trait is string => typeof trait === 'string'));
      for (const [trait, artId] of Object.entries(traitIcons)) {
        if (!expectedTraits.has(trait)) errors.push(`presentation.traitIconArtIds.${trait}: trait is not declared by this Part`);
        if (artId !== `trait-icon:${trait.toLowerCase()}`) errors.push(`presentation.traitIconArtIds.${trait}: must be exactly "trait-icon:${trait.toLowerCase()}"`);
      }
      for (const trait of expectedTraits) if (!Object.hasOwn(traitIcons, trait)) errors.push(`presentation.traitIconArtIds.${trait}: required for declared trait`);
    }
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

export function assertPartArtReferences(parts: readonly {
  presentation: { iconArtId: string; slotIconArtId: string; assemblyArtId?: string; traitIconArtIds: Readonly<Record<string, string>> };
}[], catalog: VisualArtCatalog): void {
  const bindings = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  parts.forEach((part, index) => {
    const references: readonly (readonly [path: string, artId: string])[] = [
      ['iconArtId', part.presentation.iconArtId],
      ['slotIconArtId', part.presentation.slotIconArtId],
      ...(part.presentation.assemblyArtId === undefined ? [] : [['assemblyArtId', part.presentation.assemblyArtId] as const]),
      ...Object.entries(part.presentation.traitIconArtIds).map(([trait, artId]) => [`traitIconArtIds.${trait}`, artId] as const),
    ];
    for (const [path, artId] of references) {
      const binding = bindings.get(artId);
      if (!binding) throw new Error(`gun-parts.json[${index}].presentation.${path}: unknown visual-art id "${artId}"`);
      if (binding.kind !== 'icon' || !binding.required) throw new Error(`gun-parts.json[${index}].presentation.${path}: must resolve to a required icon binding`);
    }
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
  achievements: readonly { rewards?: readonly { grant: { type: string; partId?: string } }[] }[] = [],
): void {
  const rewarded = new Set<string>();
  for (const reward of rewards) {
    for (const grant of reward.grants ?? []) {
      if (grant.type === 'grant-part-instance' && typeof grant.partId === 'string') {
        rewarded.add(grant.partId);
      }
    }
  }
  for (const achievement of achievements) {
    for (const reward of achievement.rewards ?? []) {
      if (reward.grant.type === 'grant-part-instance' && typeof reward.grant.partId === 'string') rewarded.add(reward.grant.partId);
    }
  }
  for (const part of parts) {
    if (part.fabricationCost === undefined && !rewarded.has(part.id)) {
      throw new Error(`gun-parts.${part.id}: has no persistent reward or fabricable blueprint route`);
    }
  }
}
