import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { UpgradeSystem } from '../systems/UpgradeSystem';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserView,
} from './upgradeChooserController';
import { computeUpgradeChooserLayout } from './upgradeChooserLayout';

const CHOOSER_DEPTH = 1_000;

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
  private offer?: UpgradeChooserOffer;
  private currentOfferId?: number;
  private enabled = false;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.keyboard?.on('keydown', this.handleKeyDown, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
    scene.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, this.handleScaleChange, this);
  }

  render(
    offer: UpgradeChooserOffer,
    select: (offerId: number, choiceIndex: number) => boolean,
  ): void {
    if (this.destroyed || offer.definitions.length === 0) {
      return;
    }

    this.clear();
    this.offer = offer;
    this.currentOfferId = offer.offerId;
    this.select = select;
    this.enabled = true;

    this.buildDisplay();
  }

  private buildDisplay(): void {
    const offer = this.offer;
    if (this.destroyed || !offer) {
      return;
    }

    const { width, height } = this.scene.scale;
    const layout = computeUpgradeChooserLayout(
      width,
      height,
      this.scene.scale.displaySize.width,
      this.scene.scale.displaySize.height,
      offer.definitions.length,
    );
    const root = this.scene.add.container(0, 0).setDepth(CHOOSER_DEPTH).setScrollFactor(0);
    this.root = root;

    const backdrop = this.scene.add
      .rectangle(width / 2, height / 2, width - 20, height - 20, 0x081118, 0.96)
      .setStrokeStyle(2, 0x2dd4bf, 0.72)
      .setInteractive();
    const heading = this.scene.add
      .text(width / 2, layout.headingY, 'Choose an upgrade', {
        align: 'center',
        color: '#f7f1d5',
        fontFamily: 'Inter, sans-serif',
        fontSize: `${layout.fonts.heading}px`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    const instructions = this.scene.add
      .text(width / 2, layout.instructionsY, 'Tap a card or press 1, 2, or 3', {
        align: 'center',
        color: '#a5f3fc',
        fontFamily: 'Inter, sans-serif',
        fontSize: `${layout.fonts.instructions}px`,
      })
      .setOrigin(0.5, 0);
    root.add([backdrop, heading, instructions]);

    offer.definitions.forEach((definition, index) => {
      const cardLayout = layout.cards[index];
      if (!cardLayout) {
        return;
      }
      const cardLeft = cardLayout.x - cardLayout.width / 2;
      const cardTop = cardLayout.y - cardLayout.height / 2;
      const card = this.scene.add
        .rectangle(
          cardLayout.x,
          cardLayout.y,
          cardLayout.width,
          cardLayout.height,
          0x17303b,
          1,
        )
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
        cardLeft + cardLayout.padding,
        cardTop + cardLayout.padding,
        `${index + 1}. ${definition.name}`,
        {
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: `${layout.fonts.name}px`,
          fontStyle: 'bold',
          maxLines: 2,
          wordWrap: { width: cardLayout.nameWidth, useAdvancedWrap: true },
        },
      );
      const rarity = this.scene.add
        .text(cardLeft + cardLayout.width - cardLayout.padding, cardTop + cardLayout.padding, definition.rarity, {
          color: '#fbbf24',
          fontFamily: 'Inter, sans-serif',
          fontSize: `${layout.fonts.rarity}px`,
        })
        .setOrigin(1, 0);
      const description = this.scene.add.text(
        cardLeft + cardLayout.padding,
        cardLayout.descriptionY,
        definition.description,
        {
          color: '#d6f7ff',
          fontFamily: 'Inter, sans-serif',
          fontSize: `${layout.fonts.description}px`,
          lineSpacing: layout.lineSpacing,
          maxLines: 3,
          wordWrap: {
            width: cardLayout.width - cardLayout.padding * 2,
            useAdvancedWrap: true,
          },
        },
      );

      this.cardBackgrounds.push(card);
      root.add([card, name, rarity, description]);
    });

    if (!this.enabled) {
      this.cardBackgrounds.forEach((card) => card.disableInteractive());
    }
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
    this.offer = undefined;
    this.destroyDisplay();
  }

  private destroyDisplay(): void {
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
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
    this.scene.scale.off(Phaser.Scale.Events.ORIENTATION_CHANGE, this.handleScaleChange, this);
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

  private readonly handleScaleChange = (): void => {
    if (this.destroyed || !this.offer) {
      return;
    }

    this.destroyDisplay();
    this.buildDisplay();
  };

  private submit(offerId: number, choiceIndex: number): void {
    if (!this.enabled || this.currentOfferId !== offerId || !this.select) {
      return;
    }
    this.select(offerId, choiceIndex);
  }
}
