import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import type { Rng } from '../src/engine/rng';
import { pauseRun, createRunState, startRun, type RunState } from '../src/gameplay/runState';
import { UpgradeSystem, type UpgradeOfferSnapshot } from '../src/systems/UpgradeSystem';
import { FeedbackSystem, type FeedbackRenderer } from '../src/systems/feedback';
import { UpgradeChooser } from '../src/ui/UpgradeChooser';
import type { UpgradeCardReadModel, UpgradeDefinition } from '../src/systems/types';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserSource,
  type UpgradeChooserView,
} from '../src/ui/upgradeChooserController';
import { computeUpgradeChooserLayout } from '../src/ui/upgradeChooserLayout';
import { FocusStroke } from '../src/ui/theme';
import type { InputMode } from '../src/systems/input';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_DOWN: 'pointerdown',
        POINTER_OVER: 'pointerover',
        POINTER_OUT: 'pointerout',
        POINTER_UP: 'pointerup',
      },
    },
    Scale: {
      Events: {
        RESIZE: 'resize',
        ORIENTATION_CHANGE: 'orientationchange',
      },
    },
  },
}));

const definitions: UpgradeDefinition[] = [
  {
    id: 'quick-paws',
    name: 'Quick Paws',
    rarity: 'common',
    target: 'player',
    description: 'Increase movement speed for this run.',
    maxStacks: 5,
    effects: [{ stat: 'moveSpeed', op: 'mult', value: 1.08 }],
    presentation: { category: 'mobility', iconArtId: 'upgrade-icon:quick-paws' },
  },
  {
    id: 'hot-barrel',
    name: 'Hot Barrel',
    rarity: 'uncommon',
    target: 'weapon',
    description: 'Increase weapon fire rate for this run.',
    maxStacks: 4,
    effects: [{ stat: 'attackSpeed', op: 'mult', value: 1.12 }],
    presentation: { category: 'offense', iconArtId: 'upgrade-icon:hot-barrel' },
  },
  {
    id: 'extra-scrap',
    name: 'Extra Scrap',
    rarity: 'common',
    target: 'economy',
    description: 'Increase scrap gained for this run.',
    maxStacks: 3,
    effects: [{ stat: 'currencyGain', op: 'mult', value: 1.25 }],
    presentation: { category: 'economy', iconArtId: 'upgrade-icon:extra-scrap' },
  },
];

/** Test-only conversion from raw fixture definitions to the Epic 18 (D7)
 *  read-model shape the chooser actually consumes. Real production snapshots
 *  are built by `UpgradeSystem`'s `buildReadModel`; these fixtures never
 *  exercise stack state, so `owned`/`currentStacks`/`nextStack` are fixed. */
function toChoices(defs: readonly UpgradeDefinition[]): UpgradeCardReadModel[] {
  return defs.map((definition) => ({
    id: definition.id,
    name: definition.name,
    rarity: definition.rarity,
    target: definition.target,
    description: definition.description,
    category: definition.presentation.category,
    iconArtId: definition.presentation.iconArtId,
    owned: false,
    currentStacks: 0,
    maxStacks: definition.maxStacks,
    nextStack: 1,
  }));
}

class FakeView implements UpgradeChooserView {
  readonly renders: Array<{ offerId: number; ids: string[] }> = [];
  readonly handlers: Array<{
    offerId: number;
    select: (offerId: number, choiceIndex: number) => boolean;
  }> = [];
  readonly enabled: boolean[] = [];
  clearCount = 0;
  destroyCount = 0;
  onRender?: (offer: UpgradeChooserOffer) => void;

  render(
    offer: UpgradeChooserOffer,
    select: (offerId: number, choiceIndex: number) => boolean,
  ): void {
    this.renders.push({
      offerId: offer.offerId,
      ids: offer.choices.map((choice) => choice.id),
    });
    this.handlers.push({ offerId: offer.offerId, select });
    this.onRender?.(offer);
  }

  setEnabled(enabled: boolean): void {
    this.enabled.push(enabled);
  }

  clear(): void {
    this.clearCount += 1;
  }

  destroy(): void {
    this.destroyCount += 1;
  }

  focusPrevious(): boolean {
    return false;
  }

  focusNext(): boolean {
    return false;
  }

  confirmFocused(): boolean {
    return false;
  }
}

function createHarness() {
  const bus = createEventBus();
  const view = new FakeView();
  let snapshot: UpgradeOfferSnapshot | undefined;
  const chooseCard = vi.fn<(offerId: number, upgradeId: string) => boolean>(() => true);
  const source: UpgradeChooserSource = {
    get currentOfferSnapshot() {
      return snapshot;
    },
    chooseCard,
  };
  const controller = new UpgradeChooserController(bus, source, view);

  return {
    bus,
    view,
    source,
    controller,
    chooseCard,
    setSnapshot(next: UpgradeOfferSnapshot | undefined) {
      snapshot = next;
    },
  };
}

function emitOffer(
  bus: EventBus,
  offerId: number,
  offeredDefinitions: readonly UpgradeDefinition[],
): void {
  bus.emit('card:offered', {
    offerId,
    choices: offeredDefinitions.map((definition) => definition.id),
  });
}

function createActiveRun(): RunState {
  const runState = createRunState({ seed: 7, characterId: 'cat', arenaId: 'arena' });
  startRun(runState);
  return runState;
}

function createFirstRng(): Rng {
  return {
    next: () => 0,
    int: (minInclusive) => minInclusive,
    pick: (items) => {
      const item = items[0];
      if (item === undefined) {
        throw new Error('Expected an item');
      }
      return item;
    },
    weighted: (entries) => {
      const entry = entries[0];
      if (entry === undefined) {
        throw new Error('Expected a weighted entry');
      }
      return entry.item;
    },
  };
}

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'small portrait', width: 320, height: 568 },
] as const;

const NAME_SEPARATION_VIEWPORTS = [
  ...VIEWPORTS,
  { name: 'compact landscape', width: 568, height: 320 },
  { name: 'extreme compact', width: 320, height: 240 },
] as const;

const COLLAPSED_DISPLAYS = [
  { name: 'one pixel square', width: 1, height: 1 },
  { name: 'one pixel wide', width: 1, height: 844 },
  { name: 'one pixel tall', width: 390, height: 1 },
  { name: 'exact zero', width: 0, height: 0 },
] as const;

function fittedCanvas(viewportWidth: number, viewportHeight: number) {
  const scale = Math.min(viewportWidth / 390, viewportHeight / 844);
  return { width: 390 * scale, height: 844 * scale, scale };
}

type FakeListener = { callback: (...args: unknown[]) => void; context?: unknown };

class FakeEmitter {
  private readonly listeners = new Map<string, FakeListener[]>();

  on(event: string, callback: (...args: unknown[]) => void, context?: unknown): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push({ callback, context });
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, callback: (...args: unknown[]) => void, context?: unknown): this {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter(
        (listener) => listener.callback !== callback || listener.context !== context,
      ),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    [...(this.listeners.get(event) ?? [])].forEach((listener) => {
      listener.callback.apply(listener.context, args);
    });
    return this;
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

class FakeDisplayObject extends FakeEmitter {
  visible = true;
  input?: { enabled: boolean };
  fillAlpha = 1;
  strokeWidth = 0;
  strokeColor?: number;
  strokeAlpha = 0;
  destroyed = false;
  protected originX = 0.5;
  protected originY = 0.5;

  constructor(
    public x: number,
    public y: number,
    public width: number,
    public height: number,
    private readonly onDestroy?: (object: FakeDisplayObject) => void,
  ) {
    super();
  }

  setDepth(): this { return this; }
  scrollFactorX = 1;
  scrollFactorY = 1;
  setScrollFactor(x: number, y: number = x): this {
    this.scrollFactorX = x;
    this.scrollFactorY = y;
    return this;
  }
  setStrokeStyle(width: number, color: number, alpha: number): this {
    this.strokeWidth = width;
    this.strokeColor = color;
    this.strokeAlpha = alpha;
    return this;
  }
  setOrigin(x: number, y: number): this {
    this.originX = x;
    this.originY = y;
    return this;
  }
  setInteractive(): this {
    this.input = { enabled: true };
    return this;
  }
  disableInteractive(): this {
    if (this.input) this.input.enabled = false;
    return this;
  }
  setFillStyle(_color: number, alpha = 1): this {
    this.fillAlpha = alpha;
    return this;
  }
  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }
  getBounds() {
    return {
      x: this.x - this.width * this.originX,
      y: this.y - this.height * this.originY,
      width: this.width,
      height: this.height,
    };
  }
  destroy(): void {
    // Real Phaser marks the object destroyed BEFORE teardown hooks run; the
    // destroyed-setText rejection in FakeText depends on this (round-7).
    this.destroyed = true;
    this.onDestroy?.(this);
  }
}

