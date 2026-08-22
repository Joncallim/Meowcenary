// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { MockGamepad, MockInputPlugin } from '../__mocks__/phaser';
import { GameScene } from '../../src/scenes/GameScene';
import { MenuScene } from '../../src/scenes/MenuScene';
import { InputController, type GameAction } from '../../src/systems/input';
import { createRunState, endRun, startRun } from '../../src/gameplay/runState';
import { createWeaponInstance, type WeaponInstance } from '../../src/gameplay/weapons';
import { createEventBus } from '../../src/engine/eventBus';
import { createGameContext, GAME_CONTEXT_REGISTRY_KEY } from '../../src/engine/context';
import { createRng } from '../../src/engine/rng';
import { SceneKey } from '../../src/engine/sceneKeys';
import { DataCharacterRegistry } from '../../src/systems/characters';
import { DataArenaRegistry } from '../../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../../src/systems/metaUpgrades';
import { DataWeaponRegistry } from '../../src/systems/weaponRegistry';
import { MemoryStorageAdapter, SaveManager } from '../../src/systems/save';
import { loadGameData } from '../../src/systems/validation';
import { InventoryController } from '../../src/ui/inventory';
import { PauseController, PhaserPauseView } from '../../src/ui/pause';
import {
  PhaserRunSummaryView,
  RunSummaryController,
} from '../../src/ui/runSummary';
import { UpgradeSystem } from '../../src/systems/UpgradeSystem';
import { UpgradeChooser } from '../../src/ui/UpgradeChooser';
import { logicalCanvasViewport } from '../../src/ui/layout';
import { FocusStroke } from '../../src/ui/theme';
import { AUDIO_MANAGER_REGISTRY_KEY } from '../../src/systems/audio';

// ---------------------------------------------------------------------------
// F8: the mandatory controller journey is a production-composition harness.
// Real InputController + MockInputPlugin gamepad, real menu/pause/inventory/
// summary command owners and view seams, the real UpgradeSystem/UpgradeChooser
// and the actual private GameScene.routeAction through one typed test cast.
// MockInputPlugin supplies input, not the display tree — the display comes
// from one minimal fake Scene (per-view fake factories composed together).
// ---------------------------------------------------------------------------

interface FakeObjectState {
  kind: 'container' | 'text' | 'rect';
  text: string;
  width: number;
  height: number;
  interactive: boolean;
  destroyed: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
  strokeWidth: number;
  strokeColor?: number;
  strokeAlpha: number;
  style: Record<string, unknown>;
}

type FakeObject = ReturnType<typeof fakeObject>;

