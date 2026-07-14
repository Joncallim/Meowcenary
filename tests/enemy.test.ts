import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';

class MockBody {
  velocity = { x: 0, y: 0 };

  setCircle(): void {}

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

class MockArc {
  active = true;
  body = new MockBody();

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}

  setDepth(): this {
    return this;
  }

  destroy(): void {
    this.active = false;
  }
}

vi.mock('phaser', () => ({ default: {} }));

describe('Enemy', () => {
  it('ignores non-finite damage without corrupting health', async () => {
    const { Enemy } = await import('../src/entities/Enemy');
    const sprite = new MockArc(10, 20);
    const scene = {
      add: { circle: () => sprite },
      physics: { add: { existing: () => undefined } },
    };
    const enemy = new Enemy(
      scene as never,
      {
        id: 'test-enemy',
        name: 'Test Enemy',
        archetype: 'chaser',
        health: 10,
        damage: 1,
        speed: 1,
        xpValue: 1,
        scrapValue: 1,
        contactDamage: true,
      },
      10,
      20,
      createEventBus(),
    );

    expect(enemy.takeDamage(Number.NaN)).toBe(false);
    expect(enemy.takeDamage(Number.POSITIVE_INFINITY)).toBe(false);
    expect(enemy.health).toBe(10);
    expect(enemy.active).toBe(true);
  });
});
