/** V4 Equipment rules. Static catalog content is source-free; owned instances
 * supply tier and runtime modifier provenance. */
import { evaluateCondition, type ConditionContext, type ProgressionCondition } from './conditionEvaluator';
import { scaleModifierByTier, type Modifier, type ModifierSpec } from './stats';
import type { BehaviorTrait } from './weaponTraits';

export type EquipmentSlot = 'helmet' | 'armour' | 'gloves' | 'boots';
export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['helmet', 'armour', 'gloves', 'boots'] as const;
export const EQUIPMENT_TIERS = [1, 2, 3, 4] as const;

export interface EquipmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly setId: string;
  readonly slot: EquipmentSlot;
  readonly icon: string;
  readonly effects: readonly ModifierSpec[];
}
export interface EquipmentSetDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unlock: ProgressionCondition;
  readonly pieceFabricationCost: number;
  readonly emblem: string;
  readonly thresholds: Readonly<Record<2 | 4, { readonly modifiers: readonly ModifierSpec[]; readonly weaponTraits?: readonly BehaviorTrait[] }>>;
}
export interface EquipmentUpgradeRules { readonly unlocks: Readonly<Record<2 | 3 | 4, ProgressionCondition>>; }
export interface OwnedEquipment { readonly instanceId: string; readonly equipmentId: string; readonly tier: number; }
export interface EquipmentLoadout { readonly equipped: Readonly<Partial<Record<EquipmentSlot, string>>>; }

export function equipmentUpgradeUnlock(targetTier: 2 | 3 | 4, rules: EquipmentUpgradeRules): ProgressionCondition { return rules.unlocks[targetTier]; }
export function maxEquipmentTier(facts: ConditionContext, rules: EquipmentUpgradeRules): 1 | 2 | 3 | 4 {
  if (evaluateCondition(rules.unlocks[4], facts)) return 4;
  if (evaluateCondition(rules.unlocks[3], facts)) return 3;
  if (evaluateCondition(rules.unlocks[2], facts)) return 2;
  return 1;
}
export function upgradeCost(currentTier: number): number { return 50 * (currentTier + 1); }
export function ownedEquipmentId(equipmentId: string): string { return `owned:${equipmentId.replace(':', '-')}`; }

export function resolveSetBonuses(loadout: EquipmentLoadout, definitions: ReadonlyMap<string, EquipmentDefinition>, setsOrOwned: ReadonlyMap<string, EquipmentSetDefinition> | ReadonlyMap<string, OwnedEquipment>, maybeOwned?: ReadonlyMap<string, OwnedEquipment>): readonly Modifier[] {
  const sets = maybeOwned === undefined ? new Map<string, EquipmentSetDefinition>() : setsOrOwned as ReadonlyMap<string, EquipmentSetDefinition>;
  const owned = (maybeOwned ?? setsOrOwned) as ReadonlyMap<string, OwnedEquipment>;
  const counts = new Map<string, number>();
  for (const [slot, instanceId] of Object.entries(loadout.equipped) as [EquipmentSlot, string | undefined][]) {
    const item = instanceId === undefined ? undefined : owned.get(instanceId); const definition = item === undefined ? undefined : definitions.get(item.equipmentId);
    if (definition?.slot === slot) counts.set(definition.setId, (counts.get(definition.setId) ?? 0) + 1);
  }
  const output: Modifier[] = [];
  for (const [setId, count] of counts) {
    const set = sets.get(setId);
    if (!set) continue;
    for (const threshold of [2, 4] as const) if (count >= threshold) {
      output.push(...set.thresholds[threshold].modifiers.map((spec) => ({ ...spec, sourceId: `${setId}:${threshold}` })));
    }
  }
  return output;
}
export function resolveEquipmentModifiers(loadout: EquipmentLoadout, definitions: ReadonlyMap<string, EquipmentDefinition>, setsOrOwned: ReadonlyMap<string, EquipmentSetDefinition> | ReadonlyMap<string, OwnedEquipment>, maybeOwned?: ReadonlyMap<string, OwnedEquipment>): readonly Modifier[] {
  const sets = maybeOwned === undefined ? new Map<string, EquipmentSetDefinition>() : setsOrOwned as ReadonlyMap<string, EquipmentSetDefinition>;
  const owned = (maybeOwned ?? setsOrOwned) as ReadonlyMap<string, OwnedEquipment>;
  const output: Modifier[] = [];
  for (const [slot, instanceId] of Object.entries(loadout.equipped) as [EquipmentSlot, string | undefined][]) {
    const item = instanceId === undefined ? undefined : owned.get(instanceId); const definition = item === undefined ? undefined : definitions.get(item.equipmentId);
    if (!item || !definition || definition.slot !== slot || !Number.isSafeInteger(item.tier) || item.tier < 1) continue;
    output.push(...definition.effects.map((spec) => ({ ...spec, value: scaleModifierByTier(spec, Math.min(4, item.tier)), sourceId: item.instanceId })));
  }
  output.push(...resolveSetBonuses(loadout, definitions, sets, owned));
  return output;
}
export type EquipEquipmentResult = { readonly ok: true; readonly loadout: EquipmentLoadout } | { readonly ok: false; readonly reason: 'unknown-equipment' };
export function equipEquipment(loadout: EquipmentLoadout, instanceId: string, definitions: ReadonlyMap<string, EquipmentDefinition>, owned: ReadonlyMap<string, OwnedEquipment>): EquipEquipmentResult {
  const item = owned.get(instanceId); const definition = item && definitions.get(item.equipmentId);
  return definition ? { ok: true, loadout: { equipped: { ...loadout.equipped, [definition.slot]: instanceId } } } : { ok: false, reason: 'unknown-equipment' };
}
export type UnequipEquipmentResult = { readonly ok: true; readonly loadout: EquipmentLoadout } | { readonly ok: false; readonly reason: 'slot-empty' };
export function unequipEquipment(loadout: EquipmentLoadout, slot: EquipmentSlot): UnequipEquipmentResult {
  if (!loadout.equipped[slot]) return { ok: false, reason: 'slot-empty' }; const equipped = { ...loadout.equipped }; delete equipped[slot]; return { ok: true, loadout: { equipped } };
}
export type UpgradeEquipmentResult = { readonly ok: true; readonly output: OwnedEquipment; readonly cost: number } | { readonly ok: false; readonly reason: 'unknown-equipment' | 'max-tier' | 'insufficient-funds' | 'locked' };
export function upgradeEquipment(owned: OwnedEquipment, funds: number, definitions: ReadonlyMap<string, EquipmentDefinition>, facts?: ConditionContext, rules?: EquipmentUpgradeRules): UpgradeEquipmentResult { if (!definitions.has(owned.equipmentId) || !Number.isSafeInteger(owned.tier) || owned.tier < 1) return { ok: false, reason: 'unknown-equipment' }; if (owned.tier >= 4) return { ok: false, reason: 'max-tier' }; if (rules && (!facts || owned.tier >= maxEquipmentTier(facts, rules))) return { ok: false, reason: 'locked' }; const cost = upgradeCost(owned.tier); return funds < cost ? { ok: false, reason: 'insufficient-funds' } : { ok: true, output: { ...owned, tier: owned.tier + 1 }, cost }; }
