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
  it('captures the completed Stage identity without persisting a partial terminal result', () => {
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    run.timeMs = 61_000;
    scene.runState = run;
    scene.stageRuntime = completedRuntime({ firstClearScrap: 35 });
    scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
    expect(scene.stageRuntime.pendingClear).toMatchObject({ timeMs: 61_000, reward: 35 });

    expect(scene.tryCommitStageClear({ bus: createEventBus() })).toBe(true);
    expect(scene.terminalStageId).toBe('stage:junkyard-01');
    expect(scene.objectiveCompletionTimeMs).toBe(61_000);
    expect(run.status).toBe('won');
  });

  it('does not let the extraction UI supply profile rewards', () => {
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    scene.runState = run;
    scene.stageRuntime = completedRuntime({ firstClearScrap: 25, grants: [{ type: 'grant-part-instance', instanceId: 'reward:proof', partId: 'part:barrel-standard', tier: 1 }] });
    expect(scene.tryCommitStageClear({ bus: createEventBus() })).toBe(true);
    expect(scene.terminalStageId).toBe('stage:junkyard-01');
  });

  it('holds a completed objective at the shared confirm-to-extract boundary', () => {
    const scene = new GameScene() as any;
    const run = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    run.status = 'active';
    scene.runState = run;
    scene.stageRuntime = completedRuntime({ firstClearScrap: 25 });
    scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
    scene.getContext = () => ({ bus: createEventBus() });
    scene.pauseController = { snapshot: () => ({ panel: 'closed' }) };
    scene.routeAction('confirm');
    expect(scene.terminalStageId).toBe('stage:junkyard-01');
    expect(run.status).toBe('won');
  });

  it('carries a live boss objective through durable facts and next-stage selection without the retired helmet reward', () => {
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
    scene.trySettleTerminal(context, 'win');
    expect(run.status).toBe('won');
    expect(context.saveData.stages['stage:junkyard-05']?.completed).toBe(true);
    expect(context.saveData.bosses['boss-crusher']?.defeated).toBe(true);
    expect(context.saveData.achievements['achievement:boss-crusher']?.completed).toBe(true);
    expect(context.saveData.equipment['reward:crusher-commando-helmet']).toBeUndefined();
    const reloaded = createGameContext({
      bus: createEventBus(), menuRng: createRng(2), data,
      arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data), metaUpgrades,
      save: new SaveManager(storage, 'live-stage-journey', metaUpgrades.maxLevels()),
    });
    expect(reloaded.saveData.bosses['boss-crusher']?.defeated).toBe(true);
    expect(reloaded.saveData.achievements['achievement:boss-crusher']?.completed).toBe(true);
    expect(reloaded.saveData.equipment['reward:crusher-commando-helmet']).toBeUndefined();
    expect(new StageSelectionController(reloaded).snapshot().stages
      .find((stage) => stage.id === 'stage:forge-01')?.locked).toBe(false);
  });
});
