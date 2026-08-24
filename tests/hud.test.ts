import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type GameEventMap } from '../src/engine/eventBus';
import { createRunState, startRun } from '../src/gameplay/runState';
import { WEAPON_RACK_CAPACITY } from '../src/gameplay/weaponRack';
import type { Player } from '../src/entities/Player';
import {
  HudController,
  PhaserHudView,
  createHudSource,
  type HudSnapshot,
  type HudSource,
  type HudView,
} from '../src/ui/hud';
import { logicalCanvasViewport } from '../src/ui/layout';

vi.mock('phaser', () => ({
  default: {
    Input: { Events: { POINTER_UP: 'pointerup' } },
    Scale: { Events: { RESIZE: 'resize' } },
  },
}));

class FakeHudView implements HudView {
  readonly renders: HudSnapshot[] = [];
  destroyCount = 0;

  render(snapshot: HudSnapshot): void {
    this.renders.push(snapshot);
  }

  destroy(): void {
    this.destroyCount += 1;
  }
}

type MutableHudSnapshot = {
  -readonly [K in keyof HudSnapshot]: HudSnapshot[K];
};

function createMutableSource(initial: Partial<HudSnapshot> = {}): HudSource & { snapshotValue: MutableHudSnapshot } {
  const snapshotValue: MutableHudSnapshot = {
    status: 'active',
    timeMs: 0,
    durationMs: 120_000,
    health: 100,
    maxHealth: 100,
    level: 1,
    xp: 0,
    xpToNext: 100,
    kills: 0,
    currency: 0,
    ...initial,
  };
  return {
    snapshotValue,
    snapshot(): HudSnapshot {
      return Object.freeze({ ...this.snapshotValue });
    },
  };
}

function createHarness(source?: HudSource, view?: FakeHudView) {
  const bus = createEventBus();
  const resolvedSource = source ?? createMutableSource();
  const resolvedView = view ?? new FakeHudView();
  const controller = new HudController(bus, resolvedSource, resolvedView);
  return { bus, source: resolvedSource, view: resolvedView, controller };
}

// Correctly-shaped payloads per event so the bus type parameter is exercised
// (the listeners ignore the payload and only mark the model dirty).
const eventPayloads = {
  'player:damaged': { amount: 1, healthRemaining: 99 },
  'xp:gained': { amount: 1, total: 1 },
  'level:up': { level: 2 },
  'currency:changed': { runTotal: 10 },
  'run:paused': {},
  'run:resumed': {},
  'run:won': { timeMs: 1000, level: 2, kills: 3 },
  'run:lost': { timeMs: 1000, level: 2, kills: 3 },
} as const satisfies Partial<GameEventMap>;

describe('HudController', () => {
  it('renders on the first update', () => {
    const { controller, view } = createHarness();

    controller.update(16);

    expect(view.renders).toHaveLength(1);
  });

  it('renders only when the whole second changes unless an event marks it dirty', () => {
    const source = createMutableSource();
    const { controller, view } = createHarness(source);

    controller.update(16);
    expect(view.renders).toHaveLength(1);

    controller.update(100);
    source.snapshotValue.timeMs = 999;
    controller.update(16);
    expect(view.renders).toHaveLength(1);

    source.snapshotValue.timeMs = 1000;
    controller.update(16);
    expect(view.renders).toHaveLength(2);
  });

  it.each(
    Object.keys(eventPayloads) as Array<keyof typeof eventPayloads>,
  )('marks dirty and re-renders after %s', (event) => {
    const source = createMutableSource();
    const { bus, controller, view } = createHarness(source);
    controller.update(16);
    expect(view.renders).toHaveLength(1);

    source.snapshotValue.currency += 1;
    bus.emit(event, eventPayloads[event]);
    controller.update(16);

    expect(view.renders).toHaveLength(2);
  });

  it('duplicate events do not rebuild unnecessarily', () => {
    const source = createMutableSource();
    const { bus, controller, view } = createHarness(source);
    controller.update(16);

    source.snapshotValue.currency = 10;
    bus.emit('currency:changed', { runTotal: 10 });
    controller.update(16);
    expect(view.renders).toHaveLength(2);

    bus.emit('currency:changed', { runTotal: 10 });
    controller.update(16);
    expect(view.renders).toHaveLength(2);
  });

  it('does not re-render when the render key is unchanged', () => {
    const source = createMutableSource();
    const { controller, view } = createHarness(source);

    controller.update(16);
    controller.update(16);
    source.snapshotValue.timeMs = 500;
    controller.update(16);

    expect(view.renders).toHaveLength(1);
  });

  it('unsubscribes all event listeners on destroy', () => {
    const { bus, controller, view } = createHarness();
    controller.update(16);
    controller.destroy();

    bus.emit('player:damaged', { amount: 1, healthRemaining: 99 });
    controller.update(16);
    expect(view.renders).toHaveLength(1);

    // A fresh controller on the same bus still receives events, proving the
    // destroyed controller removed only its own listeners. The source is
    // mutated before the event so the render key changes (an unchanged key
    // is intentionally de-duplicated by design).
    const source = createMutableSource();
    const freshView = new FakeHudView();
    const fresh = new HudController(bus, source, freshView);
    fresh.update(16);
    source.snapshotValue.health = 50;
    bus.emit('player:damaged', { amount: 1, healthRemaining: 50 });
    fresh.update(16);
    expect(freshView.renders).toHaveLength(2);
  });

  it('destroys the view exactly once and update after destroy is a no-op', () => {
    const { controller, view } = createHarness();
    controller.update(16);
    expect(view.renders).toHaveLength(1);

    controller.destroy();
    controller.destroy();

    expect(view.destroyCount).toBe(1);

    controller.update(16);
    expect(view.renders).toHaveLength(1);
  });
});

