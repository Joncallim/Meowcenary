import { describe, expect, it, vi } from 'vitest';
import { resolveLoot, defaultLoot, resolveKillLoot } from '../src/gameplay/loot';
import type { LootSourceInfo } from '../src/gameplay/loot';
import type { LootTable } from '../src/systems/types';
import type { LootTableLookup } from '../src/systems/lootTables';
import { createRng } from '../src/engine/rng';

const xpTable: LootTable = {
  id: 'xp-only',
  entries: [{ kind: 'xp', amount: 12, weight: 1 }],
};

const scrapTable: LootTable = {
  id: 'scrap-only',
  entries: [{ kind: 'scrap', amount: 7, weight: 1 }],
};

const nothingTable: LootTable = {
  id: 'nothing-only',
  entries: [{ kind: 'nothing', amount: 0, weight: 1 }],
};

const chestTable: LootTable = {
  id: 'chest-only',
  entries: [{ kind: 'chest', amount: 0, weight: 1, tableId: 'inner-table' }],
};

const mixedTable: LootTable = {
  id: 'mixed',
  entries: [
    { kind: 'xp', amount: 5, weight: 1 },
    { kind: 'scrap', amount: 8, weight: 2 },
    { kind: 'nothing', amount: 0, weight: 3 },
  ],
};

function lookupOf(...tables: LootTable[]): LootTableLookup {
  const byId = new Map(tables.map((table) => [table.id, table]));
  return {
    lootTableById(id: string) {
      return byId.get(id);
    },
  };
}

describe('resolveLoot', () => {
  it('returns a single xp grant with the entry face amount', () => {
    const grants = resolveLoot('xp-only', lookupOf(xpTable), createRng(1));
    expect(grants).toEqual([{ kind: 'xp', amount: 12 }]);
  });

  it('returns a single scrap grant with the entry face amount', () => {
    const grants = resolveLoot('scrap-only', lookupOf(scrapTable), createRng(1));
    expect(grants).toEqual([{ kind: 'scrap', amount: 7 }]);
  });

  it('returns an empty array for nothing and a chest grant for a chest entry', () => {
    expect(resolveLoot('nothing-only', lookupOf(nothingTable), createRng(1))).toEqual([]);
    expect(resolveLoot('chest-only', lookupOf(chestTable), createRng(1))).toEqual([
      { kind: 'chest', amount: 0, tableId: 'inner-table' },
    ]);
  });

  it('consumes rng.next() exactly once and uses the weighted algorithm', () => {
    const next = vi.fn(() => 0.5);
    const grants = resolveLoot('mixed', lookupOf(mixedTable), { next });
    // total = 6, cursor = 3.0 -> after xp (1) -> 2.0, after scrap (2) -> 0.0,
    // after nothing (3) -> -3.0 selects the nothing entry.
    expect(next).toHaveBeenCalledOnce();
    expect(grants).toEqual([]);
  });

  it('is deterministic under the same seeded RNG', () => {
    const first = resolveLoot('mixed', lookupOf(mixedTable), createRng(2024));
    const second = resolveLoot('mixed', lookupOf(mixedTable), createRng(2024));
    expect(first).toEqual(second);
  });

  it('does not mutate the input table or lookup', () => {
    const mutableEntries = structuredClone(mixedTable.entries);
    const table: LootTable = { id: 'mixed', entries: mutableEntries };
    const lookup = lookupOf(table);
    resolveLoot('mixed', lookup, createRng(1));
    expect(table.entries).toEqual(mixedTable.entries);
    expect(mutableEntries).toEqual(mixedTable.entries);
  });
});

describe('defaultLoot', () => {
  it('returns an xp grant when xpValue is positive', () => {
    const info: LootSourceInfo = { xpValue: 10, scrapValue: 0 };
    expect(defaultLoot(info)).toEqual([{ kind: 'xp', amount: 10 }]);
  });

  it('returns a scrap grant when scrapValue is positive', () => {
    const info: LootSourceInfo = { xpValue: 0, scrapValue: 3 };
    expect(defaultLoot(info)).toEqual([{ kind: 'scrap', amount: 3 }]);
  });

  it('returns xp then scrap when both values are positive', () => {
    const info: LootSourceInfo = { xpValue: 5, scrapValue: 2 };
    expect(defaultLoot(info)).toEqual([
      { kind: 'xp', amount: 5 },
      { kind: 'scrap', amount: 2 },
    ]);
  });

  it('returns an empty array when both values are zero', () => {
    const info: LootSourceInfo = { xpValue: 0, scrapValue: 0 };
    expect(defaultLoot(info)).toEqual([]);
  });
});

describe('resolveKillLoot', () => {
  it('uses the table path when lootTableId is set and the table resolves', () => {
    const info: LootSourceInfo = { xpValue: 1, scrapValue: 2, lootTableId: 'xp-only' };
    const grants = resolveKillLoot(info, lookupOf(xpTable), createRng(1));
    expect(grants).toEqual([{ kind: 'xp', amount: 12 }]);
  });

  it('falls back to defaultLoot when no lootTableId is provided or the table is missing', () => {
    const infoNoTable: LootSourceInfo = { xpValue: 4, scrapValue: 6 };
    expect(resolveKillLoot(infoNoTable, lookupOf(), createRng(1))).toEqual([
      { kind: 'xp', amount: 4 },
      { kind: 'scrap', amount: 6 },
    ]);

    const infoMissing: LootSourceInfo = { xpValue: 4, scrapValue: 6, lootTableId: 'missing' };
    expect(resolveKillLoot(infoMissing, lookupOf(), createRng(1))).toEqual([
      { kind: 'xp', amount: 4 },
      { kind: 'scrap', amount: 6 },
    ]);
  });

  it('never throws, even when the lookup fails and values are zero', () => {
    const info: LootSourceInfo = { xpValue: 0, scrapValue: 0, lootTableId: 'missing' };
    expect(() => resolveKillLoot(info, lookupOf(), createRng(1))).not.toThrow();
    expect(resolveKillLoot(info, lookupOf(), createRng(1))).toEqual([]);
  });
});
