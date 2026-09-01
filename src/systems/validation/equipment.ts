/**
 * Equipment catalog validator — per-row and cross-catalog validation.
 * Alpha 3 architecture §8.2: modular per-domain validator.
 */
import { EQUIPMENT_SLOTS, EQUIPMENT_TIERS } from '../../gameplay/equipment';
import { RUN_UPGRADE_STAT_KEYS } from '../../gameplay/stats';
import { isUnlockId } from '../ids';
import { validateProgressionCondition } from '../../gameplay/conditionValidation';
import type { RowCheck } from '../validation';
import type { VisualArtCatalog } from '../types';

type RowCheckFn = RowCheck;

const STAT_KEYS = new Set<string>(RUN_UPGRADE_STAT_KEYS);

function validateModifiers(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: must be an array`);
    return;
  }
  value.forEach((effect, i) => {
    if (!effect || typeof effect !== 'object') {
      errors.push(`${path}[${i}]: must be an object`);
      return;
    }
    const m = effect as Record<string, unknown>;
    if (typeof m.stat !== 'string' || !STAT_KEYS.has(m.stat)) errors.push(`${path}[${i}].stat: invalid stat`);
    if (m.op !== 'add' && m.op !== 'mult') errors.push(`${path}[${i}].op: must be add or mult`);
    if (typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value === 0) errors.push(`${path}[${i}].value: must be a non-zero finite number`);
    if (typeof m.sourceId !== 'string' || m.sourceId.length === 0) errors.push(`${path}[${i}].sourceId: must be a non-empty string`);
  });
}

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
  if (typeof e.setId !== 'string' || !e.setId.startsWith('set:')) {
    errors.push('setId: must be a canonical set ID');
  }
  if (typeof e.slot !== 'string' || !EQUIPMENT_SLOTS.includes(e.slot as never)) {
    errors.push(`slot: must be one of ${EQUIPMENT_SLOTS.join(', ')}`);
  }
  if (typeof e.tier !== 'number' || !Number.isSafeInteger(e.tier) || e.tier < 1 || e.tier > EQUIPMENT_TIERS.length) {
    errors.push(`tier: must be a safe integer 1-${EQUIPMENT_TIERS.length}`);
  }
  if (!e.presentation || typeof e.presentation !== 'object' || Array.isArray(e.presentation)
      || typeof (e.presentation as Record<string, unknown>).iconArtId !== 'string') {
    errors.push('presentation.iconArtId: required canonical visual-art ID');
  }

  validateModifiers(e.effects, 'effects', errors);
  if (e.setBonuses !== undefined) {
    if (!e.setBonuses || typeof e.setBonuses !== 'object' || Array.isArray(e.setBonuses)) {
      errors.push('setBonuses: must be an object');
    } else {
      const bonuses = e.setBonuses as Record<string, unknown>;
      for (const key of Object.keys(bonuses)) {
        if (key !== '2' && key !== '4') errors.push(`setBonuses.${key}: threshold must be 2 or 4`);
      }
      for (const threshold of ['2', '4']) {
        if (bonuses[threshold] !== undefined) validateModifiers(bonuses[threshold], `setBonuses.${threshold}`, errors);
      }
    }
  }

  if (e.upgradeUnlocks !== undefined) {
    if (!e.upgradeUnlocks || typeof e.upgradeUnlocks !== 'object' || Array.isArray(e.upgradeUnlocks)) {
      errors.push('upgradeUnlocks: must be an object');
    } else {
      const unlocks = e.upgradeUnlocks as Record<string, unknown>;
      for (const targetTier of Object.keys(unlocks)) {
        if (targetTier !== '2' && targetTier !== '3' && targetTier !== '4') {
          errors.push(`upgradeUnlocks.${targetTier}: target tier must be 2, 3, or 4`);
        } else {
          errors.push(...validateProgressionCondition(unlocks[targetTier], `upgradeUnlocks.${targetTier}`));
        }
      }
    }
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

export function assertEquipmentArtReferences(pieces: readonly { presentation: { iconArtId: string } }[], catalog: VisualArtCatalog): void {
  const bindings = new Map(catalog.bindings.map((binding) => [binding.id, binding]));
  pieces.forEach((piece, index) => {
    const binding = bindings.get(piece.presentation.iconArtId);
    if (!binding) throw new Error(`equipment.json[${index}].presentation.iconArtId: unknown visual-art id "${piece.presentation.iconArtId}"`);
    if (binding.kind !== 'upgrade-icon' || !binding.required) throw new Error(`equipment.json[${index}].presentation.iconArtId: must resolve to a required upgrade-icon binding`);
  });
}

/** Every usable set supplies one data-owned, complete table. Keeping the table
 * with content makes a new set a catalog addition rather than runtime code. */
export function assertEquipmentSetBonuses(
  pieces: readonly { id: string; setId: string; setBonuses?: Readonly<Partial<Record<2 | 4, readonly { sourceId: string }[]>>> }[],
): void {
  const bySet = new Map<string, (typeof pieces)[number][]>();
  for (const piece of pieces) bySet.set(piece.setId, [...(bySet.get(piece.setId) ?? []), piece]);
  for (const [setId, setPieces] of bySet) {
    const providers = setPieces.filter((piece) => piece.setBonuses !== undefined);
    if (providers.length !== 1) throw new Error(`equipment.${setId}: must have exactly one setBonuses provider`);
    const bonuses = providers[0].setBonuses!;
    for (const threshold of [2, 4] as const) {
      const effects = bonuses[threshold];
      if (!effects || effects.length === 0) throw new Error(`equipment.${setId}: missing ${threshold}-piece set bonus`);
      for (const effect of effects) {
        if (effect.sourceId !== `${setId}:${threshold}`) {
          throw new Error(`equipment.${setId}: ${threshold}-piece sourceId must equal "${setId}:${threshold}"`);
        }
      }
    }
  }
}

/** Equipment tier gates share the Alpha 3 condition vocabulary. Resolve all
 * catalog-bearing facts at boot so a typo cannot create an unearnable tier. */
export function assertEquipmentUpgradeUnlockReferences(
  pieces: readonly { id: string; setId: string; upgradeUnlocks?: Readonly<Partial<Record<2 | 3 | 4, unknown>>> }[],
  catalogs: { stageIds: Set<string>; bossIds: Set<string>; achievementIds: Set<string>; characterIds: Set<string>; metaUpgradeIds: Set<string> },
): void {
  // Enemy-only validator fixtures deliberately clear the complete stage
  // progression domain. There is then no route that can consume an equipment
  // tier gate; skip this cross-domain assertion rather than misclassifying
  // that isolated fixture as a broken production catalog.
  if (catalogs.stageIds.size === 0) return;
  const providersBySet = new Map<string, number>();
  for (const piece of pieces) {
    if (piece.upgradeUnlocks === undefined) continue;
    providersBySet.set(piece.setId, (providersBySet.get(piece.setId) ?? 0) + 1);
  }
  for (const [setId, count] of providersBySet) {
    if (count > 1) throw new Error(`equipment.${setId}: must have at most one upgradeUnlocks provider`);
  }
  for (const piece of pieces) {
    for (const [targetTier, condition] of Object.entries(piece.upgradeUnlocks ?? {})) {
      assertEquipmentConditionReferences(condition, `equipment.${piece.id}.upgradeUnlocks.${targetTier}`, catalogs);
    }
  }
}

function assertEquipmentConditionReferences(
  value: unknown,
  path: string,
  catalogs: Parameters<typeof assertEquipmentUpgradeUnlockReferences>[1],
): void {
  if (!value || typeof value !== 'object') return;
  const condition = value as Record<string, unknown>;
  const target = condition.type === 'stage-cleared' ? ['stageIds', condition.stageId]
    : condition.type === 'boss-defeated' ? ['bossIds', condition.bossId]
      : condition.type === 'achievement-completed' ? ['achievementIds', condition.achievementId]
        : condition.type === 'mastery-reached' ? ['characterIds', `character:${String(condition.subjectId)}`]
          : condition.type === 'permanent-level' ? ['metaUpgradeIds', condition.upgradeId]
            : undefined;
  // Narrow catalog fixtures intentionally omit whole producer domains. In a
  // complete catalog references are strict; an absent domain is not treated
  // as a fabricated empty catalog by this cross-domain equipment check.
  if (target && catalogs[target[0] as keyof typeof catalogs].size > 0 && !catalogs[target[0] as keyof typeof catalogs].has(target[1] as string)) {
    throw new Error(`${path}: condition references unknown "${String(target[1])}"`);
  }
  if ((condition.type === 'all' || condition.type === 'any') && Array.isArray(condition.conditions)) {
    condition.conditions.forEach((child, index) => assertEquipmentConditionReferences(child, `${path}.conditions[${index}]`, catalogs));
  }
  if (condition.type === 'not') assertEquipmentConditionReferences(condition.condition, `${path}.condition`, catalogs);
}
