import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import type { Rng } from '../src/engine/rng';
import { pauseRun, createRunState, startRun, type RunState } from '../src/gameplay/runState';
import { UpgradeSystem, type UpgradeOfferSnapshot } from '../src/systems/UpgradeSystem';
import type { UpgradeDefinition } from '../src/systems/types';
import {
  choiceIndexForNumberKey,
  UpgradeChooserController,
  type UpgradeChooserOffer,
  type UpgradeChooserSource,
  type UpgradeChooserView,
} from '../src/ui/upgradeChooserController';
import { computeUpgradeChooserLayout } from '../src/ui/upgradeChooserLayout';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
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
  },
  {
    id: 'hot-barrel',
    name: 'Hot Barrel',
    rarity: 'uncommon',
    target: 'weapon',
    description: 'Increase weapon fire rate for this run.',
    maxStacks: 4,
    effects: [{ stat: 'attackSpeed', op: 'mult', value: 1.12 }],
  },
  {
    id: 'extra-scrap',
    name: 'Extra Scrap',
    rarity: 'common',
    target: 'economy',
    description: 'Increase scrap gained for this run.',
    maxStacks: 3,
    effects: [{ stat: 'currencyGain', op: 'mult', value: 1.25 }],
  },
];

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
      ids: offer.definitions.map((definition) => definition.id),
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
  setScrollFactor(): this { return this; }
  setStrokeStyle(): this { return this; }
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
    this.onDestroy?.(this);
  }
}

class FakeText extends FakeDisplayObject {
  constructor(
    x: number,
    y: number,
    text: string,
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
    failNextTextFixedSize() { failFixedSize = true; },
    add: {
      container: () => own(new FakeContainer(remove)),
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
        const nameRight = left + card.padding + card.nameWidth;
        const rarityLeft = right - card.padding - card.rarityReserve;

        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(390);
        expect(top).toBeGreaterThan(layout.instructionsY + layout.fonts.instructions);
        expect(bottom).toBeLessThanOrEqual(844);
        expect(nameRight).toBeLessThan(rarityLeft);
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

  it.each(COLLAPSED_DISPLAYS)(
    'keeps all created regions safe at $name display size',
    ({ width, height }) => {
      for (const count of [1, 2, 3]) {
        const layout = computeUpgradeChooserLayout(390, 844, width, height, count);
        expect(layout.headerWidth).toBeGreaterThan(0);
        expect(layout.headingHeight).toBeGreaterThan(0);
        expect(layout.instructionsHeight).toBeGreaterThan(0);
        expect(Object.values(layout.fonts).every(Number.isFinite)).toBe(true);

        layout.cards.forEach((card) => {
          const left = card.x - card.width / 2;
          const right = card.x + card.width / 2;
          const numberRight = left + card.padding + card.numberWidth;
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
            card.descriptionY,
            card.descriptionHeight,
          ];

          expect(values.every(Number.isFinite)).toBe(true);
          expect(card.width).toBeGreaterThan(0);
          expect(card.height).toBeGreaterThan(0);
          expect(card.numberWidth).toBeGreaterThan(0);
          expect(card.rarityReserve).toBeGreaterThan(0);
          expect(card.descriptionHeight).toBeGreaterThanOrEqual(0);
          expect(numberRight).toBeLessThanOrEqual(rarityLeft + 0.001);
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
      { offerId: 73, definitions: offeredDefinitions },
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
    view.render({ offerId: 73, definitions: offeredDefinitions }, select);
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

  it.each([1, 2, 3])(
    'hard-bounds hostile rendered text for a %i-card offer at 320x240',
    async (count) => {
      const { view } = await createRenderedView(320, 240, hostileDefinitions.slice(0, count));
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
    view.render({ offerId: 9, definitions: definitions.slice(0, 1) }, () => true);

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

  it.each([1, 2, 3])(
    'preserves a %i-card offer through repeated tiny-display collapse and recovery',
    async (count) => {
      const offered = hostileDefinitions.slice(0, count);
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
    const { scene, view } = await createRenderedDisplay(390, 844, offered);
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

    expect(() => scene.scale.refresh(390, 844, true)).not.toThrow();
    expect(scene.childCount).toBe(baselineChildren);
    expect(view.diagnostics.cards).toHaveLength(3);
    expect(view.diagnostics.choiceIds).toEqual(
      offered.map((definition) => definition.id),
    );
    view.destroy();
    expect(scene.childCount).toBe(0);
  });
});

describe('UpgradeChooserController rendering', () => {
  it.each([1, 2, 3])('renders an ordered offer containing %i choice(s)', (count) => {
    const harness = createHarness();
    const offered = definitions.slice(0, count);
    harness.setSnapshot({ offerId: 11, definitions: offered });

    emitOffer(harness.bus, 11, offered);

    expect(harness.view.renders).toEqual([
      { offerId: 11, ids: offered.map((definition) => definition.id) },
    ]);
    expect(harness.controller.choiceCount).toBe(count);
  });

  it('uses event order rather than snapshot storage order', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 4, definitions });
    const ordered = [definitions[2]!, definitions[0]!, definitions[1]!];

    emitOffer(harness.bus, 4, ordered);

    expect(harness.view.renders[0]?.ids).toEqual(['extra-scrap', 'quick-paws', 'hot-barrel']);
  });

  it('does not render a mismatched or already-resolved snapshot', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 2, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    harness.setSnapshot(undefined);
    emitOffer(harness.bus, 2, [definitions[0]!]);

    expect(harness.view.renders).toEqual([]);
    expect(harness.controller.currentOfferId).toBeUndefined();
  });

  it('replaces prior UI and makes its captured handler stale', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    const stale = harness.view.handlers[0]!;
    harness.setSnapshot({ offerId: 2, definitions: [definitions[1]!] });
    emitOffer(harness.bus, 2, [definitions[1]!]);

    expect(harness.view.renders.map((render) => render.offerId)).toEqual([1, 2]);
    expect(stale.select(stale.offerId, 0)).toBe(false);
    expect(harness.chooseCard).not.toHaveBeenCalled();
  });
});

describe('UpgradeChooserController selection', () => {
  it('submits the captured offer token and pointer-selected upgrade ID', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 8, definitions: definitions.slice(0, 2) });
    emitOffer(harness.bus, 8, definitions.slice(0, 2));

    expect(harness.view.handlers[0]?.select(8, 1)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(8, 'hot-barrel');
  });

  it('maps keyboard 1, 2, and 3 and ignores other or repeated keys', () => {
    expect(['1', '2', '3'].map((key) => choiceIndexForNumberKey(key))).toEqual([0, 1, 2]);
    expect(choiceIndexForNumberKey('0')).toBeUndefined();
    expect(choiceIndexForNumberKey('4')).toBeUndefined();
    expect(choiceIndexForNumberKey('1', true)).toBeUndefined();
  });

  it.each(['1', '2', '3'])('submits keyboard %s against its visible choice', (key) => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 9, definitions });
    emitOffer(harness.bus, 9, definitions);
    const choiceIndex = choiceIndexForNumberKey(key);

