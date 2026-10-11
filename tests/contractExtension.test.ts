import { describe, expect, it } from 'vitest';
import original from './fixtures/contracts-original-ten-main4f79.json';
import spawnCurves from '../src/data/spawn-curves.json';
import { resolveStageCompletion } from '../src/gameplay/stage/stageCompletion';
import { resolveRunPlan, type StageCatalogData } from '../src/gameplay/stage/stageContracts';
import { composeStageSpawnCurve } from '../src/gameplay/stage/spawnComposition';
import { StageRegistry } from '../src/systems/stageRegistry';
import { collectGameDataErrors, loadGameData, validateGameData } from '../src/systems/validation';

const data = loadGameData();
const registry = new StageRegistry(data);
const catalogs = registry.runPlanCatalog();
const stages = catalogs.stages;
const optionalIds = ['stage:junkyard-nest-breaker', 'stage:junkyard-crossfire-salvage', 'stage:forge-shatterline', 'stage:forge-pressure-test'];
const originalIds = original.catalogs.stages.map(stage => stage.id);

describe('original main4f79 catalog and deterministic-plan preservation', () => {
  it('preserves every original parsed catalog row and order except the two approved boss openings', () => {
    expect(data.stages!.slice(0, 10).map(stage => {
      const { openingDialogue, ...mechanics } = stage;
      if (openingDialogue !== undefined) expect(['stage:junkyard-05', 'stage:junkyard-06']).toContain(stage.id);
      return mechanics;
    })).toEqual(original.catalogs.stages);
    expect(data.encounterProfiles!.slice(0, original.catalogs.encounterProfiles.length)).toEqual(original.catalogs.encounterProfiles);
    expect(data.difficultyProfiles!.slice(0, original.catalogs.difficultyProfiles.length)).toEqual(original.catalogs.difficultyProfiles);
    expect(data.rewardProfiles!.slice(0, original.catalogs.rewardProfiles.length)).toEqual(original.catalogs.rewardProfiles);
    expect(data.stages!.filter(stage => stage.openingDialogue !== undefined).map(stage => stage.id)).toEqual(['stage:junkyard-05', 'stage:junkyard-06']);
    expect([data.stages!.length, data.encounterProfiles!.length, data.difficultyProfiles!.length, data.rewardProfiles!.length]).toEqual([14, 14, 11, 14]);
  });

  it.each(original.plans)('preserves the captured original plan and spawn composition for $plan.stageId', expected => {
    const plan = resolveRunPlan({ stageId: expected.plan.stageId, characterId: 'scrap-tabby', seed: 91 }, catalogs);
    const { openingDialogue: _opening, ...mechanics } = plan;
    expect(mechanics).toEqual(expected.plan);
    const arena = data.arenas.find(row => row.id === plan.arenaId)!;
    const curve = spawnCurves.find(row => row.id === arena.spawnCurveId)!;
    expect(composeStageSpawnCurve(curve, plan)).toEqual(expected.spawnCurve);
    expect(resolveRunPlan({ stageId: plan.stageId, characterId: plan.characterId, seed: 91 }, catalogs)).toEqual(plan);
  });
});

