import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type GameEventMap } from '../src/engine/eventBus';
import { createRunState, startRun } from '../src/gameplay/runState';
import { WEAPON_RACK_CAPACITY } from '../src/gameplay/weaponRack';
import type { Player } from '../src/entities/Player';
import type { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import {
  HudController,
  PhaserHudView,
  createHudSource,
  type HudSnapshot,
  type HudSource,
  type HudView,
  type HudWeaponView,
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
  const defaultWeapons: HudWeaponView[] = [
    { instanceId: 'w1', name: 'Pistol', tier: 1 },
  ];
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
    weapons: defaultWeapons,
    mergeReady: false,
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
  'weapon:merged': { fromId: 'def-a', toId: 'def-b' },
  'weapon:acquired': { definitionId: 'def-a', instanceId: 'i1', rackCount: 1, rackCapacity: 6, x: 0, y: 0 },
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

  function createWeaponRegistry(): DataWeaponRegistry {
    return {
      weaponById(id: string) {
        if (id === 'def-pistol') {
          return {
            id: 'def-pistol',
            name: 'Plasma Pistol',
            family: 'pistol',
            mergeTier: 1,
            maxTier: 2,
          } as ReturnType<DataWeaponRegistry['weaponById']>;
        }
        return undefined;
      },
      weaponByFamilyTier(family: string, tier: number) {
        if (family === 'pistol' && tier === 2) {
          return {
            id: 'def-pistol-t2',
            name: 'Plasma Pistol II',
            family: 'pistol',
            mergeTier: 2,
            maxTier: 2,
          } as ReturnType<DataWeaponRegistry['weaponByFamilyTier']>;
        }
        return undefined;
      },
    } as DataWeaponRegistry;
  }

  it('looks up weapon names from the registry and preserves runtime tiers', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.equipped = [
      { instanceId: 'i1', defId: 'def-pistol', family: 'pistol', tier: 2 },
      { instanceId: 'i2', defId: 'def-unknown', family: 'unknown', tier: 1 },
    ];
    const source = createHudSource({
      runState,
      player: createPlayer(),
      durationMs: 60_000,
      weaponRegistry: createWeaponRegistry(),
    });

    const snapshot = source.snapshot();

    expect(snapshot.weapons).toEqual([
      { instanceId: 'i1', name: 'Plasma Pistol', tier: 2 },
      { instanceId: 'i2', name: 'def-unknown', tier: 1 },
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.weapons[0])).toBe(true);
    expect(snapshot.mergeReady).toBe(false);
  });

  it('reports merge-ready iff the authoritative rack contains a valid pair', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    runState.equipped = [
      { instanceId: 'i1', defId: 'def-pistol', family: 'pistol', tier: 1 },
      { instanceId: 'i2', defId: 'def-pistol', family: 'pistol', tier: 1 },
    ];
    const source = createHudSource({
      runState,
      player: createPlayer(),
      durationMs: 60_000,
      weaponRegistry: createWeaponRegistry(),
    });

    expect(source.snapshot().mergeReady).toBe(true);
    runState.equipped = [runState.equipped[0]!];
    expect(source.snapshot().mergeReady).toBe(false);
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
      weaponRegistry: createWeaponRegistry(),
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
        weapons: [],
        mergeReady: false,
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

  it('reports the rack capacity label from 0/6 through 6/6 (Epic 14 §D13)', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport: logicalCanvasViewport() });

    for (let count = 0; count <= WEAPON_RACK_CAPACITY; count += 1) {
      const weapons = Array.from({ length: count }, (_, index) => ({
        instanceId: `w${index}`,
        name: 'Scrap Pistol I',
        tier: 1,
      }));
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
        weapons,
        mergeReady: count === 2,
      });

      const weaponText = scene.objects.find((object) =>
        'state' in object && typeof object.state.text === 'string' && object.state.text.startsWith('Rack '),
      );
      const expectedState = count === 2
        ? 'MERGE READY'
        : count === WEAPON_RACK_CAPACITY
          ? 'RACK FULL'
          : 'TAP TO INSPECT';
      const expected = `Rack ${count}/${WEAPON_RACK_CAPACITY}  •  ${expectedState}`;
      expect(weaponText?.state.text).toBe(expected);
    }
  });

  it('destroys its container and children', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport: logicalCanvasViewport() });

    view.destroy();

    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(0);
  });

  it('rebuilds the HUD and preserves a 44px rack target after a wide resize', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({
      scene: scene as never,
      viewport: logicalCanvasViewport(),
      onInventoryRequested: vi.fn(),
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
      weapons: [{ instanceId: 'w1', name: 'Bolt Shotgun II', tier: 2 }],
      mergeReady: false,
    });
    const oldObjects = scene.objects.filter((object) => !object.state.destroyed);

    scene.resize(844, 390);

    expect(oldObjects.every((object) => object.state.destroyed)).toBe(true);
    expect(scene.scale.listenerCount('resize')).toBe(1);
    const rack = scene.objects.find((object) =>
      object.state.kind === 'rect' && object.state.interactive && !object.state.destroyed,
    );
    const fitScale = 390 / 844;
    expect(Number(rack?.state.height) * fitScale).toBeCloseTo(44, 5);
    const weaponText = scene.objects.find((object) =>
      object.state.kind === 'text'
        && object.state.text === 'Rack 1/6  •  TAP TO INSPECT'
        && !object.state.destroyed,
    );
    expect(weaponText).toBeDefined();
  });
});