class FakeText extends FakeDisplayObject {
  constructor(
    x: number,
    y: number,
    public text: string,
    style: { fontSize?: string },
    onDestroy?: (object: FakeDisplayObject) => void,
    private readonly shouldFailFixedSize?: () => boolean,
  ) {
    const fontSize = Number.parseFloat(style.fontSize ?? '16');
    super(x, y, text.length * fontSize * 0.55, fontSize * 1.2, onDestroy);
    this.originX = 0;
    this.originY = 0;
  }
  setFixedSize(width: number, height: number): this {
    if (this.shouldFailFixedSize?.()) {
      throw new Error('Injected text sizing failure');
    }
    this.width = width;
    this.height = height;
    return this;
  }
  setMaxLines(): this { return this; }
  setWordWrapWidth(width: number | null): this {
    if (width !== null && width <= 0) {
      throw new Error('wordWrapWidth < a single character');
    }
    return this;
  }
  setCrop(): this { return this; }
  setText(text: string): this {
    // Real Phaser 3.90 throws on setText after destroy (nulled frame);
    // mirror so stale refs fail the suite (round-6 finding).
    if (this.destroyed) {
      throw new Error(`setText called on destroyed object (${this.text ?? ''})`);
    }
    this.text = text;
    return this;
  }
}

class FakeContainer extends FakeDisplayObject {
  private children: FakeDisplayObject[] = [];
  constructor(onDestroy?: (object: FakeDisplayObject) => void) {
    super(0, 0, 0, 0, onDestroy);
  }
  add(children: FakeDisplayObject | FakeDisplayObject[]): this {
    this.children.push(...(Array.isArray(children) ? children : [children]));
    return this;
  }
  destroy(destroyChildren?: boolean): void {
    if (destroyChildren) this.children.forEach((child) => child.destroy());
    this.children = [];
    super.destroy();
  }
}

class FakeScale extends FakeEmitter {
  readonly width = 390;
  readonly height = 844;
  displaySize = { width: 390, height: 844 };

  refresh(displayWidth: number, displayHeight: number, orientationChanged = false): void {
    this.displaySize = { width: displayWidth, height: displayHeight };
    if (orientationChanged) this.emit('orientationchange');
    this.emit('resize');
  }
}

function createFakeScene(displayWidth: number, displayHeight: number) {
  const keyboard = new FakeEmitter();
  const scale = new FakeScale();
  const children = new Set<FakeDisplayObject>();
  let failFixedSize = false;
  let failNextContainer = false;
  const own = <T extends FakeDisplayObject>(object: T): T => {
    children.add(object);
    return object;
  };
  const remove = (object: FakeDisplayObject): void => {
    children.delete(object);
  };
  scale.displaySize = { width: displayWidth, height: displayHeight };
  return {
    input: { keyboard },
    scale,
    get childCount() { return children.size; },
    get objects() { return [...children]; },
    failNextTextFixedSize() { failFixedSize = true; },
    failNextContainer() { failNextContainer = true; },
    add: {
      container: () => {
        if (failNextContainer) {
          failNextContainer = false;
          throw new Error('Injected container factory failure');
        }
        return own(new FakeContainer(remove));
      },
      rectangle: (x: number, y: number, width: number, height: number) =>
        own(new FakeDisplayObject(x, y, width, height, remove)),
      text: (x: number, y: number, text: string, style: { fontSize?: string }) =>
        own(new FakeText(x, y, text, style, remove, () => {
          if (!failFixedSize) return false;
          failFixedSize = false;
          return true;
        })),
    },
  };
}

