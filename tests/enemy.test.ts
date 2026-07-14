import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import type { ResolvedEnemyDefinition } from '../src/systems/types';

class MockBody {
  velocity = { x: 0, y: 0 };

  setCircle(): void {}

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

class MockArc {
  active = true;
  body: MockBody | undefined = new MockBody();

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

function enemyDefinition(): ResolvedEnemyDefinition {
  return {
    id: 'test-enemy',
    name: 'Test Enemy',
    archetype: 'chaser',
    health: 10,
    damage: 1,
    speed: 1,
    xpValue: 1,
    scrapValue: 1,
    contactDamage: true,
  };
}

describe('Enemy', () => {
  async function createEnemy(
    bus = createEventBus(),
    definition = enemyDefinition(),
  ): Promise<{
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
        definition,
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

  it('owns immutable definition values independently of its caller and siblings', async () => {
    const source = enemyDefinition();
    const first = await createEnemy(createEventBus(), source);
    const sibling = await createEnemy(createEventBus(), source);

    source.id = 'mutated-enemy';
    source.archetype = 'tank';
    source.speed = 99;
    source.xpValue = 99;

    first.enemy.update({ active: true, x: 20, y: 20 } as never, 1_000);

    expect(first.enemy.defId).toBe('test-enemy');
    expect(first.enemy.archetype).toBe('chaser');
    expect(first.enemy.xpValue).toBe(1);
    expect(first.sprite.body?.velocity).toEqual({ x: 1, y: 0 });
    expect(sibling.enemy.defId).toBe('test-enemy');
    expect(sibling.enemy.archetype).toBe('chaser');
    expect(sibling.enemy.xpValue).toBe(1);
    expect(Object.isFrozen(first.enemy.definition)).toBe(true);
    expect(Reflect.set(first.enemy.definition, 'xpValue', 500)).toBe(false);
    expect(sibling.enemy.xpValue).toBe(1);
  });

  it('runs charger windup, dash, and cooldown state through the pure movement helper', async () => {
    const definition: ResolvedEnemyDefinition = {
      id: 'test-charger',
      name: 'Test Charger',
      archetype: 'charger',
      health: 10,
      damage: 1,
      speed: 100,
      xpValue: 1,
      scrapValue: 1,
      contactDamage: true,
      attack: {
        triggerRange: 150,
        telegraphMs: 650,
        dashSpeed: 260,
        dashDurationMs: 700,
        cooldownMs: 1_200,
      },
    };
    const { enemy, sprite } = await createEnemy(createEventBus(), definition);
    const player = { active: true, x: 100, y: 20 } as never;

    enemy.update(player, 1);
    expect(enemy.state).toBe('winding');
    expect(enemy.stateTimerMs).toBe(649);
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });

    enemy.update(player, 649);
    expect(enemy.state).toBe('attacking');
    expect(enemy.stateTimerMs).toBe(700);

    enemy.update(player, 100);
    expect(enemy.state).toBe('attacking');
    expect(enemy.stateTimerMs).toBe(600);
    expect(sprite.body?.velocity).toEqual({ x: 260, y: 0 });

    enemy.update(player, 600);
    expect(enemy.state).toBe('idle');
    expect(enemy.stateTimerMs).toBe(1_200);
    expect(sprite.body?.velocity).toEqual({ x: 260, y: 0 });

    enemy.update(player, 1_200);
    expect(enemy.state).toBe('pursuing');
    expect(enemy.stateTimerMs).toBe(0);
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });
  });

  it('keeps deferred shell behavior and invalid frame deltas stopped', async () => {
    const boss: ResolvedEnemyDefinition = {
      id: 'test-boss',
      name: 'Test Boss',
      archetype: 'boss',
      health: 100,
      damage: 10,
      speed: 50,
      xpValue: 10,
      scrapValue: 10,
      contactDamage: false,
    };
    const { enemy: bossEnemy, sprite: bossSprite } = await createEnemy(createEventBus(), boss);
    bossSprite.body?.setVelocity(20, 20);

    bossEnemy.update({ active: true, x: 100, y: 20 } as never, 16);
    expect(bossSprite.body?.velocity).toEqual({ x: 0, y: 0 });

    const { enemy: chaser, sprite: chaserSprite } = await createEnemy();
    chaserSprite.body?.setVelocity(20, 20);
    chaser.update({ active: true, x: 100, y: 20 } as never, Number.NaN);
    expect(chaserSprite.body?.velocity).toEqual({ x: 0, y: 0 });
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
    expect(sprite.body?.velocity).toEqual({ x: 0, y: 0 });
    expect(damaged).not.toHaveBeenCalled();
    expect(killed).not.toHaveBeenCalled();
  });

  it('normalizes repeated cleanup after Phaser has already removed the body', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const killed = vi.fn();
    bus.on('enemy:damaged', damaged);
    bus.on('enemy:killed', killed);
    const { enemy, sprite } = await createEnemy(bus);
    enemy.stateTimerMs = 250;
    sprite.destroy();
    sprite.body = undefined;

    expect(() => {
      enemy.destroy();
      enemy.destroy();
    }).not.toThrow();

    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.stateTimerMs).toBe(0);
    expect(enemy.active).toBe(false);
    expect(damaged).not.toHaveBeenCalled();
    expect(killed).not.toHaveBeenCalled();
  });

  it('returns the committed nonlethal outcome when a damage listener performs cleanup', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const { enemy } = await createEnemy(bus);
    bus.on('enemy:damaged', (event) => {
      damaged(event);
      enemy.destroy();
    });

    expect(enemy.takeDamage(1)).toBe(false);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.active).toBe(false);
  });

  it('commits lethal state before notification and rejects reentrant damage', async () => {
    const bus = createEventBus();
    const damaged = vi.fn();
    const reentrantOutcomes: boolean[] = [];
    const { enemy } = await createEnemy(bus);
    bus.on('enemy:damaged', (event) => {
      damaged(event);
      reentrantOutcomes.push(enemy.takeDamage(1));
    });

    expect(enemy.takeDamage(10)).toBe(true);
    expect(reentrantOutcomes).toEqual([false]);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(enemy.health).toBe(0);
    expect(enemy.state).toBe('dead');
    expect(enemy.active).toBe(false);
  });
});
