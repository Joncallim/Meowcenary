import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';

class MockGameObject {
  active = true;

  constructor(
    readonly x: number,
    readonly y: number,
  ) {}
}

class MockBody {
  constructor(readonly gameObject: MockGameObject) {}

  setCircle(): void {}
}

class MockArc extends MockGameObject {
  body = new MockBody(this);

  setDepth(): this {
    return this;
  }

  destroy(): void {
    this.active = false;
  }
}

vi.mock('phaser', () => ({
  default: {
    GameObjects: { GameObject: MockGameObject },
    Physics: { Arcade: { Body: MockBody, StaticBody: MockBody } },
  },
}));

describe('DropSystem', () => {
  it('clamps a negative resolved pickup radius instead of squaring it positive', async () => {
    const { DropSystem } = await import('../src/systems/DropSystem');
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'active';
    runState.stats.add({ stat: 'pickupRadius', op: 'add', value: -20, sourceId: 'invalid' });
    const bus = createEventBus();
    const collected = vi.fn();
    bus.on('drop:collected', collected);
    let overlap: ((playerObject: unknown, dropObject: unknown) => void) | undefined;
    const scene = {
      add: { circle: (x: number, y: number) => new MockArc(x, y) },
      physics: {
        add: {
          existing: () => undefined,
          overlap(
            _player: unknown,
            _group: unknown,
            callback: (playerObject: unknown, dropObject: unknown) => void,
            _process: unknown,
            context: unknown,
          ): void {
            overlap = callback.bind(context);
          },
        },
      },
    };
    const player = { x: 0, y: 0, sprite: new MockArc(0, 0) };
    const dropGroup = { add: () => undefined };
    const system = new DropSystem(
      scene as never,
      { bus } as never,
      runState,
      player as never,
      dropGroup as never,
      4,
      10,
    );
    const drop = system.createXpDrop(5, 0, 1);

    system.update();
    overlap?.(player.sprite, drop.sprite);

    expect(drop.active).toBe(true);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
  });
});
