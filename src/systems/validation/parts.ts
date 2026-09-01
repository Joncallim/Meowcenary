/**
 * Gun-part catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator following the
 * existing RowCheck pattern.
 */
import { PART_SLOTS, BEHAVIOR_TRAITS, MAX_TRAITS_PER_PART } from '../../gameplay/gunsmith';
import { WEAPON_MODIFIER_STAT_KEYS } from '../../gameplay/stats';
import { isUnlockId } from '../ids';
import type { VisualArtCatalog } from '../types';
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
  if (typeof p.tier !== 'number' || !Number.isSafeInteger(p.tier) || p.tier < 1) {
    errors.push('tier: must be a positive safe integer');
  }
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
      if (typeof e.sourceId !== 'string' || e.sourceId.length === 0) {
        errors.push(`effects[${i}].sourceId: must be a non-empty string`);
      }
    });
  }

  if (!Array.isArray(p.traits)) {
    errors.push('traits: must be an array');
  } else {
    if (p.traits.length > MAX_TRAITS_PER_PART) {
      errors.push(`traits: at most ${MAX_TRAITS_PER_PART} traits per part`);
    }
    p.traits.forEach((trait, i) => {
      if (typeof trait !== 'string' || !BEHAVIOR_TRAITS.includes(trait as never)) {
        errors.push(`traits[${i}]: invalid behavior trait`);
      }
    });
  }

  return errors;
};

/** Cross-catalog assertion: every effect sourceId resolves to its own part id. */
export function assertPartEffectSources(parts: readonly { id: string; effects: readonly { sourceId: string }[] }[]): void {
  for (const part of parts) {
    for (const effect of part.effects) {
      if (effect.sourceId !== part.id) {
        throw new Error(`part.${part.id}: effect sourceId "${effect.sourceId}" must equal the part id`);
      }
    }
  }
}

export function assertPartArtReferences(parts: readonly { presentation: { iconArtId: string } }[], catalog: VisualArtCatalog): void {
  const bindings = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  parts.forEach((part, index) => {
    const binding = bindings.get(part.presentation.iconArtId);
    if (!binding) throw new Error(`gun-parts.json[${index}].presentation.iconArtId: unknown visual-art id "${part.presentation.iconArtId}"`);
    if (binding.kind !== 'upgrade-icon' || !binding.required) throw new Error(`gun-parts.json[${index}].presentation.iconArtId: must resolve to a required upgrade-icon binding`);
  });
}