describe('Upgrade chooser physical layout', () => {
  it.each(VIEWPORTS)('keeps readable typography at $name size', (viewport) => {
    const display = fittedCanvas(viewport.width, viewport.height);
    const layout = computeUpgradeChooserLayout(
      390,
      844,
      display.width,
      display.height,
      3,
    );

    expect(layout.displayScale).toBeCloseTo(display.scale);
    expect(layout.fonts.heading * display.scale).toBeGreaterThanOrEqual(18);
    expect(layout.fonts.instructions * display.scale).toBeGreaterThanOrEqual(11);
    expect(layout.fonts.name * display.scale).toBeGreaterThanOrEqual(14);
    expect(layout.fonts.rarity * display.scale).toBeGreaterThanOrEqual(10);
    expect(layout.fonts.description * display.scale).toBeGreaterThanOrEqual(12);
  });

  it.each(VIEWPORTS)('keeps one, two, and three cards bounded at $name size', (viewport) => {
    const display = fittedCanvas(viewport.width, viewport.height);

    for (const count of [1, 2, 3]) {
      const layout = computeUpgradeChooserLayout(
        390,
        844,
        display.width,
        display.height,
        count,
      );
      expect(layout.cards).toHaveLength(count);
      layout.cards.forEach((card, index) => {
        const left = card.x - card.width / 2;
        const right = card.x + card.width / 2;
        const top = card.y - card.height / 2;
        const bottom = card.y + card.height / 2;
        const nameRight = left + card.nameX + card.nameWidth;
        const rarityLeft = right - card.padding - card.rarityReserve;

        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(390);
        expect(top).toBeGreaterThan(layout.instructionsY + layout.fonts.instructions);
        expect(bottom).toBeLessThanOrEqual(844);
        expect(nameRight).toBeLessThanOrEqual(rarityLeft + 0.001);
        expect(card.descriptionY).toBeGreaterThan(top + card.padding);
        expect(card.descriptionY + card.descriptionHeight).toBeLessThanOrEqual(
          bottom - card.padding + 0.001,
        );
        expect(card.descriptionHeight * display.scale).toBeGreaterThanOrEqual(40);

        const previous = layout.cards[index - 1];
        if (previous) {
          expect(top).toBeGreaterThan(previous.y + previous.height / 2);
        }
      });
    }
  });

  it.each(VIEWPORTS)('keeps four and five cards bounded without a legacy clamp at $name size', (viewport) => {
    const display = fittedCanvas(viewport.width, viewport.height);

    for (const count of [4, 5]) {
      const layout = computeUpgradeChooserLayout(390, 844, display.width, display.height, count);
      expect(layout.cards).toHaveLength(count);
      layout.cards.forEach((card, index) => {
        const left = card.x - card.width / 2;
        const right = card.x + card.width / 2;
        const top = card.y - card.height / 2;
        const bottom = card.y + card.height / 2;
        const nameRight = left + card.nameX + card.nameWidth;
        const rarityLeft = right - card.padding - card.rarityReserve;

        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(390);
        expect(top).toBeGreaterThan(layout.instructionsY + layout.fonts.instructions);
        expect(bottom).toBeLessThanOrEqual(844);
        expect(nameRight).toBeLessThanOrEqual(rarityLeft + 0.001);
        expect(card.statusY).toBeGreaterThan(top + card.padding);
        expect(card.statusHeight).toBeGreaterThanOrEqual(0);
        expect(card.descriptionY).toBeGreaterThanOrEqual(card.statusY + card.statusHeight);
        // Both content rows stay inside the card's padded box when renderable.
        if (card.statusHeight > 0) {
          expect(card.statusY + card.statusHeight).toBeLessThanOrEqual(
            bottom - card.padding + 0.001,
          );
        }
        if (card.descriptionHeight > 0) {
          expect(card.descriptionY + card.descriptionHeight).toBeLessThanOrEqual(
            bottom - card.padding + 0.001,
          );
        }

        const previous = layout.cards[index - 1];
        if (previous) {
          expect(top).toBeGreaterThan(previous.y + previous.height / 2);
        }
      });
    }
  });

  it('gives the card icon its declared D8 display size at portrait phone scale', () => {
    const display = fittedCanvas(390, 844);
    for (const count of [1, 2, 3, 4, 5]) {
      const layout = computeUpgradeChooserLayout(390, 844, display.width, display.height, count);
      layout.cards.forEach((card) => {
        // visual-art.json declares 36x36 for every upgrade-icon binding, and
        // D8 specifies a 36-40px logical display; the leading column must not
        // shrink it back to the old ~21px number-badge box.
        expect(card.iconSize).toBeGreaterThanOrEqual(36);
        // The icon box fits inside the card's padded area in both axes.
        expect(card.iconSize).toBeLessThanOrEqual(card.height - card.padding * 2 + 0.001);
        expect(card.padding + card.iconSize).toBeLessThanOrEqual(card.width - card.padding + 0.001);
        // The name column starts clear of the icon.
        expect(card.nameX).toBeGreaterThanOrEqual(card.padding + card.iconSize);
        // The stack row starts below the icon, never overlapping it.
        const cardTop = card.y - card.height / 2;
        expect(card.statusY).toBeGreaterThanOrEqual(cardTop + card.padding + card.iconSize);
      });
    }
  });

  it('recomputes an active three-card offer across orientation changes', () => {
    const portraitDisplay = fittedCanvas(390, 844);
    const landscapeDisplay = fittedCanvas(844, 390);
    const portrait = computeUpgradeChooserLayout(
      390,
      844,
      portraitDisplay.width,
      portraitDisplay.height,
      3,
    );
    const landscape = computeUpgradeChooserLayout(
      390,
      844,
      landscapeDisplay.width,
      landscapeDisplay.height,
      3,
    );

    expect(portrait.cards).toHaveLength(landscape.cards.length);
    expect(landscape.displayScale).toBeLessThan(portrait.displayScale);
    expect(landscape.fonts.name).toBeGreaterThan(portrait.fonts.name);
    expect(landscape.cards[0]?.height).not.toBe(portrait.cards[0]?.height);
  });

  it.each(NAME_SEPARATION_VIEWPORTS)(
    'keeps rendered names separated from rarity at $name size',
    (viewport) => {
      const display = fittedCanvas(viewport.width, viewport.height);

      for (const count of [1, 2, 3, 4, 5]) {
        const layout = computeUpgradeChooserLayout(
          390,
          844,
          display.width,
          display.height,
          count,
        );
        layout.cards.forEach((card) => {
          const left = card.x - card.width / 2;
          const right = card.x + card.width / 2;
          const nameRight = left + card.nameX + card.nameWidth;
          const rarityLeft = right - card.padding - card.rarityReserve;

          expect(nameRight).toBeLessThanOrEqual(rarityLeft + 0.001);
        });
      }
    },
  );

  it.each(COLLAPSED_DISPLAYS)(
    'keeps all created regions safe at $name display size',
    ({ width, height }) => {
      for (const count of [1, 2, 3, 4, 5]) {
        const layout = computeUpgradeChooserLayout(390, 844, width, height, count);
        expect(layout.headerWidth).toBeGreaterThan(0);
        expect(layout.headingHeight).toBeGreaterThan(0);
        expect(layout.instructionsHeight).toBeGreaterThan(0);
        expect(Object.values(layout.fonts).every(Number.isFinite)).toBe(true);

        layout.cards.forEach((card) => {
          const left = card.x - card.width / 2;
          const right = card.x + card.width / 2;
          const numberRight = left + card.padding + card.numberWidth;
          const nameRight = left + card.nameX + card.nameWidth;
          const rarityLeft = right - card.padding - card.rarityReserve;
          const values = [
            card.x,
            card.y,
            card.width,
            card.height,
            card.padding,
            card.numberWidth,
            card.nameX,
            card.nameWidth,
            card.nameHeight,
            card.rarityReserve,
            card.rarityHeight,
            card.statusY,
            card.statusHeight,
            card.descriptionY,
            card.descriptionHeight,
          ];

          expect(values.every(Number.isFinite)).toBe(true);
          expect(card.width).toBeGreaterThan(0);
          expect(card.height).toBeGreaterThan(0);
          expect(card.numberWidth).toBeGreaterThan(0);
          expect(card.rarityReserve).toBeGreaterThan(0);
          expect(card.statusHeight).toBeGreaterThanOrEqual(0);
          expect(card.descriptionHeight).toBeGreaterThanOrEqual(0);
          // A row with height collapses to 0 is never rendered; any row that
          // *is* renderable must stay inside the card's padded box.
          const cardBottom = card.y + card.height / 2;
          if (card.statusHeight > 0) {
            expect(card.statusY + card.statusHeight).toBeLessThanOrEqual(
              cardBottom - card.padding + 0.001,
            );
          }
          if (card.descriptionHeight > 0) {
            expect(card.descriptionY + card.descriptionHeight).toBeLessThanOrEqual(
              cardBottom - card.padding + 0.001,
            );
          }
          expect(numberRight).toBeLessThanOrEqual(rarityLeft + 0.001);
          expect(nameRight).toBeLessThanOrEqual(rarityLeft + 0.001);
        });
      }
    },
  );
});

