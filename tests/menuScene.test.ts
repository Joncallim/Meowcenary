import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { SceneKey } from '../src/engine/sceneKeys';
import { MenuScene } from '../src/scenes/MenuScene';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_OVER: 'pointerover',
        POINTER_OUT: 'pointerout',
        POINTER_UP: 'pointerup',
      },
    },
    Scenes: {
      Events: {
        SHUTDOWN: 'shutdown',
        DESTROY: 'destroy',
      },
    },
    Scene: class Scene {
      constructor(public key: string) {}
    },
  },
}));

interface FakeObjectState {
  kind: 'container' | 'text' | 'rect';
  text: string;
  width: number;
  height: number;
  interactive: boolean;
  destroyed: boolean;
  handlers: Record<string, () => void>;
  padding: { left: number; top: number; right: number; bottom: number };
}

function fakeObject(
  kind: FakeObjectState['kind'],
  text = '',
  width = 0,
  height = 0,
  padding: FakeObjectState['padding'] = { left: 10, top: 8, right: 10, bottom: 8 },
) {
  const state: FakeObjectState = {
    kind,
    text,
    width,
    height,
    interactive: false,
    destroyed: false,
    handlers: {},
    padding: { ...padding },
  };
  const api = {
    get state() {
      return { ...state, handlers: { ...state.handlers }, padding: { ...state.padding } };
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
    setOrigin(_x?: number, _y?: number) {
      return api;
    },
    setScrollFactor() {
      return api;
    },
    setDepth() {
      return api;
    },
    setStyle() {
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

function createFakeScene(context: ReturnType<typeof createGameContext>) {
  const objects: FakeObject[] = [];
  let failNextText = false;
  const register = <T>(object: T): T => {
    const candidate = object as FakeObject;
    if (!objects.includes(candidate)) {
      objects.push(candidate);
    }
    return object;
  };

  const keyboardListeners = new Map<
    string,
    Array<{ handler: (event: { key: string; repeat: boolean }) => void; context: unknown }>
  >();
  const keyNames: Record<string, string> = {
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    Enter: 'ENTER',
    Space: 'SPACE',
    Escape: 'ESC',
  };
  const keyboard = {
    on(
      event: string,
      handler: (event: { key: string; repeat: boolean }) => void,
      context?: unknown,
    ): void {
      const list = keyboardListeners.get(event) ?? [];
      list.push({ handler, context });
      keyboardListeners.set(event, list);
    },
    off(event: string, handler: (event: { key: string; repeat: boolean }) => void): void {
      keyboardListeners.set(
        event,
        (keyboardListeners.get(event) ?? []).filter((entry) => entry.handler !== handler),
      );
    },
    keydown(key: string): void {
      const name = keyNames[key] ?? key.toUpperCase();
      [...(keyboardListeners.get(`keydown-${name}`) ?? [])].forEach((entry) => {
        entry.handler.call(entry.context, { key, repeat: false });
      });
    },
  };

  const sceneStart = vi.fn();

  const environment = {
    registry: { get: () => context },
    scale: { width: 390, height: 844 },
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
      text(
        _x: number,
        _y: number,
        text: string,
        style?: { padding?: { x?: number; y?: number } },
      ) {
        if (failNextText) {
          failNextText = false;
          throw new Error('Injected text factory failure');
        }
        const padX = style?.padding?.x ?? 10;
        const padY = style?.padding?.y ?? 8;
        // Phaser Text bounds include the padding on both axes.
        const padding = { left: padX, top: padY, right: padX, bottom: padY };
        return register(
          fakeObject(
            'text',
            text,
            Math.max(24, text.length * 8),
            16 + padY * 2,
            padding,
          ),
        );
      },
      rectangle(_x: number, _y: number, width: number, height: number) {
        return register(fakeObject('rect', '', width, height));
      },
    },
    input: { keyboard },
    events: { once: vi.fn(), off: vi.fn() },
    scene: { start: sceneStart },
  };

  return {
    environment,
    objects,
    keyboard,
    sceneStart,
    /** Arms the fake add.text factory to throw once on its next call, then
     *  recover, mirroring the pause/runSummary failure-injection tests. */
    failNextText() {
      failNextText = true;
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

function createHarness(options: { create?: boolean } = { create: true }) {
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

  const { environment, ...helpers } = createFakeScene(context);
  const menuScene = new MenuScene();
  Object.assign(menuScene, environment);
  if (options.create !== false) {
    menuScene.create();
  }

  return { menuScene, ...helpers };
}

describe('MenuScene', () => {
  it('renders the home panel with all navigation buttons', () => {
    const { textContents, objects } = createHarness();

    expect(textContents()).toEqual(
      expect.arrayContaining([
        'Meowcenary',
        'Start',
        'Character',
        'Arena',
        'Progression',
        'Settings',
        '↑/↓ • Enter • Esc',
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
    harness.keyboard.keydown('Enter');
    expect(harness.textContents()).toContain('Choose Character');

    harness.keyboard.keydown('Escape');
    expect(harness.textContents()).toContain('Start');
    expect(harness.textContents()).not.toContain('Choose Character');
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
