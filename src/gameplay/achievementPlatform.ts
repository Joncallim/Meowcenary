/**
 * Achievement platform adapter boundary (Epic 22 §Platform Sync Contract).
 *
 * Meowcenary achievement state is authoritative; platform services (Apple
 * Game Center, Google Play Games) are best-effort mirrors, never the source
 * of truth. Gameplay never calls platform APIs directly — it reports through
 * this boundary. The local/web adapter succeeds synchronously and no-ops, so
 * web/offline players get identical in-game behavior. External failures must
 * never roll back local state: callers commit local completion first and
 * treat reporting as a side effect.
 */
import type { AchievementProgress } from '../systems/save';

export interface AchievementReconciliation {
  /** External IDs the local state reports as completed. */
  readonly completed: readonly string[];
}

export interface AchievementPlatformAdapter {
  /**
   * Best-effort report of local progress. Must be idempotent and retry-safe.
   * Must not throw in a way that blocks gameplay (implementations should
   * swallow/report failures internally; callers already commit first).
   */
  report(definitionId: string, progress: AchievementProgress): Promise<void>;
  /**
   * Optional reconciliation. Must never reduce valid local completion solely
   * because the platform mirror is stale.
   */
  reconcile?(localState: Readonly<Record<string, AchievementProgress>>): Promise<AchievementReconciliation>;
}

/** Local/web-only adapter: succeeds immediately, no external state. */
export class LocalAchievementAdapter implements AchievementPlatformAdapter {
  private readonly reported = new Map<string, AchievementProgress>();

  async report(definitionId: string, progress: AchievementProgress): Promise<void> {
    // Idempotent: a completed report may only be replaced by another
    // completed report with higher progress; an un-completed report never
    // downgrades a completion (progress only advances, never regresses).
    const existing = this.reported.get(definitionId);
    if (existing) {
      if (existing.completed && (!progress.completed || (progress.progress ?? 0) <= (existing.progress ?? 0))) {
        return;
      }
      if (!existing.completed && !progress.completed && (progress.progress ?? 0) <= (existing.progress ?? 0)) {
        return;
      }
    }
    this.reported.set(definitionId, progress);
  }

  async reconcile(
    localState: Readonly<Record<string, AchievementProgress>>,
  ): Promise<AchievementReconciliation> {
    return { completed: Object.entries(localState).filter(([, p]) => p.completed).map(([id]) => id) };
  }

  /** Test/telemetry hook: what this adapter has been asked to report. */
  reportedState(): ReadonlyMap<string, AchievementProgress> {
    return this.reported;
  }
}

/** A no-op adapter used when no platform is configured. */
export const noopAchievementAdapter: AchievementPlatformAdapter = {
  async report(): Promise<void> {},
};
