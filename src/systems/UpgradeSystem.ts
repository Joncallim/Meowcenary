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

export interface UpgradeOfferSnapshot {
  offerId: number;
  definitions: readonly UpgradeDefinition[];
}

interface ActiveOffer {
  offerId: number;
  definitions: UpgradeDefinition[];
}

interface QueuedChoice {
  offerId: number;
  upgradeId: string;
}

const coordinationGroups = new WeakMap<RunState, UpgradeCoordinationGroup>();

/**
 * Phaser-free facade over one shared per-run upgrade coordinator. The first
 * facade for a RunState supplies the run-scoped RNG and configuration; duplicate
 * facades join the same queue, offer, pause lease, and event subscriptions.
 */
export class UpgradeSystem implements System {
  private readonly group: UpgradeCoordinationGroup;
  private destroyed = false;

  constructor(options: UpgradeSystemOptions) {
    const existing = coordinationGroups.get(options.runState);
    if (existing) {
      if (existing.isDisposed) {
        throw new Error('Cannot attach UpgradeSystem to a disposed run coordinator');
      }
      if (!existing.usesBus(options.bus)) {
        throw new Error('UpgradeSystem facades for one RunState must share one EventBus');
      }
      this.group = existing;
    } else {
      this.group = new UpgradeCoordinationGroup(options);
      coordinationGroups.set(options.runState, this.group);
    }

    this.group.addMember(this);
  }

  get currentOffer(): readonly UpgradeDefinition[] {
    return this.currentOfferSnapshot?.definitions ?? [];
  }

  get currentOfferId(): number | undefined {
    return this.destroyed ? undefined : this.group.currentOfferId;
  }

  get currentOfferSnapshot(): UpgradeOfferSnapshot | undefined {
    return this.destroyed ? undefined : this.group.currentOfferSnapshot;
  }

  get pendingLevel(): number | undefined {
    return this.destroyed ? undefined : this.group.pendingLevel;
  }

  get pendingCount(): number {
    return this.destroyed ? 0 : this.group.pendingCount;
  }

  chooseCard(offerId: number, upgradeId: string): boolean {
    return !this.destroyed && this.group.chooseCard(this, offerId, upgradeId);
  }

  update(_dtMs: number): void {
    // Event-driven; present only to share the repository System lifecycle.
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.group.removeMember(this);
  }
}

class UpgradeCoordinationGroup {
  private readonly options: UpgradeSystemOptions;
  private readonly members = new Set<UpgradeSystem>();
  private readonly pendingLevels = new PendingLevelUps();
  private readonly unsubscribeLevelUp: () => void;
  private readonly unsubscribeRunResumed: () => void;
  private activeOffer?: ActiveOffer;
  private queuedChoice?: QueuedChoice;
  private nextOfferId = 1;
  private processing = false;
  private processRequested = false;
  private deliveringOffer = false;
  private resolvingChoice = false;
  private acquiringPause = false;
  private pauseReacquireRequested = false;
  private ownsLevelUpPause = false;
  private disposed = false;