describe('PhaserUpgradeChooserView rendered bounds and lifecycle', () => {
  const hostileDefinitions: UpgradeDefinition[] = definitions.map((definition, index) => ({
    ...definition,
    name: index === 0
      ? 'UNBROKEN_SUPER_LONG_UPGRADE_NAME_猫猫猫猫猫猫猫猫猫猫'
      : `${definition.name}\nWITH AN EXTRA LINE`,
    description:
      'A hostile unbroken description_without_any_safe_break_points_猫猫猫猫猫猫\nwith several forced lines\nthat must never escape its card.',
  }));

  /** Epic 18 (D2) enables 4–5 visible cards, so containment checks need more
   *  than the three shared fixtures. Extra rows reuse the same hostile text
   *  with distinct IDs so ordering/identity assertions stay meaningful. */
  const hostileDefinitions5: UpgradeDefinition[] = Array.from({ length: 5 }, (_, index) => {
    const base = hostileDefinitions[index % hostileDefinitions.length]!;
    return { ...base, id: `${base.id}-${index}` };
  });

  async function createRenderedView(
    viewportWidth: number,
    viewportHeight: number,
    offeredDefinitions: readonly UpgradeDefinition[] = hostileDefinitions,
  ) {
    const display = fittedCanvas(viewportWidth, viewportHeight);
    const scene = createFakeScene(display.width, display.height);
    const { PhaserUpgradeChooserView } = await import('../src/ui/UpgradeChooser');
    const view = new PhaserUpgradeChooserView(scene as never);
    view.render(
      { offerId: 73, choices: toChoices(offeredDefinitions) },
      () => true,
    );
    return { display, scene, view };
  }

  async function createRenderedDisplay(
    displayWidth: number,
    displayHeight: number,
    offeredDefinitions: readonly UpgradeDefinition[],
    select = vi.fn<(offerId: number, choiceIndex: number) => boolean>(() => true),
  ) {
    const scene = createFakeScene(displayWidth, displayHeight);
    const { PhaserUpgradeChooserView } = await import('../src/ui/UpgradeChooser');
    const view = new PhaserUpgradeChooserView(scene as never);
    view.render({ offerId: 73, choices: toChoices(offeredDefinitions) }, select);
    return { scene, view, select };
  }

  it('keeps the rendered compact heading and instructions within 568x320', async () => {
    const { display, view } = await createRenderedView(568, 320);
    const diagnostics = view.diagnostics;
    const heading = diagnostics.text.find((text) => text.role === 'heading')!;
    const instructions = diagnostics.text.find((text) => text.role === 'instructions')!;

    for (const text of [heading, instructions]) {
      expect(text.x * display.scale).toBeGreaterThanOrEqual(0);
      expect((text.x + text.width) * display.scale).toBeLessThanOrEqual(
        display.width + 0.001,
      );
    }
    expect(instructions.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    expect(diagnostics.cards[0]!.y).toBeGreaterThanOrEqual(
      instructions.y + instructions.height,
    );
    view.destroy();
  });

  it.each([1, 2, 3, 4, 5])(
    'hard-bounds hostile rendered text for a %i-card offer at 320x240',
    async (count) => {
      const { view } = await createRenderedView(320, 240, hostileDefinitions5.slice(0, count));
      const diagnostics = view.diagnostics;

      expect(diagnostics.cards).toHaveLength(count);
      diagnostics.cards.forEach((card, index) => {
        const cardText = diagnostics.text.filter((text) => text.role.endsWith(`:${index}`));
        const number = cardText.find((text) => text.role === `number:${index}`)!;
        expect(number.visible).toBe(true);
        expect(number.width).toBeGreaterThan(0);
        cardText.filter((text) => text.visible).forEach((text) => {
          expect(text.x).toBeGreaterThanOrEqual(card.x - 0.001);
          expect(text.y).toBeGreaterThanOrEqual(card.y - 0.001);
          expect(text.x + text.width).toBeLessThanOrEqual(card.x + card.width + 0.001);
          expect(text.y + text.height).toBeLessThanOrEqual(card.y + card.height + 0.001);
        });
      });
      view.destroy();
    },
  );

  it('preserves disabled fill and input state through an orientation refresh', async () => {
    const { scene, view } = await createRenderedView(390, 844);
    view.setEnabled(false);
    const before = view.diagnostics;
    const landscape = fittedCanvas(844, 390);
    scene.scale.refresh(landscape.width, landscape.height, true);
    const after = view.diagnostics;

    expect(before.cards.every((card) => card.fillAlpha === 0.58 && !card.interactive)).toBe(true);
    expect(after.cards.every((card) => card.fillAlpha === 0.58 && !card.interactive)).toBe(true);
    expect(after.offerId).toBe(73);
    expect(after.rebuildCount).toBe(before.rebuildCount + 1);
    view.destroy();
  });

  it('rebuilds once per refresh and cleans exact keyboard and scale listeners', async () => {
    const { scene, view } = await createRenderedView(390, 844);
    expect(view.diagnostics.keyboardListenerCount).toBe(1);
    expect(view.diagnostics.resizeListenerCount).toBe(1);

    for (let index = 0; index < 4; index += 1) {
      const before = view.diagnostics.rebuildCount;
      const next = index % 2 === 0 ? fittedCanvas(844, 390) : fittedCanvas(390, 844);
      scene.scale.refresh(next.width, next.height, true);
      expect(view.diagnostics.rebuildCount).toBe(before + 1);
      expect(view.diagnostics.keyboardListenerCount).toBe(1);
      expect(view.diagnostics.resizeListenerCount).toBe(1);
    }

    view.destroy();
    expect(scene.input.keyboard.listenerCount('keydown')).toBe(0);
    expect(scene.scale.listenerCount('resize')).toBe(0);
  });

  it('stays finite at zero displayed size and recovers on resize', async () => {
    const scene = createFakeScene(0, 0);
    const { PhaserUpgradeChooserView } = await import('../src/ui/UpgradeChooser');
    const view = new PhaserUpgradeChooserView(scene as never);
    view.render({ offerId: 9, choices: toChoices(definitions.slice(0, 1)) }, () => true);

    expect(view.diagnostics.text.every((text) =>
      [text.x, text.y, text.width, text.height].every(Number.isFinite),
    )).toBe(true);
    const recovered = fittedCanvas(320, 568);
    scene.scale.refresh(recovered.width, recovered.height, true);
    expect(view.diagnostics.displayWidth).toBeGreaterThan(0);
    expect(view.diagnostics.cards.every((card) =>
      [card.x, card.y, card.width, card.height].every(Number.isFinite),
    )).toBe(true);
    view.destroy();
  });

  it.each([1, 2, 3, 4, 5])(
    'preserves a %i-card offer through repeated tiny-display collapse and recovery',
    async (count) => {
      const offered = hostileDefinitions5.slice(0, count);
      const { scene, view, select } = await createRenderedDisplay(390, 844, offered);
      const enabled = count !== 2;
      if (!enabled) view.setEnabled(false);
      const baselineChildren = scene.childCount;
      const expectedIds = offered.map((definition) => definition.id);

      for (let cycle = 0; cycle < 2; cycle += 1) {
        for (const display of COLLAPSED_DISPLAYS) {
          expect(() => scene.scale.refresh(display.width, display.height, true)).not.toThrow();
          const collapsed = view.diagnostics;
          expect(collapsed.offerId).toBe(73);
          expect(collapsed.choiceIds).toEqual(expectedIds);
          expect(collapsed.keyboardListenerCount).toBe(1);
          expect(collapsed.resizeListenerCount).toBe(1);
          expect(collapsed.cards).toHaveLength(count);
          expect(collapsed.cards.every((card) =>
            [card.x, card.y, card.width, card.height].every(Number.isFinite) &&
            card.width > 0 && card.height > 0,
          )).toBe(true);
          expect(collapsed.text.every((text) =>
            [text.x, text.y, text.width, text.height].every(Number.isFinite) &&
            text.width > 0 && text.height > 0,
          )).toBe(true);
          expect(collapsed.cards.every((card) =>
            enabled
              ? card.fillAlpha === 1 && card.interactive
              : card.fillAlpha === 0.58 && !card.interactive,
          )).toBe(true);
          expect(scene.childCount).toBeLessThanOrEqual(baselineChildren);
        }

        expect(() => scene.scale.refresh(390, 844, true)).not.toThrow();
        expect(view.diagnostics.offerId).toBe(73);
        expect(view.diagnostics.choiceIds).toEqual(expectedIds);
        expect(scene.childCount).toBe(baselineChildren);
      }

      scene.input.keyboard.emit('keydown', { key: '1', repeat: false });
      expect(select).toHaveBeenCalledTimes(enabled ? 1 : 0);
      if (enabled) expect(select).toHaveBeenCalledWith(73, 0);
      view.destroy();
      expect(scene.childCount).toBe(0);
      expect(scene.input.keyboard.listenerCount('keydown')).toBe(0);
      expect(scene.scale.listenerCount('resize')).toBe(0);
    },
  );

  it('cleans partial rebuild ownership and restores the same offer', async () => {
    const offered = hostileDefinitions.slice(0, 3);
    const { scene, view, select } = await createRenderedDisplay(390, 844, offered);
    const baselineChildren = scene.childCount;
    scene.failNextTextFixedSize();

    expect(() => scene.scale.refresh(1, 1, true)).toThrow(
      'Injected text sizing failure',
    );
    expect(scene.childCount).toBe(0);
    expect(view.diagnostics.offerId).toBe(73);
    expect(view.diagnostics.choiceIds).toEqual(
      offered.map((definition) => definition.id),
    );
    expect(view.diagnostics.keyboardListenerCount).toBe(1);
    expect(view.diagnostics.resizeListenerCount).toBe(1);

    // F6: no committed root after the failed rebuild — the retained offer
    // stays non-navigable until a retry publishes a visible display.
    expect(view.focusNext()).toBe(false);
    expect(view.focusPrevious()).toBe(false);
    expect(view.confirmFocused()).toBe(false);
    // F1: number-key shortcuts must not submit an invisible choice either.
    scene.input.keyboard.emit('keydown', { key: '1', repeat: false });
    scene.input.keyboard.emit('keydown', { key: '2', repeat: false });
    expect(select).not.toHaveBeenCalled();

    expect(() => scene.scale.refresh(390, 844, true)).not.toThrow();
    expect(scene.childCount).toBe(baselineChildren);
    expect(view.diagnostics.cards).toHaveLength(3);
    expect(view.diagnostics.choiceIds).toEqual(
      offered.map((definition) => definition.id),
    );

    // G-15: after the retry publishes a committed display, the exact
    // number-key choice command works again (round-2 finding F1: the
    // destroyed/enabled/offerId guard alone let number keys submit an
    // invisible choice after a failed rebuild).
    scene.input.keyboard.emit('keydown', { key: '1', repeat: false });
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(73, 0);
    view.destroy();
    expect(scene.childCount).toBe(0);
  });

  it('does not touch destroyed instructions when a rebuild fails BEFORE buildDisplay assigns them (round-7)', async () => {
    const offered = hostileDefinitions.slice(0, 3);
    const { scene, view } = await createRenderedDisplay(390, 844, offered);
    expect(view.diagnostics.cards).toHaveLength(3);

    // A rebuild whose FIRST step (container factory, before buildDisplay's
    // try assigns instructions) fails: destroyDisplay already cleared
    // this.instructions, so a subsequent refresh must not touch a destroyed
    // Text. The container factory throws BEFORE any instructions Text exists
    // in the new tree — the pre-try failure window of the round-6 fix.
    scene.failNextContainer();
    expect(() => scene.scale.refresh(1, 1, true)).toThrow(
      'Injected container factory failure',
    );
    expect(scene.childCount).toBe(0);

    // refreshInputPresentation in any mode must not throw (instructions is
    // undefined, not a stale destroyed reference).
    for (const mode of ['keyboard', 'gamepad', 'pointer'] as const) {
      (view as unknown as { readInputMode: () => string }).readInputMode = () => mode;
      expect(() => view.refreshInputPresentation()).not.toThrow();
    }

    // G-15: a successful retry re-publishes and the exact command works.
    scene.scale.refresh(390, 844, true);
    expect(view.diagnostics.cards).toHaveLength(3);
    view.destroy();
    expect(scene.childCount).toBe(0);
  });
});

describe('PhaserUpgradeChooserView keyboard focus and reduced motion', () => {
  async function createFocusView(
    count = 3,
    readReducedMotion: () => boolean = () => false,
    readInputMode: () => InputMode = () => 'pointer',
  ) {
    const scene = createFakeScene(390, 844);
    const { PhaserUpgradeChooserView } = await import('../src/ui/UpgradeChooser');
    const view = new PhaserUpgradeChooserView(scene as never, readReducedMotion, undefined, readInputMode);
    const select = vi.fn<(offerId: number, choiceIndex: number) => boolean>(() => true);
    view.render({ offerId: 73, choices: toChoices(definitions.slice(0, count)) }, select);
    return { scene, view, select };
  }

  const focused = (view: { diagnostics: { cards: readonly { focused: boolean }[] } }) =>
    view.diagnostics.cards.map((card) => card.focused);

  /** The live interactive card rectangles, matched to the diagnostics bounds
   *  (card rects are the only interactive non-text objects at card size). */
  const cardObjects = (
    view: { diagnostics: { cards: readonly { x: number; y: number; width: number; height: number }[] } },
    scene: ReturnType<typeof createFakeScene>,
  ) =>
    view.diagnostics.cards.map((card) => {
      const object = scene.objects.find(
        (candidate) =>
          candidate.input?.enabled === true &&
          candidate.x === card.x + card.width / 2 &&
          candidate.y === card.y + card.height / 2 &&
          candidate.width === card.width &&
          candidate.height === card.height,
      );
      if (!object) throw new Error(`no live card object for diagnostics card ${card.x},${card.y}`);
      return object;
    });

  it('logical focus movement wraps across the cards', async () => {
    const { view } = await createFocusView();
    expect(focused(view)).toEqual([true, false, false]);
    view.focusNext();
    expect(focused(view)).toEqual([false, true, false]);
    view.focusNext();
    expect(focused(view)).toEqual([false, false, true]);
    view.focusNext();
    expect(focused(view)).toEqual([true, false, false]);
    view.focusPrevious();
    expect(focused(view)).toEqual([false, false, true]);
    view.destroy();
  });

  it('logical confirm activates the focused card with the captured offer token', async () => {
    const { scene, view, select } = await createFocusView();
    view.focusNext();
    expect(view.confirmFocused()).toBe(true);
    expect(select).toHaveBeenCalledWith(73, 1);
    scene.input.keyboard.emit('keydown', { key: ' ', repeat: false });
    expect(select).not.toHaveBeenCalledWith(73, 2);
    view.destroy();
  });

  it('number keys submit their own index regardless of focus', async () => {
    const { scene, view, select } = await createFocusView();
    scene.input.keyboard.emit('keydown', { key: 'ArrowDown', repeat: false });
    scene.input.keyboard.emit('keydown', { key: '1', repeat: false });
    expect(select).toHaveBeenCalledWith(73, 0);
    view.destroy();
  });

  it('repeated arrows still move focus but repeated activation keys never submit', async () => {
    const { scene, view, select } = await createFocusView();
    view.focusNext();
    expect(focused(view)).toEqual([false, true, false]);
    view.focusNext();
    expect(focused(view)).toEqual([false, false, true]);
    scene.input.keyboard.emit('keydown', { key: 'Enter', repeat: true });
    scene.input.keyboard.emit('keydown', { key: ' ', repeat: true });
    scene.input.keyboard.emit('keydown', { key: '1', repeat: true });
    scene.input.keyboard.emit('keydown', { key: '2', repeat: true });
    expect(select).not.toHaveBeenCalled();
    view.destroy();
  });

  it('setEnabled(false) blocks focus movement and activation, then re-enable restores exact navigation/confirmation', async () => {
    const { scene, view, select } = await createFocusView();
    view.setEnabled(false);
    scene.input.keyboard.emit('keydown', { key: 'ArrowDown', repeat: false });
    scene.input.keyboard.emit('keydown', { key: 'Enter', repeat: false });
    scene.input.keyboard.emit('keydown', { key: '1', repeat: false });
    expect(focused(view)).toEqual([true, false, false]);
    expect(select).not.toHaveBeenCalled();

    // G-15: the disabled state is not terminal — re-enabling restores the
    // exact next navigation/confirmation through the same seams.
    view.setEnabled(true);
    expect(view.focusNext()).toBe(true);
    expect(focused(view)).toEqual([false, true, false]);
    expect(view.confirmFocused()).toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(73, 1);
    view.destroy();
  });

  it('rereads reducedMotion on every resize rebuild', async () => {
    let reducedMotion = false;
    const { scene, view } = await createFocusView(2, () => reducedMotion);
    expect(view.diagnostics.reducedMotion).toBe(false);
    reducedMotion = true;
    scene.scale.refresh(844, 390, true);
    expect(view.diagnostics.reducedMotion).toBe(true);
    reducedMotion = false;
    scene.scale.refresh(390, 844, true);
    expect(view.diagnostics.reducedMotion).toBe(false);
    view.destroy();
  });

  it('resets focus to the first card when a new offer renders', async () => {
    const { view } = await createFocusView(3);
    view.focusNext();
    view.focusNext();
    expect(focused(view)).toEqual([false, false, true]);
    view.render({ offerId: 74, choices: toChoices(definitions.slice(0, 2)) }, () => true);
    expect(view.diagnostics.offerId).toBe(74);
    expect(focused(view)).toEqual([true, false]);
    view.destroy();
  });

  it('drives the same focus/confirm path as keyboard through the Epic 19 seam', async () => {
    const { view, select } = await createFocusView(3);
    view.focusNext();
    expect(focused(view)).toEqual([false, true, false]);
    view.focusPrevious();
    expect(focused(view)).toEqual([true, false, false]);
    // Wrapping matches the keyboard arrows exactly.
    view.focusPrevious();
    expect(focused(view)).toEqual([false, false, true]);

    expect(view.confirmFocused()).toBe(true);
    expect(select).toHaveBeenCalledWith(73, 2);
    view.destroy();
  });

  it('blocks seam focus and confirm while disabled, matching the keyboard path', async () => {
    const { view, select } = await createFocusView(3);
    view.setEnabled(false);

    // Both movement methods report refusal as false, so the facade emits no
    // ui:navigate while disabled.
    expect(view.focusNext()).toBe(false);
    expect(view.focusPrevious()).toBe(false);
    expect(focused(view)).toEqual([true, false, false]);
    expect(view.confirmFocused()).toBe(false);
    expect(select).not.toHaveBeenCalled();
    view.destroy();
  });

  it('reports seam confirm rejection when the controller declines the choice', async () => {
    const scene = createFakeScene(390, 844);
    const { PhaserUpgradeChooserView } = await import('../src/ui/UpgradeChooser');
    const view = new PhaserUpgradeChooserView(scene as never);
    const select = vi.fn<(offerId: number, choiceIndex: number) => boolean>(() => false);
    view.render({ offerId: 73, choices: toChoices(definitions.slice(0, 2)) }, select);

    expect(view.confirmFocused()).toBe(false);
    expect(select).toHaveBeenCalledWith(73, 0);
    view.destroy();
  });

  it('ignores seam calls after destroy and with no active offer', async () => {
    const { view, select } = await createFocusView(2);
    view.clear();
    view.focusNext();
    expect(view.confirmFocused()).toBe(false);

    view.destroy();
    view.focusPrevious();
    expect(view.confirmFocused()).toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it('keeps the focus index across resize rebuilds', async () => {
    const { scene, view } = await createFocusView(3);
    view.focusNext();
    view.focusNext();
    expect(focused(view)).toEqual([false, false, true]);
    scene.scale.refresh(844, 390, true);
    expect(focused(view)).toEqual([false, false, true]);
    scene.scale.refresh(390, 844, true);
    expect(focused(view)).toEqual([false, false, true]);
    view.destroy();
  });

  it('renders the exact FocusStroke width/color/alpha on the focused card and restores the exact base stroke (F4)', async () => {
    let mode: InputMode = 'pointer';
    const { scene, view } = await createFocusView(3, () => false, () => mode);
    const cards = () => cardObjects(view, scene);
    const baseStrokes = cards().map((card) => ({
      width: card.strokeWidth,
      color: card.strokeColor,
      alpha: card.strokeAlpha,
    }));
    // Pointer mode: no card carries the FocusStroke ring.
    expect(cards()[0]!.strokeColor).not.toBe(FocusStroke.color);

    mode = 'keyboard';
    view.refreshInputPresentation();
    // Focused card 0 carries ALL THREE FocusStroke theme constants; the other
    // cards keep their exact base strokes.
    expect(cards()[0]!.strokeWidth).toBe(FocusStroke.width);
    expect(cards()[0]!.strokeColor).toBe(FocusStroke.color);
    expect(cards()[0]!.strokeAlpha).toBe(FocusStroke.alpha);
    expect(cards()[1]!.strokeWidth).toBe(baseStrokes[1]!.width);
    expect(cards()[1]!.strokeColor).toBe(baseStrokes[1]!.color);
    expect(cards()[1]!.strokeAlpha).toBe(baseStrokes[1]!.alpha);

    // Focus moves: the ring carries all three constants on the new card and
    // the previous card's exact base stroke is restored.
    expect(view.focusNext()).toBe(true);
    expect(cards()[1]!.strokeWidth).toBe(FocusStroke.width);
    expect(cards()[1]!.strokeColor).toBe(FocusStroke.color);
    expect(cards()[1]!.strokeAlpha).toBe(FocusStroke.alpha);
    expect(cards()[0]!.strokeWidth).toBe(baseStrokes[0]!.width);
    expect(cards()[0]!.strokeColor).toBe(baseStrokes[0]!.color);
    expect(cards()[0]!.strokeAlpha).toBe(baseStrokes[0]!.alpha);
    view.destroy();
  });

  it('switches the exact source-aware instruction copy per input mode (F6)', async () => {
    let mode: InputMode = 'pointer';
    const { view } = await createFocusView(3, () => false, () => mode);
    const instructions = () =>
      view.diagnostics.text.find((text) => text.role === 'instructions')!.text;

    expect(instructions()).toBe('Tap a card');
    mode = 'keyboard';
    view.refreshInputPresentation();
    expect(instructions()).toBe('Arrows • Enter/Space choose');
    mode = 'gamepad';
    view.refreshInputPresentation();
    expect(instructions()).toBe('D-pad/stick • Bottom face choose');
    view.destroy();
  });

  it('pointer hover moves exactly one ring and direct selection submits without a pointer requirement (F6)', async () => {
    const { scene, view, select } = await createFocusView(3);
    const cards = () => cardObjects(view, scene);

    // Hover card 1: ring (ALL THREE constants) on card 1 only, logical focus
    // synced, no submit.
    cards()[1]!.emit('pointerover');
    expect(cards()[1]!.strokeWidth).toBe(FocusStroke.width);
    expect(cards()[1]!.strokeColor).toBe(FocusStroke.color);
    expect(cards()[1]!.strokeAlpha).toBe(FocusStroke.alpha);
    expect(cards()[0]!.strokeColor).not.toBe(FocusStroke.color);
    expect(cards()[2]!.strokeColor).not.toBe(FocusStroke.color);
    expect(select).not.toHaveBeenCalled();
    expect(focused(view)).toEqual([false, true, false]);

    // Pointer-out clears the ring without a command.
    cards()[1]!.emit('pointerout');
    expect(cards()[1]!.strokeColor).not.toBe(FocusStroke.color);
    expect(select).not.toHaveBeenCalled();

    // Direct pointer-up submits the exact hovered card index.
    cards()[1]!.emit('pointerup');
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(73, 1);
    view.destroy();
  });
});

describe('PhaserUpgradeChooserView pointer funnel (§3-G)', () => {
  /** Real production composition for the chooser surface: real
   *  UpgradeChooser (view + controller) over the real UpgradeSystem and
   *  RunState, with the real FeedbackSystem subscription for visible choice
   *  feedback. The card tap is driven through the object's own pointer
   *  handlers with an explicit pointer identity, exactly as Phaser's
   *  InputManager dispatches it. */
  function createFunnelHarness() {
    const scene = createFakeScene(390, 844);
    const bus = createEventBus();
    const runState = createActiveRun();
    const upgradeSystem = new UpgradeSystem({
      runState,
      bus,
      definitions,
      rng: createFirstRng(),
      offerCount: 3,
    });
    const renderer: FeedbackRenderer & { upgradeChosenCalls: boolean[] } = {
      upgradeChosenCalls: [],
      muzzleFlash() {}, projectileHit() {}, enemyKilled() {}, playerDamaged() {},
      levelUp() {},
      upgradeChosen(heavyMotion: boolean) { this.upgradeChosenCalls.push(heavyMotion); },
      weaponMerged() {}, enemyDashed() {}, enemyHeavyStep() {}, cancelHeavyMotion() {},
      update() {}, destroy() {},
      activeEffectCount: 0, allocatedEffectCount: 0, droppedEffectCount: 0,
    };
    const feedback = new FeedbackSystem({
      bus,
      settings: { muted: false, musicVolume: 0.5, sfxVolume: 0.5, reducedMotion: false },
      renderer,
    });
    const chooser = new UpgradeChooser(
      scene as never,
      bus,
      upgradeSystem,
      () => false,
      undefined,
      () => 'pointer',
    );
    const chosen: string[] = [];
    let confirms = 0;
    bus.on('card:chosen', (event: { upgradeId: string }) => chosen.push(event.upgradeId));
    bus.on('ui:confirm', () => { confirms += 1; });
    // Interactive objects in creation order: the backdrop first, then the
    // three cards. Only the cards carry the pointer funnel handlers.
    const cards = () =>
      scene.objects
        .filter((object) => object.input?.enabled === true && !object.destroyed)
        .slice(1);
    // Real Phaser InputManager dispatches pointerover BEFORE pointerdown on a
    // fresh touch (hit test → over → down), which syncs the chooser's logical
    // focus index; the release then commits through the armed pointer id.
    const tap = (card: FakeDisplayObject, id = 7) => {
      card.emit('pointerover');
      card.emit('pointerdown', { id });
      card.emit('pointerup', { id });
    };
    return {
      scene, bus, runState, chooser, feedback, renderer, chosen, cards, tap,
      confirms: () => confirms,
    };
  }

  it('a real down+up card tap commits exactly one card:chosen with the captured pointer identity', () => {
    const h = createFunnelHarness();
    h.bus.emit('level:up', { level: 2 });
    const cards = h.cards();
    expect(cards).toHaveLength(3);

    h.tap(cards[1]!, 7);

    expect(h.chosen).toHaveLength(1);
    expect(h.runState.upgradeStacks[h.chosen[0]!]).toBe(1);
    expect(h.confirms()).toBe(0); // ui:confirm is never the evidence
    expect(h.renderer.upgradeChosenCalls).toEqual([true]); // visible feedback
    expect(h.chooser.diagnostics.choiceIds).toEqual([]); // offer resolved
    h.chooser.destroy();
    h.feedback.destroy();
  });

  it('an unarmed up, a cross-pointer release, and a cross-card release never commit (X3)', () => {
    const h = createFunnelHarness();
    h.bus.emit('level:up', { level: 2 });
    const cards = h.cards();

    // Up with no preceding down: nothing was armed.
    cards[0]!.emit('pointerup', { id: 7 });
    expect(h.chosen).toHaveLength(0);

    // Down with one pointer, up with a different one: identity mismatch.
    cards[0]!.emit('pointerover');
    cards[0]!.emit('pointerdown', { id: 7 });
    cards[0]!.emit('pointerup', { id: 8 });
    expect(h.chosen).toHaveLength(0);

    // Down on card 0, release on card 1: only the armed card may commit.
    cards[0]!.emit('pointerover');
    cards[0]!.emit('pointerdown', { id: 7 });
    cards[1]!.emit('pointerup', { id: 7 });
    expect(h.chosen).toHaveLength(0);

    // G-15: the negatives are not terminal — a proper arm+commit still works.
    h.tap(cards[0]!);
    expect(h.chosen).toHaveLength(1);
    h.chooser.destroy();
    h.feedback.destroy();
  });

  it('a pointer-out disarms so a drag release cannot command the card', () => {
    const h = createFunnelHarness();
    h.bus.emit('level:up', { level: 2 });
    const cards = h.cards();

    cards[0]!.emit('pointerover');
    cards[0]!.emit('pointerdown', { id: 7 });
    cards[0]!.emit('pointerout'); // leaves the card: arm cleared
    cards[0]!.emit('pointerup', { id: 7 });
    expect(h.chosen).toHaveLength(0);

    // A later proper tap on another card still commits.
    h.tap(cards[1]!, 9);
    expect(h.chosen).toHaveLength(1);
    h.chooser.destroy();
    h.feedback.destroy();
  });

  it('a committed-failure blocks taps and a successful retry restores the exact tap (G-15)', () => {
    const h = createFunnelHarness();
    h.bus.emit('level:up', { level: 2 });
    expect(h.cards()).toHaveLength(3);

    // Fail the next text sizing: the resize rebuild throws, the display is
    // uncommitted, and the retained offer has no live cards to tap.
    h.scene.failNextTextFixedSize();
    expect(() => h.scene.scale.refresh(844, 390, true)).toThrow('Injected text sizing failure');
    expect(h.cards()).toHaveLength(0);
    expect(h.chooser.diagnostics.offerId).toBeTypeOf('number');
    expect(h.chooser.diagnostics.choiceIds).toHaveLength(3); // retained offer

    // G-15: a successful rebuild publishes a committed display again.
    expect(() => h.scene.scale.refresh(390, 844, true)).not.toThrow();
    const cards = h.cards();
    expect(cards).toHaveLength(3);
    h.tap(cards[2]!);
    expect(h.chosen).toHaveLength(1);
    expect(h.runState.upgradeStacks[h.chosen[0]!]).toBe(1);
    h.chooser.destroy();
    h.feedback.destroy();
  });

  it('a stale release cannot refire the resolved choice and a new offer needs a fresh tap (captured token)', () => {
    const h = createFunnelHarness();
    h.bus.emit('level:up', { level: 2 });
    const first = h.cards();
    h.tap(first[0]!, 7);
    expect(h.chosen).toHaveLength(1);

    // The resolved tree is destroyed; stale ups on the old handles cannot
    // refire (the arm is consumed and the offer token is cleared).
    first[0]!.emit('pointerup', { id: 7 });
    first[1]!.emit('pointerup', { id: 7 });
    expect(h.chosen).toHaveLength(1);

    // G-15: a later offer remains selectable with a fresh arm+commit.
    h.bus.emit('level:up', { level: 3 });
    const second = h.cards();
    expect(second).toHaveLength(3);
    h.tap(second[2]!, 11);
    expect(h.chosen).toHaveLength(2);
    expect(h.chosen[1]).not.toBe(h.chosen[0]);
    expect(h.runState.upgradeStacks[h.chosen[1]!]).toBe(1);
    h.chooser.destroy();
    h.feedback.destroy();
  });

  it('every interactive chooser card declares its own scrollFactor 0 (M-08)', () => {
    const h = createFunnelHarness();
    h.bus.emit('level:up', { level: 2 });
    const cards = h.cards();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.scrollFactorX).toBe(0);
      expect(card.scrollFactorY).toBe(0);
    }
    h.chooser.destroy();
    h.feedback.destroy();
  });
});

describe('UpgradeChooserController rendering', () => {
  it.each([1, 2, 3])('renders an ordered offer containing %i choice(s)', (count) => {
    const harness = createHarness();
    const offered = definitions.slice(0, count);
    harness.setSnapshot({ offerId: 11, choices: toChoices(offered) });

    emitOffer(harness.bus, 11, offered);

    expect(harness.view.renders).toEqual([
      { offerId: 11, ids: offered.map((definition) => definition.id) },
    ]);
    expect(harness.controller.choiceCount).toBe(count);
  });

  it('uses event order rather than snapshot storage order', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 4, choices: toChoices(definitions) });
    const ordered = [definitions[2]!, definitions[0]!, definitions[1]!];

    emitOffer(harness.bus, 4, ordered);

    expect(harness.view.renders[0]?.ids).toEqual(['extra-scrap', 'quick-paws', 'hot-barrel']);
  });

  it('does not render a mismatched or already-resolved snapshot', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 2, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    harness.setSnapshot(undefined);
    emitOffer(harness.bus, 2, [definitions[0]!]);

    expect(harness.view.renders).toEqual([]);
    expect(harness.controller.currentOfferId).toBeUndefined();
  });

  it('replaces prior UI and makes its captured handler stale', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    const stale = harness.view.handlers[0]!;
    harness.setSnapshot({ offerId: 2, choices: toChoices([definitions[1]!]) });
    emitOffer(harness.bus, 2, [definitions[1]!]);

    expect(harness.view.renders.map((render) => render.offerId)).toEqual([1, 2]);
    expect(stale.select(stale.offerId, 0)).toBe(false);
    expect(harness.chooseCard).not.toHaveBeenCalled();
  });
});

