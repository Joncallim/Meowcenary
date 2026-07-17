import type { ArenaDefinition, GameData } from './types';
import { validateArenaCatalog } from './validation';
import { defaultArenaId as resolveDefaultArenaId } from '../gameplay/arenaSelection';

export interface ArenaLookup {
  arenaById(id: string): Readonly<ArenaDefinition> | undefined;
}

export interface ArenaRegistry extends ArenaLookup {
  all(): readonly Readonly<ArenaDefinition>[];
  defaultArenaId(): string;
}

export class DataArenaRegistry implements ArenaRegistry {
  private readonly byId = new Map<string, Readonly<ArenaDefinition>>();
  private readonly snapshot: readonly Readonly<ArenaDefinition>[];

  constructor(data: Pick<GameData, 'arenas'>) {
    const validated = validateArenaCatalog(data.arenas);
    const canonical = validated.map((arena) => deepFreeze(structuredClone(arena)));

    for (const arena of canonical) {
      if (this.byId.has(arena.id)) {
        throw new Error(`Duplicate arena id "${arena.id}"`);
      }
      this.byId.set(arena.id, arena);
    }

    this.snapshot = Object.freeze([...canonical]);
  }

  arenaById(id: string): Readonly<ArenaDefinition> | undefined {
    return this.byId.get(id);
  }

  all(): readonly Readonly<ArenaDefinition>[] {
    return this.snapshot;
  }

  defaultArenaId(): string {
    return resolveDefaultArenaId(this);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}