
// ---------------------------------------------------------------------------
// Epic 19 Slice 5 shared production-composition module.
//
// This is the ONE extracted composition: the fake display/scale/lifecycle
// tree and the real-owner phase factories (menu + game) that every Epic 19
// soak and the controller journey share. It is NOT a copy — the controller
// journey imports these factories and keeps its original test name and
// assertions, and the soak harness parameterizes storage + fixture identity
// through these factories.
//
// F8: the mandatory controller journey is a production-composition harness.
// Real InputController + MockInputPlugin gamepad, real menu/pause/inventory/
// summary command owners and view seams, the real UpgradeSystem/UpgradeChooser
// and the actual private GameScene.routeAction through one typed test cast.
// MockInputPlugin supplies input, not the display tree — the display comes
// from one minimal fake Scene (per-view fake factories composed together).
// ---------------------------------------------------------------------------
import { expect, vi } from 'vitest';
import { MockGamepad, MockInputPlugin } from '../__mocks__/phaser';
import { GameScene } from '../../src/scenes/GameScene';
import { MenuScene } from '../../src/scenes/MenuScene';
import { InputController, type GameAction } from '../../src/systems/input';
import { createRunState, startRun } from '../../src/gameplay/runState';
import { createWeaponInstance, type WeaponInstance } from '../../src/gameplay/weapons';
import { createEventBus } from '../../src/engine/eventBus';
import { createGameContext, GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../../src/engine/context';
import { createRng, type Rng } from '../../src/engine/rng';
import { DataCharacterRegistry } from '../../src/systems/characters';
import { DataArenaRegistry } from '../../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../../src/systems/metaUpgrades';
import { DataWeaponRegistry } from '../../src/systems/weaponRegistry';
import { MemoryStorageAdapter, SaveManager, type StorageAdapter } from '../../src/systems/save';
import { loadGameData } from '../../src/systems/validation';
import { InventoryController } from '../../src/ui/inventory';
import { PauseController, PhaserPauseView } from '../../src/ui/pause';
import {
  PhaserRunSummaryView,
  RunSummaryController,
} from '../../src/ui/runSummary';
import { UpgradeSystem } from '../../src/systems/UpgradeSystem';
import { UpgradeChooser } from '../../src/ui/UpgradeChooser';
import { ControlsView } from '../../src/ui/controls';
import { logicalCanvasViewport } from '../../src/ui/layout';
import { FocusStroke } from '../../src/ui/theme';
import { AUDIO_MANAGER_REGISTRY_KEY } from '../../src/systems/audio';

// ---------------------------------------------------------------------------
// SOAK-07 (§3.1(2)): the test-only fixture scheduler. A fixed 32-bit
// LCG/xorshift that selects operations ONLY. It never imports, modifies,
// reseeds, or consumes the run's gameplay RNG — production run/upgrade RNG
// ownership and draw order stay untouched. The phase factories consume it as
// a REAL scheduler input when provided (non-zero fixtureSeed or an explicit
// `scheduler` option): runScripted() draws the input delivery for every
// scripted press operation from it. It lives here (not in the soak harness)
// so the factories can construct/consume it without a module cycle; the
// harness re-exports it to keep its public surface stable.
// ---------------------------------------------------------------------------
export interface FixtureSequence {
  nextInt(exclusiveMax: number): number;
  nextBoolean(): boolean;
}

export function createFixtureSequence(seed: number): FixtureSequence {
  let state = seed >>> 0;
  return {
    nextInt(exclusiveMax) {
      if (!Number.isSafeInteger(exclusiveMax) || exclusiveMax <= 0) throw new Error('exclusiveMax must be positive');
      state = Math.imul(state ^ (state >>> 16), 0x45d9f3b) >>> 0;
      state = Math.imul(state ^ (state >>> 13), 0x45d9f3b) >>> 0;
      state = (state ^ (state >>> 16)) >>> 0;
      return state % exclusiveMax;
    },
    nextBoolean() { return this.nextInt(2) === 1; },
  };
}

/** One deterministic domain command in a posture script. `press` uses the
 *  standard-layout pad position (0 confirm, 1 back, 3 inventory, 9 pause,
 *  12-15 nav). The scheduled harness selects each press's input delivery
 *  (pad / keyboard / simultaneous, 0-2 held polls) from its fixture
 *  sequence; the control executes the SAME commands with fixed gamepad
 *  delivery and zero fixture draws. */
export interface ScriptedOperation {
  readonly press?: number;
  readonly levelUp?: number;
  readonly idlePolls?: number;
}

/** Pad position -> keyboard key name for delivery selection (input.ts
 *  KEY_ACTION_MAP / GAMEPAD_BUTTONS equivalents). */
const POSITION_KEYS: Readonly<Record<number, string>> = {
  0: 'ENTER',
  1: 'ESC',
  3: 'I',
  9: 'P',
  12: 'UP',
  13: 'DOWN',
  14: 'LEFT',
  15: 'RIGHT',
};

const DELIVERY_SOURCE_NAMES = ['pad', 'keyboard', 'both'] as const;

export interface FakeObjectState {
  kind: 'container' | 'text' | 'rect' | 'arc' | 'image';
  text: string;
  width: number;
  height: number;
  x: number;
  y: number;
  alpha: number;
  radius: number;
  interactive: boolean;
  destroyed: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
  strokeWidth: number;
  strokeColor?: number;
  strokeAlpha: number;
  style: Record<string, unknown>;
}

export type FakeObject = ReturnType<typeof fakeObject>;
/** The inner fake Scene object (input/scale/events/scene/registry/add/objects). */
export type FakeScene = ReturnType<typeof createFakeScene>['scene'];

function fakeObject(
  kind: FakeObjectState['kind'],
  text = '',
  width = 0,
  height = 0,
  x = 0,
  y = 0,
  initialStyle: Record<string, unknown> = {},
) {
  const state: FakeObjectState = {
    kind,
    text,
    width,
    height,
    x,
    y,
    alpha: 1,
    radius: 0,
    interactive: false,
    destroyed: false,
    handlers: {},
    strokeWidth: 0,
    strokeColor: undefined,
    strokeAlpha: 0,
    style: { ...initialStyle },
  };
  // Real Phaser Text default padding is zero on all sides (TextStyle.js
  // initializes `this.padding = { left: 0, right: 0, top: 0, bottom: 0 }`).
  const padding = { left: 0, top: 0, right: 0, bottom: 0 };
  const requireAlive = (): void => {
    if (state.destroyed) throw new Error('Phaser fake object operation after destroy');
  };
  const applyPadding = (left?: number | Record<string, number>, top?: number, right?: number, bottom?: number): void => {
    if (typeof left === 'object') {
      const xPadding = left.x;
      const yPadding = left.y;
      padding.left = xPadding ?? left.left ?? 0;
      padding.right = xPadding ?? left.right ?? padding.left;
      padding.top = yPadding ?? left.top ?? 0;
      padding.bottom = yPadding ?? left.bottom ?? padding.top;
      return;
    }
    padding.left = left ?? 0;
    padding.top = top ?? padding.left;
    padding.right = right ?? padding.left;
    padding.bottom = bottom ?? padding.top;
  };
  if (kind === 'text' && initialStyle.padding && typeof initialStyle.padding === 'object') {
    applyPadding(initialStyle.padding as Record<string, number>);
  }
  const api = {
    get state() {
      return { ...state, handlers: { ...state.handlers }, style: { ...state.style } };
    },
    get padding() {
      return { ...padding };
    },
    get strokeWidth() {
      return state.strokeWidth;
    },
    get strokeColor() {
      return state.strokeColor;
    },
    get strokeAlpha() {
      return state.strokeAlpha;
    },
    get alpha() {
      return state.alpha;
    },
    get visible() {
      return !state.destroyed && state.alpha > 0;
    },
    // Real Phaser GameObjects expose width/height (Text frame includes its
    // padding); MenuScene layout reads e.g. info.height / button.height.
    get width() {
      return state.kind === 'text'
        ? state.width + padding.left + padding.right
        : state.width;
    },
    get height() {
      return state.kind === 'text'
        ? state.height + padding.top + padding.bottom
        : state.height;
    },
    setOrigin() {
      requireAlive();
      return api;
    },
    setScrollFactor() {
      requireAlive();
      return api;
    },
    setDepth() {
      requireAlive();
      return api;
    },
    setAlpha(alpha: number) {
      requireAlive();
      state.alpha = alpha;
      return api;
    },
    setPosition(x: number, y: number) {
      requireAlive();
      state.x = x;
      state.y = y;
      return api;
    },
    setRadius(radius: number) {
      requireAlive();
      state.radius = radius;
      return api;
    },
    setActive() {
      requireAlive();
      return api;
    },
    setVisible() {
      requireAlive();
      return api;
    },
    setStyle(style: Record<string, unknown>) {
      requireAlive();
      state.style = { ...state.style, ...style };
      return api;
    },
    setText(text: string) {
      requireAlive();
      state.text = text;
      return api;
    },
    setStrokeStyle(width: number, color: number, alpha: number) {
      requireAlive();
      state.strokeWidth = width;
      state.strokeColor = color;
      state.strokeAlpha = alpha;
      return api;
    },
    setFillStyle(_color: number, _alpha = 1) {
      requireAlive();
      return api;
    },
    setPadding(left?: number | Record<string, number>, top?: number, right?: number, bottom?: number) {
      requireAlive();
      applyPadding(left, top, right, bottom);
      return api;
    },
    setMaxLines() {
      requireAlive();
      return api;
    },
    setWordWrapWidth() {
      requireAlive();
      return api;
    },
    setFixedSize() {
      requireAlive();
      return api;
    },
    setCrop() {
      requireAlive();
      return api;
    },
    setScale() {
      requireAlive();
      return api;
    },
    setInteractive() {
      requireAlive();
      state.interactive = true;
      return api;
    },
    disableInteractive() {
      requireAlive();
      state.interactive = false;
      return api;
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      requireAlive();
      state.handlers = { ...state.handlers, [event]: handler };
      return api;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      requireAlive();
      const handlers = { ...state.handlers };
      if (handlers[event] === handler) {
        delete handlers[event];
      }
      state.handlers = handlers;
      return api;
    },
    emit(event: string, ...args: unknown[]) {
      requireAlive();
      state.handlers[event]?.(...args);
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.interactive = false;
      state.handlers = {};
    },
    getBounds() {
      requireAlive();
      // Phaser Text bounds include its padding frame; rectangles/containers
      // have no padding, so only text objects grow by the padding inset.
      const width = state.kind === 'text'
        ? state.width + padding.left + padding.right
        : state.width;
      const height = state.kind === 'text'
        ? state.height + padding.top + padding.bottom
        : state.height;
      return {
        x: state.x,
        y: state.y,
        centerX: state.x + width / 2,
        centerY: state.y + height / 2,
        width,
        height,
      };
    },
  };
  return api;
}

function createFakeScene(
  input: MockInputPlugin,
  context: ReturnType<typeof createGameContext>,
) {
  const objects: FakeObject[] = [];
  const register = <T>(object: T): T => {
    const candidate = object as FakeObject;
    if (!objects.includes(candidate)) {
      objects.push(candidate);
    }
    return object;
  };

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
    listenerCount(event: string): number {
      return lifecycleListeners.get(event)?.length ?? 0;
    },
  };

  const scaleListeners = new Map<
    string,
    Array<{ handler: (...args: unknown[]) => void; context: unknown }>
  >();
  const scaleEmitCounts = new Map<string, number>();
  const scaleListenerCallCounts = new Map<string, number>();
  const scale = {
    width: 390,
    height: 844,
    displaySize: { width: 390, height: 844 },
    parentSize: { width: 390, height: 844 },
    on(event: string, handler: (...args: unknown[]) => void, context?: unknown): void {
      const list = scaleListeners.get(event) ?? [];
      list.push({ handler, context });
      scaleListeners.set(event, list);
    },
    off(event: string, handler: (...args: unknown[]) => void, context?: unknown): void {
      scaleListeners.set(
        event,
        (scaleListeners.get(event) ?? []).filter(
          (entry) => entry.handler !== handler || entry.context !== context,
        ),
      );
    },
    listenerCount(event: string): number {
      return scaleListeners.get(event)?.length ?? 0;
    },
    /** Emits the real Phaser resize event exactly once per resize; every
     *  registered surface listener is invoked exactly once per emission. */
    emit(event: string, ...args: unknown[]): void {
      scaleEmitCounts.set(event, (scaleEmitCounts.get(event) ?? 0) + 1);
      const list = scaleListeners.get(event) ?? [];
      for (const entry of [...list]) {
        scaleListenerCallCounts.set(event, (scaleListenerCallCounts.get(event) ?? 0) + 1);
        entry.handler.call(entry.context, ...args);
      }
    },
    emitCount(event: string): number {
      return scaleEmitCounts.get(event) ?? 0;
    },
    listenerCallCount(event: string): number {
      return scaleListenerCallCounts.get(event) ?? 0;
    },
  };

  const scenePlugin = { start: vi.fn(), restart: vi.fn() };
  const audioFake = { playMusic: vi.fn(), update: vi.fn(), unlock: vi.fn(), destroy: vi.fn() };
  const shake = vi.fn();
  const shakeEffectReset = vi.fn();
  const tweenAdds: Array<Record<string, unknown>> = [];
  const tweens = {
    add: vi.fn((config: Record<string, unknown>) => {
      tweenAdds.push(config);
    }),
    killTweensOf: vi.fn(),
  };

  const scene = {
    input,
    scale,
    events: lifecycle,
    scene: scenePlugin,
    cameras: {
      main: {
        shake,
        shakeEffect: { reset: shakeEffectReset },
      },
    },
    tweens,
    textures: {
      exists: vi.fn(() => false),
    },
    registry: {
      get: (key: string) => {
        if (key === GAME_CONTEXT_REGISTRY_KEY) return context;
        if (key === AUDIO_MANAGER_REGISTRY_KEY) return audioFake;
        return undefined;
      },
    },
    add: {
      container(x: number, y: number) {
        const base = fakeObject('container', '', 0, 0, x, y);
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
      text(x: number, y: number, text: string, style: Record<string, unknown> = {}) {
        return register(fakeObject('text', text, Math.max(24, text.length * 8), 16, x, y, style));
      },
      rectangle(x: number, y: number, width: number, height: number) {
        return register(fakeObject('rect', '', width, height, x, y));
      },
      circle(x: number, y: number, radius: number, fillColor?: number, fillAlpha?: number) {
        const object = fakeObject('arc', '', radius * 2, radius * 2, x, y);
        object.setRadius(radius);
        if (fillColor !== undefined) object.setFillStyle(fillColor, fillAlpha ?? 1);
        return register(object);
      },
      arc(x: number, y: number, radius: number, _start: number, _end: number, _ccw: boolean, fillColor?: number, fillAlpha?: number) {
        const object = fakeObject('arc', '', radius * 2, radius * 2, x, y);
        object.setRadius(radius);
        if (fillColor !== undefined) object.setFillStyle(fillColor, fillAlpha ?? 1);
        return register(object);
      },
      image(x: number, y: number, _textureKey: string) {
        return register(fakeObject('image', '', 0, 0, x, y));
      },
    },
    get objects() {
      return objects;
    },
  };
  return { scene, scale, tweens, tweenAdds, shake, shakeEffectReset, audioFake };
}

function createBrandedContext(
  bus: ReturnType<typeof createEventBus>,
  storageKey: string,
) {
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const inner = new MemoryStorageAdapter();
  let writes = 0;
  const storage: StorageAdapter = {
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      writes += 1;
      return inner.setItem(key, value);
    },
    removeItem: (key) => {
      writes += 1;
      return inner.removeItem(key);
    },
  };
  const context = createGameContext({
    bus,
    menuRng: createRng(1),
    data,
    metaUpgrades,
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    save: new SaveManager(storage, storageKey, metaUpgrades.maxLevels()),
  });
  return { context, storage, storageKey, writeCount: () => writes, data, metaUpgrades };
}

