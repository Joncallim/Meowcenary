import { isSnapshotAchievementMetric, metricExtractor } from '../systems/achievements';
/**
 * Achievements controller — read-model + controller for the achievement
 * gallery UI. Follows the StageSelectionController pattern.
 *
 * Hidden achievements stay hidden in the read model until completed
 * (Epic 22 product rule 8/9: discovery is part of the reward; no checklist
 * grind, no manipulative hidden requirements). The read model is a frozen
 * snapshot; the view consumes only this, never raw definitions.
 */
import type { GameContext } from '../engine/context';
import type { DataAchievementRegistry } from '../systems/achievements';
import type { AchievementDefinition } from '../gameplay/achievementSystem';
import { createConditionContext, evaluateCondition, type ProgressionCondition, type ConditionContext } from '../gameplay/conditionEvaluator';
import { describeProgressionGrant } from './progressionPresentation';

/** Never use an unrevealed achievement's own art as a lock glyph: the image
 * itself would reveal the reward before its discovery boundary. */
export const HIDDEN_ACHIEVEMENT_ICON_ART_ID = 'achievement-icon:hidden';

export type AchievementViewStatus = 'locked' | 'in-progress' | 'completed';

export interface AchievementView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Player-facing summary of the durable reward; the gallery never exposes
   * raw grant JSON or asks the UI to interpret it. */
  readonly rewardSummary: string;
  /** A semantic logical-art ID. It is safe to render directly from this
   * presentation DTO; callers never derive it from a display name. */
  readonly iconArtId: string;
  readonly kind: AchievementDefinition['kind'];
  readonly hidden: boolean;
  readonly status: AchievementViewStatus;
  /** Current progress toward target (0 when locked/unknown). */
  readonly progress: number;
  readonly target: number;
  readonly completedAt?: number;
}

export interface AchievementsSnapshot {
  readonly revision: number;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly achievements: readonly AchievementView[];
  readonly selectedAchievementId?: string;
  readonly selectedAchievement?: AchievementView;
}

export class AchievementsController {
  private readonly context: GameContext;
  private readonly registry: DataAchievementRegistry;
  private revision = 0;
  private selectedAchievementId?: string;

  constructor(context: GameContext, registry: DataAchievementRegistry) {
    this.context = context;
    this.registry = registry;
  }

  snapshot(): AchievementsSnapshot {
    const { context } = this;
    const state = context.saveData.achievements;
    const facts = createConditionContext(context.saveData.progression, context.saveData);

    const views = this.registry.all().map((definition): AchievementView => {
      const progress = state[definition.id];
      const completed = progress?.completed === true;

      // Hidden achievements are invisible until completed.
      if (definition.hidden === true && !completed) {
        return Object.freeze({
          id: definition.id,
          name: '???',
          description: 'Hidden achievement — keep playing to discover it.',
          rewardSummary: 'Reward revealed on completion.',
          iconArtId: HIDDEN_ACHIEVEMENT_ICON_ART_ID,
          kind: definition.kind,
          hidden: true,
          status: 'locked' as const,
          progress: 0,
          target: definition.target,
        });
      }

      const conditionProgress = definition.condition ? conditionSteps(definition.condition, facts) : undefined;
      const target = conditionProgress?.target ?? definition.target;
      const snapshotProgress = definition.metricId && isSnapshotAchievementMetric(definition.metricId)
        ? metricExtractor(definition.metricId)?.({ metrics: context.saveData.achievementMetrics, gunsmith: context.saveData.gunsmith, equipment: context.saveData.equipment, catalog: context.data })
        : undefined;
      const current = completed ? target : (snapshotProgress ?? conditionProgress?.progress ?? progress?.progress ?? 0);
      const status: AchievementViewStatus = completed
        ? 'completed'
        : current > 0
          ? 'in-progress'
          : 'locked';

      return Object.freeze({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        rewardSummary: describeRewards(definition, context.data),
        iconArtId: definition.presentation.iconArtId,
        kind: definition.kind,
        hidden: definition.hidden === true,
        status,
        progress: Math.min(current, target),
        target,
        ...(completed && progress?.completedAt !== undefined ? { completedAt: progress.completedAt } : {}),
      });
    });

    const completedCount = views.filter((v) => v.status === 'completed').length;
    const selectedAchievement = views.find((view) => view.id === this.selectedAchievementId) ?? views[0];
    this.selectedAchievementId = selectedAchievement?.id;
    return Object.freeze({
      revision: this.revision,
      completedCount,
      totalCount: views.length,
      achievements: Object.freeze(views),
      ...(selectedAchievement === undefined ? {} : {
        selectedAchievementId: selectedAchievement.id,
        selectedAchievement,
      }),
    });
  }

  /** Presentation-only selection. It does not touch progression or storage. */
  select(id: string): AchievementsSnapshot {
    if (this.registry.achievementById(id)) this.selectedAchievementId = id;
    return this.snapshot();
  }

  /** Bumps the revision when the underlying save state changes. */
  invalidate(): void {
    this.revision += 1;
  }
}

/** Partial requirement progress is a read model over canonical facts, not a counter. */
function conditionSteps(condition: ProgressionCondition, facts: ConditionContext): { progress: number; target: number } {
  if (condition.type === 'mastery-reached') return { progress: Math.min(condition.tier, facts.characters[condition.subjectId]?.tier ?? 0), target: condition.tier };
  if (condition.type === 'all') return { progress: condition.conditions.filter((child) => evaluateCondition(child, facts)).length, target: condition.conditions.length };
  return { progress: evaluateCondition(condition, facts) ? 1 : 0, target: 1 };
}

function dependsOn(condition: ProgressionCondition | undefined, id: string): boolean {
  if (!condition) return false;
  if (condition.type === 'achievement-completed') return condition.achievementId === id;
  if (condition.type === 'all' || condition.type === 'any') return condition.conditions.some((child) => dependsOn(child, id));
  return false;
}

function describeRewards(definition: AchievementDefinition, data: GameContext['data']): string {
  const labels = (definition.rewards ?? []).map(({ grant }) => describeProgressionGrant(grant, data, 'sentence'));
  // Consuming catalog conditions are the availability authority. No duplicate grants.
  for (const character of data.characters) if (dependsOn(character.unlock, definition.id)) labels.push(`Unlock path: ${character.name}`);
  for (const part of data.gunParts ?? []) if (dependsOn(part.unlock, definition.id)) labels.push(`Blueprint path: ${part.name}`);
  for (const set of data.equipmentSets ?? []) if (dependsOn(set.unlock, definition.id)) labels.push(`Blueprint path: ${set.name} Set`);
  return labels.join(' • ') || 'Achievement badge; no item granted.';
}
