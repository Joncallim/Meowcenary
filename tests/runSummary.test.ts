import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { SceneKey } from '../src/engine/sceneKeys';
import {
  createRunState,
  endRun,
  startRun,
  type RunState,
} from '../src/gameplay/runState';
import { ProgressionSystem, type BankedRun } from '../src/systems/ProgressionSystem';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { logicalCanvasViewport } from '../src/ui/layout';
import {
  PhaserRunSummaryView,
  RunSummaryController,
  type RunSummarySnapshot,
  type RunSummarySource,
} from '../src/ui/runSummary';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_UP: 'pointerup',
      },
    },
  },
}));

function bankedRun(overrides: Partial<BankedRun> = {}): BankedRun {
  return {
    reward: { scrap: 12.9, unlocks: ['achievement:first-victory'] },
    meta: { scrap: 100, unlocks: ['achievement:first-victory'], permanentUpgrades: {} },
    persisted: true,
    ...overrides,
  };
}

describe('RunSummaryController snapshots', () => {
  function source(runState: RunState, banked: BankedRun | null): RunSummarySource {
    return {
      get runState() {
        return runState;
      },
      get lastBankedRun() {
        return banked;
      },
    };
  }

  function terminalRun(status: 'won' | 'lost'): RunState {
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = status;
    run.timeMs = 90_000;
    run.level = 4;
    run.kills = 23;
    run.currency = 25.5;
    return run;
  }

  it('returns undefined while the run is not terminal', () => {
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    startRun(run);
    const controller = new RunSummaryController(source(run, null));

    expect(controller.snapshot()).toBeUndefined();
  });

  it('snapshots a won run with the banked reward values', () => {
    const controller = new RunSummaryController(source(terminalRun('won'), bankedRun()));

    expect(controller.snapshot()).toEqual({
      outcome: 'won',
      timeMs: 90_000,
      level: 4,
      kills: 23,
      runCurrency: 25.5,
      bankedScrap: 12,
      totalScrap: 100,
      persistenceSucceeded: true,
      unlockedIds: ['achievement:first-victory'],
    });
  });

  it('snapshots a lost run without unlocks', () => {
    const controller = new RunSummaryController(
      source(
        terminalRun('lost'),
        bankedRun({
          reward: { scrap: 12.9, unlocks: [] },
          meta: { scrap: 100, unlocks: [], permanentUpgrades: {} },
        }),
      ),
    );

    const snapshot = controller.snapshot();
    expect(snapshot?.outcome).toBe('lost');
    expect(snapshot?.unlockedIds).toEqual([]);
  });

  it('shows zero banked values and a save warning when the run was not banked', () => {
    const controller = new RunSummaryController(source(terminalRun('won'), null));

    expect(controller.snapshot()).toMatchObject({
      outcome: 'won',
      runCurrency: 25.5,
      bankedScrap: 0,
      totalScrap: 0,
      persistenceSucceeded: false,
      unlockedIds: [],
    });
  });

  it('surfaces a persistence failure while keeping the in-memory banked values', () => {
    const controller = new RunSummaryController(
      source(terminalRun('won'), bankedRun({ persisted: false })),
    );

    expect(controller.snapshot()).toMatchObject({
      bankedScrap: 12,
      totalScrap: 100,
      persistenceSucceeded: false,
    });
  });

  it('returns frozen snapshots with a copied unlocked id list', () => {
    const banked = bankedRun();
    const controller = new RunSummaryController(source(terminalRun('won'), banked));

    const snapshot = controller.snapshot()!;
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.unlockedIds)).toBe(true);
    (banked.meta.unlocks as string[]).push('extra-unlock');
    expect(snapshot.unlockedIds).toEqual(['achievement:first-victory']);
  });
});

