import { describe, expect, it, vi } from 'vitest';
import {
  createGameSoakHarness,
  ZERO_LISTENER_DIAGNOSTICS,
} from './helpers/epic19SoakHarness';
import { createSharedFakeSceneForConformance } from './helpers/epic19JourneyComposition';
import { bindVisualViewportRefresh } from '../src/platform/visualViewport';
import { InputController } from '../src/systems/input';
import { ControlsView } from '../src/ui/controls';
import { PhaserHudView } from '../src/ui/hud';
import { logicalCanvasViewport, zoomedGameUiViewport, GAMEPLAY_ZOOM } from '../src/ui/layout';

const REFERENCE_VIEWPORTS = [
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'landscape container', width: 844, height: 390 },
  { name: 'iPad portrait', width: 1024, height: 1366 },
  { name: 'desktop', width: 1280, height: 720 },
] as const;

const fitScale = (width: number, height: number) => Math.min(width / 390, height / 844);

interface FakeSceneObject {
  state: {
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
    destroyed: boolean;
    handlers: Record<string, (...args: unknown[]) => void>;
  };
}

/** The soak harness exposes the composed fake scene through gameScene. */
function fakeSceneObjects(h: { gameScene: object }): FakeSceneObject[] {
  return (h.gameScene as unknown as { objects: FakeSceneObject[] }).objects;
}

describe('Epic 19 playtest fixes: production-composition pointer merge', () => {
  it('pointer-tap slot A, slot B, Merge -> exactly one weapon:merged from the pointer path', () => {
    const h = createGameSoakHarness({ fixtureSeed: 3, runSeed: 77, storageKey: 'e19-ptr-merge' });
    h.openRackWithMergePair();
    expect(h.pauseController.snapshot().panel).toBe('inventory');

    let merged = 0;
    let confirms = 0;
    h.bus.on('weapon:merged', () => { merged += 1; });
    h.bus.on('ui:confirm', () => { confirms += 1; });

    // The rack's pointer funnel: down arms the pointer id inside the target,
    // up with the SAME pointer identity commits (registerTarget/
    // registerModalTarget in weaponRackView.ts). Creation order after each
    // render is slots 0-5, Merge (6), Back (7).
    const tap = (object: { state: { handlers: Record<string, (...args: unknown[]) => void> } }) => {
      object.state.handlers['pointerdown']?.({ id: 9 });
      object.state.handlers['pointerup']?.({ id: 9 });
    };
    const targets = () =>
      fakeSceneObjects(h).filter(
        (object) => object.state.kind === 'rect' && object.state.handlers['pointerover'] && !object.state.destroyed,
      );

    tap(targets()[0]!); // select weapon a
    tap(targets()[1]!); // select weapon b (same def -> merge pair)
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toHaveLength(2);

    const preMergeTargets = targets();
    tap(preMergeTargets[6]!); // Merge Selected
    expect(merged).toBe(1);
    // ui:confirm is only the existing cue — the domain event is the evidence.
    expect(confirms).toBe(1);
    expect(h.runState.equipped).toHaveLength(1);
    expect(h.runState.equipped[0]?.tier).toBe(2);
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toEqual([]);

    // A stale/second tap on the destroyed Merge handle cannot refire: the
    // resolved tree was rebuilt and the old handle's handlers are cleared.
    tap(preMergeTargets[6]!);
    tap(preMergeTargets[6]!);
    expect(merged).toBe(1);
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });
});

