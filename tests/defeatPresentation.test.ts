import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import type { VisualArtLookup } from '../src/systems/visualArt';

vi.mock('phaser', () => ({ default: {} }));

class SpriteNode {
  active = false;
  visible = false;
  destroyed = false;
  frame = 0;
  played: string[] = [];
  listeners = new Map<string, (animation: { key: string }) => void>();
  scale = [1, 1] as [number, number];
  setDepth(): this { return this; }
  setOrigin(): this { return this; }
  setScale(x: number, y = x): this { this.scale = [x, y]; return this; }
  setPosition(): this { return this; }
  setAlpha(): this { return this; }
  setActive(value: boolean): this { this.active = value; return this; }
  setVisible(value: boolean): this { this.visible = value; return this; }
  setFrame(frame: number): this { this.frame = frame; return this; }
  stop(): this { return this; }
  play(key: string): this { this.played.push(key); return this; }
  on(event: string, listener: (animation: { key: string }) => void): this {
    this.listeners.set(event, listener);
    return this;
  }
  off(event: string, listener: (animation: { key: string }) => void): this {
    if (this.listeners.get(event) === listener) this.listeners.delete(event);
    return this;
  }
  complete(key: string): void { this.listeners.get('animationcomplete')?.({ key }); }
  destroy(): void { this.destroyed = true; }
}

const binding = {
  id: 'enemy:dust-mite', kind: 'enemy', textureKey: 'dust', url: 'assets/dust.png', required: true, sampling: 'nearest',
  load: { type: 'spritesheet', frame: { width: 48, height: 48 } },
  display: { width: 26, height: 26 },
  clips: {
    idle: { start: 0, end: 3, frameRate: 6, repeat: -1 },
    run: { start: 4, end: 9, frameRate: 10, repeat: -1 },
    defeat: { start: 12, end: 15, frameRate: 8, repeat: 0 },
  },
} as const;

function createHarness(maxPresentations = 24) {
  const sprites: SpriteNode[] = [];
  const scene = {
    add: { sprite: () => {
      const sprite = new SpriteNode();
      sprites.push(sprite);
      return sprite;
    } },
    textures: { exists: () => true },
    anims: { exists: () => true },
    physics: { add: { existing: vi.fn() } },
  };
  const bus = createEventBus();
  const visualArt: VisualArtLookup = {
    bindingById: (id) => id === binding.id ? binding : undefined,
    all: () => [binding],
  };
  return { scene, bus, visualArt, sprites, maxPresentations };
}

describe('DefeatPresentationSystem', () => {
  it('mirrors a kill with no physics and releases/reuses on animation completion', async () => {
    const harness = createHarness();
    const { DefeatPresentationSystem } = await import('../src/systems/defeatPresentation');
    const system = new DefeatPresentationSystem(harness as never);
    const kill = { instanceId: 1, enemyId: 'dust-mite', xpValue: 1, scrapValue: 1, x: 10, y: 20 };

    harness.bus.emit('enemy:killed', kill);
    expect(system.activePresentationCount).toBe(1);
    expect(system.allocatedPresentationCount).toBe(1);
    expect(harness.scene.physics.add.existing).not.toHaveBeenCalled();
    expect(harness.sprites[0]?.played).toEqual(['art:enemy:dust-mite:defeat']);
    expect(harness.sprites[0]?.scale).toEqual([26 / 48 * 1.30, 26 / 48 * 1.30]);

    harness.sprites[0]?.complete('art:enemy:dust-mite:defeat');
    expect(system.activePresentationCount).toBe(0);
    harness.bus.emit('enemy:killed', { ...kill, instanceId: 2 });
    expect(system.allocatedPresentationCount).toBe(1);
    expect(system.activePresentationCount).toBe(1);
  });

  it('sheds cosmetics at the declared cap and uses timeout fallback', async () => {
    const harness = createHarness(2);
    const { DefeatPresentationSystem } = await import('../src/systems/defeatPresentation');
    const system = new DefeatPresentationSystem(harness as never);
    for (let instanceId = 1; instanceId <= 3; instanceId += 1) {
      harness.bus.emit('enemy:killed', {
        instanceId, enemyId: 'dust-mite', xpValue: 1, scrapValue: 1, x: 0, y: 0,
      });
    }
    expect(system.activePresentationCount).toBe(2);
    expect(system.droppedPresentationCount).toBe(1);
    system.update(1_000);
    expect(system.activePresentationCount).toBe(0);
    expect(system.allocatedPresentationCount).toBe(2);
  });

  it('ignores unavailable art and unsubscribes/destroys exactly once', async () => {
    const harness = createHarness();
    const { DefeatPresentationSystem } = await import('../src/systems/defeatPresentation');
    const system = new DefeatPresentationSystem(harness as never);
    harness.bus.emit('enemy:killed', {
      instanceId: 1, enemyId: 'unknown', xpValue: 1, scrapValue: 1, x: 0, y: 0,
    });
    expect(system.allocatedPresentationCount).toBe(0);
    harness.bus.emit('enemy:killed', {
      instanceId: 2, enemyId: 'dust-mite', xpValue: 1, scrapValue: 1, x: 0, y: 0,
    });
    system.destroy();
    expect(harness.sprites.every((sprite) => sprite.destroyed)).toBe(true);
    harness.bus.emit('enemy:killed', {
      instanceId: 3, enemyId: 'dust-mite', xpValue: 1, scrapValue: 1, x: 0, y: 0,
    });
    expect(harness.sprites).toHaveLength(1);
  });
});
