import { deepFreeze } from '../engine/freeze';
import type { CharacterDefinition, GameData } from './types';
import { validateCharacterCatalog } from './validation';
import { defaultCharacterId as resolveDefaultCharacterId } from '../gameplay/characterSelection';

export interface CharacterLookup {
  characterById(id: string): Readonly<CharacterDefinition> | undefined;
}

export interface CharacterRegistry extends CharacterLookup {
  all(): readonly Readonly<CharacterDefinition>[];
  defaultCharacterId(): string;
}

export class DataCharacterRegistry implements CharacterRegistry {
  private readonly byId = new Map<string, Readonly<CharacterDefinition>>();
  private readonly snapshot: readonly Readonly<CharacterDefinition>[];

  constructor(data: Pick<GameData, 'characters'>) {
    const validated = validateCharacterCatalog(data.characters);
    const canonical = validated.map((character) => deepFreeze(structuredClone(character)));

    for (const character of canonical) {
      if (this.byId.has(character.id)) {
        throw new Error(`Duplicate character id "${character.id}"`);
      }
      this.byId.set(character.id, character);
    }

    this.snapshot = Object.freeze([...canonical]);
  }

  characterById(id: string): Readonly<CharacterDefinition> | undefined {
    return this.byId.get(id);
  }

  all(): readonly Readonly<CharacterDefinition>[] {
    return this.snapshot;
  }

  defaultCharacterId(): string {
    return resolveDefaultCharacterId(this);
  }
}