describe('Epic 19 playtest fixes: viewport lifecycle and transform', () => {
  it('coalesces visualViewport resize+scroll into one refresh per frame and disposes exactly its listeners', () => {
    const listeners = new Map<string, () => void>();
    const visualViewport = {
      addEventListener: vi.fn((event: string, fn: () => void) => { listeners.set(event, fn); }),
      removeEventListener: vi.fn((event: string, fn: () => void) => {
        if (listeners.get(event) === fn) listeners.delete(event);
      }),
    };
    const frames: Array<() => void> = [];
    const raf = vi.fn((callback: () => void) => { frames.push(callback); return frames.length; });
    const caf = vi.fn();
    const refresh = vi.fn();
    const prior = {
      vv: globalThis.visualViewport,
      raf: globalThis.requestAnimationFrame,
      caf: globalThis.cancelAnimationFrame,
    };
    Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: visualViewport });
    globalThis.requestAnimationFrame = raf as never;
    globalThis.cancelAnimationFrame = caf as never;
    try {
      const dispose = bindVisualViewportRefresh({ scale: { refresh } } as never);
      expect(visualViewport.addEventListener).toHaveBeenCalledTimes(2);

      // A resize AND a scroll before the frame coalesce to ONE refresh.
      listeners.get('resize')!();
      listeners.get('scroll')!();
      expect(raf).toHaveBeenCalledTimes(1);
      frames[0]!();
      expect(refresh).toHaveBeenCalledTimes(1);

      // A second burst schedules and fires exactly once more.
      listeners.get('scroll')!();
      listeners.get('scroll')!();
      expect(raf).toHaveBeenCalledTimes(2);
      frames[1]!();
      expect(refresh).toHaveBeenCalledTimes(2);

      // Disposal removes both listeners and cancels a pending frame. The
      // second dispose re-runs the idempotent removals (the production
      // disposer has no guard) but adds no further side effects: no new
      // cancel and no listeners left.
      listeners.get('resize')!();
      dispose();
      expect(visualViewport.removeEventListener).toHaveBeenCalledTimes(2);
      expect(caf).toHaveBeenCalledTimes(1);
      dispose();
      expect(caf).toHaveBeenCalledTimes(1);
      expect(listeners.size).toBe(0);
    } finally {
      Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: prior.vv });
      globalThis.requestAnimationFrame = prior.raf;
      globalThis.cancelAnimationFrame = prior.caf;
    }
  });

  // Mirrors the installed Phaser 3.90 transform chain (BaseCamera.js
  // getWorldPoint + InputManager.js:899-935): the camera matrix is
  // M = T(half)·S(zoom)·T(−half), getWorldPoint pre-adds scroll·zoom, and
  // a scrollFactor-0 child subtracts the scroll again, so a root child's
  // local hit coordinate is pointer/zoom — independent of camera scroll.
  function pointerToRootLocal(
    pointer: { x: number; y: number },
    camera: { zoom: number; scrollX: number; scrollY: number },
    canvas: { width: number; height: number },
    origin: { x: number; y: number },
  ): { x: number; y: number } {
    const halfX = canvas.width / 2;
    const halfY = canvas.height / 2;
    const worldX = (pointer.x + camera.scrollX * camera.zoom - halfX) / camera.zoom + halfX;
    const worldY = (pointer.y + camera.scrollY * camera.zoom - halfY) / camera.zoom + halfY;
    return {
      x: worldX - camera.scrollX - origin.x,
      y: worldY - camera.scrollY - origin.y,
    };
  }

  it('keeps local = pointer/1.25 under nonzero camera scroll for root children (M-07)', () => {
    const canvas = { width: 390, height: 844 };
    const origin = { x: 39, y: 84.4 }; // C·(1−1/z), C = (195, 422)
    const camera = { zoom: GAMEPLAY_ZOOM, scrollX: 137, scrollY: 96 };
    for (const pointer of [
      { x: 100, y: 200 },
      { x: 250, y: 400 },
      { x: 390, y: 844 },
    ]) {
      const local = pointerToRootLocal(pointer, camera, canvas, origin);
      expect(local.x).toBeCloseTo(pointer.x / GAMEPLAY_ZOOM, 6);
      expect(local.y).toBeCloseTo(pointer.y / GAMEPLAY_ZOOM, 6);
    }
    // Zero scroll produces the identical identity — scroll cancels for
    // scrollFactor-0 children.
    const scrolled = pointerToRootLocal(
      { x: 100, y: 200 },
      { zoom: GAMEPLAY_ZOOM, scrollX: 0, scrollY: 0 },
      canvas,
      origin,
    );
    expect(scrolled.x).toBeCloseTo(100 / GAMEPLAY_ZOOM, 6);
    expect(scrolled.y).toBeCloseTo(200 / GAMEPLAY_ZOOM, 6);
  });

  it('applies FIT != 1, a nonzero canvas rect offset, and 1px-outside misses (M-07)', () => {
    // FIT != 1: the landscape container letterboxes the 390×844 canvas down.
    const fit = fitScale(844, 390);
    expect(fit).toBeCloseTo(0.4620853, 6);
    const display = { width: 390 * fit, height: 844 * fit };
    expect(display.width).not.toBe(390);
    expect(display.width).toBeCloseTo(180.213, 3);

    // Nonzero canvas rect offset: Phaser maps client coords to canvas coords
    // through canvasBounds before any camera transform (InputManager.js
    // pointer calculation: (clientX − bounds.left) × canvas.width/bounds.width).
    // Measured at the canonical FIT (bounds == canvas size) so the scale
    // factor is 1 and the offset is the only transform.
    const bounds = { left: 25, top: 40, width: 390, height: 844 };
    const toCanvas = (clientX: number, clientY: number) => ({
      x: (clientX - bounds.left) * (390 / bounds.width),
      y: (clientY - bounds.top) * (844 / bounds.height),
    });
    expect(toCanvas(125, 140)).toEqual({ x: 100, y: 100 });

    // 1px-outside: a 44-logical card centered at local (156, 337.6) is hit
    // exactly at its edge and missed one canvas px outside, through the same
    // transform the InputManager uses.
    const camera = { zoom: GAMEPLAY_ZOOM, scrollX: 0, scrollY: 0 };
    const canvas = { width: 390, height: 844 };
    const origin = { x: 39, y: 84.4 };
    const card = { localX: 156, localY: 337.6, halfWidth: 22, halfHeight: 22 };
    const edge = pointerToRootLocal(
      { x: (card.localX + card.halfWidth) * GAMEPLAY_ZOOM, y: (card.localY + card.halfHeight) * GAMEPLAY_ZOOM },
      camera,
      canvas,
      origin,
    );
    expect(Math.abs(edge.x - card.localX)).toBeLessThanOrEqual(card.halfWidth);
    const outside = pointerToRootLocal(
      { x: (card.localX + card.halfWidth) * GAMEPLAY_ZOOM + 1, y: (card.localY + card.halfHeight) * GAMEPLAY_ZOOM },
      camera,
      canvas,
      origin,
    );
    expect(Math.abs(outside.x - card.localX)).toBeGreaterThan(card.halfWidth);
  });
});

