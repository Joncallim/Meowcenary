import { describe, expect, it } from 'vitest';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';

describe('DataWeaponRegistry', () => {
  it('resolves weapons by id', () => {
    const registry = new DataWeaponRegistry(loadGameData());

    expect(registry.weaponById('scrap-pistol-t1')?.family).toBe('pistol');
  });

  it('resolves weapons by family and tier', () => {
    const registry = new DataWeaponRegistry(loadGameData());

    expect(registry.weaponByFamilyTier('shotgun', 2)?.id).toBe('bolt-shotgun-t2');
  });

  it('returns undefined for missing family and tier lookups', () => {
    const registry = new DataWeaponRegistry(loadGameData());

    expect(registry.weaponByFamilyTier('laser', 1)).toBeUndefined();
    expect(registry.weaponByFamilyTier('pistol', 9)).toBeUndefined();
  });

  it('returns family weapons sorted by tier', () => {
    const registry = new DataWeaponRegistry(loadGameData());

    expect(registry.weaponsByFamily('smg').map((weapon) => weapon.mergeTier)).toEqual([1, 2, 3]);
  });

  it('creates sequential runtime weapon instances per registry', () => {
    const registry = new DataWeaponRegistry(loadGameData());
    const pistol = registry.weaponById('scrap-pistol-t1');
    if (!pistol) {
      throw new Error('missing pistol');
    }

    expect(registry.createWeaponInstance(pistol).instanceId).toBe('weapon-1');
    expect(registry.createWeaponInstance(pistol).instanceId).toBe('weapon-2');
  });
});
