import { describe, expect, it } from 'vitest';
import { canSelectArena, selectableArenas, defaultArenaId } from '../src/gameplay/arenaSelection';
import { DataArenaRegistry } from '../src/systems/arenas';
import type { ArenaDefinition } from '../src/systems/types';
import type { MetaState } from '../src/systems/save';
import { createDefaultMeta } from '../src/systems/save';

function makeMeta(unlocks: string[] = []): MetaState {
  return { ...createDefaultMeta(), unlocks };
}

const defaultArena: ArenaDefinition = {
  id: 'junkyard-lot',
  name: 'Junkyard Lot',
  size: { width: 390, height: 844 },
  spawnCurveId: 'test-curve',
  spawnRegions: [{ kind: 'edges', margin: 28 }],
  obstacles: [],
  hazards: [],
  unlock: { type: 'default' },
};

const lockedArena: ArenaDefinition = {
  id: 'warehouse',
  name: 'Warehouse',
  size: { width: 800, height: 600 },
  spawnCurveId: 'test-curve',
  spawnRegions: [{ kind: 'edges', margin: 28 }],
  obstacles: [],
  hazards: [],
  unlock: { type: 'meta', requiresUnlockId: 'arena:warehouse' },
};

describe('arena selection rules', () => {
  it('canSelectArena returns true for default arenas regardless of meta', () => {
    expect(canSelectArena(defaultArena, makeMeta())).toBe(true);
    expect(canSelectArena(defaultArena, makeMeta(['arena:warehouse']))).toBe(true);
  });

  it('canSelectArena for meta-gated arena requires the unlock id present in meta', () => {
    expect(canSelectArena(lockedArena, makeMeta())).toBe(false);
    expect(canSelectArena(lockedArena, makeMeta(['arena:warehouse']))).toBe(true);
    expect(canSelectArena(lockedArena, makeMeta(['other:unlock']))).toBe(false);
  });

  it('selectableArenas preserves registry order and excludes locked entries', () => {
    const registry = new DataArenaRegistry({ arenas: [defaultArena, lockedArena] });

    const withUnlock = selectableArenas(registry, makeMeta(['arena:warehouse']));
    expect(withUnlock).toHaveLength(2);
    expect(withUnlock[0].id).toBe('junkyard-lot');
    expect(withUnlock[1].id).toBe('warehouse');

    const withoutUnlock = selectableArenas(registry, makeMeta());
    expect(withoutUnlock).toHaveLength(1);
    expect(withoutUnlock[0].id).toBe('junkyard-lot');
  });

  it('defaultArenaId returns the JSON-first default', () => {
    const registry = new DataArenaRegistry({ arenas: [defaultArena, lockedArena] });
    expect(defaultArenaId(registry)).toBe('junkyard-lot');
  });

  it('DataArenaRegistry.defaultArenaId and arenaSelection.defaultArenaId return the same value', () => {
    const registry = new DataArenaRegistry({ arenas: [defaultArena, lockedArena] });
    expect(registry.defaultArenaId()).toBe(defaultArenaId(registry));
  });

  it('a stale arena unlock id that names no current arena changes no selection outcome', () => {
    const registry = new DataArenaRegistry({ arenas: [defaultArena, lockedArena] });
    const meta = makeMeta(['arena:missing']);
    expect(selectableArenas(registry, meta)).toHaveLength(1);
    expect(selectableArenas(registry, meta)[0].id).toBe('junkyard-lot');
  });

  it('defaultArenaId throws when no default arena exists', () => {
    const minimal = { all: () => [lockedArena] as readonly ArenaDefinition[] };
    expect(() => defaultArenaId(minimal)).toThrow(/no default arena/);
  });
});