import { describe, expect, it, vi } from 'vitest';
import {
  createGameSoakHarness,
  ZERO_LISTENER_DIAGNOSTICS,
} from './helpers/epic19SoakHarness';
import { createSharedFakeSceneForConformance } from './helpers/epic19JourneyComposition';
import { bindVisualViewportRefresh, isGestureActive } from '../src/platform/visualViewport';
import { InputController } from '../src/systems/input';
import { ControlsView } from '../src/ui/controls';
import { PhaserHudView } from '../src/ui/hud';
import { DebugOverlay } from '../src/systems/debug';
import { arenaFollowEnabled, zoomedVisibleSize } from '../src/scenes/GameScene';
import { GAMEPLAY_ZOOM, pointerToRootLocal, zoomedGameUiViewport } from '../src/ui/layout';
import { ThemeColor, ThemeDepth } from '../src/ui/theme';

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
    text?: string;
    fillColor?: number;
    interactive: boolean;
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
    const tap = (object: FakeSceneObject): boolean => {
      if (object.state.destroyed) return false;
      // Compose the browser coordinate through the same camera transform used
      // by production root children, then map it back to root-local through
      // the PRODUCTION pointerToRootLocal transform (U7) and hit-test the
      // live child before emitting the pointer funnel events.
      const pointer = {
        x: (object.state.x + 39 - 195) * GAMEPLAY_ZOOM + 195,
        y: (object.state.y + 84.4 - 422) * GAMEPLAY_ZOOM + 422,
      };
      const local = pointerToRootLocal(pointer, { originX: 39, originY: 84.4 });
      expect(Math.abs(local.x - object.state.x)).toBeLessThan(0.001);
      expect(Math.abs(local.y - object.state.y)).toBeLessThan(0.001);
      const hit = fakeSceneObjects(h).find((candidate) =>
        !candidate.state.destroyed
        && candidate.state.interactive
        && candidate.state.handlers['pointerover']
        && Math.abs(local.x - candidate.state.x) <= candidate.state.width / 2
        && Math.abs(local.y - candidate.state.y) <= candidate.state.height / 2,
      );
      expect(hit).toBe(object);
      if (!hit) throw new Error('pointer hit-test missed live target');
      hit.state.handlers['pointerdown']?.({ id: 9 });
      hit.state.handlers['pointerup']?.({ id: 9 });
      return true;
    };
    const targets = () =>
      fakeSceneObjects(h).filter(
        (object) => object.state.kind === 'rect' && object.state.handlers['pointerover'] && !object.state.destroyed,
      );

    const initialTargets = targets();
    initialTargets[0]!.state.handlers['pointerup']?.({ id: 7 });
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toEqual([]);
    initialTargets[0]!.state.handlers['pointerover']?.();
    initialTargets[0]!.state.handlers['pointerdown']?.({ id: 7 });
    initialTargets[0]!.state.handlers['pointerup']?.({ id: 8 });
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toEqual([]);
    initialTargets[0]!.state.handlers['pointerdown']?.({ id: 7 });
    initialTargets[1]!.state.handlers['pointerup']?.({ id: 7 });
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toEqual([]);
    initialTargets[0]!.state.handlers['pointerdown']?.({ id: 7 });
    initialTargets[0]!.state.handlers['pointerout']?.();
    initialTargets[0]!.state.handlers['pointerup']?.({ id: 7 });
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toEqual([]);

    tap(targets()[0]!); // select weapon a
    tap(targets()[1]!); // select weapon b (same def -> merge pair)
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toHaveLength(2);

    const preMergeTargets = targets();
    const merge = preMergeTargets[6]!;
    const back = preMergeTargets[7]!;
    // Rack modal targets use the same down/up funnel as cards: an unarmed,
    // mismatched, or cancelled gesture must not run a command.
    merge.state.handlers['pointerup']?.({ id: 10 });
    merge.state.handlers['pointerdown']?.({ id: 10 });
    merge.state.handlers['pointerup']?.({ id: 11 });
    merge.state.handlers['pointerdown']?.({ id: 10 });
    merge.state.handlers['pointerout']?.();
    merge.state.handlers['pointerup']?.({ id: 10 });
    back.state.handlers['pointerdown']?.({ id: 12 });
    back.state.handlers['pointerup']?.({ id: 13 });
    expect(h.pauseController.snapshot().panel).toBe('inventory');
    expect(merged).toBe(0);

    tap(merge); // Merge Selected
    expect(merged).toBe(1);
    // ui:confirm is only the existing cue — the domain event is the evidence.
    expect(confirms).toBe(1);
    expect(h.runState.equipped).toHaveLength(1);
    expect(h.runState.equipped[0]?.tier).toBe(2);
    expect(h.pauseController.snapshot().inventory.selectedInstanceIds).toEqual([]);

    // A stale/second tap on the destroyed Merge handle cannot refire: the
    // resolved tree was rebuilt and the old handle's handlers are cleared.
    expect(tap(preMergeTargets[6]!)).toBe(false);
    expect(tap(preMergeTargets[6]!)).toBe(false);
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

  it('refreshes after visibility changes so a safe-area-only transition is not stale', () => {
    const listeners = new Map<string, () => void>();
    const visualViewport = {
      addEventListener: vi.fn((event: string, fn: () => void) => { listeners.set(`vv:${event}`, fn); }),
      removeEventListener: vi.fn(),
    };
    const documentTarget = {
      addEventListener: vi.fn((event: string, fn: () => void) => { listeners.set(`document:${event}`, fn); }),
      removeEventListener: vi.fn(),
    };
    const frames: Array<() => void> = [];
    const prior = {
      vv: globalThis.visualViewport,
      document: globalThis.document,
      raf: globalThis.requestAnimationFrame,
      caf: globalThis.cancelAnimationFrame,
    };
    Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: visualViewport });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentTarget });
    globalThis.requestAnimationFrame = ((callback: () => void) => { frames.push(callback); return frames.length; }) as never;
    globalThis.cancelAnimationFrame = (() => {}) as never;
    try {
      const refresh = vi.fn();
      const dispose = bindVisualViewportRefresh({ scale: { refresh } } as never);
      expect(documentTarget.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      listeners.get('document:visibilitychange')!();
      expect(frames).toHaveLength(1);
      frames.shift()!();
      expect(refresh).toHaveBeenCalledTimes(1);
      dispose();
      expect(documentTarget.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    } finally {
      Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: prior.vv });
      Object.defineProperty(globalThis, 'document', { configurable: true, value: prior.document });
      globalThis.requestAnimationFrame = prior.raf;
      globalThis.cancelAnimationFrame = prior.caf;
    }
  });

  it('treats scenes without an inputController or a live pointer pair as gesture-inactive (P1)', () => {
    // undefined snapshot → inactive: the optional chain yields undefined and
    // the null guard must not read `undefined !== null` as an active gesture.
    expect(isGestureActive({})).toBe(false);
    expect(isGestureActive({ inputController: { getPresentationSnapshot: () => undefined } })).toBe(false);

    // snapshot with null pointers → inactive (either edge alone is inert).
    expect(isGestureActive({ inputController: { getPresentationSnapshot: () => ({ pointerStart: null, pointerCurrent: null }) } })).toBe(false);
    expect(isGestureActive({ inputController: { getPresentationSnapshot: () => ({ pointerStart: { x: 0, y: 0 }, pointerCurrent: null }) } })).toBe(false);
    expect(isGestureActive({ inputController: { getPresentationSnapshot: () => ({ pointerStart: null, pointerCurrent: { x: 0, y: 0 } }) } })).toBe(false);

    // snapshot with a live pointer pair → active.
    const active = { inputController: { getPresentationSnapshot: () => ({ pointerStart: { x: 10, y: 20 }, pointerCurrent: { x: 30, y: 40 } }) } };
    expect(isGestureActive(active)).toBe(true);

    // A scene WITHOUT inputController among others is not always-active: the
    // production gate is `.some(isGestureActive)` over live scenes, and the
    // always-active BootScene (no inputController) must never pin it true.
    expect([{}, {}].some(isGestureActive)).toBe(false);
    expect([{}, { inputController: { getPresentationSnapshot: () => ({ pointerStart: null, pointerCurrent: null }) } }].some(isGestureActive)).toBe(false);
    expect([{}, active].some(isGestureActive)).toBe(true);
    expect([active, {}].some(isGestureActive)).toBe(true);
  });

  it('defers a visualViewport refresh during a stick gesture and suppresses re-entrant scheduling', () => {
    const listeners = new Map<string, () => void>();
    const visualViewport = { addEventListener: (_event: string, fn: () => void) => listeners.set(_event, fn), removeEventListener: () => {} };
    const frames: Array<() => void> = [];
    const prior = { vv: globalThis.visualViewport, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
    let gestureActive = true;
    const refresh = vi.fn(() => listeners.get('resize')?.());
    Object.defineProperty(globalThis, 'visualViewport', { configurable: true, value: visualViewport });
    globalThis.requestAnimationFrame = ((callback: () => void) => { frames.push(callback); return frames.length; }) as never;
    globalThis.cancelAnimationFrame = (() => {}) as never;
    try {
      const dispose = bindVisualViewportRefresh({ scale: { refresh } } as never, () => gestureActive);
      listeners.get('resize')!();
      frames.shift()!();
      expect(refresh).not.toHaveBeenCalled();
      expect(frames).toHaveLength(1); // retry is deferred, not a scale refresh
      gestureActive = false;
      frames.shift()!();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(0); // re-entrant resize did not create a loop
      dispose();
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
  // This mirror documents Phaser's internal chain; the PRODUCTION transform
  // (layout.pointerToRootLocal) is cross-checked against it below (U7).
  function phaserCameraChainRootLocal(
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
      const local = phaserCameraChainRootLocal(pointer, camera, canvas, origin);
      expect(local.x).toBeCloseTo(pointer.x / GAMEPLAY_ZOOM, 6);
      expect(local.y).toBeCloseTo(pointer.y / GAMEPLAY_ZOOM, 6);
      // The PRODUCTION transform produces the identical root-local result.
      const produced = pointerToRootLocal(pointer, { originX: origin.x, originY: origin.y });
      expect(produced.x).toBeCloseTo(local.x, 6);
      expect(produced.y).toBeCloseTo(local.y, 6);
    }
    // Zero scroll produces the identical identity — scroll cancels for
    // scrollFactor-0 children.
    const scrolled = phaserCameraChainRootLocal(
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
    const edge = phaserCameraChainRootLocal(
      { x: (card.localX + card.halfWidth) * GAMEPLAY_ZOOM, y: (card.localY + card.halfHeight) * GAMEPLAY_ZOOM },
      camera,
      canvas,
      origin,
    );
    expect(Math.abs(edge.x - card.localX)).toBeLessThanOrEqual(card.halfWidth);
    // The production transform agrees at the exact edge.
    const producedEdge = pointerToRootLocal(
      { x: (card.localX + card.halfWidth) * GAMEPLAY_ZOOM, y: (card.localY + card.halfHeight) * GAMEPLAY_ZOOM },
      { originX: origin.x, originY: origin.y },
    );
    expect(producedEdge.x).toBeCloseTo(edge.x, 6);
    expect(producedEdge.y).toBeCloseTo(edge.y, 6);
    const outside = phaserCameraChainRootLocal(
      { x: (card.localX + card.halfWidth) * GAMEPLAY_ZOOM + 1, y: (card.localY + card.halfHeight) * GAMEPLAY_ZOOM },
      camera,
      canvas,
      origin,
    );
    expect(Math.abs(outside.x - card.localX)).toBeGreaterThan(card.halfWidth);
    // The production transform agrees 1px outside too — the miss is real.
    const producedOutside = pointerToRootLocal(
      { x: (card.localX + card.halfWidth) * GAMEPLAY_ZOOM + 1, y: (card.localY + card.halfHeight) * GAMEPLAY_ZOOM },
      { originX: origin.x, originY: origin.y },
    );
    expect(producedOutside.x).toBeCloseTo(outside.x, 6);
    expect(producedOutside.y).toBeCloseTo(outside.y, 6);
  });
});

describe('Epic 19 playtest fixes: intermediate arena camera follow (U6)', () => {
  // Phaser Camera#setBounds clamps the follow scroll to [0, arena − visible],
  // keeping the followed player inside the view — the same contract the
  // production wiring relies on after startFollow (M-07-style chain mirror).
  const clampedFollowScroll = (
    target: { readonly x: number; readonly y: number },
    arena: { readonly width: number; readonly height: number },
    visible: { readonly width: number; readonly height: number },
  ) => ({
    x: Math.min(Math.max(target.x - visible.width / 2, 0), Math.max(0, arena.width - visible.width)),
    y: Math.min(Math.max(target.y - visible.height / 2, 0), Math.max(0, arena.height - visible.height)),
  });

  it('follows the player within bounds on an arena between 312×675.2 and 390×844 (camera trace)', () => {
    const visible = zoomedVisibleSize(390, 844, GAMEPLAY_ZOOM);
    expect(visible.width).toBeCloseTo(312, 6);
    expect(visible.height).toBeCloseTo(675.2, 6);

    // The intermediate playtest-size arena exceeds the visible area but fits
    // inside the full canvas: follow is REQUIRED so the player cannot walk
    // off-screen (U6).
    const arena = { width: 360, height: 760 };
    expect(arenaFollowEnabled(arena.width, arena.height, visible.width, visible.height)).toBe(true);
    // Threshold controls: a fully-visible arena is static, the full canvas
    // and larger arenas follow.
    expect(arenaFollowEnabled(312, 675.2, visible.width, visible.height)).toBe(false);
    expect(arenaFollowEnabled(390, 844, visible.width, visible.height)).toBe(true);
    expect(arenaFollowEnabled(1200, 900, visible.width, visible.height)).toBe(true);

    // Camera trace: the player walks to the spawn center and every arena
    // corner; the clamped scroll keeps the player inside the view at every
    // step and never leaves the arena bounds.
    const playerPositions = [
      { x: arena.width / 2, y: arena.height / 2 }, // spawn center
      { x: 0, y: 0 }, // top-left corner
      { x: arena.width, y: 0 }, // top-right corner
      { x: 0, y: arena.height }, // bottom-left corner
      { x: arena.width, y: arena.height }, // bottom-right corner
      { x: arena.width / 2, y: arena.height }, // bottom-center
    ];
    for (const position of playerPositions) {
      const scroll = clampedFollowScroll(position, arena, visible);
      // The camera never leaves the arena bounds.
      expect(scroll.x).toBeGreaterThanOrEqual(0);
      expect(scroll.y).toBeGreaterThanOrEqual(0);
      expect(scroll.x).toBeLessThanOrEqual(arena.width - visible.width);
      expect(scroll.y).toBeLessThanOrEqual(arena.height - visible.height);
      // The followed player stays within the visible view.
      expect(position.x).toBeGreaterThanOrEqual(scroll.x);
      expect(position.y).toBeGreaterThanOrEqual(scroll.y);
      expect(position.x).toBeLessThanOrEqual(scroll.x + visible.width);
      expect(position.y).toBeLessThanOrEqual(scroll.y + visible.height);
    }
    // The trace actually moves with the player: the spawn-center scroll is
    // the centered offset, not a pinned origin.
    const center = clampedFollowScroll(playerPositions[0]!, arena, visible);
    expect(center.x).toBeCloseTo((arena.width - visible.width) / 2, 6);
    expect(center.y).toBeCloseTo((arena.height - visible.height) / 2, 6);
    // At the corners the clamp pins to the arena edge (no negative scroll).
    const topLeft = clampedFollowScroll(playerPositions[1]!, arena, visible);
    expect(topLeft.x).toBe(0);
    expect(topLeft.y).toBe(0);
  });
});

describe('Epic 19 playtest fixes: F3 debug overlay on-screen (U5)', () => {
  it.each(REFERENCE_VIEWPORTS)('keeps the F3 debug overlay inside the canvas at $name', ({ width, height }) => {
    const { scene, camera } = createSharedFakeSceneForConformance();
    camera.setZoom(GAMEPLAY_ZOOM);
    const fit = fitScale(width, height);
    const scale = scene.scale;
    scale.displaySize.width = 390 * fit;
    scale.displaySize.height = 844 * fit;
    scale.parentSize.width = width;
    scale.parentSize.height = height;
    // update() reads the live FPS from scene.game.loop.
    (scene as unknown as { game?: unknown }).game = { loop: { actualFps: 60 } };

    const overlay = new DebugOverlay(scene as never);
    // F3 toggles the overlay on (the mock keyboard binds the handler context,
    // mirroring Phaser's KeyboardPlugin).
    scene.input.keyboard?.emit('keydown-F3');
    overlay.update([]);

    const text = scene.objects.find(
      (object) => object.state.kind === 'text' && !object.state.destroyed && object.state.scrollFactorX === 0,
    );
    expect(text).toBeDefined();
    // Sabotage: the legacy 10_000 depth escapes the documented root ladder.
    expect(text!.state.depth).toBe(ThemeDepth.debugOverlay);
    const bounds = text!.getBounds();
    // Rendered physical bounds: the scrollFactor-0 overlay is screen-anchored,
    // so world position × camera zoom × FIT gives the top-left, while
    // getBounds() width/height already include the recorded zoom AND the
    // overlay's own 1/1.25 scale (M-02) — they multiply by FIT only. The
    // overlay must stay inside the canvas at every reference viewport (the
    // zoomed logical canvas is the scale-invariant 312×675.2).
    const left = bounds.x * GAMEPLAY_ZOOM * fit;
    const top = bounds.y * GAMEPLAY_ZOOM * fit;
    const right = left + bounds.width * fit;
    const bottom = top + bounds.height * fit;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(390 * fit + 0.01);
    expect(bottom).toBeLessThanOrEqual(844 * fit + 0.01);

    // Destroy removes the F3 listener and destroys the overlay text.
    overlay.destroy();
    expect(scene.input.keyboard?.listenerCount('keydown-F3')).toBe(0);
    expect(text!.state.destroyed).toBe(true);
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
    h.resizeTo(width, height);
    const hud = new PhaserHudView({
      scene: h.gameScene as never,
      viewport: zoomedGameUiViewport(
        h.gameScene.scale.displaySize.width,
        h.gameScene.scale.displaySize.height,
        h.gameScene.scale.parentSize.width,
        h.gameScene.scale.parentSize.height,
      ),
    });
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
    });

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
    expect((pauseLeft - healthRight) * fit * GAMEPLAY_ZOOM).toBeGreaterThanOrEqual(8 - 0.01);

    hud.destroy();
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });
});

