import type { WeaponInstance, WeaponRegistry } from './weapons';

export function canMerge(
  a: WeaponInstance,
  b: WeaponInstance,
  registry: Pick<WeaponRegistry, 'weaponById' | 'weaponByFamilyTier'>,
): boolean {
  if (a.instanceId === b.instanceId || a.family !== b.family || a.tier !== b.tier) {
    return false;
  }

  const aDefinition = registry.weaponById(a.defId);
  const bDefinition = registry.weaponById(b.defId);
  if (
    !aDefinition ||
    !bDefinition ||
    aDefinition.mergeTier !== a.tier ||
    bDefinition.mergeTier !== b.tier ||
    aDefinition.family !== a.family ||
    bDefinition.family !== b.family
  ) {
    return false;
  }

  return (
    aDefinition.id === bDefinition.id &&
    a.tier < aDefinition.maxTier &&
    registry.weaponByFamilyTier(a.family, a.tier + 1) !== undefined
  );
}

/**
 * Read-only rack query for UI/HUD affordances. Eligibility remains owned by
 * `canMerge`; callers never duplicate family/tier/definition rules.
 */
export function hasMergeablePair(
  list: readonly WeaponInstance[],
  registry: Pick<WeaponRegistry, 'weaponById' | 'weaponByFamilyTier'>,
): boolean {
  for (let first = 0; first < list.length; first += 1) {
    for (let second = first + 1; second < list.length; second += 1) {
      if (canMerge(list[first]!, list[second]!, registry)) {
        return true;
      }
    }
  }
  return false;
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
  const aMatches = list.filter((weapon) => weapon.instanceId === a.instanceId);
  const bMatches = list.filter((weapon) => weapon.instanceId === b.instanceId);
  const resultIdAlreadyExists = list.some((weapon) => weapon.instanceId === result.instanceId);
  if (
    a.instanceId === b.instanceId ||
    aMatches.length !== 1 ||
    bMatches.length !== 1 ||
    !sameWeaponInstance(aMatches[0], a) ||
    !sameWeaponInstance(bMatches[0], b) ||
    resultIdAlreadyExists
  ) {
    return [...list];
  }

  const consumed = new Set([a.instanceId, b.instanceId]);
  return [...list.filter((weapon) => !consumed.has(weapon.instanceId)), result];
}

function sameWeaponInstance(a: WeaponInstance, b: WeaponInstance): boolean {
  return (
    a.instanceId === b.instanceId &&
    a.defId === b.defId &&
    a.family === b.family &&
    a.tier === b.tier
  );
}
