import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import {
  createRunState,
  endRun,
  pauseRun,
  resumeRun,
  startRun,
} from '../src/gameplay/runState';
import { createWeaponInstance, type WeaponInstance } from '../src/gameplay/weapons';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import { InventoryController } from '../src/ui/inventory';
import { logicalCanvasViewport } from '../src/ui/layout';
import { PauseController, PhaserPauseView } from '../src/ui/pause';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_UP: 'pointerup',
      },
    },
  },
}));

let registry: DataWeaponRegistry;

beforeEach(() => {
  registry = new DataWeaponRegistry(loadGameData());
});

function instance(defId: string, instanceId: string): WeaponInstance {
  const def = registry.weaponById(defId);
  if (!def) {
    throw new Error(`missing test weapon ${defId}`);
  }
  return createWeaponInstance(def, instanceId);
}

function createHarness(options: { start?: boolean } = {}) {
  const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
  if (options.start !== false) {
    startRun(run);
  }
  const bus = createEventBus();
  const inventory = new InventoryController({ runState: run, bus, weaponRegistry: registry });
  const controller = new PauseController({ runState: run, bus, inventory });
  return { run, bus, inventory, controller };
}

describe('PauseController pause', () => {
  it('pauses an active run manually, opens the pause panel, and emits run:paused', () => {
    const { run, bus, controller } = createHarness();
    const pausedSpy = vi.fn();
    bus.on('run:paused', pausedSpy);

    expect(controller.pause()).toBe(true);
    expect(run.status).toBe('paused');
    expect(run.pauseReason).toBe('manual');
    expect(controller.snapshot().panel).toBe('pause');
    expect(pausedSpy).toHaveBeenCalledTimes(1);

    // A second P/Escape while already paused is refused.
    expect(controller.pause()).toBe(false);
  });

  it('is refused before the run starts', () => {
    const { run, controller } = createHarness({ start: false });

    expect(controller.pause()).toBe(false);
    expect(run.status).toBe('intro');
    expect(controller.snapshot().panel).toBe('closed');
  });

  it.each(['won', 'lost'] as const)('is refused from the terminal %s state', (outcome) => {
    const { run, controller } = createHarness();
    endRun(run, outcome);

    expect(controller.pause()).toBe(false);
    expect(run.status).toBe(outcome);
    expect(controller.snapshot().panel).toBe('closed');
  });

  it('never steals or resumes a level-up pause', () => {
    const { run, bus, controller } = createHarness();
    pauseRun(run, undefined, 'levelUp');
    const pausedSpy = vi.fn();
    const resumedSpy = vi.fn();
    bus.on('run:paused', pausedSpy);
    bus.on('run:resumed', resumedSpy);

    expect(controller.pause()).toBe(false);
    expect(controller.resume()).toBe(false);
    expect(run.status).toBe('paused');
    expect(run.pauseReason).toBe('levelUp');
    expect(controller.snapshot().panel).toBe('closed');
    expect(pausedSpy).not.toHaveBeenCalled();
    expect(resumedSpy).not.toHaveBeenCalled();
  });
});

describe('PauseController resume', () => {
  it('resumes a manual pause, closes the panel, and emits run:resumed', () => {
    const { run, bus, controller } = createHarness();
    controller.pause();
    const resumedSpy = vi.fn();
    bus.on('run:resumed', resumedSpy);

    expect(controller.resume()).toBe(true);
    expect(run.status).toBe('active');
    expect(run.pauseReason).toBeNull();
    expect(controller.snapshot().panel).toBe('closed');
    expect(resumedSpy).toHaveBeenCalledTimes(1);

    // A second resume while active is refused.
    expect(controller.resume()).toBe(false);
  });

  it('is refused while the run is active', () => {
    const { run, controller } = createHarness();

    expect(controller.resume()).toBe(false);
    expect(run.status).toBe('active');
  });

  it('is refused once a level-up pause takes over the open pause panel', () => {
    const { run, controller } = createHarness();
    expect(controller.pause()).toBe(true);
    // The upgrade chooser supersedes the manual pause (priority order).
    resumeRun(run, undefined, 'manual');
    pauseRun(run, undefined, 'levelUp');

    expect(controller.resume()).toBe(false);
    expect(run.status).toBe('paused');
    expect(run.pauseReason).toBe('levelUp');
    expect(controller.snapshot().panel).toBe('pause');
  });
});