    expect(choiceIndex).toBeDefined();
    expect(harness.view.handlers[0]?.select(9, choiceIndex!)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(9, definitions[choiceIndex!]!.id);
  });

  it('ignores out-of-range visible indices', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 3, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 3, [definitions[0]!]);

    expect(harness.controller.select(3, 1)).toBe(false);
    expect(harness.chooseCard).not.toHaveBeenCalled();
  });

  it('disables immediately after acceptance and rejects duplicate submission', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 5, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 5, [definitions[0]!]);

    expect(harness.controller.select(5, 0)).toBe(true);
    expect(harness.controller.select(5, 0)).toBe(false);
    expect(harness.view.enabled).toEqual([false]);
    expect(harness.chooseCard).toHaveBeenCalledTimes(1);
  });

  it('keeps a rejected command active and usable', () => {
    const harness = createHarness();
    harness.chooseCard.mockReturnValueOnce(false).mockReturnValueOnce(true);
    harness.setSnapshot({ offerId: 6, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 6, [definitions[0]!]);

    expect(harness.controller.select(6, 0)).toBe(false);
    expect(harness.controller.currentOfferId).toBe(6);
    expect(harness.view.enabled).toEqual([false, true]);
    expect(harness.controller.select(6, 0)).toBe(true);
  });

  it('requires a new token for consecutive offers with the same upgrade ID', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 20, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 20, [definitions[0]!]);
    const oldHandler = harness.view.handlers[0]!;
    harness.bus.emit('card:chosen', { upgradeId: 'quick-paws' });
    harness.setSnapshot({ offerId: 21, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 21, [definitions[0]!]);

    expect(oldHandler.select(20, 0)).toBe(false);
    expect(harness.view.handlers[1]?.select(21, 0)).toBe(true);
    expect(harness.chooseCard).toHaveBeenCalledWith(21, 'quick-paws');
  });
});

describe('UpgradeChooserController reentrancy and lifecycle', () => {
  it('clears UI when another offered listener resolves synchronously', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
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
      harness.setSnapshot({ offerId: 2, definitions: [definitions[0]!] });
      emitOffer(harness.bus, 2, [definitions[0]!]);
      return true;
    });
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.controller.select(1, 0)).toBe(true);
    expect(harness.controller.currentOfferId).toBe(2);
    expect(harness.view.renders.map((render) => render.offerId)).toEqual([1, 2]);
  });

  it('is safe when destroyed during offered delivery and ignores late events', () => {
    const harness = createHarness();
    harness.view.onRender = () => harness.controller.destroy();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });

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
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);

    expect(harness.view.destroyCount).toBe(1);
    expect(harness.view.renders).toEqual([]);
  });

  it('restarts with one fresh listener set and rejects the old visual handler', () => {
    const harness = createHarness();
    harness.setSnapshot({ offerId: 1, definitions: [definitions[0]!] });
    emitOffer(harness.bus, 1, [definitions[0]!]);
    const oldHandler = harness.view.handlers[0]!;
    harness.controller.destroy();

    const freshView = new FakeView();
    const freshController = new UpgradeChooserController(harness.bus, harness.source, freshView);
    harness.setSnapshot({ offerId: 2, definitions: [definitions[1]!] });
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
