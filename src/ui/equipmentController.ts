import type { GameContext } from '../engine/context';
import { DataEquipmentRegistry } from '../systems/equipment';
import { equipEquipment, unequipEquipment, maxEquipmentTier, ownedEquipmentId, upgradeCost, type EquipmentSlot, type OwnedEquipment } from '../gameplay/equipment';
import { createConditionContext, evaluateCondition } from '../gameplay/conditionEvaluator';
import { scaleModifierByTier, type ModifierSpec } from '../gameplay/stats';

const label = (effect: ModifierSpec, tier = 1): string => {
  const value = scaleModifierByTier(effect, tier);
  if (effect.op === 'mult') {
    const percent = Math.round((value - 1) * 100);
    const names: Partial<Record<ModifierSpec['stat'], string>> = {
      attackSpeed: 'Fire Rate', moveSpeed: 'Move Speed', damage: 'Damage',
      maxHealth: 'Max Health', currencyGain: 'Scrap Gain', xpGain: 'XP Gain',
    };
    return `${percent >= 0 ? '+' : ''}${percent}% ${names[effect.stat] ?? effect.stat}`;
  }
  const names: Partial<Record<ModifierSpec['stat'], string>> = {
    maxHealth: 'Max Health', moveSpeed: 'Move Speed', spreadDeg: 'Weapon Spread',
    pickupRadius: 'Pickup Radius', range: 'Weapon Range', damage: 'Damage',
  };
  const suffix = effect.stat === 'spreadDeg' ? '°' : '';
  return `${value >= 0 ? '+' : ''}${value}${suffix} ${names[effect.stat] ?? effect.stat}`;
};
export interface EquipmentSnapshot { readonly equipped: Readonly<Record<string, string | undefined>>; readonly owned: readonly { readonly instanceId: string; readonly equipmentId: string; readonly name: string; readonly setName: string; readonly setPieces: number; readonly slot: string; readonly tier: number; readonly iconArtId: string; readonly effectSummary: readonly string[]; readonly comparisonSummary?: string; readonly upgradeCost?: number; readonly upgradeLocked?: boolean }[]; readonly activeSets: readonly { readonly name: string; readonly pieces: number; readonly activeThresholds: readonly (2 | 4)[]; readonly bonusSummary: readonly string[] }[]; readonly unavailable: readonly { readonly instanceId: string; readonly equipmentId: string }[]; }
export class EquipmentController {
  private readonly registry: DataEquipmentRegistry;
  constructor(private readonly context: GameContext) { this.registry = new DataEquipmentRegistry({ equipment: context.data.equipment ?? [], equipmentSets: context.data.equipmentSets ?? [], equipmentRules: context.data.equipmentRules ?? { unlocks: { 2: { type: 'always' }, 3: { type: 'always' }, 4: { type: 'always' } } } }); }
  private facts() { const s = this.context.saveData; return createConditionContext(s.progression, { stages: s.stages, achievements: s.achievements, characters: s.characters, bosses: s.bosses }); }
  snapshot(): EquipmentSnapshot { const state = this.context.saveData; const equipped = Object.freeze({ ...(state.equipmentLoadout ?? {}) }); const counts = new Map<string, number>();
    for (const [slot, id] of Object.entries(equipped)) { const item = id === undefined ? undefined : state.equipment[id]; const def = item === undefined ? undefined : this.registry.equipmentById(item.equipmentId); if (def?.slot === slot) counts.set(def.setId, (counts.get(def.setId) ?? 0) + 1); }
    const maxTier = maxEquipmentTier(this.facts(), this.registry.rules);
    return Object.freeze({ equipped, owned: Object.freeze(Object.entries(state.equipment).flatMap(([instanceId, item]) => { const def = this.registry.equipmentById(item.equipmentId); if (!def) return []; const set = this.registry.setById(def.setId)!; const cost = item.tier < maxTier ? upgradeCost(item.tier) : undefined; return [Object.freeze({ instanceId, equipmentId: item.equipmentId, name: def.name, setName: set.name, setPieces: counts.get(def.setId) ?? 0, slot: def.slot, tier: item.tier, iconArtId: def.icon, effectSummary: Object.freeze(def.effects.map((effect) => label(effect, item.tier))), ...(cost === undefined ? { upgradeLocked: item.tier < 4 } : { upgradeCost: cost }) })]; })), activeSets: Object.freeze([...counts.entries()].map(([setId, pieces]) => { const set = this.registry.setById(setId)!; const activeThresholds = ([2, 4] as const).filter((threshold) => pieces >= threshold); return Object.freeze({ name: set.name, pieces, activeThresholds: Object.freeze(activeThresholds), bonusSummary: Object.freeze(activeThresholds.map((threshold) => `${threshold}-piece: ${set.thresholds[threshold].modifiers.map((effect) => label(effect)).join(', ')}`)) }); })), unavailable: Object.freeze(Object.entries(state.equipment).flatMap(([instanceId, item]) => this.registry.equipmentById(item.equipmentId) ? [] : [{ instanceId, equipmentId: item.equipmentId }])) }); }
  equip(instanceId: string): boolean { const save = this.context.saveData; const owned = new Map<string, OwnedEquipment>(Object.entries(save.equipment).map(([id, item]) => [id, { instanceId: id, ...item }])); const result = equipEquipment({ equipped: save.equipmentLoadout ?? {} }, instanceId, this.registry.asMap(), owned); return result.ok && this.context.updateEquipment(() => ({ equipment: save.equipment, loadout: result.loadout.equipped })).persisted; }
  unequip(slot: EquipmentSlot): boolean { const save = this.context.saveData; const result = unequipEquipment({ equipped: save.equipmentLoadout ?? {} }, slot); return result.ok && this.context.updateEquipment(() => ({ equipment: save.equipment, loadout: result.loadout.equipped })).persisted; }
  upgrade(instanceId: string): boolean { const save = this.context.saveData; const item = save.equipment[instanceId]; if (!item || item.tier >= maxEquipmentTier(this.facts(), this.registry.rules) || save.progression.scrap < upgradeCost(item.tier)) return false; return this.context.commitEquipmentUpgrade(instanceId, item.tier, item.tier + 1, upgradeCost(item.tier)); }
  fabricable(): readonly string[] { const save = this.context.saveData; return this.registry.all().filter((piece) => { const set = this.registry.setById(piece.setId)!; return evaluateCondition(set.unlock, this.facts()) && save.equipment[ownedEquipmentId(piece.id)] === undefined; }).map((piece) => piece.id); }
  fabricate(equipmentId: string): boolean { return this.context.fabricateEquipment(equipmentId); }
}