function fakeObject(
  kind: FakeObjectState['kind'],
  text = '',
  width = 0,
  height = 0,
) {
  const state: FakeObjectState = {
    kind,
    text,
    width,
    height,
    interactive: false,
    destroyed: false,
    handlers: {},
    strokeWidth: 0,
    strokeColor: undefined,
    strokeAlpha: 0,
    style: {},
  };
  const padding = { left: 10, top: 8, right: 10, bottom: 8 };
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
    setOrigin() {
      return api;
    },
    setScrollFactor() {
      return api;
    },
    setDepth() {
      return api;
    },
    setAlpha() {
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
    emit(event: string, ...args: unknown[]) {
      state.handlers[event]?.(...args);
    },
    destroy() {
      state.destroyed = true;
    },
    getBounds() {
      return {
        x: 0,
        y: 0,
        centerX: 0,
        centerY: 0,
        width: state.width,
        height: state.height,
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
    Array<{ handler: () => void; context: unknown }>
  >();
  const scale = {
    width: 390,
    height: 844,
    displaySize: { width: 390, height: 844 },
    parentSize: { width: 390, height: 844 },
    on(event: string, handler: () => void, context?: unknown): void {
      const list = scaleListeners.get(event) ?? [];
      list.push({ handler, context });
      scaleListeners.set(event, list);
    },
    off(event: string, handler: () => void, context?: unknown): void {
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
  };

  const scenePlugin = { start: vi.fn(), restart: vi.fn() };
  const audioFake = { playMusic: vi.fn(), update: vi.fn(), unlock: vi.fn(), destroy: vi.fn() };

  const scene = {
    input,
    scale,
    events: lifecycle,
    scene: scenePlugin,
    registry: {
      get: (key: string) => {
        if (key === GAME_CONTEXT_REGISTRY_KEY) return context;
        if (key === AUDIO_MANAGER_REGISTRY_KEY) return audioFake;
        return undefined;
      },
    },
    add: {
      container(_x: number, _y: number) {
        const base = fakeObject('container');
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
      text(_x: number, _y: number, text: string) {
        return register(fakeObject('text', text, Math.max(24, text.length * 8), 16));
      },
      rectangle(_x: number, _y: number, width: number, height: number) {
        return register(fakeObject('rect', '', width, height));
      },
    },
    get objects() {
      return objects;
    },
  };
  return scene;
}

function createBrandedContext(
  bus: ReturnType<typeof createEventBus>,
  storageKey: string,
) {
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  return createGameContext({
    bus,
    menuRng: createRng(1),
    data,
    metaUpgrades,
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), storageKey, metaUpgrades.maxLevels()),
  });
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

// --- Menu phase: real MenuScene + real MainMenuController + real InputController ---

export function createMenuPhase() {
  const bus = createEventBus();
  const context = createBrandedContext(bus, 'controller-journey-menu');
  const input = new MockInputPlugin({ keyboard: true, gamepad: true });
  const pad = new MockGamepad();
  input.gamepad!.connect(pad);
  const scene = createFakeScene(input, context);
  const menuScene = new MenuScene();
  Object.assign(menuScene, scene);
  menuScene.create();

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
  return { menuScene, scene, input, pad, press, pointerCalls, textContents, sceneStart: scene.scene.start, sceneRestart: scene.scene.restart, bus, events, context };
}

// --- Game phase: real owners/views + GameScene.routeAction through one cast ---

type GameSeams = {
  runState: ReturnType<typeof createRunState>;
  inputController: InputController;
  pauseController: PauseController;
  pauseView: PhaserPauseView;
  runSummaryView: PhaserRunSummaryView;
  upgradeChooser: UpgradeChooser;
  routeAction: (action: GameAction) => void;
};

export function createGamePhase(seed = 7) {
  const bus = createEventBus();
  const context = createBrandedContext(bus, `controller-journey-game-${seed}`);
  const input = new MockInputPlugin({ keyboard: true, gamepad: true });
  const pad = new MockGamepad();
  input.gamepad!.connect(pad);
  const scene = createFakeScene(input, context);
  const gameScene = new GameScene();
  Object.assign(gameScene, scene);

  const runState = createRunState({ seed, characterId: 'scrap-tabby', arenaId: 'arena' });
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
    rng: createRng(seed + 1),
    offerCount: 3,
  });
  const upgradeChooser = new UpgradeChooser(
    scene as never,
    bus,
    upgradeSystem,
    () => false,
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
  // source-aware refresh (allocation-free no-ops when the mode is unchanged).
  const update = (delta = 16) => {
    inputController.update(delta);
    pauseView.refreshInputPresentation();
    runSummaryView.refreshInputPresentation();
    upgradeChooser.refreshInputPresentation();
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
    get merged() {
      return merged;
    },
  };
}

/** Live modal button rectangles (pointer-up targets) in creation order. */
function liveModalButtons(scene: ReturnType<typeof createFakeScene>) {
  return scene.objects.filter(
    (object) =>
      object.state.kind === 'rect' && object.state.handlers['pointerup'] && !object.state.destroyed,
  );
}

/** Rects currently carrying the EXACT FocusStroke ring (width+color+alpha). */
function focusRingTargets(scene: ReturnType<typeof createFakeScene>) {
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
function focusedTargetIndex(scene: ReturnType<typeof createFakeScene>): number {
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

function focusedButtonIndex(scene: ReturnType<typeof createFakeScene>): number {
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
function sceneCommands(scene: ReturnType<typeof createFakeScene>): { start: number; restart: number } {
  return {
    start: scene.scene.start.mock.calls.length,
    restart: scene.scene.restart.mock.calls.length,
  };
}

function expectSceneDeltas(
  before: { start: number; restart: number },
  scene: ReturnType<typeof createFakeScene>,
  phase: string,
  expected: { start?: number; restart?: number } = {},
): { start: number; restart: number } {
  const after = sceneCommands(scene);
  expect(after.start - before.start, `${phase}: scene.start delta`).toBe(expected.start ?? 0);
  expect(after.restart - before.restart, `${phase}: scene.restart delta`).toBe(expected.restart ?? 0);
  return after;
}

