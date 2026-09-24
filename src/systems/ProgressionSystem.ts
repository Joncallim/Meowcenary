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

/**
 * @deprecated Alpha 3 terminal settlement is exclusively GameContext's
 * `settleRunTerminal`. This compatibility shell intentionally has no event
 * subscriptions and cannot write persistence, preventing old composition
 * from silently restoring a second terminal owner.
 */
export class ProgressionSystem implements System {
  constructor(_options: ProgressionSystemOptions) {}
  get hasBanked(): boolean { return false; }
  get lastBankedRun(): BankedRun | null { return null; }
  bankFinishedRun(): BankedRun | null { return null; }
  update(_dtMs: number): void {}
  destroy(): void {}
}
