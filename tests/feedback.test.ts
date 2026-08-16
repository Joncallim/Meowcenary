import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import type { Settings } from '../src/systems/save';
import {
  FeedbackSystem,
  PhaserFeedbackRenderer,
  type FeedbackRenderer,
} from '../src/systems/feedback';

function createFakeRenderer(): FeedbackRenderer & {
  muzzleFlashCalls: Array<{ x: number; y: number; family: string }>;
  projectileHitCalls: Array<{ x: number; y: number; family: string; heavyMotion: boolean }>;
  enemyKilledCalls: Array<{ x: number; y: number; heavyMotion: boolean }>;
  playerDamagedCalls: boolean[];
  levelUpCalls: boolean[];
  cancelHeavyMotionCalls: number;
  updateCalls: number[];
  destroyed: boolean;
} {
  return {
    muzzleFlashCalls: [],
    projectileHitCalls: [],
    enemyKilledCalls: [],
    playerDamagedCalls: [],
    levelUpCalls: [],
    cancelHeavyMotionCalls: 0,
    updateCalls: [],
    destroyed: false,
    activeEffectCount: 0,
    allocatedEffectCount: 0,
    droppedEffectCount: 0,
    muzzleFlash(x: number, y: number, family: string) {
      this.muzzleFlashCalls.push({ x, y, family });
    },
    projectileHit(x: number, y: number, family: string, heavyMotion: boolean) {
      this.projectileHitCalls.push({ x, y, family, heavyMotion });
    },
    enemyKilled(x: number, y: number, heavyMotion: boolean) {
      this.enemyKilledCalls.push({ x, y, heavyMotion });
    },
    playerDamaged(heavyMotion: boolean) {
      this.playerDamagedCalls.push(heavyMotion);
    },
    levelUp(heavyMotion: boolean) {
      this.levelUpCalls.push(heavyMotion);
    },
    cancelHeavyMotion() {
      this.cancelHeavyMotionCalls += 1;
    },
    update(dtMs: number) {
      this.updateCalls.push(dtMs);
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function createSystem(reducedMotion = false): { bus: EventBus; renderer: ReturnType<typeof createFakeRenderer>; system: FeedbackSystem } {
  const bus = createEventBus();
  const settings: Settings = {
    muted: false,
    musicVolume: 0.5,
    sfxVolume: 0.5,
    reducedMotion,
  };
  const renderer = createFakeRenderer();
  const system = new FeedbackSystem({ bus, settings, renderer });
  return { bus, renderer, system };
}

describe('FeedbackSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing on construction', () => {
    const { renderer } = createSystem();
    expect(renderer.projectileHitCalls).toHaveLength(0);
    expect(renderer.enemyKilledCalls).toHaveLength(0);
    expect(renderer.playerDamagedCalls).toHaveLength(0);
    expect(renderer.levelUpCalls).toHaveLength(0);
  });

  it('routes projectile:hit to the renderer with exact coordinates', () => {
    const { bus, renderer } = createSystem();
    bus.emit('projectile:hit', { weaponId: 'w', family: 'pistol', tier: 1, x: 12, y: 34, damage: 5, killed: false });

    expect(renderer.projectileHitCalls).toEqual([{ x: 12, y: 34, family: 'pistol', heavyMotion: true }]);
    expect(renderer.enemyKilledCalls).toHaveLength(0);
    expect(renderer.playerDamagedCalls).toHaveLength(0);
    expect(renderer.levelUpCalls).toHaveLength(0);
  });

  it('routes enemy:killed to the renderer with exact coordinates', () => {
    const { bus, renderer } = createSystem();
    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 1,
      x: 56,
      y: 78,
    });

    expect(renderer.enemyKilledCalls).toEqual([{ x: 56, y: 78, heavyMotion: true }]);
  });

  it('routes player:damaged to the renderer', () => {
    const { bus, renderer } = createSystem();
    bus.emit('player:damaged', { amount: 10, healthRemaining: 90 });

    expect(renderer.playerDamagedCalls).toEqual([true]);
  });

  it('routes level:up to the renderer', () => {
    const { bus, renderer } = createSystem();
    bus.emit('level:up', { level: 2 });

    expect(renderer.levelUpCalls).toEqual([true]);
  });

  it('passes heavyMotion=true when reduced motion is off', () => {
    const { bus, renderer } = createSystem(false);
    bus.emit('projectile:hit', { weaponId: 'w', family: 'pistol', tier: 1, x: 0, y: 0, damage: 1, killed: false });
    bus.emit('player:damaged', { amount: 1, healthRemaining: 99 });

    expect(renderer.projectileHitCalls[0].heavyMotion).toBe(true);
    expect(renderer.playerDamagedCalls[0]).toBe(true);
  });

  it('passes heavyMotion=false when reduced motion is on', () => {
    const { bus, renderer } = createSystem(true);
    bus.emit('projectile:hit', { weaponId: 'w', family: 'pistol', tier: 1, x: 0, y: 0, damage: 1, killed: false });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'a', xpValue: 1, scrapValue: 1, x: 0, y: 0 });
    bus.emit('player:damaged', { amount: 1, healthRemaining: 99 });
    bus.emit('level:up', { level: 2 });

    expect(renderer.projectileHitCalls[0].heavyMotion).toBe(false);
    expect(renderer.enemyKilledCalls[0].heavyMotion).toBe(false);
    expect(renderer.playerDamagedCalls[0]).toBe(false);
    expect(renderer.levelUpCalls[0]).toBe(false);
  });

  it('updates reduced motion live from settings:changed and cancels heavy motion when enabling it', () => {
    const { bus, renderer } = createSystem(false);
    bus.emit('settings:changed', {
      settings: { muted: false, musicVolume: 0.5, sfxVolume: 0.5, reducedMotion: true },
    });

    expect(renderer.cancelHeavyMotionCalls).toBe(1);

    bus.emit('projectile:hit', { weaponId: 'w', family: 'pistol', tier: 1, x: 0, y: 0, damage: 1, killed: false });
    expect(renderer.projectileHitCalls[0].heavyMotion).toBe(false);
  });

  it('does not cancel heavy motion when settings:changed keeps reduced motion off', () => {
    const { bus, renderer } = createSystem(false);
    bus.emit('settings:changed', {
      settings: { muted: true, musicVolume: 0.5, sfxVolume: 0.5, reducedMotion: false },
    });

    expect(renderer.cancelHeavyMotionCalls).toBe(0);
  });

  it('does not cancel heavy motion when reduced motion was already on', () => {
    const { bus, renderer } = createSystem(true);
    bus.emit('settings:changed', {
      settings: { muted: false, musicVolume: 0.5, sfxVolume: 0.5, reducedMotion: true },
    });

    expect(renderer.cancelHeavyMotionCalls).toBe(0);
  });

  it('delegates update to the renderer with the exact dt', () => {
    const { system, renderer } = createSystem();
    system.update(16.67);

    expect(renderer.updateCalls).toEqual([16.67]);
  });

  it('passes invalid dt through to the renderer without throwing', () => {
    const { system, renderer } = createSystem();
    expect(() => system.update(Number.NaN)).not.toThrow();
    expect(() => system.update(-5)).not.toThrow();

    expect(renderer.updateCalls).toEqual([Number.NaN, -5]);
  });

  it('unsubscribes its listeners and destroys the renderer once on destroy', () => {
    const { bus, renderer, system } = createSystem();

    system.destroy();
    system.destroy();

    bus.emit('projectile:hit', { weaponId: 'w', family: 'pistol', tier: 1, x: 0, y: 0, damage: 1, killed: false });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'a', xpValue: 1, scrapValue: 1, x: 0, y: 0 });
    bus.emit('player:damaged', { amount: 1, healthRemaining: 99 });
    bus.emit('level:up', { level: 2 });
    expect(renderer.projectileHitCalls).toHaveLength(0);
    expect(renderer.enemyKilledCalls).toHaveLength(0);
    expect(renderer.playerDamagedCalls).toHaveLength(0);
    expect(renderer.levelUpCalls).toHaveLength(0);
    expect(renderer.destroyed).toBe(true);
  });

  it('does not emit gameplay events from its listeners', () => {
    const { bus, renderer } = createSystem();
    const emitSpy = vi.spyOn(bus, 'emit');

    // Trigger feedback with the same events it listens to; it must not re-emit them.
    bus.emit('projectile:hit', { weaponId: 'w', family: 'pistol', tier: 1, x: 0, y: 0, damage: 1, killed: false });
    bus.emit('enemy:killed', { instanceId: 1, enemyId: 'a', xpValue: 1, scrapValue: 1, x: 0, y: 0 });
    bus.emit('player:damaged', { amount: 1, healthRemaining: 99 });
    bus.emit('level:up', { level: 2 });

    expect(renderer.projectileHitCalls).toHaveLength(1);
    expect(emitSpy).toHaveBeenCalledTimes(4);
  });
});

