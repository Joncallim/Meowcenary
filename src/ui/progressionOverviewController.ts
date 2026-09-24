/**
 * Progression overview read model (Epic 26) — one coherent view of the
 * post-Alpha-3 progression web: stage ladder, boss milestone, achievements,
 * mastery, and roster unlocks. Consumes only frozen read models and the
 * shared condition evaluator; the player always sees a concrete next goal.
 * UI consumes this snapshot; it cannot grant anything.
 */
import type { GameContext } from '../engine/context';
import type { DataAchievementRegistry } from '../systems/achievements';
import { evaluateCondition, createConditionContext } from '../gameplay/conditionEvaluator';
import type { ProgressionCondition } from '../gameplay/conditionEvaluator';
import { isCharacterAvailable } from '../gameplay/characterSelection';
import { describeProgressionCondition } from './progressionPresentation';

export interface NextGoalView {
  readonly kind: 'stage' | 'boss' | 'achievement' | 'mastery' | 'character';
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly priority: number;
  readonly artId: string;
}

export interface ProgressionOverviewSnapshot {
  readonly revision: number;
  readonly completedStages: number;
  readonly totalStages: number;
  readonly completedAchievements: number;
  readonly totalAchievements: number;
  readonly unlockedCharacters: number;
  readonly totalCharacters: number;
  /** Sorted by priority: the player's concrete next goals. */
  readonly nextGoals: readonly NextGoalView[];
}

export class ProgressionOverviewController {
  private readonly context: GameContext;
  private readonly achievements: DataAchievementRegistry;
  private revision = 0;

  constructor(context: GameContext, achievements: DataAchievementRegistry) {
    this.context = context;
    this.achievements = achievements;
  }

  invalidate(): void {
    this.revision += 1;
  }

  snapshot(): ProgressionOverviewSnapshot {
    const { context } = this;
    const conditionCtx = createConditionContext(
      context.saveData.progression,
      {
        stages: context.saveData.stages,
        bosses: context.saveData.bosses,
        achievements: context.saveData.achievements,
        characters: context.saveData.characters,
      },
    );

    const nextGoals: NextGoalView[] = [];

    // 1. Next uncompleted stage (the concrete next contract to play).
    // StageRegistry already supplies the validated unlock-chain order. Do not
    // re-sort by chapter-local display numbers here or a later chapter's
    // first contract would appear ahead of the current chapter's boss.
    const stages = context.stages.allStages();
    const nextStage = stages.find((stage) => !context.saveData.stages[stage.id]?.completed);
    if (nextStage) {
      const stageLocked = !evaluateCondition(
        nextStage.unlock as unknown as ProgressionCondition,
        conditionCtx,
      );
      nextGoals.push({
        kind: 'stage',
        id: nextStage.id,
        title: stageLocked ? `Unlock ${nextStage.name}` : `Clear ${nextStage.name}`,
        detail: stageLocked
          ? `${describeProgressionCondition(nextStage.unlock as unknown as ProgressionCondition, context.data)}.`
          : `Complete this Contract to advance in ${chapterName(nextStage.chapterId)}.`,
        priority: 1,
        artId: stageArtId(nextStage, context),
      });
    }

    // 2. Boss milestone (chapter-05 carries bossId).
    const bossStage = stages.find((stage) => stage.bossId !== undefined
      && !evaluateCondition({ type: 'stage-cleared', stageId: stage.id }, conditionCtx));
    if (bossStage) {
      nextGoals.push({
        kind: 'boss',
        id: bossStage.id,
        title: `Defeat the ${bossStage.name} boss`,
        detail: 'Boss milestones grant substantially better rewards and unlocks.',
        priority: 2,
        artId: bossStage.bossId ? `enemy:${bossStage.bossId}` : stageArtId(bossStage, context),
      });
    }

    // 3. Next incomplete non-hidden achievement.
    for (const achievement of this.achievements.all()) {
      if (achievement.hidden === true) continue;
      if (context.saveData.achievements[achievement.id]?.completed) continue;
      nextGoals.push({
        kind: 'achievement',
        id: achievement.id,
        title: achievement.name,
        detail: achievement.description,
        priority: 3,
        artId: achievement.presentation?.iconArtId ?? 'upgrade-icon:extra-scrap',
      });
      break; // one concrete achievement goal is enough
    }

    // 4. Mastery: next character tier above 0 (only when a tier is reachable).
    for (const character of context.characters.all()) {
      const mastery = context.saveData.characters[character.id];
      if (mastery && mastery.tier < 1) {
        nextGoals.push({
          kind: 'mastery',
          id: character.id,
          title: `Master ${character.name}`,
          detail: 'Reach mastery tier 1 to earn its achievement reward.',
          priority: 4,
          artId: `character:${character.id}`,
        });
        break;
      }
    }

    // 5. Next locked character with an explicit unlock condition.
    const characters = context.characters.all();
    const firstLockedCharacter = characters.find((character) => !isCharacterAvailable(character, conditionCtx));
    if (firstLockedCharacter) {
      nextGoals.push({
        kind: 'character',
        id: firstLockedCharacter.id,
        title: `Unlock ${firstLockedCharacter.name}`,
        detail: `Requires ${describeCharacterCondition(firstLockedCharacter.unlock, context)}.`,
        priority: 5,
        artId: `character:${firstLockedCharacter.id}`,
      });
    }

    const completedStages = stages.filter((s) => context.saveData.stages[s.id]?.completed).length;
    const achievementDefs = this.achievements.all();
    const completedAchievements = achievementDefs.filter((a) => context.saveData.achievements[a.id]?.completed).length;
    const unlockedCharacters = characters.filter((character) => isCharacterAvailable(character, conditionCtx)).length;

    return Object.freeze({
      revision: this.revision,
      completedStages,
      totalStages: stages.length,
      completedAchievements,
      totalAchievements: achievementDefs.length,
      unlockedCharacters,
      totalCharacters: characters.length,
      nextGoals: Object.freeze(nextGoals.sort((a, b) => a.priority - b.priority).slice(0, 3)),
    });
  }
}