describe('Epic 19 playtest fixes: zoomed GameScene HUD backing projection', () => {
  it('projects the HUD backing from the actual GameScene viewport origin to the full canvas bounds', () => {
    const h = createGameSoakHarness({ fixtureSeed: 19, runSeed: 19, storageKey: 'e19-backing-origin' });
    const viewport = zoomedGameUiViewport(
      h.gameScene.scale.displaySize.width,
      h.gameScene.scale.displaySize.height,
      h.gameScene.scale.parentSize.width,
      h.gameScene.scale.parentSize.height,
    );
    const before = new Set(fakeSceneObjects(h));
    const hud = new PhaserHudView({ scene: h.gameScene as never, viewport });
    const backing = fakeSceneObjects(h)
      .filter((object) => !before.has(object))
      .find((object) => object.state.kind === 'rect' && object.state.width === viewport.canvasWidth);
    if (!backing) throw new Error('zoomed HUD backing missing');

    const left = (backing.state.x - backing.state.width / 2 - viewport.originX!) * GAMEPLAY_ZOOM;
    const right = (backing.state.x + backing.state.width / 2 - viewport.originX!) * GAMEPLAY_ZOOM;
    const top = (backing.state.y - backing.state.height / 2 - viewport.originY!) * GAMEPLAY_ZOOM;
    expect(left).toBeCloseTo(0, 6);
    expect(right).toBeCloseTo(390, 6);
    expect(top).toBeCloseTo(0, 6);
    hud.destroy();
    h.destroy();
    expect(h.listeners()).toEqual(ZERO_LISTENER_DIAGNOSTICS);
  });
});