function createPointerSpies(input: MockInputPlugin) {
  return {
    down: vi.spyOn(input, 'pointerDown'),
    move: vi.spyOn(input, 'pointerMove'),
    up: vi.spyOn(input, 'pointerUp'),
  };
}

/** Exact listener counts on every lifecycle surface the phases attach to.
 *  All are zero on a fresh plugin/scale, so destroy() must restore exactly
 *  this baseline (GAMEPAD-02: connected/disconnected + pointer + action +
 *  resize listener baselines). */
export interface ListenerDiagnostics {
  readonly gamepadConnected: number;
  readonly gamepadDisconnected: number;
  readonly pointerDown: number;
  readonly pointerMove: number;
  readonly pointerUp: number;
  readonly pointerUpOutside: number;
  readonly scaleResize: number;
  readonly keyboardKeydown: number;
  readonly keyboardRetry: number;
  /** scene.events lifecycle listeners (Phaser.Scenes.Events.SHUTDOWN /
   *  DESTROY once-listeners: MenuScene/GameScene create() register one each,
   *  handleShutdown removes both, so destroy() must restore exactly zero). */
  readonly sceneEventsShutdown: number;
  readonly sceneEventsDestroy: number;
}

export const ZERO_LISTENER_DIAGNOSTICS: ListenerDiagnostics = Object.freeze({
  gamepadConnected: 0,
  gamepadDisconnected: 0,
  pointerDown: 0,
  pointerMove: 0,
  pointerUp: 0,
  pointerUpOutside: 0,
  scaleResize: 0,
  keyboardKeydown: 0,
  keyboardRetry: 0,
  sceneEventsShutdown: 0,
  sceneEventsDestroy: 0,
});

