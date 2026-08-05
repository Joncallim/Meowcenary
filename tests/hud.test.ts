import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState, startRun } from '../src/gameplay/runState';
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

vi.mock('phaser', () => ({ default: {} }));

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

  it.each([
    'player:damaged',
    'xp:gained',
    'level:up',
    'currency:changed',
    'weapon:merged',
    'run:paused',
    'run:resumed',
    'run:won',
    'run:lost',
  ] as const)('marks dirty and re-renders after %s', (event) => {
    const source = createMutableSource();
    const { bus, controller, view } = createHarness(source);
    controller.update(16);
    expect(view.renders).toHaveLength(1);

    source.snapshotValue.currency += 1;
    bus.emit(event, {} as never);
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

  it('destroys the view exactly once', () => {
    const { controller, view } = createHarness();

    controller.destroy();
    controller.destroy();

    expect(view.destroyCount).toBe(1);
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
          return { id: 'def-pistol', name: 'Plasma Pistol', family: 'pistol', mergeTier: 1 } as ReturnType<DataWeaponRegistry['weaponById']>;
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
    const objects: Array<ReturnType<typeof fakeObject>> = [];
    const own = <T>(object: T): T => {
      objects.push(object as ReturnType<typeof fakeObject>);
      return object;
    };

    function fakeObject() {
      const state: Record<string, unknown> = {
        visible: true,
        alpha: 1,
        x: 0,
        y: 0,
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
        destroy() { state.destroyed = true; },
      };
      return api;
    }

    const scene = {
      add: {
        container: () => {
          const base = fakeObject();
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
        text: (_x: number, _y: number, text: string) => own(fakeObject()).setText(text),
        rectangle: () => own(fakeObject()),
        arc: () => own(fakeObject()),
      },
      get objects() { return objects; },
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

  it('destroys its container and children', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport: logicalCanvasViewport() });

    view.destroy();

    expect(scene.objects.every((object) => object.state.destroyed)).toBe(true);
  });
});
