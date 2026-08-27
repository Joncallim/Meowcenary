import { describe, expect, it } from 'vitest';
import {
  resolveRunPlan,
  StageResolutionError,
  createStageState,
  activateStage,
  updateObjectiveProgress,
  winStage,
  failStage,
  type StageCatalogData,
  type StageDefinition,
  type EncounterProfile,
  type DifficultyProfile,
  type RewardProfile,
} from '../src/gameplay/stage/stageContracts';

function makeCatalogData(overrides?: Partial<StageCatalogData>): StageCatalogData {
  const stages: StageDefinition[] = [
    {
      id: 'stage:junkyard-01',
      name: 'Junkyard Sweep',
      chapterId: 'chapter:junkyard',
      displayOrder: 1,
      arenaId: 'arena:junkyard-lot',
      objective: { type: 'kill', count: 20, enemyTag: 'junkyard' },
      encounterProfileId: 'encounter:junkyard-intro',
      difficultyProfileId: 'difficulty:chapter-1-easy',
      rewardProfileId: 'reward:tier-1',
      unlock: { type: 'unlock-count', minCount: 0 },
    },
    {
      id: 'stage:junkyard-02',
      name: 'Scrap Run',
      chapterId: 'chapter:junkyard',
      displayOrder: 2,
      arenaId: 'arena:junkyard-lot',
      objective: { type: 'survive', seconds: 120 },
      encounterProfileId: 'encounter:junkyard-mid',
      difficultyProfileId: 'difficulty:chapter-1-medium',
      rewardProfileId: 'reward:tier-1',
      unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
    },
    {
      id: 'stage:junkyard-05',
      name: 'Boss: Crusher',
      chapterId: 'chapter:junkyard',
      displayOrder: 5,
      arenaId: 'arena:junkyard-lot',
      objective: { type: 'defeat', enemyId: 'boss-crusher' },
      encounterProfileId: 'encounter:boss-crusher',
      difficultyProfileId: 'difficulty:boss-tier-1',
      rewardProfileId: 'reward:boss-tier-1',
      bossId: 'crusher',
      unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-04' },
    },
  ];

  const encounterProfiles: EncounterProfile[] = [
    { id: 'encounter:junkyard-intro', enemyIds: ['dust-mite', 'junk-rusher'] },
    { id: 'encounter:junkyard-mid', enemyIds: ['dust-mite', 'junk-rusher', 'trash-brute'] },
    { id: 'encounter:boss-crusher', enemyIds: ['boss-crusher', 'dust-mite'] },
  ];

  const difficultyProfiles: DifficultyProfile[] = [
    { id: 'difficulty:chapter-1-easy', healthMultiplier: 1.0, damageMultiplier: 1.0, speedMultiplier: 1.0, spawnPressure: 0.3 },
    { id: 'difficulty:chapter-1-medium', healthMultiplier: 1.2, damageMultiplier: 1.1, speedMultiplier: 1.0, spawnPressure: 0.5 },
    { id: 'difficulty:boss-tier-1', healthMultiplier: 2.0, damageMultiplier: 1.5, speedMultiplier: 0.9, spawnPressure: 0.8 },
  ];

  const rewardProfiles: RewardProfile[] = [
    { id: 'reward:tier-1', scrapBase: 50, scrapPerMinute: 5 },
    { id: 'reward:boss-tier-1', scrapBase: 200, scrapPerMinute: 10, lootTableId: 'boss-drop-table' },
  ];

  return {
    stages: overrides?.stages ?? stages,
    encounterProfiles: overrides?.encounterProfiles ?? encounterProfiles,
    difficultyProfiles: overrides?.difficultyProfiles ?? difficultyProfiles,
    rewardProfiles: overrides?.rewardProfiles ?? rewardProfiles,
  };
}

describe('resolveRunPlan', () => {
  it('resolves a kill-objective stage', () => {
    const data = makeCatalogData();
    const plan = resolveRunPlan(
      { characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 },
      data,
    );
    expect(plan.characterId).toBe('scrap-tabby');
    expect(plan.stageId).toBe('stage:junkyard-01');
    expect(plan.arenaId).toBe('arena:junkyard-lot');
    expect(plan.objective.type).toBe('kill');
    expect(plan.objective.definition).toEqual({ type: 'kill', count: 20, enemyTag: 'junkyard' });
    expect(plan.encounter.enemyIds).toEqual(['dust-mite', 'junk-rusher']);
    expect(plan.difficulty.healthMultiplier).toBe(1.0);
    expect(plan.reward.scrapBase).toBe(50);
    expect(plan.seed).toBe(42);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it('resolves a survive-objective stage', () => {
    const data = makeCatalogData();
    const plan = resolveRunPlan(
      { characterId: 'scrap-tabby', stageId: 'stage:junkyard-02', seed: 99 },
      data,
    );
    expect(plan.objective.type).toBe('survive');
    expect(plan.difficulty.spawnPressure).toBe(0.5);
    expect(plan.reward.scrapPerMinute).toBe(5);
  });

  it('resolves a boss stage with loot table', () => {
    const data = makeCatalogData();
    const plan = resolveRunPlan(
      { characterId: 'bolt-hound', stageId: 'stage:junkyard-05', seed: 7 },
      data,
    );
    expect(plan.objective.type).toBe('defeat');
    expect(plan.difficulty.healthMultiplier).toBe(2.0);
    expect(plan.reward.lootTableId).toBe('boss-drop-table');
  });

  it('throws for unknown stage', () => {
    const data = makeCatalogData();
    expect(() =>
      resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:nonexistent', seed: 1 }, data),
    ).toThrow(StageResolutionError);
  });

  it('throws for missing encounter profile', () => {
    const data = makeCatalogData({
      encounterProfiles: [],
    });
    expect(() =>
      resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 1 }, data),
    ).toThrow(StageResolutionError);
  });

  it('throws for missing difficulty profile', () => {
    const data = makeCatalogData({
      difficultyProfiles: [],
    });
    expect(() =>
      resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 1 }, data),
    ).toThrow(StageResolutionError);
  });

  it('throws for missing reward profile', () => {
    const data = makeCatalogData({
      rewardProfiles: [],
    });
    expect(() =>
      resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 1 }, data),
    ).toThrow(StageResolutionError);
  });

  it('is deterministic for same seed', () => {
    const data = makeCatalogData();
    const plan1 = resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 }, data);
    const plan2 = resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 }, data);
    expect(plan1).toEqual(plan2);
  });
});

