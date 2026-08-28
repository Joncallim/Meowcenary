import type { GameContext, SelectCharacterFailureReason } from '../engine/context';
import { canSelectCharacter } from '../gameplay/characterSelection';

export interface CharacterOptionView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly abilityName?: string;
  readonly abilityDescription?: string;
  readonly locked: boolean;
  readonly selected: boolean;
}

export interface CharacterSelectionSnapshot {
  readonly revision: number;
  readonly selectedCharacterId: string;
  readonly characters: readonly CharacterOptionView[];
}

export type SelectCharacterCommandResult =
  | { readonly ok: true; readonly snapshot: CharacterSelectionSnapshot }
  | {
      readonly ok: false;
      readonly reason: SelectCharacterFailureReason;
      readonly snapshot: CharacterSelectionSnapshot;
    };

export class CharacterSelectionController {
  private readonly context: GameContext;

  constructor(context: GameContext) {
    this.context = context;
  }

  snapshot(): CharacterSelectionSnapshot {
    const { context } = this;
    const selectedCharacterId = context.selectedCharacterId;
    const revision = context.selectionRevision;
    const abilities = new Map((context.data.abilities ?? []).map((ability) => [ability.id, ability] as const));
    const characters = context.characters.all().map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      ...(character.abilityId !== undefined && abilities.get(character.abilityId) !== undefined
        ? { abilityName: abilities.get(character.abilityId)!.name, abilityDescription: abilities.get(character.abilityId)!.description }
        : {}),
      locked: !canSelectCharacter(character, context.saveData.progression),
      selected: character.id === selectedCharacterId,
    }));
    return Object.freeze({
      revision,
      selectedCharacterId,
      characters: Object.freeze(characters),
    });
  }

  select(
    characterId: string,
    expectedRevision: number,
  ): SelectCharacterCommandResult {
    const result = this.context.selectCharacter(characterId, expectedRevision);
    const snapshot = this.snapshot();
    if (result.ok) {
      return Object.freeze({ ok: true, snapshot });
    }
    return Object.freeze({ ok: false, reason: result.reason, snapshot });
  }
}