export function listenerDiagnostics(scene: FakeScene): ListenerDiagnostics {
  return {
    gamepadConnected: scene.input.gamepad?.listenerCount('connected') ?? 0,
    gamepadDisconnected: scene.input.gamepad?.listenerCount('disconnected') ?? 0,
    pointerDown: scene.input.listenerCount('pointerdown'),
    pointerMove: scene.input.listenerCount('pointermove'),
    pointerUp: scene.input.listenerCount('pointerup'),
    pointerUpOutside: scene.input.listenerCount('pointerupoutside'),
    scaleResize: scene.scale.listenerCount('resize'),
    keyboardKeydown: scene.input.keyboard?.listenerCount('keydown') ?? 0,
    keyboardRetry: scene.input.keyboard?.listenerCount('keydown-R') ?? 0,
    sceneEventsShutdown: scene.events.listenerCount('shutdown'),
    sceneEventsDestroy: scene.events.listenerCount('destroy'),
  };
}

// --- Menu phase: real MenuScene + real MainMenuController + real InputController ---

export interface MenuPhaseOptions {
  readonly storageKey: string;
  /** Non-zero seeds a REAL fixture scheduler (§3.1(2) SOAK-07): the factory
   *  constructs the test-only sequence and runScripted() consumes it to
   *  select each press operation's input delivery. Zero = no scheduler. */
  readonly fixtureSeed: number;
  /** Explicit fixture sequence; takes precedence over fixtureSeed. */
  readonly scheduler?: FixtureSequence;
}

