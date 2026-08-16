import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: {} }));

class Node {
  x = 0;
  y = 0;
  alpha = 1;
  visible = true;
  destroyed = false;
  flipX = false;
  plays: string[] = [];
  listeners = new Map<string, (...args: any[]) => void>();
  setPosition(x: number, y: number): this { this.x = x; this.y = y; return this; }
  setAlpha(alpha: number): this { this.alpha = alpha; return this; }
  setVisible(visible: boolean): this { this.visible = visible; return this; }
  setFlipX(value: boolean): this { this.flipX = value; return this; }
  setDepth(): this { return this; }
  setOrigin(): this { return this; }
  setScale(): this { return this; }
  setDisplaySize(): this { return this; }
  setActive(): this { return this; }
  play(key: string): this { this.plays.push(key); return this; }
  on(event: string, listener: (...args: any[]) => void): this { this.listeners.set(event, listener); return this; }
  off(event: string): this { this.listeners.delete(event); return this; }
  complete(key: string): void { this.listeners.get('animationcomplete')?.({ key }); }
  destroy(): void { this.destroyed = true; }
}

describe('actor views', () => {
  it('glues placeholder layers, flashes only marked nodes, and preserves body ownership', async () => {
    const { PlaceholderView } = await import('../src/entities/actorView');
    const body = new Node();
    const ear = new Node();
    const accent = new Node();
    const shadow = new Node();
    const view = new PlaceholderView(body as never, [
      { node: ear as never, dx: -9, dy: -13, flashes: true },
      { node: accent as never, dx: 3, dy: 4, flashes: false },
    ], { node: shadow as never, dy: 15 });
    view.update({ x: 100, y: 80, facing: -1, moving: true, alpha: 0.45 });
    expect([ear.x, ear.y, ear.alpha]).toEqual([91, 67, 0.45]);
    expect([accent.x, accent.y, accent.alpha]).toEqual([103, 84, 1]);
    expect([shadow.x, shadow.y, shadow.alpha]).toEqual([100, 95, 1]);
    view.destroy();
    expect(body.destroyed).toBe(false);
    expect(ear.destroyed && accent.destroyed && shadow.destroyed).toBe(true);
  });

  it('pulses a telegraph-tinted layer during winding and holds full alpha otherwise (Epic 17 D7)', async () => {
    const { PlaceholderView, telegraphPulseAlpha } = await import('../src/entities/actorView');
    const body = new Node();
    const accent = new Node();
    const shadow = new Node();
    const view = new PlaceholderView(body as never, [
      { node: accent as never, dx: 0, dy: 0, flashes: false, telegraphTint: true },
    ], { node: shadow as never, dy: 0 });

    view.update({ x: 0, y: 0, facing: 1, moving: false, alpha: 1, telegraph: 0.5 });
    expect(accent.alpha).toBeCloseTo(telegraphPulseAlpha(0.5));

    view.update({ x: 0, y: 0, facing: 1, moving: false, alpha: 1 });
    expect(accent.alpha).toBe(1);
  });

  it('bounds telegraphPulseAlpha to [0.4, 1] across the full progress range', async () => {
    const { telegraphPulseAlpha } = await import('../src/entities/actorView');
    for (let progress = 0; progress <= 1; progress += 0.05) {
      const alpha = telegraphPulseAlpha(progress);
      expect(alpha).toBeGreaterThanOrEqual(0.4);
      expect(alpha).toBeLessThanOrEqual(1);
    }
    // Out-of-range input is clamped rather than producing an unbounded value.
    expect(telegraphPulseAlpha(-1)).toBe(telegraphPulseAlpha(0));
    expect(telegraphPulseAlpha(2)).toBe(telegraphPulseAlpha(1));
  });

  it('prefers the windup clip over run/idle while telegraphing, and falls back without one', async () => {
    const { SpriteView } = await import('../src/entities/actorView');
    const body = new Node();
    const shadow = new Node();
    const sprite = new Node();
    const view = new SpriteView(body as never, { node: shadow as never, dy: 0 }, sprite as never, {
      idle: 'idle', run: 'run', windup: 'windup',
    });

    view.update({ x: 0, y: 0, facing: 1, moving: false, alpha: 1, telegraph: 0.1 });
    expect(sprite.plays.at(-1)).toBe('windup');

    // Telegraph ends: falls back to idle/run based on moving, same as before.
    view.update({ x: 0, y: 0, facing: 1, moving: true, alpha: 1 });
    expect(sprite.plays.at(-1)).toBe('run');

    // No windup clip on the binding: winding falls back to idle/run untouched
    // (already idle while stationary, so no extra play() call fires).
    const noWindupSprite = new Node();
    const noWindup = new SpriteView(new Node() as never, { node: new Node() as never, dy: 0 }, noWindupSprite as never, {
      idle: 'idle', run: 'run',
    });
    noWindup.update({ x: 0, y: 0, facing: 1, moving: false, alpha: 1, telegraph: 0.9 });
    expect(noWindupSprite.plays).toEqual(['idle']);

    noWindup.update({ x: 0, y: 0, facing: 1, moving: true, alpha: 1, telegraph: 0.9 });
    expect(noWindupSprite.plays).toEqual(['idle', 'run']);
  });

  it('flips sprite and switches clips only on moving edges', async () => {
    const { SpriteView } = await import('../src/entities/actorView');
    const body = new Node();
    const shadow = new Node();
    const sprite = new Node();
    const view = new SpriteView(body as never, { node: shadow as never, dy: 14 }, sprite as never, {
      idle: 'idle', run: 'run',
    });
    view.update({ x: 10, y: 20, facing: -1, moving: true, alpha: 0.5 });
    view.update({ x: 11, y: 20, facing: -1, moving: true, alpha: 0.5 });
    view.update({ x: 11, y: 20, facing: 1, moving: false, alpha: 1 });
    expect(body.visible).toBe(false);
    expect(sprite.plays).toEqual(['idle', 'run', 'idle']);
    expect(sprite.flipX).toBe(false);
    expect([shadow.x, shadow.y]).toEqual([11, 34]);
  });

  it('prioritizes defeat over hurt and restores the latest locomotion after hurt', async () => {
    const { SpriteView } = await import('../src/entities/actorView');
    const body = new Node();
    const shadow = new Node();
    const sprite = new Node();
    const view = new SpriteView(body as never, { node: shadow as never, dy: 14 }, sprite as never, {
      idle: 'idle', run: 'run', hurt: 'hurt', defeat: 'defeat',
    });
    view.update({ x: 1, y: 2, facing: 1, moving: true, alpha: 1 });
    view.playOneShot('hurt');
    view.update({ x: 2, y: 3, facing: -1, moving: false, alpha: 0.45 });
    expect(sprite.plays).toEqual(['idle', 'run', 'hurt']);
    sprite.complete('hurt');
    expect(sprite.plays.at(-1)).toBe('idle');

    view.playOneShot('defeat');
    view.update({ x: 3, y: 4, facing: 1, moving: true, alpha: 0.2 });
    view.playOneShot('hurt');
    sprite.complete('defeat');
    expect(sprite.plays.at(-1)).toBe('defeat');
    expect(sprite.alpha).toBe(1);
    view.destroy();
    expect(sprite.listeners.has('animationcomplete')).toBe(false);
  });

  it('builds inactive static art without advancing pooled animation and falls back when absent', async () => {
    const { createStaticArtSprite } = await import('../src/entities/actorView');
    const sprite = new Node();
    const binding = {
      id: 'drop:xp', kind: 'drop', textureKey: 'xp', url: 'assets/xp.png',
      required: true,
      load: { type: 'spritesheet', frame: { width: 16, height: 16 } },
      display: { width: 16, height: 16 },
      clips: { idle: { start: 0, end: 3, frameRate: 8, repeat: -1 } },
    } as const;
    const scene = {
      textures: { exists: (key: string) => key === 'xp' },
      anims: { exists: (key: string) => key === 'art:drop:xp:idle' },
      add: { sprite: () => sprite },
    };
    expect(createStaticArtSprite(scene as never, binding, 3)).toBe(sprite);
    expect(sprite.plays).toEqual([]);
    expect(createStaticArtSprite(scene as never, { ...binding, textureKey: 'missing' }, 3)).toBeUndefined();
  });
});
