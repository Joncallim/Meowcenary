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

export type AchievementViewStatus = 'locked' | 'in-progress' | 'completed';

export interface AchievementView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Player-facing summary of the durable reward; the gallery never exposes
   * raw grant JSON or asks the UI to interpret it. */
  readonly rewardSummary: string;
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
}

export class AchievementsController {
  private readonly context: GameContext;
  private readonly registry: DataAchievementRegistry;
  private revision = 0;

  constructor(context: GameContext, registry: DataAchievementRegistry) {
    this.context = context;
    this.registry = registry;
  }

  snapshot(): AchievementsSnapshot {
    const { context } = this;
    const state = context.saveData.achievements;

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
          kind: definition.kind,
          hidden: true,
          status: 'locked' as const,
          progress: 0,
          target: definition.target,
        });
      }

      const current = completed ? definition.target : (progress?.progress ?? 0);
      const status: AchievementViewStatus = completed
        ? 'completed'
        : current > 0
          ? 'in-progress'
          : 'locked';

      return Object.freeze({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        rewardSummary: describeRewards(definition.rewards ?? []),
        kind: definition.kind,
        hidden: definition.hidden === true,
        status,
        progress: Math.min(current, definition.target),
        target: definition.target,
        ...(completed && progress?.completedAt !== undefined ? { completedAt: progress.completedAt } : {}),
      });
    });

    const completedCount = views.filter((v) => v.status === 'completed').length;
    return Object.freeze({
      revision: this.revision,
      completedCount,
      totalCount: views.length,
      achievements: Object.freeze(views),
    });
  }

  /** Bumps the revision when the underlying save state changes. */
  invalidate(): void {
    this.revision += 1;
  }
}

function describeRewards(rewards: readonly { readonly grant: import('../gameplay/grantProcessor').ProgressionGrant }[]): string {
  if (rewards.length === 0) return 'No persistent reward.';
  return rewards.map(({ grant }) => {
    switch (grant.type) {
      case 'grant-scrap': return `+${grant.amount} scrap`;
      case 'unlock-character': return `Unlocks ${grant.characterId}`;
      case 'unlock-part': return `Unlocks ${grant.partId}`;
      case 'unlock-equipment': return `Unlocks ${grant.equipmentId}`;
      case 'unlock-trait': return `Unlocks ${grant.traitId}`;
      case 'unlock-stage': return `Unlocks ${grant.stageId}`;
      case 'grant-part-instance': return `Earns ${grant.partId}`;
      case 'grant-equipment-instance': return `Earns ${grant.equipmentId}`;
      case 'permanent-upgrade-level': return `Improves ${grant.upgradeId}`;
      case 'achievement-completed': return `Completes ${grant.achievementId}`;
      case 'grant-item': return `Earns ${grant.itemId}`;
    }
  }).join(' • ');
}
