import { EQUIPMENT_TIERS, type EquipmentDefinition } from '../gameplay/equipment';
import { deepFreeze } from '../engine/freeze';
import type { GameData, VisualArtKind } from '../systems/types';

export interface EquipmentVisualTierDefinition {
  readonly tier: number;
  readonly iconArtId: string;
  readonly wearableArtId: string;
}

export interface EquipmentVisualDefinition {
  readonly equipmentId: string;
  readonly tiers: readonly EquipmentVisualTierDefinition[];
}

export interface EquipmentVisualPresentation {
  readonly equipmentId: string;
  readonly tier: number;
  readonly iconArtId: string;
  readonly wearableArtId: string;
}

type EquipmentVisualBinding = Readonly<{ id: string; kind: VisualArtKind; required: boolean; resourceId?: string; frameKey?: string }>;
type EquipmentVisualArtLookup = Readonly<{ bindingById(id: string): EquipmentVisualBinding | undefined }>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function equipmentVisualKey(equipmentId: string, tier: number): string {
  return `${equipmentId}\u0000${tier}`;
}

/** Immutable, validated resolver for the active Equipment visuals. Validation
 * is explicit at construction so callers can choose the catalog and art
 * closure appropriate to that lifecycle boundary. */
export class DataEquipmentVisualRegistry {
  readonly #visuals = new Map<string, EquipmentVisualPresentation>();

  constructor(catalog: unknown, activeEquipment: readonly EquipmentDefinition[], art: EquipmentVisualArtLookup) {
    if (!Array.isArray(activeEquipment)) throw new Error('Active equipment definitions must be an array');
    const activeById = new Map<string, EquipmentDefinition>();
    for (const definition of activeEquipment) {
      if (!record(definition) || !nonEmptyString(definition.id)) throw new Error('Active equipment definition has an invalid id');
      if (activeById.has(definition.id)) throw new Error(`Duplicate active equipment id "${definition.id}"`);
      activeById.set(definition.id, definition as unknown as EquipmentDefinition);
    }
    if (!Array.isArray(catalog)) throw new Error('Equipment visual catalog must be an array');

    const rows = new Map<string, unknown>();
    for (const row of catalog) {
      if (!record(row) || !nonEmptyString(row.equipmentId)) throw new Error('Equipment visual row has an invalid equipmentId');
      if (rows.has(row.equipmentId)) throw new Error(`Duplicate equipment visual row "${row.equipmentId}"`);
      rows.set(row.equipmentId, row);
    }
    for (const equipmentId of rows.keys()) {
      if (!activeById.has(equipmentId)) throw new Error(`Equipment visual catalog contains inactive equipment "${equipmentId}"`);
    }
    for (const equipmentId of activeById.keys()) {
      if (!rows.has(equipmentId)) throw new Error(`Equipment visual catalog is missing active equipment "${equipmentId}"`);
    }

    for (const [equipmentId, definition] of activeById) {
      const row = rows.get(equipmentId) as Record<string, unknown>;
      if (!Array.isArray(row.tiers)) throw new Error(`Equipment visual row "${equipmentId}" tiers must be an array`);
      const seenTiers = new Set<number>();
      const tierIdentities = { icon: new Set<string>(), wearable: new Set<string>() };
      for (const tierRow of row.tiers) {
        if (!record(tierRow) || !Number.isSafeInteger(tierRow.tier) || !EQUIPMENT_TIERS.includes(tierRow.tier as 1 | 2 | 3 | 4)) {
          throw new Error(`Equipment visual row "${equipmentId}" has an invalid tier`);
        }
        const tier = tierRow.tier as number;
        if (seenTiers.has(tier)) throw new Error(`Equipment visual row "${equipmentId}" has duplicate tier ${tier}`);
        seenTiers.add(tier);
        if (!nonEmptyString(tierRow.iconArtId) || !nonEmptyString(tierRow.wearableArtId)) {
          throw new Error(`Equipment visual row "${equipmentId}" tier ${tier} has invalid art ids`);
        }
        if (tier === 1 && tierRow.iconArtId !== definition.icon) {
          throw new Error(`Equipment visual row "${equipmentId}" T1 icon must match its gameplay catalog icon "${definition.icon}"`);
        }
        for (const [role, artId] of [['icon', tierRow.iconArtId], ['wearable', tierRow.wearableArtId]] as const) {
          const binding = art.bindingById(artId);
          if (!binding || binding.id !== artId) throw new Error(`Equipment visual row "${equipmentId}" tier ${tier} references unknown ${role} binding "${artId}"`);
          if (binding.kind !== 'icon') throw new Error(`Equipment visual row "${equipmentId}" tier ${tier} ${role} binding "${artId}" has kind "${binding.kind}", expected "icon"`);
          if (binding.required !== true) throw new Error(`Equipment visual row "${equipmentId}" tier ${tier} ${role} binding "${artId}" must be required`);
          const identity = binding.resourceId
            ? `${binding.resourceId}\u0000${binding.frameKey ?? '<whole-image>'}` : binding.id;
          if (tierIdentities[role].has(identity)) throw new Error(`Equipment visual row "${equipmentId}" reuses ${role} artwork across tiers`);
          tierIdentities[role].add(identity);
        }
        this.#visuals.set(equipmentVisualKey(equipmentId, tier), deepFreeze({
          equipmentId,
          tier,
          iconArtId: tierRow.iconArtId,
          wearableArtId: tierRow.wearableArtId,
        }));
      }
      for (const tier of EQUIPMENT_TIERS) {
        if (!seenTiers.has(tier)) throw new Error(`Equipment visual row "${equipmentId}" is missing tier ${tier}`);
      }
      if (seenTiers.size !== EQUIPMENT_TIERS.length) throw new Error(`Equipment visual row "${equipmentId}" must contain exactly four tiers`);
    }
    Object.freeze(this);
  }

  resolveEquipmentVisual(equipmentId: string, tier: number): EquipmentVisualPresentation | undefined {
    if (typeof equipmentId !== 'string' || !Number.isSafeInteger(tier) || !EQUIPMENT_TIERS.includes(tier as 1 | 2 | 3 | 4)) return undefined;
    return this.#visuals.get(equipmentVisualKey(equipmentId, tier));
  }
}

/** Build the equipment presentation resolver from one immutable data snapshot.
 * Handcrafted legacy fixtures may omit the optional catalog; shipped root
 * validation requires it before this helper is used by production callers. */
export function createEquipmentVisualRegistry(
  data: Pick<GameData, 'equipment' | 'equipmentVisuals' | 'visualArt'>,
): DataEquipmentVisualRegistry | undefined {
  if (data.equipmentVisuals === undefined) return undefined;
  const bindings = new Map(data.visualArt.bindings.map((binding) => [binding.id, binding]));
  return new DataEquipmentVisualRegistry(
    data.equipmentVisuals,
    data.equipment ?? [],
    { bindingById: (id) => bindings.get(id) },
  );
}
