import type { GameContext, SelectCharacterFailureReason } from '../engine/context';
import { canSelectCharacter } from '../gameplay/characterSelection';
import { createConditionContext, type ProgressionCondition } from '../gameplay/conditionEvaluator';

export interface CharacterOptionView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly abilityName?: string;
  readonly abilityDescription?: string;
  readonly baseStatsSummary: string;
  readonly passiveSummary: string;
  readonly startingWeaponSummary: string;
  /** Always shown for locked choices; also makes earned goals inspectable. */
  readonly unlockRequirement: string;
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
    const weaponNames = new Map(context.data.weapons.map((weapon) => [weapon.id, weapon.name] as const));
    const facts = createConditionContext(context.saveData.progression, {
      stages: context.saveData.stages,
      achievements: context.saveData.achievements,
      characters: context.saveData.characters,
      bosses: context.saveData.bosses,
    });
    const characters = context.characters.all().map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      ...(character.abilityId !== undefined && abilities.get(character.abilityId) !== undefined
        ? { abilityName: abilities.get(character.abilityId)!.name, abilityDescription: abilities.get(character.abilityId)!.description }
        : {}),
      baseStatsSummary: `${character.baseStats.maxHealth} health • ${character.baseStats.moveSpeed} speed`,
      passiveSummary: character.passives.map((passive) => `${passive.name}: ${passive.description}`).join(' • ') || 'No passive.',
      startingWeaponSummary: character.startingWeaponIds.map((id) => weaponNames.get(id) ?? id).join(' • '),
      unlockRequirement: describeCharacterUnlock(character.unlock),
      locked: !canSelectCharacter(character, facts),
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

function describeCharacterUnlock(condition: ProgressionCondition): string {
  switch (condition.type) {
    case 'always': return 'Available from the start.';
    case 'stage-cleared': return `Clear ${condition.stageId}.`;
    case 'boss-defeated': return `Defeat ${condition.bossId}.`;
    case 'achievement-completed': return `Complete ${condition.achievementId}.`;
    case 'mastery-reached': return `Reach mastery tier ${condition.tier} with ${condition.subjectId}.`;
    case 'owns-content': return `Unlock ${condition.contentId}.`;
    case 'scrap-total': return `Bank ${condition.threshold} scrap.`;
    case 'permanent-level': return `Reach ${condition.upgradeId} level ${condition.minLevel}.`;
    case 'unlock-count': return `Unlock ${condition.minCount} content items.`;
    case 'all': return condition.conditions.map(describeCharacterUnlock).join(' Then ');
    case 'any': return condition.conditions.map(describeCharacterUnlock).join(' Or ');
    case 'not': return `Do not: ${describeCharacterUnlock(condition.condition)}`;
  }
}
