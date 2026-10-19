/**
 * Weapon Family registry — data-owned family identity and Gunsmith slot
 * compatibility. Replaces hard-coded pistol|smg|shotgun lists.
 *
 * V4 (Slice D): family catalog owns stable family identity, player-facing
 * name, physical Gunsmith slot compatibility, and the persistent Gunsmith
 * chassis art. Weapon tier definitions, firing behavior, and loot membership
 * remain in their current authoritative catalogs.
 */
import type { PartSlot } from './gunsmith';
import rawFamilies from '../data/weapon-families.json';

export interface WeaponFamilyDefinition {
  readonly id: string;
  readonly name: string;
  /** Family-owned workshop chassis; weapon tiers must not duplicate it. */
  readonly gunsmithBaseArtId: string;
  readonly gunsmithSlots: readonly PartSlot[];
}

let registry: ReadonlyMap<string, WeaponFamilyDefinition> | null = null;

const VALID_SLOTS = new Set<PartSlot>([
  'receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait',
]);

function rawFamilyRows(): readonly unknown[] {
  return Array.isArray(rawFamilies) ? rawFamilies as readonly unknown[] : [];
}

/** Lazy-load the family registry from JSON data. */
function getRegistry(): ReadonlyMap<string, WeaponFamilyDefinition> {
  if (!registry) {
    const map = new Map<string, WeaponFamilyDefinition>();
    for (const row of rawFamilies as WeaponFamilyDefinition[]) {
      if (row.id && row.name && row.gunsmithBaseArtId && Array.isArray(row.gunsmithSlots)) {
        map.set(row.id, Object.freeze({
          id: row.id,
          name: row.name,
          gunsmithBaseArtId: row.gunsmithBaseArtId,
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
  for (const family of getRegistry().values()) {
    if (!/^gun-build-base:[a-z0-9][a-z0-9-]{0,63}$/.test(family.gunsmithBaseArtId)) {
      errors.push(`family '${family.id}': invalid Gunsmith chassis art '${family.gunsmithBaseArtId}'`);
    }
    for (const slot of family.gunsmithSlots) {
      if (!VALID_SLOTS.has(slot)) {
        errors.push(`family '${family.id}': unknown slot '${slot}'`);
      }
    }
  }
  return errors;
}

/** Validate the family-owned chassis contract against the visual-art catalog.
 *  The optional set keeps this registry usable by focused gameplay tests. */
export function validateFamilyCatalog(visualArtIds?: ReadonlySet<string>): readonly string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenChassis = new Set<string>();
  if (!Array.isArray(rawFamilies)) errors.push('weapon-families.json: expected an array');
  for (const [index, row] of rawFamilyRows().entries()) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      errors.push(`family[${index}]: expected an object`);
      continue;
    }
    const record = row as Record<string, unknown>;
    const id = record.id;
    const name = record.name;
    const chassis = record.gunsmithBaseArtId;
    const slots = record.gunsmithSlots;
    if (typeof id !== 'string' || id.length === 0) errors.push(`family[${index}]: id must be a non-empty string`);
    if (typeof name !== 'string' || name.length === 0) errors.push(`family[${index}]: name must be a non-empty string`);
    if (typeof id === 'string' && id.length > 0) {
      if (seenIds.has(id)) errors.push(`family '${id}': duplicate id`);
      seenIds.add(id);
    }
    if (typeof chassis !== 'string' || chassis.length === 0) {
      errors.push(`family '${typeof id === 'string' ? id : index}': missing Gunsmith chassis art`);
    } else {
      if (!/^gun-build-base:[a-z0-9][a-z0-9-]{0,63}$/.test(chassis)) {
        errors.push(`family '${typeof id === 'string' ? id : index}': invalid Gunsmith chassis art '${chassis}'`);
      }
      if (seenChassis.has(chassis)) errors.push(`family '${typeof id === 'string' ? id : index}': duplicate Gunsmith chassis art '${chassis}'`);
      seenChassis.add(chassis);
      if (typeof id === 'string' && chassis !== `gun-build-base:${id}`) {
        errors.push(`family '${id}': Gunsmith chassis art must be 'gun-build-base:${id}'`);
      }
      if (visualArtIds !== undefined && !visualArtIds.has(chassis)) {
        errors.push(`family '${typeof id === 'string' ? id : index}': unknown Gunsmith chassis art '${chassis}'`);
      }
    }
    if (!Array.isArray(slots)) errors.push(`family '${typeof id === 'string' ? id : index}': gunsmithSlots must be an array`);
    else for (const slot of slots) if (!VALID_SLOTS.has(slot as PartSlot)) errors.push(`family '${typeof id === 'string' ? id : index}': unknown slot '${String(slot)}'`);
  }
  errors.push(...validateFamilySlots());
  for (const family of getAllWeaponFamilies()) {
    if (!seenIds.has(family.id)) errors.push(`family '${family.id}': registry row is missing from source data`);
    if (visualArtIds !== undefined && !visualArtIds.has(family.gunsmithBaseArtId)) {
      errors.push(`family '${family.id}': unknown Gunsmith chassis art '${family.gunsmithBaseArtId}'`);
    }
  }
  return errors;
}
