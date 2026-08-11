import type { EventBus } from '../engine/eventBus';
import type { System } from '../engine/system';
import type { DpsMeter } from '../gameplay/metrics';
import type { RunOutcome, RunState } from '../gameplay/runState';

export interface PlaytestSummarySystemOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly dpsMeter: DpsMeter;
  readonly logger?: Pick<Console, 'info' | 'table'>;
}

export interface PlaytestSummaryRow {
  readonly outcome: RunOutcome;
  readonly time: string;
  readonly timeMs: number;
  readonly level: number;
  readonly kills: number;
  readonly currency: number;
  readonly avgDps: number;
  readonly upgradesTaken: number;
}

/**
 * Development-only local playtest snapshot (Epic 11 remainder §8). Prints
 * exactly once per run on the first terminal event, after ProgressionSystem
 * has banked. Local console output only — no network, PII, or persistence.
 */
export class PlaytestSummarySystem implements System {
  private readonly runState: RunState;
  private readonly dpsMeter: DpsMeter;
  private readonly logger: Pick<Console, 'info' | 'table'>;
  private readonly unsubscribers: Array<() => void>;
  private printed = false;
  private destroyed = false;

  constructor(options: PlaytestSummarySystemOptions) {
    this.runState = options.runState;
    this.dpsMeter = options.dpsMeter;
    this.logger = options.logger ?? console;
    this.unsubscribers = [
      options.bus.on('run:won', () => this.print('won')),
      options.bus.on('run:lost', () => this.print('lost')),
    ];
  }

  update(_dtMs: number): void {}

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  private print(outcome: RunOutcome): void {
    if (this.destroyed || this.printed) {
      return;
    }
    // Guard before logging so a throwing logger cannot cause a second print.
    this.printed = true;

    const { runState, dpsMeter } = this;
    const safeTimeMs = Number.isFinite(runState.timeMs)
      ? Math.max(0, runState.timeMs)
      : 0;
    const elapsedSeconds = Math.max(1, safeTimeMs / 1000);
    const rawAverage = dpsMeter.totalDamage / elapsedSeconds;
    const avgDps = Number.isFinite(rawAverage)
      ? Math.round(rawAverage * 10) / 10
      : 0;
    const upgradesTaken = Object.values(runState.upgradeStacks).reduce(
      (sum, count) => sum + count,
      0,
    );

    const row: PlaytestSummaryRow = Object.freeze({
      outcome,
      time: formatTime(safeTimeMs),
      timeMs: safeTimeMs,
      level: runState.level,
      kills: runState.kills,
      currency: runState.currency,
      avgDps,
      upgradesTaken,
    });

    this.logger.info('[playtest] run summary');
    this.logger.table([row]);
    if (Object.keys(runState.upgradeStacks).length > 0) {
      this.logger.table(runState.upgradeStacks);
    }
  }
}

function formatTime(timeMs: number): string {
  const safeMs = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