describe('Epic 19 playtest fixes: HUD strip absence', () => {
  it('repeated bottom taps and stick-zone drag-release never open inventory or change selection', () => {
    const h = createGameSoakHarness({ fixtureSeed: 5, runSeed: 88, storageKey: 'e19-strip-absent' });
    let uiEvents = 0;
    h.bus.on('ui:navigate', () => { uiEvents += 1; });
    h.bus.on('ui:confirm', () => { uiEvents += 1; });
    h.bus.on('ui:back', () => { uiEvents += 1; });
    let merged = 0;
    h.bus.on('weapon:merged', () => { merged += 1; });
    const selectionBefore = h.pauseController.snapshot().inventory.selectedInstanceIds;

    // Repeated taps across the old HUD rack-strip zone.
    for (const x of [40, 100, 200, 320]) {
      h.input.pointerDown(x, 820);
      h.poll();
      h.input.pointerUp();
      h.poll();
    }
    // Stick-zone drag and release (X3: the release must not reach any UI).
    h.input.pointerDown(120, 700);
    h.poll();
    h.input.pointerMove(240, 680);
    h.poll();
    h.input.pointerUp();
    h.poll();

    expect(h.pauseController.snapshot().panel).toBe('closed');
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toEqual(selectionBefore);
    expect(uiEvents).toBe(0);
    expect(merged).toBe(0);
    expect(h.runState.status).toBe('active');

    const baseline = h.listeners();
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
    expect(baseline.scaleResize).toBeGreaterThan(0);
  });
});

