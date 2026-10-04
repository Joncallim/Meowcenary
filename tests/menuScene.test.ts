import { describe, expect, it, vi } from 'vitest';
// Must precede any import whose transitive dependencies resolve Phaser at module
// evaluation time. The mock registration in __mocks__/phaser is a side-effectful
// import; ordering it first guarantees the mock is installed before the real
// Phaser module is ever requested.
import { MockGamepad, MockInputPlugin } from './__mocks__/phaser';
import { GAME_CONTEXT_REGISTRY_KEY, createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { MenuScene } from '../src/scenes/MenuScene';
import { AUDIO_MANAGER_REGISTRY_KEY } from '../src/systems/audio';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { loadGameData } from '../src/systems/validation';
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
  visible: boolean;
  destroyed: boolean;
  handlers: Record<string, (...args: unknown[]) => void>;
  mask?: unknown;
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
    visible: true,
    destroyed: false,
    handlers: {},
    mask: undefined,
    padding: { ...padding },
    strokeWidth: 0,
    strokeColor: undefined,
    strokeAlpha: 0,
    style: {},
  };
  let parentContainer: { remove(child: unknown): unknown } | undefined;
  const api = {
    get parentContainer() { return parentContainer; },
    set parentContainer(value: { remove(child: unknown): unknown } | undefined) { parentContainer = value; },
    get style() { return { ...state.style }; },
    get state() {
      return { ...state, handlers: { ...state.handlers }, padding: { ...state.padding }, style: { ...state.style } };
    },
    get text() {
      return state.kind === 'text' ? state.text : undefined;
    },
    get width() {
      return state.width;
    },
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
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
      return {
        x: state.x,
        y: state.y,
        left: state.x,
        top: state.y,
        right: state.x + state.width,
        bottom: state.y + state.height,
        centerX: state.x + state.width / 2,
        centerY: state.y + state.height / 2,
        width: state.width,
        height: state.height,
      };
    },
    setInteractive() {
      state.interactive = true;
      return api;
    },
    disableInteractive() {
      state.interactive = false;
      return api;
    },
    setVisible(visible: boolean) {
      state.visible = visible;
      return api;
    },
    setMask(mask: unknown) {
      state.mask = mask;
      return api;
    },
    clearMask() {
      state.mask = undefined;
      return api;
    },
    setPosition(x: number, y: number) {
      state.x = x;
      state.y = y;
      return api;
    },
    setFixedSize(width: number, height: number) {
      state.width = width;
      state.height = height;
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
      parentContainer?.remove(api);
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
    cache: { audio: { exists: () => true } },
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
          get parentContainer() { return base.parentContainer; },
          set parentContainer(value: { remove(child: unknown): unknown } | undefined) { base.parentContainer = value; },
          children: [] as FakeObject[],
          get list(): FakeObject[] { return container.children; },
          moveTo(child: unknown, index: number) {
            const current = container.children.indexOf(child as FakeObject);
            if (current < 0) throw new Error('Cannot move an unowned child');
            container.children.splice(current, 1);
            container.children.splice(index, 0, child as FakeObject);
            return container;
          },
          remove(child: unknown) {
            const index = container.children.indexOf(child as FakeObject);
            if (index >= 0) container.children.splice(index, 1);
            (child as FakeObject).parentContainer = undefined;
            return container;
          },
          add(children: unknown) {
            const list = Array.isArray(children) ? children : [children];
            list.forEach((child) => {
              const object = register(child as FakeObject);
              if (!container.children.includes(object)) {
                object.parentContainer?.remove(object);
                object.parentContainer = container;
                container.children.push(object);
              }
            });
            return container;
          },
          destroy(deep = true) {
            if (deep) {
              [...container.children].forEach((child) => child.destroy());
            }
            container.parentContainer?.remove(container);
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
        style?: Record<string, unknown> & { padding?: { x?: number; y?: number; left?: number; right?: number; top?: number; bottom?: number }; resolution?: number },
      ) {
        if (failNextText) {
          failNextText = false;
          throw new Error('Injected text factory failure');
        }
        if (style?.resolution !== 2) throw new Error('UI text must use resolution 2');
        const padX = style?.padding?.x ?? 10;
        const padY = style?.padding?.y ?? 8;
        // Phaser Text bounds include the padding on both axes.
        const padding = { left: style?.padding?.left ?? padX, top: style?.padding?.top ?? padY,
          right: style?.padding?.right ?? padX, bottom: style?.padding?.bottom ?? padY };
        const object = fakeObject(
          'text',
          text,
          Math.max(24, text.length * 8),
          16 + padding.top + padding.bottom,
          padding,
          _x,
          _y,
        ).setStyle(style);
        return register(object);
      },
      rectangle(_x: number, _y: number, width: number, height: number) {
        return register(fakeObject('rect', '', width, height, { left: 10, top: 8, right: 10, bottom: 8 }, _x, _y));
      },
    },
    make: {
      graphics() {
        const mask = { destroyed: false, destroy() { this.destroyed = true; } };
        return {
          fillStyle() { return this; },
          fillRect() { return this; },
          createGeometryMask() { return mask; },
          destroy: vi.fn(),
        };
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
          !object.state.destroyed &&
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
  it('exposes the committed semantic focus key without running diagnostic or persistence work', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
      recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
    }, loadout: { helmet: 'commando' } }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      focusedButtonKey?: string;
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot;
        equipmentController: { snapshot(): import('../src/ui/equipmentController').EquipmentSnapshot } };
      focusables: FakeObject[];
      focusKeyByButton: Map<FakeObject, string>;
      navigator: { index: number };
      loadoutUiDiagnostics(): unknown;
    };
    const focusKey = () => scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!);
    const readKey = () => scene.focusedButtonKey;
    const snapshot = vi.spyOn(scene.controller, 'snapshot');
    const equipmentSnapshot = vi.spyOn(scene.controller.equipmentController, 'snapshot');
    const diagnostic = vi.spyOn(scene, 'loadoutUiDiagnostics');
    const saveMutation = vi.spyOn(harness.context, 'updateEquipment');
    const bounds = harness.objects.map(object => vi.spyOn(object, 'getBounds'));
    const saved = harness.context.saveData;
    const expectObservationOnly = (expected: string | undefined) => {
      expect(readKey()).toBe(expected);
      expect(snapshot).not.toHaveBeenCalled();
      expect(equipmentSnapshot).not.toHaveBeenCalled();
      expect(diagnostic).not.toHaveBeenCalled();
      expect(saveMutation).not.toHaveBeenCalled();
      expect(bounds.every(spy => spy.mock.calls.length === 0)).toBe(true);
      expect(harness.context.saveData).toBe(saved);
    };

    const initialKey = focusKey();
    expect(initialKey).toBe('equipment-slot:helmet');
    expectObservationOnly(initialKey);
    for (let move = 0; move < 2; move += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
      const nextKey = focusKey();
      expect(nextKey).toBeDefined();
      bounds.forEach(spy => spy.mockClear());
      snapshot.mockClear(); equipmentSnapshot.mockClear(); diagnostic.mockClear(); saveMutation.mockClear();
      expectObservationOnly(nextKey);
    }

    harness.lifecycle.emit('shutdown');
    expectObservationOnly(undefined);
  });

  it('resolves the lazy Equipment read model once per diagnostic and leaves other panels lazy', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
      recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
    }, loadout: { helmet: 'commando' } }));
    const scene = harness.menuScene as unknown as {
      controller: { open(panel: 'equipment' | 'home'): import('../src/ui/menus').MainMenuSnapshot;
        selectEquipmentCandidate(id: string): import('../src/ui/menus').MainMenuSnapshot;
        equipmentController: { snapshot(): import('../src/ui/equipmentController').EquipmentSnapshot } };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
    };
    scene.render(scene.controller.open('equipment'));
    scene.controller.selectEquipmentCandidate('recon');
    const snapshot = vi.spyOn(scene.controller.equipmentController, 'snapshot');
    const saved = harness.context.saveData;
    const state = harness.menuScene.loadoutUiDiagnostics();
    expect(snapshot).toHaveBeenCalledOnce();
    const resolved = snapshot.mock.results[0]!.value;
    expect(state.equipment).toEqual({ selectedSlot: resolved.selectedSlot,
      selectedInstanceId: resolved.selectedInstanceId, selectedBlueprintId: resolved.selectedBlueprintId,
      equipped: resolved.equipped });
    expect(state.equipment?.selectedInstanceId).toBe('recon');
    expect(harness.context.saveData).toBe(saved);
    scene.render(scene.controller.open('home'));
    snapshot.mockClear();
    expect(harness.menuScene.loadoutUiDiagnostics().equipment).toBeUndefined();
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('revokes old surface commands before controller mutation or UI events and retains panel-local browse state across visits', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { open(panel: 'home' | 'equipment' | 'gunsmith'): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
    };
    scene.render(scene.controller.open('equipment'));
    harness.buttonByLabel('BROWSE SETS')!.state.handlers.pointerup!();
    expect(harness.buttonByLabel('CLOSE SETS')).toBeDefined();
    scene.render(scene.controller.open('gunsmith'));
    const oldCreate = harness.buttonByLabel('Pistol Build')!.state.handlers.pointerup!;
    scene.render(scene.controller.open('home'));
    const before = harness.context.saveData;
    const events = vi.fn(); harness.bus.on('ui:confirm', events);
    oldCreate();
    expect(harness.context.saveData).toBe(before);
    expect(events).not.toHaveBeenCalled();
    expect(harness.menuScene.loadoutUiDiagnostics().panel).toBe('home');
    scene.render(scene.controller.open('equipment'));
    expect(harness.buttonByLabel('CLOSE SETS')).toBeDefined();
    harness.lifecycle.emit('shutdown');
    harness.menuScene.create({ initialPanel: 'equipment' });
    expect(harness.buttonByLabel('BROWSE SETS')).toBeDefined();
    expect(harness.buttonByLabel('CLOSE SETS')).toBeUndefined();
  });

  it('cleans a partially built mounted panel and recovers without retaining a live old surface', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { open(panel: 'gunsmith'): import('../src/ui/menus').MainMenuSnapshot; snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      committedDisplay: boolean;
      panelContentRoot?: FakeObject;
      addHeading: (...args: unknown[]) => FakeObject;
    };
    const addHeading = scene.addHeading.bind(scene);
    const fail = vi.spyOn(scene, 'addHeading').mockImplementationOnce((...args) => {
      addHeading(...args);
      throw new Error('partial mounted panel');
    });
    expect(() => scene.render(scene.controller.open('gunsmith'))).toThrow('partial mounted panel');
    expect(scene.committedDisplay).toBe(false);
    expect(scene.panelContentRoot).toBeUndefined();
    expect(harness.objects.filter(object => object.state.kind === 'container' && !object.state.destroyed)).toHaveLength(1);
    expect(harness.textContents()).toEqual(['Something went wrong — press Esc to retry']);
    fail.mockRestore();
    scene.render(scene.controller.snapshot());
    expect(scene.committedDisplay).toBe(true);
    expect(harness.buttonByLabel('Pistol Build')).toBeDefined();
    expect(harness.objects.filter(object => object.state.kind === 'container' && !object.state.destroyed)).toHaveLength(3);
  });

  it('hydrates only the current Equipment mount after leaving, changing selection, returning and resizing during art load', async () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
      recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
    }, loadout: {} }));
    const complete = new Map<string, () => void>(); const loaded = new Set<string>();
    const queued: string[] = [];
    const scene = harness.menuScene as unknown as {
      controller: { open(panel: 'home' | 'equipment'): import('../src/ui/menus').MainMenuSnapshot;
        selectEquipmentCandidate(id: string): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void; handleResize(): void;
      panelContentRoot?: FakeObject;
    };
    Object.assign(scene, {
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: { on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        atlas: (key: string) => { queued.push(key); }, start: () => undefined },
      ensurePanelPresentation: () => Promise.resolve(), ensureGunsmithPresentation: () => Promise.resolve(),
      addCatalogIcon: () => undefined, addPanelArt: () => undefined,
    });
    scene.render(scene.controller.open('equipment'));
    const oldRoot = scene.panelContentRoot!;
    await vi.waitFor(() => expect(queued).toEqual(['art-equipment-sets', 'art-equipment-commando']));
    harness.buttonByLabel('Recon Helmet\nT1 • STORED')!.state.handlers.pointerup!();
    expect(scene.panelContentRoot).toBe(oldRoot);
    expect(harness.menuScene.loadoutUiDiagnostics().equipment?.selectedInstanceId).toBe('recon');
    scene.render(scene.controller.open('home'));
    scene.controller.selectEquipmentCandidate('recon');
    scene.render(scene.controller.open('equipment'));
    scene.handleResize();
    const before = harness.menuScene.renderRebuildCount;
    for (const key of queued) { loaded.add(key); complete.get(`filecomplete-atlasjson-${key}`)!(); }
    await vi.waitFor(() => expect(harness.menuScene.renderRebuildCount).toBe(before + 1));
    const current = harness.menuScene.loadoutUiDiagnostics();
    expect(current.panel).toBe('equipment');
    expect(current.equipment?.selectedInstanceId).toBe('recon');
    expect(current.copy.join('\n')).toContain('Recon Helmet • T1');
    expect(oldRoot.state.destroyed).toBe(true);
    expect(scene.panelContentRoot).not.toBe(oldRoot);
    expect(scene.panelContentRoot?.state.destroyed).toBe(false);
    expect(queued).toHaveLength(2);
  });

  it.each(['current mount', 'returned and resized mount', 'authoritative save changed', 'scene shutdown', 'cached-only queued save change'] as const)('handles late Loadout equipment art at the current mount boundary: %s', async scenario => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
    }, loadout: { helmet: 'commando' } }));
    const complete = new Map<string, () => void>();
    const queued: string[] = [];
    let loadError: ((file: { key?: string }) => void) | undefined;
    let ready = false;
    const images: Array<FakeObject & { textureKey: string; frameKey?: string | number; alpha: number }> = [];
    const scene = harness.menuScene as unknown as {
      controller: { open(panel: 'loadout' | 'home'): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void; handleResize(): void;
      root?: FakeObject; panelContentRoot?: FakeObject;
      equipmentArtLoading: boolean;
      ensureEquipmentPresentation(ids: readonly string[]): Promise<void>;
      add: { image?: (x: number, y: number, key: string, frame?: string | number) => unknown };
      scrollRegion: { scrollOffset: number }; applyScrollViewport(): void;
    };
    scene.add.image = (x, y, key, frame) => {
      const base = fakeObject('rect', '', 16, 16, undefined, x, y);
      const image = Object.assign(base, {
        textureKey: key, frameKey: frame, alpha: 1, scene: harness.menuScene,
        setTexture(textureKey: string, frameKey?: string | number) {
          if (base.state.destroyed) throw new Error('Rebound destroyed Loadout art');
          image.textureKey = textureKey; image.frameKey = frameKey; return image;
        },
        setDisplaySize(width: number, height: number) { base.setFixedSize(width, height); return image; },
        setScale(scale: number) { base.setFixedSize(16 * scale, 16 * scale); return image; },
        setAlpha(alpha: number) { image.alpha = alpha; return image; },
      });
      images.push(image);
      harness.objects.push(image);
      return image;
    };
    Object.assign(scene, {
      textures: { exists: (key: string) => key !== 'art-equipment-commando' || ready,
        get: () => ({ setFilter: () => undefined }) },
      load: { on: (event: string, listener: (file: { key?: string }) => void) => { if (event === 'loaderror') loadError = listener; }, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        atlas: (key: string) => { queued.push(key); }, start: () => undefined },
      // Generic/chassis art is cached. Isolate the real Equipment closure.
      ensurePanelPresentation: () => Promise.resolve(), ensureGunsmithPresentation: () => Promise.resolve(),
    });
    const ensureEquipment = scene.ensureEquipmentPresentation.bind(scene);
    if (scenario === 'cached-only queued save change') scene.ensureEquipmentPresentation = () => Promise.resolve();
    scene.render(scene.controller.open('loadout'));
    if (scenario === 'cached-only queued save change') {
      scene.ensureEquipmentPresentation = ensureEquipment;
      void ensureEquipment(['equipment-icon:commando-helmet']);
      await ensureEquipment(['equipment-set-icon:recon']); // Different, already cached physical atlas.
    }
    await vi.waitFor(() => expect(queued).toEqual(['art-equipment-commando']));
    const obsoleteImages = images.slice();
    if (scenario === 'returned and resized mount') {
      scene.render(scene.controller.open('home'));
      scene.render(scene.controller.open('loadout'));
      scene.handleResize();
    }
    const root = scene.root!; const content = scene.panelContentRoot!;
    const button = harness.buttonByLabel('HELMET\nT1 • Fitted')!;
    const command = button.state.handlers.pointerup;
    harness.input.emit('wheel', { isDown: false }, [], 0, 120);
    const controls = harness.menuScene.loadoutUiDiagnostics().buttons;
    const scrollOffset = scene.scrollRegion.scrollOffset;
    const before = harness.menuScene.renderRebuildCount;
    const revision = harness.menuScene.renderRevisionCount;
    const saved = structuredClone(harness.context.saveData);
    const imageCount = images.length;
    const slot = images.find(image => !image.state.destroyed && image.textureKey === '__DEFAULT');
    const geometry = slot && { x: slot.x, y: slot.y, width: slot.width, height: slot.height, mask: slot.state.mask, visible: slot.state.visible };
    if (scenario === 'scene shutdown') harness.lifecycle.emit('shutdown');
    if (scenario === 'authoritative save changed' || scenario === 'cached-only queued save change') {
      harness.context.updateEquipment(({ equipment, loadout }) => ({
        equipment: { ...equipment, commando: { equipmentId: 'equipment:commando-helmet', tier: 2 } }, loadout,
      }));
    }
    if (scenario === 'cached-only queued save change') loadError!({ key: 'art-equipment-commando' });
    else { ready = true; complete.get('filecomplete-atlasjson-art-equipment-commando')!(); }
    await vi.waitFor(() => expect(scene.equipmentArtLoading).toBe(false));
    if (scenario === 'scene shutdown') {
      expect(scene.root).toBeUndefined();
      expect(root.state.destroyed).toBe(true);
      expect(harness.menuScene.renderRebuildCount).toBe(before);
      expect(harness.context.saveData).toEqual(saved);
      expect(slot!.state.destroyed).toBe(true);
      expect(slot!.alpha).toBe(0);
      return;
    }
    if (scenario === 'authoritative save changed' || scenario === 'cached-only queued save change') {
      expect(scene.root !== root, 'fresh-state fallback replaces the stale mount').toBe(true);
      expect(harness.menuScene.renderRebuildCount).toBe(before + 1);
      expect(root.state.destroyed).toBe(true);
      expect(harness.menuScene.loadoutUiDiagnostics().copy.join('\n')).toContain('T2 • Fitted');
      const binding = new DataVisualArtRegistry(harness.context.data).bindingById('equipment-icon:commando-helmet:t2')!;
      if (scenario === 'cached-only queued save change') {
        expect(queued).toEqual(['art-equipment-commando']);
        // A later explicit retry fills the current T2 declaration, never T1.
        const retry = ensureEquipment(['equipment-icon:commando-helmet:t2']);
        await vi.waitFor(() => expect(queued).toHaveLength(2));
        ready = true;
        complete.get('filecomplete-atlasjson-art-equipment-commando')!();
        await retry;
      }
      expect(images.some(image => !image.state.destroyed && image.textureKey === binding.textureKey && image.frameKey === binding.frameKey && image.alpha === 1)).toBe(true);
      expect(slot!.state.destroyed).toBe(true);
      expect(slot!.alpha).toBe(0);
      return;
    }
    expect(scene.root === root, 'lazy art replaced the Menu shell').toBe(true);
    expect(scene.panelContentRoot === content, 'lazy art replaced Loadout content').toBe(true);
    expect(harness.menuScene.renderRebuildCount).toBe(before);
    expect(harness.menuScene.renderRevisionCount).toBe(revision + 1);
    expect(harness.menuScene.loadoutUiDiagnostics().buttons).toEqual(controls);
    expect(button.state.destroyed).toBe(false);
    expect(button.state.handlers.pointerup).toBe(command);
    expect(scene.scrollRegion.scrollOffset).toBe(scrollOffset);
    expect(harness.context.saveData).toEqual(saved);
    expect(images).toHaveLength(imageCount);
    expect(slot, 'known missing equipment art has one transparent slot').toBeDefined();
    expect(slot!.textureKey).toBe('art-equipment-commando');
    expect(slot!.frameKey).toBe(new DataVisualArtRegistry(harness.context.data).bindingById('equipment-icon:commando-helmet')!.frameKey);
    expect(slot!.alpha).toBe(1);
    expect({ x: slot!.x, y: slot!.y, width: slot!.width, height: slot!.height, mask: slot!.state.mask, visible: slot!.state.visible }).toEqual(geometry);
    expect(root.state.destroyed).toBe(false);
    if (scenario === 'returned and resized mount') {
      expect(obsoleteImages.every(image => image.state.destroyed)).toBe(true);
      expect(obsoleteImages.filter(image => image.textureKey === '__DEFAULT').every(image => image.alpha === 0)).toBe(true);
    }
  });

  it('opens Equipment with four selectable slots and selects an item before any equip mutation', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({
      equipment: {
        helmet: { equipmentId: 'equipment:commando-helmet', tier: 1 },
        recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
        armour: { equipmentId: 'equipment:commando-armour', tier: 1 },
      }, loadout: { helmet: 'helmet', armour: 'armour' },
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as { focusables: FakeObject[] };
    expect(scene.focusables.slice(0, 4).map((row) => row.state.text.split('\n')[0])).toEqual(['HELMET', 'ARMOUR', 'GLOVES', 'BOOTS']);
    expect(harness.textContents().some((text) => text.includes('Tap to equip'))).toBe(false);
    const candidate = scene.focusables.find((row) => row.state.text === 'Recon Helmet\nT1 • STORED')!;
    const before = harness.context.saveData;
    expect(candidate).toBeDefined();
    candidate.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    expect(harness.textContents().join('\n')).toContain('Replaces Commando Helmet');
    expect(harness.textContents().join('\n')).toContain('LOSE 2-piece');
    expect(harness.textContents().join('\n')).toContain('[All Weapons]');
    harness.buttonByLabel('Equip Recon Helmet')!.state.handlers.pointerup!();
    expect(harness.context.saveData.equipmentLoadout?.helmet).toBe('recon');
  });

  it('retains the Equipment shell, prefix and mask during candidate selection while revoking replaced detail commands', () => {
    const harness = createHarness({ audio: true });
    harness.context.updateEquipment(() => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
      recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
    }, loadout: { helmet: 'commando' } }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    harness.buttonByLabel('Commando Helmet\nT1 • EQUIPPED')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; panelContentRoot: FakeObject; scrollMask: unknown;
      focusables: FakeObject[]; focusKeyByButton: Map<FakeObject, string>; navigator: { index: number };
    };
    const root = scene.root, panel = scene.panelContentRoot, mask = scene.scrollMask;
    const slots = scene.focusables.slice(0, 4);
    const recon = harness.buttonByLabel('Recon Helmet\nT1 • STORED')!;
    const oldUnequip = harness.buttonByLabel('Unequip Commando Helmet')!;
    const before = harness.context.saveData;
    const rebuilds = harness.menuScene.renderRebuildCount;
    const createdBefore = harness.objects.length;
    recon.state.handlers.pointerup!();
    expect(scene.root).toBe(root);
    expect(scene.panelContentRoot).toBe(panel);
    expect(scene.scrollMask).toBe(mask);
    expect(scene.focusables.slice(0, 4)).toEqual(slots);
    expect(harness.buttonByLabel('Recon Helmet\nT1 • STORED')).toBe(recon);
    expect(harness.menuScene.renderRebuildCount).toBe(rebuilds);
    expect(harness.objects.length - createdBefore).toBeLessThan(60);
    expect(harness.context.saveData).toBe(before);
    expect(scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!)).toBe('equipment-detail:recon');
    expect(oldUnequip.state.destroyed).toBe(true);
    oldUnequip.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    expect(harness.textContents().join('\n')).toContain('Replaces Commando Helmet');
    harness.buttonByLabel('Equip Recon Helmet')!.state.handlers.pointerup!();
    expect(harness.context.saveData.equipmentLoadout?.helmet).toBe('recon');
    expect(scene.root).not.toBe(root);
  });

  it('recomputes shorter Equipment detail extents without scroll drift or retained dead controls', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: {
      armour: { equipmentId: 'equipment:commando-armour', tier: 1 },
      recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
    }, loadout: { armour: 'armour' } }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; scrollMaskContainer: FakeObject & { list: FakeObject[] };
      focusables: FakeObject[]; scrollObjects: Array<{ object: FakeObject }>;
      scrollRegion: { contentHeight: number }; scrollItemBounds: Map<number, { top: number; bottom: number }>;
      focusKeyByButton: Map<FakeObject, string>; navigator: { index: number };
    };
    const root = scene.root, maskContent = scene.scrollMaskContainer;
    const slotBounds = { ...scene.scrollItemBounds.get(0)! };
    const candidate = harness.buttonByLabel('Recon Helmet\nT1 • STORED')!;
    const blueprint = harness.buttonByLabel('Commando Helmet\nFABRICABLE • 100 Scrap')!;
    const before = harness.context.saveData;
    candidate.state.handlers.pointerup!();
    const longHeight = scene.scrollRegion.contentHeight;
    const longCount = maskContent.list.length;
    for (let repeat = 0; repeat < 12; repeat += 1) {
      blueprint.state.handlers.pointerup!();
      expect(scene.scrollRegion.contentHeight).toBeLessThan(longHeight);
      expect(harness.buttonByLabel('Fabricate for 100 Scrap')!.state.interactive).toBe(false);
      expect(scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!)).toBe('equipment-blueprint-detail:equipment:commando-helmet');
      candidate.state.handlers.pointerup!();
      expect(scene.scrollRegion.contentHeight).toBe(longHeight);
      expect(maskContent.list).toHaveLength(longCount);
      expect(scene.scrollItemBounds.get(0)).toEqual(slotBounds);
      expect(scene.focusables.every(button => !button.state.destroyed)).toBe(true);
      expect(scene.scrollObjects.every(entry => !entry.object.state.destroyed)).toBe(true);
      expect(scene.scrollMaskContainer).toBe(maskContent);
      expect(scene.root).toBe(root);
      expect(harness.context.saveData).toBe(before);
    }
  });

  it('fully rebuilds Equipment when selection changes the Set hero or retained inventory', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
      recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
    }, loadout: { helmet: 'commando' } }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as { root: FakeObject; committedDisplay: boolean };
    const firstRoot = scene.root;
    harness.buttonByLabel('Pyro Helmet\nFABRICABLE • 100 Scrap')!.state.handlers.pointerup!();
    expect(scene.root).not.toBe(firstRoot);
    expect(firstRoot.state.destroyed).toBe(true);
    expect(harness.textContents().join('\n')).toContain('Pyro Set');
    const oldCandidate = harness.buttonByLabel('Recon Helmet\nT1 • STORED')!;
    harness.context.updateEquipment(({ loadout }) => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
    }, loadout }));
    const before = harness.context.saveData, secondRoot = scene.root;
    oldCandidate.state.handlers.pointerup!();
    expect(scene.root).not.toBe(secondRoot);
    expect(scene.committedDisplay).toBe(true);
    expect(harness.context.saveData).toBe(before);
    expect(harness.buttonByLabel('Recon Helmet\nT1 • STORED')).toBeUndefined();
  });

  it('recovers a failed local Equipment draw from the returned snapshot without repeating its command', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: {
      commando: { equipmentId: 'equipment:commando-helmet', tier: 1 },
      recon: { equipmentId: 'equipment:recon-helmet', tier: 1 },
    }, loadout: { helmet: 'commando' } }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; committedDisplay: boolean; focusables: FakeObject[];
      controller: { selectEquipmentCandidate(id: string): import('../src/ui/menus').MainMenuSnapshot };
      focusKeyByButton: Map<FakeObject, string>; navigator: { index: number };
    };
    const select = vi.spyOn(scene.controller, 'selectEquipmentCandidate');
    const root = scene.root, before = harness.context.saveData;
    harness.failNextText();
    harness.buttonByLabel('Recon Helmet\nT1 • STORED')!.state.handlers.pointerup!();
    expect(select).toHaveBeenCalledExactlyOnceWith('recon');
    expect(scene.root).not.toBe(root);
    expect(root.state.destroyed).toBe(true);
    expect(scene.committedDisplay).toBe(true);
    expect(scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!)).toBe('equipment-detail:recon');
    expect(scene.focusables.every(button => !button.state.destroyed)).toBe(true);
    expect(harness.context.saveData).toBe(before);
    expect(harness.textContents().join('\n')).toContain('Replaces Commando Helmet');
  });

  it('aligns the independently bounded Loadout footer with its 840px content lane on a wide safe viewport', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      root: unknown; safeCenterX: number; safeRightMargin: number;
      controller: { open(panel: 'loadout'): import('../src/ui/menus').MainMenuSnapshot };
      presentPanelSurface(root: unknown, snapshot: import('../src/ui/menus').MainMenuSnapshot, top: number, margin: number, hitTarget: number): void;
      focusables: FakeObject[];
    };
    // A wide safe viewport and a separately capped panel lane are independent
    // geometry inputs; the fixed footer must use the owning panel's left edge.
    Object.assign(harness.menuScene.scale, { width: 1920, height: 1080 });
    scene.safeCenterX = 960; scene.safeRightMargin = 12;
    scene.presentPanelSurface(scene.root, scene.controller.open('loadout'), 58, 12, 44);
    const gear = scene.focusables.find((button) => button.state.text === 'HELMET\nEmpty')!;
    const footer = harness.buttonByLabel('Return to Contract')!;
    expect(footer.state.x).toBe(gear.state.x);
    expect(footer.state.width).toBe(840);
    expect(footer.state.x + footer.state.width).toBe(1380);
  });

  it('keeps native inline gear, router and framed readiness geometry together at 360px and 390px without inventing fresh equipment', () => {
    for (const width of [360, 390]) {
      const harness = createHarness({ create: false });
      Object.assign(harness.menuScene.scale, { width, height: 844, displaySize: { width, height: 844 } });
      harness.menuScene.create();
      const scene = harness.menuScene as unknown as {
        currentViewport: UiViewport; focusables: FakeObject[];
      };
      harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
      const slots = scene.focusables.slice(0, 4);
      expect(slots.map((slot) => slot.state.text)).toEqual(['HELMET\nEmpty', 'ARMOUR\nEmpty', 'GLOVES\nEmpty', 'BOOTS\nEmpty']);
      expect(new Set(slots.map((slot) => slot.state.y)).size).toBe(1);
      slots.forEach((slot, index) => {
        expect(slot.state.width).toBeGreaterThanOrEqual(minimumHitTarget(scene.currentViewport));
        if (index) expect(slot.state.x).toBeGreaterThanOrEqual(slots[index - 1]!.state.x + slots[index - 1]!.state.width);
      });
      expect(slots[3]!.state.x + slots[3]!.state.width).toBeLessThanOrEqual(width - 16);
      const equipment = harness.buttonByLabel('Equipment')!;
      const gunsmith = harness.buttonByLabel('Gunsmith')!;
      expect(equipment.state.y).toBe(gunsmith.state.y);
      const readiness = harness.objects.find((object) => object.state.text === 'RUN READINESS' && !object.state.destroyed)!;
      expect(readiness.state.x).toBe(slots[0]!.state.x + 16);
      expect(readiness.state.y).toBe(equipment.state.y + equipment.state.height + 48);
      const footer = harness.buttonByLabel('Return to Contract')!;
      expect(readiness.state.y + readiness.state.height).toBeLessThan(footer.state.y);
      const title = harness.objects.find((object) => object.state.text === 'LOADOUT' && !object.state.destroyed)!;
      const subtitle = harness.objects.find((object) => object.state.text === 'PRE-RUN ENGINEERING' && !object.state.destroyed)!;
      expect(title.state.x).toBe(slots[0]!.state.x + 12);
      expect(title.state.y).toBeLessThan(subtitle.state.y);
      expect(subtitle.state.y + subtitle.state.height).toBeLessThan(slots[0]!.state.y);
      expect(harness.context.saveData.progression.scrap).toBe(0);
      expect(Object.keys(harness.context.saveData.equipment)).toHaveLength(0);
      expect(harness.textContents().join('\n')).toContain('Gunsmith: Unconfigured');
    }
  });

  it('renders Browse Sets as an unframed native section while retaining its 44px focus and expansion interaction', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      uiVisuals: { addPanel(...args: unknown[]): unknown }; currentViewport: UiViewport;
      focusables: FakeObject[]; focusKeyByButton: Map<FakeObject, string>;
      navigator: { index: number; setIndex(index: number): void }; focusRings: FakeObject[];
      inputController: { getInputMode(): 'keyboard' | 'pointer' }; applyFocus(): void; refreshInputPresentation(): void;
      scrollObjects: Array<{ object: FakeObject; ownerIndex?: number }>;
    };
    const panels = vi.spyOn(scene.uiVisuals, 'addPanel');
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const browse = harness.buttonByLabel('BROWSE SETS')!;
    const bounds = browse.getBounds();
    expect(panels.mock.calls.filter((call) => call[2] === bounds.centerY && call[3] === bounds.width && call[4] === bounds.height && /card$/.test(String(call[5]))).map((call) => [call[1], call[2], call[3], call[4], call[5]])).toEqual([]);
    expect(browse.state.style).toMatchObject({ color: '#f78003', fontSize: '10px', align: 'left' });
    expect(bounds.height).toBeGreaterThanOrEqual(minimumHitTarget(scene.currentViewport));
    expect(browse.state.interactive).toBe(true);
    expect(scene.focusKeyByButton.get(browse)).toBe('equipment:browse-sets');
    const mode = vi.spyOn(scene.inputController, 'getInputMode').mockReturnValue('keyboard');
    const browseIndex = scene.focusables.indexOf(browse);
    scene.navigator.setIndex(browseIndex); scene.applyFocus();
    expect(browse.state.style.color).toBe('#f78003');
    expect(scene.focusRings[browseIndex]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    mode.mockReturnValue('pointer'); browse.state.handlers.pointerover!({ y: bounds.centerY }); scene.refreshInputPresentation();
    expect(browse.state.style.color).toBe('#f78003');
    expect(scene.focusRings[browseIndex]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(scene.scrollObjects.some(({ object, ownerIndex }) => object === browse && ownerIndex === scene.focusables.indexOf(browse))).toBe(true);
    const before = harness.context.saveData;
    browse.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    expect(harness.textContents().some((copy) => copy.includes('2-piece INACTIVE'))).toBe(true);
    const close = harness.buttonByLabel('CLOSE SETS')!;
    expect(scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!)).toBe('equipment:browse-sets');
    expect(close.getBounds().height).toBeGreaterThanOrEqual(minimumHitTarget(scene.currentViewport));
    close.state.handlers.pointerup!();
    expect(harness.buttonByLabel('BROWSE SETS')).toBeDefined();
    expect(harness.context.saveData).toBe(before);
  });

  it('dims disabled Fabricate chrome after an unframed section without dimming the neighboring Back control', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as { uiVisuals: { addPanel(...args: unknown[]): unknown } };
    const frames: Array<{ name: string; frame: FakeObject; alpha: ReturnType<typeof vi.fn> }> = [];
    vi.spyOn(scene.uiVisuals, 'addPanel').mockImplementation((_scene, x, y, width, height, name) => {
      const frame = fakeObject('rect', '', width as number, height as number, undefined,
        (x as number) - (width as number) / 2, (y as number) - (height as number) / 2);
      const alpha = vi.fn(() => frame);
      Object.assign(frame, { setAlpha: alpha, setTint: vi.fn(() => frame) });
      frames.push({ name: String(name), frame, alpha });
      return frame;
    });
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    frames.length = 0;
    harness.buttonByLabel('Commando Helmet\nFABRICABLE • 100 Scrap')!.state.handlers.pointerup!();
    const fabricate = harness.buttonByLabel('Fabricate for 100 Scrap')!;
    const back = harness.buttonByLabel('Back')!;
    const cardFor = (button: FakeObject) => frames.find(({ name, frame }) => name === 'figma-card'
      && frame.state.x === button.state.x && frame.state.y === button.state.y
      && frame.state.width === button.state.width && frame.state.height === button.state.height)!;
    expect(fabricate.state.interactive).toBe(false);
    expect(cardFor(fabricate).alpha).toHaveBeenCalledWith(0.72);
    expect(back.state.interactive).toBe(true);
    expect(cardFor(back).alpha).not.toHaveBeenCalled();
  });

  it('keeps fresh Equipment truth empty, shows the catalog emblems before expansion and puts Back in the header after the full-width footer', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      focusables: FakeObject[]; scrollObjects: Array<{ object: FakeObject }>;
      addCatalogIcon(root: unknown, x: number, y: number, id: string, size: number, ownerIndex?: number): void;
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
    };
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    const icons = vi.spyOn(scene, 'addCatalogIcon');
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const slots = scene.focusables.slice(0, 4);
    const footer = harness.buttonByLabel('Fabricate Selected')!;
    const back = harness.buttonByLabel('Back')!;
    const browse = harness.buttonByLabel('BROWSE SETS')!;
    expect(footer.state.x).toBe(slots[0]!.state.x);
    expect(footer.state.width).toBe(slots[0]!.state.width);
    expect(back.state.y + back.state.height).toBeLessThanOrEqual(slots[0]!.state.y);
    expect(scene.scrollObjects.some(({ object }) => object === back || object === footer)).toBe(false);
    expect(scene.focusables.indexOf(back)).toBeGreaterThan(scene.focusables.indexOf(footer));
    expect(harness.textContents()).toContain('NO ACTIVE SET');
    expect(harness.textContents()).toContain('0 pieces equipped');
    const sets = scene.controller.snapshot().equipment.presentation.sets;
    for (const set of sets) {
      const calls = icons.mock.calls.filter((call) => call[3] === set.emblemArtId && call[5] === scene.focusables.indexOf(browse));
      expect(calls).toHaveLength(1);
      expect(calls[0]![2]).toBeGreaterThan(browse.state.y + browse.state.height);
    }
  });

  it('anchors fresh Loadout in Mercenary and stock weapon facts before gear and routes its fixed action to the Contract list', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      scrollObjects: Array<{ object: FakeObject }>; focusables: FakeObject[];
    };
    const mercenary = harness.objects.find((object) => object.state.text === 'MERCENARY' && !object.state.destroyed)!;
    const stock = harness.objects.find((object) => object.state.text === 'STOCK WEAPON' && !object.state.destroyed)!;
    const gear = scene.focusables.find((object) => object.state.text === 'HELMET\nEmpty')!;
    const equipment = harness.buttonByLabel('Equipment')!;
    const gunsmith = harness.buttonByLabel('Gunsmith')!;
    const readiness = harness.objects.find((object) => object.state.text === 'RUN READINESS' && !object.state.destroyed)!;
    const launch = harness.buttonByLabel('Return to Contract')!;
    expect(mercenary.state.y).toBeLessThan(stock.state.y);
    expect(stock.state.y).toBeLessThan(gear.state.y);
    expect(gear.state.y).toBeLessThan(equipment.state.y);
    expect(equipment.state.y).toBe(gunsmith.state.y);
    expect(readiness.state.y).toBeGreaterThan(equipment.state.y + equipment.state.height);
    expect(scene.scrollObjects.some(({ object }) => object === launch)).toBe(false);
    expect(harness.textContents().join('\n')).toContain('0/4 Equipment slots equipped');
    const before = harness.context.saveData;
    launch.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    expect(harness.textContents()).toContain('Choose Contract');
  });

  it('requests the full native Equipment resource closure including empty ghosts, unequipped Set emblems and tier upgrade art', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      ensureEquipmentPresentation(ids: readonly string[]): Promise<void>;
      handleResize(): void;
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
    };
    const requests = vi.spyOn(scene, 'ensureEquipmentPresentation').mockResolvedValue(undefined);
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    requests.mockClear();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const fresh = scene.controller.snapshot().equipment.presentation;
    expect(fresh.sets.every((set) => set.equippedCount === 0)).toBe(true);
    const freshIds = requests.mock.calls.flatMap(([ids]) => ids);
    for (const id of [...fresh.slots.map((slot) => slot.placeholderArtId), ...fresh.sets.map((set) => set.emblemArtId)]) {
      expect(freshIds, id).toContain(id);
    }

    harness.context.updateEquipment(() => ({
      equipment: { candidate: { equipmentId: 'equipment:commando-helmet', tier: 2 } }, loadout: {},
    }));
    scene.handleResize();
    requests.mockClear();
    harness.buttonByLabel('Commando Helmet\nT2 • STORED')!.state.handlers.pointerup!();
    const selected = scene.controller.snapshot().equipment;
    const item = selected.presentation.slots.flatMap((slot) => slot.candidates).find((row) => row.instanceId === 'candidate')!;
    const upgraded = selected.owned.find((row) => row.instanceId === 'candidate')!.upgradePreview!.after.slots
      .flatMap((slot) => slot.candidates).find((row) => row.instanceId === 'candidate')!;
    expect(upgraded.iconArtId).not.toBe(item.iconArtId);
    const previewIds = requests.mock.calls.flatMap(([ids]) => ids);
    expect(previewIds).toContain(item.iconArtId);
    expect(previewIds).toContain(upgraded.iconArtId);
  });

  it('illustrates empty Equipment slots as subdued semantic ghosts without claiming ownership or painting Loadout overview ghosts', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      focusables: FakeObject[]; handleResize(): void;
      addPanelArt(root: unknown, x: number, y: number, artId: string, size: number, subdued?: boolean, animate?: boolean, owner?: number): void;
    };
    const art = vi.spyOn(scene, 'addPanelArt');
    const ghosts = () => art.mock.calls.filter((call) => call[3].startsWith('equipment-icon:scavenger-'));
    const before = harness.context.saveData;
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    expect(ghosts()).toHaveLength(0);
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    expect(ghosts().map((call) => [call[3], call[4], call[5], call[6], call[7]])).toEqual([
      ['equipment-icon:scavenger-helmet', 44, true, false, 0],
      ['equipment-icon:scavenger-armour', 44, true, false, 1],
      ['equipment-icon:scavenger-gloves', 44, true, false, 2],
      ['equipment-icon:scavenger-boots', 44, true, false, 3],
    ]);
    expect(scene.focusables.slice(0, 4).map((slot) => slot.state.text)).toEqual(['HELMET\nEmpty', 'ARMOUR\nEmpty', 'GLOVES\nEmpty', 'BOOTS\nEmpty']);
    expect(scene.focusables.slice(0, 4).every((slot) => slot.state.padding.left >= 50)).toBe(true);
    ghosts().forEach((call) => {
      const slot = scene.focusables[call[7]!]!;
      expect(call[1] + call[4] / 2).toBeLessThan(slot.state.x + slot.state.padding.left);
    });
    harness.buttonByLabel('GLOVES\nEmpty')!.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    expect(Object.keys(harness.context.saveData.equipment)).toHaveLength(0);
    harness.context.updateEquipment(() => ({ equipment: { helmet: { equipmentId: 'equipment:commando-helmet', tier: 1 } }, loadout: { helmet: 'helmet' } }));
    art.mockClear(); scene.handleResize();
    expect(ghosts().map((call) => call[3])).toEqual(['equipment-icon:scavenger-armour', 'equipment-icon:scavenger-gloves', 'equipment-icon:scavenger-boots']);
    expect(scene.focusables[0]!.state.text).toContain('Commando Helmet');
    art.mockClear(); harness.buttonByLabel('Back')!.state.handlers.pointerup!();
    expect(ghosts()).toHaveLength(0);
  });

  it('shows all four vertical Equipment slots before inventory scrolling at 360×640 and keeps fabrication fixed across scroll and repaint', () => {
    const harness = createHarness({ create: false });
    Object.assign(harness.menuScene.scale, { width: 360, height: 640, displaySize: { width: 360, height: 640 } });
    harness.menuScene.create();
    harness.context.updateMeta((progression) => ({ ...progression, scrap: 100 }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      focusables: FakeObject[]; focusKeyByButton: Map<FakeObject, string>; navigator: { index: number };
      scrollObjects: Array<{ object: FakeObject }>; currentViewport: UiViewport; scrollViewportTop: number;
      scrollRegion: { viewportHeight: number; scrollOffset: number; scrollBy(delta: number): void };
      applyScrollViewport(): void; handleResize(): void;
    };
    const slots = scene.focusables.slice(0, 4);
    const bottom = scene.scrollViewportTop + scene.scrollRegion.viewportHeight;
    expect(slots.map((slot) => slot.state.x)).toEqual(Array(4).fill(slots[0]!.state.x));
    slots.forEach((slot, index) => {
      expect(slot.state.height).toBeGreaterThanOrEqual(minimumHitTarget(scene.currentViewport));
      expect(slot.state.y).toBeGreaterThanOrEqual(scene.scrollViewportTop);
      expect(slot.state.y + slot.state.height).toBeLessThanOrEqual(bottom);
      if (index) expect(slot.state.y).toBeGreaterThanOrEqual(slots[index - 1]!.state.y + slots[index - 1]!.state.height);
    });
    const emptyFooter = harness.buttonByLabel('Fabricate Selected')!;
    expect(emptyFooter.state.interactive).toBe(false);
    const before = harness.context.saveData;
    harness.buttonByLabel('BROWSE SETS')!.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    expect(harness.textContents().some((copy) => copy.includes('2-piece'))).toBe(true);
    harness.buttonByLabel('Commando Helmet\nFABRICABLE • 100 Scrap')!.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    scene.handleResize();
    expect(scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!)).toBe('equipment-blueprint-detail:equipment:commando-helmet');
    const footer = harness.buttonByLabel('Fabricate for 100 Scrap')!;
    const footerY = footer.state.y;
    expect(scene.scrollObjects.some(({ object }) => object === footer)).toBe(false);
    scene.scrollRegion.scrollBy(10_000); scene.applyScrollViewport();
    expect(footer.state.y).toBe(footerY);
    expect(footer.state.interactive).toBe(true);
    footer.state.handlers.pointerup!();
    expect(harness.context.saveData.progression.scrap).toBe(0);
    expect(harness.context.saveData.equipment['owned:equipment-commando-helmet']).toBeDefined();
    expect(harness.context.saveData.equipmentLoadout?.helmet).toBeUndefined();
    expect(scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!)).toBe('equipment-detail:owned:equipment-commando-helmet');
  });

  it('keeps blueprint selection separate from fabrication and fabrication separate from equip', () => {
    const harness = createHarness();
    harness.context.updateMeta((progression) => ({ ...progression, scrap: 100 }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const before = harness.context.saveData;
    harness.buttonByLabel('Commando Helmet\nFABRICABLE • 100 Scrap')!.state.handlers.pointerup!();
    expect(harness.context.saveData).toBe(before);
    expect(harness.textContents().join('\n')).toContain('Creates a stored T1 item');
    harness.buttonByLabel('Fabricate for 100 Scrap')!.state.handlers.pointerup!();
    expect(harness.context.saveData.equipment['owned:equipment-commando-helmet']).toBeDefined();
    expect(harness.context.saveData.equipmentLoadout?.helmet).toBeUndefined();
  });

  it('preserves selected-item semantic focus across repaint/resize and clamps removed selection to its slot', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({
      equipment: { recon: { equipmentId: 'equipment:recon-helmet', tier: 1 } }, loadout: {},
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    harness.buttonByLabel('Recon Helmet\nT1 • STORED')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      handleResize(): void; focusables: FakeObject[]; navigator: { index: number };
      focusKeyByButton: Map<FakeObject, string>;
      scrollViewportTop: number;
      scrollViewportBottom: number;
    };
    const key = () => scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!);
    expect(key()).toBe('equipment-detail:recon');
    const selectedY = scene.focusables[scene.navigator.index]!.state.y;
    expect(selectedY).toBeGreaterThanOrEqual(scene.scrollViewportTop);
    expect(selectedY).toBeLessThan(scene.scrollViewportTop + (scene.scrollViewportBottom - scene.scrollViewportTop) / 2);
    scene.render(scene.controller.snapshot());
    expect(key()).toBe('equipment-detail:recon');
    expect(scene.focusables[scene.navigator.index]!.state.y).toBe(selectedY);
    for (const [width, height] of [[360, 640], [390, 844], [844, 390], [1280, 720], [1920, 1080]]) {
      Object.assign(harness.menuScene.scale, { width, height, displaySize: { width, height } });
      scene.handleResize();
      expect(key()).toBe('equipment-detail:recon');
      expect(scene.controller.snapshot().equipment.selectedInstanceId).toBe('recon');
      const active = scene.focusables[scene.navigator.index]!;
      expect(active.state.visible).toBe(true);
      expect(active.state.x).toBeGreaterThanOrEqual(12);
      expect(active.state.x + active.state.width).toBeLessThanOrEqual(width - 12);
    }
    harness.context.updateEquipment(() => ({ equipment: {}, loadout: {} }));
    scene.render(scene.controller.snapshot());
    expect(key()).toBe('equipment-slot:helmet');
    expect(scene.controller.snapshot().equipment.selectedInstanceId).toBeUndefined();
  });

  it('keeps a selected stored upgrade explicit and names the actual tier lock', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: { helmet: { equipmentId: 'equipment:commando-helmet', tier: 1 } }, loadout: {} }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const before = harness.context.saveData;
    harness.buttonByLabel('Commando Helmet\nT1 • STORED')!.state.handlers.pointerup!();
    const copy = harness.textContents().join('\n');
    expect(copy).toContain('STORED: no active Loadout value changes until equipped.');
    expect(copy).toContain('+5% Fire Rate [All Weapons]');
    expect(copy).toContain('+10% Fire Rate [All Weapons]');
    expect(copy).toContain('LOCKED • Clear Rusher Ambush');
    expect(harness.context.saveData).toBe(before);
  });

  it('uses real controller input to select a candidate without equipping and then commits its explicit action', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({ equipment: { helmet: { equipmentId: 'equipment:commando-helmet', tier: 1 } }, loadout: {} }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    const pad = new MockGamepad(); harness.input.gamepad!.connect(pad);
    const scene = harness.menuScene as unknown as { focusables: FakeObject[]; navigator: { index: number } };
    const press = (position: number) => {
      pad.setButton(position, true); harness.menuScene.update(0, 16);
      pad.setButton(position, false); harness.menuScene.update(0, 16);
    };
    const focusLabel = (label: string) => {
      for (let step = 0; step < scene.focusables.length + 2 && scene.focusables[scene.navigator.index]?.state.text !== label; step += 1) press(13);
      expect(scene.focusables[scene.navigator.index]?.state.text).toBe(label);
    };
    focusLabel('Commando Helmet\nT1 • STORED');
    const before = harness.context.saveData;
    press(0);
    expect(harness.context.saveData).toBe(before);
    focusLabel('Equip Commando Helmet'); press(0);
    expect(harness.context.saveData.equipmentLoadout?.helmet).toBe('helmet');
    press(1);
    expect(harness.textContents()).toContain('LOADOUT');
  });

  it('routes keyboard and controller vertically through all four Equipment slots before Browse Sets and candidates', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    harness.menuScene.update(0, 16); // neutral poll before fresh logical navigation
    const scene = harness.menuScene as unknown as {
      handleResize(): void; focusables: FakeObject[]; navigator: { index: number; setIndex(index: number): void };
      focusKeyByButton: Map<FakeObject, string>;
    };
    const focused = () => scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!);
    const press = (key: string) => {
      harness.keyboard.keydown(key); harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key); harness.menuScene.update(0, 16);
    };
    expect(focused()).toBe('equipment-slot:helmet');
    press('ArrowDown'); expect(focused()).toBe('equipment-slot:armour');
    press('ArrowUp'); expect(focused()).toBe('equipment-slot:helmet');
    press('ArrowRight'); expect(focused()).toBe('equipment-slot:helmet');
    press('ArrowDown'); expect(focused()).toBe('equipment-slot:armour');
    press('ArrowDown'); expect(focused()).toBe('equipment-slot:gloves');
    press('ArrowDown'); expect(focused()).toBe('equipment-slot:boots');
    press('ArrowDown'); expect(focused()).toBe('equipment:browse-sets');
    press('ArrowDown'); expect(focused()?.startsWith('equipment-blueprint:')).toBe(true);
    const pad = new MockGamepad(); harness.input.gamepad!.connect(pad);
    for (const [width, height] of [[844, 390], [1280, 720], [1920, 1080]]) {
      Object.assign(harness.menuScene.scale, { width, height, displaySize: { width, height } });
      scene.handleResize(); scene.navigator.setIndex(0);
      pad.setButton(15, true); harness.menuScene.update(0, 16);
      pad.setButton(15, false); harness.menuScene.update(0, 16);
      expect(focused()).toBe('equipment-slot:helmet');
      pad.setButton(13, true); harness.menuScene.update(0, 16);
      pad.setButton(13, false); harness.menuScene.update(0, 16);
      expect(focused()).toBe('equipment-slot:armour');
    }
  });

  it('keeps the native tall Equipment hero at 142px while preserving first-row y304 and compact first-view slots', () => {
    for (const height of [844, 640]) {
      const harness = createHarness({ create: false });
      Object.assign(harness.menuScene.scale, { width: 390, height, displaySize: { width: 390, height } });
      harness.menuScene.create();
      harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
      const scene = harness.menuScene as unknown as {
        uiVisuals: { addPanel(...args: unknown[]): unknown }; focusables: FakeObject[];
      };
      const selectedFrames: FakeObject[] = [];
      vi.spyOn(scene.uiVisuals, 'addPanel').mockImplementation((_scene, x, y, width, panelHeight, name) => {
        const frame = fakeObject('rect', '', width as number, panelHeight as number, undefined, x as number, y as number);
        if (name === 'figma-selected') selectedFrames.push(frame);
        return frame;
      });
      harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
      expect(selectedFrames.map((frame) => frame.state.height)).toEqual([height === 844 ? 142 : 64]);
      const frame = selectedFrames[0]!;
      expect(frame.state.y - frame.state.height / 2).toBe(104);
      expect(scene.focusables[0]!.state.y).toBe(height === 844 ? 304 : 192);
      expect(scene.focusables.slice(0, 4).every((slot) => slot.state.y + slot.state.height < harness.buttonByLabel('Fabricate Selected')!.state.y)).toBe(true);
    }
  });

  it('reports the actual engineered family and controller-owned activation in the bounded readiness card', () => {
    for (const [familyId, familyName, activation] of [['pistol', 'Pistol', 'Active from start'], ['smg', 'SMG', 'Activates when acquired']] as const) {
      const harness = createHarness();
      harness.context.updateGunsmith(() => ({
        builds: [{ id: 'build:readiness', name: 'Readiness Build', baseWeaponFamily: familyId, fitted: {}, traitParts: [] }],
        selectedBuildId: 'build:readiness', fabricationSerials: {}, parts: {},
      }));
      harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
      const summary = harness.objects.find((object) => !object.state.destroyed && object.state.text.startsWith('0/4 Equipment slots equipped'))!;
      expect(summary).toBeDefined();
      expect(summary.state.text).toBe(`0/4 Equipment slots equipped\n${familyName} Build configured\n${activation}`);
      const heading = harness.objects.find((object) => !object.state.destroyed && object.state.text === 'RUN READINESS')!;
      expect(summary.state.y + summary.state.height).toBeLessThanOrEqual(heading.state.y - 16 + 114);
      expect(harness.textContents()).toContain('GUNSMITH • ENGINEERED WEAPON FAMILY');
    }
  });

  it('shows equipped scope and the engineered family with deduplicated traits in the shared Loadout overview', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({
      equipment: Object.fromEntries(['helmet', 'armour', 'gloves', 'boots'].map((slot) => [slot, { equipmentId: `equipment:pyro-${slot}`, tier: 1 }])),
      loadout: { helmet: 'helmet', armour: 'armour', gloves: 'gloves', boots: 'boots' },
    }));
    harness.context.updateGunsmith(() => ({
      builds: [{ id: 'build:fire-pistol', name: 'Fire Pistol', baseWeaponFamily: 'pistol', fitted: { barrel: 'barrel' }, traitParts: ['fire'] }],
      selectedBuildId: 'build:fire-pistol', fabricationSerials: {},
      parts: { barrel: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }, fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] } },
    }));
    const icons = vi.fn();
    (harness.menuScene as unknown as { addCatalogIcon: typeof icons }).addCatalogIcon = icons;
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    const copy = harness.textContents().join('\n');
    expect(copy).toContain('EQUIPPED EFFECTS');
    expect(copy).toContain('[All Weapons]');
    expect(copy).toContain('Pistol • ACTIVE');
    expect(copy).toContain('ACTIVE FROM START');
    expect(copy).toContain('FIRE [Pistol] • Does not stack');
    expect(copy).toContain('Sources: Pyro 2-piece • Pyro 4-piece • Fire Pistol');
    const scene = harness.menuScene as unknown as { controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot } };
    const preview = scene.controller.snapshot().gunsmith.selectedBuild!.preview!;
    for (const artId of [preview.baseArtId, ...preview.layers.map((layer) => layer.artId)]) {
      expect(icons.mock.calls.map((call) => [call[3], call[4]])).toContainEqual([artId, 88]);
    }
  });
  it('keeps every data-owned Gunsmith chassis reachable after creating a build', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    expect(harness.textContents()).toEqual(expect.arrayContaining(['Weapon builds', 'Pistol Build', 'SMG Build', 'Shotgun Build', 'EMPTY — TAP TO CREATE']));

    harness.buttonByLabel('Pistol Build')!.state.handlers.pointerup!();
    expect(harness.textContents()).toEqual(expect.arrayContaining([
      'Pistol Build', 'SMG Build', 'Shotgun Build', 'SELECTED',
      'PISTOL BUILD\nSelected • Active from start', 'Stock Pistol chassis',
    ]));
    const compactLabel = 'Compact Receiver • COMMON\nFABRICABLE • 60 Scrap\n+8% Fire Rate\nCurrent build: Fire interval 650ms to 601.9ms\nFabricate for 60 Scrap\nFabricate — 60 Scrap';
    expect(harness.textContents()).toEqual(expect.arrayContaining(['PART CATALOG', compactLabel]));
    expect(harness.textContents().join('\n')).toContain('Standard Barrel • COMMON\nLOCKED');
    expect(harness.buttonByLabel(compactLabel)!.state.interactive).toBe(false);
    expect(harness.context.saveData.gunsmith.parts).toEqual({});
    harness.buttonByLabel('SMG Build')!.state.handlers.pointerup!();
    expect(harness.textContents()).toEqual(expect.arrayContaining(['Pistol Build', 'SMG Build', 'Shotgun Build', 'CONFIGURED', 'SELECTED']));
    harness.buttonByLabel('Pistol Build')!.state.handlers.pointerup!();
    expect(harness.context.saveData.gunsmith.selectedBuildId).toBe('build:pistol');
    expect(harness.context.saveData.gunsmith.builds.map((build) => build.id)).toEqual(['build:pistol', 'build:smg']);
  });

  it('switches Gunsmith builds in place while updating family selection status once', () => {
    const harness = createHarness();
    harness.context.updateGunsmith(() => ({
      parts: {}, fabricationSerials: {},
      builds: [
        { id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] },
        { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: {}, traitParts: [] },
      ],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; panelContentRoot: FakeObject; scrollMaskContainer: FakeObject;
      focusables: FakeObject[];
    };
    const shell = scene.root, content = scene.panelContentRoot, mask = scene.scrollMaskContainer;
    const heading = harness.objects.find(object => !object.state.destroyed && object.state.text === 'Gunsmith')!;
    const pistol = harness.buttonByLabel('Pistol Build')!;
    const smg = harness.buttonByLabel('SMG Build')!;
    const pistolStatus = harness.objects.find(object => !object.state.destroyed && object.state.text === 'SELECTED')!;
    const smgStatus = harness.objects.find(object => !object.state.destroyed && object.state.text === 'CONFIGURED')!;
    const update = vi.spyOn(harness.context, 'updateGunsmith');
    const before = harness.context.saveData.gunsmith;

    smg.state.handlers.pointerup!();

    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.context.saveData.gunsmith).not.toBe(before);
    expect(harness.context.saveData.gunsmith.selectedBuildId).toBe('build:smg');
    expect(scene.root === shell, 'build selection replaced the Menu root').toBe(true);
    expect(scene.panelContentRoot === content, 'build selection replaced the Gunsmith surface').toBe(true);
    expect(scene.scrollMaskContainer === mask, 'build selection replaced the shared scroll mask').toBe(true);
    expect(harness.objects.find(object => !object.state.destroyed && object.state.text === 'Gunsmith') === heading,
      'build selection replaced the Gunsmith heading').toBe(true);
    expect(harness.buttonByLabel('Pistol Build') === pistol, 'build selection replaced the Pistol family control').toBe(true);
    expect(harness.buttonByLabel('SMG Build') === smg, 'build selection replaced the SMG family control').toBe(true);
    expect(pistol.state.destroyed).toBe(false);
    expect(smg.state.destroyed).toBe(false);
    expect(pistolStatus.state.text).toBe('CONFIGURED');
    expect(smgStatus.state.text).toBe('SELECTED');
    expect(pistolStatus.state.style.color).toBe('#a5f3fc');
    expect(smgStatus.state.style.color).toBe('#86efac');
    expect(harness.textContents().join('\n')).toContain('SMG BUILD\nSelected • Activates when acquired');
  });

  it('replaces a Gunsmith part with one durable update while retaining the surface and revoking the old command', () => {
    const harness = createHarness();
    harness.context.updateGunsmith(() => ({
      parts: {
        heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      }, fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; panelContentRoot: FakeObject; scrollMaskContainer: FakeObject;
      focusables: FakeObject[]; focusKeyByButton: Map<FakeObject, string>;
      navigator: { index: number }; handleResize(): void;
    };
    const shell = scene.root, content = scene.panelContentRoot, mask = scene.scrollMaskContainer;
    const heading = harness.objects.find(object => !object.state.destroyed && object.state.text === 'Gunsmith')!;
    const family = harness.buttonByLabel('Pistol Build')!;
    const row = harness.objects.find(object => !object.state.destroyed && object.state.text.startsWith('Compact Receiver T1 • OWNED'))!;
    expect(row).toBeDefined();
    const oldCommand = row.state.handlers.pointerup!;
    const before = harness.context.saveData.gunsmith;
    const update = vi.spyOn(harness.context, 'updateGunsmith');

    oldCommand();

    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.context.saveData.gunsmith).not.toBe(before);
    expect(harness.context.saveData.gunsmith.builds[0]!.fitted.receiver).toBe('compact');
    expect(harness.context.saveData.gunsmith.parts).toEqual(before.parts);
    expect(scene.root === shell, 'part replacement replaced the Menu root').toBe(true);
    expect(scene.panelContentRoot === content, 'part replacement replaced the Gunsmith surface').toBe(true);
    expect(scene.scrollMaskContainer === mask, 'part replacement replaced the shared scroll mask').toBe(true);
    expect(harness.objects.find(object => !object.state.destroyed && object.state.text === 'Gunsmith') === heading,
      'part replacement replaced the Gunsmith heading').toBe(true);
    expect(harness.buttonByLabel('Pistol Build') === family, 'part replacement replaced the family control').toBe(true);
    expect(scene.focusKeyByButton.get(scene.focusables[scene.navigator.index]!)).toBe('gunsmith-part:compact');

    const committed = harness.context.saveData.gunsmith;
    oldCommand();
    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.context.saveData.gunsmith).toBe(committed);

    const resize = scene.handleResize.bind(scene);
    const rebuilt = vi.spyOn(scene, 'handleResize').mockImplementation(resize);
    const current = scene.root;
    Object.assign(harness.menuScene.scale, { width: 1280, height: 720, displaySize: { width: 1280, height: 720 } });
    scene.handleResize();
    expect(rebuilt).toHaveBeenCalledOnce();
    expect(scene.root).not.toBe(current);
    expect(harness.context.saveData.gunsmith.builds[0]!.fitted.receiver).toBe('compact');
    expect(harness.context.saveData.gunsmith).toBe(committed);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('keeps repeated Gunsmith build updates bounded and returns scroll geometry to each state', () => {
    const harness = createHarness();
    harness.context.updateGunsmith(() => ({
      parts: { compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } },
      fabricationSerials: {},
      builds: [
        { id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'compact' }, traitParts: [] },
        { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: {}, traitParts: [] },
      ],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; panelContentRoot: FakeObject; scrollMaskContainer: FakeObject;
      scrollRegion: { contentHeight: number; viewportHeight: number; scrollOffset: number };
      focusables: FakeObject[]; focusKeyByButton: Map<FakeObject, string>; navigator: { index: number };
    };
    const shell = scene.root, content = scene.panelContentRoot, mask = scene.scrollMaskContainer;
    const observed = () => ({
      liveObjects: harness.objects.filter(object => !object.state.destroyed).length,
      contentHeight: scene.scrollRegion.contentHeight,
    });
    const expectScrollBounded = () => expect(scene.scrollRegion.scrollOffset)
      .toBeLessThanOrEqual(Math.max(0, scene.scrollRegion.contentHeight - scene.scrollRegion.viewportHeight));
    const longState = observed();
    let shortState: ReturnType<typeof observed> | undefined;
    const update = vi.spyOn(harness.context, 'updateGunsmith');

    for (let iteration = 0; iteration < 4; iteration += 1) {
      harness.buttonByLabel('SMG Build')!.state.handlers.pointerup!();
      const currentShortState = observed();
      if (shortState) expect(currentShortState).toEqual(shortState);
      else shortState = currentShortState;
      expect(scene.root === shell, 'short body update replaced the Menu root').toBe(true);
      expect(scene.panelContentRoot === content, 'short body update replaced the Gunsmith surface').toBe(true);
      expect(scene.scrollMaskContainer === mask, 'short body update replaced the shared scroll mask').toBe(true);
      expect(scene.focusables.every(button => !button.state.destroyed)).toBe(true);
      expectScrollBounded();

      harness.buttonByLabel('Pistol Build')!.state.handlers.pointerup!();
      expect(observed()).toEqual(longState);
      expect(scene.root === shell, 'long body update replaced the Menu root').toBe(true);
      expect(scene.panelContentRoot === content, 'long body update replaced the Gunsmith surface').toBe(true);
      expect(scene.scrollMaskContainer === mask, 'long body update replaced the shared scroll mask').toBe(true);
      expect(scene.focusables.every(button => !button.state.destroyed)).toBe(true);
      expectScrollBounded();
      expect(harness.context.saveData.gunsmith.selectedBuildId).toBe('build:pistol');
      expect(update).toHaveBeenCalledTimes((iteration + 1) * 2);
    }
    expect(observed().liveObjects).toBe(longState.liveObjects);
    expect(observed().contentHeight).toBe(longState.contentHeight);
  });

  it('recovers a failed local Gunsmith body draw without replaying the durable command', () => {
    const harness = createHarness();
    harness.context.updateGunsmith(() => ({
      parts: {
        heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      }, fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; committedDisplay: boolean;
      controller: { fitGunPart(instanceId: string): import('../src/ui/menus').MainMenuSnapshot };
    };
    const root = scene.root;
    const fit = vi.spyOn(scene.controller, 'fitGunPart');
    const update = vi.spyOn(harness.context, 'updateGunsmith');
    const compactCandidate = harness.objects.find(object =>
      !object.state.destroyed && object.state.text.startsWith('Compact Receiver T1 • OWNED'))!;
    harness.failNextText();

    expect(() => compactCandidate.state.handlers.pointerup!()).not.toThrow();

    expect(fit).toHaveBeenCalledExactlyOnceWith('compact');
    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.context.saveData.gunsmith.builds[0]!.fitted.receiver).toBe('compact');
    expect(scene.root).not.toBe(root);
    expect(root.state.destroyed).toBe(true);
    expect(scene.committedDisplay).toBe(true);
    expect(harness.textContents().some(text => text.includes('Compact Receiver T1 • FITTED'))).toBe(true);
    expect(harness.textContents()).not.toContain('Something went wrong — press Esc to retry');
  });

  it('shows a save failure notice and rebuilds from the unchanged Gunsmith snapshot', () => {
    const harness = createHarness();
    harness.context.updateGunsmith(() => ({
      parts: {
        heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      }, fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      root: FakeObject; controller: { fitGunPart(instanceId: string): import('../src/ui/menus').MainMenuSnapshot };
    };
    const root = scene.root;
    const saved = harness.context.saveData;
    const fit = vi.spyOn(scene.controller, 'fitGunPart');
    const update = vi.spyOn(harness.context, 'updateGunsmith').mockReturnValue({
      value: saved.gunsmith,
      persisted: false,
    });
    const compactCandidate = harness.objects.find(object =>
      !object.state.destroyed && object.state.text.startsWith('Compact Receiver T1 • OWNED'))!;

    compactCandidate.state.handlers.pointerup!();

    expect(fit).toHaveBeenCalledExactlyOnceWith('compact');
    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.context.saveData).toBe(saved);
    expect(scene.root).not.toBe(root);
    expect(root.state.destroyed).toBe(true);
    expect(harness.textContents()).toContain('Could not save that Gunsmith change');
    expect(harness.textContents().some(text => text.startsWith('Heavy Receiver T2 • FITTED'))).toBe(true);
  });

  it('creates a Gunsmith build once and leaves retryable fallback after its first presentation draw fails', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      controller: { createGunBuild(family: string): import('../src/ui/menus').MainMenuSnapshot };
      committedDisplay: boolean;
    };
    const create = vi.spyOn(scene.controller, 'createGunBuild');
    const update = vi.spyOn(harness.context, 'updateGunsmith');
    harness.failNextText();

    expect(() => harness.buttonByLabel('Pistol Build')!.state.handlers.pointerup!()).toThrow('Injected text factory failure');

    expect(create).toHaveBeenCalledExactlyOnceWith('pistol');
    expect(update).toHaveBeenCalledTimes(1);
    expect(harness.context.saveData.gunsmith.selectedBuildId).toBe('build:pistol');
    expect(scene.committedDisplay).toBe(false);
    expect(harness.textContents()).toContain('Something went wrong — press Esc to retry');
    harness.keyboard.keyup('Escape'); harness.menuScene.update(0, 16);
    harness.keyboard.keydown('Escape'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('Escape'); harness.menuScene.update(0, 16);
    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledTimes(1);
    expect(scene.committedDisplay).toBe(true);
    expect(harness.textContents()).toContain('LOADOUT');
    expect(harness.textContents()).not.toContain('Something went wrong — press Esc to retry');
  });

  it('keeps unavailable Gunsmith catalog rows inert when scrolling reveals them', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    harness.buttonByLabel('Pistol Build')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      navigator: { index: number };
      focusables: FakeObject[];
    };
    const locked = scene.focusables.find((row) => row.state.text.startsWith('Standard Barrel • COMMON\nLOCKED'))!;
    const lockedIndex = scene.focusables.indexOf(locked);
    for (let step = 0; step < scene.focusables.length && scene.navigator.index !== lockedIndex; step += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }

    expect(scene.navigator.index).toBe(lockedIndex);
    expect(locked.state.visible).toBe(true);
    expect(locked.state.interactive).toBe(false);
    harness.keyboard.keydown('Enter'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('Enter'); harness.menuScene.update(0, 16);
    expect(scene.controller.snapshot().notice).toBeUndefined();
    expect(harness.context.saveData.gunsmith.parts).toEqual({});
  });

  it('keeps the focused Gunsmith part row fully inside the scroll viewport after a compact resize', () => {
    const harness = createHarness();
    harness.context.updateGunsmith(() => ({
      parts: {
        heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      }, fabricationSerials: {},
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      focusedButtonKey?: string;
      navigator: { index: number };
      scrollItemBounds: Map<number, { top: number; bottom: number }>;
      scrollViewportTop: number;
      scrollViewportBottom: number;
      scrollRegion: { scrollOffset: number };
      handleResize(): void;
    };
    for (let step = 0; step < 80 && scene.focusedButtonKey !== 'gunsmith-part:compact'; step += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }
    expect(scene.focusedButtonKey).toBe('gunsmith-part:compact');

    Object.assign(harness.menuScene.scale, { width: 360, height: 640, displaySize: { width: 360, height: 640 } });
    scene.handleResize();

    expect(scene.focusedButtonKey).toBe('gunsmith-part:compact');
    const rowBounds = scene.scrollItemBounds.get(scene.navigator.index)!;
    const visibleTop = rowBounds.top - scene.scrollRegion.scrollOffset;
    const visibleBottom = rowBounds.bottom - scene.scrollRegion.scrollOffset;
    expect(visibleTop).toBeGreaterThanOrEqual(scene.scrollViewportTop);
    expect(visibleBottom).toBeLessThanOrEqual(scene.scrollViewportBottom);
  });

  it('uses the shared scroll region for a large Gunsmith inventory without paging controls', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: Object.fromEntries([
        ...Array.from({ length: 50 }, (_, index) => [`part-${index}`, { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }]),
        ['fire', { partId: 'part:trait-fire', tier: 2, infusedTraits: [] }],
      ]),
      builds: [{ id: 'build:pistol', name: 'Main Weapon', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    expect(harness.textContents()).not.toContain('Next Gunsmith Page');
    const scene = harness.menuScene as unknown as { scrollRegion?: { itemCount: number } };
    expect(scene.scrollRegion?.itemCount).toBeGreaterThan(1);
  });

  it('renders grouped workshop operations linearly for a repeatable-part inventory', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`part-${index}`, { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }])),
      builds: [{ id: 'build:pistol', name: 'Main Weapon', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();

    expect(harness.textContents()).toContain('Merge 2 of 50 owned Standard Barrel T1 → T2');
    expect(harness.textContents().filter((text) => text.startsWith('Merge '))).toHaveLength(1);
    harness.buttonByLabel('Merge 2 of 50 owned Standard Barrel T1 → T2')!.state.handlers.pointerup!();
    expect(harness.textContents()).toContain('CHOOSE FIRST MERGE INPUT');
    expect(harness.textContents().filter((text) => text.includes('Inventory spare'))).toHaveLength(50);
    const first = harness.textContents().find((text) => text.startsWith('RECOMMENDED • First input • Standard Barrel T1'))!;
    harness.buttonByLabel(first)!.state.handlers.pointerup!();
    expect(harness.textContents()).toContain('CHOOSE COMPATIBLE SECOND INPUT');
    expect(harness.textContents().filter((text) => text.includes('Inventory spare'))).toHaveLength(49);
  });

  it('keeps fabrication of a second merge copy actionable when the first copy is fitted', () => {
    const harness = createHarness();
    harness.context.commitProgression((progression) => ({ ...progression, scrap: 120 }));
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: { existing: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } },
      builds: [{ id: 'build:pistol', name: 'Main Weapon', baseWeaponFamily: 'pistol', fitted: { receiver: 'existing' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const label = harness.textContents().find((text) => text.includes('Fabricate another — 60 Scrap'))!;
    expect(label).toContain('EQUIPPED • T1');
    for (let step = 0; step < 20 && !harness.buttonByLabel(label)!.state.interactive; step += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }
    expect(harness.buttonByLabel(label)!.state.interactive).toBe(true);
    harness.buttonByLabel(label)!.state.handlers.pointerup!();
    expect(Object.values(harness.context.saveData.gunsmith.parts).filter((part) => part.partId === 'part:receiver-compact')).toHaveLength(2);
  });

  it('requires a visible two-step destructive Workshop confirmation with cancel and duplicate-confirm safety', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: {
        a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Main Weapon', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const recipe = harness.textContents().find((text) => text.startsWith('Merge 2 of 2 owned Standard Barrel T1 → T2'))!;
    harness.buttonByLabel(recipe)!.state.handlers.pointerup!();
    const firstInput = harness.textContents().find((text) => text.startsWith('RECOMMENDED • First input • Standard Barrel T1'))!;
    harness.buttonByLabel(firstInput)!.state.handlers.pointerup!();
    const secondInput = harness.textContents().find((text) => text.startsWith('RECOMMENDED • Second input • Standard Barrel T1'))!;
    harness.buttonByLabel(secondInput)!.state.handlers.pointerup!();
    expect(harness.context.saveData.gunsmith.parts).toHaveProperty('a');
    expect(harness.context.saveData.gunsmith.parts).toHaveProperty('b');
    expect(harness.textContents()).toEqual(expect.arrayContaining([
      'CONFIRM MERGE\nINPUTS\nStandard Barrel T1 • +10 Range\nStandard Barrel T1 • +10 Range\nOUTPUT\nStandard Barrel T2 • +20 Range\n+10 Range → +20 Range',
      'Merge parts', 'Cancel',
    ]));
    expect(harness.textContents()).not.toContain('CHOOSE COMPATIBLE SECOND INPUT');
    expect(harness.textContents().some((text) => text.startsWith('RECOMMENDED • Second input'))).toBe(false);

    harness.buttonByLabel('Cancel')!.state.handlers.pointerup!();
    expect(harness.context.saveData.gunsmith.parts).toHaveProperty('a');
    const retryInput = harness.textContents().find((text) => text.startsWith('RECOMMENDED • Second input • Standard Barrel T1'))!;
    harness.buttonByLabel(retryInput)!.state.handlers.pointerup!();
    const confirm = harness.buttonByLabel('Merge parts')!;
    confirm.state.handlers.pointerup!();
    confirm.state.handlers.pointerup!();
    expect(Object.values(harness.context.saveData.gunsmith.parts)).toHaveLength(1);
  });

  it('focuses and reveals infusion confirmation from a large Workshop list', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: Object.fromEntries([
        ...Array.from({ length: 24 }, (_, index) => [`target-${index}`, { partId: 'part:barrel-standard', tier: 2, infusedTraits: [] }]),
        ['fire', { partId: 'part:trait-fire', tier: 2, infusedTraits: [] }],
      ]),
      builds: [{ id: 'build:pistol', name: 'Main Weapon', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const infusion = harness.textContents().find((text) => text.startsWith('Infuse Standard Barrel with Fire Trait Core'))!;
    harness.buttonByLabel(infusion)!.state.handlers.pointerup!();

    const scene = harness.menuScene as unknown as { navigator: { index: number }; focusables: FakeObject[] };
    const focused = scene.focusables[scene.navigator.index]!;
    expect(focused.state.text).toBe('Infuse part');
    expect(focused.state.visible).toBe(true);
    expect(focused.state.interactive).toBe(true);
  });

  it('logical Back cancels a pending Workshop confirmation before leaving Gunsmith', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({ ...state,
      parts: {
        a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const recipe = harness.textContents().find((text) => text.startsWith('Merge 2 of 2 owned Standard Barrel T1 → T2'))!;
    harness.buttonByLabel(recipe)!.state.handlers.pointerup!();
    let input = harness.textContents().find((text) => text.startsWith('RECOMMENDED • First input • Standard Barrel T1'))!;
    harness.buttonByLabel(input)!.state.handlers.pointerup!();
    input = harness.textContents().find((text) => text.startsWith('RECOMMENDED • Second input • Standard Barrel T1'))!;
    harness.buttonByLabel(input)!.state.handlers.pointerup!();
    harness.menuScene.update(0, 16); // release the accepted pointer edge before logical Back

    harness.keyboard.keydown('Escape'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('Escape'); harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('Gunsmith');
    expect(harness.textContents().join('\n')).not.toContain('CONFIRM MERGE');
    expect(harness.textContents()).toContain('CHOOSE COMPATIBLE SECOND INPUT');
    expect(harness.context.saveData.gunsmith.parts).toHaveProperty('a');

    harness.keyboard.keydown('Escape'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('Escape'); harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('CHOOSE FIRST MERGE INPUT');
    harness.keyboard.keydown('Escape'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('Escape'); harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('Gunsmith');
    expect(harness.textContents().join('\n')).not.toContain('CHOOSE FIRST MERGE INPUT');
  });

  it('keeps a 50-part Gunsmith list focusable and scroll-safe through acceptance viewports', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`part-${index}`, { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }])),
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as { handleResize(): void; navigator: { index: number }; scrollRegion?: { scrollOffset: number } };
    for (let index = 0; index < 52; index += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }
    expect(scene.navigator.index).toBeGreaterThan(45);
    expect(scene.scrollRegion?.scrollOffset).toBeGreaterThan(0);
    for (const [width, height] of [[360, 640], [390, 844], [844, 390], [1280, 720], [1920, 1080]]) {
      (harness.menuScene.scale as unknown as { width: number; height: number; displaySize: { width: number; height: number } }).width = width;
      (harness.menuScene.scale as unknown as { height: number; displaySize: { width: number; height: number } }).height = height;
      (harness.menuScene.scale as unknown as { displaySize: { width: number; height: number } }).displaySize = { width, height };
      scene.handleResize();
      expect(scene.navigator.index).toBeGreaterThanOrEqual(0);
      expect(scene.scrollRegion?.scrollOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it('discloses the displaced Part and mechanical comparison before a one-command replacement', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: {
        heavy: { partId: 'part:receiver-heavy', tier: 2, infusedTraits: [] },
        compact: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { receiver: 'heavy' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    const original = harness.context.saveData.gunsmith;
    const mutate = vi.spyOn(harness.context, 'updateGunsmith');
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    const row = harness.objects.find((object) => !object.state.destroyed && object.state.text.startsWith('Compact Receiver T1 • OWNED'))!;
    expect(row.state.text).toContain('REPLACE HEAVY RECEIVER T2');
    expect(row.state.text).toContain('Heavy Receiver T2 returns to STORED.');
    expect(row.state.text).toContain('Current build:');
    expect(row.state.text).toContain('738.6ms to 601.9ms');
    expect(row.state.text).not.toContain('→');
    expect(mutate).not.toHaveBeenCalled();
    expect(harness.context.saveData.gunsmith).toBe(original);
    row.state.handlers.pointerup!();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(harness.context.saveData.gunsmith.builds[0]!.fitted.receiver).toBe('compact');
    expect(harness.context.saveData.gunsmith.parts).toEqual(original.parts);
  });

  it('groups owned hardware by canonical weapon slot and makes a cross-build move explicit', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: { barrel: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] } },
      builds: [
        { id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { barrel: 'barrel' }, traitParts: [] },
        { id: 'build:smg', name: 'SMG Build', baseWeaponFamily: 'smg', fitted: {}, traitParts: [] },
      ],
      selectedBuildId: 'build:smg',
    }));
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();
    expect(harness.textContents()).toEqual(expect.arrayContaining([
      'RECEIVER', 'BARREL', 'OPTIC', 'STOCK', 'TRIGGER', 'MAGAZINE', 'TRAITS 0 / 2',
      'Standard Barrel T1 • FITTED TO PISTOL BUILD\n+10 Range\nMOVE FROM PISTOL BUILD',
    ]));
  });

  it('keeps an unavailable fitted Part visibly occupied until the recovery command clears it', () => {
    const harness = createHarness();
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: { stale: { partId: 'part:removed-definition', tier: 1, infusedTraits: [] } },
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { barrel: 'stale' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));

    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();

    const text = harness.textContents();
    const recoveryIndex = text.indexOf('Unavailable saved part\nREMOVE UNAVAILABLE PART');
    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(text[recoveryIndex + 1]).toBe('OPTIC');
  });

  it('renders both behavior emblems for a Part with two effective traits', () => {
    const harness = createHarness();
    const addCatalogIcon = vi.fn();
    (harness.menuScene as unknown as { addCatalogIcon: typeof addCatalogIcon }).addCatalogIcon = addCatalogIcon;
    harness.context.updateGunsmith((state) => ({
      ...state,
      parts: { barrel: { partId: 'part:barrel-standard', tier: 2, infusedTraits: ['FIRE', 'PIERCING'] } },
      builds: [{ id: 'build:pistol', name: 'Pistol Build', baseWeaponFamily: 'pistol', fitted: { barrel: 'barrel' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));

    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Gunsmith')!.state.handlers.pointerup!();

    expect(addCatalogIcon).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number), 'trait-icon:fire', 32, expect.any(Number),
    );
    expect(addCatalogIcon).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number), 'trait-icon:piercing', 32, expect.any(Number),
    );
  });

  it('uses the production scroll region for 20 Character, 25 Contract, 40 Achievement, and 50 Compendium rows', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      navigator: { index: number };
      scrollRegion?: { scrollOffset: number };
      scrollObjects: Array<{ object: FakeObject; ownerIndex?: number }>;
      focusables: FakeObject[];
    };
    const base = scene.controller.snapshot();
    const repeat = <T,>(source: readonly T[], count: number, name: (item: T, index: number) => T) =>
      Array.from({ length: count }, (_, index) => name(source[index % source.length]!, index));
    const pressDown = (count: number) => {
      for (let index = 0; index < count; index += 1) {
        harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
        harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
      }
    };
    const assertRows = (panel: import('../src/ui/menus').MainMenuSnapshot['panel'], count: number, patch: Partial<import('../src/ui/menus').MainMenuSnapshot>) => {
      scene.render({ ...base, ...patch, panel });
      pressDown(count - 1);
      expect(scene.navigator.index).toBe(count - 1);
      expect(scene.scrollRegion?.scrollOffset).toBeGreaterThan(0);
      const liveRows = harness.objects.filter((object) => object.state.kind === 'text' && object.state.handlers.pointerup && !object.state.destroyed && object.state.text !== 'Back');
      expect(liveRows[0]!.state.interactive).toBe(false);
      expect(scene.focusables[count - 1]!.state.interactive).toBe(true);
      for (const entry of scene.scrollObjects.filter((item) => item.ownerIndex !== undefined)) {
        expect(entry.object.state.visible).toBe(scene.focusables[entry.ownerIndex!]!.state.visible);
      }
    };

    assertRows('character', 20, {
      character: { ...base.character, characters: repeat(base.character.characters, 20, (item, index) => ({ ...item, id: `character-${index}`, name: `Character ${index}` })) },
    });
    assertRows('stage', 25, {
      stage: { ...base.stage, stages: repeat(base.stage.stages, 25, (item, index) => ({ ...item, id: `contract-${index}`, name: `Contract ${index}`, locked: false })) },
    });
    const achievementRows = repeat(base.achievements.achievements, 40, (item, index) => ({ ...item, id: `achievement-${index}`, name: `Achievement ${index}` }));
    scene.render({ ...base, panel: 'achievements', achievements: { ...base.achievements, achievements: achievementRows } });
    // The phone gallery is deliberately one large badge per row so the
    // approved art remains readable at its actual presentation size.
    for (let index = 0; index < 39; index += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16); harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }
    expect(scene.navigator.index).toBe(39);
    expect(scene.scrollRegion?.scrollOffset).toBeGreaterThan(0);
    expect(scene.focusables[39]!.state.interactive).toBe(true);
    assertRows('compendium', 50, {
      compendium: { ...base.compendium, entries: repeat(base.compendium.entries, 50, (item, index) => ({ ...item, enemyId: `enemy-${index}`, name: `Compendium ${index}` })) },
    });
  });

  it('centres achievement copy vertically and reserves enough height for boss reward wrapping', () => {
    const harness = createHarness();
    harness.buttonByLabel('Career')!.state.handlers.pointerup!();
    harness.buttonByLabel('Achievements')!.state.handlers.pointerup!();
    harness.buttonByLabel('Crusher Down\nLocked • 0/1')!.state.handlers.pointerup!();

    const expanded = harness.buttonByLabel(
      'Crusher Down\nLocked • 0/1\nDefeat the Scrap Crusher boss.\nReward: +100 scrap',
    );
    expect(expanded).toBeDefined();
    expect(expanded!.state.height).toBeGreaterThanOrEqual(184);
    expect(expanded!.state.padding.top).toBe(expanded!.state.padding.bottom);
    expect(expanded!.state.style.align).toBe('center');
  });

  it('cold-opens the Contract list with actor art only for the selected threat strip', () => {
    const harness = createHarness();
    const requested = vi.fn(async () => undefined);
    (harness.menuScene as unknown as { ensurePanelPresentation: typeof requested }).ensurePanelPresentation = requested;

    harness.buttonByLabel('Change Contract')!.state.handlers.pointerup!();

    const panelRequests = requested.mock.calls as unknown as Array<[string, string[]]>;
    const [, artIds] = panelRequests.find((call) =>
      call[0] === 'stage' && call[1].includes('objective-icon:kill'))!;
    const snapshot = (harness.menuScene as unknown as { controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot } }).controller.snapshot();
    const objectiveArtIds = harness.context.stages.allStages().map((stage) => {
      const option = (harness.menuScene as unknown as { controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot } }).controller
        .snapshot().stage.stages.find((row) => row.id === stage.id)!;
      return option.objective.artId;
    });
    const selectedThreatArtIds = snapshot.stage.stages.find((stage) => stage.selected)!.threats
      .map((threat) => threat.actorArtId);
    const chapterArtIds = [...new Set(snapshot.stage.stages.map((stage) => stage.chapterIconArtId))];
    expect(artIds).toEqual([...chapterArtIds, ...objectiveArtIds, ...selectedThreatArtIds]);
    const unselectedThreatArtIds = snapshot.stage.stages.filter((stage) => !stage.selected)
      .flatMap((stage) => stage.threats.map((threat) => threat.actorArtId));
    expect(unselectedThreatArtIds.some((artId) => !artIds.includes(artId))).toBe(true);
  });

  it('waits for the cold Home art closure before a quick Play launch uses the scene loader', async () => {
    const harness = createHarness();
    let finishHomeArt!: () => void;
    const homeArt = new Promise<void>((resolve) => { finishHomeArt = resolve; });
    const scene = harness.menuScene as unknown as {
      panelArtInFlight?: Promise<void>;
      panelArtLoading: boolean;
      textures: { exists(key: string): boolean; get(key: string): { has(frame: string): boolean; setFilter(mode: number): void } };
      anims: { exists(key: string): boolean };
      addPanelArt(...args: unknown[]): void;
    };
    scene.panelArtInFlight = homeArt;
    scene.panelArtLoading = true;
    scene.textures = { exists: () => true, get: () => ({ has: () => true, setFilter: () => undefined }) };
    scene.anims = { exists: () => true };
    scene.addPanelArt = () => undefined;

    harness.buttonByLabel('Play Contract')!.state.handlers.pointerup!();
    await Promise.resolve();
    expect(harness.sceneStart).not.toHaveBeenCalled();

    finishHomeArt();
    await vi.waitFor(() => expect(harness.sceneStart).toHaveBeenCalledOnce());
  });

  it.each([false, true])('waits for run audio and rejects late completion after shutdown=%s', async (shutdown) => {
    const harness = createHarness();
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    const cached = new Set<string>();
    let finish!: () => void;
    const add = (event: string, listener: (...args: unknown[]) => void) => {
      const entries = handlers.get(event) ?? new Set(); entries.add(listener); handlers.set(event, entries);
    };
    const queued: string[] = [];
    Object.assign(harness.menuScene, {
      textures: { exists: () => true, get: () => ({ has: () => true, setFilter: () => undefined }) },
      anims: { exists: () => true }, addPanelArt: () => undefined,
      cache: { audio: { exists: (key: string) => cached.has(key) } },
      load: { on: add, once: add,
        off: (event: string, listener: (...args: unknown[]) => void) => handlers.get(event)?.delete(listener),
        audio: (key: string) => queued.push(key),
        start: () => { finish = () => {
          queued.forEach(key => cached.add(key));
          for (const listener of [...(handlers.get('complete') ?? [])]) listener();
        }; },
      },
    });
    const previous = harness.menuScene.renderRebuildCount;
    harness.buttonByLabel('Play Contract')!.state.handlers.pointerup!();
    await vi.waitFor(() => expect(queued).toHaveLength(17));
    expect(harness.sceneStart).not.toHaveBeenCalled();
    const progressText = harness.objects.find(object => !object.state.destroyed && object.state.text.startsWith('PREPARING CONTRACT'))!;
    expect(progressText.state.text).toMatch(/Preparing sound \d+ \/ \d+/);
    expect(harness.menuScene.renderRebuildCount - previous).toBe(1);
    if (shutdown) harness.lifecycle.emit('shutdown');
    else {
      (harness.menuScene as unknown as { handleResize(): void }).handleResize();
      expect(progressText.state.destroyed).toBe(true);
      expect(harness.menuScene.renderRebuildCount - previous).toBe(2);
    }
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    if (shutdown) {
      expect(harness.sceneStart).not.toHaveBeenCalled();
      expect(progressText.state.destroyed).toBe(true);
    } else {
      expect(harness.sceneStart).toHaveBeenCalledOnce();
      const current = harness.objects.find(object => !object.state.destroyed && object.state.text.startsWith('PREPARING CONTRACT'))!;
      expect(current).not.toBe(progressText);
      expect(current.state.text).toContain('Preparing sound 17 / 17');
      expect(harness.menuScene.renderRebuildCount - previous).toBe(2);
    }
    expect([...handlers.values()].every(entries => entries.size === 0)).toBe(true);
  });

  it('updates cached run preparation without rebuilding the Menu per resource progress', async () => {
    const harness = createHarness();
    Object.assign(harness.menuScene, {
      textures: { exists: () => true, get: () => ({ has: () => true, setFilter: () => undefined }) },
      anims: { exists: () => true },
      cache: { audio: { exists: () => true } },
      addPanelArt: () => undefined,
    });
    const previous = harness.menuScene.renderRebuildCount;
    harness.buttonByLabel('Play Contract')!.state.handlers.pointerup!();
    await vi.waitFor(() => expect(harness.sceneStart).toHaveBeenCalledOnce());
    expect(harness.menuScene.renderRebuildCount - previous).toBe(1);
  });

  it('renders every Mercenary as one graphical row from controller-owned art identities', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      addPanelArt: ReturnType<typeof vi.fn>;
      addCatalogIcon: ReturnType<typeof vi.fn>;
    };
    scene.addPanelArt = vi.fn();
    scene.addCatalogIcon = vi.fn();
    harness.buttonByLabel('Mercenary')!.state.handlers.pointerup!();

    expect(scene.addPanelArt).toHaveBeenCalledTimes(8);
    expect(scene.addPanelArt).toHaveBeenCalledWith(expect.anything(), expect.any(Number), expect.any(Number), 'character-portrait:scrap-tabby', 204, false, false, expect.any(Number));
    expect(scene.addCatalogIcon).toHaveBeenCalledWith(expect.anything(), expect.any(Number), expect.any(Number), 'weapon-icon:pistol:t1', 38, expect.any(Number));
    expect(scene.addCatalogIcon).toHaveBeenCalledWith(expect.anything(), expect.any(Number), expect.any(Number), 'ability-icon:scrap-burst', 46, expect.any(Number));
    expect(scene.addCatalogIcon).toHaveBeenCalledWith(expect.anything(), expect.any(Number), expect.any(Number), 'passive-icon:scrap-hoarder', 42, expect.any(Number));
  });

  it('rerenders a still-current Mercenary panel after a partial lazy resource success', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    let loadError: ((file: { key?: string }) => void) | undefined;
    const rendered = vi.fn(); const loaded = new Set<string>();
    const scene = new MenuScene() as unknown as {
      committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(event: string, listener: (file: { key?: string }) => void): void; off(): void; once(event: string, listener: () => void): void; image(): void; spritesheet(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureMercenaryPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      committedPanel: 'character', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: (event: string, listener: (file: { key?: string }) => void) => { if (event === 'loaderror') loadError = listener; },
        off: () => undefined, once: (event: string, listener: () => void) => { complete.set(event, listener); },
        image: () => undefined, spritesheet: () => undefined,
        start: () => {
          loaded.add('art-character-scrap-tabby');
          complete.get('filecomplete-spritesheet-art-character-scrap-tabby')?.();
          loadError?.({ key: 'art-weapon-icon-pistol-t1' });
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    await scene.ensureMercenaryPresentation(['character:scrap-tabby', 'weapon-icon:pistol:t1']);
    expect(rendered).toHaveBeenCalledOnce();
  });

  it('does not resurrect the Mercenary panel when its lazy closure completes after navigation', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>(); const rendered = vi.fn(); const loaded = new Set<string>();
    const scene = new MenuScene() as unknown as {
      committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; spritesheet(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureMercenaryPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      committedPanel: 'home', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: { on: () => undefined, off: () => undefined, once: (event: string, listener: () => void) => { complete.set(event, listener); }, spritesheet: () => undefined,
        start: () => { loaded.add('art-character-scrap-tabby'); complete.get('filecomplete-spritesheet-art-character-scrap-tabby')?.(); } },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    await scene.ensureMercenaryPresentation(['character:scrap-tabby']);
    expect(rendered).not.toHaveBeenCalled();
  });

  it('lazy-loads Compendium actor art, rerenders only the captured panel, and reuses cached resources', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>(); const rendered = vi.fn(); const loaded = new Set<string>();
    const start = vi.fn(() => {
      loaded.add('art-enemy-dust-mite');
      complete.get('filecomplete-spritesheet-art-enemy-dust-mite')?.();
    });
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; spritesheet(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensurePanelPresentation(panel: 'compendium', ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'compendium', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: { on: () => undefined, off: () => undefined, once: (event: string, listener: () => void) => { complete.set(event, listener); }, spritesheet: () => undefined, start },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    await scene.ensurePanelPresentation('compendium', ['enemy:dust-mite']);
    expect(start).toHaveBeenCalledOnce();
    expect(rendered).toHaveBeenCalledOnce();
    await scene.ensurePanelPresentation('compendium', ['enemy:dust-mite']);
    expect(start).toHaveBeenCalledOnce();
  });

  it('repaints the current panel when its queued art became cached by an overlapping prior-panel load', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>(); const rendered = vi.fn(); const loaded = new Set<string>();
    let finish!: () => void;
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; spritesheet(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensurePanelPresentation(panel: 'home' | 'compendium', ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'home', controller: { snapshot: () => ({ panel: 'compendium' }) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        spritesheet: () => undefined,
        start: () => { finish = () => { loaded.add('art-enemy-dust-mite'); complete.get('filecomplete-spritesheet-art-enemy-dust-mite')?.(); }; },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    const homeLoad = scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    scene.committedPanel = 'compendium';
    await scene.ensurePanelPresentation('compendium', ['enemy:dust-mite']);
    finish();
    await homeLoad;

    expect(rendered).toHaveBeenCalledOnce();
  });

  it('hydrates a drained same-panel closure once using the latest snapshot', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    const loaded = new Set<string>();
    let finish!: () => void;
    let selected = 'before';
    const rendered = vi.fn();
    const snapshot = vi.fn(() => ({ panel: 'home', selected }));
    const scene = new MenuScene() as unknown as {
      ensurePanelPresentation(panel: 'home', ids: readonly string[]): Promise<void>;
    };
    const start = vi.fn(() => {
      finish = () => {
        loaded.add('art-enemy-dust-mite');
        complete.get('filecomplete-spritesheet-art-enemy-dust-mite')?.();
      };
    });
    Object.assign(scene, {
      isLive: true, committedPanel: 'home', controller: { snapshot },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: { on: () => undefined, off: () => undefined, once: (event: string, listener: () => void) => { complete.set(event, listener); }, spritesheet: () => undefined, start },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    const pending = scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    await scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    selected = 'after-selection-and-resize';
    await Promise.resolve();
    finish();
    await pending;
    expect(start).toHaveBeenCalledOnce();
    expect(rendered).toHaveBeenCalledOnce();
    expect(snapshot).toHaveBeenCalledOnce();
    expect(rendered).toHaveBeenCalledWith({ panel: 'home', selected }, 'lazy-art-hydration');
    await scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    expect(rendered).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
  });

  it.each([false, true])('publishes one latest-state hydration after distinct queued batches (middle failure: %s)', async (failMiddle) => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const ids = ['enemy:dust-mite', 'enemy:scrap-sniper', 'enemy:trash-brute'] as const;
    const keys = ids.map(id => {
      const binding = art.bindingById(id);
      expect(binding, `live art binding for ${id}`).toBeDefined();
      return binding!.textureKey;
    });
    const complete = new Map<string, () => void>();
    const loaded = new Set<string>();
    const queued: string[] = [];
    const batches: Array<(success?: boolean) => void> = [];
    let error!: (file: { key: string }) => void;
    let selected = 'initial';
    const rendered = vi.fn();
    const snapshot = vi.fn(() => ({ panel: 'home', selected }));
    const scene = new MenuScene() as unknown as {
      panelArtLoading: boolean;
      ensurePanelPresentation(panel: 'home', ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'home', controller: { snapshot },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: (event: string, listener: typeof error) => { if (event === 'loaderror') error = listener; },
        off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        spritesheet: (key: string) => { queued.push(key); },
        start: () => {
          const keys = queued.splice(0);
          batches.push((success = true) => keys.forEach(key => {
            if (!success) error({ key });
            else {
              loaded.add(key);
              complete.get(`filecomplete-spritesheet-${key}`)?.();
            }
          }));
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    const waitForBatch = async (count: number) => {
      for (let step = 0; batches.length < count && step < 20; step++) await Promise.resolve();
      expect(batches).toHaveLength(count);
    };
    const pending = scene.ensurePanelPresentation('home', [ids[0]]);
    await scene.ensurePanelPresentation('home', [ids[1]]);
    await waitForBatch(1);
    batches[0]!();
    await waitForBatch(2);
    expect(rendered).not.toHaveBeenCalled();
    expect(scene.panelArtLoading).toBe(true);
    await scene.ensurePanelPresentation('home', [ids[2]]);
    selected = 'during-second-load';
    batches[1]!(!failMiddle);
    await waitForBatch(3);
    expect(rendered).not.toHaveBeenCalled();
    selected = 'after-selection-and-resize';
    batches[2]!();
    await pending;
    expect(loaded.has(keys[0]!)).toBe(true);
    expect(loaded.has(keys[1]!)).toBe(!failMiddle);
    expect(loaded.has(keys[2]!)).toBe(true);
    expect(scene.panelArtLoading).toBe(false);
    expect(rendered).toHaveBeenCalledOnce();
    expect(snapshot).toHaveBeenCalledOnce();
    expect(rendered).toHaveBeenCalledWith({ panel: 'home', selected }, 'lazy-art-hydration');
  });

  it.each(['empty', 'cached-and-failed'] as const)('settles a queued Compendium closure (%s)', async (kind) => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    const loaded = new Set<string>();
    const queued: string[] = [];
    const batches: Array<(success?: boolean) => void> = [];
    let error!: (file: { key: string }) => void;
    const rendered = vi.fn();
    const snapshot = vi.fn(() => ({ panel: 'compendium' }));
    const scene = new MenuScene() as unknown as {
      committedPanel: string; panelArtLoading: boolean;
      pendingPanelArtIds: Set<string>; pendingPanelArtRepaints: Set<string>;
      ensurePanelPresentation(panel: 'home' | 'compendium', ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'home', controller: { snapshot },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: (event: string, listener: typeof error) => { if (event === 'loaderror') error = listener; },
        off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        spritesheet: (key: string) => { queued.push(key); },
        start: () => {
          const keys = queued.splice(0);
          batches.push((success = true) => keys.forEach(key => {
            if (!success) error({ key });
            else {
              loaded.add(key);
              complete.get(`filecomplete-spritesheet-${key}`)?.();
            }
          }));
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    const waitForBatch = async (count: number) => {
      for (let step = 0; batches.length < count && step < 20; step++) await Promise.resolve();
      expect(batches).toHaveLength(count);
    };
    const pending = scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    await waitForBatch(1);
    scene.committedPanel = 'compendium';
    await scene.ensurePanelPresentation('compendium', kind === 'empty' ? [] : ['enemy:dust-mite', 'enemy:scrap-sniper']);
    batches[0]!();
    if (kind === 'cached-and-failed') {
      await waitForBatch(2);
      batches[1]!(false);
    }
    await pending;
    expect(scene.pendingPanelArtIds.size).toBe(0);
    expect(scene.pendingPanelArtRepaints.size).toBe(0);
    expect(scene.panelArtLoading).toBe(false);
    expect(loaded.has('art-enemy-dust-mite')).toBe(true);
    expect(loaded.has('art-enemy-scrap-sniper')).toBe(false);
    if (kind === 'empty') {
      expect(batches).toHaveLength(1);
      expect(rendered).not.toHaveBeenCalled();
      expect(snapshot).not.toHaveBeenCalled();
    } else {
      expect(rendered).toHaveBeenCalledOnce();
      expect(rendered).toHaveBeenCalledWith({ panel: 'compendium' }, 'lazy-art-hydration');
    }
  });

  it('revokes the outer hydration after scene restart during its queued second load', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    const loaded = new Set<string>();
    const queued: string[] = [];
    const batches: Array<() => void> = [];
    const rendered = vi.fn();
    const snapshot = vi.fn(() => ({ panel: 'home', activation: 'new' }));
    const scene = new MenuScene() as unknown as {
      panelArtGeneration: number; panelArtLoading: boolean; pendingPanelArtIds: Set<string>;
      resetMenuTextureLoadQueue(): void;
      ensurePanelPresentation(panel: 'home', ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'home', controller: { snapshot },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        spritesheet: (key: string) => { queued.push(key); },
        start: () => {
          const keys = queued.splice(0);
          batches.push(() => keys.forEach(key => {
            loaded.add(key);
            complete.get(`filecomplete-spritesheet-${key}`)?.();
          }));
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    const pending = scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    await scene.ensurePanelPresentation('home', ['enemy:scrap-sniper']);
    await Promise.resolve();
    batches[0]!();
    // Let the second real serialized loader begin, not a guessed wall-clock delay.
    for (let step = 0; batches.length < 2 && step < 20; step++) await Promise.resolve();
    expect(batches).toHaveLength(2);
    scene.resetMenuTextureLoadQueue();
    scene.panelArtGeneration += 1;
    scene.panelArtLoading = true; // Fresh activation owns this flag and request.
    scene.pendingPanelArtIds = new Set(['new-activation-request']);
    batches[1]!();
    await pending;
    expect(rendered).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
    expect(scene.panelArtLoading).toBe(true);
    expect([...scene.pendingPanelArtIds]).toEqual(['new-activation-request']);
  });

  it('serializes rapid Home and Mercenary art closures through the one scene loader', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    const loaded = new Set<string>();
    let finish!: () => void;
    const start = vi.fn(() => {
      finish = () => {
        loaded.add('art-enemy-dust-mite');
        complete.get('filecomplete-spritesheet-art-enemy-dust-mite')?.();
      };
    });
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; spritesheet(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensurePanelPresentation(panel: 'home', ids: readonly string[]): Promise<void>;
      ensureMercenaryPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'home', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: { on: () => undefined, off: () => undefined, once: (event: string, listener: () => void) => { complete.set(event, listener); }, spritesheet: () => undefined, start },
      getContext: () => harness.context, requireVisualArt: () => art, render: () => undefined,
    });

    const home = scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    const mercenary = scene.ensureMercenaryPresentation(['enemy:dust-mite']);
    await Promise.resolve();
    expect(start).toHaveBeenCalledOnce();
    finish();
    await Promise.all([home, mercenary]);
    expect(start).toHaveBeenCalledOnce();
  });

  it('does not let an old scene-lifetime panel-art load clear, drain, or repaint restarted state', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>(); const rendered = vi.fn(); const loaded = new Set<string>();
    let finish!: () => void;
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      panelArtGeneration: number; panelArtLoading: boolean; pendingPanelArtIds: Set<string>;
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; spritesheet(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensurePanelPresentation(panel: 'home', ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'home', controller: { snapshot: () => ({}) }, panelArtGeneration: 1,
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        spritesheet: () => undefined,
        start: () => { finish = () => { loaded.add('art-enemy-dust-mite'); complete.get('filecomplete-spritesheet-art-enemy-dust-mite')?.(); }; },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    const oldLoad = scene.ensurePanelPresentation('home', ['enemy:dust-mite']);
    await Promise.resolve();
    scene.panelArtGeneration = 2;
    scene.panelArtLoading = true;
    scene.pendingPanelArtIds.add('enemy:junk-rusher');
    finish();
    await oldLoad;

    expect(scene.panelArtLoading).toBe(true);
    expect(scene.pendingPanelArtIds).toEqual(new Set(['enemy:junk-rusher']));
    expect(rendered).not.toHaveBeenCalled();
  });

  it('keeps shared-list focus deterministic across wheel/touch scrolling and resize', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      handleResize(): void;
      navigator: { index: number };
      scrollRegion?: { scrollOffset: number };
    };
    const base = scene.controller.snapshot();
    const scrollingSnapshot = {
      ...base,
      panel: 'compendium',
      compendium: { ...base.compendium, entries: Array.from({ length: 50 }, (_, index) => ({ ...base.compendium.entries[index % base.compendium.entries.length]!, enemyId: `enemy-${index}`, name: `Compendium ${index}` })) },
    } as import('../src/ui/menus').MainMenuSnapshot;
    scene.controller.snapshot = () => scrollingSnapshot;
    scene.render(scrollingSnapshot);
    harness.input.emit('wheel', { isDown: false }, [], 0, 600);
    const afterWheel = scene.scrollRegion!.scrollOffset;
    expect(afterWheel).toBeGreaterThan(0);
    harness.input.emit('pointermove', { isDown: true, y: 500 });
    harness.input.emit('pointermove', { isDown: true, y: 300 });
    expect(scene.scrollRegion!.scrollOffset).toBeGreaterThan(afterWheel);

    for (let index = 0; index < 49; index += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }
    expect(scene.navigator.index).toBe(49);
    for (const [width, height] of [[360, 640], [390, 844], [844, 390], [1280, 720], [1920, 1080]]) {
      (harness.menuScene.scale as unknown as { width: number; height: number; displaySize: { width: number; height: number } }).width = width;
      (harness.menuScene.scale as unknown as { displaySize: { width: number; height: number } }).displaySize = { width, height };
      (harness.menuScene.scale as unknown as { height: number }).height = height;
      scene.handleResize();
      expect(scene.navigator.index).toBe(49);
      expect(scene.scrollRegion!.scrollOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it('clips a long menu with one shared stencil owner and closes it on rebuild', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      scrollObjects: Array<{ object: FakeObject }>;
    };
    const base = scene.controller.snapshot();
    const snapshot = {
      ...base, panel: 'compendium',
      compendium: { ...base.compendium, entries: Array.from({ length: 50 }, (_, index) => ({
        ...base.compendium.entries[index % base.compendium.entries.length]!,
        enemyId: `clip-owner-${index}`, name: `Clip Owner ${index}`,
      })) },
    } as import('../src/ui/menus').MainMenuSnapshot;
    scene.render(snapshot);
    const masked = harness.objects.filter(object => !object.state.destroyed && object.state.mask !== undefined);
    // A GeometryMask stencil clear/flush per row starves real rendering and
    // input at desktop sizes even though all texture resources have settled.
    expect(masked).toHaveLength(1);
    expect(masked[0]!.state.kind).toBe('container');
    const owner = masked[0]! as FakeObject & { children: FakeObject[] };
    expect(scene.scrollObjects.length).toBeGreaterThan(50);
    for (const { object } of scene.scrollObjects) {
      expect(object.state.mask).toBeUndefined();
      expect(owner.children).toContain(object);
    }
    const mask = owner.state.mask as { destroyed: boolean };
    scene.render({ ...base, panel: 'home' });
    expect(owner.state.destroyed).toBe(true);
    expect(mask.destroyed).toBe(true);
    expect(harness.objects.filter(object => !object.state.destroyed && object.state.mask !== undefined)).toHaveLength(0);
  });

  it('reports the complete live menu copy through the shared clip container', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as {
      loadoutUiDiagnostics(): { copy: string[] };
      scrollMaskContainer?: { children: FakeObject[] };
    };
    expect(scene.scrollMaskContainer?.children.length).toBeGreaterThan(0);
    expect(scene.loadoutUiDiagnostics().copy.slice().sort()).toEqual(harness.textContents().slice().sort());
  });

  it('preserves authored card and later modal paint order when grouping clip ownership', () => {
    const harness = createHarness();
    const factory = createFakeScene(harness.context).environment.add;
    const root = factory.container(0, 0);
    const label = factory.text(20, 40, 'Foreground label', { resolution: 2 });
    const card = factory.rectangle(20, 40, 160, 44);
    const modalFrame = factory.rectangle(0, 0, 390, 844);
    const modalLabel = factory.text(30, 200, 'PREPARING CONTRACT', { resolution: 2 });
    // Registration follows creation; authoring moves the card below its label.
    // A later modal must remain above the clipped group as well.
    root.add([card, label, modalFrame, modalLabel]);
    const scene = harness.menuScene as unknown as {
      createScrollMask(root: unknown): void;
      scrollObjects: Array<{ object: FakeObject; x: number; y: number }>;
      scrollMaskContainer: FakeObject & { children: FakeObject[] };
      scrollViewportTop: number; scrollViewportBottom: number;
    };
    scene.scrollObjects = [{ object: label, x: 20, y: 40 }, { object: card, x: 20, y: 40 }];
    scene.scrollViewportTop = 20; scene.scrollViewportBottom = 200;
    scene.createScrollMask(root);
    expect(scene.scrollMaskContainer.children).toEqual([card, label]);
    expect(root.children).toEqual([scene.scrollMaskContainer, modalFrame, modalLabel]);
  });

  it('paints the launch modal above scrolling content in the genuine Training render', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      root: FakeObject & { children: FakeObject[] };
      controller: { open(panel: 'training'): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      runLaunchState: string;
    };
    const snapshot = scene.controller.open('training');
    scene.runLaunchState = 'loading';
    scene.render(snapshot);
    const painted: FakeObject[] = [];
    const flatten = (node: FakeObject): void => {
      const children = (node as FakeObject & { children?: FakeObject[] }).children;
      if (children) children.forEach(flatten);
      else painted.push(node);
    };
    flatten(scene.root);
    const modal = painted.findIndex(object => object.state.kind === 'text'
      && object.state.text.startsWith('PREPARING CONTRACT'));
    const controls = painted.flatMap((object, index) => object.state.handlers.pointerup ? [index] : []);
    expect(modal).toBeGreaterThan(-1);
    expect(controls.length).toBeGreaterThan(0);
    expect(Math.max(...controls)).toBeLessThan(modal);
  });

  it('clips shared-list cards continuously while keeping clipped-off hit areas inert', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      applyScrollViewport(): void;
      navigator: { index: number };
      focusables: FakeObject[];
      scrollViewportTop: number;
      scrollRegion: { scrollOffset: number; scrollBy(delta: number): void };
      scrollItemBounds: Map<number, { top: number; bottom: number }>;
      scrollMaskContainer: FakeObject & { children: FakeObject[] };
    };
    const base = scene.controller.snapshot();
    const scrollingSnapshot = {
      ...base,
      panel: 'compendium',
      compendium: {
        ...base.compendium,
        entries: Array.from({ length: 50 }, (_, index) => ({
          ...base.compendium.entries[index % base.compendium.entries.length]!,
          enemyId: `continuous-scroll-${index}`,
          name: `Continuous Scroll ${index}`,
        })),
      },
    } as import('../src/ui/menus').MainMenuSnapshot;
    scene.render(scrollingSnapshot);

    const targetIndex = 1;
    const target = scene.focusables[targetIndex]!;
    const originalBounds = scene.scrollItemBounds.get(targetIndex)!;
    scene.scrollRegion.scrollBy(originalBounds.top - scene.scrollViewportTop + 1);
    scene.applyScrollViewport();

    expect(target.state.visible).toBe(true);
    expect(target.state.interactive).toBe(true);
    expect(target.state.mask).toBeUndefined();
    expect(scene.scrollMaskContainer.state.mask).toBeDefined();
    expect(scene.scrollMaskContainer.children).toContain(target);
    expect(originalBounds.top - scene.scrollRegion.scrollOffset).toBeLessThan(scene.scrollViewportTop);

    const partialOffset = scene.scrollRegion.scrollOffset;
    target.state.handlers.pointerover!({ y: scene.scrollViewportTop + 2 });
    expect(scene.scrollRegion.scrollOffset).toBe(partialOffset);

    const priorFocus = scene.navigator.index;
    target.state.handlers.pointerup!({ y: scene.scrollViewportTop - 1 });
    expect(scene.navigator.index).toBe(priorFocus);

    scene.scrollRegion.scrollBy(
      originalBounds.bottom - scene.scrollViewportTop + 1 - scene.scrollRegion.scrollOffset,
    );
    scene.applyScrollViewport();
    // The geometry mask performs the visual crop. The row stays alive while
    // it crosses the edge so scrolling is continuous; only its hit area is
    // disabled once the whole row has left the viewport.
    expect(target.state.visible).toBe(true);
    expect(target.state.interactive).toBe(false);
  });

  it('rebuilds the Achievement focus grid across portrait and wide resize without losing its selected card', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      handleResize(): void;
      navigator: { index: number; columns: number };
    };
    const base = scene.controller.snapshot();
    const achievements = Array.from({ length: 10 }, (_, index) => ({
      ...base.achievements.achievements[index % base.achievements.achievements.length]!,
      id: `achievement-grid-${index}`,
      name: `Achievement ${index}`,
    }));
    const snapshot = { ...base, panel: 'achievements' as const, achievements: { ...base.achievements, achievements } };
    scene.controller.snapshot = () => snapshot;
    scene.render(snapshot);
    harness.keyboard.keydown('ArrowRight'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('ArrowRight'); harness.menuScene.update(0, 16);
    harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    expect(scene.navigator).toMatchObject({ index: 1, columns: 1 });

    (harness.menuScene.scale as unknown as { width: number; height: number; displaySize: { width: number; height: number } }).width = 844;
    (harness.menuScene.scale as unknown as { height: number; displaySize: { width: number; height: number } }).height = 390;
    (harness.menuScene.scale as unknown as { displaySize: { width: number; height: number } }).displaySize = { width: 844, height: 390 };
    scene.handleResize();
    expect(scene.navigator).toMatchObject({ index: 1, columns: 3 });

    (harness.menuScene.scale as unknown as { width: number; height: number; displaySize: { width: number; height: number } }).width = 390;
    (harness.menuScene.scale as unknown as { height: number; displaySize: { width: number; height: number } }).height = 844;
    (harness.menuScene.scale as unknown as { displaySize: { width: number; height: number } }).displaySize = { width: 390, height: 844 };
    scene.handleResize();
    expect(scene.navigator).toMatchObject({ index: 1, columns: 1 });
  });

  it('treats a touch drag as scrolling, resets its baseline, and never activates the dragged row', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      focusables: FakeObject[];
      navigator: { index: number };
      scrollRegion?: { scrollOffset: number };
    };
    const base = scene.controller.snapshot();
    scene.render({
      ...base,
      panel: 'character',
      character: { ...base.character, characters: Array.from({ length: 20 }, (_, index) => ({ ...base.character.characters[index % base.character.characters.length]!, id: `character-${index}`, name: `Character ${index}` })) },
    });
    const confirms: string[] = [];
    harness.bus.on('ui:confirm', () => confirms.push('confirm'));
    const row = scene.focusables[0]!;
    harness.input.emit('pointerdown', { isDown: true, y: 500 });
    harness.input.emit('pointermove', { isDown: true, y: 300 });
    const afterFirstDrag = scene.scrollRegion!.scrollOffset;
    row.emit('pointerup');
    expect(confirms).toEqual([]);
    harness.input.emit('pointerup', { isDown: false, y: 300 });
    harness.input.emit('pointerdown', { isDown: true, y: 500 });
    harness.input.emit('pointermove', { isDown: true, y: 490 });
    expect(scene.scrollRegion!.scrollOffset - afterFirstDrag).toBeLessThanOrEqual(10);
    // Controller navigation after a touch gesture must resume from the
    // scene's logical focus, not from a stale touch-row identity.
    const pad = new MockGamepad();
    harness.input.gamepad!.connect(pad);
    pad.setButton(13, true);
    harness.menuScene.update(0, 16);
    pad.setButton(13, false);
    harness.menuScene.update(0, 16);
    expect(scene.navigator.index).toBe(1);
  });

  it('does not turn normal home-screen touch jitter into a second-tap requirement', () => {
    const harness = createHarness();
    const confirms: string[] = [];
    harness.bus.on('ui:confirm', () => confirms.push('confirm'));

    // The home panel has no scroll viewport. A mobile touch can drift a few
    // logical pixels between down/up, but that must remain a button tap.
    harness.input.emit('pointerdown', { isDown: true, y: 500 });
    harness.input.emit('pointermove', { isDown: true, y: 490 });
    harness.buttonByLabel('Play Contract')!.state.handlers['pointerup']!();

    expect(confirms).toEqual(['confirm']);
  });

  it('projects injected top/bottom/side insets and keeps the hint and Back inside the safe rect', () => {
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

      // Sub-panel: Back is anchored above the bottom margin band with its
      // full bounds clear of the injected insets on every side.
      harness.buttonByLabel('Mercenary')!.state.handlers['pointerup']!();
      const back = liveText('Back');
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
        'Play Contract',
        'Change Contract',
        'Mercenary',
        'Loadout',
        'Career',
        'Training',
        'Settings',
        'Tap a choice',
      ]),
    );
    expect(objects.filter((object) => object.state.kind === 'container')).toHaveLength(1);
    expect(textContents()).toEqual(expect.arrayContaining([
      'Scrap Tabby  •  0 Scrap',
      'NEXT CONTRACT  •  Junkyard 1',
      'First Scavenge',
      'Junkyard Lot  •  Eliminate 25 threats',
      'FIRST CLEAR  35 Scrap + Standard Barrel T1',
    ]));
    expect(textContents().some((text) => text.includes('THREATS'))).toBe(false);
  });

  it('uses the declared card width for sparse-menu actions instead of shrink-wrapping labels', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();

    const equipment = harness.buttonByLabel('Equipment')!;
    const gunsmith = harness.buttonByLabel('Gunsmith')!;
    expect(equipment.state.width).toBeGreaterThanOrEqual(44);
    expect(equipment.state.width).toBeGreaterThan(equipment.state.text.length * 8);
    expect(gunsmith.state.width).toBe(equipment.state.width);
    expect(gunsmith.state.x).toBe(equipment.state.x + equipment.state.width + 10);
    expect(gunsmith.state.y).toBe(equipment.state.y);
  });

  it('renders a bounded narrow Home threat preview as enemy art rather than text', () => {
    const harness = createHarness({ create: false });
    const scale = harness.menuScene.scale as unknown as {
      width: number; height: number; displaySize: { width: number; height: number };
    };
    scale.width = 360;
    scale.height = 640;
    scale.displaySize = { width: 360, height: 640 };
    harness.menuScene.create();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      addPanelArt(...args: unknown[]): void;
      currentViewport: UiViewport;
    };
    const base = scene.controller.snapshot();
    const expandedThreats = Array.from({ length: 12 }, (_, index) => ({
      enemyId: `enemy-${index}`,
      name: `Threat ${index}`,
      actorArtId: 'enemy:dust-mite',
    }));
    const stages = base.stage.stages.map((stage, index) => index === 0
      ? { ...stage, selected: true, threats: expandedThreats }
      : { ...stage, selected: false });
    const addPanelArt = vi.fn();
    scene.addPanelArt = addPanelArt;

    scene.render({ ...base, panel: 'home', stage: { ...base.stage, stages } });

    const homeCopy = harness.textContents().find((text) => text.includes('NEXT CONTRACT'))!;
    expect(homeCopy).toBe('NEXT CONTRACT  •  Junkyard 1');
    expect(harness.textContents().join(' ')).not.toContain('THREATS');
    expect(harness.textContents().join(' ')).not.toContain('Threat 0');
    expect(addPanelArt.mock.calls.filter((call) => call[3] === 'enemy:dust-mite')).toHaveLength(4);
    const safeBottom = 640 - edgeMargin(scene.currentViewport, 'bottom');
    const homeActions = harness.objects.filter((object) =>
      object.state.kind === 'text' && object.state.handlers.pointerup && !object.state.destroyed);
    expect(homeActions).toHaveLength(7);
    for (const action of homeActions) {
      const paddedHeight = action.getBounds().height;
      expect(action.state.y + paddedHeight, action.state.text).toBeLessThanOrEqual(safeBottom);
    }

    scene.render({ ...base, panel: 'stage', stage: { ...base.stage, stages } });
    expect(harness.textContents().join(' ')).not.toContain('Threat 11');
    expect(addPanelArt.mock.calls.filter((call) => call[3] === 'enemy:dust-mite')).toHaveLength(16);
  });

  it('keeps the Contract hero and every 44px+ Home action inside all acceptance viewports', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as { handleResize(): void };
    for (const [width, height] of [[360, 640], [390, 844], [844, 390], [1280, 720], [1920, 1080]]) {
      const scale = harness.menuScene.scale as unknown as { width: number; height: number; displaySize: { width: number; height: number } };
      scale.width = width; scale.height = height; scale.displaySize = { width, height };
      scene.handleResize();
      const viewport = (harness.menuScene as unknown as { currentViewport: UiViewport }).currentViewport;
      const bottom = height - edgeMargin(viewport, 'bottom');
      const buttons = harness.objects.filter((object) => object.state.kind === 'text' && object.state.handlers.pointerup && !object.state.destroyed);
      expect(buttons).toHaveLength(7);
      for (const button of buttons) {
        // Fixed Text bounds already include padding; use the same bounds as
        // chrome, focus rings and the pointer target without counting it twice.
        const paddedHeight = button.getBounds().height;
        expect(paddedHeight).toBeGreaterThanOrEqual(minimumHitTarget(viewport));
        expect(button.state.y + paddedHeight, `${width}x${height} ${button.state.text}`).toBeLessThanOrEqual(bottom);
      }
    }
  });

  it('shows campaign completion as a replay frontier and never wraps the hero back to Next Contract', () => {
    const harness = createHarness();
    for (const stage of harness.context.stages.allStages()) harness.context.completeStage(stage.id, 60_000);
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
    };
    scene.render(scene.controller.snapshot());

    expect(harness.textContents().some((text) => text.includes('CAMPAIGN COMPLETE — REPLAY'))).toBe(true);
    expect(harness.textContents()).toEqual(expect.arrayContaining(['Forge Warden', 'Forge Foundry  •  Defeat Forge Warden']));
    expect(harness.textContents()).toContain('Replay Contract');
    expect(harness.textContents().some((text) => text.includes('NEXT CONTRACT'))).toBe(false);
  });

  it('routes through one Loadout hub before Equipment or Gunsmith', () => {
    const harness = createHarness();
    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    expect(harness.textContents()).toEqual(expect.arrayContaining(['LOADOUT', 'Equipment', 'Gunsmith', 'Return to Contract']));
    expect(harness.textContents()).toEqual(expect.arrayContaining(['EQUIPMENT • WHOLE LOADOUT', 'GUNSMITH • ENGINEERED WEAPON FAMILY', 'HELMET\nEmpty', 'ARMOUR\nEmpty', 'GLOVES\nEmpty', 'BOOTS\nEmpty']));
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    expect(harness.textContents()).toContain('AVAILABLE BLUEPRINTS');
    harness.buttonByLabel('Back')!.state.handlers.pointerup!();
    expect(harness.textContents()).toContain('LOADOUT');
  });

  it('groups Contract cards by chapter and keeps locked rows inert with player-facing requirements', () => {
    const harness = createHarness();
    harness.buttonByLabel('Change Contract')!.state.handlers.pointerup!();
    expect(harness.textContents()).toEqual(expect.arrayContaining(['JUNKYARD', 'FORGE']));
    const locked = harness.buttonByLabel('Scrap Run')!;
    expect(locked.state.interactive).toBe(false);
    expect(harness.textContents()).toContain('Junkyard Lot  •  Collect 14 Scrap\nLOCKED — Clear First Scavenge.');
  });

  it('keeps scroll headings and reward detail independent from prior focus-row ownership', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      scrollObjects: Array<{ object: FakeObject; ownerIndex?: number }>;
    };
    const snapshot = scene.controller.snapshot();
    scene.render({ ...snapshot, panel: 'stage' });

    const independentCopy = scene.scrollObjects.filter(({ object }) =>
      object.state.text === 'JUNKYARD' || object.state.text.startsWith('First clear:'),
    );
    expect(independentCopy.length).toBeGreaterThan(0);
    expect(independentCopy.every((entry) => entry.ownerIndex === undefined)).toBe(true);
  });

  it('lays out the complete selected-Contract threat roster as bounded enemy icons', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      safeRightMargin: number;
      addPanelArt: ReturnType<typeof vi.fn>;
    };
    const base = scene.controller.snapshot();
    const stages = base.stage.stages.map((stage, index) => index === 0 ? {
      ...stage,
      selected: true,
      threats: Array.from({ length: 12 }, (_, threatIndex) => ({
        enemyId: `enemy-${threatIndex}`,
        name: `Long Threat Name ${threatIndex}`,
        actorArtId: 'enemy:dust-mite',
      })),
    } : { ...stage, selected: false });
    scene.addPanelArt = vi.fn();
    scene.render({ ...base, panel: 'stage', stage: { ...base.stage, stages } });

    const threatCalls = scene.addPanelArt.mock.calls.filter((call) => call[3] === 'enemy:dust-mite');
    expect(threatCalls).toHaveLength(12);
    expect(threatCalls.every((call) => Number(call[1]) + Number(call[4]) / 2 <= 390 - scene.safeRightMargin)).toBe(true);
    expect(harness.textContents().join(' ')).not.toContain('Long Threat Name');
  });

  it('includes a tall selected final-Contract detail block in the narrow shared-scroll extent', () => {
    const harness = createHarness({ create: false });
    const scale = harness.menuScene.scale as unknown as { width: number; displaySize: { width: number } };
    scale.width = 360;
    scale.displaySize.width = 360;
    harness.menuScene.create();
    const scene = harness.menuScene as unknown as {
      controller: { snapshot(): import('../src/ui/menus').MainMenuSnapshot };
      render(snapshot: import('../src/ui/menus').MainMenuSnapshot): void;
      scrollViewportTop: number;
      scrollRegion: { contentHeight: number; viewportHeight: number; scrollOffset: number; scrollBy(delta: number): void; includeContentBottom(bottom: number): void };
      navigator: { index: number };
    };
    const base = scene.controller.snapshot();
    const finalIndex = base.stage.stages.length - 1;
    const stages = base.stage.stages.map((stage, index) => ({
      ...stage,
      locked: false,
      selected: index === finalIndex,
      threats: index === finalIndex ? Array.from({ length: 20 }, (_, threatIndex) => ({
        enemyId: `enemy-${threatIndex}`, name: `Threat ${threatIndex}`, actorArtId: 'enemy:dust-mite',
      })) : stage.threats,
    }));
    scene.render({ ...base, panel: 'stage', stage: { ...base.stage, selectedStageId: stages[finalIndex]!.id, stages } });

    const details = harness.objects.filter((object) => object.state.text.startsWith('First clear:'));
    expect(details).toHaveLength(1);
    const detailBottom = Math.max(...details.map((detail) => detail.state.y + detail.state.height));
    expect(scene.scrollRegion.contentHeight).toBeGreaterThanOrEqual(detailBottom - scene.scrollViewportTop);
    scene.scrollRegion.scrollBy(10_000);
    expect(scene.scrollRegion.scrollOffset).toBeGreaterThanOrEqual(
      detailBottom - scene.scrollViewportTop - scene.scrollRegion.viewportHeight,
    );

    // Restore focus-driven position, then prove controller Down reveals the
    // selected detail tail before focus is allowed to leave for fixed Back.
    scene.render({ ...base, panel: 'stage', stage: { ...base.stage, selectedStageId: stages[finalIndex]!.id, stages } });
    // The Phaser production Text reports its wrapped height. The lightweight
    // fake does not, so extend the same shared detail extent to represent the
    // wrapped N+1 roster at 360px.
    scene.scrollRegion.includeContentBottom(detailBottom + 200);
    for (let index = 0; index < finalIndex; index += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }
    expect(scene.navigator.index).toBe(finalIndex);
    const rowOffset = scene.scrollRegion.scrollOffset;
    harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    expect(scene.navigator.index).toBe(finalIndex);
    expect(scene.scrollRegion.scrollOffset).toBeGreaterThan(rowOffset);
    harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
    harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    expect(scene.navigator.index).toBe(finalIndex + 1);
  });

  it('renders discovered Compendium entries with controller-owned actor art identities', () => {
    const harness = createHarness();
    harness.context.recordCompendiumDiscovery('dust-mite', 'encountered');
    const addPanelArt = vi.fn();
    (harness.menuScene as unknown as { addPanelArt: typeof addPanelArt }).addPanelArt = addPanelArt;
    harness.buttonByLabel('Career')!.state.handlers.pointerup!();
    harness.buttonByLabel('Compendium')!.state.handlers.pointerup!();
    expect(addPanelArt).toHaveBeenCalledWith(expect.anything(), expect.any(Number), expect.any(Number), 'enemy-portrait:dust-mite', 108, false, true, expect.any(Number));
  });

  it('keeps discovered Compendium copy inside the narrow safe edge after reserving its actor-art column', () => {
    const harness = createHarness();
    harness.context.recordCompendiumDiscovery('dust-mite', 'defeated');
    harness.buttonByLabel('Career')!.state.handlers.pointerup!();
    harness.buttonByLabel('Compendium')!.state.handlers.pointerup!();

    const row = harness.objects.find((object) => object.state.text.includes('Behaviour:'))!;
    const wrapWidth = (row.state.style.wordWrap as { width: number }).width;
    const safeRightMargin = (harness.menuScene as unknown as { safeRightMargin: number }).safeRightMargin;
    expect(row.state.x).toBeGreaterThan(16);
    expect(row.state.x + wrapWidth + row.state.padding.left + row.state.padding.right).toBeLessThanOrEqual(390 - safeRightMargin);
  });

  it('renders unlocked Equipment fabrication blueprints in the player-facing Equipment panel', () => {
    const harness = createHarness();
    const addCatalogIcon = vi.fn();
    (harness.menuScene as unknown as { addCatalogIcon: typeof addCatalogIcon }).addCatalogIcon = addCatalogIcon;

    harness.buttonByLabel('Loadout')!.state.handlers['pointerup']!();
    harness.buttonByLabel('Equipment')!.state.handlers['pointerup']!();

    expect(harness.textContents()).toContain('AVAILABLE BLUEPRINTS');
    expect(harness.textContents()).toContain('Commando Helmet\nFABRICABLE • 100 Scrap');
    expect(harness.textContents().some((text) => text.includes('Commando Armour'))).toBe(false);
    harness.buttonByLabel('Commando Helmet\nFABRICABLE • 100 Scrap')!.state.handlers.pointerup!();
    expect(harness.textContents().join('\n')).toContain('+5% Fire Rate [All Weapons]');
    expect(harness.textContents()).toContain('Fabricate for 100 Scrap');
    expect(addCatalogIcon).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number), 'equipment-icon:commando-helmet', 60, expect.any(Number),
    );
    expect(addCatalogIcon).toHaveBeenCalledWith(
      expect.anything(), expect.any(Number), expect.any(Number), 'equipment-set-icon:commando', 34, expect.any(Number),
    );
  });

  it('keeps a populated Equipment summary inside the compact-landscape scroll surface', () => {
    const harness = createHarness();
    harness.context.updateEquipment(() => ({
      equipment: { 'owned:equipment-commando-helmet': { equipmentId: 'equipment:commando-helmet', tier: 1 } },
      loadout: { helmet: 'owned:equipment-commando-helmet' },
    }));
    const scene = harness.menuScene as unknown as {
      handleResize(): void;
      scrollViewportTop: number;
      scrollViewportBottom: number;
      scrollObjects: Array<{ object: FakeObject }>;
    };
    const scale = harness.menuScene.scale as unknown as {
      width: number; height: number; displaySize: { width: number; height: number };
    };
    scale.width = 844;
    scale.height = 390;
    scale.displaySize = { width: 844, height: 390 };
    scene.handleResize();

    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    harness.buttonByLabel('Equipment')!.state.handlers.pointerup!();
    harness.menuScene.update(0, 16); // re-arm after the accepted pointer transition

    expect(scene.scrollViewportTop).toBeLessThan(scene.scrollViewportBottom);
    expect(scene.scrollObjects.some(({ object }) => object.state.text === 'HELMET\nCommando Helmet\nT1 • EQUIPPED')).toBe(true);
    expect(scene.scrollObjects.some(({ object }) => object.state.text === 'ACTIVE SETS')).toBe(true);
    expect(harness.objects.some((object) => object.state.text === 'Commando Helmet\nT1 • EQUIPPED')).toBe(true);
    const scrollRegion = (scene as unknown as {
      scrollRegion: { scrollOffset: number };
    }).scrollRegion;
    expect(scrollRegion.scrollOffset).toBe(0);
    for (let index = 0; index < 5; index += 1) {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    }
    expect(scrollRegion.scrollOffset).toBeGreaterThan(0);
  });

  it.each([
    { label: 'Mercenary', heading: 'Mercenary' },
    { label: 'Career', heading: 'Career' },
    { label: 'Settings', heading: 'Settings' },
  ])('clicking the $label home button re-renders its panel', ({ label, heading }) => {
    const harness = createHarness();

    const button = harness.buttonByLabel(label);
    expect(button).toBeDefined();
    button!.state.handlers['pointerup']!();

    // The target panel is actually painted ...
    expect(harness.textContents()).toContain(heading);
    expect(harness.textContents()).not.toContain('Play Contract');
    // ... because the old root was destroyed and a single live root remains,
    // i.e. the display tree was rebuilt instead of left frozen.
    const liveContainers = harness.objects.filter(
      (object) => object.state.kind === 'container' && !object.state.destroyed && object.parentContainer === undefined,
    );
    expect(liveContainers).toHaveLength(1);
    const destroyedRoots = harness.objects.filter(
      (object) => object.state.kind === 'container' && object.state.destroyed,
    );
    expect(destroyedRoots).toHaveLength(1);
  });

  it('navigates panels with keyboard focus and Esc returns home', () => {
    const harness = createHarness();

    harness.keyboard.keydown('ArrowDown');
    harness.menuScene.update(0, 16);
    harness.keyboard.keyup('ArrowDown');
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('ArrowDown'); // focus moves to Mercenary
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('Enter');
    harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('Mercenary');

    harness.keyboard.keyup('ArrowDown');
    harness.keyboard.keyup('Enter');
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('Escape');
    harness.menuScene.update(0, 16);
    expect(harness.textContents()).toContain('Play Contract');
    expect(harness.textContents()).not.toContain('✓ Scrap Tabby');
  });

  it('navigates the illustrated Home card grid spatially instead of stepping sideways on Down', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };

    press('ArrowDown');
    expect(seams.navigator.index).toBe(1); // Change Contract, full width
    press('ArrowDown');
    expect(seams.navigator.index).toBe(2); // Mercenary, left column
    press('ArrowRight');
    expect(seams.navigator.index).toBe(3); // Loadout, right column
    press('ArrowDown');
    expect(seams.navigator.index).toBe(5); // Training, same column
    press('ArrowLeft');
    expect(seams.navigator.index).toBe(4); // Career, paired card
    press('ArrowDown');
    expect(seams.navigator.index).toBe(6); // Settings, full width
  });

  it('navigates compact-landscape Home as the roomy 4+3 gallery it renders', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      navigator: { index: number };
      handleResize(): void;
    };
    const scale = harness.menuScene.scale as unknown as {
      width: number; height: number; displaySize: { width: number; height: number };
    };
    scale.width = 844;
    scale.height = 390;
    scale.displaySize = { width: 844, height: 390 };
    scene.handleResize();
    const events: string[] = [];
    harness.bus.on('ui:navigate', () => events.push('ui:navigate'));
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };

    expect(scene.navigator.index).toBe(0);
    press('ArrowRight');
    expect(scene.navigator.index).toBe(1);
    press('ArrowDown');
    expect(scene.navigator.index).toBe(4);
    press('ArrowLeft');
    expect(scene.navigator.index).toBe(6);
    expect(events).toHaveLength(3);
  });

  it('keeps every compact sparse-menu action clear of Back', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as { handleResize(): void; focusables: FakeObject[]; navigator: { index: number } };
    const scale = harness.menuScene.scale as unknown as {
      width: number; height: number; displaySize: { width: number; height: number };
    };
    scale.width = 844;
    scale.height = 390;
    scale.displaySize = { width: 844, height: 390 };
    scene.handleResize();
    const expectClearOfBack = (labels: readonly string[]) => {
      const back = harness.buttonByLabel('Back') ?? harness.buttonByLabel('Return to Contract')!;
      for (const label of labels) {
        const target = harness.buttonByLabel(label)!;
        const overlaps = target.state.x < back.state.x + back.state.width
          && target.state.x + target.state.width > back.state.x
          && target.state.y < back.state.y + back.state.height
          && target.state.y + target.state.height > back.state.y;
        expect(overlaps, label).toBe(false);
        expect(target.state.interactive, label).toBe(true);
      }
    };

    harness.buttonByLabel('Loadout')!.state.handlers.pointerup!();
    for (const label of ['Equipment', 'Gunsmith']) {
      for (let step = 0; step < scene.focusables.length && scene.focusables[scene.navigator.index]?.state.text !== label; step += 1) {
        harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
        harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
      }
      expectClearOfBack([label]);
    }
    harness.buttonByLabel('Return to Contract')!.state.handlers.pointerup!();
    harness.buttonByLabel('Back')!.state.handlers.pointerup!();

    harness.buttonByLabel('Career')!.state.handlers.pointerup!();
    expectClearOfBack(['Next Goals', 'Achievements', 'Compendium']);
    harness.buttonByLabel('Next Goals')!.state.handlers.pointerup!();
    expect(harness.textContents().some((copy) => copy.includes('Defeat your first enemy.'))).toBe(true);
    expectClearOfBack(['Choose Contract']);
    harness.buttonByLabel('Back')!.state.handlers.pointerup!();
    harness.buttonByLabel('Back')!.state.handlers.pointerup!();

    harness.buttonByLabel('Settings')!.state.handlers.pointerup!();
    expectClearOfBack(['Mute: Off', 'Music Volume: 70%', 'SFX Volume: 80%', 'Reduced Motion: Off']);
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

    press(13);
    press(13); // D-pad down → Mercenary
    press(0); // bottom face confirm → Mercenary panel
    expect(harness.textContents()).toContain('Mercenary');
    expect(down).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(up).not.toHaveBeenCalled();

    press(1); // right face back → home
    expect(harness.textContents()).toContain('Play Contract');
    expect(down).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(up).not.toHaveBeenCalled();
  });

  it('moves focus rings without rerasterizing unchanged labels and restores a changed palette', () => {
    const harness = createHarness();
    const labels = harness.objects.filter(object => object.state.kind === 'text'
      && object.state.handlers.pointerup && !object.state.destroyed);
    const writes = labels.map(label => vi.spyOn(label, 'setStyle'));
    const press = () => {
      harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
      harness.keyboard.keyup('ArrowDown'); harness.menuScene.update(0, 16);
    };
    const ring = () => harness.objects.filter(object => object.state.kind === 'rect'
      && !object.state.destroyed && object.state.strokeColor === FocusStroke.color
      && object.state.strokeAlpha === FocusStroke.alpha);
    press();
    const first = ring(); expect(first).toHaveLength(1);
    press(); expect(ring()).toHaveLength(1); expect(ring()[0]).not.toBe(first[0]);
    writes.forEach(write => expect(write).not.toHaveBeenCalled());
    labels[0]!.setStyle({ color: '#000000' }); writes.forEach(write => write.mockClear());
    press();
    expect(labels[0]!.state.style.color).toBe('#f7f1d5');
    expect(writes[0]).toHaveBeenCalledOnce();
    writes.slice(1).forEach(write => expect(write).not.toHaveBeenCalled());
    expect(ring()).toHaveLength(1);
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
    // Home → Settings through the left spatial column.
    for (let i = 0; i < 4; i += 1) press('ArrowDown');
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
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Mercenary');
    expect(seams.navigator.index).toBe(0);

    // The roster has two characters, so the last selectable row is 1
    // (row 2 would be Back).
    press('ArrowDown');
    expect(seams.navigator.index).toBe(1);
    press('Enter');
    // The row re-renders with its selection marker; the exact row stays focused.
    expect(harness.textContents()).toContain('Mercenary');
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
    // Home → Settings, then walk to Back and return home.
    for (let i = 0; i < 4; i += 1) press('ArrowDown');
    press('Enter');
    expect(seams.navigator.index).toBe(0);

    for (let i = 0; i < 4; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Play Contract');
    expect(seams.navigator.index).toBe(0);

    // Home → Mercenary resets to the first character row.
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Mercenary');
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
    for (let i = 0; i < 4; i += 1) press('ArrowDown');
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
    expect(harness.textContents()).toContain('Play Contract');
    expect(harness.textContents()).not.toContain('Something went wrong — press Esc to retry');
    expect(events).toEqual(['ui:back']);
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Mercenary');
    expect(events).toEqual(['ui:back', 'ui:navigate', 'ui:navigate', 'ui:confirm']);
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
    expect(harness.textContents()).toContain('Play Contract');

    // The rebuild fails LATE: skip the 7 home buttons' init strokes so the
    // throw lands on the 8th (applyFocus, after the new hint was created and
    // assigned at renderHome) but before publication. The catch must clear
    // this.hint or the next mode transition calls setText() on the destroyed
    // Text (real Phaser 3.90 nulls the frame on destroy).
    harness.failNextStroke(8); // 7 buttons' init strokes + 1; fail on applyFocus
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
    { name: 'home', directions: [], expected: ['Play Contract', 'Change Contract', 'Mercenary', 'Loadout', 'Career', 'Training', 'Settings'] },
    { name: 'mercenary', directions: ['ArrowDown', 'ArrowDown'], expected: ['✓ Scrap Tabby', 'Bolt Hound 🔒', 'Volt Lynx 🔒', 'Brass Boar 🔒', 'Ember Cougar 🔒', 'Scrap Weasel 🔒', 'Rattle Raptor 🔒', 'Piston Ram 🔒', 'Back'] },
    { name: 'career', directions: ['ArrowDown', 'ArrowDown', 'ArrowDown'], expected: ['Next Goals', 'Achievements', 'Compendium', 'Back'] },
    { name: 'training', directions: ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown'], expected: ['Start Training', 'Back'] },
    { name: 'settings', directions: ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown'], expected: ['Mute: Off', 'Music Volume: 70%', 'SFX Volume: 80%', 'Reduced Motion: Off', 'Back'] },

  ])('registers the exact V4 focus-target order/count with exactly one FocusStroke ring (F6)', ({ directions, expected }) => {
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

    for (const direction of directions) press(direction);
    press('Enter');

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

  it('routes Career to Compendium as a real, reachable panel (F6)', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as { navigator: { index: number } };
    const press = (key: string) => {
      harness.keyboard.keydown(key);
      harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key);
      harness.menuScene.update(0, 16);
    };
    // Home → Career.
    for (let i = 0; i < 3; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Career');
    expect(seams.navigator.index).toBe(0);

    // Career → Compendium (row 2), with the panel composed from the actual
    // controller snapshot rather than a TODO alias.
    press('ArrowDown');
    press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Compendium');
    expect(harness.textContents()).toContain('Back');
    expect(seams.navigator.index).toBe(0);
  });

  it('reuses one resolved visual-art registry across Career achievement rerenders', () => {
    const harness = createHarness();
    const seams = harness.menuScene as unknown as {
      visualArt?: unknown;
      render(snapshot: never): void;
    };
    const press = (key: string) => {
      harness.keyboard.keydown(key); harness.menuScene.update(0, 16);
      harness.keyboard.keyup(key); harness.menuScene.update(0, 16);
    };
    for (let i = 0; i < 4; i += 1) press('ArrowDown');
    press('Enter'); // Career
    press('ArrowDown');
    press('Enter'); // Achievements
    const registry = seams.visualArt;
    expect(registry).toBeDefined();
    seams.render((harness.menuScene as unknown as { requireController(): { snapshot(): never } }).requireController().snapshot());
    expect(seams.visualArt).toBe(registry);
  });

  it('loads the shared Achievement atlas lazily, rerenders after a cold load, and uses hidden/named frames when cached', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    const queued: unknown[][] = [];
    const rendered = vi.fn();
    const setFilter = vi.fn();
    let loaded = false;
    const scene = new MenuScene() as unknown as {
      committedPanel: string;
      controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: {
        on(): void; off(): void; once(event: string, listener: () => void): void;
        atlas(...args: unknown[]): void; start(): void;
      };
      getContext(): typeof harness.context;
      requireVisualArt(): DataVisualArtRegistry;
      render(snapshot: unknown): void;
      ensureAchievementPresentation(ids: readonly string[]): Promise<void>;
      add: { image(x: number, y: number, key: string, frame?: string): { setDisplaySize(): unknown; setScrollFactor(): unknown } };
      own<T>(_root: unknown, object: T): T;
      registerScrollObject(object: unknown): void;
      addAchievementIcon(root: unknown, x: number, y: number, artId: string): void;
    };
    Object.assign(scene, {
      committedPanel: 'achievements', controller: { snapshot: () => ({}) },
      textures: { exists: () => loaded, get: () => ({ setFilter }) },
      load: {
        on: () => undefined,
        off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        atlas: (...args: unknown[]) => { queued.push(args); },
        start: () => { loaded = true; complete.get('filecomplete-atlasjson-art-achievement-icons')?.(); },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    await scene.ensureAchievementPresentation([
      'achievement-icon:first-kill',
      'achievement-icon:kill-milestone-25',
    ]);

    expect(queued).toEqual([[
      'art-achievement-icons',
      'assets/achievements/achievement-icons-atlas.png',
      'assets/achievements/achievement-icons-atlas.json',
    ]]);
    expect(rendered).toHaveBeenCalledOnce();
    expect(setFilter).not.toHaveBeenCalled();

    const images: Array<{ key: string; frame?: string }> = [];
    scene.add = { image: (_x, _y, key, frame) => {
      images.push({ key, frame });
      return { setDisplaySize: () => undefined, setScrollFactor: () => undefined };
    } };
    scene.own = (_root, object) => object;
    scene.registerScrollObject = () => undefined;
    scene.addAchievementIcon({}, 0, 0, 'achievement-icon:hidden');
    scene.addAchievementIcon({}, 0, 0, 'achievement-icon:first-kill');
    expect(images).toEqual([
      { key: 'art-achievement-icons', frame: 'achievement-icon:hidden' },
      { key: 'art-achievement-icons', frame: 'achievement-icon:first-kill' },
    ]);
    await scene.ensureAchievementPresentation(['achievement-icon:first-kill']);
    expect(queued).toHaveLength(1);
  });

  it('loads Equipment atlas resources lazily, rerenders after a cold load, and uses atlas frames when cached', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    const queued: unknown[][] = []; const rendered = vi.fn();
    const setFilter = vi.fn();
    let loaded = false;
    const scene = new MenuScene() as unknown as {
      committedPanel: string;
      controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: {
        on(): void; off(): void; once(event: string, listener: () => void): void;
        atlas(...args: unknown[]): void; start(): void;
      };
      getContext(): typeof harness.context;
      requireVisualArt(): DataVisualArtRegistry;
      render(snapshot: unknown): void;
      ensureEquipmentPresentation(ids: readonly string[]): Promise<void>;
      add: { image(x: number, y: number, key: string, frame?: string): { setDisplaySize(): unknown; setScrollFactor(): unknown } };
      own<T>(_root: unknown, object: T): T;
      registerScrollObject(object: unknown): void;
      addCatalogIcon(root: unknown, x: number, y: number, artId: string): void;
    };
    Object.assign(scene, {
      committedPanel: 'equipment', controller: { snapshot: () => ({}) },
      textures: { exists: () => loaded, get: () => ({ setFilter }) },
      load: {
        on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        atlas: (...args: unknown[]) => { queued.push(args); },
        start: () => { loaded = true; complete.get('filecomplete-atlasjson-art-equipment-commando')?.(); },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    await scene.ensureEquipmentPresentation(['equipment-icon:commando-helmet']);
    expect(queued).toEqual([[
      'art-equipment-commando',
      'assets/equipment/commando/commando-equipment-atlas.png',
      'assets/equipment/commando/commando-equipment-atlas.json',
    ]]);
    expect(rendered).toHaveBeenCalledOnce();
    expect(setFilter).toHaveBeenCalledOnce();
    expect(setFilter).toHaveBeenCalledWith(1);

    // A rerender with the physical atlas already present renders the named
    // frame directly; it neither requeues nor silently drops the icon.
    const images: Array<{ key: string; frame?: string }> = [];
    scene.add = { image: (_x, _y, key, frame) => {
      images.push({ key, frame });
      return { setDisplaySize: () => undefined, setScrollFactor: () => undefined };
    } };
    scene.own = (_root, object) => object;
    scene.registerScrollObject = () => undefined;
    scene.addCatalogIcon({}, 0, 0, 'equipment-icon:commando-helmet');
    expect(images).toEqual([{ key: 'art-equipment-commando', frame: 'equipment-icon:commando-helmet' }]);
    await scene.ensureEquipmentPresentation(['equipment-icon:commando-helmet']);
    expect(queued).toHaveLength(1);
  });

  it('retains newly requested Equipment art while another closure is loading and hydrates the latest snapshot', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    const loaded = new Set<string>(); const queued: string[] = [];
    const latest = { panel: 'equipment', selectedInstanceId: 'new-selection' };
    const rendered = vi.fn();
    const scene = new MenuScene() as unknown as {
      committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; atlas(key: string): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureEquipmentPresentation(ids: readonly string[]): Promise<void>;
      equipmentArtLoading: boolean;
    };
    Object.assign(scene, {
      committedPanel: 'equipment', controller: { snapshot: () => latest },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: { on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        atlas: (key: string) => { queued.push(key); },
        start: () => {
          if (queued.at(-1) === 'art-equipment-sets') {
            loaded.add('art-equipment-sets');
            complete.get('filecomplete-atlasjson-art-equipment-sets')?.();
          }
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    const first = scene.ensureEquipmentPresentation(['equipment-icon:commando-helmet']);
    await vi.waitFor(() => expect(queued).toEqual(['art-equipment-commando']));
    await scene.ensureEquipmentPresentation(['equipment-icon:recon-helmet']);
    loaded.add('art-equipment-commando');
    complete.get('filecomplete-atlasjson-art-equipment-commando')!();
    await first;
    expect(queued).toEqual(['art-equipment-commando', 'art-equipment-sets']);
    expect(rendered).toHaveBeenCalledTimes(2);
    expect(rendered.mock.calls.every(([snapshot]) => snapshot === latest)).toBe(true);
    expect(scene.equipmentArtLoading).toBe(false);
    await scene.ensureEquipmentPresentation(['equipment-icon:recon-helmet']);
    expect(queued).toHaveLength(2);
  });

  it.each([
    ['equipment', 'equipment-icon:commando-helmet', 'equipment-set-icon:commando', 'art-equipment-commando'],
    ['gunsmith', 'gun-slot-icon:barrel', 'trait-icon:fire', 'art-gunsmith-icons'],
  ] as const)('does not retry an already attempted physical %s resource while draining overlapping logical requests', async (owner, initialId, overlappingId, textureKey) => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const queued: string[] = [];
    let loadError: ((file: { key?: string }) => void) | undefined;
    const scene = new MenuScene() as unknown as {
      ensureEquipmentPresentation(ids: readonly string[]): Promise<void>;
      ensureGunsmithPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'home',
      textures: { exists: () => false, get: () => ({ setFilter: () => undefined }) },
      load: {
        on: (event: string, handler: (file: { key?: string }) => void) => { if (event === 'loaderror') loadError = handler; },
        off: () => undefined, once: () => undefined,
        atlas: (key: string) => { queued.push(key); },
        // Hold the first batch. Any duplicate batch fails synchronously so
        // the baseline reaches the ownership assertion instead of hanging.
        start: () => { if (queued.length > 1) loadError?.({ key: textureKey }); },
      },
      getContext: () => harness.context, requireVisualArt: () => art,
    });
    const ensure = (ids: readonly string[]) => owner === 'equipment'
      ? scene.ensureEquipmentPresentation(ids) : scene.ensureGunsmithPresentation(ids);
    const first = ensure([initialId]);
    await ensure([overlappingId]);
    await vi.waitFor(() => expect(queued).toEqual([textureKey]));
    loadError!({ key: textureKey });
    await first;
    expect(queued, 'a queued logical alias retried the same failed physical closure').toEqual([textureKey]);
    // Once the owner closes, a genuinely later navigation can retry it.
    await ensure([overlappingId]);
    expect(queued).toEqual([textureKey, textureKey]);
  });

  it('rerenders successfully loaded Equipment art when another requested icon fails', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>();
    let loadError: ((file: { key?: string }) => void) | undefined;
    const rendered = vi.fn();
    const loaded = new Set<string>();
    const scene = new MenuScene() as unknown as {
      committedPanel: string;
      controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: {
        on(event: string, listener: (file: { key?: string }) => void): void;
        off(): void;
        once(event: string, listener: () => void): void;
        image(): void;
        atlas(): void;
        start(): void;
      };
      getContext(): typeof harness.context;
      requireVisualArt(): DataVisualArtRegistry;
      render(snapshot: unknown): void;
      ensureEquipmentPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      committedPanel: 'equipment', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: (event: string, listener: (file: { key?: string }) => void) => {
          if (event === 'loaderror') loadError = listener;
        },
        off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        image: () => undefined,
        atlas: () => undefined,
        start: () => {
          loaded.add('art-equipment-commando');
          complete.get('filecomplete-atlasjson-art-equipment-commando')?.();
          loadError?.({ key: 'art-upgrade-icon-quick-paws' });
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });

    await scene.ensureEquipmentPresentation([
      'equipment-icon:commando-helmet',
      'upgrade-icon:quick-paws',
    ]);

    expect(rendered).toHaveBeenCalledOnce();
  });

  it('loads the Gunsmith atlas lazily and only rerenders the still-current panel after success', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>(); const queued: unknown[][] = []; const rendered = vi.fn();
    const setFilter = vi.fn();
    let loaded = false;
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      runLaunchGeneration: number; gunsmithArtLoading: boolean;
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; atlas(...args: unknown[]): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureGunsmithPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'gunsmith', controller: { snapshot: () => ({}) },
      textures: { exists: () => loaded, get: () => ({ setFilter }) },
      load: {
        on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        atlas: (...args: unknown[]) => { queued.push(args); },
        start: () => { loaded = true; complete.get('filecomplete-atlasjson-art-gunsmith-icons')?.(); },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    await scene.ensureGunsmithPresentation(['gun-slot-icon:barrel', 'gun-part-icon:barrel-standard', 'trait-icon:fire']);
    expect(queued).toEqual([[
      'art-gunsmith-icons',
      'assets/gunsmith/icons/gunsmith-icons-atlas.png',
      'assets/gunsmith/icons/gunsmith-icons-atlas.json',
    ]]);
    expect(rendered).toHaveBeenCalledOnce();
    expect(setFilter).not.toHaveBeenCalled();
    await scene.ensureGunsmithPresentation(['gun-part-icon:barrel-standard']);
    expect(queued).toHaveLength(1);

    loaded = false; rendered.mockClear(); scene.committedPanel = 'equipment';
    scene.load.start = () => { loaded = true; complete.get('filecomplete-atlasjson-art-gunsmith-icons')?.(); };
    await scene.ensureGunsmithPresentation(['gun-part-icon:receiver-compact']);
    expect(rendered).not.toHaveBeenCalled();
  });

  it('loads one native assembly atlas for the explicit chassis and exact fitted Part tiers', async () => {
    const harness = createHarness({ create: false });
    const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>(); const queued: unknown[][] = [];
    const loaded = new Set<string>();
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(mode: number): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; atlas(...args: unknown[]): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureGunsmithPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'gunsmith', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: () => undefined, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); },
        atlas: (...args: unknown[]) => { queued.push(args); },
        start: () => {
          loaded.add('art-gunsmith-tier-assembly');
          complete.get('filecomplete-atlasjson-art-gunsmith-tier-assembly')?.();
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: () => undefined,
    });

    await scene.ensureGunsmithPresentation([
      'gun-build-base:smg',
      'gun-build-part:receiver-heavy:t3',
      'gun-build-part:trigger-hair:t5',
    ]);

    expect(queued).toEqual([[
      'art-gunsmith-tier-assembly',
      'assets/gunsmith/tiers/gunsmith-tier-assembly-atlas.png',
      'assets/gunsmith/tiers/gunsmith-tier-assembly-atlas.json',
    ]]);
  });

  it('keeps Gunsmith text usable and does not rerender after a lazy atlas failure', async () => {
    const harness = createHarness({ create: false }); const art = new DataVisualArtRegistry(harness.context.data);
    let error: ((file: { key?: string }) => void) | undefined; const rendered = vi.fn();
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      runLaunchGeneration: number; gunsmithArtLoading: boolean;
      textures: { exists(key: string): boolean };
      load: { on(event: string, listener: (file: { key?: string }) => void): void; off(): void; once(): void; atlas(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureGunsmithPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'gunsmith', controller: { snapshot: () => ({}) },
      textures: { exists: () => false },
      load: {
        on: (_event: string, listener: (file: { key?: string }) => void) => { error = listener; },
        off: () => undefined, once: () => undefined, atlas: () => undefined,
        start: () => {
          scene.runLaunchGeneration += 1;
          error?.({ key: 'art-gunsmith-icons' });
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    await scene.ensureGunsmithPresentation(['gun-slot-icon:trait']);
    expect(rendered).not.toHaveBeenCalled();
    expect(scene.gunsmithArtLoading).toBe(false);
  });

  it('rerenders Gunsmith when one resource succeeds during a partial lazy-load failure', async () => {
    const harness = createHarness({ create: false }); const art = new DataVisualArtRegistry(harness.context.data);
    const complete = new Map<string, () => void>(); let loadError: ((file: { key?: string }) => void) | undefined;
    const rendered = vi.fn(); const loaded = new Set<string>();
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      gunsmithArtLoading: boolean;
      textures: { exists(key: string): boolean; get(key: string): { setFilter(): void } };
      load: { on(event: string, listener: (file: { key?: string }) => void): void; off(): void; once(event: string, listener: () => void): void; atlas(): void; image(): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureGunsmithPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'gunsmith', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: (_event: string, listener: (file: { key?: string }) => void) => { loadError = listener; }, off: () => undefined,
        once: (event: string, listener: () => void) => { complete.set(event, listener); }, atlas: () => undefined, image: () => undefined,
        start: () => {
          loaded.add('art-gunsmith-icons');
          complete.get('filecomplete-atlasjson-art-gunsmith-icons')?.();
          loadError?.({ key: 'art-weapon-icon-pistol-t1' });
        },
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: rendered,
    });
    await scene.ensureGunsmithPresentation(['gun-slot-icon:barrel', 'weapon-icon:pistol:t1']);
    expect(rendered).toHaveBeenCalledOnce();
    expect(scene.gunsmithArtLoading).toBe(false);
  });

  it('loads the latest Gunsmith preview requested while another closure is in flight', async () => {
    const harness = createHarness({ create: false }); const art = new DataVisualArtRegistry(harness.context.data);
    const completions: Array<() => void> = []; const queued: string[] = []; const loaded = new Set<string>();
    const scene = new MenuScene() as unknown as {
      isLive: boolean; committedPanel: string; controller: { snapshot(): unknown };
      textures: { exists(key: string): boolean; get(key: string): { setFilter(): void } };
      load: { on(): void; off(): void; once(event: string, listener: () => void): void; atlas(key: string): void; image(key: string): void; start(): void };
      getContext(): typeof harness.context; requireVisualArt(): DataVisualArtRegistry; render(snapshot: unknown): void;
      ensureGunsmithPresentation(ids: readonly string[]): Promise<void>;
    };
    Object.assign(scene, {
      isLive: true, committedPanel: 'gunsmith', controller: { snapshot: () => ({}) },
      textures: { exists: (key: string) => loaded.has(key), get: () => ({ setFilter: () => undefined }) },
      load: {
        on: () => undefined, off: () => undefined,
        once: (_event: string, listener: () => void) => { completions.push(listener); },
        atlas: (key: string) => { queued.push(key); }, image: (key: string) => { queued.push(key); }, start: () => undefined,
      },
      getContext: () => harness.context, requireVisualArt: () => art, render: () => undefined,
    });
    const first = scene.ensureGunsmithPresentation(['gun-slot-icon:barrel']);
    await scene.ensureGunsmithPresentation(['weapon-icon:pistol:t1']);
    expect(queued).toEqual(['art-gunsmith-icons']);
    loaded.add('art-gunsmith-icons'); completions.shift()?.();
    await vi.waitFor(() => expect(queued).toEqual(['art-gunsmith-icons', 'art-weapon-icon-pistol-t1']));
    loaded.add('art-weapon-icon-pistol-t1'); completions.shift()?.();
    await first;
  });

  it('resets interrupted Gunsmith presentation loading across scene reuse', () => {
    const harness = createHarness({ create: false });
    const scene = harness.menuScene as unknown as { gunsmithArtLoading: boolean; create(): void };
    scene.gunsmithArtLoading = true;

    scene.create();
    expect(scene.gunsmithArtLoading).toBe(false);

    scene.gunsmithArtLoading = true;
    harness.lifecycle.emit('shutdown');
    expect(scene.gunsmithArtLoading).toBe(false);
  });

  it('starts a new scene-generation texture load when the prior loader never settles', async () => {
    const harness = createHarness({ create: false });
    const scene = harness.menuScene as unknown as {
      create(): void;
      menuTextureLoadPending: number;
      serializeTextureLoad<T>(load: () => Promise<T>, cancelledResult: T): Promise<T>;
      menuTextureLoadSnapshot(): Readonly<{ generation: number; pending: Promise<void> }>;
    };
    scene.create();
    let markOldStarted!: () => void;
    const oldStarted = new Promise<void>((resolve) => { markOldStarted = resolve; });
    void scene.serializeTextureLoad(() => {
      markOldStarted();
      return new Promise(() => undefined);
    }, undefined);
    await oldStarted;
    const interrupted = scene.menuTextureLoadSnapshot();

    harness.lifecycle.emit('shutdown');
    scene.create();
    const startFreshLoad = vi.fn(async () => ({ loaded: [], failed: [] } as const));
    await scene.serializeTextureLoad(startFreshLoad, { loaded: [], failed: [] } as const);
    const fresh = scene.menuTextureLoadSnapshot();

    expect(startFreshLoad).toHaveBeenCalledOnce();
    expect(fresh.generation).toBeGreaterThan(interrupted.generation);
    await expect(fresh.pending).resolves.toBeUndefined();
    expect(scene.menuTextureLoadPending).toBe(0);
  });


  it('registers settings panel targets in order and drives them through logical nav/confirm', () => {
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

    // Home → Settings through the left spatial column.
    for (let i = 0; i < 4; i += 1) press('ArrowDown');
    press('Enter');
    expect(harness.textContents()).toContain('Settings');
    expect(buttonLabels()).toEqual(['Mute: Off', 'Music Volume: 70%', 'SFX Volume: 80%', 'Reduced Motion: Off', 'Back']);
    expect(seams.navigator.index).toBe(0);

    // Navigate through settings rows.
    press('ArrowDown');
    expect(seams.navigator.index).toBe(1);
    press('ArrowDown');
    expect(seams.navigator.index).toBe(2);
    press('ArrowDown');
    expect(seams.navigator.index).toBe(3);
    press('ArrowDown');
    expect(seams.navigator.index).toBe(4);
    press('Escape');
    expect(harness.textContents()).toContain('Meowcenary');
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

    harness.buttonByLabel('Mercenary')!.state.handlers['pointerup']!();
    harness.buttonByLabel('Back')!.state.handlers['pointerup']!();
    expect(harness.textContents()).toContain('Play Contract');
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
    expect(harness.textContents()).toContain('Play Contract');
    expect(harness.textContents()).not.toContain('Something went wrong — press Esc to retry');

    const liveContainers = harness.objects.filter(
      (object) => object.state.kind === 'container' && !object.state.destroyed && object.parentContainer === undefined,
    );
    expect(liveContainers).toHaveLength(1);
  });

  it('shows a retryable loading error rather than entering a partially loaded game scene', async () => {
    const harness = createHarness();

    harness.buttonByLabel('Play Contract')!.state.handlers['pointerup']!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.sceneStart).not.toHaveBeenCalled();
    expect(harness.textContents()).toContain('Retry Loading Contract');
  });

  it('places a wrapped Contract loading error above Retry without overlap at the narrow viewport', async () => {
    const harness = createHarness({ create: false });
    const scale = harness.menuScene.scale as unknown as { width: number; displaySize: { width: number } };
    scale.width = 360;
    scale.displaySize.width = 360;
    harness.menuScene.create();

    harness.buttonByLabel('Play Contract')!.state.handlers.pointerup!();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const error = harness.objects.find((object) => object.state.text.startsWith("Couldn't load this Contract"))!;
    const retry = harness.buttonByLabel('Retry Loading Contract')!;
    expect(error.state.y + error.state.height).toBeLessThanOrEqual(retry.state.y);
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
    // Scroll gesture tracking plus the audio-unlock listener pair.
    expect(input.listenerCount('pointerdown')).toBe(3);

    input.pointerDown(10, 10);

    expect(audioFake!.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(2);

    // A subsequent action must never unlock again or accumulate listeners.
    keyboard.keydown('Enter');
    menuScene.update(0, 16);
    input.pointerDown(20, 20);
    expect(audioFake!.unlock).toHaveBeenCalledTimes(1);
  });

  it('unlocks once on the first logical action and cross-removes the pointer listener', () => {
    const { input, keyboard, audioFake, menuScene } = createHarness();
    expect(input.listenerCount('pointerdown')).toBe(3);

    keyboard.keydown('Enter');
    menuScene.update(0, 16);

    expect(audioFake!.unlock).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('pointerdown')).toBe(2);

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
    expect(input.listenerCount('pointerdown')).toBe(3);

    lifecycle.emit('shutdown');
    expect(input.listenerCount('pointerdown')).toBe(0);

    menuScene.create();
    expect(input.listenerCount('pointerdown')).toBe(3);
    // Initial harness create plus the two explicit visits.
    expect(audioFake!.playMusic).toHaveBeenCalledTimes(3);
  });

  it('tolerates a missing audio registry entry and stays silent', () => {
    const { audioFake, input, textContents } = createHarness({ audio: false });

    expect(audioFake).toBeUndefined();
    expect(textContents()).toEqual(expect.arrayContaining(['Play Contract', 'Mercenary']));
    expect(input.listenerCount('pointerdown')).toBe(2);
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

    harness.buttonByLabel('Play Contract')!.state.handlers['pointerup']!();

    expect(events).toEqual(['ui:confirm']);
  });

  it('rejects a second keyboard confirm while the first Contract launch is loading', () => {
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
    expect(events).toEqual([]);
  });

  it('emits ui:confirm for the panel button and ui:back for Back, never a second confirm', () => {
    const harness = createHarness();
    const events = recordEvents(harness.bus);

    harness.buttonByLabel('Mercenary')!.state.handlers['pointerup']!();
    harness.buttonByLabel('Back')!.state.handlers['pointerup']!();

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

    harness.buttonByLabel('Play Contract')!.state.handlers['pointerover']!();
    harness.buttonByLabel('Play Contract')!.state.handlers['pointerout']!();

    expect(events).toEqual([]);
  });
});

describe('Menu transition input boundary', () => {
  it('does not deliver same-poll navigation into the panel opened by Confirm', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as { navigator: { index: number; setIndex(index: number): void }; committedPanel?: string };
    scene.navigator.setIndex(2); // Mercenary in the authored Home action map.
    harness.keyboard.keydown('Enter'); harness.keyboard.keydown('ArrowDown');
    harness.menuScene.update(0, 16);
    expect(scene.committedPanel).toBe('character');
    expect(scene.navigator.index).toBe(0);
    harness.keyboard.keyup('Enter'); harness.keyboard.keyup('ArrowDown');
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
    expect(scene.navigator.index).toBe(1);
  });

  it('does not deliver same-poll navigation into Home after Back', () => {
    const harness = createHarness();
    harness.buttonByLabel('Mercenary')!.state.handlers.pointerup!();
    harness.menuScene.update(0, 16); // re-arm after the accepted pointer transition
    const scene = harness.menuScene as unknown as { navigator: { index: number }; committedPanel?: string };
    harness.keyboard.keydown('Escape'); harness.keyboard.keydown('ArrowDown');
    harness.menuScene.update(0, 16);
    expect(scene.committedPanel).toBe('home');
    expect(scene.navigator.index).toBe(0);
    harness.keyboard.keyup('Escape'); harness.keyboard.keyup('ArrowDown');
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('ArrowDown'); harness.menuScene.update(0, 16);
    expect(scene.navigator.index).toBe(1);
  });

  it('quarantines sampled keyboard navigation after a pointer Confirm opens a panel', () => {
    const harness = createHarness();
    harness.buttonByLabel('Mercenary')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as { navigator: { index: number }; committedPanel?: string };

    harness.keyboard.keydown('ArrowDown');
    harness.menuScene.update(0, 16);
    expect(scene.committedPanel).toBe('character');
    expect(scene.navigator.index).toBe(0);

    harness.keyboard.keyup('ArrowDown');
    harness.menuScene.update(0, 16);
    harness.keyboard.keydown('ArrowDown');
    harness.menuScene.update(0, 16);
    expect(scene.navigator.index).toBe(1);
  });

  it('quarantines sampled gamepad navigation after a pointer Back returns Home', () => {
    const harness = createHarness();
    const pad = new MockGamepad();
    harness.input.gamepad!.connect(pad);
    harness.buttonByLabel('Mercenary')!.state.handlers.pointerup!();
    harness.buttonByLabel('Back')!.state.handlers.pointerup!();
    const scene = harness.menuScene as unknown as { navigator: { index: number }; committedPanel?: string };

    pad.setButton(13, true);
    harness.menuScene.update(0, 16);
    expect(scene.committedPanel).toBe('home');
    expect(scene.navigator.index).toBe(0);

    pad.setButton(13, false);
    harness.menuScene.update(0, 16);
    pad.setButton(13, true);
    harness.menuScene.update(0, 16);
    expect(scene.navigator.index).toBe(1);
  });

  it('leaves disabled pointer rows inert and does not quarantine their sampled navigation', () => {
    const harness = createHarness();
    harness.buttonByLabel('Change Contract')!.state.handlers.pointerup!();
    harness.menuScene.update(0, 16); // re-arm after the accepted pointer transition
    const locked = harness.buttonByLabel('Scrap Run')!;
    const scene = harness.menuScene as unknown as { navigator: { index: number } };
    const before = scene.navigator.index;
    const events: string[] = [];
    harness.bus.on('ui:confirm', () => events.push('confirm'));

    locked.state.handlers.pointerup!(); // defensive probe of a disabled target
    harness.keyboard.keydown('ArrowDown');
    harness.menuScene.update(0, 16);
    expect(events).toEqual([]);
    expect(scene.navigator.index).not.toBe(before);
  });

  it('leaves pointer rows without a callback inert', () => {
    const harness = createHarness();
    const scene = harness.menuScene as unknown as {
      addButton(root: unknown, x: number, y: number, label: string, minHeight: number,
        callback?: () => void): FakeObject;
      root: unknown;
      navigator: { index: number };
    };
    const button = scene.addButton(scene.root, 0, 0, 'No command', 44, undefined);
    const events: string[] = [];
    harness.bus.on('ui:confirm', () => events.push('confirm'));

    button.state.handlers.pointerup!();
    expect(events).toEqual([]);
    expect(scene.navigator.index).toBe(0);
  });
});
