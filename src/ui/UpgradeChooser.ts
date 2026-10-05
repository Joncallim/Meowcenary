import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { UpgradeSystem } from '../systems/UpgradeSystem';
import type { VisualArtLookup } from '../systems/visualArt';
import { FocusStroke, ThemeColor, ThemeDepth, ThemeFont, themeColorCss } from './theme';
import { createUiText } from './text';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserView,
} from './upgradeChooserController';
import { computeUpgradeChooserLayout } from './upgradeChooserLayout';
import type { InputMode } from '../systems/input';
import { physicalToLogical, responsiveGameUiViewport, responsiveUiViewport, type UiViewport } from './layout';
import { ZERO_SAFE_AREA } from '../platform/safeArea';
import { resolveUpgradeCardPresentation } from './upgradeCardPresentation';
import { isPortraitOrientationBlocked } from '../platform/orientation';

const CHOOSER_DEPTH = ThemeDepth.upgradeChooser;
const RARITY_EDGE_ALPHA = 0.95;
const RARITY_CARD_BACKGROUND = {
  common: ThemeColor.card, uncommon: ThemeColor.card, rare: ThemeColor.card,
  epic: ThemeColor.card, legendary: ThemeColor.card,
} as const;

/** Measure the actual Phaser glyphs, then reduce/truncate only as far as the
 * real canvas needs. This avoids the unsafe average-character-width guess. */
