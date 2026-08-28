/**
 * Pure ProgressionCondition evaluator — no side effects, no I/O, no Phaser.
 * Alpha 3 shared foundation §3: one condition model for all unlock/prerequisite
 * decisions across Epics 20–26.
 */
import type { ProgressionState, StageProgressState, AchievementProgressState, CharacterMasteryState, BossProgressState } from '../systems/save';

export type ProgressionCondition =
  | { readonly type: 'stage-cleared'; readonly stageId: string }
  | { readonly type: 'boss-defeated'; readonly bossId: string }
  | { readonly type: 'achievement-completed'; readonly achievementId: string }
  | { readonly type: 'mastery-reached'; readonly subjectId: string; readonly tier: number }
  | { readonly type: 'owns-content'; readonly contentId: string }
  | { readonly type: 'all'; readonly conditions: readonly ProgressionCondition[] }
  | { readonly type: 'any'; readonly conditions: readonly ProgressionCondition[] }
  | { readonly type: 'not'; readonly condition: ProgressionCondition }
  | { readonly type: 'scrap-total'; readonly threshold: number }
  | { readonly type: 'permanent-level'; readonly upgradeId: string; readonly minLevel: number }
  | { readonly type: 'unlock-count'; readonly minCount: number };

/**
 * Snapshot of relevant progression state needed to evaluate conditions.
 * Pure — caller provides the snapshot; evaluator makes no I/O calls.
 */
export interface ConditionContext {
  readonly progression: Readonly<ProgressionState>;
  readonly stages: Readonly<StageProgressState>;
  readonly achievements: Readonly<AchievementProgressState>;
  readonly characters: Readonly<CharacterMasteryState>;
  /** Authoritative boss outcomes; achievements are consumers, never evidence. */
  readonly bosses?: Readonly<BossProgressState>;
}

/**
 * Evaluates a ProgressionCondition against a ConditionContext.
 * Returns true if the condition is satisfied, false otherwise.
 * Pure and deterministic — always returns the same result for the same inputs.
 */
export function evaluateCondition(
  condition: ProgressionCondition,
  ctx: ConditionContext,
): boolean {
  switch (condition.type) {
    case 'stage-cleared':
      return ctx.stages[condition.stageId]?.completed === true;

    case 'boss-defeated':
      return ctx.bosses?.[condition.bossId]?.defeated === true;

    case 'achievement-completed':
      return ctx.achievements[condition.achievementId]?.completed === true;

    case 'mastery-reached':
      return (ctx.characters[condition.subjectId]?.tier ?? 0) >= condition.tier;

    case 'owns-content':
      return ctx.progression.unlocks.includes(condition.contentId);

    case 'scrap-total':
      return ctx.progression.scrap >= condition.threshold;

    case 'permanent-level':
      return (ctx.progression.permanentUpgrades[condition.upgradeId] ?? 0) >= condition.minLevel;

    case 'unlock-count':
      return ctx.progression.unlocks.length >= condition.minCount;

    case 'all':
      return condition.conditions.every((c) => evaluateCondition(c, ctx));

    case 'any':
      return condition.conditions.some((c) => evaluateCondition(c, ctx));

    case 'not':
      return !evaluateCondition(condition.condition, ctx);

    default:
      return false;
  }
}

/**
 * Creates an empty ConditionContext from a ProgressionState.
 * Useful for conditions that only depend on progression.
 */
export function createConditionContext(
  progression: Readonly<ProgressionState>,
  overrides?: Partial<Omit<ConditionContext, 'progression'>>,
): ConditionContext {
  return {
    progression,
    stages: overrides?.stages ?? {},
    achievements: overrides?.achievements ?? {},
    characters: overrides?.characters ?? {},
    bosses: overrides?.bosses ?? {},
  };
}
