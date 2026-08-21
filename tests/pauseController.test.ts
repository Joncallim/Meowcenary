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
    Scale: {
      Events: {
        RESIZE: 'resize',
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

  it('opens directly from an active run and owns one manual pause', () => {
    const { run, bus, controller } = createHarness();
    const pausedSpy = vi.fn();
    bus.on('run:paused', pausedSpy);

    expect(controller.openInventoryFromRun()).toBe(true);
    expect(run.status).toBe('paused');
    expect(run.pauseReason).toBe('manual');
    expect(controller.snapshot().panel).toBe('inventory');
    expect(pausedSpy).toHaveBeenCalledTimes(1);
    expect(controller.openInventoryFromRun()).toBe(false);
  });

  it('refuses direct open during a level-up pause', () => {
    const { run, controller } = createHarness();
    pauseRun(run, undefined, 'levelUp');

    expect(controller.openInventoryFromRun()).toBe(false);
    expect(controller.snapshot().panel).toBe('closed');
    expect(run.pauseReason).toBe('levelUp');
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
    expect(controller.openInventoryFromRun()).toBe(false);
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
    x: number;
    y: number;
    width: number;
    height: number;
    interactive: boolean;
    destroyed: boolean;
    handlers: Record<string, () => void>;
  }

  function createFakeScene() {
    const objects: Array<ReturnType<typeof fakeObject>> = [];
    let failNextText = false;
    let keydown:
      | { handler: (event: KeyboardEvent) => void; context: unknown }
      | undefined;
    let resize:
      | { handler: () => void; context: unknown }
      | undefined;
    const own = <T>(object: T): T => {
      const candidate = object as ReturnType<typeof fakeObject>;
      if (!objects.includes(candidate)) {
        objects.push(candidate);
      }
      return object;
    };

    function fakeObject(
      kind: FakeState['kind'],
      text = '',
      width = 0,
      height = 0,
      x = 0,
      y = 0,
    ) {
      const state: FakeState = {
        kind,
        text,
        x,
        y,
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
        text: (x: number, y: number, text: string) => {
          if (failNextText) {
            failNextText = false;
            throw new Error('Injected text factory failure');
          }
          return own(fakeObject('text', text, 0, 0, x, y));
        },
        rectangle: (x: number, y: number, width: number, height: number) =>
          own(fakeObject('rect', '', width, height, x, y)),
      },
      input: {
        keyboard: {
          on(event: string, handler: (event: KeyboardEvent) => void, context: unknown) {
            if (event === 'keydown') keydown = { handler, context };
          },
          off(event: string, handler: (event: KeyboardEvent) => void, context: unknown) {
            if (
              event === 'keydown' &&
              keydown?.handler === handler &&
              keydown.context === context
            ) {
              keydown = undefined;
            }
          },
        },
      },
      scale: {
        width: 390,
        height: 844,
        displaySize: { width: 390, height: 844 },
        parentSize: { width: 390, height: 844 },
        on(event: string, handler: () => void, context: unknown) {
          if (event === 'resize') resize = { handler, context };
        },
        off(event: string, handler: () => void, context: unknown) {
          if (
            event === 'resize' &&
            resize?.handler === handler &&
            resize.context === context
          ) {
            resize = undefined;
          }
        },
        listenerCount(event: string) {
          return event === 'resize' && resize ? 1 : 0;
        },
      },
      get objects() {
        return objects;
      },
      failNextText() {
        failNextText = true;
      },
      triggerKey(key: string, repeat = false) {
        let prevented = false;
        keydown?.handler.call(keydown.context, {
          key,
          repeat,
          preventDefault: () => {
            prevented = true;
          },
        } as KeyboardEvent);
        return prevented;
      },
      resize(displayWidth: number, displayHeight: number) {
        const fitScale = Math.min(displayWidth / 390, displayHeight / 844);
        scene.scale.displaySize.width = 390 * fitScale;
        scene.scale.displaySize.height = 844 * fitScale;
        scene.scale.parentSize.width = displayWidth;
        scene.scale.parentSize.height = displayHeight;
        resize?.handler.call(resize.context);
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
      bus: harness.bus,
      controller: harness.controller,
      inventory: harness.inventory,
    });
    return { scene, view, ...harness };
  }

  const textContents = (scene: ReturnType<typeof createFakeScene>) =>
    scene.objects
      .filter((object) => object.state.kind === 'text')
      .map((object) => object.state.text);

  /** Records ordered ui:* command events from the real local bus. */
  const recordEvents = (bus: ReturnType<typeof createEventBus>) => {
    const events: string[] = [];
    bus.on('ui:navigate', () => events.push('ui:navigate'));
    bus.on('ui:confirm', () => events.push('ui:confirm'));
    bus.on('ui:back', () => events.push('ui:back'));
    return events;
  };

  /** Live interactive modal buttons in creation order (destroyed render
   *  leftovers are excluded). */
  const liveButtons = (scene: ReturnType<typeof createFakeScene>) =>
    scene.objects.filter(
      (object) =>
        object.state.kind === 'rect' &&
        object.state.handlers['pointerup'] &&
        !object.state.destroyed,
    );

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
    expect(textContents(scene)).toEqual(expect.arrayContaining(['Paused', 'Resume', 'Weapon Rack']));
  });

  it('renders the six-slot visual rack and disabled merge surface', () => {
    const { run, scene, view, controller } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    expect(textContents(scene)).toEqual(
      expect.arrayContaining([
        'Weapon Rack',
        '2/6',
        'Scrap Pistol I',
        'Can SMG I',
        '3  EMPTY SLOT',
        '6  EMPTY SLOT',
        'SELECT A MATCHING PAIR',
        '< Back',
      ]),
    );
    const rows = scene.objects.filter(
      (object) =>
        object.state.kind === 'rect' && object.state.interactive && object.state.handlers['pointerup'],
    );
    // Two weapon cards plus Back. Merge is visibly disabled without a preview.
    expect(rows).toHaveLength(3);
  });

  it('does not expose an interactive merge command without a valid pair', () => {
    const { scene, view, controller, bus } = createView();
    const events = recordEvents(bus);
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    expect(textContents(scene)).toEqual(
      expect.arrayContaining(['No compatible pair in the rack yet.', 'SELECT A MATCHING PAIR']),
    );
    expect(liveButtons(scene)).toHaveLength(1); // Back only.
    expect(events).toEqual([]);
  });

  it('cleans the partial tree and stays hidden when text construction throws', () => {
    const { scene, view, controller } = createView();
    controller.pause();
    scene.failNextText();

    expect(() => view.render(controller.snapshot())).toThrow('Injected text factory failure');
    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);

    // A later render retries from a clean slate.
    view.render(controller.snapshot());
    expect(textContents(scene)).toEqual(
      expect.arrayContaining(['Paused', 'Resume', 'Weapon Rack']),
    );
  });

  it('destroy cleans up every object and render after destroy is a no-op', () => {
    const { scene, view, controller } = createView();
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    expect(scene.objects.length).toBeGreaterThan(0);

    view.destroy();
    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(0);

    view.destroy(); // idempotent
    const count = scene.objects.length;
    view.render(controller.snapshot());
    expect(scene.objects.length).toBe(count);
  });

  it('rebuilds a bounded compact rack from the live display size on resize', () => {
    const { run, scene, view, controller } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const oldObjects = scene.objects.filter((object) => !object.state.destroyed);

    scene.resize(844, 390);

    expect(oldObjects.every((object) => object.state.destroyed)).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(1);
    const liveRectangles = scene.objects.filter(
      (object) => object.state.kind === 'rect' && !object.state.destroyed,
    );
    for (const rectangle of liveRectangles) {
      expect(rectangle.state.y - rectangle.state.height / 2).toBeGreaterThanOrEqual(0);
      expect(rectangle.state.y + rectangle.state.height / 2).toBeLessThanOrEqual(844);
    }
    const compactSlots = liveRectangles.filter(
      (object) => object.state.width < 140 && object.state.height > 120,
    );
    expect(compactSlots).toHaveLength(6);
  });

  it('shows every changed stat in a compact four-delta merge preview', () => {
    const { run, scene, view, controller } = createView();
    run.equipped = [
      instance('bolt-shotgun-t2', 'a'),
      instance('bolt-shotgun-t2', 'b'),
      instance('can-smg-t2', 'c'),
    ];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    scene.resize(844, 390);

    expect(textContents(scene)).toContain('Merge ready.');

    liveButtons(scene)[0]!.state.handlers['pointerup']!();
    expect(textContents(scene)).toEqual(expect.arrayContaining(['PICK 1', 'MATCH', 'NO MATCH']));
    liveButtons(scene)[1]!.state.handlers['pointerup']!();

    expect(textContents(scene)).toEqual(expect.arrayContaining([
      'DMG  7 → 9',
      'RATE  1.02/s → 1.11/s',
      'SHOTS  ×5 → ×6',
      'PIERCE  0 → 1',
    ]));
  });

  describe('command events', () => {
  it('emits exactly one ui:back for an accepted Resume', () => {
    const { scene, view, controller, bus } = createView();
    const events = recordEvents(bus);
    controller.pause();
    view.render(controller.snapshot());

    liveButtons(scene)[0]!.state.handlers['pointerup']!();

    expect(events).toEqual(['ui:back']);
    expect(controller.snapshot().panel).toBe('closed');
  });

  it('emits exactly one ui:confirm for an accepted Inventory command', () => {
    const { scene, view, controller, bus } = createView();
    const events = recordEvents(bus);
    controller.pause();
    view.render(controller.snapshot());

    liveButtons(scene)[1]!.state.handlers['pointerup']!();

    expect(events).toEqual(['ui:confirm']);
    expect(controller.snapshot().panel).toBe('inventory');
  });

  it('emits exactly one ui:navigate when a weapon row selection actually changes', () => {
    const { run, scene, view, controller, bus } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    liveButtons(scene)[0]!.state.handlers['pointerup']!();

    expect(events).toEqual(['ui:navigate']);
  });

  it('emits exactly one ui:confirm on a successful merge', () => {
    const { run, scene, view, controller, bus } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    liveButtons(scene)[0]!.state.handlers['pointerup']!(); // select a → ui:navigate
    expect(textContents(scene)).toEqual(
      expect.arrayContaining(['PICK 1', 'MATCH', 'Choose a highlighted match.']),
    );
    liveButtons(scene)[1]!.state.handlers['pointerup']!(); // select b → ui:navigate
    expect(textContents(scene)).toEqual(
      expect.arrayContaining([
        'T1 + T1 → T2',
        'Scrap Pistol II',
        'DMG  8 → 12',
        'MERGE → Scrap Pistol II',
      ]),
    );
    liveButtons(scene)[2]!.state.handlers['pointerup']!(); // Merge Selected → ui:confirm

    expect(events).toEqual(['ui:navigate', 'ui:navigate', 'ui:confirm']);
    expect(textContents(scene)).toEqual(
      expect.arrayContaining([
        'MERGE COMPLETE',
        'Scrap Pistol II',
        '1 SLOT FREED • 1/6 occupied',
      ]),
    );
  });

  it('emits no merge command event while the action is disabled', () => {
    const { scene, view, controller, bus } = createView();
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    expect(liveButtons(scene)).toHaveLength(1); // Back only.
    expect(events).toEqual([]);
    expect(textContents(scene)).toEqual(
      expect.arrayContaining(['SELECT A MATCHING PAIR']),
    );
  });

  it('supports number-key selection and Enter commit through the same commands', () => {
    const { run, scene, view, controller, bus } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    expect(scene.triggerKey('1')).toBe(true);
    expect(scene.triggerKey('2')).toBe(true);
    expect(controller.snapshot().inventory.preview?.result.definitionId).toBe('scrap-pistol-t2');
    view.moveFocus('down');
    view.moveFocus('down');
    view.moveFocus('down');
    view.moveFocus('left');
    expect(scene.triggerKey('Enter')).toBe(false);
    expect(view.confirmFocused()).toBe(true);

    expect(run.equipped).toHaveLength(1);
    expect(run.equipped[0]?.defId).toBe('scrap-pistol-t2');
    expect(events).toEqual([
      'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:navigate', 'ui:confirm',
    ]);
  });

  it('ignores repeated number-key events without toggling selection', () => {
    const { run, scene, view, controller, bus } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    expect(scene.triggerKey('1')).toBe(true);
    expect(scene.triggerKey('1', true)).toBe(false);

    expect(controller.snapshot().inventory.selectedInstanceIds).toEqual(['a']);
    expect(events).toEqual(['ui:navigate']);
  });

  it('emits exactly one ui:back for the Back button', () => {
    const { scene, view, controller, bus } = createView();
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    const buttons = liveButtons(scene);
    buttons[buttons.length - 1]!.state.handlers['pointerup']!();

    expect(events).toEqual(['ui:back']);
    expect(controller.snapshot().panel).toBe('pause');
  });

  it('emits nothing when the controller rejects a command (disposed fixture)', () => {
    const { scene, view, controller, bus } = createView();
    controller.pause();
    view.render(controller.snapshot());
    const events = recordEvents(bus);
    controller.destroy();

    liveButtons(scene)[0]!.state.handlers['pointerup']!();

    expect(events).toEqual([]);
    expect(controller.snapshot().panel).toBe('pause');
  });
  });
});
