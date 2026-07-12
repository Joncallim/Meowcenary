import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';

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
});