describe('UpgradeChooserController selection', () => {
  it('submits the captured offer token and pointer-selected upgrade ID', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 8, choices: toChoices(definitions.slice(0, 2)) });
    emitOffer(harness.bus, 8, definitions.slice(0, 2));

    expect(harness.view.handlers[0]?.select(8, 1)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(8, 'hot-barrel');
  });

  it('maps keyboard 1..5 and ignores other or repeated keys', () => {
    expect(['1', '2', '3', '4', '5'].map((key) => choiceIndexForNumberKey(key))).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(choiceIndexForNumberKey('0')).toBeUndefined();
    expect(choiceIndexForNumberKey('6')).toBeUndefined();
    expect(choiceIndexForNumberKey('1', true)).toBeUndefined();
  });

  it.each(['1', '2', '3'])('submits keyboard %s against its visible choice', (key) => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 9, choices: toChoices(definitions) });
    emitOffer(harness.bus, 9, definitions);
    const choiceIndex = choiceIndexForNumberKey(key);

    expect(choiceIndex).toBeDefined();
    expect(harness.view.handlers[0]?.select(9, choiceIndex!)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(9, definitions[choiceIndex!]!.id);
  });

  it('ignores out-of-range visible indices', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 3, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 3, [definitions[0]!]);

    expect(harness.controller.select(3, 1)).toBe(false);
    expect(harness.chooseCard).not.toHaveBeenCalled();
  });

  it('disables immediately after acceptance and rejects duplicate submission', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 5, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 5, [definitions[0]!]);

    expect(harness.controller.select(5, 0)).toBe(true);
    expect(harness.controller.select(5, 0)).toBe(false);
    expect(harness.view.enabled).toEqual([false]);
    expect(harness.chooseCard).toHaveBeenCalledTimes(1);
  });

  it('keeps a rejected command active and usable', () => {
    const harness = createHarness();
    harness.chooseCard.mockReturnValueOnce(false).mockReturnValueOnce(true);
    harness.setSnapshot({ offerId: 6, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 6, [definitions[0]!]);

    expect(harness.controller.select(6, 0)).toBe(false);
    expect(harness.controller.currentOfferId).toBe(6);
    expect(harness.view.enabled).toEqual([false, true]);
    expect(harness.controller.select(6, 0)).toBe(true);
  });

  it('requires a new token for consecutive offers with the same upgrade ID', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 20, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 20, [definitions[0]!]);
    const oldHandler = harness.view.handlers[0]!;
    harness.bus.emit('card:chosen', { upgradeId: 'quick-paws' });
    harness.setSnapshot({ offerId: 21, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 21, [definitions[0]!]);

    expect(oldHandler.select(20, 0)).toBe(false);
    expect(harness.view.handlers[1]?.select(21, 0)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(21, 'quick-paws');
  });
});

