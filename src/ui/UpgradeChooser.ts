import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { UpgradeSystem } from '../systems/UpgradeSystem';
import type { VisualArtLookup } from '../systems/visualArt';
import { FocusStroke, ThemeColor, ThemeDepth, ThemeFont } from './theme';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserView,
} from './upgradeChooserController';
import { computeUpgradeChooserLayout } from './upgradeChooserLayout';
import type { InputMode } from '../systems/input';

const CHOOSER_DEPTH = ThemeDepth.upgradeChooser;
const CARD_STROKE = { color: ThemeColor.primaryDim, alpha: 0.78, width: 2 } as const;

export class UpgradeChooser {
  private readonly controller: UpgradeChooserController;
  private readonly view: PhaserUpgradeChooserView;
  private readonly bus: EventBus;

  constructor(
    scene: Phaser.Scene,
    bus: EventBus,
    upgradeSystem: UpgradeSystem,
    readReducedMotion: () => boolean = () => false,
    visualArt?: VisualArtLookup,
    readInputMode: () => InputMode = () => 'pointer',
  ) {
    this.bus = bus;
    this.view = new PhaserUpgradeChooserView(scene, readReducedMotion, visualArt, readInputMode);
    this.controller = new UpgradeChooserController(
      bus,
      upgradeSystem,
      this.view,
    );
  }

  get diagnostics(): UpgradeChooserRenderDiagnostics {
    return this.view.diagnostics;
  }

  /** Epic 18 (D9): narrow public navigation/confirm seam Epic 19 can drive
   *  later without reaching into the Phaser view implementation. Each facade
   *  move emits exactly one `ui:navigate` only when the logical focus index
   *  actually changed; boundary/disabled/no-offer moves emit nothing. */
  focusPrevious(): boolean {
    const moved = this.view.focusPrevious();
    if (moved) this.bus.emit('ui:navigate', {});
    return moved;
  }

  focusNext(): boolean {
    const moved = this.view.focusNext();
    if (moved) this.bus.emit('ui:navigate', {});
    return moved;
  }

  confirmFocused(): boolean {
    return this.view.confirmFocused();
  }

  refreshInputPresentation(): void {
    this.view.refreshInputPresentation();
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
    readonly text: string;
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
  private hoveredIndex = -1;
  /** Explicit committed-display gate retained separately from the root
   *  reference: false before teardown, true only after a successful
   *  publication. Number shortcuts and the logical seams must not reach a
   *  destroyed/invisible tree through the retained offer (round-2 F1). */
  private committedDisplay = false;
  private inputMode: InputMode = 'pointer';
  private lastInputMode: InputMode = 'pointer';
  private instructions?: Phaser.GameObjects.Text;
  private reducedMotion = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly readReducedMotion: () => boolean = () => false,
    private readonly visualArt?: VisualArtLookup,
    private readonly readInputMode: () => InputMode = () => 'pointer',
  ) {
    scene.input.keyboard?.on('keydown', this.handleKeyDown, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleChange, this);
  }

