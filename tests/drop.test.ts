import { describe, expect, it, vi } from 'vitest';
import type { LootGrant } from '../src/gameplay/loot';
import { ThemeColor } from '../src/ui/theme';

class MockGameObject {
  active = false;
  visible = true;
  destroyed = false;
  fillColor = 0;
  alpha = 1;
  depth = 0;
  scaleValue = 1;
  body: unknown = undefined;
  played: string[] = [];
  stopped = 0;
  frame = -1;

  constructor(
    public x = 0,
    public y = 0,
  ) {}

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setStrokeStyle(): this {
    return this;
  }

  setActive(active: boolean): this {
    this.active = active;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setFillStyle(color: number): this {
    this.fillColor = color;
    return this;
  }

  setOrigin(): this {
    return this;
  }

  setScale(scale: number): this {
    this.scaleValue = scale;
    return this;
  }

  play(key: string): this {
    this.played.push(key);
    return this;
  }

  stop(): this {
    this.stopped += 1;
    return this;
  }

  setFrame(frame: number): this {
    this.frame = frame;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
    // Mirrors real Phaser: GameObject.destroy() nulls the body and flips active/visible.
    this.body = undefined;
    this.active = false;
    this.visible = false;
  }
}

class MockBody {
  enable = true;
  radius = 0;
  velocity = { x: 0, y: 0 };

  constructor(readonly gameObject: MockGameObject) {}