function containText(
  text: Phaser.GameObjects.Text,
  value: string,
  width: number,
  fontSize: number,
  minimumFontSize: number,
): void {
  const compact = value.replace(/\s+/g, ' ').trim();
  let size = fontSize;
  text.setText(compact).setFontSize(`${size}px`);
  while (text.width > width && size - 0.25 >= minimumFontSize) {
    size -= 0.25;
    text.setFontSize(`${size}px`);
  }
  if (text.width <= width) return;
  let clipped = compact;
  while (clipped.length > 1 && text.width > width) {
    clipped = clipped.slice(0, -1).trimEnd();
    text.setText(`${clipped}…`);
  }
}

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
    viewport?: UiViewport,
  ) {
    this.bus = bus;
    this.view = new PhaserUpgradeChooserView(scene, readReducedMotion, visualArt, readInputMode, viewport);
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
    readonly fillColor: number;
    readonly interactive: boolean;
    readonly focused: boolean;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
  readonly icons: readonly { readonly index: number; readonly artId: string; readonly textureKey: string; readonly frameKey?: string | number; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  readonly text: readonly {
    readonly role: string;
    readonly text: string;
    readonly visible: boolean;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly scaleX: number;
    readonly fontSize: number;
    readonly naturalHeight: number;
    readonly clipped: boolean;
  }[];
}

interface RenderedChooserText { role: string; object: Phaser.GameObjects.Text; naturalHeight?: number; clipped?: boolean }

export class PhaserUpgradeChooserView implements UpgradeChooserView {
  private root?: Phaser.GameObjects.Container;
  private cardBackgrounds: Phaser.GameObjects.Rectangle[] = [];
  private cardBaseColors: number[] = [];
  private cardEdges: Phaser.GameObjects.Rectangle[] = [];
  private renderedText: RenderedChooserText[] = [];
  private renderedIcons: UpgradeChooserRenderDiagnostics['icons'] = [];
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
  private readonly armedPointerIds = new Map<number, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly readReducedMotion: () => boolean = () => false,
    private readonly visualArt?: VisualArtLookup,
    private readonly readInputMode: () => InputMode = () => 'pointer',
    private viewport?: UiViewport,
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
        fillColor: card.fillColor,
        interactive: card.input?.enabled ?? false,
        focused: index === this.focusIndex,
        x: card.getBounds().x,
        y: card.getBounds().y,
        width: card.getBounds().width,
        height: card.getBounds().height,
      })),
      icons: this.renderedIcons,
      text: this.renderedText.map(({ role, object, naturalHeight, clipped }) => {
        const bounds = object.getBounds();
        return {
          role,
          text: object.text,
          visible: object.visible,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          scaleX: object.scaleX,
          fontSize: Number.parseFloat(String(object.style.fontSize)),
          naturalHeight: naturalHeight ?? bounds.height,
          clipped: clipped ?? false,
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
    this.inputMode = this.readInputMode();
    this.lastInputMode = this.inputMode;
    // Hover belongs to the previous tree's display objects and is never
    // preserved across a rebuild (§3 committed-render transaction).
    this.hoveredIndex = -1;
    // The display is uncommitted from the moment teardown begins until the
    // successful publication below (F1 committed-display gate).
    this.committedDisplay = false;

    const width = this.viewport?.canvasWidth ?? this.scene.scale.width;
    const height = this.viewport?.canvasHeight ?? this.scene.scale.height;
    const displayWidth = this.viewport?.displayWidth ?? this.scene.scale.displaySize.width;
    const displayHeight = this.viewport?.displayHeight ?? this.scene.scale.displaySize.height;
    const layout = computeUpgradeChooserLayout(
      width,
      height,
      displayWidth,
      displayHeight,
      offer.choices.length,
      this.viewport?.layoutInsets ?? ZERO_SAFE_AREA,
    );
    const root = this.scene.add.container(this.viewport?.originX ?? 0, this.viewport?.originY ?? 0);
    const cardBackgrounds: Phaser.GameObjects.Rectangle[] = [];
    const cardBaseColors: number[] = [];
    const cardEdges: Phaser.GameObjects.Rectangle[] = [];
    const renderedText: RenderedChooserText[] = [];
    const renderedIcons: UpgradeChooserRenderDiagnostics['icons'][number][] = [];
    const own = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      root.add(object);
      return object;
    };

    try {
      root.setDepth(CHOOSER_DEPTH).setScrollFactor(0);

      const backdrop = own(this.scene.add.rectangle(
        layout.contentCenterX,
        height / 2,
        width - 20,
        height - 20,
        ThemeColor.surface,
        0.96,
      ));
      backdrop.setInteractive().setScrollFactor(0);
      const heading = own(createUiText(this.scene,
        layout.contentCenterX,
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
        .setOrigin(0.5, 0);
      containText(heading, 'Choose an upgrade', layout.headerWidth, layout.fonts.heading, 12 / layout.displayScale);
      const instructions = own(createUiText(this.scene,
        layout.contentCenterX,
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
        .setOrigin(0.5, 0);
      containText(instructions, this.instructionCopy(), layout.headerWidth, layout.fonts.instructions, 9 / layout.displayScale);
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
        const card = own(this.scene.add.rectangle(
          cardLayout.x,
          cardLayout.y,
          cardLayout.width,
          cardLayout.height,
          RARITY_CARD_BACKGROUND[choice.rarity],
          1,
        ));
        card
          .setScrollFactor(0)
          .setInteractive({ useHandCursor: true });
        const edge = own(this.scene.add.rectangle(
          cardLayout.x,
          cardLayout.y,
          cardLayout.width,
          cardLayout.height,
          ThemeColor.surface,
          0,
        ));
        edge
          .setStrokeStyle(
            0,
            ThemeColor.rarity[choice.rarity],
            0,
          )
          .setScrollFactor(0);
        own(this.scene.add.rectangle(
          cardLeft + (this.viewport ? physicalToLogical(2, this.viewport) : 2),
          cardLayout.y,
          this.viewport ? physicalToLogical(4, this.viewport) : 4,
          cardLayout.height - (this.viewport ? physicalToLogical(8, this.viewport) : 8),
          ThemeColor.rarity[choice.rarity],
          RARITY_EDGE_ALPHA,
        )).setScrollFactor(0);
        cardEdges.push(edge);
        const liveCard = () => !this.destroyed && this.committedDisplay
          && this.currentOfferId === offer.offerId && this.cardBackgrounds[index] === card;
        card.on(Phaser.Input.Events.POINTER_OVER, () => {
          if (liveCard() && this.enabled) {
            this.hoveredIndex = index;
            this.focusIndex = index;
            this.applyFocusStroke();
            card.setFillStyle(ThemeColor.cardHover, 1);
          }
        });
        card.on(Phaser.Input.Events.POINTER_OUT, () => {
          if (!liveCard()) return;
          this.armedPointerIds.forEach((cardIndex, pointerId) => { if (cardIndex === index) this.armedPointerIds.delete(pointerId); });
          if (this.hoveredIndex === index) this.hoveredIndex = -1;
          this.applyFocusStroke();
          card.setFillStyle(RARITY_CARD_BACKGROUND[choice.rarity], this.enabled ? 1 : 0.58);
        });
        card.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
          if (liveCard() && this.acceptsNavigation) {
            // Touch has no hover phase. The pressed card becomes the logical
            // focus target at the same boundary that captures pointer identity,
            // so pointer, keyboard and controller submit the same card command.
            this.hoveredIndex = index;
            this.focusIndex = index;
            this.applyFocusStroke();
            this.armedPointerIds.set(pointer.id, index);
            card.setFillStyle(0x2c6263, 1);
          }
        });
        card.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
          if (!liveCard() || this.armedPointerIds.get(pointer?.id) !== index) return;
          this.armedPointerIds.delete(pointer.id);
          if (!this.acceptsNavigation || this.currentOfferId !== offer.offerId || this.focusIndex !== index) return;
          this.submit(offer.offerId, index);
        });

        const iconBinding = this.visualArt?.bindingById(choice.iconArtId);
        const showIcon = iconBinding?.kind === 'upgrade-icon' && cardLayout.iconSize > 0
          && this.scene.textures.exists(iconBinding.textureKey)
          && this.scene.textures.get(iconBinding.textureKey).has(iconBinding.frameKey ?? '__BASE');
        if (showIcon) {
          const aspect = iconBinding.display.width / iconBinding.display.height;
          const size = aspect >= 1 ? cardLayout.iconSize : cardLayout.iconSize * aspect;
          const iconHeight = aspect >= 1 ? cardLayout.iconSize / aspect : cardLayout.iconSize;
          const icon = own(this.scene.add.image(cardLayout.iconX + size / 2,
            cardLayout.iconY + iconHeight / 2, iconBinding.textureKey, iconBinding.frameKey));
          icon.setDisplaySize(size, iconHeight).setScrollFactor(0);
          renderedIcons.push({ index, artId: choice.iconArtId, textureKey: iconBinding.textureKey,
            frameKey: iconBinding.frameKey, x: cardLayout.iconX, y: cardLayout.iconY, width: size, height: iconHeight });
        } else {
          // Missing texture OR frame stays playable and never borrows unrelated art.
          const number = own(createUiText(this.scene, cardLayout.iconX + cardLayout.iconSize / 2,
            cardLayout.iconY, `${index + 1}`, { color: '#a5f3fc', fontFamily: ThemeFont.family,
              fontSize: `${Math.min(layout.fonts.heading * 1.8, cardLayout.iconSize)}px`, fontStyle: 'bold' }));
          number.setOrigin(0.5, 0);
          if (number.height > cardLayout.iconSize || number.width > cardLayout.iconSize) {
            number.setFixedSize(cardLayout.iconSize, cardLayout.iconSize);
          }
          renderedText.push({ role: `number:${index}`, object: number });
        }

        const presentation = resolveUpgradeCardPresentation(choice);
        const wrapped = (role: string, value: string, x: number, y: number, regionWidth: number,
          regionHeight: number, fontSize: number, color: string, bold = false): void => {
          if (regionWidth <= 0 || regionHeight <= 0) return;
          const text = own(createUiText(this.scene, x, y, value, { color, fontFamily: ThemeFont.family,
            fontSize: `${fontSize}px`, fontStyle: bold ? 'bold' : 'normal', lineSpacing: layout.lineSpacing }));
          text.setOrigin(0, 0).setScrollFactor(0).setWordWrapWidth(regionWidth, true);
          const naturalHeight = text.height;
          const clipped = text.height > regionHeight + 0.01 || text.width > regionWidth + 0.01;
          // Collapsed/hostile geometry remains bounded. Supported production
          // catalog offers are asserted NOT clipped in real font/browser tests.
          // Text owns a resolution-scaled backing canvas. Fixed size bounds it;
          // Phaser's sprite crop path would incorrectly scale those glyphs again.
          text.setFixedSize(regionWidth, regionHeight);
          renderedText.push({ role, object: text, naturalHeight, clipped });
        };
        wrapped(`name:${index}`, choice.name, cardLeft + cardLayout.nameX, cardLayout.nameY,
          cardLayout.nameWidth, cardLayout.nameHeight, layout.fonts.name, '#ffffff', true);
        wrapped(`description:${index}`, presentation.effect, cardLayout.descriptionX, cardLayout.descriptionY,
          cardLayout.descriptionWidth, cardLayout.descriptionHeight, layout.fonts.description, '#d6f7ff');
        wrapped(`status:${index}`, presentation.status, cardLayout.statusX, cardLayout.statusY,
          cardLayout.statusWidth, cardLayout.statusHeight, layout.fonts.status, '#a5f3fc');
        wrapped(`rarity:${index}`, choice.rarity.toUpperCase(), cardLayout.rarityX, cardLayout.rarityY,
          cardLayout.rarityReserve, cardLayout.rarityHeight, layout.fonts.rarity,
          themeColorCss(ThemeColor.rarity[choice.rarity]));

        cardBackgrounds.push(card);
        cardBaseColors.push(RARITY_CARD_BACKGROUND[choice.rarity]);
      });

      this.cardBackgrounds = cardBackgrounds;
      this.cardBaseColors = cardBaseColors;
      this.cardEdges = cardEdges;
      this.renderedText = renderedText;
      this.renderedIcons = renderedIcons;
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
      this.cardBaseColors = [];
      this.cardEdges = [];
      this.renderedText = [];
      this.renderedIcons = [];
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
    if (!enabled) this.armedPointerIds.clear();
    this.applyEnabledState();
  }

  private applyEnabledState(): void {
    this.cardBackgrounds.forEach((card, index) => {
      card.setFillStyle(this.cardBaseColors[index] ?? ThemeColor.card, this.enabled ? 1 : 0.58);
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
    this.cardEdges.forEach((edge, index) => {
      const focused = this.inputMode === 'pointer'
        ? index === this.hoveredIndex
        : index === this.focusIndex;
      const rarity = this.offer?.choices[index]?.rarity;
      if (!rarity) return;
      edge.setStrokeStyle(
        focused ? FocusStroke.width : 0,
        focused ? FocusStroke.color : ThemeColor.rarity[rarity],
        focused ? FocusStroke.alpha : 0,
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
    this.armedPointerIds.clear();
    this.cardBackgrounds = [];
    this.cardBaseColors = [];
    this.cardEdges = [];
    this.renderedText = [];
    this.renderedIcons = [];
    // The instructions Text lives in the destroyed root; clear the ref so a
    // failed rebuild (before buildDisplay's try) can't setText() on it
    // (round-6 adversarial finding).
    this.instructions = undefined;
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
    if (isPortraitOrientationBlocked() || this.destroyed || !this.enabled || this.currentOfferId === undefined || !this.committedDisplay) {
      return;
    }

    const choiceIndex = choiceIndexForNumberKey(event.key, event.repeat);
    if (choiceIndex !== undefined) {
      this.submit(this.currentOfferId, choiceIndex);
    }
  };

  private readonly handleScaleChange = (): void => {
    if (this.destroyed) {
      return;
    }

    if (this.viewport?.originX !== undefined) {
      this.viewport = responsiveGameUiViewport(this.scene.scale.width, this.scene.scale.height);
    } else {
      this.viewport = responsiveUiViewport(this.scene.scale.width, this.scene.scale.height);
    }
    // A resize can happen before the first offer. Keep the cached viewport
    // current so that later presentation is born into the new layout rather
    // than the constructor-time dimensions.
    if (!this.offer) {
      return;
    }
    this.destroyDisplay();
    this.buildDisplay();
  };

  private submit(offerId: number, choiceIndex: number): boolean {
    if (this.destroyed || !this.enabled || !this.committedDisplay || this.currentOfferId !== offerId || !this.select) {
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
