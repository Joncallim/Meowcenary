import type { WeaponInstance, WeaponRegistry } from './weapons';

export function canMerge(
  a: WeaponInstance,
  b: WeaponInstance,
  registry: Pick<WeaponRegistry, 'weaponById' | 'weaponByFamilyTier'>,
): boolean {
  if (a.instanceId === b.instanceId || a.family !== b.family || a.tier !== b.tier) {
    return false;
  }

  const definition = registry.weaponById(a.defId);
  if (!definition || definition.mergeTier !== a.tier || definition.family !== a.family) {
    return false;
  }

  return a.tier < definition.maxTier && registry.weaponByFamilyTier(a.family, a.tier + 1) !== undefined;
}

export function mergeResult(
  a: WeaponInstance,
  b: WeaponInstance,
  registry: Pick<WeaponRegistry, 'weaponById' | 'weaponByFamilyTier' | 'createWeaponInstance'>,
): WeaponInstance | null {
  if (!canMerge(a, b, registry)) {
    return null;
  }

  const nextDefinition = registry.weaponByFamilyTier(a.family, a.tier + 1);
  return nextDefinition ? registry.createWeaponInstance(nextDefinition) : null;
}

export function replaceMergedWeapons(
  list: readonly WeaponInstance[],
  a: WeaponInstance,
  b: WeaponInstance,
  result: WeaponInstance,
): WeaponInstance[] {
  const consumed = new Set([a.instanceId, b.instanceId]);
  return [...list.filter((weapon) => !consumed.has(weapon.instanceId)), result];
}
