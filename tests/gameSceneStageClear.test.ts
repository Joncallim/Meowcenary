import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';
import { GameScene } from '../src/scenes/GameScene';

/** Regression for the runtime boundary: a failed save must retain the exact
 * objective-completion snapshot rather than recomputing/losing its reward. */
describe('GameScene durable stage clear', () => {
  it('retries the captured transaction after a terminal run without reward drift', () => {
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    run.timeMs = 61_000;
    scene.runState = run;
    scene.stagePlan = {
      stageId: 'stage:junkyard-01', encounter: {}, reward: { scrapBase: 25, scrapPerMinute: 10 },
    };
    scene.stageState = { status: 'objective-complete' };
    scene.captureStageClear();
    expect(scene.pendingStageClear).toMatchObject({ timeMs: 61_000, reward: 35 });

    const completeStageTransaction = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const context = { completeStageTransaction, bus: createEventBus() };
    expect(scene.tryCommitStageClear(context)).toBe(false);
    run.status = 'lost';
    run.timeMs = 180_000;
    expect(scene.tryCommitStageClear(context)).toBe(true);
    expect(completeStageTransaction).toHaveBeenNthCalledWith(1,
      'stage:junkyard-01', 61_000, undefined,
      { id: 'stage:junkyard-01:first-clear', grants: [{ type: 'grant-scrap', amount: 35 }] },
    );
    expect(completeStageTransaction).toHaveBeenLastCalledWith(
      'stage:junkyard-01', 61_000, undefined,
      { id: 'stage:junkyard-01:first-clear', grants: [{ type: 'grant-scrap', amount: 35 }] },
    );
  });
});