function describeCharacterCondition(condition: import('../gameplay/conditionEvaluator').ProgressionCondition, context: GameContext): string {
  switch (condition.type) {
    case 'always': return 'no prerequisite';
    case 'stage-cleared': return `clear ${context.stages.stageById(condition.stageId)?.name ?? humanizeId(condition.stageId)}`;
    case 'boss-defeated': return `defeat ${context.data.enemies.find((enemy) => enemy.id === condition.bossId)?.name ?? humanizeId(condition.bossId)}`;
    case 'achievement-completed': return `complete ${context.data.achievements?.find((achievement) => achievement.id === condition.achievementId)?.name ?? humanizeId(condition.achievementId)}`;
    case 'mastery-reached': return `${context.characters.characterById(condition.subjectId)?.name ?? humanizeId(condition.subjectId)} mastery tier ${condition.tier}`;
    case 'owns-content': return `own ${humanizeId(condition.contentId)}`;
    case 'scrap-total': return `${condition.threshold} Scrap`;
    case 'permanent-level': return `${humanizeId(condition.upgradeId)} level ${condition.minLevel}`;
    case 'unlock-count': return `${condition.minCount} content unlocks`;
    case 'all': return condition.conditions.map((child) => describeCharacterCondition(child, context)).join(' and ');
    case 'any': return condition.conditions.map((child) => describeCharacterCondition(child, context)).join(' or ');
    case 'not': return `not ${describeCharacterCondition(condition.condition, context)}`;
  }
}

function stageArtId(stage: ReturnType<GameContext['stages']['allStages']>[number], context: GameContext): string {
  return context.arenas.arenaById(stage.arenaId)?.visual.floorArtIds[0] ?? 'upgrade-icon:extra-scrap';
}

function chapterName(chapterId: string): string {
  return (chapterId.split(':').at(-1) ?? chapterId).split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function humanizeId(id: string): string {
  return (id.split(':').at(-1) ?? id).split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
