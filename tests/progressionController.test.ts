import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { ProgressionController } from '../src/ui/progressionController';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

describe('headless ProgressionController', () => {
  it('reports registry-order balances, levels, costs, and failure reasons', () => {
    const { context, controller } = setup();
    const snapshot = controller.snapshot();
    expect(snapshot.scrap).toBe(0);
    expect(snapshot.upgrades.map((item) => item.id)).toEqual(context.metaUpgrades.all().map((item) => item.id));
    expect(snapshot.upgrades[0]).toMatchObject({ currentLevel: 0, maxLevel: 5, nextCost: 10, canPurchase: false });
    expect(controller.purchase('missing')).toMatchObject({ ok: false, reason: 'unknown-upgrade' });
    expect(controller.purchase('reinforced-vest')).toMatchObject({ ok: false, reason: 'insufficient-scrap' });
    context.updateMeta((meta) => ({ ...meta, scrap: 999, permanentUpgrades: { 'reinforced-vest': 5 } }));
    expect(controller.purchase('reinforced-vest')).toMatchObject({ ok: false, reason: 'max-level' });
  });

  it('purchases successfully, reports persistence, and requires confirmation to reset', () => {
    const { context, controller } = setup();
    context.updateMeta((meta) => ({ ...meta, scrap: 100 }));
    expect(controller.purchase('reinforced-vest')).toMatchObject({
      ok: true, cost: 10, newLevel: 1, persisted: true,
      meta: { scrap: 90, permanentUpgrades: { 'reinforced-vest': 1 } },
    });
    const before = context.saveData.meta;
    expect(controller.reset(false)).toEqual({ ok: false, meta: before, reason: 'confirmation-required' });
    expect(context.saveData.meta).toBe(before);
    expect(controller.reset(true)).toMatchObject({ ok: true, persisted: true, meta: { scrap: 0 } });
  });
});

export function setup() {
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data, metaUpgrades,
    save: new SaveManager(new MemoryStorageAdapter(), 'controller', metaUpgrades.maxLevels()),
  });
  return { context, controller: new ProgressionController(context) };
}
