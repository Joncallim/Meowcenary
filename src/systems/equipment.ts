/**
 * Equipment registry — validated-clone + deepFreeze (registry pattern).
 */
import { deepFreeze } from '../engine/freeze';
import type { EquipmentDefinition } from '../gameplay/equipment';
import { validateEquipmentCatalog } from './validation';

export class DataEquipmentRegistry {
  private readonly byId = new Map<string, EquipmentDefinition>();
  private readonly snapshot: readonly EquipmentDefinition[];

  constructor(data: { equipment: unknown }) {
    const validated = validateEquipmentCatalog(data.equipment);
    const canonical = validated.map((e) => deepFreeze(structuredClone(e)));

    for (const equipment of canonical) {
      if (this.byId.has(equipment.id)) {
        throw new Error(`Duplicate equipment id "${equipment.id}"`);
      }
      this.byId.set(equipment.id, equipment);
    }
    this.snapshot = Object.freeze([...canonical]);
  }

  equipmentById(id: string): EquipmentDefinition | undefined {
    return this.byId.get(id);
  }

  all(): readonly EquipmentDefinition[] {
    return this.snapshot;
  }

  asMap(): ReadonlyMap<string, EquipmentDefinition> {
    return this.byId;
  }
}
