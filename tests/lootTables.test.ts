import { describe, expect, it } from 'vitest';
import { DataLootTableRegistry } from '../src/systems/lootTables';
import type { LootTable } from '../src/systems/types';

const chestStandard: LootTable = {
  id: 'chest-standard',
  entries: [
    { kind: 'xp', amount: 15, weight: 55 },
    { kind: 'scrap', amount: 10, weight: 35 },
    { kind: 'scrap', amount: 40, weight: 10 },
  ],
};

const bruteCache: LootTable = {
  id: 'brute-cache',
  entries: [
    { kind: 'xp', amount: 6, weight: 60 },
    { kind: 'scrap', amount: 5, weight: 30 },
    { kind: 'chest', amount: 0, weight: 10, tableId: 'chest-standard' },
  ],
};

describe('DataLootTableRegistry', () => {
  it('resolves tables by id', () => {
    const registry = new DataLootTableRegistry({ lootTables: [chestStandard, bruteCache] });
    expect(registry.lootTableById('chest-standard')?.id).toBe('chest-standard');
    expect(registry.lootTableById('brute-cache')?.id).toBe('brute-cache');
    expect(registry.lootTableById('missing')).toBeUndefined();
  });

  it('returns all tables', () => {
    const registry = new DataLootTableRegistry({ lootTables: [chestStandard, bruteCache] });
    const all = registry.all();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('chest-standard');
  });

  it('clones and recursively freezes canonical definitions and the snapshot', () => {
    const mutableTables = structuredClone([chestStandard, bruteCache]) as unknown as Array<{ name: string } & Record<string, unknown>>;
    const registry = new DataLootTableRegistry({ lootTables: mutableTables as unknown as LootTable[] });
    mutableTables[0].id = 'mutated-source';

    const lookup = registry.lootTableById('chest-standard');
    expect(lookup?.id).toBe('chest-standard');
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(registry.all())).toBe(true);
    expect(Reflect.set(lookup as object, 'id', 'mutated-lookup')).toBe(false);
    expect(() => (registry.all() as LootTable[]).push(chestStandard)).toThrow();
  });

  it('deeply freezes nested entries', () => {
    const registry = new DataLootTableRegistry({ lootTables: [chestStandard] });
    const table = registry.lootTableById('chest-standard');
    expect(table).toBeDefined();
    expect(Object.isFrozen(table?.entries)).toBe(true);
    expect(Object.isFrozen(table?.entries[0])).toBe(true);
  });

  it('rejects validatable data before constructing canonical state', () => {
    const bad = { ...chestStandard, id: '' };
    let registry: DataLootTableRegistry | undefined;
    expect(() => { registry = new DataLootTableRegistry({ lootTables: [bad] }); }).toThrow();
    expect(registry).toBeUndefined();
  });

  it('defensively rejects duplicate ids in the constructor', () => {
    expect(() => new DataLootTableRegistry({
      lootTables: [chestStandard, chestStandard],
    })).toThrow(/duplicate id/);
  });

  it('validates loot-tables.json loaded through loadGameData', async () => {
    const { loadGameData } = await import('../src/systems/validation');
    const data = loadGameData();
    const registry = new DataLootTableRegistry(data);
    expect(registry.lootTableById('chest-standard')).toBeDefined();
    expect(registry.lootTableById('brute-cache')).toBeDefined();
  });
});
