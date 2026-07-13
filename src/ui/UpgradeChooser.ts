import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { UpgradeSystem } from '../systems/UpgradeSystem';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserView,
} from './upgradeChooserController';

const CHOOSER_DEPTH = 1_000;
const CARD_GAP = 12;

export class UpgradeChooser {
  private readonly controller: UpgradeChooserController;

  constructor(scene: Phaser.Scene, bus: EventBus, upgradeSystem: UpgradeSystem) {
    this.controller = new UpgradeChooserController(
      bus,
      upgradeSystem,
      new PhaserUpgradeChooserView(scene),
    );
  }

  destroy(): void {
    this.controller.destroy();
  }
}

class PhaserUpgradeChooserView implements UpgradeChooserView {
  private root?: Phaser.GameObjects.Container;
  private cardBackgrounds: Phaser.GameObjects.Rectangle[] = [];
  private select?: (offerId: number, choiceIndex: number) => boolean;
  private currentOfferId?: number;
  private enabled = false;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.keyboard?.on('keydown', this.handleKeyDown, this);
  }

  render(
    offer: UpgradeChooserOffer,
    select: (offerId: number, choiceIndex: number) => boolean,
  ): void {
    if (this.destroyed || offer.definitions.length === 0) {
      return;
    }

    this.clear();
    this.currentOfferId = offer.offerId;
    this.select = select;
    this.enabled = true;

    const { width, height } = this.scene.scale;
    const root = this.scene.add.container(0, 0).setDepth(CHOOSER_DEPTH).setScrollFactor(0);
    this.root = root;

    const backdrop = this.scene.add
      .rectangle(width / 2, height / 2, width - 20, height - 20, 0x081118, 0.96)
      .setStrokeStyle(2, 0x2dd4bf, 0.72)
      .setInteractive();
    const heading = this.scene.add
      .text(width / 2, 92, 'Choose an upgrade', {
        align: 'center',
        color: '#f7f1d5',
        fontFamily: 'Inter, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const instructions = this.scene.add
      .text(width / 2, 130, 'Tap a card or press 1, 2, or 3', {
        align: 'center',
        color: '#a5f3fc',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
      })
      .setOrigin(0.5);
    root.add([backdrop, heading, instructions]);

    const cardWidth = width - 44;
    const availableHeight = height - 210;
    const cardHeight = Math.min(
      168,
      Math.floor((availableHeight - CARD_GAP * (offer.definitions.length - 1)) / offer.definitions.length),
    );
    const totalHeight = cardHeight * offer.definitions.length + CARD_GAP * (offer.definitions.length - 1);
    const top = 160 + Math.max(0, (availableHeight - totalHeight) / 2);

    offer.definitions.forEach((definition, index) => {
      const y = top + cardHeight / 2 + index * (cardHeight + CARD_GAP);
      const card = this.scene.add
        .rectangle(width / 2, y, cardWidth, cardHeight, 0x17303b, 1)
        .setStrokeStyle(2, 0x67e8f9, 0.78)
        .setInteractive({ useHandCursor: true });
      card.on(Phaser.Input.Events.POINTER_OVER, () => {
        if (this.enabled) {
          card.setFillStyle(0x214756, 1);
        }
      });
      card.on(Phaser.Input.Events.POINTER_OUT, () => {
        card.setFillStyle(0x17303b, this.enabled ? 1 : 0.58);
      });
      card.on(Phaser.Input.Events.POINTER_UP, () => {
        this.submit(offer.offerId, index);
      });

      const name = this.scene.add.text(
        width / 2 - cardWidth / 2 + 16,
        y - cardHeight / 2 + 18,
        `${index + 1}. ${definition.name}`,
        {
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
        },
      );
      const rarity = this.scene.add
        .text(width / 2 + cardWidth / 2 - 16, y - cardHeight / 2 + 22, definition.rarity, {
          color: '#fbbf24',
          fontFamily: 'Inter, sans-serif',
          fontSize: '12px',
        })
        .setOrigin(1, 0);
      const description = this.scene.add.text(
        width / 2 - cardWidth / 2 + 16,
        y - cardHeight / 2 + 54,
        definition.description,
        {
          color: '#d6f7ff',
          fontFamily: 'Inter, sans-serif',
          fontSize: '14px',
          lineSpacing: 4,
          maxLines: 3,
          wordWrap: { width: cardWidth - 32, useAdvancedWrap: true },
        },
      );

      this.cardBackgrounds.push(card);
      root.add([card, name, rarity, description]);
    });
  }

  setEnabled(enabled: boolean): void {
    if (this.destroyed || !this.root) {
      return;
    }

    this.enabled = enabled;
    this.cardBackgrounds.forEach((card) => {
      card.setFillStyle(0x17303b, enabled ? 1 : 0.58);
      if (enabled) {
        card.setInteractive({ useHandCursor: true });
      } else {
        card.disableInteractive();
      }
    });
  }

  clear(): void {
    this.enabled = false;
    this.currentOfferId = undefined;
    this.select = undefined;
    this.cardBackgrounds = [];
    this.root?.destroy(true);
    this.root = undefined;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.scene.input.keyboard?.off('keydown', this.handleKeyDown, this);
    this.clear();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !this.enabled || this.currentOfferId === undefined) {
      return;
    }

    const choiceIndex = choiceIndexForNumberKey(event.key, event.repeat);
    if (choiceIndex !== undefined) {
      this.submit(this.currentOfferId, choiceIndex);
    }
  };

  private submit(offerId: number, choiceIndex: number): void {
    if (!this.enabled || this.currentOfferId !== offerId || !this.select) {
      return;
    }
    this.select(offerId, choiceIndex);
  }
}
