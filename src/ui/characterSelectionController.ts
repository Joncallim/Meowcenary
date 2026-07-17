import type { GameContext, SelectCharacterFailureReason } from '../engine/context';
import type { RunRequest } from '../gameplay/runRequest';
import { createRunRequest, defaultArenaId } from '../gameplay/runRequest';
import { canSelectCharacter } from '../gameplay/characterSelection';
import type { Rng } from '../engine/rng';

export interface CharacterOptionView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
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
    const characters = context.characters.all().map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      locked: !canSelectCharacter(character, context.saveData.meta),
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

  buildRunRequest(rng: Pick<Rng, 'int'>): RunRequest {
    const arenaId = defaultArenaId(this.context);
    const selectedId = this.context.selectedCharacterId;
    const character = this.context.characters.characterById(selectedId);
    const characterId = character && canSelectCharacter(character, this.context.saveData.meta)
      ? selectedId
      : this.context.characters.defaultCharacterId();
    return createRunRequest({ characterId, arenaId, rng });
  }
}
