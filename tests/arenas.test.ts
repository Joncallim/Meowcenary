import { describe, expect, it } from 'vitest';
import { DataArenaRegistry } from '../src/systems/arenas';
import type { ArenaDefinition } from '../src/systems/types';

const junkyardLot: ArenaDefinition = {
  id: 'junkyard-lot',
  name: 'Junkyard Lot',
  size: { width: 390, height: 844 },
  spawnCurveId: 'junkyard-intro',
  spawnRegions: [{ kind: 'edges', margin: 28 }],
  obstacles: [],
  hazards: [],
  unlock: { type: 'default' },
};

const lockedArena: ArenaDefinition = {
  id: 'warehouse',
  name: 'Warehouse',
  size: { width: 800, height: 600 },
  spawnCurveId: 'junkyard-intro',
  spawnRegions: [{ kind: 'edges', margin: 28 }],
  obstacles: [],
  hazards: [],
  unlock: { type: 'meta', requiresUnlockId: 'arena:warehouse' },
};

describe('DataArenaRegistry', () => {
  it('resolves arenas by id', () => {
    const registry = new DataArenaRegistry({ arenas: [junkyardLot, lockedArena] });
    expect(registry.arenaById('junkyard-lot')?.name).toBe('Junkyard Lot');
    expect(registry.arenaById('warehouse')?.name).toBe('Warehouse');
    expect(registry.arenaById('missing')).toBeUndefined();
  });

  it('returns all arenas', () => {
    const registry = new DataArenaRegistry({ arenas: [junkyardLot, lockedArena] });
    const all = registry.all();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('junkyard-lot');
  });

  it('returns the default arena id (JSON-order-first default)', () => {
    const registry = new DataArenaRegistry({ arenas: [junkyardLot, lockedArena] });
    expect(registry.defaultArenaId()).toBe('junkyard-lot');
  });

  it('throws when there is no default arena', () => {
    expect(() => new DataArenaRegistry({
      arenas: [lockedArena, { ...lockedArena, id: 'warehouse-2' }],
    })).toThrow(/at least one arena must have unlock\.type "default"/);
  });

  it('clones and recursively freezes canonical definitions and the snapshot', () => {
    const mutableArenas = structuredClone([junkyardLot, lockedArena]) as unknown as Array<{ name: string } & Record<string, unknown>>;
    const registry = new DataArenaRegistry({ arenas: mutableArenas as unknown as ArenaDefinition[] });
    mutableArenas[0].name = 'Mutated source';

    const lookup = registry.arenaById('junkyard-lot');
    expect(lookup?.name).toBe('Junkyard Lot');
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(Object.isFrozen(registry.all())).toBe(true);
    expect(Reflect.set(lookup as object, 'name', 'Mutated lookup')).toBe(false);
    expect(() => (registry.all() as ArenaDefinition[]).push(junkyardLot)).toThrow();
  });

  it('deeply freezes nested objects', () => {
    const registry = new DataArenaRegistry({ arenas: [junkyardLot] });
    const arena = registry.arenaById('junkyard-lot');
    expect(arena).toBeDefined();
    expect(Object.isFrozen(arena?.size)).toBe(true);
    expect(Object.isFrozen(arena?.spawnRegions)).toBe(true);
    expect(Object.isFrozen(arena?.spawnRegions[0])).toBe(true);
  });

  it('rejects validatable data before constructing canonical state', () => {
    const bad = { ...junkyardLot, id: '' };
    let registry: DataArenaRegistry | undefined;
    expect(() => { registry = new DataArenaRegistry({ arenas: [bad] }); }).toThrow();
    expect(registry).toBeUndefined();
  });

  it('defensively rejects duplicate ids in the constructor', () => {
    expect(() => new DataArenaRegistry({
      arenas: [junkyardLot, junkyardLot],
    })).toThrow(/duplicate id/);
  });

  it('freezes the all() snapshot and prevents mutation', () => {
    const registry = new DataArenaRegistry({ arenas: [junkyardLot] });
    const all = registry.all();
    expect(Object.isFrozen(all)).toBe(true);
  });

  it('validates arenas.json loaded through loadGameData', async () => {
    const { loadGameData } = await import('../src/systems/validation');
    const data = loadGameData();
    const registry = new DataArenaRegistry(data);
    expect(registry.arenaById('junkyard-lot')).toBeDefined();
    expect(registry.defaultArenaId()).toBe('junkyard-lot');
  });
});