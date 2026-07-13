import type { EventBus } from '../engine/eventBus';
import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import { PendingLevelUps } from '../gameplay/levelUpQueue';
import { pauseRun, resumeRun, type RunState } from '../gameplay/runState';
import { applyCard, offerCards } from '../gameplay/upgrades';
import type { UpgradeDefinition } from './types';

export interface UpgradeSystemOptions {
  runState: RunState;
  bus: EventBus;
  definitions: readonly UpgradeDefinition[];
  rng: Rng;
  offerCount?: number;
}

/**
 * Phaser-free owner of the level-up queue, active offer, and choice command.
 * The injected RNG is one run-scoped upgrades stream and is reused for every
 * offer produced by this system instance.
 */
export class UpgradeSystem implements System {
  private readonly pendingLevels = new PendingLevelUps();
  private readonly unsubscribeLevelUp: () => void;
  private activeOffer: UpgradeDefinition[] = [];
  private processing = false;
  private processRequested = false;
  private destroyed = false;

  constructor(private readonly options: UpgradeSystemOptions) {
    this.unsubscribeLevelUp = options.bus.on('level:up', ({ level }) => {
      if (this.destroyed) {
        return;
      }

      this.pendingLevels.enqueue(level);
      this.processPendingLevels();
    });
  }

  get currentOffer(): readonly UpgradeDefinition[] {
    return [...this.activeOffer];
  }

  get pendingLevel(): number | undefined {
    return this.pendingLevels.current();
  }

  get pendingCount(): number {
    return this.pendingLevels.pendingCount;
  }

  chooseCard(upgradeId: string): boolean {
    if (this.destroyed || this.activeOffer.length === 0) {
      return false;
    }

    const selected = this.activeOffer.find((definition) => definition.id === upgradeId);
    if (!selected || !applyCard(this.options.runState, selected)) {
      return false;
    }

    this.activeOffer = [];
    this.options.bus.emit('card:chosen', { upgradeId: selected.id });
    this.pendingLevels.completeCurrent();
    this.processPendingLevels();
    return true;
  }

  update(_dtMs: number): void {
    // Event-driven; present only to share the repository System lifecycle.
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.unsubscribeLevelUp();
    this.pendingLevels.clear();
    this.activeOffer = [];
    resumeRun(this.options.runState, this.options.bus, 'levelUp');
  }

  private processPendingLevels(): void {
    if (this.destroyed) {
      return;
    }
    if (this.processing) {
      this.processRequested = true;
      return;
    }

    this.processing = true;
    try {
      do {
        this.processRequested = false;
        while (
          !this.destroyed &&
          this.activeOffer.length === 0 &&
          this.pendingLevels.current() !== undefined
        ) {
          pauseRun(this.options.runState, this.options.bus, 'levelUp');
          if (this.destroyed) {
            break;
          }
          const offer = offerCards(
            this.options.definitions,
            this.options.runState.upgradeStacks,
            this.options.rng,
            this.options.offerCount,
          );
          if (offer.length === 0) {
            this.pendingLevels.completeCurrent();
            continue;
          }

          this.activeOffer = offer;
          this.options.bus.emit('card:offered', {
            choices: offer.map((definition) => definition.id),
          });
        }

        if (
          !this.destroyed &&
          this.activeOffer.length === 0 &&
          this.pendingLevels.current() === undefined
        ) {
          resumeRun(this.options.runState, this.options.bus, 'levelUp');
        }
      } while (this.processRequested && !this.destroyed);
    } finally {
      this.processing = false;
    }
  }
}