describe('UpgradeChooserController reentrancy and lifecycle', () => {
  it('clears UI when another offered listener resolves synchronously', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, choices: toChoices([definitions[0]!]) });
    harness.bus.on('card:offered', () => {
      harness.setSnapshot(undefined);
      harness.bus.emit('card:chosen', { upgradeId: 'quick-paws' });
    });

    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.view.renders).toHaveLength(1);
    expect(harness.controller.currentOfferId).toBeUndefined();
  });

  it('keeps the next offer rendered when chosen delivery advances synchronously', () => {
    const harness = createHarness();
    harness.chooseCard.mockImplementation(() => {
      harness.setSnapshot(undefined);
      harness.bus.emit('card:chosen', { upgradeId: 'quick-paws' });
      harness.setSnapshot({ offerId: 2, choices: toChoices([definitions[0]!]) });
      emitOffer(harness.bus, 2, [definitions[0]!]);
      return true;
    });
    harness.setSnapshot({ offerId: 1, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.controller.select(1, 0)).toBe(true);
    expect(harness.controller.currentOfferId).toBe(2);
    expect(harness.view.renders.map((render) => render.offerId)).toEqual([1, 2]);
  });

  it('is safe when destroyed during offered delivery and ignores late events', () => {
    const harness = createHarness();
    harness.view.onRender = () => harness.controller.destroy();
    harness.setSnapshot({ offerId: 1, choices: toChoices([definitions[0]!]) });

    emitOffer(harness.bus, 1, [definitions[0]!]);
    emitOffer(harness.bus, 2, [definitions[1]!]);

    expect(harness.view.renders).toHaveLength(1);
    expect(harness.view.destroyCount).toBe(1);
    expect(harness.controller.select(1, 0)).toBe(false);
  });

  it('destroys idempotently and leaves no presentation listeners', () => {
    const harness = createHarness();
    harness.controller.destroy();
    harness.controller.destroy();
    harness.setSnapshot({ offerId: 1, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.view.destroyCount).toBe(1);
    expect(harness.view.renders).toEqual([]);
  });

  it('restarts with one fresh listener set and rejects the old visual handler', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, choices: toChoices([definitions[0]!]) });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    const oldHandler = harness.view.handlers[0]!;
    harness.controller.destroy();

    const freshView = new FakeView();
    const freshController = new UpgradeChooserController(harness.bus, harness.source, freshView);
    harness.setSnapshot({ offerId: 2, choices: toChoices([definitions[1]!]) });
    emitOffer(harness.bus, 2, [definitions[1]!]);

    expect(harness.view.renders).toHaveLength(1);
    expect(freshView.renders).toEqual([{ offerId: 2, ids: ['hot-barrel'] }]);
    expect(oldHandler.select(1, 0)).toBe(false);
    expect(freshView.handlers[0]?.select(2, 0)).toBe(true);
    freshController.destroy();
  });
});