describe('Epic 19 playtest fixes: health/pause 8px physical gap', () => {
  it.each(REFERENCE_VIEWPORTS)('keeps an >=8px physical gap at $name', ({ width, height }) => {
    const h = createGameSoakHarness({ fixtureSeed: width, runSeed: height, storageKey: `e19-gap-${width}` });
    // The harness surfaces use the non-zoomed viewport, so the HUD must
    // share the same viewport space as the controls pause button.
    const hud = new PhaserHudView({ scene: h.gameScene as never, viewport: logicalCanvasViewport() });
    hud.render({
      status: 'active',
      timeMs: 0,
      durationMs: 1000,
      health: 100,
      maxHealth: 100,
      level: 1,
      xp: 0,
      xpToNext: 100,
      kills: 0,
      currency: 0,
      // Deprecated fields retained by the HudSnapshot type for old fixtures
      // (ignored by the HUD after the rack-strip removal).
      weapons: [],
      mergeReady: false,
    });

    h.resizeTo(width, height); // rebuilds the HUD and the controls at FIT s

    const fit = fitScale(width, height);
    const objects = fakeSceneObjects(h);
    const pauseButton = objects.find(
      (object) => object.state.kind === 'rect' && object.state.handlers['pointerdown'] && !object.state.destroyed,
    );
    expect(pauseButton).toBeDefined();
    const healthBar = objects
      .filter((object) => object.state.kind === 'rect' && !object.state.destroyed && object.state.width > 150)
      .sort((a, b) => a.state.y - b.state.y)[0];
    expect(healthBar).toBeDefined();

    const pauseLeft = pauseButton!.state.x - pauseButton!.state.width / 2;
    const healthRight = healthBar!.state.x + healthBar!.state.width / 2;
    // The HUD derives rightHudX = canvasWidth − margin − pauseSize − gap with
    // gap = physicalToLogical(8, viewport); the physical gap is exactly 8px.
    expect((pauseLeft - healthRight) * fit).toBeGreaterThanOrEqual(8 - 0.01);

    hud.destroy();
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });
});

describe('Epic 19 playtest fixes: zoomed stick rendered diameter (AM-3)', () => {
  it.each(REFERENCE_VIEWPORTS)(
    'renders a 128px physical diameter that tracks a synthetic pointer at $name',
    ({ width, height }) => {
      const { scene, input, camera } = createSharedFakeSceneForConformance();
      // The production GameScene always applies the gameplay zoom.
      camera.setZoom(GAMEPLAY_ZOOM);
      const fit = fitScale(width, height);
      const scale = scene.scale;
      scale.displaySize.width = 390 * fit;
      scale.displaySize.height = 844 * fit;
      scale.parentSize.width = width;
      scale.parentSize.height = height;

      const controller = new InputController(scene as never);
      const view = new ControlsView({
        scene: scene as never,
        input: controller,
        viewport: zoomedGameUiViewport(scale.displaySize.width, scale.displaySize.height),
        readReducedMotion: () => false,
        onPauseRequested: () => {},
      });

      const pointer = { x: 100, y: 200 };
      input.pointerDown(pointer.x, pointer.y);
      controller.update(16);
      view.update(16);

      const stickBase = scene.objects.find(
        (object) => object.state.kind === 'arc' && !object.state.destroyed,
      );
      expect(stickBase).toBeDefined();
      // Rendered diameter = 2·radius·scale·zoom·s — the arch AM-3 contract
      // says 128 physical px at the canonical scale (2·(64/1.25)·1.25·s).
      const renderedDiameter = 2 * stickBase!.state.radius * stickBase!.state.scaleX * camera.zoom * fit;
      expect(renderedDiameter).toBeCloseTo(128 * fit, 4);
      // The stick center renders under the synthetic pointer: root-local
      // coords map 1.25× to the canvas, so local = pointer/1.25.
      const renderedCenterX = stickBase!.state.x * camera.zoom * fit;
      const renderedCenterY = stickBase!.state.y * camera.zoom * fit;
      expect(renderedCenterX).toBeCloseTo(pointer.x * fit, 4);
      expect(renderedCenterY).toBeCloseTo(pointer.y * fit, 4);

      view.destroy();
      controller.destroy();
    },
  );
});
