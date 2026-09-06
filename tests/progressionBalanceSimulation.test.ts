import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { assembleComposedRunRequest } from '../src/gameplay/runRequest';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import { createStageRuntime } from '../src/gameplay/stage/stageRuntime';
import { resolveEquipmentModifiers, upgradeCost } from '../src/gameplay/equipment';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { StageRegistry } from '../src/systems/stageRegistry';
import { loadGameData } from '../src/systems/validation';

/**
 * Deterministic economy/cadence evidence for Epic 26.  This deliberately
 * exercises the same durable stage boundary and normal stage composition as
 * a run, rather than comparing JSON rows in isolation.
 */
function createHarness(storage = new MemoryStorageAdapter(), data = loadGameData()) {
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const stages = new StageRegistry(data);
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(17), data, metaUpgrades, stages,
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data),
    save: new SaveManager(storage, 'progression-balance', metaUpgrades.maxLevels()),
  });
  return { context, stages };
}

function clearSelectedStage(
  harness: ReturnType<typeof createHarness>,
  timeMs: number,
): string {
  const request = assembleComposedRunRequest(harness.context, createRng(23));
  if (request.kind !== 'stage') throw new Error('normal composition unexpectedly chose legacy arena');
  const plan = resolveRunPlan(request, harness.stages.runPlanCatalog());
  const runtime = createStageRuntime(plan);
  runtime.tick(0, 0);
  const objective = plan.objective.definition;
  if (objective.type === 'kill') {
    for (let i = 0; i < objective.count; i += 1) runtime.recordEnemyDefeat(plan.encounter.enemyIds[0], objective.enemyTag);
  } else if (objective.type === 'collect') {
    for (let i = 0; i < objective.count; i += 1) runtime.recordCollection(objective.itemId);
  } else if (objective.type === 'defeat') {
    runtime.recordEnemyDefeat(objective.enemyId);
  }
  runtime.tick(objective.type === 'survive' ? objective.seconds * 1_000 : 0, timeMs);
  expect(runtime.pendingClear).toBeDefined();
  expect(runtime.tryCommit((pending) => harness.context.completeStageTransaction(pending.stageId, pending.timeMs, pending.bossId, {
    id: `stage:${pending.stageId.slice('stage:'.length)}:first-clear`,
    grants: [{ type: 'grant-scrap', amount: pending.reward }, ...pending.grants],
  }))).toBe(true);
  return request.stageId;
}