export interface MenuPhaseResult {
  menuScene: MenuScene;
  menuController: import('../../src/ui/menus').MainMenuController;
  inputController: InputController;
  scene: FakeScene;
  input: MockInputPlugin;
  pad: MockGamepad;
  press: (position: number) => void;
  /** Executes a fixed domain-command script. When a fixture scheduler is
   *  wired, every press operation first draws its input delivery (source +
   *  held polls) from the fixture sequence; without one, delivery is fixed
   *  gamepad and no fixture draws occur. */
  runScripted: (script: readonly ScriptedOperation[]) => void;
  /** Fixture draws consumed by runScripted (0 without a scheduler). */
  schedulerDraws: () => number;
  /** Executed operations with their drawn delivery, in order. */
  scriptedLog: () => readonly string[];
  pointerCalls: ReturnType<typeof createPointerSpies>;
  textContents: () => readonly string[];
  sceneStart: ReturnType<typeof vi.fn>;
  sceneRestart: ReturnType<typeof vi.fn>;
  bus: ReturnType<typeof createEventBus>;
  events: string[];
  context: GameContext;
  storage: StorageAdapter;
  storageKey: string;
  writeCount: () => number;
  tweens: { add: ReturnType<typeof vi.fn>; killTweensOf: ReturnType<typeof vi.fn> };
  tweenAdds: Array<Record<string, unknown>>;
  destroy: () => void;
}

