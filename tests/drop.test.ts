import { describe, expect, it, vi } from 'vitest';

class MockGameObject {
  active = false;
  visible = true;
  destroyed = false;
  fillColor = 0;
  alpha = 1;
  depth = 0;
  body: unknown = undefined;

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
    expect(drop.kind).toBe('xp');
    expect(drop.amount).toBe(0);
    expect(drop.tableId).toBeUndefined();
  });

  it.each([
    ['xp', 0x7dd3fc],
    ['scrap', 0xd1d5db],
    ['chest', 0xf472b6],
  ] as const)('uses the exact %s color', async (kind, color) => {
    const drop = await createDrop();

    drop.spawn(1, 2, kind, 10);

    expect(drop.sprite.fillColor).toBe(color);
  });

  it('reinitializes all reusable state on spawn reuse', async () => {
    const drop = await createDrop();

    drop.spawn(1, 2, 'chest', 5, 'table-a');
    expect(drop.tableId).toBe('table-a');
    drop.body.setVelocity(9, 9);
    drop.reset();
    drop.spawn(3, 4, 'scrap', 7);

    expect(drop.x).toBe(3);
    expect(drop.y).toBe(4);
    expect(drop.kind).toBe('scrap');
    expect(drop.amount).toBe(7);
    expect(drop.tableId).toBeUndefined();
    expect(drop.sprite.active).toBe(true);
    expect(drop.sprite.visible).toBe(true);
    expect(drop.body.enable).toBe(true);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('resets idempotently to a complete disabled zero state', async () => {
    const drop = await createDrop();
    drop.spawn(1, 2, 'chest', 5, 'table-a');
    drop.body.setVelocity(9, 9);

    drop.reset();
    drop.reset();

    expect(drop.active).toBe(false);
    expect(drop.kind).toBe('xp');
    expect(drop.amount).toBe(0);
    expect(drop.tableId).toBeUndefined();
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
    expect(drop.body.enable).toBe(false);
    expect(drop.sprite.active).toBe(false);
    expect(drop.sprite.visible).toBe(false);
  });

  it('destroys by deactivating and destroying the sprite', async () => {
    const drop = await createDrop();
    drop.spawn(1, 2, 'xp', 5);

    drop.destroy();

    expect(drop.active).toBe(false);
    expect((drop.sprite as unknown as MockArc).destroyed).toBe(true);
  });

  it('reset() after the sprite is destroyed does not throw', async () => {
    const drop = await createDrop();
    drop.spawn(1, 2, 'xp', 5);

    drop.destroy();

    expect(() => drop.reset()).not.toThrow();
    expect(drop.active).toBe(false);
  });

  it('restores the body circle radius on spawn even if it was reset externally', async () => {
    const drop = await createDrop(5);

    drop.body.setCircle(0);
    drop.spawn(1, 2, 'xp', 5);

    expect(drop.body.radius).toBe(5);
  });

  it('homes toward the player inside the pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, 'xp', 1);

    drop.update(16, { x: 3, y: 4 }, 10, 100);

    expect(drop.body.velocity.x).toBeCloseTo(60);
    expect(drop.body.velocity.y).toBeCloseTo(80);
  });

  it('homes when distance exactly equals the pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, 'xp', 1);

    drop.update(16, { x: 3, y: 4 }, 5, 10);

    expect(drop.body.velocity.x).toBeCloseTo(6);
    expect(drop.body.velocity.y).toBeCloseTo(8);
  });

  it('holds still and clears prior velocity outside the pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, 'xp', 1);
    drop.body.setVelocity(50, 50);

    drop.update(16, { x: 100, y: 100 }, 5, 10);

    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('never homes for a zero or negative pickup radius', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, 'xp', 1);

    drop.update(16, { x: 1, y: 0 }, 0, 10);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

    drop.update(16, { x: 1, y: 0 }, -5, 10);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('holds still for a zero or negative magnet speed', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, 'xp', 1);

    drop.update(16, { x: 1, y: 0 }, 10, 0);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });

    drop.update(16, { x: 1, y: 0 }, 10, -5);
    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('produces finite zero velocity at a coincident position', async () => {
    const drop = await createDrop();
    drop.spawn(5, 5, 'xp', 1);

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
    drop.spawn(0, 0, 'xp', 1);
    drop.body.setVelocity(7, 7);

    drop.update(dtMs, { x: 3, y: 4 }, 10, 100);

    expect(drop.body.velocity).toEqual({ x: 7, y: 7 });
  });

  it('zeroes velocity rather than writing non-finite values for invalid geometry or speed', async () => {
    const drop = await createDrop();
    drop.spawn(0, 0, 'xp', 1);
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
    drop.spawn(NaN, 0, 'xp', 1);

    drop.update(16, { x: 3, y: 4 }, 10, 100);

    expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
  });
});
