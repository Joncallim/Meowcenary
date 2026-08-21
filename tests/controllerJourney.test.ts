import { describe, expect, it, vi } from 'vitest';
import { MockGamepad, MockInputPlugin } from './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { MenuScene } from '../src/scenes/MenuScene';
import { InputController, type GameAction } from '../src/systems/input';
import { createRunState, endRun, startRun } from '../src/gameplay/runState';
import { createWeaponInstance, type WeaponInstance } from '../src/gameplay/weapons';
import { createEventBus } from '../src/engine/eventBus';
import { createGameContext, GAME_CONTEXT_REGISTRY_KEY } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { SceneKey } from '../src/engine/sceneKeys';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { InventoryController } from '../src/ui/inventory';
import { PauseController, PhaserPauseView } from '../src/ui/pause';
import {
  PhaserRunSummaryView,
  RunSummaryController,
} from '../src/ui/runSummary';
import { UpgradeSystem } from '../src/systems/UpgradeSystem';
import { UpgradeChooser } from '../src/ui/UpgradeChooser';
import { logicalCanvasViewport } from '../src/ui/layout';
import { FocusStroke } from '../src/ui/theme';
import { AUDIO_MANAGER_REGISTRY_KEY } from '../src/systems/audio';

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

function createMenuPhase() {
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
  return { menuScene, scene, input, pad, press, pointerCalls, textContents, sceneStart: scene.scene.start, bus, events };
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

function createGamePhase(seed = 7) {
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

describe('headless production controller journey', () => {
  it('walks menu → run → level-up → pause → rack merge → summary across real owners with zero pointer input', () => {
    // ------------------------------------------------------------------
    // Phase A: Menu (brief steps 1-5) through the real MenuScene.
    // ------------------------------------------------------------------
    const menu = createMenuPhase();
    const menuSnapshot = () =>
      (menu.menuScene as unknown as {
        controller: { snapshot: () => import('../src/ui/menus').MainMenuSnapshot };
      }).controller.snapshot();

    // 1. Menu home: navDown, confirm → Character.
    menu.press(13);
    expect(menu.events).toEqual(['ui:navigate']);
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    menu.press(0);
    expect(menu.events).toEqual(['ui:navigate', 'ui:confirm']);
    expect(menu.textContents()).toContain('Choose Character');
    expect(menuSnapshot().panel).toBe('character');
    expect(menu.sceneStart).not.toHaveBeenCalled();
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 1');

    // 2. Character: confirm the visible default (already-selected is a
    //    successful no-op), then back → Home.
    menu.press(0);
    expect(menu.events).toEqual(['ui:navigate', 'ui:confirm', 'ui:confirm']);
    expect(menu.textContents()).toContain('Choose Character');
    expect(menuSnapshot().panel).toBe('character');
    menu.press(1);
    expect(menu.events).toEqual(['ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back']);
    expect(menu.textContents()).toContain('Start');
    expect(menuSnapshot().panel).toBe('home');
    expect(menu.sceneStart).not.toHaveBeenCalled();
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 2');

    // 3. Home (panel reset): navDown, navDown, confirm → Arena.
    menu.press(13);
    menu.press(13);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate',
    ]);
    menu.press(0);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm',
    ]);
    expect(menu.textContents()).toContain('Choose Arena');
    expect(menuSnapshot().panel).toBe('arena');
    expect(menu.sceneStart).not.toHaveBeenCalled();
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 3');

    // 4. Arena: confirm the visible default, then back → Home.
    menu.press(0);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm', 'ui:confirm',
    ]);
    expect(menu.textContents()).toContain('Choose Arena');
    expect(menuSnapshot().panel).toBe('arena');
    menu.press(1);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back',
    ]);
    expect(menu.textContents()).toContain('Start');
    expect(menuSnapshot().panel).toBe('home');
    expect(menu.sceneStart).not.toHaveBeenCalled();
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 4');

    // 5. Home (panel reset): confirm → exactly one Game scene start.
    menu.press(0);
    expect(menu.events).toEqual([
      'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm', 'ui:confirm', 'ui:back', 'ui:confirm',
    ]);
    expect(menu.sceneStart).toHaveBeenCalledTimes(1);
    expect(menu.sceneStart).toHaveBeenCalledWith(SceneKey.Game);
    expect(focusRingTargets(menu.scene)).toHaveLength(1);
    assertZeroPointerCalls(menu.pointerCalls, 'menu step 5');

    // ------------------------------------------------------------------
    // Phase B: Game (brief steps 6-13) through real owners and the real
    // GameScene.routeAction.
    // ------------------------------------------------------------------
    const game = createGamePhase();
    const scenePlugin = game.scene.scene;

    // 6. A real level:up through UpgradeSystem/UpgradeChooser. The level-up
    //    chooser row is inside the pointer-free journey.
    game.bus.emit('level:up', { level: 2 });
    expect(game.runState.status).toBe('paused');
    expect(game.runState.pauseReason).toBe('levelUp');
    expect(game.events).toEqual([]);
    const focusedCards = () =>
      game.upgradeChooser.diagnostics.cards.map((card) => card.focused);
    expect(focusedCards()).toEqual([true, false, false]);
    const offeredIds = game.upgradeChooser.diagnostics.choiceIds;
    expect(offeredIds).toHaveLength(3);
    // Pointer presentation initially: no card carries the actual ring.
    const chooserCards = () =>
      game.scene.objects.filter(
        (object) =>
          object.state.kind === 'rect' &&
          object.state.handlers['pointerover'] &&
          !object.state.destroyed,
      );
    const ringedCardIndex = () =>
      chooserCards().findIndex(
        (card) =>
          card.state.strokeWidth === FocusStroke.width &&
          card.state.strokeColor === FocusStroke.color &&
          card.state.strokeAlpha === FocusStroke.alpha,
      );
    expect(ringedCardIndex()).toBe(-1);

    // navRight focuses the second card (exactly one ui:navigate): the ring is
    // the ACTUAL rendered FocusStroke on the second card, not just logical
    // diagnostics, and the exact run snapshot is unchanged.
    game.press(15);
    expect(game.events).toEqual(['ui:navigate']);
    expect(focusedCards()).toEqual([false, true, false]);
    expect(ringedCardIndex()).toBe(1);
    expect(chooserCards()[1]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(chooserCards()[1]!.state.strokeColor).toBe(FocusStroke.color);
    expect(chooserCards()[1]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(chooserCards()[0]!.state.strokeColor).not.toBe(FocusStroke.color);
    expect(scenePlugin.start).not.toHaveBeenCalled();
    expect(scenePlugin.restart).not.toHaveBeenCalled();

    // confirm chooses exactly the focused offer token and returns to active
    // play; the authoritative run snapshot reflects the accepted choice. The
    // accepted choice audio is card:chosen — no ui:confirm is emitted.
    game.press(0);
    expect(game.events).toEqual(['ui:navigate']);
    expect(game.runState.status).toBe('active');
    expect(game.runState.upgradeStacks[offeredIds[1]!]).toBe(1);
    expect(game.upgradeChooser.diagnostics.choiceIds).toEqual([]);
    assertZeroPointerCalls(game.pointerCalls, 'chooser step 6');

    // 7. Pause (position 9) → manual pause panel with Resume focused.
    game.press(9);
    expect(game.events).toEqual(['ui:navigate', 'ui:confirm']);
    expect(game.runState.status).toBe('paused');
    expect(game.runState.pauseReason).toBe('manual');
    expect(game.pauseController.snapshot().panel).toBe('pause');
    expect(focusedButtonIndex(game.scene)).toBe(0);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    assertZeroPointerCalls(game.pointerCalls, 'pause entry step 7');

    // 8. navDown, confirm → Weapon Rack (one ui:navigate, one ui:confirm).
    const beforeRack = game.events.length;
    game.press(13);
    game.press(0);
    expect(game.pauseController.snapshot().panel).toBe('inventory');
    expect(game.events.slice(beforeRack)).toEqual(['ui:navigate', 'ui:confirm']);
    // Genuine rack entry resets to the first occupied slot.
    expect(focusedTargetIndex(game.scene)).toBe(0);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    expect(scenePlugin.start).not.toHaveBeenCalled();
    expect(scenePlugin.restart).not.toHaveBeenCalled();
    assertZeroPointerCalls(game.pointerCalls, 'rack entry step 8');

    // 9. Rack: confirm slot 0; navRight, confirm slot 1. The preview exists
    //    and focus remains slot 1 after both same-inventory rerenders.
    const beforeSlot0 = game.events.length;
    game.press(0);
    expect(game.events.slice(beforeSlot0)).toEqual(['ui:navigate']);
    expect(game.inventory.snapshot().selectedInstanceIds).toEqual(['a']);
    expect(focusedTargetIndex(game.scene)).toBe(0);
    const beforeSlot1 = game.events.length;
    game.press(15);
    game.press(0);
    expect(game.events.slice(beforeSlot1)).toEqual(['ui:navigate', 'ui:navigate']);
    expect(game.inventory.snapshot().selectedInstanceIds).toEqual(['a', 'b']);
    expect(game.inventory.snapshot().preview?.result.definitionId).toBe('scrap-pistol-t2');
    expect(focusedTargetIndex(game.scene)).toBe(1);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    assertZeroPointerCalls(game.pointerCalls, 'rack selection step 9');

    // 10. Portrait grid (count=8, C=2): from i=1 the path is exactly
    //     [1, 3, 5, 7, 6] — Down, Down, Down (last-row clamp to Back), Left.
    const path: number[] = [];
    game.press(13);
    path.push(focusedTargetIndex(game.scene));
    game.press(13);
    path.push(focusedTargetIndex(game.scene));
    game.press(13);
    path.push(focusedTargetIndex(game.scene));
    game.press(14);
    path.push(focusedTargetIndex(game.scene));
    expect([1, ...path]).toEqual([1, 3, 5, 7, 6]);
    expect(game.events.slice(beforeSlot1)).toEqual([
      'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate',
    ]);

    // Confirm on Merge: exactly one weapon:merged, one ui:confirm, one T2
    // weapon, and focus stays Merge i=6 (preservation, not a count clamp).
    const mergesBefore = game.merged;
    const eventsBeforeMerge = game.events.length;
    game.press(0);
    expect(game.merged).toBe(mergesBefore + 1);
    expect(game.events.slice(eventsBeforeMerge)).toEqual(['ui:confirm']);
    expect(game.runState.equipped).toHaveLength(1);
    expect(game.runState.equipped[0]?.tier).toBe(2);
    expect(focusedTargetIndex(game.scene)).toBe(6);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    assertZeroPointerCalls(game.pointerCalls, 'rack merge step 10');

    // 11. back → Pause (selection cleared / panel walk preserved), back →
    //     active run.
    game.press(1);
    expect(game.pauseController.snapshot().panel).toBe('pause');
    expect(game.inventory.snapshot().selectedInstanceIds).toEqual([]);
    expect(focusedButtonIndex(game.scene)).toBe(0);
    game.press(1);
    expect(game.pauseController.snapshot().panel).toBe('closed');
    expect(game.runState.status).toBe('active');
    expect(game.events.slice(eventsBeforeMerge)).toEqual(['ui:confirm', 'ui:back', 'ui:back']);
    expect(scenePlugin.start).not.toHaveBeenCalled();
    expect(scenePlugin.restart).not.toHaveBeenCalled();
    assertZeroPointerCalls(game.pointerCalls, 'back walk step 11');

    // 12. End the run: the terminal listener renders the summary with Retry
    //     focused. Back, Pause, and Inventory each leave it unchanged.
    endRun(game.runState, 'won', game.bus);
    expect(game.runState.status).toBe('won');
    expect(game.runSummaryView.visible).toBe(true);
    expect(focusedButtonIndex(game.scene)).toBe(0);
    expect(focusRingTargets(game.scene)).toHaveLength(1);
    const eventsBeforeTerminal = game.events.length;
    game.press(1); // back — the deliberate terminal no-op
    game.press(9); // pause — discarded
    game.press(3); // inventory — discarded
    expect(game.events.length).toBe(eventsBeforeTerminal);
    expect(focusedButtonIndex(game.scene)).toBe(0);
    expect(scenePlugin.restart).not.toHaveBeenCalled();
    expect(scenePlugin.start).not.toHaveBeenCalled();
    assertZeroPointerCalls(game.pointerCalls, 'terminal discarded edges step 12');

    // 13. Retry branch: confirm → exactly one scene restart.
    const eventsBeforeRetry = game.events.length;
    game.press(0);
    expect(game.events.slice(eventsBeforeRetry)).toEqual(['ui:confirm']);
    expect(scenePlugin.restart).toHaveBeenCalledTimes(1);
    expect(scenePlugin.start).not.toHaveBeenCalled();
    assertZeroPointerCalls(game.pointerCalls, 'retry branch step 13');

    // ------------------------------------------------------------------
    // Phase C: fresh terminal fixture for the alternate branch (step 14).
    // ------------------------------------------------------------------
    const fresh = createGamePhase(11);
    endRun(fresh.runState, 'lost', fresh.bus);
    expect(fresh.runSummaryView.visible).toBe(true);
    // Flip the presentation mode with a deliberate terminal no-op (Back is
    // discarded in the terminal row) — the Retry ring then appears.
    fresh.press(1);
    expect(focusedButtonIndex(fresh.scene)).toBe(0);
    expect(focusRingTargets(fresh.scene)).toHaveLength(1);

    // navDown → Main Menu, confirm → exactly one Menu scene start.
    const beforeMenu = fresh.events.length;
    fresh.press(13);
    expect(fresh.events.slice(beforeMenu)).toEqual(['ui:navigate']);
    expect(focusedButtonIndex(fresh.scene)).toBe(1);
    fresh.press(0);
    expect(fresh.events.slice(beforeMenu)).toEqual(['ui:navigate', 'ui:confirm']);
    expect(fresh.scene.scene.start).toHaveBeenCalledTimes(1);
    expect(fresh.scene.scene.start).toHaveBeenCalledWith(SceneKey.Menu);
    expect(fresh.scene.scene.restart).not.toHaveBeenCalled();
    assertZeroPointerCalls(fresh.pointerCalls, 'main menu branch step 14');
  });
});