describe('RunSummaryController banking integration', () => {
  function setup() {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const bus = createEventBus();
    const context = createGameContext({
      bus,
      menuRng: createRng(1),
      data,
      arenas,
      metaUpgrades,
      characters,
      save: new SaveManager(
        new MemoryStorageAdapter(),
        'run-summary',
        metaUpgrades.maxLevels(),
      ),
    });
    return { bus, context };
  }

  it.each(['won', 'lost'] as const)(
    'banks a %s run exactly once before the getter-backed snapshot is read',
    (outcome) => {
      const { bus, context } = setup();
      const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
      startRun(run);
      run.currency = 12.9;
      const system = new ProgressionSystem({ runState: run, bus, context });
      const controller = new RunSummaryController({
        get runState() {
          return run;
        },
        get lastBankedRun() {
          return system.lastBankedRun;
        },
      });
      let captured: RunSummarySnapshot | undefined;
      // Subscribed after ProgressionSystem so banking completes before render.
      bus.on(outcome === 'won' ? 'run:won' : 'run:lost', () => {
        captured = controller.snapshot();
      });

      endRun(run, outcome, bus);

      expect(system.hasBanked).toBe(true);
      expect(system.bankFinishedRun()).toBeNull();
      expect(context.saveData.meta.scrap).toBe(12);
      expect(captured).toMatchObject({
        outcome,
        runCurrency: 12.9,
        bankedScrap: 12,
        totalScrap: 12,
        persistenceSucceeded: true,
        unlockedIds: outcome === 'won' ? ['achievement:first-victory'] : [],
      });
    },
  );
});

