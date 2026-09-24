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
        rewardSummary: describeRewards(definition.rewards ?? [], context.data),
        iconArtId: definition.presentation.iconArtId,
        kind: definition.kind,
        hidden: definition.hidden === true,
        status,
        progress: Math.min(current, definition.target),
        target: definition.target,
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

function describeRewards(
  rewards: readonly { readonly grant: import('../gameplay/grantProcessor').ProgressionGrant }[],
  data: GameContext['data'],
): string {
  if (rewards.length === 0) return 'No persistent reward.';
  return rewards.map(({ grant }) => {
    switch (grant.type) {
      case 'grant-scrap': return `+${grant.amount} scrap`;
      case 'unlock-character': return `Unlocks ${nameFor(data.characters, grant.characterId, 'character')}`;
      case 'unlock-part': return `Unlocks ${nameFor(data.gunParts, grant.partId, 'part')}`;
      case 'unlock-equipment': return `Unlocks ${nameFor(data.equipment, grant.equipmentId, 'equipment')}`;
      case 'unlock-trait': return 'Unlocks a trait';
      case 'unlock-stage': return `Unlocks ${nameFor(data.stages, grant.stageId, 'contract')}`;
      case 'grant-part-instance': return `Earns ${nameFor(data.gunParts, grant.partId, 'part')}`;
      case 'grant-equipment-instance': return `Earns ${nameFor(data.equipment, grant.equipmentId, 'equipment')}`;
      case 'permanent-upgrade-level': return `Improves ${nameFor(data.metaUpgrades, grant.upgradeId, 'upgrade')}`;
      case 'achievement-completed': return 'Completes an achievement';
      case 'grant-item': return 'Earns an item';
    }
  }).join(' • ');
}

function nameFor(
  rows: readonly { readonly id: string; readonly name: string }[] | undefined,
  id: string,
  fallback: string,
): string {
  return rows?.find((row) => row.id === id)?.name ?? fallback;
}
