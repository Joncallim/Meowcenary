import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { createEventBus, type EventBus } from '../src/engine/eventBus';
import { GameScene } from '../src/scenes/GameScene';
import { HudController, type HudSnapshot } from '../src/ui/hud';

interface HudSceneSeam {
  input: { off: ReturnType<typeof vi.fn>; keyboard: { off: ReturnType<typeof vi.fn> } };
  events: EventEmitter;
  scale: EventEmitter;
  hudController?: HudController;
  handleShutdown(): void;
}

describe('GameScene HUD lifecycle', () => {
  it('disposes the real HUD owner and all durable bus subscriptions on every scene visit', () => {
    const scene = new GameScene() as unknown as HudSceneSeam;
    scene.input = { off: vi.fn(), keyboard: { off: vi.fn() } };
    scene.events = new EventEmitter();
    scene.scale = new EventEmitter();
    const realBus = createEventBus();
    const liveSubscriptions = new Set<() => void>();
    const bus: EventBus = {
      ...realBus,
      on: (key, listener) => {
        const unsubscribe = realBus.on(key, listener);
        liveSubscriptions.add(unsubscribe);
        return () => { unsubscribe(); liveSubscriptions.delete(unsubscribe); };
      },
    };
    const snapshot: HudSnapshot = {
      status: 'active', timeMs: 0, health: 100, maxHealth: 100,
      level: 1, xp: 0, xpToNext: 5, kills: 0, currency: 0,
    };
    for (let visit = 0; visit < 4; visit++) {
      const resizePaint = vi.fn();
      const view = {
        render: vi.fn(),
        destroy: vi.fn(() => scene.scale.off('resize', resizePaint)),
      };
      scene.scale.on('resize', resizePaint);
      const controller = new HudController(bus, { snapshot: () => snapshot }, view);
      scene.hudController = controller;
      controller.update(16);
      expect(view.render).toHaveBeenCalledTimes(1);
      expect(liveSubscriptions.size).toBe(12);
      scene.handleShutdown();
      expect(view.destroy).toHaveBeenCalledTimes(1);
      expect(scene.hudController).toBeUndefined();
      expect(liveSubscriptions.size).toBe(0);
      realBus.emit('player:damaged', { amount: 1, healthRemaining: 99 });
      scene.scale.emit('resize');
      controller.update(16);
      expect(resizePaint).not.toHaveBeenCalled();
      expect(view.render).toHaveBeenCalledTimes(1);
      scene.handleShutdown();
      expect(view.destroy).toHaveBeenCalledTimes(1);
    }
  });
});
