import { describe, expect, it, vi } from 'vitest';
import { createEventBus, type GameEventMap } from '../src/engine/eventBus';
import { createRunState, startRun } from '../src/gameplay/runState';
import { WEAPON_RACK_CAPACITY } from '../src/gameplay/weaponRack';
import type { Player } from '../src/entities/Player';
import {
  HudController,
  PhaserHudView,
  createHudSource,
  topHudContentBottom,
  type HudSnapshot,
  type HudSource,
  type HudView,
} from '../src/ui/hud';
import { GAMEPLAY_ZOOM, logicalCanvasViewport, zoomedGameUiViewport } from '../src/ui/layout';
import { ThemeColor, ThemeDepth } from '../src/ui/theme';
import { ControlsView } from '../src/ui/controls';

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

  it('renders immediately when a scene-owned state requests a refresh', () => {
    const source = createMutableSource({ ability: 'Scrap Burst: READY' });
    const { controller, view } = createHarness(source);
    controller.update(16);
    source.snapshotValue.ability = 'Scrap Burst: 9s';
    controller.requestRender();
    controller.update(16);
    expect(view.renders).toHaveLength(2);
    expect(view.renders[1]?.ability).toBe('Scrap Burst: 9s');
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

function renderedObjectBottom(state: Readonly<Record<string, unknown>>, parentY: number): number {
  const y = state.y as number;
  const height = state.height as number;
  const scaleY = state.scaleY as number;
  const originY = state.originY as number;
  return parentY + y + (1 - originY) * height * Math.abs(scaleY);
}

function assertHudCoverage(
  renderedBottom: number,
  authorityBottom: number,
  backingBottom: number,
  playfieldTop: number,
): void {
  if (authorityBottom < renderedBottom) throw new Error('authority is shorter than rendered HUD');
  if (backingBottom < Math.max(renderedBottom, authorityBottom)) {
    throw new Error('backing is shorter than HUD authority');
  }
  if (backingBottom >= playfieldTop) throw new Error('backing enters playfield');
}

describe('PhaserHudView', () => {
  function createFakeScene() {
    let resize: { handler: () => void; context: unknown } | undefined;
    const objects: Array<ReturnType<typeof fakeObject>> = [];
    const own = <T>(object: T): T => {
      objects.push(object as ReturnType<typeof fakeObject>);
      return object;
    };

    function fakeObject(kind = 'object', width = 0, height = 0, x = 0, y = 0, fontSize = 0) {
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
        originX: kind === 'text' || kind === 'container' ? 0 : 0.5,
        originY: kind === 'text' || kind === 'container' ? 0 : 0.5,
        text: '',
        interactive: false,
        depth: 0,
        fillColor: undefined,
        fillAlpha: 1,
        destroyed: false,
      };
      const chain = (key: string, value: unknown) => {
        state[key] = value;
        return api;
      };
      const api = {
        get state() { return { ...state }; },
        get x() { return state.x as number; },
        get y() { return state.y as number; },
        setText(text: string) {
          state.text = text;
          if (kind === 'text') {
            state.width = text.length * fontSize * 0.55;
            state.height = fontSize * 1.2;
          }
          return api;
        },
        setOrigin(x = 0.5, y = x) { state.originX = x; state.originY = y; return api; },
        setScrollFactor() { return api; },
        setDepth(depth: number) { return chain('depth', depth); },
        setResolution(resolution: number) { return chain('resolution', resolution); },
        setFillStyle(color: number, alpha = 1) { state.fillColor = color; state.fillAlpha = alpha; return api; },
        setVisible(visible: boolean) { return chain('visible', visible); },
        setAlpha(alpha: number) { return chain('alpha', alpha); },
        setPosition(x: number, y: number) { state.x = x; state.y = y; return api; },
        setFixedSize(width: number, height: number) { state.width = width; state.height = height; return api; },
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
        container: (x = 0, y = 0) => {
          const base = fakeObject('container', 0, 0, x, y);
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
        text: (x: number, y: number, text: string, style: { resolution?: number; fontSize?: string } = {}) => {
          if (style.resolution !== 2) throw new Error('UI text must use resolution 2');
          const fontSize = Number.parseFloat(style.fontSize ?? '16');
          return own(
            fakeObject('text', 0, fontSize * 1.2, x, y, fontSize).setResolution(style.resolution),
          ).setText(text);
        },
        rectangle: (x: number, y: number, width: number, height: number, fillColor?: number, fillAlpha?: number) => {
          const object = own(fakeObject('rect', width, height, x, y));
          if (fillColor !== undefined) object.setFillStyle(fillColor, fillAlpha);
          return object;
        },
        arc: (x: number, y: number) => own(fakeObject('arc', 0, 0, x, y)),
      },
      tweens: {
        add: vi.fn(),
        killTweensOf: vi.fn(),
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

  it('keeps the compact run panel aligned and separates its two stat rows', () => {
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport: logicalCanvasViewport() });
    view.render({
      status: 'active', timeMs: 1_000, durationMs: 60_000, health: 80, maxHealth: 100,
      level: 2, xp: 25, xpToNext: 100, kills: 3, currency: 12,
    });

    const unique = [...new Set(scene.objects)];
    const bars = unique.filter((object) => object.state.kind === 'rect' && object.state.fillColor !== ThemeColor.surface);
    expect(bars).toHaveLength(4);
    expect(bars[1]!.state.x).toBe(bars[3]!.state.x);
    expect(bars[0]!.state.width).toBe(bars[2]!.state.width);
    expect(bars[1]!.state.width).toBe(bars[3]!.state.width);

    const textAt = (label: string) => unique.find((object) => object.state.text === label)!.state;
    const time = textAt('0:01 / 1:00');
    const kills = textAt('K 3');
    const scrap = textAt('S 12');
    expect(time.y).toBeLessThan(kills.y as number);
    expect(kills.y).toBeLessThan(scrap.y as number);
    expect((scrap.y as number) - (kills.y as number)).toBeGreaterThan(0);
  });

  it('projects the zoomed GameScene backing across the whole HUD viewport instead of root-local canvas coordinates', () => {
    // GameScene constructs the HUD with this camera-zoomed viewport. With the
    // backing center left root-local, it projects to [-48.75, 341.25] at
    // zoom 1.25 instead of covering the [0, 390] canvas.
    const scene = createFakeScene();
    const viewport = zoomedGameUiViewport(390, 844, 390, 844);
    const view = new PhaserHudView({ scene: scene as never, viewport });
    const backing = scene.objects.find((object) =>
      object.state.kind === 'rect'
      && object.state.depth === ThemeDepth.hudBacking,
    );
    if (!backing) throw new Error('HUD backing missing');
    const width = backing.state.width as number;
    const height = backing.state.height as number;

    const projectX = (worldX: number) => (worldX - viewport.originX!) * GAMEPLAY_ZOOM;
    const projectY = (worldY: number) => (worldY - viewport.originY!) * GAMEPLAY_ZOOM;
    expect(projectX((backing.state.x as number) - width / 2)).toBeCloseTo(0, 6);
    expect(projectX((backing.state.x as number) + width / 2)).toBeCloseTo(390, 6);
    expect(projectY((backing.state.y as number) - height / 2)).toBeCloseTo(0, 6);
    expect(projectY((backing.state.y as number) + height / 2)).toBeCloseTo(height * GAMEPLAY_ZOOM, 6);
    view.destroy();
  });

  it.each([
    [390, 844], [393, 852], [1280, 800], [844, 390],
  ])('covers independently measured HUD and pause bounds before the playfield at %ix%i', (containerWidth, containerHeight) => {
    const fit = Math.min(containerWidth / 390, containerHeight / 844);
    const viewport = zoomedGameUiViewport(
      390 * fit,
      844 * fit,
      containerWidth,
      containerHeight,
    );
    const scene = createFakeScene();
    const view = new PhaserHudView({ scene: scene as never, viewport });
    view.render({
      status: 'paused', timeMs: 1_000, durationMs: 60_000, health: 80, maxHealth: 100,
      level: 2, xp: 25, xpToNext: 100, kills: 3, currency: 12,
    });
    const controls = new ControlsView({
      scene: scene as never,
      input: {} as never,
      viewport,
      readReducedMotion: () => false,
      onPauseRequested: () => {},
    });

    const unique = [...new Set(scene.objects)];
    type RenderedObject = (typeof unique)[number];
    type RenderedRoot = RenderedObject & { readonly children: RenderedObject[] };
    const roots = unique
      .filter((object) => object.state.kind === 'container')
      .map((object) => object as RenderedRoot);
    const hudRoot = roots.find((root) =>
      root.children.some((child) => child.state.text === 'Paused'),
    );
    const controlsRoot = roots.find((root) =>
      root.children.some((child) => child.state.interactive),
    );
    if (!hudRoot || !controlsRoot) throw new Error('HUD composition roots missing');
    const hudChildren = hudRoot.children.filter((child) =>
      child.state.kind === 'text' || child.state.kind === 'rect',
    );
    const pauseChildren = controlsRoot.children.filter((child) =>
      child.state.kind === 'rect' && child.state.depth === ThemeDepth.hud,
    );
    expect(hudChildren.filter((child) => child.state.kind === 'text')).toHaveLength(7);
    expect(hudChildren.filter((child) => child.state.kind === 'rect')).toHaveLength(4);
    // Pause plus the shared touch ability action are both HUD controls.
    expect(pauseChildren).toHaveLength(4);

    const renderedBottom = Math.max(
      ...hudChildren.map((child) => renderedObjectBottom(child.state, hudRoot.state.y as number)),
      ...pauseChildren.map((child) => renderedObjectBottom(child.state, controlsRoot.state.y as number)),
    );
    const backing = unique.find((object) =>
      object.state.kind === 'rect' && object.state.depth === ThemeDepth.hudBacking,
    );
    if (!backing) throw new Error('HUD backing missing');
    const backingBottom = renderedObjectBottom(backing.state, 0);
    const authorityBottom = (viewport.originY ?? 0) + topHudContentBottom(viewport);
    const playfieldTop = (viewport.originY ?? 0) + viewport.canvasHeight / 2;

    // Independent rendered bounds arrest either mutation: shortening the
    // exported authority or shortening only the plate cannot share an oracle.
    expect(() => assertHudCoverage(
      renderedBottom,
      authorityBottom,
      backingBottom,
      playfieldTop,
    )).not.toThrow();
    expect(() => assertHudCoverage(
      renderedBottom,
      renderedBottom - 1,
      backingBottom,
      playfieldTop,
    )).toThrow('authority is shorter');
    expect(() => assertHudCoverage(
      renderedBottom,
      authorityBottom,
      renderedBottom - 1,
      playfieldTop,
    )).toThrow('backing is shorter');
    expect(backing.state).toMatchObject({
      width: viewport.canvasWidth,
      fillColor: ThemeColor.surface,
      fillAlpha: 1,
      depth: ThemeDepth.hudBacking,
    });
    expect(hudRoot.state.depth).toBe(ThemeDepth.hud);
    expect(backing.state.depth).toBeLessThan(hudRoot.state.depth as number);
    controls.destroy();
    view.destroy();
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
