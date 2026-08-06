import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { UpgradeSystem } from '../systems/UpgradeSystem';
import { FocusStroke, ThemeColor, ThemeDepth, ThemeFont } from './theme';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserView,
} from './upgradeChooserController';
import { computeUpgradeChooserLayout } from './upgradeChooserLayout';

const CHOOSER_DEPTH = ThemeDepth.upgradeChooser;
const CARD_STROKE = { color: ThemeColor.primaryDim, alpha: 0.78, width: 2 } as const;

export class UpgradeChooser {
  private readonly controller: UpgradeChooserController;
  private readonly view: PhaserUpgradeChooserView;

  constructor(
    scene: Phaser.Scene,
    bus: EventBus,
    upgradeSystem: UpgradeSystem,
    readReducedMotion: () => boolean = () => false,
  ) {
    this.view = new PhaserUpgradeChooserView(scene, readReducedMotion);
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
  readonly choiceIds: readonly string[];
  readonly rebuildCount: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly keyboardListenerCount: number;
  readonly resizeListenerCount: number;
  readonly interactiveCardCount: number;
  readonly reducedMotion: boolean;
  readonly cards: readonly {
    readonly fillAlpha: number;
    readonly interactive: boolean;
    readonly focused: boolean;
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
  private focusIndex = 0;
  private reducedMotion = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly readReducedMotion: () => boolean = () => false,
  ) {
    scene.input.keyboard?.on('keydown', this.handleKeyDown, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
  }

  get diagnostics(): UpgradeChooserRenderDiagnostics {
    return {
      offerId: this.currentOfferId,
      choiceIds: this.offer?.definitions.map((definition) => definition.id) ?? [],
      rebuildCount: this.rebuildCount,
      displayWidth: this.scene.scale.displaySize.width,
      displayHeight: this.scene.scale.displaySize.height,
      keyboardListenerCount: this.scene.input.keyboard?.listenerCount('keydown') ?? 0,
      resizeListenerCount: this.scene.scale.listenerCount(Phaser.Scale.Events.RESIZE),
      interactiveCardCount: this.cardBackgrounds.filter((card) => card.input?.enabled).length,
      reducedMotion: this.reducedMotion,
      cards: this.cardBackgrounds.map((card, index) => ({
        fillAlpha: card.fillAlpha,
        interactive: card.input?.enabled ?? false,
        focused: index === this.focusIndex,
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

    // reducedMotion is read at every render/rebuild. There are no optional
    // tween durations today; any animation added later must be gated through
    // reducedMotionDuration so it never delays a card command.
    this.reducedMotion = this.readReducedMotion();

    const { width, height } = this.scene.scale;
    const layout = computeUpgradeChooserLayout(
      width,
      height,
      this.scene.scale.displaySize.width,
      this.scene.scale.displaySize.height,
      offer.definitions.length,
    );
    const root = this.scene.add.container(0, 0);
    const cardBackgrounds: Phaser.GameObjects.Rectangle[] = [];
    const renderedText: Array<{ role: string; object: Phaser.GameObjects.Text }> = [];
    const own = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      root.add(object);
      return object;
    };

    try {
      root.setDepth(CHOOSER_DEPTH).setScrollFactor(0);

      const backdrop = own(this.scene.add.rectangle(
        width / 2,
        height / 2,
        width - 20,
        height - 20,
        ThemeColor.surface,
        0.96,
      ));
      backdrop.setStrokeStyle(2, ThemeColor.primary, 0.72).setInteractive();
      const heading = own(this.scene.add.text(
        width / 2,
        layout.headingY,
        'Choose an upgrade',
        {
        align: 'center',
        color: '#f7f1d5',
        fontFamily: ThemeFont.family,
        fontSize: `${layout.fonts.heading}px`,
        fontStyle: 'bold',
        },
      ));
      heading
        .setMaxLines(2)
        .setWordWrapWidth(layout.headerWidth, true)
        .setOrigin(0.5, 0)
        .setFixedSize(layout.headerWidth, layout.headingHeight)
        .setCrop(0, 0, layout.headerWidth, layout.headingHeight);
      const instructions = own(this.scene.add.text(
        width / 2,
        layout.instructionsY,
        'Tap a card or press 1, 2, or 3',
        {
        align: 'center',
        color: '#a5f3fc',
        fontFamily: ThemeFont.family,
        fontSize: `${layout.fonts.instructions}px`,
        },
      ));
      instructions
        .setMaxLines(2)
        .setWordWrapWidth(layout.headerWidth, true)
        .setOrigin(0.5, 0)
        .setFixedSize(layout.headerWidth, layout.instructionsHeight)
        .setCrop(0, 0, layout.headerWidth, layout.instructionsHeight);
      renderedText.push(
        { role: 'heading', object: heading },
        { role: 'instructions', object: instructions },
      );

      offer.definitions.forEach((definition, index) => {
        const cardLayout = layout.cards[index];
        if (!cardLayout) {
          return;
        }
        const cardLeft = cardLayout.x - cardLayout.width / 2;
        const cardTop = cardLayout.y - cardLayout.height / 2;
        const card = own(this.scene.add.rectangle(
          cardLayout.x,
          cardLayout.y,
          cardLayout.width,
          cardLayout.height,
          ThemeColor.card,
          1,
        ));
        card
          .setStrokeStyle(CARD_STROKE.width, CARD_STROKE.color, CARD_STROKE.alpha)
          .setInteractive({ useHandCursor: true });
        card.on(Phaser.Input.Events.POINTER_OVER, () => {
          if (this.enabled) {
            card.setFillStyle(ThemeColor.cardHover, 1);
          }
        });
        card.on(Phaser.Input.Events.POINTER_OUT, () => {
          card.setFillStyle(ThemeColor.card, this.enabled ? 1 : 0.58);
        });
        card.on(Phaser.Input.Events.POINTER_UP, () => {
          this.submit(offer.offerId, index);
        });

        const number = own(this.scene.add.text(
          cardLeft + cardLayout.padding,
          cardTop + cardLayout.padding,
          `${index + 1}.`,
          {
            color: '#ffffff',
            fontFamily: ThemeFont.family,
            fontSize: `${layout.fonts.name}px`,
            fontStyle: 'bold',
          },
        ));
        number
          .setFixedSize(cardLayout.numberWidth, cardLayout.nameHeight)
          .setCrop(0, 0, cardLayout.numberWidth, cardLayout.nameHeight);
        renderedText.push({ role: `number:${index}`, object: number });

        if (cardLayout.nameWidth > 0) {
          const name = own(this.scene.add.text(
            cardLeft + cardLayout.nameX,
            cardTop + cardLayout.padding,
            definition.name,
            {
              color: '#ffffff',
              fontFamily: ThemeFont.family,
              fontSize: `${layout.fonts.name}px`,
              fontStyle: 'bold',
            },
          ));
          name
            .setMaxLines(1)
            .setWordWrapWidth(cardLayout.nameWidth, true)
            .setFixedSize(cardLayout.nameWidth, cardLayout.nameHeight)
            .setCrop(0, 0, cardLayout.nameWidth, cardLayout.nameHeight);
          renderedText.push({ role: `name:${index}`, object: name });
        }

        const rarity = own(this.scene.add.text(
          cardLeft + cardLayout.width - cardLayout.padding,
          cardTop + cardLayout.padding,
          definition.rarity,
          {
          align: 'right',
          color: '#fbbf24',
          fontFamily: ThemeFont.family,
          fontSize: `${layout.fonts.rarity}px`,
          },
        ));
        rarity
          .setOrigin(1, 0)
          .setFixedSize(cardLayout.rarityReserve, cardLayout.rarityHeight)
          .setCrop(0, 0, cardLayout.rarityReserve, cardLayout.rarityHeight);
        renderedText.push({ role: `rarity:${index}`, object: rarity });

        const descriptionWidth = Math.max(
          0,
          cardLayout.width - cardLayout.padding * 2,
        );
        const showDescription =
          descriptionWidth > 0 &&
          cardLayout.descriptionHeight >= layout.fonts.description * 1.15;
        if (showDescription) {
          const description = own(this.scene.add.text(
            cardLeft + cardLayout.padding,
            cardLayout.descriptionY,
            definition.description,
            {
              color: '#d6f7ff',
              fontFamily: ThemeFont.family,
              fontSize: `${layout.fonts.description}px`,
              lineSpacing: layout.lineSpacing,
            },
          ));
          description
            .setMaxLines(Math.max(
              1,
              Math.min(
                3,
                Math.floor(
                  cardLayout.descriptionHeight /
                  (layout.fonts.description * 1.2),
                ),
              ),
            ))
            .setWordWrapWidth(descriptionWidth, true)
            .setFixedSize(descriptionWidth, cardLayout.descriptionHeight)
            .setCrop(0, 0, descriptionWidth, cardLayout.descriptionHeight);
          renderedText.push({
            role: `description:${index}`,
            object: description,
          });
        }

        cardBackgrounds.push(card);
      });

      this.root = root;
      this.cardBackgrounds = cardBackgrounds;
      this.renderedText = renderedText;
      this.rebuildCount += 1;
      this.focusIndex = Math.min(
        this.focusIndex,
        Math.max(0, cardBackgrounds.length - 1),
      );
      this.applyEnabledState();
      this.applyFocusStroke();
    } catch (error) {
      root.destroy(true);
      throw error;
    }
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
      card.setFillStyle(ThemeColor.card, this.enabled ? 1 : 0.58);
      if (this.enabled) {
        card.setInteractive({ useHandCursor: true });
      } else {
        card.disableInteractive();
      }
    });
  }

  /** Visible shared focus treatment: the focused card carries the theme focus
   *  stroke; movement is presentation-only and activation still routes through
   *  the captured offer token. */
  private moveFocus(direction: 1 | -1): void {
    const count = this.cardBackgrounds.length;
    if (count === 0) {
      return;
    }
    this.focusIndex = (this.focusIndex + direction + count) % count;
    this.applyFocusStroke();
  }

  private applyFocusStroke(): void {
    this.cardBackgrounds.forEach((card, index) => {
      const focused = index === this.focusIndex;
      card.setStrokeStyle(
        focused ? FocusStroke.width : CARD_STROKE.width,
        focused ? FocusStroke.color : CARD_STROKE.color,
        focused ? FocusStroke.alpha : CARD_STROKE.alpha,
      );
    });
  }

  clear(): void {
    this.enabled = false;
    this.currentOfferId = undefined;
    this.select = undefined;
    this.offer = undefined;
    this.focusIndex = 0;
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
    if (this.destroyed || !this.enabled || this.currentOfferId === undefined) {
      return;
    }

    // Arrow keys move a wrapping presentation-only focus index.
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      this.moveFocus(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      this.moveFocus(1);
      return;
    }

    // Repeat keydown events never cause an activation command.
    if (event.repeat) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      this.submit(this.currentOfferId, this.focusIndex);
      return;
    }

    const choiceIndex = choiceIndexForNumberKey(event.key);
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
