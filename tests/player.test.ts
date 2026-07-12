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
    readonly x: number,
    readonly y: number,
  ) {}

  setDepth(): this {
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  destroy(): void {
    this.active = false;
  }
}

vi.mock('phaser', () => ({ default: {} }));

describe('Player', () => {
  it('keeps the damage indicator and invulnerability countdown paused with the run', async () => {
    const { Player } = await import('../src/entities/Player');
    const sprite = new MockArc(100, 100);
    const scene = {
      scale: { width: 200, height: 200 },
      add: { circle: () => sprite },
      physics: { add: { existing: () => undefined } },
    };
    const input = { getMoveVector: () => ({ x: 0, y: 0 }) };
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'active';
    const player = new Player(scene as never, input as never, runState, createEventBus(), {
      baseMaxHealth: 100,
      baseMoveSpeed: 200,
      invulnerabilityMs: 650,
    });

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
});
