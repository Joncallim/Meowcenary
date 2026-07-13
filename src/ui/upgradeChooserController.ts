import type { EventBus } from '../engine/eventBus';
import type { UpgradeOfferSnapshot } from '../systems/UpgradeSystem';
import type { UpgradeDefinition } from '../systems/types';

export interface UpgradeChooserOffer {
  offerId: number;
  definitions: readonly UpgradeDefinition[];
}

export interface UpgradeChooserSource {
  readonly currentOfferSnapshot: UpgradeOfferSnapshot | undefined;
  chooseCard(offerId: number, upgradeId: string): boolean;
}

export interface UpgradeChooserView {
  render(
    offer: UpgradeChooserOffer,
    select: (offerId: number, choiceIndex: number) => boolean,
  ): void;
  setEnabled(enabled: boolean): void;
  clear(): void;
  destroy(): void;
}

export function choiceIndexForNumberKey(
  key: string,
  repeat = false,
): number | undefined {
  if (repeat || !/^[1-3]$/.test(key)) {
    return undefined;
  }
  return Number.parseInt(key, 10) - 1;
}

/**
 * Phaser-free presentation state for the minimal chooser. Gameplay ownership
 * stays in UpgradeSystem; this controller only validates display tokens and
 * forwards one visible selection at a time.
 */
export class UpgradeChooserController {
  private readonly unsubscribeOffered: () => void;
  private readonly unsubscribeChosen: () => void;
  private activeOffer?: UpgradeChooserOffer;
  private submitting = false;
  private destroyed = false;

  constructor(
    bus: EventBus,
    private readonly source: UpgradeChooserSource,
    private readonly view: UpgradeChooserView,
  ) {
    this.unsubscribeOffered = bus.on('card:offered', this.handleOffered);
    this.unsubscribeChosen = bus.on('card:chosen', this.handleChosen);
  }

  get currentOfferId(): number | undefined {
    return this.activeOffer?.offerId;
  }

  get choiceCount(): number {
    return this.activeOffer?.definitions.length ?? 0;
  }

  select(offerId: number, choiceIndex: number): boolean {
    const offer = this.activeOffer;
    if (
      this.destroyed ||
      this.submitting ||
      !offer ||
      offer.offerId !== offerId ||
      !Number.isInteger(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= offer.definitions.length
    ) {
      return false;
    }

    if (this.source.currentOfferSnapshot?.offerId !== offerId) {
      this.clearActiveOffer();
      return false;
    }

    const definition = offer.definitions[choiceIndex];
    if (!definition) {
      return false;
    }

    this.submitting = true;
    this.view.setEnabled(false);

    let accepted: boolean;
    try {
      accepted = this.source.chooseCard(offerId, definition.id);
    } catch (error) {
      if (!this.destroyed && this.activeOffer?.offerId === offerId) {
        this.submitting = false;
        this.view.setEnabled(true);
      }
      throw error;
    }

    if (this.destroyed || this.activeOffer?.offerId !== offerId) {
      return accepted;
    }

    if (!accepted) {
      this.submitting = false;
      this.view.setEnabled(true);
    }
    return accepted;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.unsubscribeOffered();
    this.unsubscribeChosen();
    this.activeOffer = undefined;
    this.submitting = false;
    this.view.destroy();
  }

  private readonly handleOffered = (payload: {
    offerId: number;
    choices: readonly string[];
  }): void => {
    if (this.destroyed) {
      return;
    }

    const snapshot = this.source.currentOfferSnapshot;
    const definitions = matchingDefinitions(snapshot, payload.offerId, payload.choices);
    if (!definitions || this.source.currentOfferSnapshot?.offerId !== payload.offerId) {
      if (this.activeOffer && payload.offerId >= this.activeOffer.offerId) {
        this.clearActiveOffer();
      }
      return;
    }

    this.view.clear();
    this.activeOffer = { offerId: payload.offerId, definitions };
    this.submitting = false;
    this.view.render(this.activeOffer, this.select.bind(this));

    if (
      !this.destroyed &&
      this.activeOffer?.offerId === payload.offerId &&
      this.source.currentOfferSnapshot?.offerId !== payload.offerId
    ) {
      this.clearActiveOffer();
    }
  };

  private readonly handleChosen = (): void => {
    if (!this.destroyed && this.activeOffer) {
      this.clearActiveOffer();
    }
  };

  private clearActiveOffer(): void {
    this.activeOffer = undefined;
    this.submitting = false;
    this.view.clear();
  }
}

function matchingDefinitions(
  snapshot: UpgradeOfferSnapshot | undefined,
  offerId: number,
  choices: readonly string[],
): readonly UpgradeDefinition[] | undefined {
  if (
    !snapshot ||
    snapshot.offerId !== offerId ||
    choices.length === 0 ||
    choices.length !== snapshot.definitions.length
  ) {
    return undefined;
  }

  const definitionsById = new Map(
    snapshot.definitions.map((definition) => [definition.id, definition] as const),
  );
  const seen = new Set<string>();
  const ordered: UpgradeDefinition[] = [];
  for (const id of choices) {
    const definition = definitionsById.get(id);
    if (!definition || seen.has(id)) {
      return undefined;
    }
    seen.add(id);
    ordered.push(definition);
  }
  return ordered;
}
