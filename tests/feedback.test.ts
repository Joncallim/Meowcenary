import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import type { Settings } from '../src/systems/save';
import {
  FeedbackSystem,
  PhaserFeedbackRenderer,
  type FeedbackRenderer,
} from '../src/systems/feedback';

function createFakeRenderer(): FeedbackRenderer & {
  projectileHitCalls: Array<{ x: number; y: number; heavyMotion: boolean }>;
  enemyKilledCalls: Array<{ x: number; y: number; heavyMotion: boolean }>;
  playerDamagedCalls: boolean[];
  levelUpCalls: boolean[];
  cancelHeavyMotionCalls: number;
  updateCalls: number[];
  destroyed: boolean;
} {
  return {
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
    projectileHit(x: number, y: number, heavyMotion: boolean) {
      this.projectileHitCalls.push({ x, y, heavyMotion });
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
    bus.emit('projectile:hit', { x: 12, y: 34, damage: 5, killed: false });

    expect(renderer.projectileHitCalls).toEqual([{ x: 12, y: 34, heavyMotion: true }]);
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
    bus.emit('projectile:hit', { x: 0, y: 0, damage: 1, killed: false });
    bus.emit('player:damaged', { amount: 1, healthRemaining: 99 });

    expect(renderer.projectileHitCalls[0].heavyMotion).toBe(true);
    expect(renderer.playerDamagedCalls[0]).toBe(true);
  });

  it('passes heavyMotion=false when reduced motion is on', () => {
    const { bus, renderer } = createSystem(true);
    bus.emit('projectile:hit', { x: 0, y: 0, damage: 1, killed: false });
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

    bus.emit('projectile:hit', { x: 0, y: 0, damage: 1, killed: false });
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

    bus.emit('projectile:hit', { x: 0, y: 0, damage: 1, killed: false });
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
    bus.emit('projectile:hit', { x: 0, y: 0, damage: 1, killed: false });
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