export function createMenuPhase(options?: Partial<MenuPhaseOptions>): MenuPhaseResult {
  const storageKey = options?.storageKey ?? 'controller-journey-menu';
  const fixtureSeed = options?.fixtureSeed ?? 0;
  // §3.1(2) SOAK-07: the fixture sequence is a REAL scheduler input when
  // provided. runScripted() consumes it to select each press operation's
  // input delivery; with no scheduler it uses fixed gamepad delivery and
  // performs zero fixture draws. The sequence is never connected to any
  // gameplay RNG — the menu surface owns no production RNG stream.
  const scheduler: FixtureSequence | undefined =
    options?.scheduler ?? (fixtureSeed !== 0 ? createFixtureSequence(fixtureSeed) : undefined);
  let schedulerDrawCount = 0;
  const countingScheduler: FixtureSequence | undefined = scheduler
    ? {
        nextInt(exclusiveMax: number): number {
          schedulerDrawCount += 1;
          return scheduler.nextInt(exclusiveMax);
        },
        nextBoolean(): boolean {
          schedulerDrawCount += 1;
          return scheduler.nextBoolean();
        },
      }
    : undefined;
  const { context, storage, writeCount } = createBrandedContext(
    createEventBus(),
    storageKey,
  );
  const bus = context.bus;
  const input = new MockInputPlugin({ keyboard: true, gamepad: true });
  const pad = new MockGamepad();
  input.gamepad!.connect(pad);
  const fake = createFakeScene(input, context);
  const scene = fake.scene;
  const menuScene = new MenuScene();
  Object.assign(menuScene, scene);
  menuScene.create();

  const menuController = (menuScene as unknown as {
    controller?: import('../../src/ui/menus').MainMenuController;
  }).controller!;
  const inputController = (menuScene as unknown as { inputController?: InputController }).inputController!;

  const pointerCalls = createPointerSpies(input);
  const press = (position: number) => {
    pad.setButton(position, true);
    menuScene.update(0, 16);
    pad.setButton(position, false);
    menuScene.update(0, 16);
  };
  // §3.1(2) SOAK-07 scheduled execution: the SAME scripted domain commands as
  // the control, but each press operation's input delivery (pad / keyboard /
  // simultaneous source, 0-2 held polls) is drawn LIVE from the fixture
  // sequence when one is wired — the fixture draws genuinely drive what the
  // harness does. Without a scheduler the delivery is fixed gamepad and no
  // fixture draws occur.
  const scriptLog: string[] = [];
  const runScripted = (script: readonly ScriptedOperation[]): void => {
    for (const operation of script) {
      if (operation.press !== undefined) {
        const source = countingScheduler ? countingScheduler.nextInt(3) : 0;
        const holdPolls = countingScheduler ? countingScheduler.nextInt(3) : 0;
        const key = POSITION_KEYS[operation.press];
        if (source !== 1) pad.setButton(operation.press, true);
        if (source !== 0 && key !== undefined) input.keyboard?.holdKey(key);
        menuScene.update(0, 16);
        for (let i = 0; i < holdPolls; i += 1) menuScene.update(0, 16);
        if (source !== 1) pad.setButton(operation.press, false);
        if (source !== 0 && key !== undefined) input.keyboard?.keyup(key);
        menuScene.update(0, 16);
        scriptLog.push(`press:${operation.press}@${DELIVERY_SOURCE_NAMES[source]}:${holdPolls}`);
        continue;
      }
      if (operation.idlePolls !== undefined) {
        for (let i = 0; i < operation.idlePolls; i += 1) menuScene.update(0, 16);
        scriptLog.push(`idle:${operation.idlePolls}`);
        continue;
      }
      throw new Error(`menu runScripted rejects operation ${JSON.stringify(operation)}`);
    }
  };
  const textContents = () =>
    scene.objects
      .filter((object) => object.state.kind === 'text' && !object.state.destroyed)
      .map((object) => object.state.text);
  const events: string[] = [];
  bus.on('ui:navigate', () => events.push('ui:navigate'));
  bus.on('ui:confirm', () => events.push('ui:confirm'));
  bus.on('ui:back', () => events.push('ui:back'));
  const destroy = () => {
    menuScene.events.emit('shutdown');
  };
  return {
    menuScene, menuController, inputController, scene, input, pad, press,
    runScripted, schedulerDraws: () => schedulerDrawCount, scriptedLog: () => scriptLog,
    pointerCalls,
    textContents, sceneStart: scene.scene.start, sceneRestart: scene.scene.restart,
    bus, events, context, storage, storageKey, writeCount,
    tweens: fake.tweens, tweenAdds: fake.tweenAdds, destroy,
  };
}

// --- Game phase: real owners/views + GameScene.routeAction through one cast ---

export interface GamePhaseOptions {
  readonly runSeed: number;
  readonly storageKey: string;
  /** Non-zero seeds a REAL fixture scheduler (§3.1(2) SOAK-07): the factory
   *  constructs the test-only sequence and runScripted() consumes it to
   *  select each press operation's input delivery. Zero = no scheduler. */
  readonly fixtureSeed: number;
  /** Explicit fixture sequence; takes precedence over fixtureSeed. */
  readonly scheduler?: FixtureSequence;
}