  constructor(options: UpgradeSystemOptions) {
    this.options = {
      ...options,
      definitions: canonicalDefinitions(options.definitions),
    };
    this.unsubscribeLevelUp = this.options.bus.on('level:up', ({ level }) => {
      if (!this.isLive) {
        return;
      }

      this.pendingLevels.enqueue(level);
      this.requestProcessing();
    });
    this.unsubscribeRunResumed = this.options.bus.on('run:resumed', () => {
      this.ownsLevelUpPause = false;
      if (this.hasUnresolvedWork) {
        this.ensureLevelUpPause();
      }
    });
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get currentOfferId(): number | undefined {
    return this.activeOffer?.offerId;
  }

  get currentOfferSnapshot(): UpgradeOfferSnapshot | undefined {
    const offer = this.activeOffer;
    if (!offer) {
      return undefined;
    }

    return {
      offerId: offer.offerId,
      definitions: snapshotDefinitions(offer.definitions),
    };
  }

  get pendingLevel(): number | undefined {
    return this.pendingLevels.current();
  }

  get pendingCount(): number {
    return this.pendingLevels.pendingCount;
  }

  usesBus(bus: EventBus): boolean {
    return this.options.bus === bus;
  }

  addMember(member: UpgradeSystem): void {
    if (this.disposed) {
      throw new Error('Cannot join a disposed upgrade coordination group');
    }
    this.members.add(member);
  }

  removeMember(member: UpgradeSystem): void {
    if (!this.members.delete(member) || this.members.size > 0) {
      return;
    }

    this.dispose();
  }

  chooseCard(member: UpgradeSystem, offerId: number, upgradeId: string): boolean {
    if (!this.isLive || !this.members.has(member) || this.resolvingChoice) {
      return false;
    }

    const offer = this.activeOffer;
    if (
      !offer ||
      offer.offerId !== offerId ||
      !offer.definitions.some((definition) => definition.id === upgradeId)
    ) {
      return false;
    }

    if (this.deliveringOffer) {
      if (this.queuedChoice) {
        return false;
      }
      this.queuedChoice = { offerId, upgradeId };
      return true;
    }

    return this.resolveChoice(offer, upgradeId);
  }

  private get isLive(): boolean {
    return !this.disposed && this.members.size > 0;
  }

  private get hasUnresolvedWork(): boolean {
    return (
      this.activeOffer !== undefined ||
      this.pendingLevels.current() !== undefined ||
      this.deliveringOffer ||
      this.resolvingChoice
    );
  }

  private requestProcessing(): void {
    if (!this.isLive) {
      return;
    }
    if (this.processing || this.deliveringOffer || this.resolvingChoice) {
      this.processRequested = true;
      return;
    }

    this.processPendingLevels();
  }

  private processPendingLevels(): void {
    if (!this.isLive || this.processing) {
      return;
    }

    this.processing = true;
    try {
      do {
        this.processRequested = false;
        while (
          this.isLive &&
          this.activeOffer === undefined &&
          this.pendingLevels.current() !== undefined
        ) {
          this.ensureLevelUpPause();
          if (!this.isLive) {
            break;
          }

          let definitions: UpgradeDefinition[];
          try {
            definitions = offerCards(
              this.options.definitions,
              this.options.runState.upgradeStacks,
              this.options.rng,
              this.options.offerCount,
            );
          } catch (error) {
            this.unwindOfferFailure();
            throw error;
          }
          if (!this.isLive) {
            break;
          }
          if (definitions.length === 0) {
            this.pendingLevels.completeCurrent();
            continue;
          }

          const offer: ActiveOffer = {
            offerId: this.nextOfferId,
            definitions,
          };
          this.nextOfferId += 1;
          this.activeOffer = offer;
          this.deliverOffer(offer);
          if (!this.isLive) {
            break;
          }
          if (this.activeOffer === offer) {
            break;
          }
        }

        if (this.isLive && !this.hasUnresolvedWork) {
          this.releaseLevelUpPause();
        }
      } while (this.processRequested && this.isLive);
    } finally {
      this.processing = false;
    }
  }

  private deliverOffer(offer: ActiveOffer): void {
    this.deliveringOffer = true;
    this.queuedChoice = undefined;
    try {
      const payload = Object.freeze({
        offerId: offer.offerId,
        choices: Object.freeze(offer.definitions.map((definition) => definition.id)),
      });
      this.options.bus.emit('card:offered', payload);
    } finally {
      this.deliveringOffer = false;
    }
    if (!this.isLive || this.activeOffer !== offer) {
      return;
    }

    const queuedChoice = this.takeQueuedChoice();
    if (queuedChoice) {
      this.resolveChoice(offer, queuedChoice.upgradeId);
    }
  }

  private takeQueuedChoice(): QueuedChoice | undefined {
    const queuedChoice = this.queuedChoice;
    this.queuedChoice = undefined;
    return queuedChoice;
  }

  private resolveChoice(offer: ActiveOffer, upgradeId: string): boolean {
    if (!this.isLive || this.activeOffer !== offer || offer.offerId !== this.currentOfferId) {
      return false;
    }

    const selected = offer.definitions.find((definition) => definition.id === upgradeId);
    if (!selected || !applyCard(this.options.runState, selected)) {
      return false;
    }
    if (!this.isLive) {
      return true;
    }

    this.resolvingChoice = true;
    this.activeOffer = undefined;
    this.queuedChoice = undefined;
    this.pendingLevels.completeCurrent();

    let emissionError: unknown;
    try {
      this.options.bus.emit('card:chosen', { upgradeId: selected.id });
    } catch (error) {
      emissionError = error;
    } finally {
      this.resolvingChoice = false;
    }

    if (this.isLive) {
      this.requestProcessing();
    }
    if (emissionError !== undefined) {
      throw emissionError;
    }
    return true;
  }

  private ensureLevelUpPause(): void {
    if (!this.isLive || !this.hasUnresolvedWork || this.options.runState.status !== 'active') {
      return;
    }
    if (this.acquiringPause) {
      this.pauseReacquireRequested = true;
      return;
    }

    this.acquiringPause = true;
    try {
      do {
        this.pauseReacquireRequested = false;
        if (
          !this.isLive ||
          !this.hasUnresolvedWork ||
          this.options.runState.status !== 'active'
        ) {
          break;
        }

        this.ownsLevelUpPause = true;
        pauseRun(this.options.runState, this.options.bus, 'levelUp');
        if (!this.isLive) {
          break;
        }
      } while (this.pauseReacquireRequested);
    } finally {
      this.acquiringPause = false;
    }
  }

  private releaseLevelUpPause(): void {
    if (!this.ownsLevelUpPause) {
      return;
    }

    this.ownsLevelUpPause = false;
    resumeRun(this.options.runState, this.options.bus, 'levelUp');
  }

  private unwindOfferFailure(): void {
    this.pendingLevels.clear();
    this.activeOffer = undefined;
    this.queuedChoice = undefined;
    this.processRequested = false;
    this.releaseLevelUpPause();
  }

  private dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.unsubscribeLevelUp();
    this.unsubscribeRunResumed();
    this.pendingLevels.clear();
    this.activeOffer = undefined;
    this.queuedChoice = undefined;
    this.processRequested = false;
    this.releaseLevelUpPause();
  }
}

function snapshotDefinitions(
  definitions: readonly UpgradeDefinition[],
): UpgradeDefinition[] {
  return definitions.map((definition) => ({
    ...definition,
    effects: definition.effects.map((effect) => ({ ...effect })),
  }));
}

function canonicalDefinitions(
  definitions: readonly UpgradeDefinition[],
): readonly UpgradeDefinition[] {
  const canonical = definitions.map((definition) => {
    const effects = definition.effects.map((effect) => Object.freeze({ ...effect }));
    Object.freeze(effects);
    return Object.freeze({
      ...definition,
      effects,
    });
  });
  return Object.freeze(canonical);
}
