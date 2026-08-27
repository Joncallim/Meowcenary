import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { ProgressionController } from '../src/ui/progressionController';

const key = 'future-version-protection';
// Version 4 is unsupported (current is 3) — write-protection must trigger.
const futurePayload = JSON.stringify({ version: 4, settings: { muted: true }, meta: { scrap: 99 } });

class CountingStorage extends MemoryStorageAdapter {
  setCalls = 0;
  override setItem(itemKey: string, value: string): boolean {
    this.setCalls += 1;
    return super.setItem(itemKey, value);
  }
}

function setup() {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const storage = new CountingStorage();
  storage.setItem(key, futurePayload);
  storage.setCalls = 0;
  const characters = new DataCharacterRegistry(data);
  const bus = createEventBus();
  const context = createGameContext({
    bus, menuRng: createRng(1), data, arenas, metaUpgrades, characters,
    save: new SaveManager(storage, key, metaUpgrades.maxLevels()),
  });
  return { context, controller: new ProgressionController(context), bus, storage };
}

function expectUntouchedStorage(storage: CountingStorage): void {
  expect(storage.setCalls).toBe(0);
  expect(storage.getItem(key)).toBe(futurePayload);
}

describe('future-version write protection across every public mutation path', () => {
  it('blocks GameContext.updateSettings', () => {
    const { context, storage } = setup();
    const result = context.updateSettings({ muted: false });
    expect(result.persisted).toBe(false);
    expect(result.value.muted).toBe(false);
    expectUntouchedStorage(storage);
  });

  it('blocks GameContext.updateMeta', () => {
    const { context, storage } = setup();
    const result = context.updateMeta((meta) => ({ ...meta, scrap: 42 }));
    expect(result.persisted).toBe(false);
    expect(result.value.scrap).toBe(42);
    expectUntouchedStorage(storage);
  });

  it('blocks GameContext.resetProgression', () => {
    const { context, storage } = setup();
    context.updateMeta((meta) => ({ ...meta, scrap: 7 }));
    const result = context.resetProgression();
    expect(result.persisted).toBe(false);
    expect(result.value.scrap).toBe(0);
    expectUntouchedStorage(storage);
  });

  it('blocks ProgressionController.purchase', () => {
    const { context, controller, storage } = setup();
    context.updateMeta((meta) => ({ ...meta, scrap: 999 }));
    const result = controller.purchase('reinforced-vest');
    expect(result).toMatchObject({ ok: true, persisted: false, newLevel: 1 });
    expectUntouchedStorage(storage);
  });

  it('blocks terminal reward banking', () => {
    const { context, bus, storage } = setup();
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = 'won';
    run.currency = 25;
    const banked = new ProgressionSystem({ runState: run, bus, context }).bankFinishedRun();
    expect(banked).toMatchObject({ persisted: false });
    expect(banked?.meta.scrap).toBe(25);
    expectUntouchedStorage(storage);
  });
});
