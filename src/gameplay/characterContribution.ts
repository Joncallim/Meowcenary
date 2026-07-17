import type { CharacterDefinition } from '../systems/types';
import type { CharacterRunContribution } from './runStart';
import type { Modifier } from './stats';
import type { WeaponRegistry } from './weapons';

export function resolveCharacterRunContribution(
  character: Readonly<CharacterDefinition>,
  weaponRegistry: WeaponRegistry,
): CharacterRunContribution {
  const passiveModifiers: Modifier[] = [];
  for (const passive of character.passives) {
    if (passive.kind !== 'static') continue;
    const sourceId = `character:${character.id}:${passive.id}`;
    for (const effect of passive.effects) {
      passiveModifiers.push({
        stat: effect.stat,
        op: effect.op,
        value: effect.value,
        sourceId,
      });
    }
  }

  const startingWeapons = character.startingWeaponIds.map((weaponId) => {
    const definition = weaponRegistry.weaponById(weaponId);
    if (!definition) {
      throw new Error(
        `Character "${character.id}" references unknown weapon "${weaponId}"`,
      );
    }
    return weaponRegistry.createWeaponInstance(definition);
  });

  return Object.freeze({
    baseStats: { ...character.baseStats },
    passiveModifiers: Object.freeze(passiveModifiers),
    startingWeapons,
  });
}
