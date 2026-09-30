import type { GameContext, SelectCharacterFailureReason } from '../engine/context';
import { canSelectCharacter } from '../gameplay/characterSelection';
import { createConditionContext, type ProgressionCondition } from '../gameplay/conditionEvaluator';

export interface CharacterOptionView {
  readonly id: string;
  readonly actorArtId: string;
  readonly portraitArtId: string;
  readonly name: string;
  readonly description: string;
  readonly abilityName?: string;
  readonly abilityDescription?: string;
  readonly abilityIconArtId?: string;
  readonly baseStatsSummary: string;
  readonly passiveSummary: string;
  readonly passives: readonly { readonly name: string; readonly description: string; readonly iconArtId: string }[];
  readonly startingWeaponSummary: string;
  readonly startingWeaponIconArtId: string;
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
    const weapons = new Map(context.data.weapons.map((weapon) => [weapon.id, weapon] as const));
    const playerFacingNames = new Map<string, string>();
    for (const item of [
      ...context.characters.all(),
      ...context.data.enemies,
      ...(context.data.stages ?? []),
      ...(context.data.achievements ?? []),
      ...context.data.weapons,
      ...(context.data.equipment ?? []),
      ...(context.data.gunParts ?? []),
      ...context.data.metaUpgrades,
    ]) playerFacingNames.set(item.id, item.name);
    const labelFor = (id: string): string => playerFacingNames.get(id) ?? humanizeStableId(id);
    const facts = createConditionContext(context.saveData.progression, {
      stages: context.saveData.stages,
      achievements: context.saveData.achievements,
      characters: context.saveData.characters,
      bosses: context.saveData.bosses,
    });
    const characters = context.characters.all().map((character) => ({
      id: character.id,
      actorArtId: `character:${character.id}`,
      portraitArtId: character.presentation.portraitArtId,
      name: character.name,
      description: character.description,
      ...(character.abilityId !== undefined && abilities.get(character.abilityId) !== undefined
        ? { abilityName: abilities.get(character.abilityId)!.name, abilityDescription: abilities.get(character.abilityId)!.description, abilityIconArtId: abilities.get(character.abilityId)!.presentation.iconArtId }
        : {}),
      baseStatsSummary: `${character.baseStats.maxHealth} health • ${character.baseStats.moveSpeed} speed`,
      passiveSummary: character.passives.map((passive) => `${passive.name}: ${passive.description}`).join(' • ') || 'No passive.',
      passives: Object.freeze(character.passives.map((passive) => Object.freeze({ name: passive.name, description: passive.description, iconArtId: passive.presentation.iconArtId }))),
      startingWeaponSummary: character.startingWeaponIds.map((id) => weapons.get(id)?.name ?? id).join(' • '),
      startingWeaponIconArtId: weapons.get(character.startingWeaponIds[0]!)?.art.iconId ?? '',
      unlockRequirement: describeCharacterUnlock(character.unlock, labelFor),
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

function describeCharacterUnlock(condition: ProgressionCondition, labelFor: (id: string) => string): string {
  switch (condition.type) {
    case 'always': return 'Available from the start.';
    case 'stage-cleared': return `Clear ${labelFor(condition.stageId)}.`;
    case 'boss-defeated': return `Defeat ${labelFor(condition.bossId)}.`;
    case 'achievement-completed': return `Complete ${labelFor(condition.achievementId)}.`;
    case 'mastery-reached': return `Reach mastery tier ${condition.tier} with ${labelFor(condition.subjectId)}.`;
    case 'owns-content': return `Unlock ${labelFor(condition.contentId)}.`;
    case 'scrap-total': return `Bank ${condition.threshold} scrap.`;
    case 'permanent-level': return `Reach ${labelFor(condition.upgradeId)} level ${condition.minLevel}.`;
    case 'unlock-count': return `Unlock ${condition.minCount} content items.`;
    case 'all': return condition.conditions.map((entry) => describeCharacterUnlock(entry, labelFor)).join(' Then ');
    case 'any': return condition.conditions.map((entry) => describeCharacterUnlock(entry, labelFor)).join(' Or ');
    case 'not': return `Do not: ${describeCharacterUnlock(condition.condition, labelFor)}`;
  }
}

function humanizeStableId(id: string): string {
  const tail = id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id;
  return tail.split('-').filter(Boolean).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ');
}