describe('PauseController openInventory', () => {
  it('opens the inventory panel from the pause panel', () => {
    const { controller } = createHarness();
    controller.pause();

    expect(controller.openInventory()).toBe(true);
    expect(controller.snapshot().panel).toBe('inventory');
  });

  it('is refused from the closed panel', () => {
    const { controller } = createHarness();

    expect(controller.openInventory()).toBe(false);
    expect(controller.snapshot().panel).toBe('closed');
  });

  it('is refused once the run leaves the manual pause', () => {
    const { run, controller } = createHarness();
    controller.pause();
    // The run resumes underneath (e.g. via a different pause owner), then the
    // chooser takes over; the manual surface must not open its inventory.
    resumeRun(run, undefined, 'manual');
    pauseRun(run, undefined, 'levelUp');

    expect(controller.openInventory()).toBe(false);
    expect(controller.snapshot().panel).toBe('pause');
  });
});

describe('PauseController back and Escape routing', () => {
  it('back from inventory returns to the pause panel', () => {
    const { run, controller } = createHarness();
    controller.pause();
    controller.openInventory();

    expect(controller.back()).toBe(true);
    expect(controller.snapshot().panel).toBe('pause');
    expect(run.status).toBe('paused');
  });

  it('back from the pause panel resumes the run', () => {
    const { run, controller } = createHarness();
    controller.pause();

    expect(controller.back()).toBe(true);
    expect(controller.snapshot().panel).toBe('closed');
    expect(run.status).toBe('active');
  });

  it('back from a closed panel is refused', () => {
    const { controller } = createHarness();

    expect(controller.back()).toBe(false);
  });

  it('routes the full Escape sequence inventory -> pause -> resume', () => {
    const { run, controller } = createHarness();

    expect(controller.pause()).toBe(true); // P/Esc from closed
    expect(controller.snapshot().panel).toBe('pause');
    expect(controller.openInventory()).toBe(true);
    expect(controller.snapshot().panel).toBe('inventory');

    expect(controller.back()).toBe(true); // Esc from inventory
    expect(controller.snapshot().panel).toBe('pause');
    expect(controller.back()).toBe(true); // Esc from pause
    expect(controller.snapshot().panel).toBe('closed');
    expect(run.status).toBe('active');

    expect(controller.back()).toBe(false); // Esc from closed
  });
});

describe('PauseController lifecycle', () => {
  it('no-ops every command after destroy without emitting', () => {
    const { run, bus, controller } = createHarness();
    controller.pause();
    controller.openInventory();
    const pausedSpy = vi.fn();
    const resumedSpy = vi.fn();
    bus.on('run:paused', pausedSpy);
    bus.on('run:resumed', resumedSpy);
    controller.destroy();

    expect(controller.pause()).toBe(false);
    expect(controller.resume()).toBe(false);
    expect(controller.openInventory()).toBe(false);
    expect(controller.back()).toBe(false);
    expect(run.status).toBe('paused');
    expect(run.pauseReason).toBe('manual');
    expect(controller.snapshot().panel).toBe('inventory');
    expect(pausedSpy).not.toHaveBeenCalled();
    expect(resumedSpy).not.toHaveBeenCalled();
  });

  it('snapshots are frozen and reflect the inventory selection', () => {
    const { run, inventory, controller } = createHarness();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];
    controller.pause();
    inventory.toggle('a');

    const snapshot = controller.snapshot();
    expect(snapshot.panel).toBe('pause');
    expect(snapshot.inventory.selectedInstanceIds).toEqual(['a']);
    expect(snapshot.inventory.weapons).toHaveLength(2);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.inventory)).toBe(true);
    expect(Object.isFrozen(snapshot.inventory.weapons[0])).toBe(true);
  });
});

