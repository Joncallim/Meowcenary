import type { LootEntry } from '../systems/types';
import type { LootTableLookup } from '../systems/lootTables';
import type { Rng } from '../engine/rng';

export interface LootSourceInfo {
  readonly xpValue: number;
  readonly scrapValue: number;
  readonly lootTableId?: string;
}

export type LootGrant =
  | { readonly kind: 'xp' | 'scrap'; readonly amount: number }
  | { readonly kind: 'chest'; readonly amount: 0; readonly tableId: string };

export function resolveLoot(
  tableId: string,
  lookup: LootTableLookup,
  rng: Pick<Rng, 'next'>,
): readonly LootGrant[] {
  const table = lookup.lootTableById(tableId);
  if (!table) {
    throw new Error(`Loot table "${tableId}" not found`);
  }

  const entries = table.entries;
  let totalWeight = 0;
  for (const entry of entries) {
    totalWeight += entry.weight;
  }
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new Error(`Loot table "${tableId}" has invalid total weight`);
  }

  let cursor = rng.next() * totalWeight;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) {
      return entryToGrants(entry);
    }
  }

  // Floating-point edge guard: the loop should always terminate for a valid
  // table, but if it does not, return the final entry so the call never throws.
  const last = entries[entries.length - 1];
  return last ? entryToGrants(last) : [];
}

function entryToGrants(entry: Readonly<LootEntry>): readonly LootGrant[] {
  if (entry.kind === 'nothing') {
    return [];
  }

  if (entry.kind === 'chest') {
    if (entry.tableId === undefined) {
      throw new Error('Chest loot entry is missing a tableId');
    }

    return [
      {
        kind: 'chest',
        amount: 0,
        tableId: entry.tableId,
      },
    ];
  }

  return [
    {
      kind: entry.kind,
      amount: entry.amount,
    },
  ];
}

export function defaultLoot(info: LootSourceInfo): readonly LootGrant[] {
  const grants: LootGrant[] = [];
  if (info.xpValue > 0) {
    grants.push({ kind: 'xp', amount: info.xpValue });
  }
  if (info.scrapValue > 0) {
    grants.push({ kind: 'scrap', amount: info.scrapValue });
  }
  return grants;
}

export function resolveKillLoot(
  info: LootSourceInfo,
  lookup: LootTableLookup,
  rng: Pick<Rng, 'next'>,
): readonly LootGrant[] {
  if (info.lootTableId) {
    try {
      return resolveLoot(info.lootTableId, lookup, rng);
    } catch {
      // Soft-fail back to the guaranteed default payout for this kill.
    }
  }
  return defaultLoot(info);
}