describe('createStageState', () => {
  it('creates intro state for kill objective', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    expect(state.status).toBe('intro');
    expect(state.objectiveProgress).toEqual({ type: 'kill', current: 0, target: 20 });
    expect(state.timeMs).toBe(0);
    expect(state.stageId).toBe('stage:junkyard-01');
  });

  it('creates intro state for survive objective', () => {
    const state = createStageState('stage:junkyard-02', { type: 'survive', seconds: 120 });
    expect(state.objectiveProgress).toEqual({ type: 'survive', current: 0, target: 120 });
  });

  it('creates intro state for defeat objective', () => {
    const state = createStageState('stage:junkyard-05', { type: 'defeat', enemyId: 'boss-crusher' });
    expect(state.objectiveProgress).toEqual({ type: 'defeat', current: 0, target: 1 });
  });

  it('creates intro state for collect objective', () => {
    const state = createStageState('stage:junkyard-03', { type: 'collect', itemId: 'battery', count: 5 });
    expect(state.objectiveProgress).toEqual({ type: 'collect', current: 0, target: 5 });
  });
});

describe('stage lifecycle transitions', () => {
  it('activateStage: intro → active', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    expect(active.status).toBe('active');
    expect(active).not.toBe(state);
  });

  it('activateStage: active is idempotent', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    expect(activateStage(active)).toBe(active);
  });

  it('updateObjectiveProgress: accumulates kills', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    const after5 = updateObjectiveProgress(active, 5);
    expect(after5.objectiveProgress.current).toBe(5);
    expect(after5.status).toBe('active');

    const after20 = updateObjectiveProgress(after5, 15);
    expect(after20.objectiveProgress.current).toBe(20);
    expect(after20.status).toBe('objective-complete');
  });

  it('updateObjectiveProgress: caps at target', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    const overflow = updateObjectiveProgress(active, 50);
    expect(overflow.objectiveProgress.current).toBe(20);
    expect(overflow.status).toBe('objective-complete');
  });

  it('updateObjectiveProgress: no-op when not active', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const result = updateObjectiveProgress(state, 10);
    expect(result).toBe(state);
  });

  it('winStage: objective-complete → won', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    const complete = updateObjectiveProgress(active, 20);
    expect(complete.status).toBe('objective-complete');
    const won = winStage(complete);
    expect(won.status).toBe('won');
  });

  it('winStage: no-op if not objective-complete', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    expect(winStage(active)).toBe(active);
  });

  it('failStage: from any non-terminal status', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    expect(failStage(state).status).toBe('failed');

    const active = activateStage(state);
    expect(failStage(active).status).toBe('failed');

    const complete = updateObjectiveProgress(active, 20);
    expect(failStage(complete).status).toBe('failed');
  });

  it('failStage: no-op from terminal status', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    const complete = updateObjectiveProgress(active, 20);
    const won = winStage(complete);
    expect(failStage(won)).toBe(won);

    const failed = failStage(active);
    expect(failStage(failed)).toBe(failed);
  });

  it('full lifecycle: intro → active → objective-complete → won', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    expect(active.status).toBe('active');

    const progress = updateObjectiveProgress(active, 12);
    expect(progress.objectiveProgress.current).toBe(12);
    expect(progress.status).toBe('active');

    const complete = updateObjectiveProgress(progress, 8);
    expect(complete.objectiveProgress.current).toBe(20);
    expect(complete.status).toBe('objective-complete');

    const won = winStage(complete);
    expect(won.status).toBe('won');

    // Terminal — no further transitions
    expect(activateStage(won)).toBe(won);
    expect(updateObjectiveProgress(won, 1)).toBe(won);
    expect(failStage(won)).toBe(won);
  });

  it('alternate ending: intro → active → failed', () => {
    const state = createStageState('stage:junkyard-01', { type: 'kill', count: 20 });
    const active = activateStage(state);
    const progress = updateObjectiveProgress(active, 5);
    const failed = failStage(progress);
    expect(failed.status).toBe('failed');
    expect(failed.objectiveProgress.current).toBe(5);
  });
});

describe('Golden Run compatibility', () => {
  it('resolveRunPlan does not depend on ArenaDefinition.spawnCurveId', () => {
    // The resolver is pure and only depends on stage catalog data.
    // ArenaDefinition.spawnCurveId is preserved for the Golden Run path
    // and is not consumed by resolveRunPlan.
    const data = makeCatalogData();
    const plan = resolveRunPlan(
      { characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 },
      data,
    );
    // The plan exposes arenaId — the caller (GameScene) resolves the actual
    // ArenaDefinition (including spawnCurveId) from the arena registry.
    expect(plan.arenaId).toBe('arena:junkyard-lot');
  });

  it('stage IDs are strings — display order is not a persistence key', () => {
    const data = makeCatalogData();
    const plan = resolveRunPlan(
      { characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 },
      data,
    );
    // The stageId is the stable ID string, not a display number
    expect(typeof plan.stageId).toBe('string');
    expect(plan.stageId).toBe('stage:junkyard-01');
  });
});