export type GameSeams = {
  runState: ReturnType<typeof createRunState>;
  inputController: InputController;
  pauseController: PauseController;
  pauseView: PhaserPauseView;
  runSummaryView: PhaserRunSummaryView;
  upgradeChooser: UpgradeChooser;
  routeAction: (action: GameAction) => void;
};

export interface GamePhaseResult {
  seams: GameSeams;
  input: MockInputPlugin;
  pad: MockGamepad;
  press: (position: number) => void;
  /** Executes a fixed domain-command script. When a fixture scheduler is
   *  wired, every press operation first draws its input delivery (source +
   *  held polls) from the fixture sequence; without one, delivery is fixed
   *  gamepad and no fixture draws occur. levelUp operations emit through the
   *  real bus and drive the production upgrade RNG. */
  runScripted: (script: readonly ScriptedOperation[]) => void;
  /** Fixture draws consumed by runScripted (0 without a scheduler). */
  schedulerDraws: () => number;
  /** Executed operations with their drawn delivery, in order. */
  scriptedLog: () => readonly string[];
  /** Production upgrade-RNG draw count (createRng(runSeed + 1) calls made
   *  through the UpgradeSystem's rng seam — the scheduled-vs-control posture
   *  comparison must show identical counts). */
  productionRngDraws: () => number;
  update: (delta?: number) => void;
  pointerCalls: ReturnType<typeof createPointerSpies>;
  bus: ReturnType<typeof createEventBus>;
  events: string[];
  scene: FakeScene;
  context: GameContext;
  runState: ReturnType<typeof createRunState>;
  pauseController: PauseController;
  inventory: InventoryController;
  instance: (defId: string, instanceId: string) => WeaponInstance;
  upgradeChooser: UpgradeChooser;
  upgradeSystem: UpgradeSystem;
  pauseView: PhaserPauseView;
  runSummaryView: PhaserRunSummaryView;
  controlsView: ControlsView;
  inputController: InputController;
  storage: StorageAdapter;
  storageKey: string;
  writeCount: () => number;
  shake: ReturnType<typeof vi.fn>;
  shakeEffectReset: ReturnType<typeof vi.fn>;
  tweenAdds: Array<Record<string, unknown>>;
  destroy: () => void;
  get merged(): number;
}

