import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { assembleComposedRunRequest } from '../src/gameplay/runRequest';
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
      expect(context.completeStage(stageId, 180_000)).toBe(true);
      balances.push(context.saveData.progression.scrap);
      expect(context.saveData.appliedGrantTransactions[`${stageId}:first-clear`]).toBe(true);
    }

    expect(balances).toEqual([...balances].sort((a, b) => a - b));
    expect(balances.at(-1)).toBeGreaterThanOrEqual(700);
    const beforeReplay = context.saveData.progression.scrap;
    expect(context.completeStage(expected[0], 1_800_000)).toBe(true);
    expect(context.saveData.progression.scrap).toBe(beforeReplay);
  });

  it('has no early equipment dead end: the first tier upgrade unlocks after its stage gate and is affordable at stage two', () => {
    const { context } = createHarness();
    expect(context.completeStage('stage:junkyard-01', 120_000)).toBe(true);
    const instanceId = 'reward:stage-01-commando-helmet';
    expect(context.commitEquipmentUpgrade(instanceId, 1, 2, upgradeCost(1))).toBe(false);

    expect(context.completeStage('stage:junkyard-02', 120_000)).toBe(true);
    expect(context.saveData.progression.scrap).toBeGreaterThanOrEqual(upgradeCost(1));
    expect(context.commitEquipmentUpgrade(instanceId, 1, 2, upgradeCost(1))).toBe(true);
    expect(context.saveData.equipment[instanceId]).toMatchObject({ tier: 2 });
  });

  it('produces distinct, attainable set-build stat signatures rather than a single dominant reward shell', () => {
    const { context } = createHarness();
    for (const stageId of ['stage:junkyard-01', 'stage:junkyard-02', 'stage:junkyard-03', 'stage:junkyard-04', 'stage:junkyard-05']) {
      expect(context.completeStage(stageId, 120_000)).toBe(true);
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