describe('Upgrade chooser integration with UpgradeSystem', () => {
  it('applies one visible choice per pending level and resumes only after the final choice', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const system = new UpgradeSystem({
      runState,
      bus,
      definitions: [definitions[0]!],
      rng: createFirstRng(),
      offerCount: 1,
    });
    const view = new FakeView();
    const chooser = new UpgradeChooserController(bus, system, view);

    bus.emit('level:up', { level: 2 });
    bus.emit('level:up', { level: 3 });
    expect(runState.status).toBe('paused');
    expect(view.handlers[0]?.select(view.handlers[0]!.offerId, 0)).toBe(true);
    expect(runState.status).toBe('paused');
    expect(view.renders.map((render) => render.offerId)).toEqual([1, 2]);
    expect(view.handlers[1]?.select(view.handlers[1]!.offerId, 0)).toBe(true);

    expect(runState.upgradeStacks['quick-paws']).toBe(2);
    expect(runState.stats.resolve('moveSpeed', 100)).toBeCloseTo(116.64);
    expect(runState.status).toBe('active');
    expect(system.pendingCount).toBe(0);
    chooser.destroy();
    system.destroy();
  });

  it('leaves a manual pause in place after a visible choice', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    pauseRun(runState, bus, 'manual');
    const system = new UpgradeSystem({
      runState,
      bus,
      definitions: [definitions[0]!],
      rng: createFirstRng(),
      offerCount: 1,
    });
    const view = new FakeView();
    const chooser = new UpgradeChooserController(bus, system, view);
    bus.emit('level:up', { level: 2 });

    expect(view.handlers[0]?.select(view.handlers[0]!.offerId, 0)).toBe(true);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('manual');
    chooser.destroy();
    system.destroy();
  });

  it('does not render or deadlock when the eligible pool is empty', () => {
    const runState = createActiveRun();
    const bus = createEventBus();
    const system = new UpgradeSystem({
      runState,
      bus,
      definitions: [],
      rng: createFirstRng(),
    });
    const view = new FakeView();
    const chooser = new UpgradeChooserController(bus, system, view);

    bus.emit('level:up', { level: 2 });

    expect(view.renders).toEqual([]);
    expect(system.pendingCount).toBe(0);
    expect(runState.status).toBe('active');
    chooser.destroy();
    system.destroy();
  });
});

