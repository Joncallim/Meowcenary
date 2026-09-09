/**
 * Runtime ownership for a resolved stage contract.
 *
 * This is deliberately Phaser- and persistence-free: the scene forwards
 * authoritative gameplay facts, while its caller owns the single durable
 * commit at the extraction boundary.
 */
import type { ProgressionGrant } from '../grantProcessor';
import { recordCollect, recordDefeat, recordKill, tickSurvive } from '../objectiveProgress';
import {
  activateStage,
  createStageState,
  failStage,
  tickStage,
  updateObjectiveProgress,
  winStage,
  type ResolvedRunPlan,
  type StageState,
} from './stageContracts';

export interface PendingStageClear {
  readonly stageId: string;
  readonly timeMs: number;
  readonly bossId?: string;
  readonly reward: number;
  readonly grants: readonly ProgressionGrant[];
}

export interface StageRuntime {
  readonly plan: ResolvedRunPlan;
  readonly state: StageState;
  readonly pendingClear?: PendingStageClear;
  tick(deltaMs: number, runTimeMs: number): void;
  recordEnemyDefeat(enemyId: string, archetype?: string): void;
  recordCollection(itemId: string): void;
  /** Records the terminal run-loss fact at the stage-owned lifecycle seam. */
  fail(): void;
  /** Formats a display-only objective read model. The optional name resolver
   * is supplied by the presentation composition root; objective state remains
   * numeric and authoritative here. */
  describeObjective(options?: { readonly enemyName?: (enemyId: string) => string | undefined }): string;
  tryCommit(commit: (pending: PendingStageClear) => boolean): boolean;
}

class ResolvedStageRuntime implements StageRuntime {
  private stageState: StageState;
  private pending?: PendingStageClear;

  constructor(readonly plan: ResolvedRunPlan) {
    this.stageState = createStageState(plan.stageId, plan.objective.definition);
  }

  get state(): StageState { return this.stageState; }
  get pendingClear(): PendingStageClear | undefined { return this.pending; }

  tick(deltaMs: number, runTimeMs: number): void {
    if (this.stageState.status === 'intro') this.stageState = activateStage(this.stageState);
    if (this.stageState.status !== 'active') {
      this.captureClear(runTimeMs);
      return;
    }
    this.stageState = tickStage(this.stageState, deltaMs);
    if (this.plan.objective.definition.type === 'survive') {
      const progress = this.stageState.objectiveProgress;
      const next = tickSurvive(progress, deltaMs);
      if (next !== progress) this.stageState = updateObjectiveProgress(this.stageState, next.current - progress.current);
    }
    this.captureClear(runTimeMs);
  }

  recordEnemyDefeat(enemyId: string, archetype?: string): void {
    if (this.stageState.status !== 'active') return;
    const objective = this.plan.objective.definition;
    const progress = this.stageState.objectiveProgress;
    const next = objective.type === 'defeat'
      ? recordDefeat(progress, enemyId, objective.enemyId)
      : objective.type === 'kill'
        ? recordKill(progress, archetype, objective.enemyTag)
        : progress;
    if (next !== progress) this.stageState = updateObjectiveProgress(this.stageState, next.current - progress.current);
  }

  recordCollection(itemId: string): void {
    if (this.stageState.status !== 'active' || this.plan.objective.definition.type !== 'collect') return;
    const progress = this.stageState.objectiveProgress;
    const next = recordCollect(progress, itemId, this.plan.objective.definition.itemId);
    if (next !== progress) this.stageState = updateObjectiveProgress(this.stageState, next.current - progress.current);
  }

  fail(): void {
    this.stageState = failStage(this.stageState);
  }

  describeObjective(options?: { readonly enemyName?: (enemyId: string) => string | undefined }): string {
    if (this.stageState.status === 'objective-complete') return 'OBJECTIVE COMPLETE — Confirm to extract';
    const progress = this.stageState.objectiveProgress;
    const current = Math.min(progress.current, progress.target);
    switch (this.plan.objective.definition.type) {
      case 'survive':
        return `Survive ${formatObjectiveTime(current)} / ${formatObjectiveTime(progress.target)}`;
      case 'kill':
        return `Eliminate ${Math.floor(current)} / ${Math.floor(progress.target)}`;
      case 'collect':
        return `Collect ${Math.floor(current)} / ${Math.floor(progress.target)}`;
      case 'defeat': {
        const enemyId = this.plan.objective.definition.enemyId;
        return `Defeat ${options?.enemyName?.(enemyId) ?? 'the boss'}`;
      }
    }
  }

  tryCommit(commit: (pending: PendingStageClear) => boolean): boolean {
    if (!this.pending || !commit(this.pending)) return false;
    this.pending = undefined;
    this.stageState = winStage(this.stageState);
    return true;
  }

  private captureClear(runTimeMs: number): void {
    if (this.pending || this.stageState.status !== 'objective-complete') return;
    // Rewards stop scaling after the intended three-minute clear window;
    // delaying an otherwise-complete objective cannot create a farming loop.
    const reward = this.plan.reward.firstClearScrap;
    this.pending = Object.freeze({
      stageId: this.plan.stageId,
      timeMs: runTimeMs,
      bossId: this.plan.encounter.bossId,
      reward: Math.max(1, reward),
      grants: this.plan.reward.grants ?? [],
    });
  }
}

function formatObjectiveTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, '0')}`;
}

export function createStageRuntime(plan: ResolvedRunPlan): StageRuntime {
  return new ResolvedStageRuntime(plan);
}
