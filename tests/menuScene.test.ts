import { describe, expect, it, vi } from 'vitest';
// Must precede any import whose transitive dependencies resolve Phaser at module
// evaluation time. The mock registration in __mocks__/phaser is a side-effectful
// import; ordering it first guarantees the mock is installed before the real
// Phaser module is ever requested.
import { MockGamepad, MockInputPlugin } from './__mocks__/phaser';
import { GAME_CONTEXT_REGISTRY_KEY, createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { SceneKey } from '../src/engine/sceneKeys';
import { MenuScene } from '../src/scenes/MenuScene';
import { AUDIO_MANAGER_REGISTRY_KEY } from '../src/systems/audio';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import type { MainMenuSnapshot } from '../src/ui/menus';
import { edgeMargin, minimumHitTarget, type LayoutEdge, type UiViewport } from '../src/ui/layout';
import { FocusStroke } from '../src/ui/theme';

interface FakeObjectState {
  kind: 'container' | 'text' | 'rect';
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
  interactive: boolean;
  destroyed: boolean;
  handlers: Record<string, () => void>;
  padding: { left: number; top: number; right: number; bottom: number };
  strokeWidth: number;
  strokeColor?: number;
  strokeAlpha: number;
  resolution?: number;
  style: Record<string, unknown>;
}

/** Module-scope failure seam shared by fakeObject (setStrokeStyle) and
 *  createFakeScene (which arms it via the harness API) — round-6. Counts
 *  down: arm with the number of stroke calls to SKIP before the failure
 *  (the button-ring init strokes at render start), so the throw lands after
 *  the hint is assigned. */
let failNextStroke = 0;

function fakeObject(
  kind: FakeObjectState['kind'],
  text = '',
  width = 0,
  height = 0,
  padding: FakeObjectState['padding'] = { left: 10, top: 8, right: 10, bottom: 8 },
  x = 0,
  y = 0,
) {
  const state: FakeObjectState = {
    kind,
    x,
    y,
    text,
    width,
    height,
    interactive: false,
    destroyed: false,
    handlers: {},
    padding: { ...padding },
    strokeWidth: 0,
    strokeColor: undefined,
    strokeAlpha: 0,
    style: {},
  };
  const api = {
    get state() {
      return { ...state, handlers: { ...state.handlers }, padding: { ...state.padding }, style: { ...state.style } };
    },
    get width() {
      return state.width;
    },
    get height() {
      return state.height;
    },
    get padding() {
      return { ...state.padding };
    },
    // Real Phaser display objects expose stroke state as properties.
    get strokeWidth() {
      return state.strokeWidth;
    },
    get strokeColor() {
      return state.strokeColor;
    },
    get strokeAlpha() {
      return state.strokeAlpha;
    },
    setOrigin(_x?: number, _y?: number) {
      return api;
    },
    setScrollFactor() {
      return api;
    },
    setDepth() {
      return api;
    },
    setStyle(style: Record<string, unknown>) {
      state.style = { ...state.style, ...style };
      return api;
    },
    setText(text: string) {
      // Real Phaser 3.90 throws on setText after destroy (nulled frame);
      // mirror so stale refs fail the suite (round-5/6 findings).
      if (state.destroyed) {
        throw new Error(`setText called on destroyed object (${state.text ?? ''})`);
      }
      state.text = text;
      return api;
    },
    setStrokeStyle(width: number, color: number, alpha: number) {
      if (failNextStroke > 0) {
        failNextStroke -= 1;
        if (failNextStroke === 0) {
          throw new Error('Injected stroke failure');
        }
      }
      state.strokeWidth = width;
      state.strokeColor = color;
      state.strokeAlpha = alpha;
      return api;
    },
    setPadding(left?: number, top?: number, right?: number, bottom?: number) {
      if (left !== undefined) state.padding.left = left;
      if (top !== undefined) state.padding.top = top;
      if (right !== undefined) state.padding.right = right;
      if (bottom !== undefined) state.padding.bottom = bottom;
      return api;
    },
    getBounds() {
      return { width: state.width, height: state.height };
    },
    setInteractive() {
      state.interactive = true;
      return api;
    },
    on(event: string, handler: () => void) {
      state.handlers = { ...state.handlers, [event]: handler };
      return api;
    },
    emit(event: string) {
      state.handlers[event]?.();
    },
    destroy() {
      state.destroyed = true;
    },
  };
  return api;
}

type FakeObject = ReturnType<typeof fakeObject>;

function createFakeScene(
  context: ReturnType<typeof createGameContext>,
  audioFake?: {
    playMusic: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    unlock: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  },
) {
  const objects: FakeObject[] = [];
  let failNextText = false;
  const register = <T>(object: T): T => {
    const candidate = object as FakeObject;
    if (!objects.includes(candidate)) {
      objects.push(candidate);
    }
    return object;
  };

  const input = new MockInputPlugin({ keyboard: true, gamepad: true });

  const lifecycleListeners = new Map<
    string,
    Array<{ handler: () => void; context: unknown; once: boolean }>
  >();
  const lifecycle = {
    once(event: string, handler: () => void, context?: unknown): void {
      const list = lifecycleListeners.get(event) ?? [];
      list.push({ handler, context, once: true });
      lifecycleListeners.set(event, list);
    },
    off(event: string, handler: () => void): void {
      lifecycleListeners.set(
        event,
        (lifecycleListeners.get(event) ?? []).filter((entry) => entry.handler !== handler),
      );
    },
    emit(event: string): void {
      const list = lifecycleListeners.get(event) ?? [];
      lifecycleListeners.set(event, list.filter((entry) => !entry.once));
      [...list].forEach((entry) => {
        entry.handler.call(entry.context);
      });
    },
  };

  const sceneStart = vi.fn();

  const environment = {
    registry: {
      get: (key: string) => {
        if (key === GAME_CONTEXT_REGISTRY_KEY) return context;
        if (key === AUDIO_MANAGER_REGISTRY_KEY) return audioFake;
        return undefined;
      },
    },
    scale: { width: 390, height: 844, displaySize: { width: 390, height: 844 } },
    add: {
      container(_x: number, _y: number) {
        const base = fakeObject('container', '', 0, 0, { left: 10, top: 8, right: 10, bottom: 8 }, _x, _y);
        const container = {
          ...base,
          get state() {
            return { ...base.state };
          },
          children: [] as FakeObject[],
          add(children: unknown) {
            const list = Array.isArray(children) ? children : [children];
            list.forEach((child) => {
              const object = register(child as FakeObject);
              if (!container.children.includes(object)) {
                container.children.push(object);
              }
            });
            return container;
          },
          destroy(deep = false) {
            if (deep) {
              container.children.forEach((child) => child.destroy());
            }
            base.destroy();
          },
        };
        register(container);
        return container;
      },
      text(
        _x: number,
        _y: number,
        text: string,
        style?: { padding?: { x?: number; y?: number }; resolution?: number },
      ) {
        if (failNextText) {
          failNextText = false;
          throw new Error('Injected text factory failure');
        }
        if (style?.resolution !== 2) throw new Error('UI text must use resolution 2');
        const padX = style?.padding?.x ?? 10;
        const padY = style?.padding?.y ?? 8;
        // Phaser Text bounds include the padding on both axes.
        const padding = { left: padX, top: padY, right: padX, bottom: padY };
        const object = fakeObject(
          'text',
          text,
          Math.max(24, text.length * 8),
          16 + padY * 2,
          padding,
          _x,
          _y,
        ).setStyle({ resolution: style.resolution });
        return register(object);
      },
      rectangle(_x: number, _y: number, width: number, height: number) {
        return register(fakeObject('rect', '', width, height, { left: 10, top: 8, right: 10, bottom: 8 }, _x, _y));
      },
    },
    input,
    events: lifecycle,
    scene: { start: sceneStart },
  };

  return {
    environment,
    objects,
    input,
    keyboard: input.keyboard!,
    lifecycle,
    sceneStart,
    /** Arms the fake add.text factory to throw once on its next call, then
     *  recover, mirroring the pause/runSummary failure-injection tests. */
    failNextText() {
      failNextText = true;
    },
    /** Arms the fake setStrokeStyle to throw after N strokes (round-6: a
     *  failure AFTER the hint is assigned — applyFocus runs post-build —
     *  must clear the stale hint so the next mode transition can't setText()
     *  destroyed Text). Home has 5 buttons: arm 5 to skip their init strokes,
     *  failing on applyFocus's stroke call. */
    failNextStroke(skip = 5) {
      failNextStroke = skip;
    },
    textContents(): string[] {
      return objects
        .filter((object) => object.state.kind === 'text' && !object.state.destroyed)
        .map((object) => object.state.text);
    },
    buttonByLabel(label: string): FakeObject | undefined {
      return objects.find(
        (object) =>
          object.state.kind === 'text' &&
          object.state.text === label &&
          object.state.handlers['pointerup'],
      );
    },
  };
}

function createHarness(options: { create?: boolean; audio?: boolean } = { create: true }) {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const context = createGameContext({
    bus: createEventBus(),
    menuRng: createRng(1),
    data,
    arenas,
    metaUpgrades,
    characters,
    save: new SaveManager(
      new MemoryStorageAdapter(),
      'menu-scene-test',
      metaUpgrades.maxLevels(),
    ),
  });

  // A missing audio registry entry must preserve all existing behavior: the
  // scene stays functional and silent.
  const audioFake = options.audio === false
    ? undefined
    : { playMusic: vi.fn(), update: vi.fn(), unlock: vi.fn(), destroy: vi.fn() };

  const { environment, ...helpers } = createFakeScene(context, audioFake);
  const menuScene = new MenuScene();
  Object.assign(menuScene, environment);
  if (options.create !== false) {
    menuScene.create();
  }

  return { menuScene, ...helpers, audioFake, bus: context.bus, context };
}

describe('MenuScene', () => {
  it('pages Gunsmith actions so a large owned inventory remains controller-reachable', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: Object.fromEntries([
        ...Array.from({ length: 7 }, (_, index) => [`part-${index}`, { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }]),
        ['fire', { partId: 'part:trait-fire', tier: 2, infusedTraits: [] }],
      ]),
      builds: [{ id: 'build:pistol', name: 'Main Weapon', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    expect(harness.textContents()).toContain('Next Gunsmith Page');
    harness.buttonByLabel('Next Gunsmith Page')!.state.handlers.pointerup!();
    expect(harness.textContents()).toContain('Previous Gunsmith Page');
  });

  it('projects injected top/bottom/side insets and keeps the hint and < Back inside the safe rect', () => {
    const values: Record<string, string> = {
      '--safe-top': '59px', '--safe-right': '31px', '--safe-bottom': '21px', '--safe-left': '47px',
    };
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: (property: string) => values[property] ?? '0px' }));
    try {
      const harness = createHarness();
      const viewport = (harness.menuScene as unknown as { currentViewport: UiViewport }).currentViewport;
      // Every injected inset is projected into logical UI units at FIT 1.
      expect(viewport.layoutInsets).toEqual({ top: 59, right: 31, bottom: 21, left: 47 });

      const liveText = (text: string) => harness.objects.find(
        (object) => object.state.kind === 'text' && object.state.text === text && !object.state.destroyed,
      )!;
      const margin = (edge: LayoutEdge) => edgeMargin(viewport, edge);

      // Home panel: the title clears the top inset and the hint is anchored
      // above the bottom margin band (edgeMargin base + inset) and inside the
      // left/right margins — removing the edgeMargin use must red.
      const title = liveText('Meowcenary');
      expect(title.state.y).toBe(28 + margin('top'));
      expect(title.state.y).toBeGreaterThanOrEqual(margin('top'));
      const hint = liveText('Tap a choice');
      expect(hint.state.x).toBe(margin('left'));
      expect(hint.state.y).toBe(viewport.canvasHeight - margin('bottom') - 14);
      expect(hint.state.x + hint.state.width).toBeLessThanOrEqual(viewport.canvasWidth - margin('right'));

      // Sub-panel: < Back is anchored above the bottom margin band with its
      // full bounds clear of the injected insets on every side.
      harness.buttonByLabel('Character')!.state.handlers['pointerup']!();
      const back = liveText('< Back');
      expect(back.state.x).toBe(margin('left'));
      expect(back.state.y).toBe(viewport.canvasHeight - margin('bottom') - minimumHitTarget(viewport));
      expect(back.state.x + back.state.width).toBeLessThanOrEqual(viewport.canvasWidth - margin('right'));
      expect(back.state.y + back.state.height).toBeLessThanOrEqual(viewport.canvasHeight - margin('bottom'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders the home panel with all navigation buttons', () => {
    const { textContents, objects } = createHarness();

    expect(textContents()).toEqual(
      expect.arrayContaining([
        'Meowcenary',
        'Start',
        'Character',
        'Arena',
        'Progression',
        'Gunsmith',
        'Settings',
        'Tap a choice',
      ]),
    );
    expect(objects.filter((object) => object.state.kind === 'container')).toHaveLength(1);
  });

  it.each([
    { label: 'Character', heading: 'Choose Character' },
    { label: 'Arena', heading: 'Choose Arena' },
    { label: 'Progression', heading: 'Progression — 0 scrap' },
    { label: 'Settings', heading: 'Settings' },
  ])('clicking the $label home button re-renders its panel', ({ label, heading }) => {
    const harness = createHarness();

    const button = harness.buttonByLabel(label);
    expect(button).toBeDefined();
    button!.state.handlers['pointerup']!();

    // The target panel is actually painted ...
    expect(harness.textContents()).toContain(heading);
    expect(harness.textContents()).not.toContain('Start');
    // ... because the old root was destroyed and a single live root remains,
    // i.e. the display tree was rebuilt instead of left frozen.
    const liveContainers = harness.objects.filter(
      (object) => object.state.kind === 'container' && !object.state.destroyed,
    );
    expect(liveContainers).toHaveLength(1);
    const destroyedRoots = harness.objects.filter(
      (object) => object.state.kind === 'container' && object.state.destroyed,
    );
    expect(destroyedRoots).toHaveLength(1);
  });

  it('navigates panels with keyboard focus and Esc returns home', () => {
    const harness = createHarness();

    harness.keyboard.keydown('ArrowDown'); // focus moves to Character
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('Enter');
    harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('Choose Character');

    harness.keyboard.keydown('Escape');
    harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('Start');
    expect(harness.textContents()).not.toContain('Choose Character');
  });

  it('navigates and confirms through the real gamepad with zero pointer-plugin calls (F9)', () => {
    const harness = createHarness();
    const pad = new MockGamepad();
    harness.input.gamepad!.connect(pad);
    const down = vi.spyOn(harness.input, 'pointerDown');
    const move = vi.spyOn(harness.input, 'pointerMove');
    const up = vi.spyOn(harness.input, 'pointerUp');

    const press = (position: number) => {
      pad.setButton(position, true);
      harness.menuScene.update(0, 16);
      pad.setButton(position, false);
      harness.menuScene.update(0, 16);
    };

    press(13); // D-pad down → Character
    press(0); // bottom face confirm → Character panel
    expect(harness.textContents()).toContain('Choose Character');
    expect(down).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(up).not.toHaveBeenCalled();

    press(1); // right face back → home
    expect(harness.textContents()).toContain('Start');
    expect(down).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(up).not.toHaveBeenCalled();
  });

  it('shows exactly one FocusStroke ring with exact width/color/alpha on the focused menu button; label color is never the focus signal (F4)', () => {
    const harness = createHarness();
    const rings = () =>
      harness.objects.filter(
        (object) =>
          object.state.kind === 'rect' &&
          !object.state.destroyed &&
          object.state.strokeColor === FocusStroke.color &&
          object.state.strokeAlpha === FocusStroke.alpha,
      );
    const allRings = () =>
      harness.objects.filter(
        (object) => object.state.kind === 'rect' && !object.state.destroyed && object.state.strokeWidth > 0,
      );

    // Pointer mode shows no persistent ring.
    expect(rings()).toHaveLength(0);

    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };

    press('ArrowDown');
    const first = rings();
    expect(first).toHaveLength(1);
    // The focused ring carries ALL THREE FocusStroke theme constants.
    expect(first[0]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(first[0]!.state.strokeColor).toBe(FocusStroke.color);
    expect(first[0]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    const focusedIndex = allRings().indexOf(first[0]!);

    press('ArrowDown');
    expect(rings()).toHaveLength(1);
    // The exact base ring state (FocusStroke width/color, alpha 0) is restored
    // on the target that lost focus.
    const second = rings();
    expect(second).toHaveLength(1);
    expect(second[0]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(second[0]!.state.strokeColor).toBe(FocusStroke.color);
    expect(second[0]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(second[0]).not.toBe(first[0]);
    const lost = allRings()[focusedIndex]!;
    expect(lost.state.strokeAlpha).toBe(0);
    expect(lost.state.strokeWidth).toBe(FocusStroke.width);
    expect(lost.state.strokeColor).toBe(FocusStroke.color);

    // Every button label stays cream regardless of focus.
    const labels = harness.objects.filter(
      (object) => object.state.kind === 'text' && object.state.handlers['pointerup'] && !object.state.destroyed,
    );
    expect(labels.length).toBeGreaterThanOrEqual(2);
    labels.forEach((label) => expect(label.state.style.color).toBe('#f7f1d5'));
  });

  it('preserves the exact settings row through repeated same-panel confirms', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    // A polled held key emits exactly one edge, so every repeated positional
    // press must release + poll between presses.
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    // Home → Settings (row 5).
    for (let i = 0; i < 5; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Settings');

    // Focus SFX Volume (row 2 of the settings list).
    press('ArrowDown');
    press('ArrowDown');
    expect(seams.navigator.index).toBe(2);

    const sfxText = () =>
      harness.objects.find(
        (object) =>
          object.state.kind === 'text' &&
          object.state.text.startsWith('SFX Volume:') &&
          !object.state.destroyed,
      )!.state.text;

    // Two same-panel confirms: the same row stays focused and its own value
    // changes twice (G-15 — not just "no reset").
    press('Enter');
    expect(seams.navigator.index).toBe(2);
    const afterFirst = sfxText();
    press('Enter');
    expect(seams.navigator.index).toBe(2);
    const afterSecond = sfxText();
    expect(afterSecond).not.toBe(afterFirst);
    expect(harness.textContents()).toContain(afterSecond);
  });

  it('preserves the exact character row through a same-panel selection', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Choose Character');
    expect(seams.navigator.index).toBe(0);

    // The roster has two characters, so the last selectable row is 1
    // (row 2 would be < Back).
    press('ArrowDown');
    expect(seams.navigator.index).toBe(1);
    press('Enter');
    // The row re-renders with its selection marker; the exact row stays focused.
    expect(harness.textContents()).toContain('Choose Character');
    expect(seams.navigator.index).toBe(1);
  });

  it('resets focus to the first target on genuine panel changes', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    // Home → Settings (row 5), then walk to < Back and return home.
    for (let i = 0; i < 5; i += 1) press('ArrowDown');
    press('Enter');
    expect(seams.navigator.index).toBe(0);

    for (let i = 0; i < 4; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Start');
    expect(seams.navigator.index).toBe(0);

    // Home → Character resets to the first character row.
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Choose Character');
    expect(seams.navigator.index).toBe(0);
  });

  it('gates nav and activate after a failed same-panel rebuild and resumes the exact command on retry (F1)', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const events: string[] = [];
    harness.bus.on('ui:navigate', () => events.push('ui:navigate'));
    harness.bus.on('ui:confirm', () => events.push('ui:confirm'));
    harness.bus.on('ui:back', () => events.push('ui:back'));
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };

    // Home → Settings, focus SFX Volume (row 2), then a same-panel toggle
    // fails mid-rebuild: the fallback replaces the tree and the retained
    // navigator must not move/emit without a committed display.
    for (let i = 0; i < 5; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Settings');
    press('ArrowDown');
    press('ArrowDown');
    expect(seams.navigator.index).toBe(2);

    harness.failNextText();
    events.length = 0; // discard navigation noise before the failure window
    expect(() => {
      harness.keyboard.keydown('Enter');
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup('Enter');
      harness.menuScene.update(0, 16);
    }).toThrow('Injected text factory failure');
    // The failing command itself emits its ui:confirm before the rebuild
    // throws; from here on nothing may fire on the fallback.
    events.length = 0;
    expect(harness.textContents()).toEqual(
      expect.arrayContaining(['Something went wrong — press Esc to retry']),
    );

    // The retained navigator (still index 2, count 5) must not move or emit,
    // and activate must not fire a command on the fallback.
    press('ArrowDown');
    expect(events).toEqual([]);
    expect(seams.navigator.index).toBe(2);
    press('Enter');
    expect(events).toEqual([]);

    // G-15: Esc retries through handleBack → render; the exact next
    // navigation and confirmation work again on the rebuilt home panel.
    press('Escape');
    expect(harness.textContents()).toContain('Start');
    expect(harness.textContents()).not.toContain('Something went wrong — press Esc to retry');
    expect(events).toEqual(['ui:back']);
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Choose Character');
    expect(events).toEqual(['ui:back', 'ui:navigate', 'ui:confirm']);
  });

  it('clears the stale hint when a render fails AFTER the hint is assigned (round-6)', () => {
    const harness = createHarness();
    const pad = new MockGamepad();
    harness.input.gamepad!.connect(pad);
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };

    // Home panel (hint created only here). Esc on home is a back no-op that
    // re-renders the SAME panel — the same-panel rebuild window.
    expect(harness.textContents()).toContain('Start');

    // The rebuild fails LATE: skip the 5 home buttons' init strokes so the
    // throw lands on the 6th (applyFocus, after the new hint was created and
    // assigned at renderHome) but before publication. The catch must clear
    // this.hint or the next mode transition calls setText() on the destroyed
    // Text (real Phaser 3.90 nulls the frame on destroy).
    harness.failNextStroke(6); // 5 buttons' init strokes + 1; fail on applyFocus
    expect(() => press('Escape')).toThrow('Injected stroke failure');
    expect(harness.textContents()).toEqual(
      expect.arrayContaining(['Something went wrong — press Esc to retry']),
    );

    // Mode transitions through REAL input (gamepad edge → gamepad; pointerdown
    // → pointer) must neither touch the destroyed hint nor throw.
    pad.setButton(13, true);
    expect(() => harness.menuScene.update(0, 16)).not.toThrow();
    pad.setButton(13, false);
    harness.menuScene.update(0, 16);
    harness.input.pointerDown(10, 10, 2);
    expect(() => harness.menuScene.update(0, 16)).not.toThrow();
  });

  it.each([
    { name: 'home', steps: 0, expected: ['Start', 'Character', 'Arena', 'Progression', 'Gunsmith', 'Settings', 'Stage', 'Equipment'] },
    { name: 'character', steps: 1, expected: ['✓ Scrap Tabby', 'Bolt Hound 🔒', 'Volt Lynx 🔒', 'Brass Boar 🔒', 'Ember Cougar 🔒', 'Scrap Weasel 🔒', 'Rattle Raptor 🔒', 'Piston Ram 🔒', '< Back'] },
    { name: 'arena', steps: 2, expected: ['✓ Junkyard Lot', '< Back'] },
    {
      name: 'progression',
      steps: 3,
      expected: [
        'Contracts',
        'Achievements (0/10)',
        'Gunsmith',
        'Mercenaries',
        'Equipment',
        'Legacy Training',
        '< Back',
      ],
    },
    {
      name: 'progression legacy training',
      steps: 3,
      expected: [
        'Reinforced Vest L0/5 (10 scrap)',
        'Quick Paws Training L0/5 (15 scrap)',
        'Sharpened Ammo L0/5 (20 scrap)',
        'Magnetic Whiskers L0/5 (10 scrap)',
        'Progression Hub',
        'Reset Progression',
        '< Back',
      ],
    },
    {
      name: 'settings',
      steps: 5,
      expected: ['Mute: Off', 'Music Volume: 70%', 'SFX Volume: 80%', 'Reduced Motion: Off', '< Back'],
    },
    { name: 'stage', steps: 6, expected: ['✓ First Scavenge', 'Scrap Run 🔒', 'Rusher Ambush 🔒', 'Brute Force 🔒', 'Boss: Scrap Crusher 🔒', 'Hot Salvage 🔒', 'Smelter Rush 🔒', 'Steel Wall 🔒', 'Foundry Cleanup 🔒', 'Boss: Forge Warden 🔒', '< Back'] },
    {
      name: 'reset-confirmation',
      steps: 6,
      expected: ['Confirm Reset', 'Cancel', '< Back'],
    },
  ])('registers the exact $name focus-target order/count with exactly one FocusStroke ring (F6)', ({ name, steps, expected }) => {
    const harness = createHarness();
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    const buttonLabels = () =>
      harness.objects
        .filter(
          (object) => object.state.kind === 'text' && object.state.handlers['pointerup'] && !object.state.destroyed,
        )
        .map((object) => object.state.text);
    const rings = () =>
      harness.objects.filter(
        (object) =>
          object.state.kind === 'rect' &&
          !object.state.destroyed &&
          object.state.strokeColor === FocusStroke.color &&
          object.state.strokeAlpha === FocusStroke.alpha,
      );

    if (name === 'reset-confirmation') {
      // Home → Progression → Reset Progression, entirely through nav/confirm.
      for (let i = 0; i < 3; i += 1) press('ArrowDown');
      press('Enter');
      const trainingIndex = buttonLabels().indexOf('Legacy Training');
      expect(trainingIndex).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < trainingIndex; i += 1) press('ArrowDown');
      press('Enter');
      const resetIndex = buttonLabels().indexOf('Reset Progression');
      expect(resetIndex).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < resetIndex; i += 1) press('ArrowDown');
      press('Enter');
      expect(harness.textContents()).toContain('Reset all progression?');
    } else {
      for (let i = 0; i < steps; i += 1) press('ArrowDown');
      press('Enter');
      if (name === 'progression legacy training') {
        for (let i = 0; i < 5; i += 1) press('ArrowDown');
        press('Enter');
      }
    }

    // Exact target order and count.
    expect(buttonLabels()).toEqual(expected);
    // Ensure keyboard/gamepad presentation mode is active, then restore index
    // 0 (home has had no input yet; a move also switches the input mode).
    press('ArrowDown');
    press('ArrowUp');
    // Exactly one ring carrying ALL THREE FocusStroke constants, on index 0.
    expect(rings()).toHaveLength(1);
    expect(rings()[0]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(rings()[0]!.state.strokeColor).toBe(FocusStroke.color);
    expect(rings()[0]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    expect(seams.navigator.index).toBe(0);
  });

  it('preserves the exact arena row through a same-panel selection (F6)', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    // Home → Arena.
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Choose Arena');
    expect(seams.navigator.index).toBe(0);

    // Confirm the visible default: the same-panel re-render preserves the row
    // and the exact command keeps working (G-15).
    press('Enter');
    expect(harness.textContents()).toContain('Choose Arena');
    expect(seams.navigator.index).toBe(0);
    press('Enter');
    expect(harness.textContents()).toContain('Choose Arena');
    expect(seams.navigator.index).toBe(0);
    const seams2 = harness.menuScene as unknown as {
      controller: { snapshot(): MainMenuSnapshot };
    };
    expect(seams2.controller.snapshot().arena.selectedArenaId).toBe('junkyard-lot');
  });

  it('preserves the exact progression row through purchase failure and successful purchase (F6)', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    const upgradeText = () =>
      harness.objects.find(
        (object) =>
          object.state.kind === 'text' &&
          object.state.text.startsWith('Reinforced Vest') &&
          !object.state.destroyed,
      )!.state.text;

    // Home → Progression → Legacy Training; focus the first upgrade.
    for (let i = 0; i < 3; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Progression — 0 scrap');
    expect(seams.navigator.index).toBe(0);
    for (let i = 0; i < 5; i += 1) press('ArrowDown');
    press('Enter');
    expect(seams.navigator.index).toBe(0);

    // Purchase failure (0 scrap): same row stays focused, notice shown, and
    // the next confirm still re-attempts the same row (G-15).
    press('Enter');
    expect(seams.navigator.index).toBe(0);
    expect(harness.textContents()).toContain('Not enough scrap');
    expect(upgradeText()).toBe('Reinforced Vest L0/5 (10 scrap)');
    press('Enter');
    expect(seams.navigator.index).toBe(0);
    expect(harness.textContents()).toContain('Not enough scrap');

    // Successful purchase: seed scrap, then the same row's value changes and
    // focus is preserved through the persisted re-render.
    harness.context.updateMeta((meta) => ({ ...meta, scrap: 500 }));
    press('Enter');
    expect(seams.navigator.index).toBe(0);
    expect(upgradeText()).toBe('Reinforced Vest L1/5 (16 scrap)');
    press('Enter');
    expect(seams.navigator.index).toBe(0);
    expect(upgradeText()).toBe('Reinforced Vest L2/5 (26 scrap)');
  });

  it('clamps the retained index on a same-panel rebuild with fewer targets (F6)', () => {
    const harness = createHarness();
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    const seams = harness.menuScene as unknown as {
      navigator: { index: number };
      controller: { snapshot(): MainMenuSnapshot };
      render(snapshot: MainMenuSnapshot): void;
    };

    // Home → Character (3 targets), focus < Back (index 2).
    press('ArrowDown');
    press('Enter');
    press('ArrowDown');
    press('ArrowDown');
    expect(seams.navigator.index).toBe(2);

    // Same-panel snapshot with a single-character roster (2 targets): the
    // retained index clamps to the new last target (1) instead of resetting.
    const snapshot = seams.controller.snapshot();
    const shrunk: MainMenuSnapshot = {
      ...snapshot,
      panel: 'character',
      character: {
        ...snapshot.character,
        characters: [snapshot.character.characters[0]!],
      },
    };
    seams.render(shrunk);
    expect(seams.navigator.index).toBe(1);

    // G-15: navigation resumes exactly — down wraps to the first target.
    press('ArrowDown');
    expect(seams.navigator.index).toBe(0);
    press('Enter');
    expect(harness.textContents()).toContain('Choose Character');
  });

  it('registers reset-confirmation targets in order and drives them through logical nav/confirm', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    const buttonLabels = () =>
      harness.objects
        .filter(
          (object) => object.state.kind === 'text' && object.state.handlers['pointerup'] && !object.state.destroyed,
        )
        .map((object) => object.state.text);

    // Home → Progression (row 3).
    for (let i = 0; i < 3; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Progression — 0 scrap');

    // Walk to Reset Progression and confirm — entirely through nav/confirm.
    const trainingIndex = buttonLabels().indexOf('Legacy Training');
    expect(trainingIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < trainingIndex; i += 1) press('ArrowDown');
    press('Enter');
    const resetIndex = buttonLabels().indexOf('Reset Progression');
    expect(resetIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < resetIndex; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Reset all progression?');

    // Target order is exactly Confirm Reset, Cancel, < Back.
    expect(buttonLabels()).toEqual(['Confirm Reset', 'Cancel', '< Back']);
    expect(seams.navigator.index).toBe(0);

    // The two-step guard still holds: Cancel and < Back are reachable.
    press('ArrowDown');
    expect(seams.navigator.index).toBe(1);
    press('ArrowDown');
    expect(seams.navigator.index).toBe(2);
    press('Escape');
    expect(harness.textContents()).toContain('Progression — 0 scrap');
  });

  it('switches the home hint exactly per input mode (F9)', () => {
    const harness = createHarness();
    const hint = () =>
      harness.objects.find(
        (object) =>
          object.state.kind === 'text' &&
          !object.state.destroyed &&
          (object.state.text === 'Tap a choice' ||
            object.state.text.startsWith('Arrows navigate') ||
            object.state.text.startsWith('D-pad/stick')),
      )?.state.text;

    expect(hint()).toBe('Tap a choice');

    harness.keyboard.keydown('ArrowDown');
    harness.menuScene.update(0, 16);
    harness.keyboard.keyup('ArrowDown');
    harness.menuScene.update(0, 16);
    expect(hint()).toBe('Arrows navigate • Enter/Space select • Q ability in run • Esc back');

    const pad = new MockGamepad();
    harness.input.gamepad!.connect(pad);
    pad.setButton(13, true);
    harness.menuScene.update(0, 16);
    pad.setButton(13, false);
    harness.menuScene.update(0, 16);
    expect(hint()).toBe('D-pad/stick • Bottom face select • Left face ability in run • Right face back');
  });

  it('returns home through the back button', () => {
    const harness = createHarness();

    harness.buttonByLabel('Character')!.state.handlers['pointerup']!();
    harness.buttonByLabel('< Back')!.state.handlers['pointerup']!();
    expect(harness.textContents()).toContain('Start');
  });

  it('shows the recovery fallback when render fails and Esc retries the home panel', () => {
    const harness = createHarness({ create: false });

    // The first text construction (the title) throws inside render; the
    // partial tree is destroyed, the fallback is shown, and the error is
    // rethrown so create() surfaces it.
    harness.failNextText();
    expect(() => harness.menuScene.create()).toThrow('Injected text factory failure');

    // The fallback message is the only live text.
    expect(harness.textContents()).toEqual(
      expect.arrayContaining(['Something went wrong — press Esc to retry']),
    );

    // Esc goes through handleBack -> render and rebuilds the home panel,
    // replacing the fallback root.
    harness.keyboard.keydown('Escape');
    harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('Start');
    expect(harness.textContents()).not.toContain('Something went wrong — press Esc to retry');

    const liveContainers = harness.objects.filter(
      (object) => object.state.kind === 'container' && !object.state.destroyed,
    );
    expect(liveContainers).toHaveLength(1);
  });

  it('starts the game scene from the Start button', () => {
    const harness = createHarness();

    harness.buttonByLabel('Start')!.state.handlers['pointerup']!();
    expect(harness.sceneStart).toHaveBeenCalledWith(SceneKey.Game);
  });
});

describe('MenuScene audio lifecycle', () => {
  it('selects the menu music loop exactly once during create', () => {
    const { audioFake } = createHarness();

    expect(audioFake!.playMusic).toHaveBeenCalledTimes(1);
    expect(audioFake!.playMusic).toHaveBeenCalledWith('music-menu');
  });

  it('forwards update delta to the audio manager', () => {
    const { menuScene, audioFake } = createHarness();

    menuScene.update(0, 17);

    expect(audioFake!.update).toHaveBeenCalledTimes(1);
    expect(audioFake!.update).toHaveBeenCalledWith(17);
  });

  it('unlocks once on the first pointer gesture and cross-removes the action subscription', () => {
    const { input, keyboard, audioFake, menuScene } = createHarness();
    expect(input.listenerCount('pointerdown')).toBe(2);

    input.pointerDown(10, 10);

    expect(audioFake!.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(1);

    // A subsequent action must never unlock again or accumulate listeners.
    keyboard.keydown('Enter');
    menuScene.update(0, 16);
    input.pointerDown(20, 20);
    expect(audioFake!.unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks once on the first logical action and cross-removes the pointer listener', () => {
    const { input, keyboard, audioFake, menuScene } = createHarness();
    expect(input.listenerCount('pointerdown')).toBe(2);

    keyboard.keydown('Enter');
    menuScene.update(0, 16);

    expect(audioFake!.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(1);

    keyboard.keydown('Enter');
    menuScene.update(0, 16);
    input.pointerDown(10, 10);
    expect(audioFake!.unlock).toHaveBeenCalledTimes(1);
  });

  it('removes the unlock pair on shutdown before any gesture', () => {
    const { lifecycle, input, audioFake } = createHarness();

    lifecycle.emit('shutdown');

    expect(input.listenerCount('pointerdown')).toBe(0);
    expect(audioFake!.unlock).not.toHaveBeenCalled();
  });

  it('clears the hint reference on shutdown so refresh cannot touch destroyed text (round-9)', () => {
    const { menuScene, lifecycle } = createHarness();
    // Menu is the only surface whose shutdown retains a Phaser display ref if
    // the hint isn't cleared. After shutdown the field must be undefined and
    // any presentation refresh must be a no-op (not setText on destroyed Text).
    lifecycle.emit('shutdown');
    const { hint } = menuScene as unknown as { hint?: unknown };
    expect(hint).toBeUndefined();
    expect(() => (menuScene as never as { refreshInputPresentation(): void }).refreshInputPresentation()).not.toThrow();
  });

  it('never accumulates unlock listeners across create/shutdown visits', () => {
    const { menuScene, lifecycle, input, audioFake } = createHarness();

    lifecycle.emit('shutdown');
    expect(input.listenerCount('pointerdown')).toBe(0);

    menuScene.create();
    expect(input.listenerCount('pointerdown')).toBe(2);

    lifecycle.emit('shutdown');
    expect(input.listenerCount('pointerdown')).toBe(0);

    menuScene.create();
    expect(input.listenerCount('pointerdown')).toBe(2);
    // Initial harness create plus the two explicit visits.
    expect(audioFake!.playMusic).toHaveBeenCalledTimes(3);
  });

  it('tolerates a missing audio registry entry and stays silent', () => {
    const { audioFake, input, textContents } = createHarness({ audio: false });

    expect(audioFake).toBeUndefined();
    expect(textContents()).toEqual(expect.arrayContaining(['Start', 'Character']));
    expect(input.listenerCount('pointerdown')).toBe(1);
  });
});

describe('MenuScene UI command events', () => {
  const recordEvents = (bus: ReturnType<typeof createEventBus>) => {
    const events: string[] = [];
    bus.on('ui:navigate', () => events.push('ui:navigate'));
    bus.on('ui:confirm', () => events.push('ui:confirm'));
    bus.on('ui:back', () => events.push('ui:back'));
    return events;
  };

  it('emits exactly one ui:navigate when focus actually moves', () => {
    const { keyboard, menuScene, bus } = createHarness();
    const events = recordEvents(bus);

    keyboard.keydown('ArrowDown');
    menuScene.update(0, 16);

    expect(events).toEqual(['ui:navigate']);
  });

  it('emits nothing when a focus move does not change the index', () => {
    const { menuScene, keyboard, bus } = createHarness();
    const events = recordEvents(bus);
    // A single-item focus list cannot move: the wrap-around lands on the same
    // index, so no navigate cue may fire.
    const seams = menuScene as unknown as {
      focusables: Array<ReturnType<typeof fakeObject>>;
      navigator: { setCount: (count: number) => void; setIndex: (index: number) => void };
    };
    seams.focusables = [fakeObject('text', 'only', 100, 32)];
    seams.navigator.setCount(1);
    seams.navigator.setIndex(0);

    keyboard.keydown('ArrowDown');
    menuScene.update(0, 16);

    expect(events).toEqual([]);
  });

  it('polled held key emits one nav edge; core nav auto-repeat is time-gated (D3)', () => {
    const { menuScene, keyboard, bus } = createHarness();
    const events = recordEvents(bus);
    const seams = menuScene as unknown as {
      focusables: Array<ReturnType<typeof fakeObject>>;
      navigator: { index: number };
    };
    const startIndex = seams.navigator.index;

    // Polled adapters read Key.isDown, so OS key-repeat events are irrelevant
    // by construction. A held ArrowDown emits exactly one navDown edge on the
    // held transition; repeats come from the pure core only after
    // navRepeat.delayMs (400ms), never at OS repeat rate.
    keyboard.keydown('ArrowDown', true);
    menuScene.update(0, 16);

    expect(events).toEqual(['ui:navigate']);
    expect(seams.navigator.index).toBe(startIndex + 1);

    // Still held, but well under the 400ms repeat delay: no repeat edge.
    keyboard.keydown('ArrowDown', true);
    menuScene.update(0, 16);
    keyboard.keydown('ArrowDown', true);
    menuScene.update(0, 16);
    expect(events).toEqual(['ui:navigate']);
  });

  it('emits exactly one ui:confirm on a pointer-activated button', () => {
    const harness = createHarness();
    const events = recordEvents(harness.bus);

    harness.buttonByLabel('Start')!.state.handlers['pointerup']!();

    expect(events).toEqual(['ui:confirm']);
  });

  it('emits exactly one ui:confirm for Enter and Space activation, never two', () => {
    const harness = createHarness();
    const events = recordEvents(harness.bus);

    harness.keyboard.keydown('Enter');
    harness.menuScene.update(0, 16);
    expect(events).toEqual(['ui:confirm']);

    events.length = 0;
    harness.keyboard.keyup('Enter');
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('Space');
    harness.menuScene.update(0, 16);
    expect(events).toEqual(['ui:confirm']);
  });

  it('emits ui:confirm for the panel button and ui:back for < Back, never a second confirm', () => {
    const harness = createHarness();
    const events = recordEvents(harness.bus);

    harness.buttonByLabel('Character')!.state.handlers['pointerup']!();
    harness.buttonByLabel('< Back')!.state.handlers['pointerup']!();

    expect(events).toEqual(['ui:confirm', 'ui:back']);
  });

  it('emits exactly one ui:back from Esc', () => {
    const harness = createHarness();
    const events = recordEvents(harness.bus);

    harness.keyboard.keydown('Escape');
    harness.menuScene.update(0, 16);

    expect(events).toEqual(['ui:back']);
  });

  it('emits nothing on pointer hover', () => {
    const harness = createHarness();
    const events = recordEvents(harness.bus);

    harness.buttonByLabel('Start')!.state.handlers['pointerover']!();
    harness.buttonByLabel('Start')!.state.handlers['pointerout']!();

    expect(events).toEqual([]);
  });
});
