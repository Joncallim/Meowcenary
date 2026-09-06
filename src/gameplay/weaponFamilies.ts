/**
 * Weapon Family registry — data-owned family identity and Gunsmith slot
 * compatibility. Replaces hard-coded pistol|smg|shotgun lists.
 *
 * V4 (Slice D): family catalog owns stable family identity, player-facing
 * name, and physical Gunsmith slot compatibility. Weapon tier definitions,
 * firing behavior, loot membership, and art remain in their current
 * authoritative catalogs.
 */
import type { PartSlot } from './gunsmith';
import rawFamilies from '../data/weapon-families.json';

export interface WeaponFamilyDefinition {
  readonly id: string;
  readonly name: string;
  readonly gunsmithSlots: readonly PartSlot[];
}

let registry: ReadonlyMap<string, WeaponFamilyDefinition> | null = null;

/** Lazy-load the family registry from JSON data. */
function getRegistry(): ReadonlyMap<string, WeaponFamilyDefinition> {
  if (!registry) {
    const map = new Map<string, WeaponFamilyDefinition>();
    for (const row of rawFamilies as WeaponFamilyDefinition[]) {
      if (row.id && row.name && Array.isArray(row.gunsmithSlots)) {
        map.set(row.id, Object.freeze({
          id: row.id,
          name: row.name,
          gunsmithSlots: Object.freeze([...row.gunsmithSlots]),
        }));
      }
    }
    registry = map;
  }
  return registry;
}

/** Check if a PartSlot is compatible with a given weapon family.
 *  The 'trait' slot is universally compatible. */
export function isSlotCompatible(familyId: string, slot: PartSlot): boolean {
  if (slot === 'trait') return true;
  const family = getRegistry().get(familyId);
  return family ? family.gunsmithSlots.includes(slot) : false;
}

/** Get all PartSlots compatible with a weapon family. */
export function getFamilySlots(familyId: string): readonly PartSlot[] {
  const family = getRegistry().get(familyId);
  return family ? family.gunsmithSlots : [];
}

/** Get a family definition by ID. */
export function getWeaponFamily(familyId: string): WeaponFamilyDefinition | undefined {
  return getRegistry().get(familyId);
}

/** Get all registered weapon family IDs. */
export function getAllFamilyIds(): readonly string[] {
  return [...getRegistry().keys()];
}

/** Get all registered weapon family definitions. */
export function getAllWeaponFamilies(): readonly WeaponFamilyDefinition[] {
  return [...getRegistry().values()];
}

/** Check if a family ID is registered. */
export function isValidFamily(familyId: string): boolean {
  return getRegistry().has(familyId);
}

/** Validate all PartSlot references in the family catalog. */
export function validateFamilySlots(): readonly string[] {
  const errors: string[] = [];
  const validSlots = new Set<PartSlot>([
    'receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait',
  ]);
  for (const family of getRegistry().values()) {
    for (const slot of family.gunsmithSlots) {
      if (!validSlots.has(slot)) {
        errors.push(`family '${family.id}': unknown slot '${slot}'`);
      }
    }
  }
  return errors;
}
