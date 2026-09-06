import type { GameContext } from '../engine/context';
import type { EventBus } from '../engine/eventBus';
import type { System } from '../engine/system';
import type { RunState } from '../gameplay/runState';
import type { ProgressionStateV4 as ProgressionV4 } from './save';

export interface ProgressionSystemOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly context: GameContext;
}
export interface BankedRun { readonly reward: { readonly scrap: number; readonly unlocks: readonly string[] }; readonly meta: ProgressionV4; readonly persisted: boolean }

const handledRuns = new WeakSet<RunState>();

export class ProgressionSystem implements System {
  private readonly runState: RunState;
  private readonly context: GameContext;
  private readonly unsubscribers: Array<() => void>;
  private destroyed = false;
  private banked: BankedRun | null = null;

  constructor(options: ProgressionSystemOptions) {
    this.runState = options.runState;
    this.context = options.context;
    const terminalHandler = () => { this.bankFinishedRun(); };
    this.unsubscribers = [
      options.bus.on('run:won', terminalHandler),
      options.bus.on('run:lost', terminalHandler),
    ];
  }

  get hasBanked(): boolean { return handledRuns.has(this.runState); }
  get lastBankedRun(): BankedRun | null { return this.banked; }

  bankFinishedRun(): BankedRun | null {
    if (this.destroyed || handledRuns.has(this.runState)) return null;
    const reward = {
      scrap: Math.max(0, Math.floor(this.runState.currency)),
      unlocks: this.runState.status === 'won' ? [] : [],
    };
    const update = this.context.commitProgression((progression) => {
      const newScrap = Math.min(Number.MAX_SAFE_INTEGER, progression.scrap + reward.scrap);
      return Object.freeze({ scrap: newScrap, unlocks: progression.unlocks });
    });
    // A failed write must leave the terminal source retryable.  The run is
    // marked handled only after the authoritative persistence boundary has
    // committed the same state it exposes to consumers.
    if (update.persisted) handledRuns.add(this.runState);
    this.banked = Object.freeze({ reward, meta: update.value, persisted: update.persisted });
    return this.banked;
  }

  update(_dtMs: number): void {
    // Terminal reward banking is retry-safe because `handledRuns` is marked
    // only after the save succeeds. A transient write failure therefore
    // cannot make a loss or win permanently drop its collected scrap.
    if (!this.destroyed && !handledRuns.has(this.runState)
      && (this.runState.status === 'won' || this.runState.status === 'lost')) {
      this.bankFinishedRun();
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }
}
