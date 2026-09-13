import type { ArenaDefinition } from '../systems/types';
import type { ArenaLookup, ArenaRegistry } from '../systems/arenas';
import type { ProgressionStateV4 } from '../systems/save';
export function canSelectArena(
  arena: Readonly<ArenaDefinition>,
  meta: Readonly<ProgressionStateV4>,
): boolean {
  if (arena.unlock.type === 'default') return true;
  return meta.unlocks.includes(arena.unlock.requiresUnlockId);
}

export function selectableArenas(
  registry: ArenaLookup & Pick<ArenaRegistry, 'all'>,
  meta: Readonly<ProgressionStateV4>,
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