describe('PhaserFeedbackRenderer lifecycle', () => {
  it('destroys owned nodes after Phaser has already cleared the main camera', () => {
    class Node {
      destroyed = false;
      setDepth(): this { return this; }
      setActive(): this { return this; }
      setVisible(): this { return this; }
      setAlpha(): this { return this; }
      setScrollFactor(): this { return this; }
      setStrokeStyle(): this { return this; }
      destroy(): void { this.destroyed = true; }
    }
    const nodes: Node[] = [];
    const makeNode = () => {
      const node = new Node();
      nodes.push(node);
      return node;
    };
    const scene = {
      scale: { width: 390, height: 844 },
      add: { circle: makeNode, rectangle: makeNode },
      cameras: { main: { shakeEffect: { reset: vi.fn() } } },
    };
    const renderer = new PhaserFeedbackRenderer({
      scene: scene as never,
      maxEffects: 4,
      maxHeavyEffects: 2,
    });
    Reflect.deleteProperty(scene.cameras, 'main');

    expect(() => renderer.destroy()).not.toThrow();
    expect(nodes).toHaveLength(2);
    expect(nodes.every((node) => node.destroyed)).toBe(true);
  });
});

describe('PhaserFeedbackRenderer weapon-feel presentation', () => {
  class FakeCircle {
    fillColor?: number;
    radius?: number;
    setDepth(): this { return this; }
    setActive(): this { return this; }
    setVisible(): this { return this; }
    setAlpha(): this { return this; }
    setScrollFactor(): this { return this; }
    setStrokeStyle(): this { return this; }
    setPosition(): this { return this; }
    setFillStyle(color: number): this { this.fillColor = color; return this; }
    setRadius(radius: number): this { this.radius = radius; return this; }
    destroy(): void {}
  }

  function makeScene(): { scene: unknown; circles: FakeCircle[] } {
    const circles: FakeCircle[] = [];
    const scene = {
      scale: { width: 390, height: 844 },
      add: {
        circle: () => {
          const circle = new FakeCircle();
          circles.push(circle);
          return circle;
        },
        rectangle: () => ({
          setAlpha() { return this; }, setDepth() { return this; },
          setScrollFactor() { return this; }, setStrokeStyle() { return this; },
        }),
      },
      cameras: { main: { shakeEffect: { reset: vi.fn() } } },
    };
    return { scene, circles };
  }

  const weaponFeel = [
    { family: 'pistol', muzzle: { color: '#fbbf24', radius: 5, lifetimeMs: 70 }, impact: { color: '#fbbf24', radius: 5 }, recoilPx: 3, sfxTierVolumeMultiplier: [1, 1, 1] as const },
    { family: 'shotgun', muzzle: { color: '#f97316', radius: 8, lifetimeMs: 90 }, impact: { color: '#f97316', radius: 7 }, recoilPx: 6, sfxTierVolumeMultiplier: [1, 1, 1] as const },
  ];

  it('draws a muzzle flash using the firing family color/radius', () => {
    const { scene, circles } = makeScene();
    const renderer = new PhaserFeedbackRenderer({ scene: scene as never, maxEffects: 8, maxHeavyEffects: 4, weaponFeel });

    renderer.muzzleFlash(10, 20, 'shotgun');

    const active = circles.filter((c) => c.fillColor !== undefined);
    expect(active).toHaveLength(1);
    expect(active[0].fillColor).toBe(0xf97316);
    expect(active[0].radius).toBe(8);
  });

  it('draws nothing for a muzzle flash with an unknown family rather than guessing', () => {
    const { scene, circles } = makeScene();
    const renderer = new PhaserFeedbackRenderer({ scene: scene as never, maxEffects: 8, maxHeavyEffects: 4, weaponFeel });

    renderer.muzzleFlash(10, 20, 'railgun');

    expect(circles.filter((c) => c.fillColor !== undefined)).toHaveLength(0);
  });

  it('colors the impact cue by family and falls back for an unknown family', () => {
    const { scene, circles } = makeScene();
    const renderer = new PhaserFeedbackRenderer({ scene: scene as never, maxEffects: 8, maxHeavyEffects: 4, weaponFeel });

    renderer.projectileHit(0, 0, 'pistol', false);
    renderer.projectileHit(0, 0, 'railgun', false);

    const active = circles.filter((c) => c.fillColor !== undefined);
    expect(active).toHaveLength(2);
    expect(active[0].fillColor).toBe(0xfbbf24);
    expect(active[0].radius).toBe(5);
    // Unknown family still renders (unlike muzzleFlash) using the pre-Epic-17
    // hit color/radius, so a projectile:hit for content missing a weapon-feel
    // entry never silently disappears from combat feedback.
    expect(active[1].fillColor).toBe(0xf7f1d5);
  });
});
