import type { CharacterDefinition } from '../systems/types';
import type { MetaState } from '../systems/save';
import { isUnlocked } from '../gameplay/meta';

export function canSelectCharacter(
  character: Readonly<CharacterDefinition>,
  meta: Readonly<MetaState>,
): boolean {
  if (character.unlock.type === 'default') return true;
  return isUnlocked(meta, character.unlock.requiresUnlockId);
}

export function selectableCharacters(
  registry: {
    all(): readonly Readonly<CharacterDefinition>[];
    characterById(id: string): Readonly<CharacterDefinition> | undefined;
  },
  meta: Readonly<MetaState>,
): readonly Readonly<CharacterDefinition>[] {
  return registry.all().filter((character) => canSelectCharacter(character, meta));
}

export function defaultCharacterId(
  registry: { all(): readonly Readonly<CharacterDefinition>[] },
): string {
  const character = registry.all().find((character) => character.unlock.type === 'default');
  if (!character) {
    throw new Error('Character catalog has no default character');
  }
  return character.id;
}
