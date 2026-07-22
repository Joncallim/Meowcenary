import type { GameData, LootTable } from './types';
import { validateLootTableCatalog } from './validation';

export interface LootTableLookup {
  lootTableById(id: string): Readonly<LootTable> | undefined;
}

export interface LootTableRegistry extends LootTableLookup {
  all(): readonly Readonly<LootTable>[];
}

export class DataLootTableRegistry implements LootTableRegistry {
  private readonly byId = new Map<string, Readonly<LootTable>>();
  private readonly snapshot: readonly Readonly<LootTable>[];

  constructor(data: Pick<GameData, 'lootTables'>) {
    const validated = validateLootTableCatalog(data.lootTables);
    const canonical = validated.map((table) => deepFreeze(structuredClone(table)));

    for (const table of canonical) {
      if (this.byId.has(table.id)) {
        throw new Error(`Duplicate loot table id "${table.id}"`);
      }
      this.byId.set(table.id, table);
    }

    this.snapshot = Object.freeze([...canonical]);
  }

  lootTableById(id: string): Readonly<LootTable> | undefined {
    return this.byId.get(id);
  }

  all(): readonly Readonly<LootTable>[] {
    return this.snapshot;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
