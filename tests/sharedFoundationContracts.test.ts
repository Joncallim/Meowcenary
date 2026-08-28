import { describe, expect, it } from 'vitest';
import { evaluateCondition, createConditionContext } from '../src/gameplay/conditionEvaluator';
import { applyDurableGrantTransaction } from '../src/gameplay/grantProcessor';
import { resolveRunPlan, type StageDefinition } from '../src/gameplay/stage/stageContracts';
import { createDefaultSaveV3, MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData, validateGameData } from '../src/systems/validation';
import { StageRegistry } from '../src/systems/stageRegistry';
import { assembleComposedRunRequest } from '../src/gameplay/runRequest';
import { createRng } from '../src/engine/rng';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';

describe('Alpha 3 shared foundation canonical contracts', () => {
  it('preserves canonical achievement and character IDs through grant, save/load, and condition consumers', () => {
    const transaction = {
      id: 'achievement:contract-fixture:completion',
      grants: [
        { type: 'achievement-completed' as const, achievementId: 'achievement:contract-fixture' },
        { type: 'unlock-character' as const, characterId: 'character:contract-fixture' },
      ],
    };
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, 'shared-contract-ids', {});
    const committed = applyDurableGrantTransaction(createDefaultSaveV3(), transaction);
    expect(manager.save(committed.save)).toBe(true);
    const reloaded = manager.load();

    expect(reloaded.progression.unlocks).toEqual([
      'achievement:contract-fixture',
      'character:contract-fixture',
    ]);
    const facts = createConditionContext(reloaded.progression, {
      achievements: { 'achievement:contract-fixture': { completed: true } },
    });
    expect(evaluateCondition({ type: 'achievement-completed', achievementId: 'achievement:contract-fixture' }, facts)).toBe(true);
    expect(evaluateCondition({ type: 'owns-content', contentId: 'character:contract-fixture' }, facts)).toBe(true);
  });

  it('rejects reconstructed/double-prefixed canonical IDs before durable state changes', () => {
    const save = createDefaultSaveV3();
    const malformed = applyDurableGrantTransaction(save, {
      id: 'stage:contract-fixture:reward',
      grants: [{ type: 'unlock-stage', stageId: 'stage:stage:contract-fixture' }],
    });
    expect(malformed).toEqual({ save, valid: false, changed: false });
  });

  it('applies the same canonical owns-content rule to stage and achievement catalogs', () => {
    const invalidAchievement = structuredClone(loadGameData()) as any;
    invalidAchievement.achievements[0].condition = { type: 'owns-content', contentId: 'scrap-tabby' };
    expect(() => validateGameData(invalidAchievement)).toThrow(/canonical unlock ID/);

    const invalidStage = structuredClone(loadGameData()) as any;
    invalidStage.stages[0].unlock = { type: 'owns-content', contentId: 'scrap-tabby' };
    expect(() => validateGameData(invalidStage)).toThrow(/canonical unlock ID/);
  });

  it('rejects cross-domain stage profile and reward grant targets during catalog validation', () => {
    const badProfile = structuredClone(loadGameData()) as any;
    badProfile.stages[0].encounterProfileId = 'difficulty:chapter-1-easy';
    expect(() => validateGameData(badProfile)).toThrow(/encounterProfileId/);

    const badGrant = structuredClone(loadGameData()) as any;
    badGrant.achievements[0].rewards = [{ grant: { type: 'unlock-stage', characterId: 'character:bolt-hound' } }];
    expect(() => validateGameData(badGrant)).toThrow(/stageId/);
  });

  it('validates, registers, composes, and resolves a second data-only stage fixture without a core branch', () => {
    const data = loadGameData();
    const stages = data.stages ?? [];
    const encounters = data.encounterProfiles ?? [];
    const difficulties = data.difficultyProfiles ?? [];
    const rewards = data.rewardProfiles ?? [];
    if (stages.length === 0 || encounters.length === 0 || difficulties.length === 0 || rewards.length === 0) {
      throw new Error('Shipped stage catalog fixture unexpectedly incomplete');
    }
    const fixture: StageDefinition = {
      id: 'stage:contract-fixture',
      name: 'Contract Fixture',
      chapterId: 'chapter:junkyard',
      displayOrder: 99,
      arenaId: stages[0].arenaId,
      objective: { type: 'kill', count: 2 },
      encounterProfileId: encounters[0].id,
      difficultyProfileId: difficulties[0].id,
      rewardProfileId: rewards[0].id,
      unlock: { type: 'stage-cleared', stageId: 'stage:junkyard-01' },
    };
    const validated = validateGameData({ ...structuredClone(data), stages: [...stages, fixture] });
    const registry = new StageRegistry(validated);
    const composed = assembleComposedRunRequest({
      characters: new DataCharacterRegistry(validated), arenas: new DataArenaRegistry(validated), stages: registry,
      selectedCharacterId: 'scrap-tabby', selectedArenaId: fixture.arenaId, selectedStageId: fixture.id,
      saveData: { progression: { scrap: 0, unlocks: [], permanentUpgrades: {} }, stages: { 'stage:junkyard-01': { completed: true } }, achievements: {}, characters: {}, bosses: {} },
    } as any, createRng(42));
    expect(composed).toMatchObject({ kind: 'stage', stageId: fixture.id });
    if (composed.kind !== 'stage') throw new Error('Second fixture unexpectedly composed as legacy');
    const plan = resolveRunPlan(composed, registry.runPlanCatalog());
    const transaction = applyDurableGrantTransaction(createDefaultSaveV3(), {
      id: 'stage:contract-fixture:first-clear',
      grants: [{ type: 'unlock-equipment', equipmentId: 'equipment:contract-fixture' }],
    });
    const facts = createConditionContext(transaction.save.progression, {
      stages: { [plan.stageId]: { completed: true } },
    });

    expect(plan.stageId).toBe(fixture.id);
    expect(evaluateCondition({ type: 'stage-cleared', stageId: fixture.id }, facts)).toBe(true);
    expect(evaluateCondition({ type: 'owns-content', contentId: 'equipment:contract-fixture' }, facts)).toBe(true);
  });
});