describe('PhaserRunSummaryView', () => {
  interface FakeState {
    kind: 'container' | 'text' | 'rect';
    text: string;
    width: number;
    height: number;
    interactive: boolean;
    destroyed: boolean;
    handlers: Record<string, () => void>;
  }

  function createFakeScene() {
    const objects: Array<ReturnType<typeof fakeObject>> = [];
    let failNextText = false;
    const own = <T>(object: T): T => {
      const candidate = object as ReturnType<typeof fakeObject>;
      if (!objects.includes(candidate)) {
        objects.push(candidate);
      }
      return object;
    };

    function fakeObject(kind: FakeState['kind'], text = '', width = 0, height = 0) {
      const state: FakeState = {
        kind,
        text,
        width,
        height,
        interactive: false,
        destroyed: false,
        handlers: {},
      };
      const chain = (key: keyof FakeState, value: FakeState[keyof FakeState]) => {
        (state as unknown as Record<string, unknown>)[key] = value;
        return api;
      };
      const api = {
        get state() {
          return { ...state };
        },
        setText(text: string) {
          return chain('text', text);
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
        setStrokeStyle() {
          return api;
        },
        setInteractive() {
          state.interactive = true;
          return api;
        },
        on(event: string, handler: () => void) {
          state.handlers = { ...state.handlers, [event]: handler };
          return api;
        },
        destroy() {
          state.destroyed = true;
        },
      };
      return api;
    }

    const keyboardListeners = new Map<string, Array<(event: unknown) => void>>();
    const keyboard = {
      on(event: string, handler: (event: unknown) => void): void {
        const list = keyboardListeners.get(event) ?? [];
        list.push(handler);
        keyboardListeners.set(event, list);
      },
      off(event: string, handler: (event: unknown) => void): void {
        keyboardListeners.set(
          event,
          (keyboardListeners.get(event) ?? []).filter((candidate) => candidate !== handler),
        );
      },
      keydown(event: { key: string; repeat: boolean }): void {
        [...(keyboardListeners.get('keydown-R') ?? [])].forEach((handler) => handler(event));
      },
      get listenerCount(): number {
        return keyboardListeners.get('keydown-R')?.length ?? 0;
      },
    };

    const scenePlugin = { restart: vi.fn(), start: vi.fn() };

    const scene = {
      input: { keyboard },
      scene: scenePlugin,
      add: {
        container: () => {
          const base = fakeObject('container');
          const container = {
            ...base,
            get state() {
              return { ...base.state };
            },
            children: [] as Array<ReturnType<typeof fakeObject>>,
            add(children: unknown) {
              const list = Array.isArray(children) ? children : [children];
              list.forEach((child) => {
                const object = own(child as ReturnType<typeof fakeObject>);
                container.children.push(object);
              });
              return container;
            },
            destroy() {
              container.children.forEach((child) => child.destroy());
              base.destroy();
            },
          };
          objects.push(container);
          return container;
        },
        text: (_x: number, _y: number, text: string) => {
          if (failNextText) {
            failNextText = false;
            throw new Error('Injected text factory failure');
          }
          return own(fakeObject('text', text));
        },
        rectangle: (_x: number, _y: number, width: number, height: number) =>
          own(fakeObject('rect', '', width, height)),
      },
      get objects() {
        return objects;
      },
      failNextText() {
        failNextText = true;
      },
    };
    return scene;
  }

  function createHarness(options: { outcome?: 'won' | 'lost'; banked?: BankedRun | null } = {}) {
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = options.outcome ?? 'won';
    run.timeMs = 90_000;
    run.level = 4;
    run.kills = 23;
    run.currency = 25.5;
    const bus = createEventBus();
    const controller = new RunSummaryController({
      get runState() {
        return run;
      },
      get lastBankedRun() {
        return options.banked ?? null;
      },
    });
    const scene = createFakeScene();
    const view = new PhaserRunSummaryView({
      scene: scene as never,
      viewport: logicalCanvasViewport(),
      bus,
      controller,
    });
    return { run, bus, scene, view, controller };
  }

  const textContents = (scene: ReturnType<typeof createFakeScene>) =>
    scene.objects
      .filter((object) => object.state.kind === 'text')
      .map((object) => object.state.text);

  it('renders nothing and stays hidden before a terminal event', () => {
    const { scene, view } = createHarness();

    expect(view.visible).toBe(false);
    expect(scene.objects).toHaveLength(0);
  });

  it('renders the won summary with stats, unlocked line, and an interactive backdrop', () => {
    const { bus, scene, view } = createHarness({ banked: bankedRun() });
    bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });

    expect(view.visible).toBe(true);
    expect(scene.objects.length).toBeGreaterThan(0);
    const backdrop = scene.objects.find(
      (object) =>
        object.state.kind === 'rect' && object.state.width === 390 && object.state.height === 844,
    );
    expect(backdrop).toBeDefined();
    expect(backdrop?.state.interactive).toBe(true);
    expect(textContents(scene)).toEqual(
      expect.arrayContaining([
        'Run Complete',
        'Time',
        'Level',
        'Kills',
        'Run scrap',
        'Banked scrap',
        'Total scrap',
        '1:30',
        '4',
        '23',
        '25.5',
        '12',
        '100',
        'Unlocked: achievement:first-victory',
        'Retry',
        'Main Menu',
        'Tap Retry or Main Menu',
      ]),
    );
    expect(textContents(scene)).not.toContain('Not saved — this session only');
  });

  it('renders the lost summary with the not-saved warning when banking failed', () => {
    const { bus, scene, view } = createHarness({ outcome: 'lost' });
    bus.emit('run:lost', { timeMs: 90_000, level: 4, kills: 23 });

    expect(view.visible).toBe(true);
    expect(textContents(scene)).toEqual(
      expect.arrayContaining([
        'Run Failed',
        'Not saved — this session only',
        'Retry',
        'Main Menu',
      ]),
    );
    expect(textContents(scene)).not.toContain('Unlocked:');
  });

  it('cleans the partial tree and stays hidden when text construction throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { bus, scene, view } = createHarness({ banked: bankedRun() });
      scene.failNextText();

      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      expect(errorSpy).toHaveBeenCalledWith(
        'EventBus listener failed for "run:won"',
        expect.objectContaining({ message: 'Injected text factory failure' }),
      );
      expect(view.visible).toBe(false);
      expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);

      // A later terminal event retries from a clean slate.
      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      expect(view.visible).toBe(true);
      expect(textContents(scene)).toContain('Run Complete');
      view.destroy();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('gates the R retry shortcut on visibility and ignores repeats', () => {
    const { bus, scene, view } = createHarness({ banked: bankedRun() });
    scene.input.keyboard.keydown({ key: 'R', repeat: false });
    expect(scene.scene.restart).not.toHaveBeenCalled();

    bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
    scene.input.keyboard.keydown({ key: 'R', repeat: false });
    expect(scene.scene.restart).toHaveBeenCalledTimes(1);

    scene.input.keyboard.keydown({ key: 'R', repeat: true });
    expect(scene.scene.restart).toHaveBeenCalledTimes(1);

    view.destroy();
    scene.input.keyboard.keydown({ key: 'R', repeat: false });
    expect(scene.scene.restart).toHaveBeenCalledTimes(1);
  });

  it('routes the Retry and Main Menu buttons to scene navigation', () => {
    const { bus, scene } = createHarness({ banked: bankedRun() });
    bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });

    const buttons = scene.objects.filter(
      (object) =>
        object.state.kind === 'rect' &&
        object.state.interactive &&
        object.state.width < 390 &&
        object.state.handlers['pointerup'],
    );
    expect(buttons).toHaveLength(2);
    buttons[0]!.state.handlers['pointerup']();
    expect(scene.scene.restart).toHaveBeenCalledTimes(1);
    buttons[1]!.state.handlers['pointerup']();
    expect(scene.scene.start).toHaveBeenCalledWith(SceneKey.Menu);
  });

  describe('command events', () => {
    const recordEvents = (bus: ReturnType<typeof createEventBus>) => {
      const events: string[] = [];
      bus.on('ui:confirm', () => events.push('ui:confirm'));
      bus.on('ui:back', () => events.push('ui:back'));
      bus.on('ui:navigate', () => events.push('ui:navigate'));
      return events;
    };

    const liveButtons = (scene: ReturnType<typeof createFakeScene>) =>
      scene.objects.filter(
        (object) =>
          object.state.kind === 'rect' &&
          object.state.handlers['pointerup'] &&
          !object.state.destroyed,
      );

    it('emits one confirm and restarts once from the Retry button', () => {
      const { bus, scene } = createHarness({ banked: bankedRun() });
      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      const events = recordEvents(bus);

      liveButtons(scene)[0]!.state.handlers['pointerup']();

      expect(events).toEqual(['ui:confirm']);
      expect(scene.scene.restart).toHaveBeenCalledTimes(1);
    });

    it('emits one confirm and restarts once from the R shortcut', () => {
      const { bus, scene } = createHarness({ banked: bankedRun() });
      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      const events = recordEvents(bus);

      scene.input.keyboard.keydown({ key: 'R', repeat: false });

      expect(events).toEqual(['ui:confirm']);
      expect(scene.scene.restart).toHaveBeenCalledTimes(1);
    });

    it('ignores repeated R keydown events entirely', () => {
      const { bus, scene } = createHarness({ banked: bankedRun() });
      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      const events = recordEvents(bus);

      scene.input.keyboard.keydown({ key: 'R', repeat: true });

      expect(events).toEqual([]);
      expect(scene.scene.restart).not.toHaveBeenCalled();
    });

    it('ignores R while hidden or after destroy', () => {
      const { bus, scene, view } = createHarness({ banked: bankedRun() });
      const events = recordEvents(bus);

      // Hidden: no terminal event has rendered the summary yet.
      scene.input.keyboard.keydown({ key: 'R', repeat: false });
      expect(events).toEqual([]);

      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      scene.input.keyboard.keydown({ key: 'R', repeat: false });
      expect(events).toEqual(['ui:confirm']);

      // After destroy: the same R command emits nothing and restarts nothing.
      view.destroy();
      scene.input.keyboard.keydown({ key: 'R', repeat: false });
      expect(events).toEqual(['ui:confirm']);
      expect(scene.scene.restart).toHaveBeenCalledTimes(1);
    });

    it('emits one confirm and starts the menu scene from Main Menu', () => {
      const { bus, scene } = createHarness({ banked: bankedRun() });
      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      const events = recordEvents(bus);

      liveButtons(scene)[1]!.state.handlers['pointerup']();

      expect(events).toEqual(['ui:confirm']);
      expect(scene.scene.start).toHaveBeenCalledWith(SceneKey.Menu);
    });

    it('button callbacks emit nothing after the view is destroyed', () => {
      const { bus, scene, view } = createHarness({ banked: bankedRun() });
      bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
      const events = recordEvents(bus);
      view.destroy();

      liveButtons(scene).forEach((button) => button.state.handlers['pointerup']());

      expect(events).toEqual([]);
      expect(scene.scene.restart).not.toHaveBeenCalled();
      expect(scene.scene.start).not.toHaveBeenCalled();
    });
  });

  it('destroy unsubscribes bus and keyboard and cleans every object idempotently', () => {
    const { bus, scene, view } = createHarness({ banked: bankedRun() });
    bus.emit('run:won', { timeMs: 90_000, level: 4, kills: 23 });
    expect(scene.objects.length).toBeGreaterThan(0);

    view.destroy();
    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);
    expect(view.visible).toBe(false);
    expect(scene.input.keyboard.listenerCount).toBe(0);

    view.destroy(); // idempotent
    const count = scene.objects.length;
    bus.emit('run:lost', { timeMs: 90_000, level: 4, kills: 23 });
    expect(scene.objects.length).toBe(count);
  });
});