export function createGamePhase(
  options?: Partial<GamePhaseOptions> | number,
): GamePhaseResult {
  const normalized: Partial<GamePhaseOptions> =
    typeof options === 'number' ? { runSeed: options } : (options ?? {});
  const runSeed = normalized.runSeed ?? 7;
  const storageKey = normalized.storageKey ?? `controller-journey-game-${runSeed}`;
  const fixtureSeed = normalized.fixtureSeed ?? 0;
  // §3.1(2) SOAK-07: the fixture sequence is a REAL scheduler input when
  // provided (non-zero fixtureSeed or an explicit scheduler). runScripted()
  // consumes it LIVE to select each press operation's input delivery; with
  // no scheduler it uses fixed gamepad delivery and performs zero fixture
  // draws. It is never connected to the production RNG below — identical
  // runSeed means identical production run/upgrade RNG ownership and draw
  // order in the scheduled and control harnesses.
  const scheduler: FixtureSequence | undefined =
    normalized.scheduler ?? (fixtureSeed !== 0 ? createFixtureSequence(fixtureSeed) : undefined);
  let schedulerDrawCount = 0;
  const countingScheduler: FixtureSequence | undefined = scheduler
    ? {
        nextInt(exclusiveMax: number): number {
          schedulerDrawCount += 1;
          return scheduler.nextInt(exclusiveMax);
        },
        nextBoolean(): boolean {
          schedulerDrawCount += 1;
          return scheduler.nextBoolean();
        },
      }
    : undefined;
  const { context, storage, writeCount } = createBrandedContext(
    createEventBus(),
    storageKey,
  );
  const bus = context.bus;
  const input = new MockInputPlugin({ keyboard: true, gamepad: true });
  const pad = new MockGamepad();
  input.gamepad!.connect(pad);
  const fake = createFakeScene(input, context);
  const scene = fake.scene;
  const gameScene = new GameScene();
  Object.assign(gameScene, scene);

  const runState = createRunState({ seed: runSeed, characterId: 'scrap-tabby', arenaId: 'arena' });
  startRun(runState);
  const weaponRegistry = new DataWeaponRegistry(context.data);
  const instance = (defId: string, instanceId: string): WeaponInstance => {
    const def = weaponRegistry.weaponById(defId);
    if (!def) {
      throw new Error(`missing test weapon ${defId}`);
    }
    return createWeaponInstance(def, instanceId);
  };
  runState.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];

  const inputController = new InputController(scene as never);
  const inventory = new InventoryController({ runState, bus, weaponRegistry });
  const pauseController = new PauseController({ runState, bus, inventory });
  const pauseView = new PhaserPauseView({
    scene: scene as never,
    viewport: logicalCanvasViewport(),
    bus,
    controller: pauseController,
    inventory,
    readInputMode: () => inputController.getInputMode(),
  });
  // The production upgrade RNG, exactly createRng(runSeed + 1) as before,
  // wrapped in a counting seam so the draw-posture test can DEMONSTRATE that
  // the scheduled and control harnesses made identical numbers of production
  // draws. The wrapper delegates every call with the same seed/order — the
  // draw VALUES are byte-identical to the unwrapped RNG.
  const productionRng = createRng(runSeed + 1);
  let productionRngDrawCount = 0;
  const countedProductionRng: Rng = {
    next(): number {
      productionRngDrawCount += 1;
      return productionRng.next();
    },
    int(minInclusive: number, maxInclusive: number): number {
      productionRngDrawCount += 1;
      return productionRng.int(minInclusive, maxInclusive);
    },
    pick<T>(items: readonly T[]): T {
      productionRngDrawCount += 1;
      return productionRng.pick(items);
    },
    weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T {
      productionRngDrawCount += 1;
      return productionRng.weighted(entries);
    },
  };
  const upgradeSystem = new UpgradeSystem({
    runState,
    bus,
    definitions: context.data.upgrades,
    rng: countedProductionRng,
    offerCount: 3,
  });
  const upgradeChooser = new UpgradeChooser(
    scene as never,
    bus,
    upgradeSystem,
    () => context.settings.reducedMotion,
    undefined,
    () => inputController.getInputMode(),
  );
  const runSummaryController = new RunSummaryController({
    get runState() {
      return runState;
    },
    get lastBankedRun() {
      return null;
    },
  });
  const runSummaryView = new PhaserRunSummaryView({
    scene: scene as never,
    viewport: logicalCanvasViewport(),
    bus,
    controller: runSummaryController,
    readInputMode: () => inputController.getInputMode(),
  });
  const controlsView = new ControlsView({
    scene: scene as never,
    input: inputController,
    viewport: logicalCanvasViewport(),
    readReducedMotion: () => context.settings.reducedMotion,
    onPauseRequested: () => seams.routeAction('pause'),
  });

  const seams = gameScene as unknown as GameSeams;
  seams.runState = runState;
  seams.inputController = inputController;
  seams.pauseController = pauseController;
  seams.pauseView = pauseView;
  seams.runSummaryView = runSummaryView;
  seams.upgradeChooser = upgradeChooser;

  // GameScene.create() registers one SHUTDOWN and one DESTROY once-listener
  // on scene.events and handleShutdown removes both (src/scenes/GameScene.ts:
  // 422-423, 485-487). The game-phase harness cannot run the full create()
  // (it would need the entire physics/display graph), so it registers the
  // SAME two once-listeners with the REAL handleShutdown at build time: the
  // sceneEventsShutdown/sceneEventsDestroy baseline is genuinely non-zero
  // and destroy() must clear both. This proves the harness path — the real
  // create() registration is covered by the menu-phase soaks and the
  // GameScene unit tests.
  const gameHandleShutdown = (gameScene as unknown as {
    handleShutdown: () => void;
  }).handleShutdown;
  scene.events.once('shutdown', gameHandleShutdown, gameScene);
  scene.events.once('destroy', gameHandleShutdown, gameScene);

  // The exact GameScene.create() wiring, through the real routeAction.
  inputController.onAction('pause', () => seams.routeAction('pause'));
  inputController.onAction('back', () => seams.routeAction('back'));
  inputController.onAction('inventory', () => seams.routeAction('inventory'));
  inputController.onAction('navUp', () => seams.routeAction('navUp'));
  inputController.onAction('navDown', () => seams.routeAction('navDown'));
  inputController.onAction('navLeft', () => seams.routeAction('navLeft'));
  inputController.onAction('navRight', () => seams.routeAction('navRight'));
  inputController.onAction('confirm', () => seams.routeAction('confirm'));

  const pointerCalls = createPointerSpies(input);

  // Mirror GameScene.update order: input poll, then every visible surface's
  // source-aware refresh (allocation-free no-ops when the mode is unchanged),
  // then the controls view (hint/stick presentation).
  const update = (delta = 16) => {
    inputController.update(delta);
    pauseView.refreshInputPresentation();
    runSummaryView.refreshInputPresentation();
    upgradeChooser.refreshInputPresentation();
    controlsView.update(delta);
  };
  const press = (position: number) => {
    pad.setButton(position, true);
    update();
    pad.setButton(position, false);
    update();
  };
  // §3.1(2) SOAK-07 scheduled execution: the SAME scripted domain commands as
  // the control, but each press operation's input delivery (pad / keyboard /
  // simultaneous source, 0-2 held polls) is drawn LIVE from the fixture
  // sequence when one is wired — the fixture draws genuinely drive what the
  // harness does. levelUp operations emit through the real bus so production
  // upgrade-RNG draws interleave with the fixture draws. Without a scheduler
  // the delivery is fixed gamepad and zero fixture draws occur.
  const scriptLog: string[] = [];
  const runScripted = (script: readonly ScriptedOperation[]): void => {
    for (const operation of script) {
      if (operation.levelUp !== undefined) {
        bus.emit('level:up', { level: operation.levelUp });
        scriptLog.push(`levelUp:${operation.levelUp}`);
        continue;
      }
      if (operation.idlePolls !== undefined) {
        for (let i = 0; i < operation.idlePolls; i += 1) update();
        scriptLog.push(`idle:${operation.idlePolls}`);
        continue;
      }
      if (operation.press !== undefined) {
        const source = countingScheduler ? countingScheduler.nextInt(3) : 0;
        const holdPolls = countingScheduler ? countingScheduler.nextInt(3) : 0;
        const key = POSITION_KEYS[operation.press];
        if (source !== 1) pad.setButton(operation.press, true);
        if (source !== 0 && key !== undefined) input.keyboard?.holdKey(key);
        update();
        for (let i = 0; i < holdPolls; i += 1) update();
        if (source !== 1) pad.setButton(operation.press, false);
        if (source !== 0 && key !== undefined) input.keyboard?.keyup(key);
        update();
        scriptLog.push(`press:${operation.press}@${DELIVERY_SOURCE_NAMES[source]}:${holdPolls}`);
        continue;
      }
      throw new Error(`game runScripted rejects operation ${JSON.stringify(operation)}`);
    }
  };

  const events: string[] = [];
  bus.on('ui:navigate', () => events.push('ui:navigate'));
  bus.on('ui:confirm', () => events.push('ui:confirm'));
  bus.on('ui:back', () => events.push('ui:back'));
  let merged = 0;
  bus.on('weapon:merged', () => {
    merged += 1;
  });

  const destroy = () => {
    // Real GameScene.handleShutdown (registered above exactly as create()
    // does): removes the SHUTDOWN/DESTROY once-listeners and tears down the
    // composed real seam owners (upgradeChooser, pauseView, pauseController,
    // runSummaryView, inputController).
    scene.events.emit('shutdown');
    // controlsView and upgradeSystem are harness-owned (not GameScene seams),
    // so handleShutdown cannot reach them.
    controlsView.destroy();
    upgradeSystem.destroy();
  };

  return {
    seams,
    input,
    pad,
    press,
    runScripted,
    schedulerDraws: () => schedulerDrawCount,
    scriptedLog: () => scriptLog,
    productionRngDraws: () => productionRngDrawCount,
    update,
    pointerCalls,
    bus,
    events,
    scene,
    context,
    runState,
    pauseController,
    inventory,
    instance,
    upgradeChooser,
    upgradeSystem,
    pauseView,
    runSummaryView,
    controlsView,
    inputController,
    storage,
    storageKey,
    writeCount,
    shake: fake.shake,
    shakeEffectReset: fake.shakeEffectReset,
    tweenAdds: fake.tweenAdds,
    destroy,
    get merged() {
      return merged;
    },
  };
}

