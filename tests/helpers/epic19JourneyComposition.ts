// @ts-nocheck
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
import { createRng } from '../../src/engine/rng';
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
    style: {},
  };
  // Real Phaser Text default padding is zero on all sides (TextStyle.js
  // initializes `this.padding = { left: 0, right: 0, top: 0, bottom: 0 }`).
  const padding = { left: 0, top: 0, right: 0, bottom: 0 };
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
      return api;
    },
    setScrollFactor() {
      return api;
    },
    setDepth() {
      return api;
    },
    setAlpha(alpha: number) {
      state.alpha = alpha;
      return api;
    },
    setPosition(x: number, y: number) {
      state.x = x;
      state.y = y;
      return api;
    },
    setRadius(radius: number) {
      state.radius = radius;
      return api;
    },
    setActive() {
      return api;
    },
    setVisible() {
      return api;
    },
    setStyle(style: Record<string, unknown>) {
      state.style = { ...state.style, ...style };
      return api;
    },
    setText(text: string) {
      state.text = text;
      return api;
    },
    setStrokeStyle(width: number, color: number, alpha: number) {
      state.strokeWidth = width;
      state.strokeColor = color;
      state.strokeAlpha = alpha;
      return api;
    },
    setFillStyle(_color: number, _alpha = 1) {
      return api;
    },
    setPadding(left?: number, top?: number, right?: number, bottom?: number) {
      if (left !== undefined) padding.left = left;
      if (top !== undefined) padding.top = top;
      if (right !== undefined) padding.right = right;
      if (bottom !== undefined) padding.bottom = bottom;
      return api;
    },
    setMaxLines() {
      return api;
    },
    setWordWrapWidth() {
      return api;
    },
    setFixedSize() {
      return api;
    },
    setCrop() {
      return api;
    },
    setScale() {
      return api;
    },
    setInteractive() {
      state.interactive = true;
      return api;
    },
    disableInteractive() {
      state.interactive = false;
      return api;
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      state.handlers = { ...state.handlers, [event]: handler };
      return api;
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      const handlers = { ...state.handlers };
      if (handlers[event] === handler) {
        delete handlers[event];
      }
      state.handlers = handlers;
      return api;
    },
    emit(event: string, ...args: unknown[]) {
      state.handlers[event]?.(...args);
    },
    destroy() {
      state.destroyed = true;
    },
    getBounds() {
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
      text(x: number, y: number, text: string) {
        return register(fakeObject('text', text, Math.max(24, text.length * 8), 16, x, y));
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

function assertZeroPointerCalls(
  pointerCalls: ReturnType<typeof createPointerSpies>,
  phase: string,
) {
  expect(pointerCalls.down, `${phase}: pointerDown must stay at zero`).not.toHaveBeenCalled();
  expect(pointerCalls.move, `${phase}: pointerMove must stay at zero`).not.toHaveBeenCalled();
  expect(pointerCalls.up, `${phase}: pointerUp must stay at zero`).not.toHaveBeenCalled();
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
  };
}

// --- Menu phase: real MenuScene + real MainMenuController + real InputController ---

export interface MenuPhaseOptions {
  readonly storageKey: string;
  readonly fixtureSeed: number;
}

export interface MenuPhaseResult {
  menuScene: MenuScene;
  menuController: import('../../src/ui/menus').MainMenuController;
  inputController: InputController;
  scene: FakeScene;
  input: MockInputPlugin;
  pad: MockGamepad;
  press: (position: number) => void;
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
  void fixtureSeed; // fixture identity only — never consumed as RNG.
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
    menuScene, menuController, inputController, scene, input, pad, press, pointerCalls,
    textContents, sceneStart: scene.scene.start, sceneRestart: scene.scene.restart,
    bus, events, context, storage, storageKey, writeCount,
    tweens: fake.tweens, tweenAdds: fake.tweenAdds, destroy,
  };
}

// --- Game phase: real owners/views + GameScene.routeAction through one cast ---

export interface GamePhaseOptions {
  readonly runSeed: number;
  readonly storageKey: string;
  readonly fixtureSeed: number;
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
  void fixtureSeed; // fixture identity only — never consumed as RNG.
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
  const upgradeSystem = new UpgradeSystem({
    runState,
    bus,
    definitions: context.data.upgrades,
    rng: createRng(runSeed + 1),
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

  const events: string[] = [];
  bus.on('ui:navigate', () => events.push('ui:navigate'));
  bus.on('ui:confirm', () => events.push('ui:confirm'));
  bus.on('ui:back', () => events.push('ui:back'));
  let merged = 0;
  bus.on('weapon:merged', () => {
    merged += 1;
  });

  const destroy = () => {
    upgradeChooser.destroy();
    controlsView.destroy();
    pauseView.destroy();
    runSummaryView.destroy();
    upgradeSystem.destroy();
    inputController.destroy();
  };

  return {
    seams,
    input,
    pad,
    press,
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
