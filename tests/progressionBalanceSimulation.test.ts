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
function createHarness() {
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const stages = new StageRegistry(data);
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(17), data, metaUpgrades, stages,
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'progression-balance', metaUpgrades.maxLevels()),
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
    const expected = stages.allStages().map((stage) => stage.id);
    const balances: number[] = [];

    for (const [index, stageId] of expected.entries()) {
      const request = assembleComposedRunRequest(context, createRng(index + 1));
      expect(request).toMatchObject({ kind: 'stage', stageId });
      // Three minutes is the declared reward ceiling. A later clear has the
      // same reward, so waiting on a completed objective cannot farm scrap.
      expect(clearSelectedStage({ context, stages }, 180_000)).toBe(stageId);
      balances.push(context.saveData.progression.scrap);
      expect(context.saveData.appliedGrantTransactions[`${stageId}:first-clear`]).toBe(true);
    }

    expect(balances).toEqual([...balances].sort((a, b) => a - b));
    expect(balances.at(-1)).toBeGreaterThanOrEqual(700);
    const beforeReplay = context.saveData.progression.scrap;
    expect(context.selectStage(expected[0], context.stageSelectionRevision)).toMatchObject({ ok: true });
    expect(clearSelectedStage({ context, stages }, 1_800_000)).toBe(expected[0]);
    expect(context.saveData.progression.scrap).toBe(beforeReplay);
  });

  it('has no early equipment dead end: the first tier upgrade unlocks after its stage gate and is affordable at stage two', () => {
    const harness = createHarness();
    const { context } = harness;
    expect(clearSelectedStage(harness, 120_000)).toBe('stage:junkyard-01');
    const instanceId = 'reward:stage-01-commando-helmet';
    expect(context.commitEquipmentUpgrade(instanceId, 1, 2, upgradeCost(1))).toBe(false);

    expect(clearSelectedStage(harness, 120_000)).toBe('stage:junkyard-02');
    expect(context.saveData.progression.scrap).toBeGreaterThanOrEqual(upgradeCost(1));
    expect(context.commitEquipmentUpgrade(instanceId, 1, 2, upgradeCost(1))).toBe(true);
    expect(context.saveData.equipment[instanceId]).toMatchObject({ tier: 2 });
  });

  it('produces distinct, attainable set-build stat signatures rather than a single dominant reward shell', () => {
    const harness = createHarness();
    const { context } = harness;
    for (const stageId of ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04', 'stage:junkyard-05']) {
      expect(clearSelectedStage(harness, 120_000)).toBe(stageId);
    }
    const signatures = new Set<string>();
    const definitions = new Map((context.data.equipment ?? []).map((definition) => [definition.id, definition] as const));
    const owned = new Map(Object.entries(context.saveData.equipment).map(([instanceId, item]) => [
      instanceId,
      { instanceId, equipmentId: item.equipmentId, tier: item.tier },
    ] as const));
    const rewardStage: Record<string, string> = { commando: '01', scavenger: '02', demolition: '03', pyro: '04', recon: '05' };
    for (const prefix of Object.keys(rewardStage)) {
      const equipped = Object.fromEntries(['helmet', 'armour', 'gloves', 'boots'].map((slot) => [slot, `reward:stage-${rewardStage[prefix]}-${prefix}-${slot}`]));
      const modifiers = resolveEquipmentModifiers({ equipped }, definitions, owned)
        .map((modifier) => `${modifier.stat}:${modifier.op}:${modifier.value}`).sort();
      // The definition-backed effects and set bonuses are resolved by the
      // same loadout function that GameScene consumes on a new run.
      expect(modifiers.length).toBeGreaterThanOrEqual(5);
      signatures.add(modifiers.join('|'));
    }
    expect(signatures.size).toBe(5);
  });
});
