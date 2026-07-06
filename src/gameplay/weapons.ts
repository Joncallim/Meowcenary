import type { WeaponDefinition } from '../systems/types';

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

let nextWeaponInstanceId = 1;

export function createWeaponInstance(
  def: WeaponDefinition,
  instanceId?: string,
): WeaponInstance {
  const resolvedInstanceId = instanceId ?? `weapon-${nextWeaponInstanceId}`;
  if (instanceId === undefined) {
    nextWeaponInstanceId += 1;
  }

  return {
    instanceId: resolvedInstanceId,
    defId: def.id,
    family: def.family,
    tier: def.mergeTier,
  };
}

export function createDefaultWeaponLoadout(registry: WeaponRegistry): WeaponInstance[] {
  return ['pistol', 'smg', 'shotgun']
    .map((family) => registry.weaponByFamilyTier(family, 1))
    .filter((def): def is WeaponDefinition => def !== undefined)
    .map((def) => registry.createWeaponInstance(def));
}

export function resetWeaponInstanceIdsForTests(): void {
  nextWeaponInstanceId = 1;
}