describe('Epic 19 playtest fixes: four-viewport HUD soak', () => {
  it.each(REFERENCE_VIEWPORTS)('keeps both bars and the three-line stats stack safe in both directions at $name', ({ width, height }) => {
    const h = createGameSoakHarness({ fixtureSeed: width + height, runSeed: width, storageKey: `e19-hud-${width}` });
    const hud = new PhaserHudView({
      scene: h.gameScene as never,
      viewport: zoomedGameUiViewport(
        h.gameScene.scale.displaySize.width,
        h.gameScene.scale.displaySize.height,
        h.gameScene.scale.parentSize.width,
        h.gameScene.scale.parentSize.height,
      ),
    });
    const snapshot = {
      status: 'active' as const,
      timeMs: 1_000,
      durationMs: 60_000,
      health: 100,
      maxHealth: 100,
      level: 2,
      xp: 25,
      xpToNext: 100,
      kills: 3,
      currency: 12,
    };
    const check = (targetWidth: number, targetHeight: number): void => {
      h.resizeTo(targetWidth, targetHeight);
      hud.render(snapshot);
      const live = fakeSceneObjects(h).filter((object) => !object.state.destroyed);
      const barColors = new Set([0x334155, ThemeColor.danger, ThemeColor.primary]);
      const bars = live
        // The top HUD backing is also a passive rectangle. Identify bars by
        // their documented semantic colors, never by creation order/width.
        .filter((object) => object.state.kind === 'rect'
          && !object.state.interactive
          && barColors.has(object.state.fillColor ?? -1))
        .sort((a, b) => a.state.y - b.state.y);
      expect(bars).toHaveLength(4);
      const [healthBg, healthFill, xpBg, xpFill] = bars;
      expect(healthBg).toBeDefined();
      expect(healthFill).toBeDefined();
      expect(xpBg).toBeDefined();
      expect(xpFill).toBeDefined();
      expect(healthBg!.state.x - healthBg!.state.width / 2).toBeCloseTo(healthFill!.state.x, 6);
      expect(healthBg!.state.x + healthBg!.state.width / 2)
        .toBeCloseTo(healthFill!.state.x + healthFill!.state.width, 6);
      expect(xpBg!.state.x - xpBg!.state.width / 2).toBeCloseTo(xpFill!.state.x, 6);
      expect(xpBg!.state.x + xpBg!.state.width / 2)
        .toBeCloseTo(xpFill!.state.x + xpFill!.state.width, 6);
      expect(healthBg!.state.x - healthBg!.state.width / 2)
        .toBeCloseTo(xpBg!.state.x - xpBg!.state.width / 2, 6);
      expect(healthBg!.state.width).toBeCloseTo(xpBg!.state.width, 6);

      const text = (value: string) => live.find((object) => object.state.text === value)!.state;
      const time = text('0:01 / 1:00');
      const kills = text('Kills 3');
      const scrap = text('Scrap 12');
      expect(time.y).toBeLessThan(kills.y);
      expect(kills.y).toBeLessThan(scrap.y);
      expect((kills.y - xpBg!.state.y - xpBg!.state.height / 2) * fitScale(targetWidth, targetHeight) * GAMEPLAY_ZOOM)
        .toBeGreaterThanOrEqual(8 - 0.01);
      if (targetWidth === 844 && targetHeight === 390) {
        const hint = live.find((object) => object.state.text === 'Drag to move • Tap pause')!;
        expect((hint.state.y - scrap.y) * fitScale(targetWidth, targetHeight) * GAMEPLAY_ZOOM)
          .toBeGreaterThanOrEqual(76.2 - 0.01);
      }
    };

    const listeners = h.listeners().scaleResize;
    check(width, height);
    check(390, 844);
    expect(h.listeners().scaleResize).toBe(listeners);
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
