import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';

class MockBody {
  velocity = { x: 0, y: 0 };

  setCircle(): void {}

  setCollideWorldBounds(): void {}

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

class MockArc {
  active = true;
  alpha = 1;
  body = new MockBody();

  constructor(
    public x: number,
    public y: number,
  ) {}

  setDepth(): this {
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setStrokeStyle(): this {
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setVisible(): this {
    return this;
  }

  setActive(): this {
    return this;
  }

  setFillStyle(): this {
    return this;
  }

  destroy(): void {
    this.active = false;
  }
}

vi.mock('phaser', () => ({ default: {} }));

async function createHarness(
  invulnerabilityMs = 650,
  moveVector: { x: number; y: number } = { x: 0, y: 0 },
) {
  const { Player } = await import('../src/entities/Player');
  const circles: MockArc[] = [];
  const scene = {
    scale: { width: 200, height: 200 },
    add: {
      circle: (x: number, y: number) => {
        const arc = new MockArc(x, y);
        circles.push(arc);
        return arc;
      },
    },
    physics: { add: { existing: () => undefined } },
  };
  const input = { getMoveVector: () => ({ ...moveVector }) };
  const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  runState.status = 'active';
  const bus = createEventBus();
  const player = new Player(scene as never, input as never, runState, bus, {
    baseMaxHealth: 100,
    baseMoveSpeed: 200,
    invulnerabilityMs,
    spawnX: 400,
    spawnY: 300,
  });

  return { player, runState, sprite: circles[0], bus };
}

describe('Player', () => {
  it('keeps the damage indicator and invulnerability countdown paused with the run', async () => {
    const { player, runState, sprite } = await createHarness();

    player.takeDamage(10);
    expect(sprite.alpha).toBe(0.45);

    runState.status = 'paused';
    player.update(1_000);
    expect(sprite.alpha).toBe(0.45);

    runState.status = 'active';
    player.update(649);
    expect(sprite.alpha).toBe(0.45);
    player.update(1);
    expect(sprite.alpha).toBe(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not leave the damage tint stuck for invalid or disabled invulnerability %s',
    async (invulnerabilityMs) => {
      const { player, sprite } = await createHarness(invulnerabilityMs);

      // With no usable i-frame window, update() never runs the tint-restore branch,
      // so takeDamage() must not leave the sprite dimmed.
      player.takeDamage(10);
      player.update(16);
      expect(sprite.alpha).toBe(1);
    },
  );

  it('ignores non-finite damage without corrupting health or feedback', async () => {
    const { player, sprite } = await createHarness();

    player.takeDamage(Number.NaN);
    player.takeDamage(Number.POSITIVE_INFINITY);

    expect(player.health).toBe(100);
    expect(sprite.alpha).toBe(1);
  });

  it('clamps invalid resolved movement and max-health domains', async () => {
    const { player, runState, sprite } = await createHarness(650, { x: 1, y: 0 });
    runState.stats.add({ stat: 'moveSpeed', op: 'add', value: -500, sourceId: 'slow' });
    runState.stats.add({ stat: 'maxHealth', op: 'add', value: -500, sourceId: 'frail' });

    player.update(16);

    expect(sprite.body.velocity).toEqual({ x: 0, y: 0 });
    expect(player.maxHealth).toBe(1);
    expect(player.health).toBe(1);
  });

  it('takeEnvironmentalDamage applies continuous damage without i-frames', async () => {
    const { player, sprite, bus } = await createHarness();
    const damaged = vi.fn();
    bus.on('player:damaged', damaged);

    player.takeEnvironmentalDamage(15);
    expect(player.health).toBe(85);
    expect(damaged).toHaveBeenCalledWith({ amount: 15, healthRemaining: 85 });

    // No invulnerability window — second hit lands immediately
    player.takeEnvironmentalDamage(10);
    expect(player.health).toBe(75);
    expect(damaged).toHaveBeenCalledTimes(2);

    // No tint change (alpha stays at 1)
    expect(sprite.alpha).toBe(1);
  });

  it('takeEnvironmentalDamage lethal hit emits player:died and ends the run', async () => {
    const { player, runState, sprite, bus } = await createHarness();
    const died = vi.fn();
    const lost = vi.fn();
    bus.on('player:died', died);
    bus.on('run:lost', lost);

    player.takeEnvironmentalDamage(200);
    expect(player.health).toBe(0);
    expect(died).toHaveBeenCalledTimes(1);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(runState.status).toBe('lost');

    // Body velocity zeroed
    expect(sprite.body.velocity).toEqual({ x: 0, y: 0 });
  });

  it('takeEnvironmentalDamage is no-op when run is not active', async () => {
    const { player, runState } = await createHarness();
    runState.status = 'won';
    player.takeEnvironmentalDamage(50);
    expect(player.health).toBe(100);
  });
});
