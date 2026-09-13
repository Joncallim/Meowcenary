/**
 * Pure persistent availability resolver.
 *
 * One shared availability owner used by Equipment, Gunsmith, Home/Loadout/
 * Career, and post-run newly-available reveal. Evaluates existing
 * ProgressionCondition facts; UI does not reimplement conditions
 * independently.
 *
 * V4 (Slice D): pure shared availability snapshot with diff support.
 */
import { evaluateCondition, type ProgressionCondition, type ConditionContext } from './conditionEvaluator';

export interface PersistentAvailabilitySnapshot {
  readonly selectableCharacterIds: readonly string[];
  readonly fabricableEquipmentSetIds: readonly string[];
  readonly fabricablePartIds: readonly string[];
  readonly maxEquipmentTier: 1 | 2 | 3 | 4;
}

/** Resolve current availability snapshot from facts and definition catalogs. */
export function resolveAvailabilitySnapshot(
  facts: ConditionContext,
  characterDefinitions: ReadonlyArray<{ id: string; unlock: ProgressionCondition }>,
  equipmentSetDefinitions: ReadonlyArray<{ id: string; unlock: ProgressionCondition }>,
  partDefinitions: ReadonlyArray<{ id: string; unlock?: ProgressionCondition; fabricationCost?: number }>,
  maxTier: 1 | 2 | 3 | 4,
): PersistentAvailabilitySnapshot {
  const selectableCharacterIds: string[] = [];
  for (const def of characterDefinitions) {
    if (evaluateCondition(def.unlock, facts)) {
      selectableCharacterIds.push(def.id);
    }
  }

  const fabricableEquipmentSetIds: string[] = [];
  for (const def of equipmentSetDefinitions) {
    if (evaluateCondition(def.unlock, facts)) {
      fabricableEquipmentSetIds.push(def.id);
    }
  }

  const fabricablePartIds: string[] = [];
  for (const def of partDefinitions) {
    // A fabrication cost is the positive declaration that a blueprint can be
    // made.  Unlike character/equipment catalogs, a part's unlock is
    // deliberately optional: no condition means ordinary availability, not
    // an accidentally permanent lockout.
    if (def.fabricationCost !== undefined && (def.unlock === undefined || evaluateCondition(def.unlock, facts))) {
      fabricablePartIds.push(def.id);
    }
  }

  return Object.freeze({
    selectableCharacterIds: Object.freeze(selectableCharacterIds),
    fabricableEquipmentSetIds: Object.freeze(fabricableEquipmentSetIds),
    fabricablePartIds: Object.freeze(fabricablePartIds),
    maxEquipmentTier: maxTier,
  });
}

/** Compute newly available items between two snapshots. */
export function diffAvailability(
  before: PersistentAvailabilitySnapshot,
  after: PersistentAvailabilitySnapshot,
): {
  readonly newCharacters: readonly string[];
  readonly newEquipmentSets: readonly string[];
  readonly newParts: readonly string[];
  readonly tierUpgrade: boolean;
} {
  const beforeChars = new Set(before.selectableCharacterIds);
  const afterChars = new Set(after.selectableCharacterIds);
  const newCharacters = [...afterChars].filter((id) => !beforeChars.has(id));

  const beforeSets = new Set(before.fabricableEquipmentSetIds);
  const afterSets = new Set(after.fabricableEquipmentSetIds);
  const newEquipmentSets = [...afterSets].filter((id) => !beforeSets.has(id));

  const beforeParts = new Set(before.fabricablePartIds);
  const afterParts = new Set(after.fabricablePartIds);
  const newParts = [...afterParts].filter((id) => !beforeParts.has(id));

  const tierUpgrade = after.maxEquipmentTier > before.maxEquipmentTier;

  return { newCharacters, newEquipmentSets, newParts, tierUpgrade };
}