describe('createHudSource', () => {
  function createPlayer(health = 100, maxHealth = 100): Player {
    return {
      health,
      maxHealth,
    } as Player;
  }

  it('does not expose weapon inventory in the HUD snapshot', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.equipped = [{ instanceId: 'i1', defId: 'def-pistol', family: 'pistol', tier: 2 }];
    const snapshot = createHudSource({ runState, player: createPlayer(), durationMs: 60_000 }).snapshot();
    expect('weapons' in snapshot).toBe(false);
    expect('mergeReady' in snapshot).toBe(false);
  });

  it('does not make HUD merge readiness depend on the authoritative rack', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.equipped = [
      { instanceId: 'i1', defId: 'def-pistol', family: 'pistol', tier: 1 },
      { instanceId: 'i2', defId: 'def-pistol', family: 'pistol', tier: 1 },
    ];
    expect('mergeReady' in createHudSource({ runState, player: createPlayer(), durationMs: 60_000 }).snapshot()).toBe(false);
  });

  it('reflects current run state on every snapshot', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    startRun(runState);
    runState.currency = 50;
    runState.kills = 3;
    const player = createPlayer(80, 100);
    const source = createHudSource({
      runState,
      player,
      durationMs: 60_000,
    });

    const first = source.snapshot();
    expect(first.status).toBe('active');
    expect(first.currency).toBe(50);
    expect(first.kills).toBe(3);
    expect(first.health).toBe(80);

    runState.currency = 75;
    player.health = 60;
    const second = source.snapshot();
    expect(second.currency).toBe(75);
    expect(second.health).toBe(60);
  });
});

