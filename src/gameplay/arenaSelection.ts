import type { ArenaDefinition } from '../systems/types';
import type { ArenaLookup, ArenaRegistry } from '../systems/arenas';
import type { MetaState } from '../systems/save';
import { isUnlocked } from './meta';

export function canSelectArena(
  arena: Readonly<ArenaDefinition>,
  meta: Readonly<MetaState>,
): boolean {
  if (arena.unlock.type === 'default') return true;
  return isUnlocked(meta, arena.unlock.requiresUnlockId);
}

export function selectableArenas(
  registry: ArenaLookup & Pick<ArenaRegistry, 'all'>,
  meta: Readonly<MetaState>,
): readonly Readonly<ArenaDefinition>[] {
  return registry.all().filter((arena) => canSelectArena(arena, meta));
}

export function defaultArenaId(registry: Pick<ArenaRegistry, 'all'>): string {
  const arena = registry.all().find((arena) => arena.unlock.type === 'default');
  if (!arena) {
    throw new Error('Arena catalog has no default arena');
  }
  return arena.id;
}