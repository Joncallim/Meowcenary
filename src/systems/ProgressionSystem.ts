import type { GameContext } from '../engine/context';
import type { EventBus } from '../engine/eventBus';
import type { System } from '../engine/system';
import { bankReward, computeRunReward, type RunReward } from '../gameplay/meta';
import type { RunState } from '../gameplay/runState';
import type { MetaState } from './save';

export interface ProgressionSystemOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly context: GameContext;
}
export interface BankedRun { readonly reward: RunReward; readonly meta: MetaState; readonly persisted: boolean }

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
    const reward = computeRunReward(this.runState);
    if (!reward) return null;
    const update = this.context.updateMeta((meta) => bankReward(meta, reward));
    // A failed write must leave the terminal source retryable.  The run is
    // marked handled only after the authoritative persistence boundary has
    // committed the same state it exposes to consumers.
    if (update.persisted) handledRuns.add(this.runState);
    this.banked = Object.freeze({ reward, meta: update.value, persisted: update.persisted });
    return this.banked;
  }

  update(_dtMs: number): void {}

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }
}
