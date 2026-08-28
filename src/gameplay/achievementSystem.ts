/**
 * Pure AchievementSystem — no side effects, no I/O, no Phaser.
 * Epic 22 (#91): one authoritative, platform-independent achievement and
 * mastery system. Gameplay facts are consumed as immutable inputs; the system
 * returns the next achievement state plus exactly-once completion/reward
 * signals. Completion is monotonic: a completed achievement never un-completes,
 * and incremental progress never decreases.
 *
 * Definitions are validated data (src/data/achievements.json via the catalog
 * validator). Adding an achievement that uses existing metrics/conditions/
 * grants is data-only — no event-listener branches, no achievement-ID
 * special cases, no save migration (catalog version and save version are
 * separate; see the #92 architecture §4).
 */
import type { AchievementProgress, AchievementProgressState, CharacterMasteryState, ProgressionState, StageProgressState } from '../systems/save';
import type { ProgressionCondition } from './conditionEvaluator';
import { evaluateCondition, type ConditionContext } from './conditionEvaluator';
import type { ProgressionGrant } from './grantProcessor';

export type AchievementKind = 'standard' | 'incremental' | 'hidden' | 'mastery';

export interface AchievementPlatformMapping {
  readonly gameCenterId?: string;
  readonly googlePlayId?: string;
}

export interface AchievementReward {
  readonly grant: ProgressionGrant;
}

export interface AchievementDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: AchievementKind;
  /** Incremental/metric-driven target; standard achievements use target 1. */
  readonly target: number;
  /** Metric id for progress tracking (incremental/standard-by-count). */
  readonly metricId?: string;
  /** Condition for condition-driven achievements (boss/stage/mastery/permanent). */
  readonly condition?: ProgressionCondition;
  /** Hidden achievements stay hidden in read models until completed. */
  readonly hidden?: boolean;
  readonly rewards?: readonly AchievementReward[];
  readonly platform?: AchievementPlatformMapping;
}

/** Sparse, stable-ID-keyed progress. Unknown/stale IDs fail soft.
 *  Shape is the Save V3 `AchievementProgress` contract (save.ts). */
export type AchievementState = AchievementProgressState;

export interface AchievementUpdate {
  readonly id: string;
  readonly progress: AchievementProgress;
}

export interface AchievementEvaluationResult {
  readonly state: AchievementState;
  /** Updates applied this evaluation (completed or progressed). */
  readonly updates: readonly AchievementUpdate[];
  /** Exactly-once completions this evaluation (id was previously incomplete). */
  readonly completed: readonly string[];
  /** Rewards to grant for new completions (routed through the grant processor). */
  readonly rewards: readonly ProgressionGrant[];
}

/** Facts the achievement system consumes. All authoritative gameplay events. */
export interface AchievementFacts {
  readonly metrics: Readonly<Record<string, number>>;
  /** Progression snapshot for condition-driven achievements (scrap, unlocks). */
  readonly progression?: Readonly<ProgressionState>;
  /** Stage progress snapshot for stage-cleared conditions. */
  readonly stages?: Readonly<StageProgressState>;
  /** Character mastery snapshot for mastery-reached conditions. */
  readonly characters?: Readonly<CharacterMasteryState>;
}

/** Metric registry: stable metric IDs → current value extractor. */
export type MetricExtractor = (facts: AchievementFacts) => number;

export interface AchievementContext {
  readonly definitions: ReadonlyMap<string, AchievementDefinition>;
  readonly metrics: ReadonlyMap<string, MetricExtractor>;
}

/**
 * Applies metrics to the current state and evaluates every definition.
 * Exactly-once semantics: a definition completes only on the transition from
 * incomplete → satisfied, and its reward grant is emitted exactly once (the
 * caller routes it through processGrant, which is itself idempotent).
 *
 * Pure and deterministic for the same (state, facts, ctx).
 */
export function evaluateAchievements(
  state: AchievementState,
  facts: AchievementFacts,
  ctx: AchievementContext,
  nowMs: number,
): AchievementEvaluationResult {
  const updates: AchievementUpdate[] = [];
  const completed: string[] = [];
  const rewards: ProgressionGrant[] = [];

  for (const definition of ctx.definitions.values()) {
    const existing = state[definition.id];
    if (existing?.completed) continue; // terminal, never re-evaluated

    const current = existing?.progress ?? 0;
    const metricValue = definition.metricId
      ? (ctx.metrics.get(definition.metricId)?.(facts) ?? 0)
      : current;
    const target = definition.target;

    const satisfied = definition.condition !== undefined
      ? evaluateCondition(definition.condition, buildConditionContext(state, facts))
      : metricValue >= target;

    if (!satisfied) {
      // Monotonic incremental progress: never decreases, capped at target.
      const capped = Math.min(target, Math.max(current, metricValue));
      if (capped !== current) {
        updates.push({
          id: definition.id,
          progress: Object.freeze({ progress: capped, completed: false }),
        });
      }
      continue;
    }

    // New completion — exactly once. Progress reads exactly the target
    // (capped): completed progress is target, never the raw metric spike.
    completed.push(definition.id);
    updates.push({
      id: definition.id,
      progress: Object.freeze({
        progress: Math.min(target, Math.max(current, metricValue)),
        completed: true,
        completedAt: nowMs,
      }),
    });
    for (const reward of definition.rewards ?? []) {
      rewards.push(reward.grant);
    }
  }

  if (updates.length === 0) return { state, updates, completed, rewards };

  const next: Record<string, AchievementProgress> = { ...state };
  for (const update of updates) {
    next[update.id] = update.progress;
  }
  return { state: Object.freeze(next), updates, completed, rewards };
}

function buildConditionContext(
  state: AchievementState,
  facts: AchievementFacts,
): ConditionContext {
  return {
    progression: facts.progression ?? emptyProgression,
    stages: facts.stages ?? {},
    achievements: state,
    characters: facts.characters ?? {},
  };
}

const emptyProgression = Object.freeze({
  scrap: 0,
  unlocks: Object.freeze([]),
  permanentUpgrades: Object.freeze({}),
});
