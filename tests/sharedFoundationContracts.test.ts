import { describe, expect, it } from 'vitest';
import { evaluateCondition, createConditionContext } from '../src/gameplay/conditionEvaluator';
import { applyDurableGrantTransaction } from '../src/gameplay/grantProcessor';
import { resolveRunPlan, type StageDefinition } from '../src/gameplay/stage/stageContracts';
import { createDefaultSaveV3, MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

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

  it('resolves a second data-only stage fixture and carries its canonical fact/reward without a core branch', () => {
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
    const plan = resolveRunPlan(
      { characterId: 'scrap-tabby', stageId: fixture.id, seed: 42 },
      {
        stages: [...stages, fixture],
        encounterProfiles: encounters,
        difficultyProfiles: difficulties,
        rewardProfiles: rewards,
      },
    );
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
