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
import { FocusStroke } from '../src/ui/theme';
import type { InputMode } from '../src/systems/input';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_DOWN: 'pointerdown',
        POINTER_UP: 'pointerup',
        POINTER_OVER: 'pointerover',
        POINTER_OUT: 'pointerout',
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
    strokeWidth: number;
    strokeColor?: number;
    strokeAlpha: number;
  }

  function createFakeScene() {
    const objects: Array<ReturnType<typeof fakeObject>> = [];
    let failNextText = false;
    let failNextRect = 0;
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
        strokeWidth: 0,
        strokeColor: undefined,
        strokeAlpha: 0,
      };
      const chain = (key: keyof FakeState, value: FakeState[keyof FakeState]) => {
        (state as unknown as Record<string, unknown>)[key] = value;
        return api;
      };
      const api = {
        get state() {
          return { ...state };
        },
        // Real Phaser display objects expose stroke state as properties; the
        // production views read them (e.g. weaponRackView.registerTarget
        // captures slot.strokeColor), so the fake must mirror that surface.
        get strokeWidth() {
          return state.strokeWidth;
        },
        get strokeColor() {
          return state.strokeColor;
        },
        get strokeAlpha() {
          return state.strokeAlpha;
        },
        setText(text: string) {
          // Real Phaser 3.90 destroys the Text texture/frame; setText on a
          // destroyed Text reaches nulled frame data and throws. Mirror that
          // so a stale hint reference (portrait→compact resize, round-5
          // finding) fails the suite instead of silently passing.
          if (state.destroyed) {
            throw new Error(`setText called on destroyed object (${state.text ?? ''})`);
          }
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
        setStrokeStyle(width: number, color: number, alpha: number) {
          state.strokeWidth = width;
          state.strokeColor = color;
          state.strokeAlpha = alpha;
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
        rectangle: (x: number, y: number, width: number, height: number) => {
          if (failNextRect > 0) {
            failNextRect -= 1;
            if (failNextRect === 0) {
              throw new Error('Injected rectangle factory failure');
            }
          }
          return own(fakeObject('rect', '', width, height, x, y));
        },
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
      failNextRect(skip = 1) {
        // Round-7: skip N rects (default 1 = the backdrop), fail on the next.
        failNextRect = skip;
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

  function createView(options: { readInputMode?: () => InputMode } = {}) {
    const scene = createFakeScene();
    const harness = createHarness();
    const view = new PhaserPauseView({
      scene: scene as never,
      viewport: logicalCanvasViewport(),
      bus: harness.bus,
      controller: harness.controller,
      inventory: harness.inventory,
      ...(options.readInputMode ? { readInputMode: options.readInputMode } : {}),
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

  /** Drives the rack's arm+commit pointer funnel: pointerdown with a
   *  captured pointer id arms the target, pointerup with the same id
   *  commits it (X3 boundary). */
  const press = (object: ReturnType<typeof createFakeScene>['objects'][number]) => {
    const handlers = object.state.handlers as unknown as Record<string, (pointer: { id: number }) => void>;
    handlers['pointerdown']?.({ id: 7 });
    handlers['pointerup']?.({ id: 7 });
  };

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
    // All six slots (occupied and empty) plus Merge and Back are interactive
    // targets; empty slots register a no-op activation. Merge is visibly
    // disabled without a preview but stays interactive for hover: command
    // suppression lives in the handle's enabled guard (round-2 finding F2).
    expect(rows).toHaveLength(8);
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
    // All six slots plus Merge and Back are registered; the disabled Merge
    // stays interactive for hover but its funnel cannot emit a command. In
    // creation order: slots 0-5, Merge (6), Back (7).
    expect(liveButtons(scene)).toHaveLength(8);
    expect(liveButtons(scene)[6]!.state.interactive).toBe(true);
    expect(liveButtons(scene)[7]!.state.interactive).toBe(true);
    press(liveButtons(scene)[6]!); // disabled Merge
    expect(events).toEqual([]);
    expect(controller.snapshot().inventory.selectedInstanceIds).toEqual([]);
    expect(controller.snapshot().panel).toBe('inventory');

    // G-15: the disabled no-op is not terminal — Back still walks to pause.
    press(liveButtons(scene)[7]!);
    expect(events).toEqual(['ui:back']);
    expect(controller.snapshot().panel).toBe('pause');
  });

  it('shows exactly one FocusStroke ring with exact width/color/alpha on the focused pause button and restores the exact base stroke (F4)', () => {
    let mode: InputMode = 'pointer';
    const { scene, view, controller } = createView({ readInputMode: () => mode });
    controller.pause();
    view.render(controller.snapshot());

    const buttons = liveButtons(scene); // [Resume, Weapon Rack]
    expect(buttons).toHaveLength(2);
    // Capture each button's exact base stroke before keyboard focus applies.
    const resumeBase = {
      width: buttons[0]!.state.strokeWidth,
      color: buttons[0]!.state.strokeColor,
      alpha: buttons[0]!.state.strokeAlpha,
    };
    const rackBase = {
      width: buttons[1]!.state.strokeWidth,
      color: buttons[1]!.state.strokeColor,
      alpha: buttons[1]!.state.strokeAlpha,
    };
    // Pointer mode: no persistent ring.
    expect(buttons[0]!.state.strokeColor).not.toBe(FocusStroke.color);

    mode = 'keyboard';
    view.refreshInputPresentation();
    // Focused Resume carries ALL THREE FocusStroke theme constants.
    expect(buttons[0]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(buttons[0]!.state.strokeColor).toBe(FocusStroke.color);
    expect(buttons[0]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(buttons[1]!.state.strokeColor).not.toBe(FocusStroke.color);
    expect(buttons[1]!.state.strokeWidth).toBe(rackBase.width);

    // Linear wrap: down reaches Weapon Rack; the ring moves exactly once and
    // Resume's exact base stroke (width/color/alpha) is restored.
    expect(view.moveFocus('down')).toBe(true);
    expect(buttons[1]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(buttons[1]!.state.strokeColor).toBe(FocusStroke.color);
    expect(buttons[1]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(buttons[0]!.state.strokeWidth).toBe(resumeBase.width);
    expect(buttons[0]!.state.strokeColor).toBe(resumeBase.color);
    expect(buttons[0]!.state.strokeAlpha).toBe(resumeBase.alpha);

    // The logical confirm still routes the exact focused command.
    expect(view.confirmFocused()).toBe(true);
    expect(controller.snapshot().panel).toBe('inventory');
  });

  it('pointer hover moves exactly one ring on pause buttons and emits no event or command (F5)', () => {
    const { scene, view, controller, bus } = createView();
    const events = recordEvents(bus);
    controller.pause();
    view.render(controller.snapshot());

    const buttons = liveButtons(scene);
    expect(buttons[0]!.state.strokeColor).not.toBe(FocusStroke.color);

    buttons[1]!.state.handlers['pointerover']!();
    expect(buttons[1]!.state.strokeColor).toBe(FocusStroke.color);
    expect(buttons[0]!.state.strokeColor).not.toBe(FocusStroke.color);
    expect(events).toEqual([]);

    buttons[1]!.state.handlers['pointerout']!();
    expect(buttons[1]!.state.strokeColor).not.toBe(FocusStroke.color);
    expect(events).toEqual([]);

    // Direct pointer activation from a different starting index: the single
    // surface funnel FIRST syncs the logical index, THEN activates — the
    // exact focused command runs (round-2 finding F2).
    buttons[1]!.state.handlers['pointerup']!();
    expect(events).toEqual(['ui:confirm']);
    expect(controller.snapshot().panel).toBe('inventory');
  });

  it('syncs the pointer-up target index before a rejected same-panel activation and retains it for the next command (F2)', () => {
    const { run, scene, view, controller, bus } = createView({ readInputMode: () => 'keyboard' });
    const events = recordEvents(bus);
    controller.pause();
    view.render(controller.snapshot());
    view.refreshInputPresentation();
    let buttons = liveButtons(scene);
    expect(buttons).toHaveLength(2);

    // Begin on one logical index (Weapon Rack, 1) through the real logical seam.
    expect(view.moveFocus('down')).toBe(true);
    expect(events).toEqual(['ui:navigate']);
    expect(buttons[1]!.state.strokeWidth).toBe(FocusStroke.width);

    // Force a rejected same-panel activation: the run is resumed externally,
    // so Resume's command is refused, the panel stays visible, and the
    // rebuild is a same-panel preserve.
    run.status = 'active';
    run.pauseReason = null;
    buttons[0]!.state.handlers['pointerup']!();
    expect(events).toEqual(['ui:navigate']);
    expect(controller.snapshot().panel).toBe('pause');

    // The pointer-up funnel FIRST synced the logical index to the activated
    // target: the retained ring is Resume (0), not the stale Weapon Rack (1).
    buttons = liveButtons(scene); // fresh handles after the same-panel rebuild
    expect(buttons[0]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(buttons[0]!.state.strokeColor).toBe(FocusStroke.color);
    expect(buttons[0]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(buttons[1]!.state.strokeColor).not.toBe(FocusStroke.color);

    // The rejection consumed nothing: restore the manual pause and the next
    // legal command acts from the synced Resume index — Resume still resumes.
    run.status = 'paused';
    run.pauseReason = 'manual';
    expect(view.confirmFocused()).toBe(true);
    expect(events).toEqual(['ui:navigate', 'ui:back']);
    expect(controller.snapshot().panel).toBe('closed');
  });

  it('applies the empty-rack Back fallback only on genuine entry and preserves live focus on same-panel resize (F4)', () => {
    const { run, scene, view, controller } = createView({ readInputMode: () => 'keyboard' });
    view.refreshInputPresentation();
    run.equipped = [];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    // Genuine entry into an entirely empty rack: the fallback focuses Back
    // (capacity 6 → index 7), the last registered hover target.
    const hoverTargets = scene.objects.filter(
      (object) => object.state.handlers['pointerover'] && !object.state.destroyed,
    );
    // slots 0..5, Merge (6), Back (7)
    expect(hoverTargets).toHaveLength(8);
    expect(hoverTargets[7]!.state.strokeColor).toBe(FocusStroke.color);
    expect(hoverTargets[6]!.state.strokeColor).not.toBe(FocusStroke.color);

    // Left from Back reaches Merge (grid col 0 means index 6 is Merge).
    expect(view.moveFocus('left')).toBe(true);
    expect(hoverTargets[6]!.state.strokeColor).toBe(FocusStroke.color);
    expect(hoverTargets[7]!.state.strokeColor).not.toBe(FocusStroke.color);

    // Same-inventory resize rebuild preserves the live Merge index — the
    // empty-rack fallback must not re-run (F4 regression).
    scene.resize(844, 390);
    const afterResize = scene.objects.filter(
      (object) => object.state.handlers['pointerover'] && !object.state.destroyed,
    );
    expect(afterResize[6]!.state.strokeColor).toBe(FocusStroke.color);
    expect(afterResize[7]!.state.strokeColor).not.toBe(FocusStroke.color);
    // Merge left stays (col 0); right reaches Back — proving the index is 6.
    expect(view.moveFocus('left')).toBe(false);
    expect(view.moveFocus('right')).toBe(true);
  });

  it('shows a pointer-hover ring on rack Merge and Back modal buttons and syncs the index before activation (F5/F2)', () => {
    const { run, scene, view, controller, bus } = createView();
    const events = recordEvents(bus);
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    const modalTargets = scene.objects.filter(
      (object) =>
        object.state.kind === 'rect' &&
        object.state.handlers['pointerover'] &&
        !object.state.destroyed &&
        object.state.height <= 60,
    );
    // [Merge (disabled, interactive for hover), Back (enabled)] — both must
    // be interactive in production, or hover events never fire (F2).
    expect(modalTargets).toHaveLength(2);
    expect(modalTargets[0]!.state.interactive).toBe(true);
    expect(modalTargets[1]!.state.interactive).toBe(true);

    // Hover the disabled Merge first: exactly one FocusStroke ring, no event.
    modalTargets[0]!.state.handlers['pointerover']!();
    expect(modalTargets[0]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(modalTargets[0]!.state.strokeColor).toBe(FocusStroke.color);
    expect(modalTargets[0]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(modalTargets[1]!.state.strokeColor).not.toBe(FocusStroke.color);
    expect(events).toEqual([]);

    modalTargets[0]!.state.handlers['pointerout']!();
    expect(modalTargets[0]!.state.strokeColor).not.toBe(FocusStroke.color);
    expect(events).toEqual([]);

    // Hover Back: ring moves, still no event.
    modalTargets[1]!.state.handlers['pointerover']!();
    expect(modalTargets[1]!.state.strokeColor).toBe(FocusStroke.color);
    expect(events).toEqual([]);

    // Directly activate the disabled Merge from a different starting index
    // (navigator is on Back, index 7): the funnel FIRST syncs the logical
    // index to Merge (6), THEN activate() suppresses the command. The synced
    // index is preserved — proven by grid movement after.
    modalTargets[0]!.state.handlers['pointerup']!();
    expect(events).toEqual([]);
    expect(controller.snapshot().inventory.selectedInstanceIds).toEqual([]);
    expect(view.moveFocus('left')).toBe(false); // index 6, col 0: left stays
    expect(view.moveFocus('right')).toBe(true); // index 6 → Back (7)

    // G-15: with a committed preview the same funnel activates the exact
    // focused command — select both weapons via number shortcuts, hover Back,
    // then pointer-up on the now-enabled Merge from the Back index.
    scene.triggerKey('1');
    scene.triggerKey('2');
    expect(controller.snapshot().inventory.preview?.result.definitionId).toBe('scrap-pistol-t2');
    const enabledTargets = scene.objects.filter(
      (object) =>
        object.state.kind === 'rect' &&
        object.state.handlers['pointerover'] &&
        !object.state.destroyed &&
        object.state.height <= 60,
    );
    expect(enabledTargets).toHaveLength(2);
    enabledTargets[1]!.state.handlers['pointerover']!(); // navigator → Back
    expect(view.moveFocus('right')).toBe(false); // Back is the last target
    enabledTargets[0]!.state.handlers['pointerup']!(); // Merge from index 7
    expect(events.slice(-1)).toEqual(['ui:confirm']);
    expect(run.equipped).toHaveLength(1);
    expect(run.equipped[0]?.tier).toBe(2);
  });

  it('restores the slot base stroke after keyboard focus moves away', () => {
    const { run, scene, view, controller } = createView({ readInputMode: () => 'keyboard' });
    view.refreshInputPresentation();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    const slotTargets = scene.objects.filter(
      (object) =>
        object.state.kind === 'rect' &&
        object.state.handlers['pointerover'] &&
        !object.state.destroyed &&
        object.state.height > 60,
    );
    // Six slot cells in row-major order.
    expect(slotTargets).toHaveLength(6);
    // Entry focuses slot 0: its rarity stroke is replaced by the exact
    // FocusStroke (width, color, alpha).
    expect(slotTargets[0]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(slotTargets[0]!.state.strokeColor).toBe(FocusStroke.color);
    expect(slotTargets[0]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    const baseStroke = {
      width: slotTargets[1]!.state.strokeWidth,
      color: slotTargets[1]!.state.strokeColor,
      alpha: slotTargets[1]!.state.strokeAlpha,
    };
    expect(baseStroke.color).toBeDefined();

    // Down from row 0 col 0 → row 1 col 0 (index 2): slot 0's exact base
    // rarity stroke (width/color/alpha) returns.
    view.moveFocus('down');
    expect(slotTargets[2]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(slotTargets[2]!.state.strokeColor).toBe(FocusStroke.color);
    expect(slotTargets[2]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(slotTargets[0]!.state.strokeWidth).toBe(baseStroke.width);
    expect(slotTargets[0]!.state.strokeColor).toBe(baseStroke.color);
    expect(slotTargets[0]!.state.strokeAlpha).toBe(baseStroke.alpha);
  });

  it('cleans the partial tree and stays hidden when text construction throws', () => {
    const { scene, view, controller } = createView();
    controller.pause();
    scene.failNextText();

    expect(() => view.render(controller.snapshot())).toThrow('Injected text factory failure');
    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);

    // F6: no committed root after the failed rebuild — every move/confirm
    // seam refuses instead of acting on destroyed-tree handles.
    expect(view.moveFocus('down')).toBe(false);
    expect(view.confirmFocused()).toBe(false);

    // A later render retries from a clean slate.
    view.render(controller.snapshot());
    expect(textContents(scene)).toEqual(
      expect.arrayContaining(['Paused', 'Resume', 'Weapon Rack']),
    );
  });

  it('gates rack number shortcuts on the parent committed root after a failed rebuild and resumes the exact selection (F1)', () => {
    const { run, scene, view, controller, bus } = createView();
    const events = recordEvents(bus);
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());

    // Same-inventory rebuild fails mid-tree: the parent has no committed
    // root, so the retained isOpen() state must NOT let the number shortcut
    // act on the destroyed tree.
    scene.failNextText();
    expect(() => view.render(controller.snapshot())).toThrow('Injected text factory failure');
    expect(scene.triggerKey('1')).toBe(false);
    expect(events).toEqual([]);
    expect(controller.snapshot().inventory.selectedInstanceIds).toEqual([]);

    // G-15: a successful retry re-publishes the rack and the exact number-key
    // selection command works again.
    view.render(controller.snapshot());
    expect(scene.triggerKey('1')).toBe(true);
    expect(controller.snapshot().inventory.selectedInstanceIds).toEqual(['a']);
    expect(events).toEqual(['ui:navigate']);
  });

  it('preserves the exact Weapon Rack focus and ring through a same-pause resize (F6)', () => {
    let mode: InputMode = 'pointer';
    const { scene, view, controller } = createView({ readInputMode: () => mode });
    controller.pause();
    view.render(controller.snapshot());
    mode = 'keyboard';
    view.refreshInputPresentation();

    // Focus Weapon Rack (index 1) on the pause panel.
    expect(view.moveFocus('down')).toBe(true);
    const pauseButtons = () =>
      scene.objects.filter(
        (object) => object.state.handlers['pointerup'] && !object.state.destroyed,
      );
    expect(pauseButtons()[1]!.state.strokeColor).toBe(FocusStroke.color);

    // Same-pause resize rebuild preserves the exact target and its ring.
    scene.resize(844, 390);
    const after = pauseButtons();
    expect(after).toHaveLength(2);
    expect(after[1]!.state.strokeWidth).toBe(FocusStroke.width);
    expect(after[1]!.state.strokeColor).toBe(FocusStroke.color);
    expect(after[1]!.state.strokeAlpha).toBe(FocusStroke.alpha);
    expect(after[0]!.state.strokeColor).not.toBe(FocusStroke.color);

    // G-15: the preserved focus still routes its exact command.
    expect(view.confirmFocused()).toBe(true);
    expect(controller.snapshot().panel).toBe('inventory');
  });

  it('does not touch a destroyed portrait key hint after a portrait→compact resize (round-5)', () => {
    let mode: InputMode = 'pointer';
    const { run, scene, view, controller } = createView({ readInputMode: () => mode });
    run.equipped = [];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot()); // portrait rack (keyHintY defined)
    view.refreshInputPresentation();

    // Portrait→compact resize destroys the portrait root (incl. its key
    // hint); the compact render has no keyHintY. The stale this.hint must be
    // cleared at render teardown, or the mode transitions below call
    // setText() on the destroyed portrait Text and throw (real Phaser 3.90
    // nulls the Text frame on destroy; the fake's setText rejects on
    // destroyed objects to mirror that).
    scene.resize(844, 390);

    // Every input-mode transition after the resize must neither touch the
    // destroyed hint nor throw.
    for (const nextMode of ['keyboard', 'gamepad', 'pointer'] as const) {
      mode = nextMode;
      expect(() => view.refreshInputPresentation()).not.toThrow();
    }
  });

  it('clears rack display refs when the parent rebuild fails before the rack renders (round-6)', () => {
    let mode: InputMode = 'keyboard';
    const { run, scene, view, controller } = createView({ readInputMode: () => mode });
    run.equipped = [];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot()); // rack committed: hint + targets live
    view.refreshInputPresentation();

    // Same-panel rebuild fails in the PARENT (backdrop rectangle) — after the
    // shared root is destroyed, before weaponRack.render() would re-clear its
    // display refs. The parent must clearDisplay() the rack at teardown or
    // the next mode transition calls setText() on the destroyed hint.
    scene.failNextRect();
    expect(() => view.render(controller.snapshot())).toThrow(
      'Injected rectangle factory failure',
    );

    // Mode transitions must neither touch the destroyed hint nor throw.
    for (const nextMode of ['gamepad', 'pointer', 'keyboard'] as const) {
      mode = nextMode;
      expect(() => view.refreshInputPresentation()).not.toThrow();
    }
  });

  it('clears rack display refs when rack render fails AFTER publishing the hint (round-7)', () => {
    let mode: InputMode = 'keyboard';
    const { run, scene, view, controller } = createView({ readInputMode: () => mode });
    run.equipped = [];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot()); // rack committed: hint + targets live
    view.refreshInputPresentation();

    // Same-panel rebuild fails INSIDE weaponRack.render() AFTER the hint was
    // assigned: skip 1 rect (backdrop), fail on the second rect = the first
    // slot rectangle, created after the hint text. The catch must
    // clearDisplay() the rack (hint/targets point into the partial root)
    // before destroying it, or the next mode transition calls setText() on
    // the destroyed hint.
    scene.failNextRect(2);
    expect(() => view.render(controller.snapshot())).toThrow(
      'Injected rectangle factory failure',
    );

    // Mode transitions must neither touch the destroyed hint nor throw.
    for (const nextMode of ['gamepad', 'pointer', 'keyboard'] as const) {
      mode = nextMode;
      expect(() => view.refreshInputPresentation()).not.toThrow();
    }
  });

  it.each([
    { name: 'portrait slot 4 down → Merge (6)', compact: false, moves: ['down', 'down', 'down'] as const, expected: 6 },
    { name: 'portrait slot 5 down → Back (7)', compact: false, moves: ['down', 'down', 'right', 'down'] as const, expected: 7 },
    { name: 'portrait Back left → Merge (6)', compact: false, moves: ['down', 'down', 'right', 'down', 'left'] as const, expected: 6 },
    { name: 'compact slot 3 down → Merge (6)', compact: true, moves: ['down', 'down'] as const, expected: 6 },
    { name: 'compact slot 4 down → Back (7)', compact: true, moves: ['down', 'right', 'down'] as const, expected: 7 },
    { name: 'compact slot 5 down → Back (7)', compact: true, moves: ['down', 'right', 'right', 'down'] as const, expected: 7 },
    { name: 'compact Merge (6) right → Back (7)', compact: true, moves: ['down', 'down', 'right'] as const, expected: 7 },
    { name: 'compact Back (7) left → Merge (6)', compact: true, moves: ['down', 'right', 'down', 'left'] as const, expected: 6 },
  ])('grid transition $name', ({ compact, moves, expected }) => {
    const { run, scene, view, controller } = createView({ readInputMode: () => 'keyboard' });
    view.refreshInputPresentation();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    if (compact) scene.resize(844, 390);

    for (const move of moves) {
      expect(view.moveFocus(move)).toBe(true);
    }
    const ringed = scene.objects.filter(
      (object) =>
        object.state.handlers['pointerover'] &&
        !object.state.destroyed &&
        object.state.strokeColor === FocusStroke.color &&
        object.state.strokeAlpha === FocusStroke.alpha,
    );
    expect(ringed).toHaveLength(1);
    const hoverTargets = scene.objects.filter(
      (object) => object.state.handlers['pointerover'] && !object.state.destroyed,
    );
    expect(hoverTargets.indexOf(ringed[0]!)).toBe(expected);
    expect(hoverTargets[expected]!.state.strokeWidth).toBe(FocusStroke.width);
  });

  it('grid boundaries stay and the next legal move resumes (G-15 + F6)', () => {
    const { run, scene, view, controller } = createView({ readInputMode: () => 'keyboard' });
    view.refreshInputPresentation();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const ringIndex = () => {
      const hoverTargets = scene.objects.filter(
        (object) => object.state.handlers['pointerover'] && !object.state.destroyed,
      );
      return hoverTargets.findIndex(
        (target) =>
          target.state.strokeColor === FocusStroke.color && target.state.strokeAlpha === FocusStroke.alpha,
      );
    };

    // First-row up stays (slot 0).
    expect(view.moveFocus('up')).toBe(false);
    expect(ringIndex()).toBe(0);

    // Portrait: slot 4 down → Merge (6); Merge left stays; Back right stays;
    // Back down stays; every stay is followed by an exact legal move.
    view.moveFocus('down');
    view.moveFocus('down');
    expect(ringIndex()).toBe(4);
    expect(view.moveFocus('down')).toBe(true);
    expect(ringIndex()).toBe(6);
    expect(view.moveFocus('left')).toBe(false);
    expect(ringIndex()).toBe(6);
    expect(view.moveFocus('right')).toBe(true);
    expect(ringIndex()).toBe(7);
    expect(view.moveFocus('right')).toBe(false);
    expect(ringIndex()).toBe(7);
    expect(view.moveFocus('down')).toBe(false);
    expect(ringIndex()).toBe(7);
    expect(view.moveFocus('left')).toBe(true);
    expect(ringIndex()).toBe(6);

    // Orientation 2→3 columns preserves the exact target identity (Back
    // remains Back at index 7).
    view.moveFocus('right'); // Back
    expect(ringIndex()).toBe(7);
    scene.resize(844, 390);
    expect(ringIndex()).toBe(7);
    expect(view.moveFocus('right')).toBe(false); // still last column
    expect(view.moveFocus('down')).toBe(false); // last row
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

    // Creation order: slots 0-5 (a, b occupied), Merge (6), Back (7).
    press(liveButtons(scene)[0]!); // select a → ui:navigate
    expect(textContents(scene)).toEqual(
      expect.arrayContaining(['PICK 1', 'MATCH', 'Choose a highlighted match.']),
    );
    press(liveButtons(scene)[1]!); // select b → ui:navigate
    expect(textContents(scene)).toEqual(
      expect.arrayContaining([
        'T1 + T1 → T2',
        'Scrap Pistol II',
        'DMG  8 → 12',
        'MERGE → Scrap Pistol II',
      ]),
    );
    press(liveButtons(scene)[6]!); // Merge Selected → ui:confirm

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
    const { run, scene, view, controller, bus } = createView();
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    // All six slots plus Merge and Back are registered; the disabled Merge's
    // funnel emits nothing (activated guard), so no merge command event can
    // leak. In creation order: slots 0-5, Merge (6), Back (7).
    expect(liveButtons(scene)).toHaveLength(8);
    press(liveButtons(scene)[6]!); // disabled Merge
    expect(events).toEqual([]);
    expect(textContents(scene)).toEqual(
      expect.arrayContaining(['SELECT A MATCHING PAIR']),
    );

    // G-15: the disabled no-op is not terminal — equipping a compatible pair
    // and confirming the now-enabled Merge routes exactly the expected events.
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('scrap-pistol-t1', 'b')];
    view.render(controller.snapshot());
    expect(liveButtons(scene)).toHaveLength(8); // 6 slots + Merge + Back
    press(liveButtons(scene)[0]!);
    press(liveButtons(scene)[1]!);
    expect(liveButtons(scene)).toHaveLength(8); // Merge now enabled
    press(liveButtons(scene)[6]!);
    expect(events).toEqual(['ui:navigate', 'ui:navigate', 'ui:confirm']);
    expect(run.equipped).toHaveLength(1);
    expect(run.equipped[0]?.tier).toBe(2);
  });

  it('empty-slot confirm is a no-op and the next occupied command still works (G-15)', () => {
    const { run, view, controller, bus } = createView();
    run.equipped = [instance('scrap-pistol-t1', 'a'), instance('can-smg-t1', 'b')];
    controller.pause();
    controller.openInventory();
    view.render(controller.snapshot());
    const events = recordEvents(bus);

    // Down from slot 0 reaches empty slot 2 (two-column grid); its confirm
    // is a no-op with no event.
    expect(view.moveFocus('down')).toBe(true);
    expect(view.confirmFocused()).toBe(false);
    expect(events).toEqual(['ui:navigate']);

    // The no-op did not wedge the rack: back up and confirming slot 0
    // selects the weapon with exactly its ui:navigate.
    expect(view.moveFocus('up')).toBe(true);
    expect(view.confirmFocused()).toBe(true);
    expect(controller.snapshot().inventory.selectedInstanceIds).toEqual(['a']);
    expect(events).toEqual(['ui:navigate', 'ui:navigate', 'ui:navigate']);
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
