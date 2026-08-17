import type { EventBus } from '../engine/eventBus';
import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import { PendingLevelUps } from '../gameplay/levelUpQueue';
import { pauseRun, resumeRun, type RunState } from '../gameplay/runState';
import { applyCard, offerCards, readStack, singleScopedFamily } from '../gameplay/upgrades';
import type { UpgradeCardReadModel, UpgradeDefinition } from './types';

export interface UpgradeSystemOptions {
  runState: RunState;
  bus: EventBus;
  definitions: readonly UpgradeDefinition[];
  rng: Rng;
  offerCount?: number;
}

/** Epic 18 (D7): the authoritative, frozen-at-offer-time card presentation.
 *  `choices` is built once when the offer becomes active and returned
 *  as-is on every subsequent `currentOfferSnapshot` read — it is never
 *  recomputed from mutable state per getter call. */
export interface UpgradeOfferSnapshot {
  readonly offerId: number;
  readonly choices: readonly UpgradeCardReadModel[];
}

interface ActiveOffer {
  offerId: number;
  definitions: UpgradeDefinition[];
  snapshot: UpgradeOfferSnapshot;
}

/** Epic 18 (D2): production's presentation boundary. `offerCards()` itself
 *  stays generic; this validates a *supplied* `offerCount` as a safe
 *  integer in 1..5 and fails fast rather than silently clamping. An
 *  omitted `offerCount` keeps `offerCards()`'s own compatibility default. */
function assertValidOfferCount(offerCount: number | undefined): void {
  if (offerCount === undefined) {
    return;
  }
  if (!Number.isInteger(offerCount) || offerCount < 1 || offerCount > 5) {
    throw new Error(
      `UpgradeSystem offerCount must be a safe integer in 1..5; received ${offerCount}`,
    );
  }
}

function buildReadModel(
  definition: UpgradeDefinition,
  stacks: Readonly<Record<string, number>>,
): UpgradeCardReadModel {
  const currentStacks = readStack(stacks, definition.id) ?? 0;
  const family = singleScopedFamily(definition.effects);
  return Object.freeze({
    id: definition.id,
    name: definition.name,
    rarity: definition.rarity,
    target: definition.target,
    description: definition.description,
    category: definition.presentation.category,
    iconArtId: definition.presentation.iconArtId,
    ...(family !== undefined ? { family } : {}),
    owned: currentStacks > 0,
    currentStacks,
    maxStacks: definition.maxStacks,
    nextStack: currentStacks + 1,
  });
}

function buildOfferSnapshot(
  offerId: number,
  definitions: readonly UpgradeDefinition[],
  stacks: Readonly<Record<string, number>>,
): UpgradeOfferSnapshot {
  return Object.freeze({
    offerId,
    choices: Object.freeze(definitions.map((definition) => buildReadModel(definition, stacks))),
  });
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
    assertValidOfferCount(options.offerCount);
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

  /** Compatibility surface: a defensive clone of the canonical definitions
   *  backing the active offer. Deep-clones nested `effects[].scope` and
   *  `presentation` so a caller mutating the returned array cannot alter the
   *  active offer or an applied modifier. The chooser itself should prefer
   *  `currentOfferSnapshot`'s frozen read model instead. */
  get currentOffer(): readonly UpgradeDefinition[] {
    if (this.destroyed) {
      return [];
    }
    const definitions = this.group.currentOfferDefinitions;
    return definitions ? snapshotDefinitions(definitions) : [];
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

  /** Epic 18 (D7): returns the snapshot frozen when the active offer was
   *  created. Never recomputed from mutable state per call. */
  get currentOfferSnapshot(): UpgradeOfferSnapshot | undefined {
    return this.activeOffer?.snapshot;
  }

  get currentOfferDefinitions(): readonly UpgradeDefinition[] | undefined {
    return this.activeOffer?.definitions;
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
              { stacks: this.options.runState.upgradeStacks, equipped: this.options.runState.equipped },
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
            snapshot: buildOfferSnapshot(
              this.nextOfferId,
              definitions,
              this.options.runState.upgradeStacks,
            ),
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
        choices: Object.freeze(offer.snapshot.choices.map((choice) => choice.id)),
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
    effects: definition.effects.map((effect) => ({
      ...effect,
      ...(effect.scope ? { scope: { ...effect.scope } } : {}),
    })),
    presentation: { ...definition.presentation },
  }));
}

/** Epic 18 (D7): captures one canonical definition set at construction, deep
 *  copying and freezing every nested object a caller could otherwise retain
 *  a mutable reference to (`effects[].scope`, `presentation`) — mirrors the
 *  same discipline `ModifierStack.add()` applies to a modifier's `scope` on
 *  insertion, so a caller mutating its original definitions after
 *  construction can never retarget a canonical or active-offer modifier or
 *  its displayed category/icon. */
function canonicalDefinitions(
  definitions: readonly UpgradeDefinition[],
): readonly UpgradeDefinition[] {
  const canonical = definitions.map((definition) => {
    const effects = definition.effects.map((effect) =>
      Object.freeze({
        ...effect,
        ...(effect.scope ? { scope: Object.freeze({ ...effect.scope }) } : {}),
      }),
    );
    Object.freeze(effects);
    return Object.freeze({
      ...definition,
      effects,
      presentation: Object.freeze({ ...definition.presentation }),
    });
  });
  return Object.freeze(canonical);
}