describe('four optional post-Warden contracts', () => {
  it('preserves the ten-clear campaign on an old save and excludes retired tombstones', () => {
    const progress = Object.fromEntries(originalIds.map(id => [id, { completed: true }]));
    progress['stage:retired-fixture'] = { completed: true };
    const completion = resolveStageCompletion(stages, progress);
    expect(completion).toEqual({ mainCompleted: 10, mainTotal: 10, campaignComplete: true, optionalCompleted: 0, optionalTotal: 4, optionalComplete: false });
    expect(Object.isFrozen(completion)).toBe(true);
    optionalIds.forEach((id, index) => {
      progress[id] = { completed: true };
      expect(resolveStageCompletion(stages, progress)).toMatchObject({ mainCompleted: 10, mainTotal: 10, campaignComplete: true, optionalCompleted: index + 1, optionalTotal: 4, optionalComplete: index === 3 });
    });
  });

  it('uses missing campaignRole as main and never calls an empty catalog complete', () => {
    expect(resolveStageCompletion([], {})).toEqual({ mainCompleted: 0, mainTotal: 0, campaignComplete: false, optionalCompleted: 0, optionalTotal: 0, optionalComplete: false });
    const originalCatalogs = original.catalogs as unknown as StageCatalogData;
    expect(resolveStageCompletion(originalCatalogs.stages, Object.fromEntries(originalIds.map(id => [id, { completed: true }])))).toEqual({ mainCompleted: 10, mainTotal: 10, campaignComplete: true, optionalCompleted: 0, optionalTotal: 0, optionalComplete: false });
    expect(resolveStageCompletion(stages, { [originalIds[0]]: { completed: false }, [optionalIds[0]]: {} })).toMatchObject({ mainCompleted: 0, optionalCompleted: 0 });
  });

  it('opens exactly four authored goals with exact currency-only rewards and sequential continuation', () => {
    const optional = stages.filter(stage => stage.campaignRole === 'optional');
    expect(optional.map(stage => stage.id)).toEqual(optionalIds);
    expect(optional.map(stage => stage.objective)).toEqual([
      { type: 'kill', count: 8, enemyTag: 'ranged' },
      { type: 'collect', itemId: 'drop:scrap', count: 32 },
      { type: 'kill', count: 70 },
      { type: 'survive', seconds: 120 },
    ]);
    expect(registry.allStageIds()).toEqual([...originalIds, ...optionalIds]);
    const rewardAmounts: number[] = [];
    optional.forEach((stage, index) => {
      expect(stage.unlock).toEqual({ type: 'stage-cleared', stageId: index === 0 ? 'stage:junkyard-06' : optionalIds[index - 1] });
      const plan = resolveRunPlan({ stageId: stage.id, characterId: 'scrap-tabby', seed: 91 }, catalogs);
      expect(plan.reward.grants).toEqual([]);
      expect(plan.encounter.enemyIds.length).toBeGreaterThanOrEqual(5);
      expect(Object.isFrozen(plan.encounter.enemyIds)).toBe(true);
      rewardAmounts.push(plan.reward.firstClearScrap);
    });
    expect(rewardAmounts).toEqual([145, 150, 160, 170]);
    expect(rewardAmounts.reduce((total, amount) => total + amount, 0)).toBe(625);
    expect(stages.filter(stage => stage.unlock.type === 'stage-cleared' && stage.unlock.stageId === optionalIds.at(-1))).toEqual([]);
  });

  it('extends completion, registry and resolved plans through one appended data-only optional row', () => {
    const extension = { ...stages.at(-1)!, id: 'stage:future-optional', name: 'Future Optional', displayOrder: 8, unlock: { type: 'stage-cleared', stageId: optionalIds.at(-1)! } };
    const extendedData = validateGameData({ ...data, stages: [...stages, extension] });
    expect(collectGameDataErrors(extendedData)).toEqual([]);
    const extended = new StageRegistry(extendedData);
    expect(extended.allStageIds().at(-1)).toBe(extension.id);
    const progress = Object.fromEntries(stages.map(stage => [stage.id, { completed: true }]));
    expect(resolveStageCompletion(extended.allStages(), progress)).toMatchObject({ mainCompleted: 10, mainTotal: 10, campaignComplete: true, optionalCompleted: 4, optionalTotal: 5, optionalComplete: false });
    progress[extension.id] = { completed: true };
    expect(resolveStageCompletion(extended.allStages(), progress).optionalComplete).toBe(true);
    expect(resolveRunPlan({ stageId: extension.id, characterId: 'scrap-tabby', seed: 91 }, extended.runPlanCatalog())).toMatchObject({ stageId: extension.id, objective: { definition: extension.objective }, reward: { firstClearScrap: 170 } });
  });
});

describe('immutable optional opening projection', () => {
  it('deep-clones and freezes dialogue in both registry and resolved plan', () => {
    const mutable = structuredClone(data);
    const source = mutable.stages!.find(stage => stage.id === 'stage:junkyard-06')!;
    const frozenRegistry = new StageRegistry(mutable);
    const plan = resolveRunPlan({ stageId: source.id, characterId: 'scrap-tabby', seed: 4 }, frozenRegistry.runPlanCatalog());
    const savedLine = plan.openingDialogue!.lines[0];
    Object.assign(source.openingDialogue!, { speakerEnemyId: 'boss-crusher', lines: ['Changed after capture.'] });
    expect(plan.openingDialogue!.speakerEnemyId).toBe('boss-forge');
    expect(plan.openingDialogue!.lines[0]).toBe(savedLine);
    expect(frozenRegistry.stageById(source.id)!.openingDialogue).toEqual(plan.openingDialogue);
    expect(plan.openingDialogue).not.toBe(frozenRegistry.stageById(source.id)!.openingDialogue);
    expect(Object.isFrozen(plan.openingDialogue)).toBe(true);
    expect(Object.isFrozen(plan.openingDialogue!.lines)).toBe(true);
    expect(() => (plan.openingDialogue!.lines as string[]).push('Injected')).toThrow();
  });

  it('adds no opening property to an ordinary resolved plan', () => {
    const plan = resolveRunPlan({ stageId: originalIds[0], characterId: 'scrap-tabby', seed: 91 }, catalogs);
    expect(Object.hasOwn(plan, 'openingDialogue')).toBe(false);
  });
});
