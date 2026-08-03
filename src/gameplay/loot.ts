import type { LootEntry, LootTable } from '../systems/types';
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

/**
 * Weighted-selection core shared by resolveLoot, resolveKillLoot, and
 * DropSystem.collectChest. Callers pre-resolve the LootTable via
 * {@link LootTableLookup.lootTableById} so the table is never resolved twice.
 */
export function resolveLootFromTable(
  table: Readonly<LootTable>,
  rng: Pick<Rng, 'next'>,
): readonly LootGrant[] {
  const entries = table.entries;
  let totalWeight = 0;
  for (const entry of entries) {
    totalWeight += entry.weight;
  }
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new Error(`Loot table "${table.id}" has invalid total weight`);
  }

  let cursor = rng.next() * totalWeight;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) {
      return entryToGrants(entry);
    }
  }

  // Floating-point safety net: unreachable with validated catalogue data
  // (finite non-negative weights, totalWeight > 0). Prevents non-deterministic
  // selection if weights are pathologically large or suffer floating-point
  // rounding. The caller never sees this fallback in practice.
  const last = entries[entries.length - 1];
  return last ? entryToGrants(last) : [];
}

export function resolveLoot(
  tableId: string,
  lookup: LootTableLookup,
  rng: Pick<Rng, 'next'>,
): readonly LootGrant[] {
  const table = lookup.lootTableById(tableId);
  if (!table) {
    throw new Error(`Loot table "${tableId}" not found`);
  }
  return resolveLootFromTable(table, rng);
}

function entryToGrants(entry: Readonly<LootEntry>): readonly LootGrant[] {
  if (entry.kind === 'nothing') {
    return [];
  }

  if (entry.kind === 'chest') {
    // Catalogue validation guarantees every chest entry has a tableId;
    // this guard is unreachable with validated data but keeps the resolver
    // defensive against malformed LootEntry objects at runtime.
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
    const table = lookup.lootTableById(info.lootTableId);
    if (table !== undefined) {
      try {
        return resolveLootFromTable(table, rng);
      } catch (error) {
        // Fail soft at runtime, but never silently: unexpected resolver failures
        // leave a diagnostic trace before falling back to the guaranteed payout.
        console.warn(`[loot] Failed to resolve kill loot table "${info.lootTableId}":`, error);
      }
    }
  }
  return defaultLoot(info);
}