/** Live modal button rectangles (pointer-up targets) in creation order. */
export function liveModalButtons(scene: FakeScene) {
  return scene.objects.filter(
    (object) =>
      object.state.kind === 'rect' && object.state.handlers['pointerup'] && !object.state.destroyed,
  );
}

/** Rects currently carrying the EXACT FocusStroke ring (width+color+alpha). */
export function focusRingTargets(scene: FakeScene) {
  return scene.objects.filter(
    (object) =>
      object.state.kind === 'rect' &&
      !object.state.destroyed &&
      object.state.strokeWidth === FocusStroke.width &&
      object.state.strokeColor === FocusStroke.color &&
      object.state.strokeAlpha === FocusStroke.alpha,
  );
}

/** Focused target index among every pointer-over-registered rack target
 *  (slots 0..capacity-1, Merge, Back) — the ring is the exact FocusStroke
 *  (width/color/alpha; a wrong thickness fails the find). */
export function focusedTargetIndex(scene: FakeScene): number {
  const targets = scene.objects.filter(
    (object) =>
      object.state.kind === 'rect' &&
      object.state.handlers['pointerover'] &&
      !object.state.destroyed,
  );
  return targets.findIndex(
    (target) =>
      target.state.strokeWidth === FocusStroke.width &&
      target.state.strokeColor === FocusStroke.color &&
      target.state.strokeAlpha === FocusStroke.alpha,
  );
}

export function focusedButtonIndex(scene: FakeScene): number {
  return liveModalButtons(scene).findIndex(
    (button) =>
      button.state.strokeWidth === FocusStroke.width &&
      button.state.strokeColor === FocusStroke.color &&
      button.state.strokeAlpha === FocusStroke.alpha,
  );
}

/** Per-step scene-command counts for exact start/restart DELTA assertions
 *  (round-3 finding F3): navigation must never trigger a scene transition
 *  except the three genuine ones (Game start step 5, Retry restart step 13,
 *  Menu start step 14). */
export function sceneCommands(scene: FakeScene): { start: number; restart: number } {
  return {
    start: scene.scene.start.mock.calls.length,
    restart: scene.scene.restart.mock.calls.length,
  };
}

export function expectSceneDeltas(
  before: { start: number; restart: number },
  scene: FakeScene,
  phase: string,
  expected: { start?: number; restart?: number } = {},
): { start: number; restart: number } {
  const after = sceneCommands(scene);
  expect(after.start - before.start, `${phase}: scene.start delta`).toBe(expected.start ?? 0);
  expect(after.restart - before.restart, `${phase}: scene.restart delta`).toBe(expected.restart ?? 0);
  return after;
}
