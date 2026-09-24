import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

const key = 'future-version-protection';
// Version 5 is unsupported (current is 4) — write-protection must trigger.
const futurePayload = JSON.stringify({ version: 5, settings: { muted: true }, progression: { scrap: 99 } });

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
  const storage = new CountingStorage();
  storage.setItem(key, futurePayload);
  storage.setCalls = 0;
  const characters = new DataCharacterRegistry(data);
  const bus = createEventBus();
  const context = createGameContext({
    bus, menuRng: createRng(1), data, arenas, characters,
    save: new SaveManager(storage, key),
  });
  return { context, bus, storage };
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
    expect(result.value.scrap).toBe(7);
    expectUntouchedStorage(storage);
  });

  it('blocks terminal settlement', () => {
    const { context, storage } = setup();
    const settled = context.settleRunTerminal({
      terminalStatus: 'win', runScrap: 25, characterId: 'scrap-tabby', runDurationMs: 10_000,
      stageId: 'stage:junkyard-01',
    });
    expect(settled).toMatchObject({ ok: false, terminalApplied: false });
    expect(context.saveData.progression.scrap).toBe(0);
    expectUntouchedStorage(storage);
  });
});
