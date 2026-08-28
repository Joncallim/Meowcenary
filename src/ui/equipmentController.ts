import type { GameContext } from '../engine/context';
import { DataEquipmentRegistry } from '../systems/equipment';
import { equipEquipment, unequipEquipment, upgradeEquipment, type EquipmentSlot, type OwnedEquipment } from '../gameplay/equipment';

export interface EquipmentSnapshot {
  readonly equipped: Readonly<Record<string, string | undefined>>;
  readonly owned: readonly { readonly instanceId: string; readonly equipmentId: string; readonly name: string; readonly slot: string; readonly tier: number; readonly upgradeCost?: number }[];
}

/** Immutable equipment read model plus explicit persistent equip commands. */
export class EquipmentController {
  private readonly registry: DataEquipmentRegistry;
  constructor(private readonly context: GameContext) { this.registry = new DataEquipmentRegistry({ equipment: context.data.equipment ?? [] }); }
  snapshot(): EquipmentSnapshot {
    const state = this.context.saveData;
    return Object.freeze({
      equipped: Object.freeze({ ...(state.equipmentLoadout ?? {}) }),
      owned: Object.freeze(Object.entries(state.equipment).flatMap(([instanceId, item]) => {
        const definition = this.registry.equipmentById(item.equipmentId);
        if (!definition) return [];
        const upgrade = upgradeEquipment({ instanceId, equipmentId: item.equipmentId, tier: item.tier }, state.progression.scrap, this.registry.asMap());
        return [Object.freeze({ instanceId, equipmentId: item.equipmentId, name: definition.name, slot: definition.slot, tier: item.tier, ...(upgrade.ok ? { upgradeCost: upgrade.cost } : {}) })];
      })),
    });
  }
  equip(instanceId: string): boolean {
    const save = this.context.saveData;
    const owned = new Map<string, OwnedEquipment>(Object.entries(save.equipment).map(([id, item]) => [id, { instanceId: id, equipmentId: item.equipmentId, tier: item.tier }]));
    const result = equipEquipment({ equipped: save.equipmentLoadout ?? {} }, instanceId, this.registry.asMap(), owned);
    if (!result.ok) return false;
    return this.context.updateEquipment(() => ({ equipment: save.equipment, loadout: result.loadout.equipped })).persisted;
  }
  unequip(slot: EquipmentSlot): boolean {
    const save = this.context.saveData;
    const result = unequipEquipment({ equipped: save.equipmentLoadout ?? {} }, slot);
    if (!result.ok) return false;
    return this.context.updateEquipment(() => ({ equipment: save.equipment, loadout: result.loadout.equipped })).persisted;
  }
  upgrade(instanceId: string): boolean {
    const save = this.context.saveData;
    const owned = save.equipment[instanceId];
    if (!owned) return false;
    const result = upgradeEquipment({ instanceId, equipmentId: owned.equipmentId, tier: owned.tier }, save.progression.scrap, this.registry.asMap());
    if (!result.ok) return false;
    return this.context.commitEquipmentUpgrade(instanceId, owned.tier, result.output.tier, result.cost);
  }
}
