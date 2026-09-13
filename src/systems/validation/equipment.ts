import { EQUIPMENT_SLOTS, type EquipmentDefinition, type EquipmentSetDefinition, type EquipmentUpgradeRules } from '../../gameplay/equipment';
import { RUN_UPGRADE_STAT_KEYS } from '../../gameplay/stats';
import { BEHAVIOR_TRAITS } from '../../gameplay/weaponTraits';
import { isUnlockId } from '../ids';
import { validateProgressionCondition } from '../../gameplay/conditionValidation';
import type { RowCheck } from '../validation';
import type { VisualArtCatalog } from '../types';

const stats = new Set<string>(RUN_UPGRADE_STAT_KEYS); const traits = new Set<string>(BEHAVIOR_TRAITS);
function modifiers(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) { errors.push(`${path}: must be an array`); return; }
  value.forEach((effect, i) => { const e = effect as Record<string, unknown>;
    if (!e || typeof e !== 'object') { errors.push(`${path}[${i}]: must be an object`); return; }
    if (typeof e.stat !== 'string' || !stats.has(e.stat)) errors.push(`${path}[${i}].stat: invalid stat`);
    if (e.op !== 'add' && e.op !== 'mult') errors.push(`${path}[${i}].op: must be add or mult`);
    if (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value === 0) errors.push(`${path}[${i}].value: must be non-zero finite`);
    if ('sourceId' in e) errors.push(`${path}[${i}].sourceId: retired; runtime owns provenance`);
  });
}
export const checkEquipment: RowCheck = (row) => { const errors: string[] = []; const e = row as Record<string, unknown>;
  if (!e || typeof e !== 'object') return ['not an object'];
  if (typeof e.id !== 'string' || !isUnlockId(e.id) || !e.id.startsWith('equipment:')) errors.push('id: must be canonical equipment ID');
  if (typeof e.name !== 'string' || !e.name.trim()) errors.push('name: required');
  if (typeof e.setId !== 'string' || !e.setId.startsWith('set:')) errors.push('setId: must be canonical set ID');
  if (typeof e.slot !== 'string' || !EQUIPMENT_SLOTS.includes(e.slot as never)) errors.push('slot: invalid');
  if (typeof e.icon !== 'string' || !e.icon) errors.push('icon: required canonical visual-art ID');
  for (const retired of ['tier', 'upgradeUnlocks', 'setBonuses', 'presentation']) if (retired in e) errors.push(`${retired}: retired in V4`);
  modifiers(e.effects, 'effects', errors); return errors;
};
export const checkEquipmentSet: RowCheck = (row) => { const errors: string[] = []; const set = row as Record<string, unknown>;
  if (!set || typeof set !== 'object') return ['not an object'];
  if (typeof set.id !== 'string' || !set.id.startsWith('set:')) errors.push('id: must be canonical set ID');
  for (const field of ['name','description','emblem']) if (typeof set[field] !== 'string' || !String(set[field]).trim()) errors.push(`${field}: required`);
  if (!Number.isSafeInteger(set.pieceFabricationCost) || (set.pieceFabricationCost as number) <= 0) errors.push('pieceFabricationCost: must be positive safe integer');
  errors.push(...validateProgressionCondition(set.unlock, 'unlock'));
  const thresholds = set.thresholds as Record<string, unknown>; if (!thresholds || typeof thresholds !== 'object') errors.push('thresholds: required'); else for (const threshold of ['2','4']) { const value = thresholds[threshold] as Record<string, unknown>; if (!value || typeof value !== 'object') { errors.push(`thresholds.${threshold}: required`); continue; } modifiers(value.modifiers, `thresholds.${threshold}.modifiers`, errors); if (value.weaponTraits !== undefined && (!Array.isArray(value.weaponTraits) || value.weaponTraits.some((trait) => typeof trait !== 'string' || !traits.has(trait)))) errors.push(`thresholds.${threshold}.weaponTraits: invalid trait`); }
  return errors;
};
export const checkEquipmentRules: RowCheck = (row) => { const errors: string[] = []; const rules = row as Record<string, unknown>; const unlocks = rules?.unlocks as Record<string, unknown>; if (!unlocks || typeof unlocks !== 'object') return ['unlocks: required']; for (const tier of ['2','3','4']) errors.push(...validateProgressionCondition(unlocks[tier], `unlocks.${tier}`)); return errors; };
export function assertEquipmentArtReferences(pieces: readonly EquipmentDefinition[], sets: readonly EquipmentSetDefinition[], catalog: VisualArtCatalog): void { const bindings = new Map(catalog.bindings.map((binding) => [binding.id, binding])); for (const [kind, id] of [...pieces.map((piece) => ['equipment', piece.icon] as const), ...sets.map((set) => ['equipment set', set.emblem] as const)]) { const binding = id === undefined ? undefined : bindings.get(id); if (!binding || binding.kind !== 'upgrade-icon' || !binding.required) throw new Error(`${kind}: unknown required upgrade-icon "${id}"`); } }
export function assertEquipmentSetMembership(pieces: readonly EquipmentDefinition[], sets: readonly EquipmentSetDefinition[]): void { const ids = new Set(sets.map((set) => set.id)); const counts = new Map<string, number>(); for (const piece of pieces) { if (!ids.has(piece.setId)) throw new Error(`equipment.${piece.id}: unknown set "${piece.setId}"`); counts.set(piece.setId, (counts.get(piece.setId) ?? 0) + 1); } for (const set of sets) if (counts.get(set.id) !== 4) throw new Error(`equipment.${set.id}: requires exactly four pieces`); }
export function assertEquipmentRuleReferences(rules: EquipmentUpgradeRules, catalogs: { stageIds: Set<string>; bossIds: Set<string> }): void { for (const condition of Object.values(rules.unlocks)) { const c = condition as any; if (c.type === 'stage-cleared' && !catalogs.stageIds.has(c.stageId)) throw new Error(`equipment-rules: unknown stage "${c.stageId}"`); if (c.type === 'boss-defeated' && !catalogs.bossIds.has(c.bossId)) throw new Error(`equipment-rules: unknown boss "${c.bossId}"`); } }