describe('UpgradeChooser facade seam (Epic 18 D9)', () => {
  async function createFacade(offerCount = 3) {
    const runState = createActiveRun();
    const bus = createEventBus();
    const system = new UpgradeSystem({
      runState,
      bus,
      definitions: definitions.slice(0, offerCount),
      rng: createFirstRng(),
      offerCount,
    });
    const scene = createFakeScene(390, 844);
    const { UpgradeChooser } = await import('../src/ui/UpgradeChooser');
    // No visual-art lookup: the icon path is exercised elsewhere, and the
    // facade must work without one.
    const chooser = new UpgradeChooser(scene as never, bus, system, () => false);
    return { runState, bus, system, scene, chooser };
  }

  it('drives a real offer to an applied upgrade through focus + confirm alone', async () => {
    const { runState, bus, system, chooser } = await createFacade(3);
    bus.emit('level:up', { level: 2 });

    expect(chooser.diagnostics.choiceIds).toHaveLength(3);
    const offered = chooser.diagnostics.choiceIds;
    expect(chooser.diagnostics.cards.map((card) => card.focused)).toEqual([true, false, false]);

    // Navigate to the second card and confirm — no keyboard event involved.
    chooser.focusNext();
    expect(chooser.diagnostics.cards.map((card) => card.focused)).toEqual([false, true, false]);
    expect(chooser.confirmFocused()).toBe(true);

    // The upgrade the focus was sitting on is the one that got applied.
    expect(runState.upgradeStacks[offered[1]!]).toBe(1);
    expect(system.currentOfferId).toBeUndefined();
    chooser.destroy();
    system.destroy();
  });

  it('emits no ui:navigate for boundary or no-offer facade moves (F3)', async () => {
    const { runState, bus, system, chooser } = await createFacade(1);
    const events: string[] = [];
    bus.on('ui:navigate', () => events.push('ui:navigate'));
    bus.emit('level:up', { level: 2 });
    expect(chooser.diagnostics.cards).toHaveLength(1);

    // Boundary on a one-card offer: no move, no event.
    expect(chooser.focusNext()).toBe(false);
    expect(chooser.focusPrevious()).toBe(false);
    expect(events).toEqual([]);

    // An accepted confirm resolves the offer; the seam is then no-offer inert.
    const offeredId = chooser.diagnostics.choiceIds[0]!;
    expect(chooser.confirmFocused()).toBe(true);
    expect(runState.upgradeStacks[offeredId]).toBe(1);
    expect(chooser.focusNext()).toBe(false);
    expect(chooser.focusPrevious()).toBe(false);
    expect(events).toEqual([]);
    chooser.destroy();
    system.destroy();
  });

  it('emits exactly one ui:navigate per real facade move (F3)', async () => {
    const { bus, system, chooser } = await createFacade(2);
    const events: string[] = [];
    bus.on('ui:navigate', () => events.push('ui:navigate'));
    bus.emit('level:up', { level: 2 });
    expect(chooser.diagnostics.cards).toHaveLength(2);

    expect(chooser.focusNext()).toBe(true);
    expect(events).toEqual(['ui:navigate']);
    expect(chooser.diagnostics.cards.map((card) => card.focused)).toEqual([false, true]);
    expect(chooser.focusPrevious()).toBe(true);
    expect(events).toEqual(['ui:navigate', 'ui:navigate']);
    expect(chooser.diagnostics.cards.map((card) => card.focused)).toEqual([true, false]);
    chooser.destroy();
    system.destroy();
  });

  it('wraps focus and rejects confirm once no offer is active', async () => {
    const { bus, system, chooser } = await createFacade(3);
    bus.emit('level:up', { level: 2 });

    chooser.focusPrevious();
    expect(chooser.diagnostics.cards.map((card) => card.focused)).toEqual([false, false, true]);
    expect(chooser.confirmFocused()).toBe(true);

    // Offer resolved: the seam is inert until the next offer arrives.
    expect(chooser.confirmFocused()).toBe(false);
    chooser.focusNext();
    expect(chooser.diagnostics.choiceIds).toEqual([]);
    chooser.destroy();
    system.destroy();
  });

  it('is inert after destroy', async () => {
    const { bus, system, chooser } = await createFacade(2);
    bus.emit('level:up', { level: 2 });
    chooser.destroy();

    chooser.focusNext();
    chooser.focusPrevious();
    expect(chooser.confirmFocused()).toBe(false);
    system.destroy();
  });
});
