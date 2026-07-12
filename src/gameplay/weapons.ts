import type { WeaponDefinition } from '../systems/types';

export const DEFAULT_WEAPON_FAMILIES = ['pistol', 'smg', 'shotgun'] as const;

export interface WeaponInstance {
  instanceId: string;
  defId: string;
  family: string;
  tier: number;
}

export interface WeaponRegistry {
  weaponById(id: string): WeaponDefinition | undefined;
  weaponByFamilyTier(family: string, tier: number): WeaponDefinition | undefined;
  weaponsByFamily(family: string): WeaponDefinition[];
  createWeaponInstance(def: WeaponDefinition): WeaponInstance;
}

export function createWeaponInstance(
  def: WeaponDefinition,
  instanceId: string,
): WeaponInstance {
  return {
    instanceId,
    defId: def.id,
    family: def.family,
    tier: def.mergeTier,
  };
}

export function createDefaultWeaponLoadout(registry: WeaponRegistry): WeaponInstance[] {
  return DEFAULT_WEAPON_FAMILIES.map((family) => {
    const definition = registry.weaponByFamilyTier(family, 1);
    if (!definition) {
      throw new Error(`Missing starter weapon family "${family}" at tier 1`);
    }

    return registry.createWeaponInstance(definition);
  });
}
