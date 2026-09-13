import { deepFreeze } from '../engine/freeze';
import type { EquipmentDefinition, EquipmentSetDefinition, EquipmentUpgradeRules } from '../gameplay/equipment';
import { validateEquipmentCatalog, validateEquipmentSetCatalog, validateEquipmentRules } from './validation';

export class DataEquipmentRegistry {
  private readonly pieces: readonly EquipmentDefinition[];
  private readonly sets: readonly EquipmentSetDefinition[];
  private readonly piecesById = new Map<string, EquipmentDefinition>();
  private readonly setsById = new Map<string, EquipmentSetDefinition>();
  readonly rules: EquipmentUpgradeRules;
  constructor(data: { equipment: unknown; equipmentSets?: unknown; equipmentRules?: unknown }) {
    this.pieces = Object.freeze(validateEquipmentCatalog(data.equipment).map((row) => deepFreeze(structuredClone(row))));
    this.sets = Object.freeze(validateEquipmentSetCatalog(data.equipmentSets ?? []).map((row) => deepFreeze(structuredClone(row))));
    this.rules = deepFreeze(validateEquipmentRules(data.equipmentRules ?? { unlocks: { 2: { type: 'always' }, 3: { type: 'always' }, 4: { type: 'always' } } }));
    for (const piece of this.pieces) { if (this.piecesById.has(piece.id)) throw new Error(`Duplicate equipment id "${piece.id}"`); this.piecesById.set(piece.id, piece); }
    for (const set of this.sets) { if (this.setsById.has(set.id)) throw new Error(`Duplicate equipment set id "${set.id}"`); this.setsById.set(set.id, set); }
    for (const piece of this.pieces) if (!this.setsById.has(piece.setId)) throw new Error(`equipment.${piece.id}: unknown set "${piece.setId}"`);
  }
  equipmentById(id: string): EquipmentDefinition | undefined { return this.piecesById.get(id); }
  setById(id: string): EquipmentSetDefinition | undefined { return this.setsById.get(id); }
  all(): readonly EquipmentDefinition[] { return this.pieces; }
  allSets(): readonly EquipmentSetDefinition[] { return this.sets; }
  asMap(): ReadonlyMap<string, EquipmentDefinition> { return this.piecesById; }
  setsAsMap(): ReadonlyMap<string, EquipmentSetDefinition> { return this.setsById; }
}
