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
  private readonly view: PhaserUpgradeChooserView;

  constructor(scene: Phaser.Scene, bus: EventBus, upgradeSystem: UpgradeSystem) {
    this.view = new PhaserUpgradeChooserView(scene);
    this.controller = new UpgradeChooserController(
      bus,
      upgradeSystem,
      this.view,
    );
  }

  get diagnostics(): UpgradeChooserRenderDiagnostics {
    return this.view.diagnostics;
  }

  destroy(): void {
    this.controller.destroy();
  }
}

export interface UpgradeChooserRenderDiagnostics {
  readonly offerId?: number;
  readonly rebuildCount: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly keyboardListenerCount: number;
  readonly resizeListenerCount: number;
  readonly interactiveCardCount: number;
  readonly cards: readonly {
    readonly fillAlpha: number;
    readonly interactive: boolean;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly text: readonly {
    readonly role: string;
    readonly visible: boolean;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
}

export class PhaserUpgradeChooserView implements UpgradeChooserView {
  private root?: Phaser.GameObjects.Container;
  private cardBackgrounds: Phaser.GameObjects.Rectangle[] = [];
  private renderedText: Array<{ role: string; object: Phaser.GameObjects.Text }> = [];
  private select?: (offerId: number, choiceIndex: number) => boolean;
  private offer?: UpgradeChooserOffer;
  private currentOfferId?: number;
  private enabled = false;
  private destroyed = false;
  private rebuildCount = 0;

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.keyboard?.on('keydown', this.handleKeyDown, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
  }

  get diagnostics(): UpgradeChooserRenderDiagnostics {
    return {
      offerId: this.currentOfferId,
      rebuildCount: this.rebuildCount,
      displayWidth: this.scene.scale.displaySize.width,
      displayHeight: this.scene.scale.displaySize.height,
      keyboardListenerCount: this.scene.input.keyboard?.listenerCount('keydown') ?? 0,
      resizeListenerCount: this.scene.scale.listenerCount(Phaser.Scale.Events.RESIZE),
      interactiveCardCount: this.cardBackgrounds.filter((card) => card.input?.enabled).length,
      cards: this.cardBackgrounds.map((card) => ({
        fillAlpha: card.fillAlpha,
        interactive: card.input?.enabled ?? false,
        x: card.getBounds().x,
        y: card.getBounds().y,
        width: card.getBounds().width,
        height: card.getBounds().height,
      })),
      text: this.renderedText.map(({ role, object }) => {
        const bounds = object.getBounds();
        return {
          role,
          visible: object.visible,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      }),
    };
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
    this.rebuildCount += 1;

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
        maxLines: 2,
        wordWrap: { width: layout.headerWidth, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setFixedSize(layout.headerWidth, layout.headingHeight)
      .setCrop(0, 0, layout.headerWidth, layout.headingHeight);
    const instructions = this.scene.add
      .text(width / 2, layout.instructionsY, 'Tap a card or press 1, 2, or 3', {
        align: 'center',
        color: '#a5f3fc',
        fontFamily: 'Inter, sans-serif',
        fontSize: `${layout.fonts.instructions}px`,
        maxLines: 2,
        wordWrap: { width: layout.headerWidth, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setFixedSize(layout.headerWidth, layout.instructionsHeight)
      .setCrop(0, 0, layout.headerWidth, layout.instructionsHeight);
    this.renderedText.push(
      { role: 'heading', object: heading },
      { role: 'instructions', object: instructions },
    );
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

      const number = this.scene.add.text(
        cardLeft + cardLayout.padding,
        cardTop + cardLayout.padding,
        `${index + 1}.`,
        {
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: `${layout.fonts.name}px`,
          fontStyle: 'bold',
        },
      )
        .setFixedSize(cardLayout.numberWidth, cardLayout.nameHeight)
        .setCrop(0, 0, cardLayout.numberWidth, cardLayout.nameHeight);
      const name = this.scene.add.text(
        cardLeft + cardLayout.nameX,
        cardTop + cardLayout.padding,
        definition.name,
        {
          color: '#ffffff',
          fontFamily: 'Inter, sans-serif',
          fontSize: `${layout.fonts.name}px`,
          fontStyle: 'bold',
          maxLines: 1,
          wordWrap: { width: cardLayout.nameWidth, useAdvancedWrap: true },
        },
      )
        .setFixedSize(cardLayout.nameWidth, cardLayout.nameHeight)
        .setCrop(0, 0, cardLayout.nameWidth, cardLayout.nameHeight)
        .setVisible(cardLayout.nameWidth > 0);
      const rarity = this.scene.add
        .text(cardLeft + cardLayout.width - cardLayout.padding, cardTop + cardLayout.padding, definition.rarity, {
          align: 'right',
          color: '#fbbf24',
          fontFamily: 'Inter, sans-serif',
          fontSize: `${layout.fonts.rarity}px`,
        })
        .setOrigin(1, 0)
        .setFixedSize(cardLayout.rarityReserve, cardLayout.rarityHeight)
        .setCrop(0, 0, cardLayout.rarityReserve, cardLayout.rarityHeight);
      const showDescription =
        cardLayout.descriptionHeight >= layout.fonts.description * 1.15;
      const description = this.scene.add.text(
        cardLeft + cardLayout.padding,
        cardLayout.descriptionY,
        definition.description,
        {
          color: '#d6f7ff',
          fontFamily: 'Inter, sans-serif',
          fontSize: `${layout.fonts.description}px`,
          lineSpacing: layout.lineSpacing,
          maxLines: Math.max(
            1,
            Math.min(3, Math.floor(cardLayout.descriptionHeight / (layout.fonts.description * 1.2))),
          ),
          wordWrap: {
            width: cardLayout.width - cardLayout.padding * 2,
            useAdvancedWrap: true,
          },
        },
      )
        .setFixedSize(
          cardLayout.width - cardLayout.padding * 2,
          cardLayout.descriptionHeight,
        )
        .setCrop(
          0,
          0,
          cardLayout.width - cardLayout.padding * 2,
          cardLayout.descriptionHeight,
        )
        .setVisible(showDescription);

      this.cardBackgrounds.push(card);
      this.renderedText.push(
        { role: `number:${index}`, object: number },
        { role: `name:${index}`, object: name },
        { role: `rarity:${index}`, object: rarity },
        { role: `description:${index}`, object: description },
      );
      root.add([card, number, name, rarity, description]);
    });

    this.applyEnabledState();
  }

  setEnabled(enabled: boolean): void {
    if (this.destroyed || !this.root) {
      return;
    }

    this.enabled = enabled;
    this.applyEnabledState();
  }

  private applyEnabledState(): void {
    this.cardBackgrounds.forEach((card) => {
      card.setFillStyle(0x17303b, this.enabled ? 1 : 0.58);
      if (this.enabled) {
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
    this.renderedText = [];
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
