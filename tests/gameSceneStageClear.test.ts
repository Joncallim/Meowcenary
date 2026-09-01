import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState } from '../src/gameplay/runState';
import { createStageRuntime } from '../src/gameplay/stage/stageRuntime';
import { GameScene } from '../src/scenes/GameScene';
import { createGameContext } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { StageSelectionController } from '../src/ui/stageSelectionController';

function completedRuntime(reward: Record<string, unknown>) {
  const runtime = createStageRuntime({
    stageId: 'stage:junkyard-01', encounter: {}, reward,
    objective: { definition: { type: 'kill', count: 1 } },
  } as any);
  runtime.tick(0, 0);
  runtime.recordEnemyDefeat('enemy:proof');
  runtime.tick(0, 61_000);
  return runtime;
}

/** Regression for the runtime boundary: a failed save must retain the exact
 * objective-completion snapshot rather than recomputing/losing its reward. */
describe('GameScene durable stage clear', () => {
  it('pauses the active run until the captured transaction retries without reward drift', () => {
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    run.timeMs = 61_000;
    scene.runState = run;
    scene.stageRuntime = completedRuntime({ scrapBase: 25, scrapPerMinute: 10 });
    scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
    expect(scene.stageRuntime.pendingClear).toMatchObject({ timeMs: 61_000, reward: 35 });

    const completeStageTransaction = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const context = { completeStageTransaction, bus: createEventBus() };
    expect(scene.tryCommitStageClear(context)).toBe(false);
    // A failed persistence attempt is an earned-clear boundary, not an
    // opportunity for combat to convert the result into a loss.
    scene.syncPhysicsPause(run);
    expect(scene.physics.world.pause).toHaveBeenCalledTimes(1);
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

  it('commits explicit profile rewards with the stage receipt, not through a separate UI mutation', () => {
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    scene.runState = run;
    scene.stageRuntime = completedRuntime({ scrapBase: 25, scrapPerMinute: 0, grants: [{ type: 'grant-part-instance', instanceId: 'reward:proof', partId: 'part:barrel-standard', tier: 1 }] });
    const completeStageTransaction = vi.fn().mockReturnValue(true);
    expect(scene.tryCommitStageClear({ completeStageTransaction, bus: createEventBus() })).toBe(true);
    expect(completeStageTransaction).toHaveBeenCalledWith('stage:junkyard-01', 61_000, undefined, {
      id: 'stage:junkyard-01:first-clear',
      grants: [
        { type: 'grant-scrap', amount: 25 },
        { type: 'grant-part-instance', instanceId: 'reward:proof', partId: 'part:barrel-standard', tier: 1 },
      ],
    });
  });

  it('holds a completed objective at the shared confirm-to-extract boundary', () => {
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    scene.runState = run;
    scene.stageRuntime = completedRuntime({ scrapBase: 25, scrapPerMinute: 0 });
    scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
    const completeStageTransaction = vi.fn().mockReturnValue(true);
    scene.getContext = () => ({ completeStageTransaction, bus: createEventBus() });
    scene.pauseController = { snapshot: () => ({ panel: 'closed' }) };
    scene.routeAction('confirm');
    expect(completeStageTransaction).toHaveBeenCalledOnce();
    expect(run.status).toBe('won');
  });

  it('carries a live boss objective through durable facts, achievement reward, and next-stage selection', () => {
    const data = loadGameData();
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const storage = new MemoryStorageAdapter();
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data), metaUpgrades,
      save: new SaveManager(storage, 'live-stage-journey', metaUpgrades.maxLevels()),
    });
    const reward = data.rewardProfiles?.find((profile) => profile.id === 'reward:stage-05-boss');
    if (!reward) throw new Error('Missing Stage 5 reward profile');
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    run.timeMs = 120_000;
    scene.runState = run;
    scene.stageRuntime = createStageRuntime({
      stageId: 'stage:junkyard-05', bossId: 'boss-crusher', encounter: { bossId: 'boss-crusher' },
      reward,
      objective: { definition: { type: 'defeat', enemyId: 'boss-crusher' } },
    } as any);
    scene.stageRuntime.tick(0, run.timeMs);
    scene.enemyDefinitions = { resolvedById: () => ({ archetype: 'boss' }) };
    scene.installAuthoritativeFactListeners(context);
    context.bus.emit('enemy:killed', {
      enemyId: 'boss-crusher', instanceId: 1, x: 0, y: 0, xpValue: 0, scrapValue: 0,
    });
    scene.stageRuntime.tick(0, run.timeMs);
    scene.getContext = () => context;
    scene.pauseController = { snapshot: () => ({ panel: 'closed' }) };

    // Exercise the production extraction command rather than calling the
    // durable method directly: a player confirms the completed objective.
    scene.routeAction('confirm');
    expect(run.status).toBe('won');
    expect(context.saveData.stages['stage:junkyard-05']?.completed).toBe(true);
    expect(context.saveData.bosses['boss-crusher']?.defeated).toBe(true);
    expect(context.saveData.achievements['achievement:boss-crusher']?.completed).toBe(true);
    expect(context.saveData.equipment['reward:crusher-commando-helmet']?.equipmentId).toBe('equipment:commando-helmet');
    const reloaded = createGameContext({
      bus: createEventBus(), menuRng: createRng(2), data,
      arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data), metaUpgrades,
      save: new SaveManager(storage, 'live-stage-journey', metaUpgrades.maxLevels()),
    });
    expect(reloaded.saveData.bosses['boss-crusher']?.defeated).toBe(true);
    expect(reloaded.saveData.achievements['achievement:boss-crusher']?.completed).toBe(true);
    expect(reloaded.saveData.equipment['reward:crusher-commando-helmet']?.equipmentId).toBe('equipment:commando-helmet');
    expect(new StageSelectionController(reloaded).snapshot().stages
      .find((stage) => stage.id === 'stage:junkyard-06')?.locked).toBe(false);
  });
});
