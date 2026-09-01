import { describe, expect, it, vi } from 'vitest';
import { createStageRuntime } from '../src/gameplay/stage/stageRuntime';

function plan(objective: Record<string, unknown> = { type: 'kill', count: 2 }) {
  return {
    stageId: 'stage:runtime-proof',
    objective: { definition: objective },
    encounter: { bossId: 'enemy:crusher' },
    reward: { scrapBase: 20, scrapPerMinute: 5, grants: [{ type: 'grant-unlock', unlockId: 'character:proof' }] },
  } as any;
}

describe('stage runtime', () => {
  it('owns generic kill facts and snapshots a single retry-safe clear transaction', () => {
    const runtime = createStageRuntime(plan());
    runtime.tick(0, 0);
    runtime.recordEnemyDefeat('enemy:a', 'rusher');
    runtime.recordEnemyDefeat('enemy:b', 'rusher');
    runtime.tick(0, 61_000);
    expect(runtime.state.status).toBe('objective-complete');
    expect(runtime.pendingClear).toMatchObject({ stageId: 'stage:runtime-proof', timeMs: 61_000, reward: 25 });
    const commit = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(runtime.tryCommit(commit)).toBe(false);
    runtime.tick(10_000, 180_000);
    expect(runtime.tryCommit(commit)).toBe(true);
    expect(commit.mock.calls[0][0]).toEqual(commit.mock.calls[1][0]);
    expect(runtime.state.status).toBe('won');
  });

  it('uses the contract rather than stage IDs for collect, survive, and named-boss facts', () => {
    const collect = createStageRuntime(plan({ type: 'collect', itemId: 'drop:scrap', count: 1 }));
    collect.tick(0, 0); collect.recordCollection('drop:scrap'); collect.tick(0, 1);
    expect(collect.state.status).toBe('objective-complete');
    const survive = createStageRuntime(plan({ type: 'survive', seconds: 2 }));
    survive.tick(2_000, 2_000);
    expect(survive.state.status).toBe('objective-complete');
    const boss = createStageRuntime(plan({ type: 'defeat', enemyId: 'enemy:crusher' }));
    boss.tick(0, 0); boss.recordEnemyDefeat('enemy:brute'); boss.recordEnemyDefeat('enemy:crusher'); boss.tick(0, 1);
    expect(boss.state.status).toBe('objective-complete');
  });

  it('records a terminal run loss as a failed stage without creating a clear', () => {
    const runtime = createStageRuntime(plan());
    runtime.tick(0, 0);
    runtime.fail();
    expect(runtime.state.status).toBe('failed');
    runtime.recordEnemyDefeat('enemy:a');
    runtime.tick(10_000, 10_000);
    expect(runtime.state.status).toBe('failed');
    expect(runtime.pendingClear).toBeUndefined();
  });
});