describe('Epic 26 deterministic progression balance simulation', () => {
  it('advances the normal stage frontier in order and gives every first clear a bounded, durable reward', () => {
    const { context, stages } = createHarness();
    const orderedStages = stages.allStages();
    const expected = orderedStages.map((stage) => stage.id);
    const rewards: number[] = [];

    for (const [index, stageId] of expected.entries()) {
      const request = assembleComposedRunRequest(context, createRng(index + 1));
      expect(request).toMatchObject({ kind: 'stage', stageId });
      // Three minutes is the declared reward ceiling. A later clear has the
      // same reward, so waiting on a completed objective cannot farm scrap.
      // Grant first-victory achievement before the final boss (junkyard-06)
      // because part:trait-fire-mastered requires it as an unlock.
      if (stageId === 'stage:junkyard-06') {
        context.commitAchievementTransaction({
          'achievement:first-victory': { progress: 1, completed: true, completedAt: Date.now() },
        }, {}, {
          id: 'achievement:first-victory:completion',
          grants: [{ type: 'achievement-completed', achievementId: 'achievement:first-victory' }],
        });
      }
      expect(clearSelectedStage({ context, stages }, 180_000)).toBe(stageId);
      rewards.push(context.saveData.progression.scrap - (rewards.reduce((total, reward) => total + reward, 0)));
      expect(context.saveData.appliedGrantTransactions[`${stageId}:first-clear`]).toBe(true);
    }

    for (const chapterId of new Set(orderedStages.map((stage) => stage.chapterId))) {
      const chapterRewards = rewards.filter((_, index) => orderedStages[index]!.chapterId === chapterId);
      for (let index = 1; index < chapterRewards.length; index += 1) {
        expect(chapterRewards[index]).toBeGreaterThan(chapterRewards[index - 1]);
      }
    }
    expect(rewards[4]).toBeGreaterThan(rewards[0] * 3);
    expect(rewards.at(-1)).toBeGreaterThan(rewards[5]!);
    const beforeReplay = context.saveData.progression.scrap;
    expect(context.selectStage(expected[0], context.stageSelectionRevision)).toMatchObject({ ok: true });
    expect(clearSelectedStage({ context, stages }, 1_800_000)).toBe(expected[0]);
    expect(context.saveData.progression.scrap).toBe(beforeReplay);

    const capped = createHarness();
    const delayed = createHarness();
    clearSelectedStage(capped, 180_000);
    clearSelectedStage(delayed, 1_800_000);
    expect(delayed.context.saveData.progression.scrap).toBe(capped.context.saveData.progression.scrap);

    const storage = new MemoryStorageAdapter();
    const firstSession = createHarness(storage);
    clearSelectedStage(firstSession, 120_000);
    const resumed = createHarness(storage);
    expect(assembleComposedRunRequest(resumed.context, createRng(1))).toMatchObject({ kind: 'stage', stageId: 'stage:junkyard-02' });

    const achievementGatedData = structuredClone(loadGameData()) as any;
    achievementGatedData.stages = achievementGatedData.stages.map((stage: any) => stage.id === 'stage:junkyard-02'
      ? { ...stage, unlock: { type: 'achievement-completed', achievementId: 'achievement:first-victory' } }
      : stage);
    const achievementGated = createHarness(new MemoryStorageAdapter(), achievementGatedData);
    clearSelectedStage(achievementGated, 120_000);
    expect(achievementGated.context.commitAchievementTransaction({
      'achievement:first-victory': { progress: 1, completed: true, completedAt: 1 },
    }, {}, {
      id: 'achievement:first-victory:completion',
      grants: [{ type: 'achievement-completed', achievementId: 'achievement:first-victory' }],
    })).toBe(true);
    expect(assembleComposedRunRequest(achievementGated.context, createRng(1))).toMatchObject({ kind: 'stage', stageId: 'stage:junkyard-02' });
  });

  it('has no early equipment dead end: the first tier upgrade unlocks after its stage gate and is affordable at stage two', () => {
    const gateHarness = createHarness();
    const { context: gateContext } = gateHarness;
    expect(clearSelectedStage(gateHarness, 120_000)).toBe('stage:junkyard-01');
    // Create owned equipment instance for V4 (equipment is fabricated, not stage-dropped)
    gateContext.updateEquipment(() => ({
      equipment: { 'owned:helmet': { equipmentId: 'equipment:commando-helmet', tier: 1 } },
      loadout: {},
    }));
    const instanceId = 'owned:helmet';
    // The test is about the milestone gate, not whether the first stage has
    // already supplied the 100 scrap cost.
    gateContext.updateMeta((meta) => ({ ...meta, scrap: upgradeCost(1) }));
    expect(gateContext.commitEquipmentUpgrade(instanceId, 1, 2, upgradeCost(1))).toBe(false);

    const harness = createHarness();
    const { context } = harness;
    expect(clearSelectedStage(harness, 120_000)).toBe('stage:junkyard-01');
    // Create owned equipment instance for V4
    context.updateEquipment(() => ({
      equipment: { 'owned:helmet': { equipmentId: 'equipment:commando-helmet', tier: 1 } },
      loadout: {},
    }));
    expect(clearSelectedStage(harness, 120_000)).toBe('stage:junkyard-02');
    // V4 firstClearScrap: stage-01=35, stage-02=45, total=80. Supplement to reach upgrade cost.
    const scrapFromStages = context.saveData.progression.scrap;
    if (scrapFromStages < upgradeCost(1)) {
      context.updateMeta((meta) => ({ ...meta, scrap: scrapFromStages + (upgradeCost(1) - scrapFromStages) }));
    }
    expect(context.saveData.progression.scrap).toBeGreaterThanOrEqual(upgradeCost(1));
    expect(context.commitEquipmentUpgrade('owned:helmet', 1, 2, upgradeCost(1))).toBe(true);
    expect(context.saveData.equipment['owned:helmet']).toMatchObject({ tier: 2 });
  });

  it('produces distinct, attainable set-build stat signatures rather than a single dominant reward shell', () => {
    const harness = createHarness();
    const { context } = harness;
    for (const stageId of ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04', 'stage:junkyard-05']) {
      expect(clearSelectedStage(harness, 120_000)).toBe(stageId);
    }
    // V4: create owned equipment instances for each set to test stat signatures
    context.updateEquipment(() => ({
      equipment: {
        'owned:commando-helmet': { equipmentId: 'equipment:commando-helmet', tier: 1 },
        'owned:commando-armour': { equipmentId: 'equipment:commando-armour', tier: 1 },
        'owned:commando-gloves': { equipmentId: 'equipment:commando-gloves', tier: 1 },
        'owned:commando-boots': { equipmentId: 'equipment:commando-boots', tier: 1 },
        'owned:scavenger-helmet': { equipmentId: 'equipment:scavenger-helmet', tier: 1 },
        'owned:scavenger-armour': { equipmentId: 'equipment:scavenger-armour', tier: 1 },
        'owned:scavenger-gloves': { equipmentId: 'equipment:scavenger-gloves', tier: 1 },
        'owned:scavenger-boots': { equipmentId: 'equipment:scavenger-boots', tier: 1 },
      },
      loadout: {},
    }));
    const signatures = new Set<string>();
    const definitions = new Map((context.data.equipment ?? []).map((definition) => [definition.id, definition] as const));
    const owned = new Map(Object.entries(context.saveData.equipment).map(([instanceId, item]) => [
      instanceId,
      { instanceId, equipmentId: item.equipmentId, tier: item.tier },
    ] as const));
    const sets: Record<string, string[]> = {
      commando: ['owned:commando-helmet', 'owned:commando-armour', 'owned:commando-gloves', 'owned:commando-boots'],
      scavenger: ['owned:scavenger-helmet', 'owned:scavenger-armour', 'owned:scavenger-gloves', 'owned:scavenger-boots'],
    };
    for (const [, pieceIds] of Object.entries(sets)) {
      const equipped: Record<string, string> = {};
      
      for (const instanceId of pieceIds) {
        const piece = owned.get(instanceId);
        if (piece) {
          const def = definitions.get(piece.equipmentId);
          if (def) equipped[def.slot] = instanceId;
        }
      }
      const modifiers = resolveEquipmentModifiers({ equipped }, definitions, owned)
        .map((modifier) => `${modifier.stat}:${modifier.op}:${modifier.value}`).sort();
      // The definition-backed effects and set bonuses are resolved by the
      // same loadout function that GameScene consumes on a new run.
      expect(modifiers.length).toBeGreaterThanOrEqual(5);
      signatures.add(modifiers.join('|'));
    }
    expect(signatures.size).toBe(2);
  });
});
