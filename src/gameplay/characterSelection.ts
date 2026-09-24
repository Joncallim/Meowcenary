import type { CharacterDefinition } from '../systems/types';
import type { ConditionContext } from './conditionEvaluator';
import { evaluateCondition } from './conditionEvaluator';

export function canSelectCharacter(
  character: Readonly<CharacterDefinition>,
  facts: Readonly<ConditionContext>,
): boolean {
  return isCharacterAvailable(character, facts);
}

/** Shared availability authority for selectable Mercenaries. Kept on the
 * character boundary so menus, Career and terminal availability diffs cannot
 * accidentally drop migration-preserved entitlements. */
export function isCharacterAvailable(
  character: Readonly<Pick<CharacterDefinition, 'id' | 'unlock'>>,
  facts: Readonly<ConditionContext>,
): boolean {
  // V4 migration preserves characters earned under historical requirements as
  // explicit durable entitlements.  Current catalog conditions still govern
  // new unlocks, but must not revoke a previously earned Mercenary.
  return facts.progression.unlocks.includes(`character:${character.id}`)
    || evaluateCondition(character.unlock, facts);
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
