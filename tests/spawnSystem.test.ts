import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';
import { loadGameData } from '../src/systems/validation';

vi.mock('phaser', () => ({ default: {} }));

describe('SpawnSystem', () => {
  it('freezes active enemies without touching destroyed ones while not active', async () => {
    const { SpawnSystem } = await import('../src/systems/SpawnSystem');

    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'won';

    const activeBody = {
      velocity: { x: 40, y: -20 },
      setVelocity(x: number, y: number): void {
        this.velocity = { x, y };
      },
    };
    const activeEnemy = { active: true, body: activeBody };
    // Mirrors a Phaser sprite after destroy(): the body reference becomes undefined.
    const destroyedEnemy = { active: false, body: undefined as unknown };
    const enemies = [destroyedEnemy, activeEnemy] as never;

    const ctx = {
      bus: createEventBus(),
      data: { enemies: [], spawnCurves: [] },
    } as never;

    const system = new SpawnSystem(
      {} as never,
      ctx,
      runState,
      {} as never,
      {} as never,
      enemies,
      {} as never,
    );

    // A destroyed enemy left in the array on the win/lose transition must not crash
    // the freeze pass, and live enemies must still be stopped.
    expect(() => system.update(16)).not.toThrow();
    expect(activeBody.velocity).toEqual({ x: 0, y: 0 });
    expect(enemies).toEqual([activeEnemy]);
  });

  it('publishes one spawned event after adding the runtime enemy to its group', async () => {
    const { SpawnSystem } = await import('../src/systems/SpawnSystem');
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'active';
    const bus = createEventBus();
    const spawned = vi.fn();
    bus.on('enemy:spawned', spawned);

    class SpawnBody {
      velocity = { x: 0, y: 0 };
      setCircle(): void {}
      setVelocity(x: number, y: number): void { this.velocity = { x, y }; }
    }
    class SpawnArc {
      active = true;
      body = new SpawnBody();
      constructor(public x: number, public y: number) {}
      setDepth(): this { return this; }
      destroy(): void { this.active = false; }
    }

    const scene = {
      scale: { width: 800, height: 600 },
      add: { circle: (x: number, y: number) => new SpawnArc(x, y) },
      physics: { add: { existing: () => undefined } },
    };
    const enemies: Array<{ instanceId: number; defId: string; pos: { x: number; y: number } }> = [];
    const enemyGroup = { add: vi.fn() };
    const ctx = { bus, data: loadGameData() };
    const rng = { int: (min: number) => min };
    const player = { active: true, x: 400, y: 300 };
    const system = new SpawnSystem(
      scene as never,
      ctx as never,
      runState,
      rng as never,
      player as never,
      enemies as never,
      enemyGroup as never,
    );

    system.update(1600);

    expect(enemies).toHaveLength(1);
    expect(enemyGroup.add).toHaveBeenCalledTimes(1);
    expect(spawned).toHaveBeenCalledTimes(1);
    expect(enemyGroup.add.mock.invocationCallOrder[0]).toBeLessThan(
      spawned.mock.invocationCallOrder[0],
    );
    expect(spawned).toHaveBeenCalledWith({
      instanceId: enemies[0].instanceId,
      enemyId: enemies[0].defId,
      x: enemies[0].pos.x,
      y: enemies[0].pos.y,
    });
  });
});