  get diagnostics(): UpgradeChooserRenderDiagnostics {
    return {
      offerId: this.currentOfferId,
      choiceIds: this.offer?.choices.map((choice) => choice.id) ?? [],
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
          text: object.text,
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
    if (this.destroyed || offer.choices.length === 0) {
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
    // Hover belongs to the previous tree's display objects and is never
    // preserved across a rebuild (§3 committed-render transaction).
    this.hoveredIndex = -1;
    // The display is uncommitted from the moment teardown begins until the
    // successful publication below (F1 committed-display gate).
    this.committedDisplay = false;

    const { width, height } = this.scene.scale;
    const layout = computeUpgradeChooserLayout(
      width,
      height,
      this.scene.scale.displaySize.width,
      this.scene.scale.displaySize.height,
      offer.choices.length,
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
        this.instructionCopy(),
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
      // Staged: published together with the root, so a failed build never
      // leaves `instructions` pointing at a destroyed object.
      const stagedInstructions = instructions;

      offer.choices.forEach((choice, index) => {
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
            this.hoveredIndex = index;
            this.focusIndex = index;
            this.applyFocusStroke();
            card.setFillStyle(ThemeColor.cardHover, 1);
          }
        });
        card.on(Phaser.Input.Events.POINTER_OUT, () => {
          if (this.hoveredIndex === index) this.hoveredIndex = -1;
          this.applyFocusStroke();
          card.setFillStyle(ThemeColor.card, this.enabled ? 1 : 0.58);
        });
        card.on(Phaser.Input.Events.POINTER_UP, () => {
          this.submit(offer.offerId, index);
        });

        // Epic 18 (D9 content priority 1): icon, falling back to a numbered
        // badge (also a visible touch/keyboard-shortcut hint) when no bound,
        // loaded texture exists for this card's icon.
        const iconBinding = this.visualArt?.bindingById(choice.iconArtId);
        const showIcon =
          iconBinding?.kind === 'upgrade-icon' &&
          cardLayout.iconSize > 0 &&
          this.scene.textures.exists(iconBinding.textureKey);
        if (showIcon) {
          // The layout's icon box already honors the binding's declared
          // display size wherever the card can afford it, and clamps only
          // when it genuinely cannot — so the icon keeps its D8 sizing at
          // phone scale instead of shrinking to the old number-badge box.
          const size = Math.min(cardLayout.iconSize, iconBinding.display.width);
          const height = Math.min(cardLayout.iconSize, iconBinding.display.height);
          const icon = own(this.scene.add.image(
            cardLeft + cardLayout.padding + size / 2,
            cardTop + cardLayout.padding + height / 2,
            iconBinding.textureKey,
          ));
          icon.setDisplaySize(size, height);
        } else {
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
        }

        if (cardLayout.nameWidth > 0) {
          const name = own(this.scene.add.text(
            cardLeft + cardLayout.nameX,
            cardTop + cardLayout.padding,
            choice.name,
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

        // Epic 18 (D9 content priority 3): rarity plus category/family cue.
        const rarityLabel = `${choice.rarity} • ${choice.family ?? choice.category}`;
        const rarity = own(this.scene.add.text(
          cardLeft + cardLayout.width - cardLayout.padding,
          cardTop + cardLayout.padding,
          rarityLabel,
          {
          align: 'right',
          color: '#fbbf24',
          fontFamily: ThemeFont.family,
          fontSize: `${layout.fonts.rarity}px`,
          },
        ));
        rarity
          .setOrigin(1, 0)
          .setMaxLines(1)
          .setFixedSize(cardLayout.rarityReserve, cardLayout.rarityHeight)
          .setCrop(0, 0, cardLayout.rarityReserve, cardLayout.rarityHeight);
        renderedText.push({ role: `rarity:${index}`, object: rarity });

        // Epic 18 (D9 content priority 2): current/max -> next/max stack
        // state, read from the frozen offer snapshot (never recomputed).
        // Hidden only when the clamped row cannot fit a line at all, the
        // same containment rule the description below already follows.
        const statusLabel = choice.owned
          ? `${choice.currentStacks}/${choice.maxStacks} -> ${choice.nextStack}/${choice.maxStacks}`
          : `New -> ${choice.nextStack}/${choice.maxStacks}`;
        const statusWidth = Math.max(0, cardLayout.width - cardLayout.padding * 2);
        const showStatus =
          statusWidth > 0 && cardLayout.statusHeight >= layout.fonts.status * 1.15;
        if (showStatus) {
          const status = own(this.scene.add.text(
            cardLeft + cardLayout.padding,
            cardLayout.statusY,
            statusLabel,
            {
              color: '#a5f3fc',
              fontFamily: ThemeFont.family,
              fontSize: `${layout.fonts.status}px`,
            },
          ));
          status
            .setMaxLines(1)
            .setWordWrapWidth(statusWidth, true)
            .setFixedSize(statusWidth, cardLayout.statusHeight)
            .setCrop(0, 0, statusWidth, cardLayout.statusHeight);
          renderedText.push({ role: `status:${index}`, object: status });
        }

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
            choice.description,
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

      this.cardBackgrounds = cardBackgrounds;
      this.renderedText = renderedText;
      this.instructions = stagedInstructions;
      this.rebuildCount += 1;
      // currentOfferId is the sole chooser identity: a new offer resets
      // focusIndex to 0 through clear()/render(); a same-offer rebuild
      // preserves the retained index, clamped to the rebuilt card count.
      this.focusIndex = Math.min(this.focusIndex, Math.max(0, cardBackgrounds.length - 1));
      this.applyEnabledState();
      this.applyFocusStroke();

      // The root is only published once the display tree is fully built and
      // styled, so a failed render leaves the chooser without a published
      // root and a later render can retry from a clean slate. Until this
      // publish, acceptsNavigation stays false and no move/confirm seam can
      // act on an invisible card.
      this.root = root;
      this.committedDisplay = true;
    } catch (error) {
      root.destroy(true);
      // Partial reset is intentional: only the references to destroyed
      // objects are cleared. offer/currentOfferId/select/enabled are retained
      // so a later resize rebuild via handleScaleChange() retries the same
      // offer, and the render() path resets them through clear(). Because the
      // root is never published on failure, the chooser stays non-navigable
      // until a retry commits. A full reset here would break resize-recovery
      // and the test asserting diagnostics.offerId survives a failed rebuild.
      this.cardBackgrounds = [];
      this.renderedText = [];
      this.instructions = undefined;
      this.hoveredIndex = -1;
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
   *  the captured offer token. Linear wrap on the retained `focusIndex`
   *  (F3/F7): `currentOfferId` is the sole identity, so there is exactly one
   *  mutable focus owner and the seam reports whether the index changed. */
  private moveFocus(direction: 1 | -1): boolean {
    if (!this.acceptsNavigation) return false;
    const count = this.cardBackgrounds.length;
    if (count === 0) return false;
    const next = direction < 0
      ? this.focusIndex === 0 ? count - 1 : this.focusIndex - 1
      : this.focusIndex === count - 1 ? 0 : this.focusIndex + 1;
    const changed = next !== this.focusIndex;
    this.focusIndex = next;
    this.applyFocusStroke();
    return changed;
  }

  private applyFocusStroke(): void {
    this.cardBackgrounds.forEach((card, index) => {
      const focused = this.inputMode === 'pointer'
        ? index === this.hoveredIndex
        : index === this.focusIndex;
      card.setStrokeStyle(
        focused ? FocusStroke.width : CARD_STROKE.width,
        focused ? FocusStroke.color : CARD_STROKE.color,
        focused ? FocusStroke.alpha : CARD_STROKE.alpha,
      );
    });
  }

  /** Epic 18 (D9): the seam Epic 19 will later drive with logical
   *  nav/confirm actions. Presentation-only focus movement; activation still
   *  routes through the same captured offer token as touch/keyboard.
   *
   *  Guarded identically to `handleKeyDown` so a future action adapter and
   *  the raw keyboard path stay behaviorally identical — notably, neither
   *  moves the visible focus while the chooser is disabled (an in-flight
   *  submission) or before a committed visible root exists (a failed
   *  rebuild leaves the retained offer non-navigable until a retry
   *  publishes). */
  private get acceptsNavigation(): boolean {
    return !this.destroyed
      && this.enabled
      && this.currentOfferId !== undefined
      && this.committedDisplay;
  }

  focusPrevious(): boolean {
    return this.moveFocus(-1);
  }

  focusNext(): boolean {
    return this.moveFocus(1);
  }

  refreshInputPresentation(): void {
    const mode = this.readInputMode();
    if (mode === this.lastInputMode) return;
    this.lastInputMode = mode;
    this.inputMode = mode;
    if (this.instructions) this.instructions.setText(this.instructionCopy());
    this.applyFocusStroke();
  }

  confirmFocused(): boolean {
    if (!this.acceptsNavigation) {
      return false;
    }
    return this.submit(this.currentOfferId!, this.focusIndex);
  }

  clear(): void {
    this.enabled = false;
    this.currentOfferId = undefined;
    this.select = undefined;
    this.offer = undefined;
    this.focusIndex = 0;
    this.hoveredIndex = -1;
    this.instructions = undefined;
    this.destroyDisplay();
  }

  private destroyDisplay(): void {
    // Teardown uncommits the display: until the next successful publication,
    // number shortcuts and logical seams are refused (F1).
    this.committedDisplay = false;
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
    if (this.destroyed || !this.enabled || this.currentOfferId === undefined || !this.committedDisplay) {
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

  private submit(offerId: number, choiceIndex: number): boolean {
    if (!this.enabled || this.currentOfferId !== offerId || !this.select) {
      return false;
    }
    return this.select(offerId, choiceIndex);
  }

  private instructionCopy(): string {
    switch (this.readInputMode()) {
      case 'keyboard': return 'Arrows • Enter/Space choose';
      case 'gamepad': return 'D-pad/stick • Bottom face choose';
      default: return 'Tap a card';
    }
  }
}
