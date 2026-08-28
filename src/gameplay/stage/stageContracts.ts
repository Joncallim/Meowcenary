/**
 * Stage/objective contracts — pure, Phaser-free.
 * Alpha 3 shared foundation §5: StageDefinition, ObjectiveType, StageRunRequest,
 * ResolvedRunPlan, and resolveRunPlan.
 *
 * Golden Run compatibility: ArenaDefinition.spawnCurveId + duration victory
 * path is preserved as the Alpha 2 compatibility adapter (§5.3).
 */
import { deepFreeze } from '../../engine/freeze';
import { isContentId, isUnlockId } from '../../systems/ids';

// ── Objective vocabulary (§2.2) ──────────────────────────────────────

export type ObjectiveType =
  | { readonly type: 'kill'; readonly count: number; readonly enemyTag?: string }
  | { readonly type: 'collect'; readonly itemId: string; readonly count: number }
  | { readonly type: 'survive'; readonly seconds: number }
  | { readonly type: 'defeat'; readonly enemyId: string };

// ── Profile types (§3.5) ─────────────────────────────────────────────

export interface EncounterProfile {
  readonly id: string;
  readonly enemyIds: readonly string[];
  readonly compositionWeights?: Readonly<Record<string, number>>;
  /** Epic 21: optional boss for this encounter (boss milestone stages). */
  readonly bossId?: string;
}

export interface DifficultyProfile {
  readonly id: string;
  readonly healthMultiplier: number;
  readonly damageMultiplier: number;
  readonly speedMultiplier: number;
  readonly spawnPressure: number; // 0–1, higher = more aggressive spawning
}

export interface RewardProfile {
  readonly id: string;
  readonly scrapBase: number;
  readonly scrapPerMinute: number;
  readonly lootTableId?: string;
}

// ── Stage definition (§3.1) ──────────────────────────────────────────

export interface StageDefinition {
  readonly id: string; // e.g. 'stage:junkyard-01'
  readonly name: string;
  readonly chapterId: string; // e.g. 'chapter:junkyard'
  readonly displayOrder: number; // never a persistence key
  readonly arenaId: string;
  readonly objective: ObjectiveType;
  readonly encounterProfileId: string;
  readonly difficultyProfileId: string;
  readonly rewardProfileId: string;
  readonly bossId?: string;
  readonly unlock: Record<string, unknown>; // ProgressionCondition data
}

// ── Run request / resolved plan (§3.2) ───────────────────────────────

export interface StageRunRequest {
  readonly characterId: string;
  readonly stageId: string;
  readonly seed: number;
}

export interface ResolvedObjective {
  readonly type: ObjectiveType['type'];
  readonly definition: ObjectiveType;
}

export interface ResolvedEncounterProfile {
  readonly profileId: string;
  readonly enemyIds: readonly string[];
  readonly compositionWeights?: Readonly<Record<string, number>>;
  /** Epic 21: resolved boss id for this encounter, when present. */
  readonly bossId?: string;
}

export interface ResolvedDifficultyProfile {
  readonly profileId: string;
  readonly healthMultiplier: number;
  readonly damageMultiplier: number;
  readonly speedMultiplier: number;
  readonly spawnPressure: number;
}

export interface ResolvedRewardProfile {
  readonly profileId: string;
  readonly scrapBase: number;
  readonly scrapPerMinute: number;
  readonly lootTableId?: string;
}

export interface ResolvedRunPlan {
  readonly characterId: string;
  readonly stageId: string;
  readonly arenaId: string;
  readonly objective: ResolvedObjective;
  readonly encounter: ResolvedEncounterProfile;
  readonly difficulty: ResolvedDifficultyProfile;
  readonly reward: ResolvedRewardProfile;
  readonly seed: number;
}

// ── Stage status (§3.4) ──────────────────────────────────────────────

export type StageStatus = 'intro' | 'active' | 'objective-complete' | 'won' | 'failed';

export interface ObjectiveProgress {
  readonly type: ObjectiveType['type'];
  readonly current: number;
  readonly target: number;
}

export interface StageState {
  readonly status: StageStatus;
  readonly objectiveProgress: ObjectiveProgress;
  readonly timeMs: number;
  readonly stageId: string;
}

// ── Catalog data shape (§3.5) ────────────────────────────────────────

export interface StageCatalogData {
  readonly stages: readonly StageDefinition[];
  readonly encounterProfiles: readonly EncounterProfile[];
  readonly difficultyProfiles: readonly DifficultyProfile[];
  readonly rewardProfiles: readonly RewardProfile[];
}

// ── Resolver (§3.2) ──────────────────────────────────────────────────

export class StageResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StageResolutionError';
  }
}

/**
 * Pure resolver: validates and constructs a ResolvedRunPlan from a
 * StageRunRequest and the stage catalog data. No side effects, no I/O.
 *
 * Golden Run compatibility: the caller (GameScene) may still use
 * ArenaDefinition.spawnCurveId + durationSeconds for the legacy victory
 * path. The resolved plan provides the stage contract; the arena still
 * owns the physical world.
 */
