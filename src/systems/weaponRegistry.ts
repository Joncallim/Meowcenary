import { deepFreeze } from '../engine/freeze';
import { createWeaponInstance as createRuntimeWeaponInstance } from '../gameplay/weapons';
import type { WeaponInstance, WeaponRegistry } from '../gameplay/weapons';
import type { GameData, WeaponDefinition } from './types';

export class DataWeaponRegistry implements WeaponRegistry {
  private readonly byId = new Map<string, Readonly<WeaponDefinition>>();
  private readonly byFamilyTier = new Map<string, Readonly<WeaponDefinition>>();
  private readonly byFamily = new Map<string, Readonly<WeaponDefinition>[]>();
  private nextInstanceId = 1;

  constructor(data: Pick<GameData, 'weapons'>) {
    const canonical = data.weapons.map((weapon) => deepFreeze(structuredClone(weapon)));

    for (const weapon of canonical) {
      this.byId.set(weapon.id, weapon);
      this.byFamilyTier.set(familyTierKey(weapon.family, weapon.mergeTier), weapon);

      const familyWeapons = this.byFamily.get(weapon.family) ?? [];
      familyWeapons.push(weapon);
      this.byFamily.set(weapon.family, familyWeapons);
    }

    for (const weapons of this.byFamily.values()) {
      weapons.sort((a, b) => a.mergeTier - b.mergeTier);
    }
  }

  weaponById(id: string): WeaponDefinition | undefined {
    return this.byId.get(id);
  }

  weaponByFamilyTier(family: string, tier: number): WeaponDefinition | undefined {
    return this.byFamilyTier.get(familyTierKey(family, tier));
  }

  weaponsByFamily(family: string): WeaponDefinition[] {
    return [...(this.byFamily.get(family) ?? [])];
  }

  createWeaponInstance(def: WeaponDefinition): WeaponInstance {
    const instance = createRuntimeWeaponInstance(def, `weapon-${this.nextInstanceId}`);
    this.nextInstanceId += 1;
    return instance;
  }
}

function familyTierKey(family: string, tier: number): string {
  return `${family}:${tier}`;
}