describe('PhaserHudView', () => {
  function createFakeScene() {
    let resize: { handler: () => void; context: unknown } | undefined;
    const objects: Array<ReturnType<typeof fakeObject>> = [];
    const own = <T>(object: T): T => {
      objects.push(object as ReturnType<typeof fakeObject>);
      return object;
    };

    function fakeObject(kind = 'object', width = 0, height = 0, x = 0, y = 0) {
      const state: Record<string, unknown> = {
        kind,
        visible: true,
        alpha: 1,
        x,
        y,
        width,
        height,
        scaleX: 1,
        scaleY: 1,
        text: '',
        interactive: false,
        destroyed: false,
      };
      const chain = (key: string, value: unknown) => {
        state[key] = value;
        return api;
      };
      const api = {
        get state() { return { ...state }; },
        setText(text: string) { return chain('text', text); },
        setOrigin() { return api; },
        setScrollFactor() { return api; },
        setDepth() { return api; },
        setVisible(visible: boolean) { return chain('visible', visible); },
        setAlpha(alpha: number) { return chain('alpha', alpha); },
        setPosition(x: number, y: number) { state.x = x; state.y = y; return api; },
        setScale(x: number, y: number) { state.scaleX = x; state.scaleY = y; return api; },
        setStrokeStyle() { return api; },
        setInteractive() { state.interactive = true; return api; },
        disableInteractive() { state.interactive = false; return api; },
        on() { return api; },
        off() { return api; },
        destroy() { state.destroyed = true; },
      };
      return api;
    }

    const scene = {
      add: {
        container: () => {
          const base = fakeObject('container');
          const container = {
            // Object spread snapshots the state getter into a data property,
            // so delegate back to base (whose getter reads the closure state)
            // to keep `container.state.destroyed` accurate after destroy.
            ...base,
            get state() { return { ...base.state }; },
            children: [] as Array<ReturnType<typeof fakeObject>>,
            add(children: unknown[]) {
              children.forEach((child) => {
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
        text: (x: number, y: number, text: string) => own(fakeObject('text', 0, 0, x, y)).setText(text),
        rectangle: (x: number, y: number, width: number, height: number) =>
          own(fakeObject('rect', width, height, x, y)),
        arc: (x: number, y: number) => own(fakeObject('arc', 0, 0, x, y)),
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
          if (event === 'resize' && resize?.handler === handler && resize.context === context) {
            resize = undefined;
          }
        },
        listenerCount(event: string) {
          return event === 'resize' && resize ? 1 : 0;
        },
      },
      get objects() { return objects; },
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

  it('renders without throwing and clamps non-finite values to safe bar scales', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport: logicalCanvasViewport() });

    expect(() =>
      view.render({
        status: 'active',
        timeMs: Number.NaN,
        durationMs: Number.NaN,
        health: Number.NaN,
        maxHealth: Number.NaN,
        level: 1,
        xp: Number.POSITIVE_INFINITY,
        xpToNext: 0,
        kills: 0,
        currency: Number.NaN,
      })
    ).not.toThrow();

    const rectangles = scene.objects.filter((object) => 'setScale' in object);
    expect(rectangles.length).toBeGreaterThanOrEqual(2);
    rectangles.forEach((rectangle) => {
      expect(Number.isFinite(rectangle.state.scaleX)).toBe(true);
      expect(rectangle.state.scaleX).toBeGreaterThanOrEqual(0);
      expect(rectangle.state.scaleX).toBeLessThanOrEqual(1);
    });
  });

  it('never renders a rack strip label or interactive rack target at any rack count', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport: logicalCanvasViewport() });

    for (let count = 0; count <= WEAPON_RACK_CAPACITY; count += 1) {
      view.render({
        status: 'active',
        timeMs: 0,
        durationMs: 1_000,
        health: 100,
        maxHealth: 100,
        level: 1,
        xp: 0,
        xpToNext: 100,
        kills: 0,
        currency: 0,
      });
    }

    // The HUD rack strip is removed: no 'Rack N/6' label, no inventory
    // command surface survives at any rack occupancy.
    const rackLabels = scene.objects.filter((object) =>
      'state' in object && typeof object.state.text === 'string' && object.state.text.startsWith('Rack '),
    );
    expect(rackLabels).toHaveLength(0);
    expect(scene.objects.filter((object) => object.state.interactive)).toHaveLength(0);
  });

  it('destroys its container and children', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport: logicalCanvasViewport() });

    view.destroy();

    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(0);
  });

  it('rebuilds the HUD after a wide resize with no rack target or label and no inventory command', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({
      scene: scene as never,
      viewport: logicalCanvasViewport(),
    });
    view.render({
      status: 'active',
      timeMs: 1_000,
      durationMs: 60_000,
      health: 100,
      maxHealth: 100,
      level: 2,
      xp: 10,
      xpToNext: 100,
      kills: 3,
      currency: 12,
    });
    const oldObjects = scene.objects.filter((object) => !object.state.destroyed);

    scene.resize(844, 390);

    // The rebuild still runs and owns its resize listener...
    expect(oldObjects.every((object) => object.state.destroyed)).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(1);
    // ...but the rack strip is gone: no interactive rack target, no rack
    // label, and the deprecated inventory callback is never invoked.
    const rackTargets = scene.objects.filter((object) =>
      object.state.kind === 'rect' && object.state.interactive && !object.state.destroyed,
    );
    expect(rackTargets).toHaveLength(0);
    const rackText = scene.objects.find((object) =>
      object.state.kind === 'text'
        && typeof object.state.text === 'string'
        && object.state.text.startsWith('Rack ')
        && !object.state.destroyed,
    );
    expect(rackText).toBeUndefined();
  });
});
