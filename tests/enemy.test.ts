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
    public x: number,
    public y: number,
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
  async function createEnemy(bus = createEventBus()): Promise<{
    enemy: InstanceType<typeof import('../src/entities/Enemy').Enemy>;
    sprite: MockArc;
  }> {
    const { Enemy } = await import('../src/entities/Enemy');
    const sprite = new MockArc(10, 20);
    const scene = {
      add: { circle: () => sprite },
      physics: { add: { existing: () => undefined } },
    };
    return {
      enemy: new Enemy(
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
        bus,
      ),
      sprite,
    };
  }

  it('ignores non-finite damage without corrupting health', async () => {
    const { enemy } = await createEnemy();

    expect(enemy.takeDamage(Number.NaN)).toBe(false);
    expect(enemy.takeDamage(Number.POSITIVE_INFINITY)).toBe(false);
    expect(enemy.health).toBe(10);
    expect(enemy.active).toBe(true);
  });

  it('exposes stable runtime identity and a live position snapshot', async () => {
    const { enemy, sprite } = await createEnemy();

    expect(enemy.instanceId).toBeGreaterThan(0);
    expect(enemy.id).toBe(enemy.instanceId);
    expect(enemy.defId).toBe('test-enemy');
    expect(enemy.archetype).toBe('chaser');
    expect(enemy.health).toBe(10);
    expect(enemy.maxHealth).toBe(10);
    expect(enemy.state).toBe('pursuing');
    expect(enemy.stateTimerMs).toBe(0);
    expect(enemy.pos).toEqual({ x: 10, y: 20 });

    sprite.x = 30;
    sprite.y = 40;
    expect(enemy.pos).toEqual({ x: 30, y: 40 });
  });

  it('emits accepted damage and transitions lethal damage to dead exactly once', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const killed = vi.fn();
    bus.on('enemy:damaged', damaged);
    bus.on('enemy:killed', killed);
    const { enemy } = await createEnemy(bus);

    expect(enemy.takeDamage(4)).toBe(false);
    expect(enemy.health).toBe(6);
    expect(enemy.state).toBe('pursuing');
    expect(damaged).toHaveBeenLastCalledWith({
      instanceId: enemy.instanceId,
      amount: 4,
      x: 10,
      y: 20,
    });

    expect(enemy.takeDamage(99)).toBe(true);
    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.stateTimerMs).toBe(0);
    expect(enemy.active).toBe(false);
    expect(damaged).toHaveBeenCalledTimes(2);
    expect(enemy.takeDamage(1)).toBe(false);
    expect(damaged).toHaveBeenCalledTimes(2);
    expect(killed).not.toHaveBeenCalled();
  });

  it('makes cleanup removal idempotent without emitting combat lifecycle events', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const killed = vi.fn();
    bus.on('enemy:damaged', damaged);
    bus.on('enemy:killed', killed);
    const { enemy, sprite } = await createEnemy(bus);

    enemy.destroy();
    enemy.destroy();

    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.active).toBe(false);
    expect(sprite.body.velocity).toEqual({ x: 0, y: 0 });
    expect(damaged).not.toHaveBeenCalled();
    expect(killed).not.toHaveBeenCalled();
  });
});
