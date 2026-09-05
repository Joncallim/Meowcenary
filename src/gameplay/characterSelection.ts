import type { CharacterDefinition } from '../systems/types';
import type { ConditionContext } from './conditionEvaluator';
import { evaluateCondition } from './conditionEvaluator';

export function canSelectCharacter(
  character: Readonly<CharacterDefinition>,
  facts: Readonly<ConditionContext>,
): boolean {
  return evaluateCondition(character.unlock, facts);
}

export function selectableCharacters(
  registry: {
    all(): readonly Readonly<CharacterDefinition>[];
    characterById(id: string): Readonly<CharacterDefinition> | undefined;
  },
  facts: Readonly<ConditionContext>,
): readonly Readonly<CharacterDefinition>[] {
  return registry.all().filter((character) => canSelectCharacter(character, facts));
}

export function defaultCharacterId(
  registry: { all(): readonly Readonly<CharacterDefinition>[] },
): string {
  const character = registry.all().find((character) => character.unlock.type === 'always');
  if (!character) {
    throw new Error('Character catalog has no default character');
  }
  return character.id;
}