describe('PhaserPauseView', () => {
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

    const scene = {
      add: {
        container: () => {
          const base = fakeObject('container');
          const container = {
            ...base,
            // Object spread snapshots the state getter into a data property,
            // so delegate back to base (whose getter reads the closure state)
            // to keep `container.state.destroyed` accurate after destroy.
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
              // Mirror Phaser container.destroy(true): children first, then self.
              container.children.forEach((child) => child.destroy());
              base.destroy();
            },
          };
          objects.push(container);
          return container;
        },
        text: (_x: number, _y: number, text: string) => own(fakeObject('text', text)),
        rectangle: (_x: number, _y: number, width: number, height: number) =>
          own(fakeObject('rect', '', width, height)),
      },
      get objects() {
        return objects;
      },
    };
    return scene;
  }

  function createView() {
    const scene = createFakeScene();
    const harness = createHarness();
    const view = new PhaserPauseView({
      scene: scene as never,
      viewport: logicalCanvasViewport(),
      controller: harness.controller,
      inventory: harness.inventory,
    });
    return { scene, view, ...harness };
  }

  const textContents = (scene: ReturnType<typeof createFakeScene>) =>
    scene.objects
      .filter((object) => object.state.kind === 'text')
      .map((object) => object.state.text);

  it('renders nothing while the panel is closed', () => {
    const { scene } = createView();
    expect(scene.objects).toHaveLength(0);
  });

  it('renders the pause panel with an interactive full-screen backdrop and controls', () => {
    const { scene, view, controller } = createView();
    controller.pause();
    view.render(controller.snapshot());

    expect(scene.objects.length).toBeGreaterThan(0);
    const backdrop = scene.objects.find(
      (object) =>
        object.state.kind === 'rect' && object.state.width === 390 && object.state.height === 844,
    );
    expect(backdrop).toBeDefined();
    expect(backdrop?.state.interactive).toBe(true);
    expect(textContents(scene)).toEqual(expect.arrayContaining(['Paused', 'Resume', 'Inventory']));
  });

  it('renders the inventory panel with weapon rows and the merge surface', () => {
    const { run, scene, view, controller } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    expect(textContents(scene)).toEqual(
      expect.arrayContaining([
        'Inventory',
        'Select two matching weapons to merge',
        expect.stringContaining('T1 Scrap Pistol I'),
        expect.stringContaining('T1 Can SMG I'),
        'Merge Selected',
        '< Back',
      ]),
    );
    const rows = scene.objects.filter(
      (object) =>
        object.state.kind === 'rect' && object.state.interactive && object.state.handlers['pointerup'],
    );
    // Two weapon rows plus the Merge and Back buttons.
    expect(rows).toHaveLength(4);
  });

  it('shows a failure notice when the merge control fails', () => {
    const { scene, view, controller } = createView();
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    // No weapons equipped: the first interactive control is Merge Selected.
    const mergeButton = scene.objects.find(
      (object) => object.state.kind === 'rect' && object.state.handlers['pointerup'],
    );
    expect(mergeButton).toBeDefined();
    mergeButton?.state.handlers['pointerup']();

    // The handler re-renders the panel with the failure notice.
    expect(textContents(scene)).toEqual(expect.arrayContaining(['Select two weapons']));
  });

  it('destroy cleans up every object and render after destroy is a no-op', () => {
    const { scene, view, controller } = createView();
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    expect(scene.objects.length).toBeGreaterThan(0);

    view.destroy();
    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);

    view.destroy(); // idempotent
    const count = scene.objects.length;
    view.render(controller.snapshot());
    expect(scene.objects.length).toBe(count);
  });
});
