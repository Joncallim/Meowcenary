import { describe, expect, it, vi } from 'vitest';
// Must precede any import whose transitive dependencies resolve Phaser at module
// evaluation time. The mock registration in __mocks__/phaser is a side-effectful
// import; ordering it first guarantees the mock is installed before the real
// Phaser module is ever requested.
import { MockInputPlugin } from './__mocks__/phaser';
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

  const input = new MockInputPlugin({ keyboard: true });

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

  return { menuScene, ...helpers, audioFake, bus: context.bus };
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