  setCircle(radius: number): void {
    this.radius = radius;
  }

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

class MockArc extends MockGameObject {
  body = new MockBody(this);
}

vi.mock('phaser', () => ({
  default: {
    GameObjects: { GameObject: MockGameObject },
    Physics: { Arcade: { Body: MockBody, StaticBody: MockBody } },
  },
}));

async function createDrop(radius = 5) {
  const { Drop } = await import('../src/entities/Drop');
  const scene = {
    add: { circle: (x: number, y: number) => new MockArc(x, y) },
    physics: { add: { existing: () => undefined } },
  };
  return new Drop(scene as never, radius);
}

describe('Drop', () => {
  it('constructs disabled and invisible with body prepared', async () => {
    const drop = await createDrop();

    expect(drop.active).toBe(false);
    expect(drop.sprite.active).toBe(false);
    expect(drop.sprite.visible).toBe(false);
    expect(drop.sprite.depth).toBe(2);
    expect(drop.body.enable).toBe(false);
    expect(drop.body.radius).toBe(5);
    expect(drop.grant).toBeUndefined();
    expect(drop.pickupBlocked).toBe(false);
  });

  it.each([
    ['xp', 0x7dd3fc, { kind: 'xp', amount: 10 }],
    ['scrap', 0xd1d5db, { kind: 'scrap', amount: 10 }],
    ['chest', 0xf472b6, { kind: 'chest', amount: 0, tableId: 'table-a' }],
    ['weapon', ThemeColor.gold, { kind: 'weapon', definitionId: 'scrap-pistol-t1' }],
  ] as const)('uses the exact %s color', async (_kind, color, grant) => {
    const drop = await createDrop();

    drop.spawn(1, 2, grant as LootGrant);

    expect(drop.sprite.fillColor).toBe(color);
    expect(drop.grant).toEqual(grant);
  });

  it('stores a shallow copy of the grant so later mutations cannot leak in', async () => {
    const drop = await createDrop();
    const grant: LootGrant = { kind: 'scrap', amount: 7 };
    drop.spawn(0, 0, grant);
    (grant as { amount: number }).amount = 999;

    expect(drop.grant).toEqual({ kind: 'scrap', amount: 7 });
  });

  it('reinitializes all reusable state on spawn reuse', async () => {
    const drop = await createDrop();

    drop.spawn(1, 2, { kind: 'chest', amount: 0, tableId: 'table-a' });
    expect(drop.grant).toEqual({ kind: 'chest', amount: 0, tableId: 'table-a' });
    drop.body.setVelocity(9, 9);
    drop.setPickupBlocked(true);
    drop.reset();
    drop.spawn(3, 4, { kind: 'scrap', amount: 7 });

    expect(drop.x).toBe(3);
    expect(drop.y).toBe(4);
    expect(drop.grant).toEqual({ kind: 'scrap', amount: 7 });
    expect(drop.pickupBlocked).toBe(false);
    expect(drop.sprite.active).toBe(true);
    expect(drop.sprite.visible).toBe(true);
    expect(drop.body.enable).toBe(true);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('resets idempotently to a complete disabled zero state', async () => {
    const drop = await createDrop();
    drop.spawn(1, 2, { kind: 'chest', amount: 0, tableId: 'table-a' });
    drop.body.setVelocity(9, 9);
    drop.setPickupBlocked(true);

    drop.reset();
    drop.reset();

    expect(drop.active).toBe(false);
    expect(drop.grant).toBeUndefined();
    expect(drop.pickupBlocked).toBe(false);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
    expect(drop.body.enable).toBe(false);
    expect(drop.sprite.active).toBe(false);
    expect(drop.sprite.visible).toBe(false);
  });

  it('destroys by deactivating and destroying the sprite', async () => {
    const drop = await createDrop();
    drop.spawn(1, 2, { kind: 'xp', amount: 5 });

    drop.destroy();

    expect(drop.active).toBe(false);
    expect((drop.sprite as unknown as MockArc).destroyed).toBe(true);
  });

  it('reset() after the sprite is destroyed does not throw', async () => {
    const drop = await createDrop();
    drop.spawn(1, 2, { kind: 'xp', amount: 5 });

    drop.destroy();

    expect(() => drop.reset()).not.toThrow();
    expect(drop.active).toBe(false);
  });

  it('restores the body circle radius on spawn even if it was reset externally', async () => {
    const drop = await createDrop(5);

    drop.body.setCircle(0);
    drop.spawn(1, 2, { kind: 'xp', amount: 5 });

    expect(drop.body.radius).toBe(5);
  });

  it('homes toward the player inside the pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, { kind: 'xp', amount: 1 });

    drop.update(16, { x: 3, y: 4 }, 10, 100);

    expect(drop.body.velocity.x).toBeCloseTo(60);
    expect(drop.body.velocity.y).toBeCloseTo(80);
  });

  it('homes when distance exactly equals the pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, { kind: 'xp', amount: 1 });

    drop.update(16, { x: 3, y: 4 }, 5, 10);

    expect(drop.body.velocity.x).toBeCloseTo(6);
    expect(drop.body.velocity.y).toBeCloseTo(8);
  });

  it('holds still and clears prior velocity outside the pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, { kind: 'xp', amount: 1 });
    drop.body.setVelocity(50, 50);

    drop.update(16, { x: 100, y: 100 }, 5, 10);

    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('never homes for a zero or negative pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, { kind: 'xp', amount: 1 });

    drop.update(16, { x: 1, y: 0 }, 0, 10);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

    drop.update(16, { x: 1, y: 0 }, -5, 10);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('holds still for a zero or negative magnet speed', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, { kind: 'xp', amount: 1 });

    drop.update(16, { x: 1, y: 0 }, 10, 0);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

    drop.update(16, { x: 1, y: 0 }, 10, -5);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('produces finite zero velocity at a coincident position', async () => {
    const drop = await createDrop();
    drop.spawn(5, 5, { kind: 'xp', amount: 1 });

    drop.update(16, { x: 5, y: 5 }, 10, 100);

    expect(drop.body.velocity.x).toBe(0);
    expect(drop.body.velocity.y).toBe(0);
  });

  it('does not mutate an inactive drop on update', async () => {
    const drop = await createDrop();

    drop.update(16, { x: 1, y: 1 }, 10, 100);

    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
    expect(drop.active).toBe(false);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])('treats dtMs=%s as a true no-op', async (dtMs) => {
    const drop = await createDrop();
    drop.spawn(0, 0, { kind: 'xp', amount: 1 });
    drop.body.setVelocity(7, 7);

    drop.update(dtMs, { x: 3, y: 4 }, 10, 100);

    expect(drop.body.velocity).toEqual({ x: 7, y: 7 });
  });

  it('zeroes velocity rather than writing non-finite values for invalid geometry or speed', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, { kind: 'xp', amount: 1 });
    drop.body.setVelocity(7, 7);

    drop.update(16, { x: NaN, y: 4 }, 10, 100);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

    drop.body.setVelocity(7, 7);
    drop.update(16, { x: 3, y: Infinity }, 10, 100);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

    drop.body.setVelocity(7, 7);
    drop.update(16, { x: 3, y: 4 }, NaN, 100);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

    drop.body.setVelocity(7, 7);
    drop.update(16, { x: 3, y: 4 }, 10, NaN);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('zeroes velocity rather than writing non-finite values when its own position is non-finite', async () => {
    const drop = await createDrop();
    drop.spawn(NaN, 0, { kind: 'xp', amount: 1 });

    drop.update(16, { x: 3, y: 4 }, 10, 100);

    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  describe('blocked pickup state (Epic 14 §D7)', () => {
    it('setPickupBlocked(true) zeroes velocity and update never magnetizes', async () => {
      const drop = await createDrop();
      drop.spawn(0, 0, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      drop.body.setVelocity(9, 9);

      drop.setPickupBlocked(true);

      expect(drop.pickupBlocked).toBe(true);
      expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

      drop.update(16, { x: 1, y: 0 }, 100, 100);
      expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
    });

    it('setPickupBlocked(false) restores magnet behavior', async () => {
      const drop = await createDrop();
      drop.spawn(0, 0, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      drop.setPickupBlocked(true);

      drop.setPickupBlocked(false);
      drop.update(16, { x: 1, y: 0 }, 100, 100);

      expect(drop.pickupBlocked).toBe(false);
      expect(drop.body.velocity.x).toBeGreaterThan(0);
    });

    it('spawn clears a stale blocked state', async () => {
      const drop = await createDrop();
      drop.spawn(0, 0, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      drop.setPickupBlocked(true);

      drop.spawn(1, 1, { kind: 'scrap', amount: 2 });

      expect(drop.pickupBlocked).toBe(false);
    });
  });

  describe('xp art binding (Epic 13 §9.4)', () => {
    const xpBinding = {
      id: 'drop:xp',
      kind: 'drop',
      textureKey: 'art-drop-xp-mote',
      url: 'assets/pickups/xp-mote/xp-mote.png',
      required: true,
             sampling: 'nearest',
             load: { type: 'spritesheet', frame: { width: 16, height: 16 } },
      display: { width: 16, height: 16 },
      clips: { idle: { start: 0, end: 3, frameRate: 8, repeat: -1 } },
    } as const;

    async function createArtDrop() {
      const { Drop } = await import('../src/entities/Drop');
      const sprites: MockGameObject[] = [];
      const scene = {
        add: {
          circle: (x: number, y: number) => new MockArc(x, y),
          sprite: () => {
            const sprite = new MockGameObject();
            sprites.push(sprite);
            return sprite;
          },
        },
        textures: { exists: (key: string) => key === xpBinding.textureKey },
        anims: { exists: (key: string) => key === 'art:drop:xp:idle' },
        physics: { add: { existing: () => undefined } },
      };
      const drop = new Drop(scene as never, 8, Object.freeze({ xp: xpBinding }));
      return { drop, sprite: sprites[0], circles: sprites as MockGameObject[] };
    }

    it('shows the sprite for xp and the geometric circle for scrap, chest, and weapon', async () => {
      const { drop, sprite } = await createArtDrop();
      expect(sprite).toBeDefined();
      expect(sprite.visible).toBe(false);
      expect(sprite.played).toEqual([]);

      drop.spawn(10, 20, { kind: 'xp', amount: 5 });
      expect(drop.sprite.visible).toBe(false);
      expect(sprite.active).toBe(true);
      expect(sprite.visible).toBe(true);
      expect([sprite.x, sprite.y]).toEqual([10, 20]);
      expect(sprite.played).toEqual(['art:drop:xp:idle']);

      drop.spawn(11, 21, { kind: 'scrap', amount: 5 });
      expect(drop.sprite.visible).toBe(true);
      expect(sprite.visible).toBe(false);

      drop.spawn(12, 22, { kind: 'chest', amount: 0, tableId: 't' });
      expect(drop.sprite.visible).toBe(true);
      expect(sprite.visible).toBe(false);

      drop.spawn(13, 23, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      expect(drop.sprite.visible).toBe(true);
      expect(sprite.visible).toBe(false);
    });

    it('keeps pooled reuse free of stale art visibility and tears art down once', async () => {
      const { drop, sprite } = await createArtDrop();

      drop.spawn(1, 2, { kind: 'xp', amount: 5 });
      drop.reset();
      expect(sprite.visible).toBe(false);

      drop.spawn(3, 4, { kind: 'scrap', amount: 5 });
      expect(sprite.visible).toBe(false);
      drop.reset();

      drop.spawn(5, 6, { kind: 'xp', amount: 5 });
      expect(sprite.visible).toBe(true);
      expect([sprite.x, sprite.y]).toEqual([5, 6]);

      drop.destroy();
      expect(sprite.destroyed).toBe(true);
      expect((drop.sprite as unknown as MockArc).destroyed).toBe(true);
    });
  });

  it('prebuilds four kind sprites once and switches pooled presentation without allocation', async () => {
    const { Drop } = await import('../src/entities/Drop');
    const kinds = ['xp', 'scrap', 'chest', 'weapon'] as const;
    const bindings = Object.freeze(Object.fromEntries(kinds.map((kind) => [kind, {
      id: `drop:${kind}`, kind: 'drop', textureKey: `art-${kind}`, url: `assets/${kind}.png`,
      required: true, load: { type: 'spritesheet', frame: { width: 20, height: 20 } },
      display: { width: 20, height: 20 },
      clips: { idle: { start: 0, end: 3, frameRate: 8, repeat: -1 } },
    }]))) as never;
    const sprites: MockGameObject[] = [];
    const scene = {
      add: {
        circle: (x: number, y: number) => new MockArc(x, y),
        sprite: () => {
          const sprite = new MockGameObject();
          sprites.push(sprite);
          return sprite;
        },
      },
      textures: { exists: () => true },
      anims: { exists: () => true },
      physics: { add: { existing: () => undefined } },
    };
    const drop = new Drop(scene as never, 8, bindings);
    expect(sprites).toHaveLength(4);

    const grants: LootGrant[] = [
      { kind: 'xp', amount: 1 },
      { kind: 'scrap', amount: 1 },
      { kind: 'chest', amount: 0, tableId: 'table' },
      { kind: 'weapon', definitionId: 'scrap-pistol-t1' },
    ];
    grants.forEach((grant, index) => {
      drop.spawn(10 + index, 20 + index, grant);
      expect(sprites.filter((sprite) => sprite.active && sprite.visible)).toHaveLength(1);
      expect(sprites[index]?.played.at(-1)).toBe(`art:drop:${grant.kind}:idle`);
      expect(sprites).toHaveLength(4);
    });

    drop.reset();
    expect(sprites.every((sprite) => !sprite.active && !sprite.visible && sprite.frame === 0)).toBe(true);
    drop.destroy();
    expect(sprites.every((sprite) => sprite.destroyed)).toBe(true);
  });
});