export function resolveRunPlan(
  request: StageRunRequest,
  data: StageCatalogData,
): ResolvedRunPlan {
  if (!isContentId(request.characterId)) {
    throw new StageResolutionError(`Invalid character ID "${request.characterId}"`);
  }
  if (!isUnlockId(request.stageId) || !request.stageId.startsWith('stage:')) {
    throw new StageResolutionError(`Invalid stage ID "${request.stageId}"`);
  }
  if (!Number.isSafeInteger(request.seed)) {
    throw new StageResolutionError('Run seed must be a safe integer');
  }
  // Find the stage definition
  const stage = data.stages.find((s) => s.id === request.stageId);
  if (!stage) {
    throw new StageResolutionError(`Unknown stage "${request.stageId}"`);
  }

  // Resolve encounter profile
  const encounter = data.encounterProfiles.find((ep) => ep.id === stage.encounterProfileId);
  if (!encounter) {
    throw new StageResolutionError(
      `Unknown encounter profile "${stage.encounterProfileId}" for stage "${stage.id}"`,
    );
  }

  // Resolve difficulty profile
  const difficulty = data.difficultyProfiles.find((dp) => dp.id === stage.difficultyProfileId);
  if (!difficulty) {
    throw new StageResolutionError(
      `Unknown difficulty profile "${stage.difficultyProfileId}" for stage "${stage.id}"`,
    );
  }

  // Resolve reward profile
  const reward = data.rewardProfiles.find((rp) => rp.id === stage.rewardProfileId);
  if (!reward) {
    throw new StageResolutionError(
      `Unknown reward profile "${stage.rewardProfileId}" for stage "${stage.id}"`,
    );
  }
  if (stage.bossId !== undefined && (
    stage.objective.type !== 'defeat'
    || stage.objective.enemyId !== stage.bossId
    || encounter.bossId !== stage.bossId
  )) {
    throw new StageResolutionError(`Boss contract mismatch for stage "${stage.id}"`);
  }

  return Object.freeze({
    characterId: request.characterId,
    stageId: stage.id,
    arenaId: stage.arenaId,
    objective: Object.freeze({
      type: stage.objective.type,
      definition: deepFreeze(structuredClone(stage.objective)),
    }),
    encounter: Object.freeze({
      profileId: encounter.id,
      enemyIds: Object.freeze([...encounter.enemyIds]),
      ...(encounter.compositionWeights !== undefined
        ? { compositionWeights: Object.freeze({ ...encounter.compositionWeights }) }
        : {}),
      ...(encounter.bossId !== undefined ? { bossId: encounter.bossId } : {}),
    }),
    difficulty: Object.freeze({
      profileId: difficulty.id,
      healthMultiplier: difficulty.healthMultiplier,
      damageMultiplier: difficulty.damageMultiplier,
      speedMultiplier: difficulty.speedMultiplier,
      spawnPressure: difficulty.spawnPressure,
    }),
    reward: Object.freeze({
      profileId: reward.id,
      scrapBase: reward.scrapBase,
      scrapPerMinute: reward.scrapPerMinute,
      lootTableId: reward.lootTableId,
    }),
    seed: request.seed,
  });
}

// ── Stage state helpers (§3.4) ───────────────────────────────────────

export function createStageState(stageId: string, objective: ObjectiveType): StageState {
  const target = computeObjectiveTarget(objective);
  return {
    status: 'intro',
    objectiveProgress: { type: objective.type, current: 0, target },
    timeMs: 0,
    stageId,
  };
}

function computeObjectiveTarget(objective: ObjectiveType): number {
  switch (objective.type) {
    case 'kill': return objective.count;
    case 'collect': return objective.count;
    case 'survive': return objective.seconds;
    case 'defeat': return 1;
    default: return 0;
  }
}

/**
 * Lifecycle transition: intro → active.
 * Only valid from 'intro' status.
 */
export function activateStage(state: StageState): StageState {
  if (state.status !== 'intro') return state;
  return { ...state, status: 'active' };
}

/**
 * Updates objective progress. Returns a new StageState if the status
 * transitioned (e.g., to 'objective-complete').
 */
export function updateObjectiveProgress(
  state: StageState,
  increment: number,
): StageState {
  if (state.status !== 'active') return state;
  const newCurrent = Math.min(state.objectiveProgress.target, state.objectiveProgress.current + increment);
  const progress = { ...state.objectiveProgress, current: newCurrent };
  const status: StageStatus = newCurrent >= state.objectiveProgress.target
    ? 'objective-complete'
    : 'active';
  return { ...state, objectiveProgress: progress, status };
}

/**
 * Complete the stage (objective-complete → won).
 * Terminal — no further transitions from 'won'.
 */
export function winStage(state: StageState): StageState {
  if (state.status !== 'objective-complete') return state;
  return { ...state, status: 'won' };
}

/**
 * Fail the stage. Valid from 'intro', 'active', or 'objective-complete'.
 */
export function failStage(state: StageState): StageState {
  if (state.status === 'won' || state.status === 'failed') return state;
  return { ...state, status: 'failed' };
}

/**
 * Advances stage time. Returns a new StageState or the same reference when
 * terminal or when deltaMs is non-positive.
 */
export function tickStage(state: StageState, deltaMs: number): StageState {
  if (state.status === 'won' || state.status === 'failed') return state;
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  const newTimeMs = state.timeMs + deltaMs;
  if (newTimeMs === state.timeMs) return state;
  return { ...state, timeMs: newTimeMs };
}
