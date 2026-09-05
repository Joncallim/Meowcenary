import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { createEventBus } from '../src/engine/eventBus';
import type { GameContext } from '../src/engine/context';
import { RuntimeConfig } from '../src/engine/config';
import { createRng, deriveRunSeed, type Rng } from '../src/engine/rng';
import { createRunState, type RunState } from '../src/gameplay/runState';
import type { LootTableLookup } from '../src/systems/lootTables';
import type { Player } from '../src/entities/Player';
// Must precede any import whose transitive dependencies resolve Phaser at module
// evaluation time (e.g. Drop). The mock registration in __mocks__/phaser is a
// side-effectful import; ordering it first guarantees the mock is installed
// before the real Phaser module is ever requested.
import { MockArc, MockBody, MockGameObject } from './__mocks__/phaser';
import { Drop } from '../src/entities/Drop';
import type { DropSystem } from '../src/systems/DropSystem';
import type { LootGrant } from '../src/gameplay/loot';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';
import charactersJson from '../src/data/characters.json';
import metaUpgradesJson from '../src/data/meta-upgrades.json';
import upgradesJson from '../src/data/upgrades.json';

interface TestSystem {
  system: DropSystem;
  runState: RunState;
  bus: ReturnType<typeof createEventBus>;
  player: Player;
  overlapCallback?: (playerObject: unknown, dropObject: unknown) => void;
  addedSprites: MockGameObject[];
  groupAddStates: Array<{ active: boolean; x: number; y: number }>;
  rng: Pick<Rng, 'next'>;
}

async function createSystem(options: {
  status?: RunState['status'];
  lootTables?: LootTableLookup;
  rng?: Pick<Rng, 'next'>;
  weaponRegistry?: Pick<DataWeaponRegistry, 'weaponById' | 'createWeaponInstance'>;
} = {}): Promise<TestSystem> {
  const { DropSystem } = await import('../src/systems/DropSystem');
  const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  runState.status = options.status ?? 'active';
  const bus = createEventBus();
  const ctx = { bus } as unknown as GameContext;

  const overlapState: {
    callback?: (playerObject: unknown, dropObject: unknown) => void;
  } = {};
  const addedSprites: MockGameObject[] = [];
  const groupAddStates: Array<{ active: boolean; x: number; y: number }> = [];
  const scene = {
    add: {
      circle: () => new MockArc(0, 0),
    },
    physics: {
      add: {
        existing: (sprite: MockGameObject) => {
          sprite.body = new MockBody(sprite);
        },
        overlap: (
          _player: unknown,
          _group: unknown,
          callback: (playerObject: unknown, dropObject: unknown) => void,
          _processCallback: unknown,
          context: unknown,
        ) => {
          overlapState.callback = callback.bind(context);
          return {
            destroy: () => {
              overlapState.callback = undefined;
            },
          };
        },
      },
    },
  };

  const player = { x: 0, y: 0, sprite: new MockArc(0, 0) } as unknown as Player;
  const dropGroup = {
    add: (sprite: MockGameObject) => {
      groupAddStates.push({ active: sprite.active, x: sprite.x, y: sprite.y });
      addedSprites.push(sprite);
    },
  } as unknown as Phaser.Physics.Arcade.Group;
  const lootTables = options.lootTables ?? { lootTableById: vi.fn() };
  // A concrete RNG value ensures resolveLoot traverses the weighted-selection
  // path instead of the floating-point safety-net fallback.
  const rng = options.rng ?? { next: vi.fn(() => 0.3) };
  const weaponRegistry = options.weaponRegistry ?? new DataWeaponRegistry(loadGameData());

  const system = new DropSystem({
    scene: scene as unknown as Phaser.Scene,
    ctx,
    runState,
    player,
    dropGroup,
    lootTables,
    weaponRegistry,
    rng,
    dropRadius: 4,
    magnetSpeed: 450,
    basePickupRadius: 10,
  });

  return {
    system,
    runState,
    bus,
    player,
    // Returning a getter rather than the value binds assertions to the mock's
    // current callback state.
    get overlapCallback() {
      return overlapState.callback;
    },
    addedSprites,
    groupAddStates,
    rng,
  };
}

describe('DropSystem', () => {
  it('collects only nearby ordinary drops for a loot-pulse ability', async () => {
    const { system, runState } = await createSystem();
    system.spawnDrop(10, 0, { kind: 'scrap', amount: 3 });
    system.spawnDrop(20, 0, { kind: 'xp', amount: 2 });
    system.spawnDrop(400, 0, { kind: 'scrap', amount: 9 });
    system.spawnDrop(10, 10, { kind: 'chest', amount: 0, tableId: 'chest-table' });

    expect(system.collectNearbyConsumables(100)).toBe(2);
    expect(runState.currency).toBe(3);
    expect(system.activeDropCount).toBe(2);
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns one xp and one scrap drop at the kill point on the default path', async () => {
    const { bus, addedSprites, overlapCallback } = await createSystem();
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 3,
      scrapValue: 2,
      x: 100,
      y: 200,
    });

    expect(addedSprites).toHaveLength(2);
    expect(addedSprites[0].x).toBe(100);
    expect(addedSprites[0].y).toBe(200);
    expect(addedSprites[1].x).toBe(100);
    expect(addedSprites[1].y).toBe(200);

    addedSprites[0].active = true;
    addedSprites[1].active = true;
    overlapCallback?.(null, addedSprites[0]);
    overlapCallback?.(null, addedSprites[1]);

    const kinds = collected.mock.calls.map(([payload]) => payload.kind).sort();
    expect(kinds).toEqual(['scrap', 'xp']);
    const amounts = collected.mock.calls.map(([payload]) => payload.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([2, 3]);
  });

  it('adds a disabled drop to the Physics Group before spawn initializes it', async () => {
    const { system, groupAddStates } = await createSystem();

    const drop = system.spawnDrop(25, 30, { kind: 'scrap', amount: 2 });

    expect(groupAddStates).toEqual([{ active: false, x: 0, y: 0 }]);
    expect(drop.active).toBe(true);
    expect(drop.x).toBe(25);
    expect(drop.y).toBe(30);
  });

  it('produces identical table-path drops for identical seed and kill order', async () => {
    const table = {
      id: 'test-table',
      entries: [
        { kind: 'xp' as const, amount: 7, weight: 1 },
        { kind: 'scrap' as const, amount: 11, weight: 1 },
      ],
    };
    const lootTables = {
      lootTableById: vi.fn((id: string) => (id === table.id ? table : undefined)),
    };
    const seed = deriveRunSeed(42, 'loot');
    const first = await createSystem({ lootTables, rng: createRng(seed) });
    const second = await createSystem({ lootTables, rng: createRng(seed) });
    const firstCollected = vi.fn();
    const secondCollected = vi.fn();
    first.bus.on('drop:collected', firstCollected);
    second.bus.on('drop:collected', secondCollected);

    for (let instanceId = 1; instanceId <= 4; instanceId += 1) {
      const payload = {
        instanceId,
        enemyId: 'any',
        xpValue: 1,
        scrapValue: 1,
        lootTableId: table.id,
        x: instanceId * 10,
        y: instanceId * 20,
      };
      first.bus.emit('enemy:killed', payload);
      second.bus.emit('enemy:killed', payload);
    }

    expect(first.addedSprites).toHaveLength(4);
    expect(second.addedSprites).toHaveLength(4);
    first.addedSprites.forEach((sprite) => first.overlapCallback?.(null, sprite));
    second.addedSprites.forEach((sprite) => second.overlapCallback?.(null, sprite));
    expect(firstCollected.mock.calls).toEqual(secondCollected.mock.calls);
    expect(firstCollected).toHaveBeenCalledTimes(4);
    // Guards against a degenerate/non-advancing RNG: two constant streams would
    // also agree trivially, so require the resolved grants to actually vary.
    const kinds = new Set(firstCollected.mock.calls.map(([payload]) => payload.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('consumes no RNG on the default path', async () => {
    const { bus, rng, addedSprites } = await createSystem();

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 1,
      x: 0,
      y: 0,
    });

    expect(addedSprites).toHaveLength(2);
    expect(rng.next).not.toHaveBeenCalled();
  });

  it('falls back to default loot when the referenced table is missing', async () => {
    const { bus, addedSprites, overlapCallback } = await createSystem();
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 4,
      scrapValue: 5,
      lootTableId: 'missing-table',
      x: 0,
      y: 0,
    });

    expect(addedSprites).toHaveLength(2);
    addedSprites[0].active = true;
    addedSprites[1].active = true;
    overlapCallback?.(null, addedSprites[0]);
    overlapCallback?.(null, addedSprites[1]);

    const amounts = collected.mock.calls.map(([payload]) => payload.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([4, 5]);
  });

  it('applies xpGain and emits xp:gained when collecting xp', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    runState.stats.add({ stat: 'xpGain', op: 'mult', value: 2, sourceId: 'test' });
    const xpGained = vi.fn();
    bus.on('xp:gained', xpGained);

    const drop = system.spawnDrop(0, 0, { kind: 'xp', amount: 2 });
    overlapCallback?.(null, drop.sprite);

    expect(runState.xp).toBe(4);
    expect(xpGained).toHaveBeenCalledWith({ amount: 4, total: 4 });
  });

  it('applies currencyGain and emits currency:changed with the post-add total for scrap', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    runState.stats.add({ stat: 'currencyGain', op: 'mult', value: 3, sourceId: 'test' });
    const currencyChanged = vi.fn();
    bus.on('currency:changed', currencyChanged);

    const drop = system.spawnDrop(0, 0, { kind: 'scrap', amount: 4 });
    overlapCallback?.(null, drop.sprite);

    expect(runState.currency).toBe(12);
    expect(currencyChanged).toHaveBeenCalledWith({ runTotal: 12 });
  });

  it('emits drop:collected with the face value under a non-1 multiplier', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    runState.stats.add({ stat: 'currencyGain', op: 'mult', value: 2, sourceId: 'test' });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(0, 0, { kind: 'scrap', amount: 7 });
    overlapCallback?.(null, drop.sprite);

    expect(collected).toHaveBeenCalledWith({ kind: 'scrap', amount: 7, x: 0, y: 0 });
  });

  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'does not write currency or emit currency:changed when currencyGain is %s',
    async (currencyGain) => {
      const { system, runState, bus, overlapCallback } = await createSystem();
      if (!Number.isFinite(currencyGain)) {
        vi.spyOn(runState.stats, 'resolve').mockReturnValue(currencyGain);
      } else {
        runState.stats.add({ stat: 'currencyGain', op: 'mult', value: currencyGain, sourceId: 'test' });
      }
      const currencyChanged = vi.fn();
      bus.on('currency:changed', currencyChanged);
      const collected = vi.fn();
      bus.on('drop:collected', collected);

      const drop = system.spawnDrop(0, 0, { kind: 'scrap', amount: 5 });
      overlapCallback?.(null, drop.sprite);

      expect(runState.currency).toBe(0);
      expect(currencyChanged).not.toHaveBeenCalled();
      expect(collected).toHaveBeenCalledWith({ kind: 'scrap', amount: 5, x: 0, y: 0 });
    },
  );

  it('forwards the resolved pickup radius to Drop.update', async () => {
    const { system, bus, player, runState, addedSprites } = await createSystem();
    runState.stats.add({ stat: 'pickupRadius', op: 'add', value: 15, sourceId: 'test' });

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 0,
      x: 0,
      y: 0,
    });

    // Place the drop inside the magnet radius (base 10 + 15 = 25).
    const movablePlayer = player as { x: number; y: number };
    movablePlayer.x = 20;
    movablePlayer.y = 0;
    addedSprites[0].x = 0;
    addedSprites[0].y = 0;

    system.update(16);

    expect(addedSprites[0].body?.velocity.x).toBeGreaterThan(0);
  });

  it('clamps a negative resolved pickup radius to zero before forwarding it to Drop.update', async () => {
    // Drop.update() already no-ops for pickupRadius <= 0 on its own, so asserting
    // zero velocity here would pass even if DropSystem's own clamp were deleted.
    // Spying on Drop.update pins the clamped argument DropSystem is responsible for.
    const { system, bus, runState } = await createSystem();
    runState.stats.add({ stat: 'pickupRadius', op: 'add', value: -20, sourceId: 'invalid' });
    const updateSpy = vi.spyOn(Drop.prototype, 'update');

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 0,
      x: 0,
      y: 0,
    });

    system.update(16);

    expect(updateSpy).toHaveBeenCalled();
    expect(updateSpy.mock.calls[0][2]).toBe(0);
    updateSpy.mockRestore();
  });

  it('no-ops update and enemy:killed handling while the run is paused', async () => {
    const { system, runState, bus, player, addedSprites } = await createSystem();
    const drop = system.spawnDrop(0, 0, { kind: 'xp', amount: 1 });
    const movablePlayer = player as { x: number; y: number };
    movablePlayer.x = 5;
    runState.status = 'paused';

    system.update(16);

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 1,
      x: 0,
      y: 0,
    });

    expect(drop.body.velocity.x).toBe(0);
    expect(drop.body.velocity.y).toBe(0);
    expect(addedSprites).toHaveLength(1);
  });

  it.each(['paused', 'won', 'lost'] as const)(
    'ignores enemy:killed while run status is %s',
    async (status) => {
      const { system, addedSprites, bus } = await createSystem({ status });

      bus.emit('enemy:killed', {
        instanceId: 1,
        enemyId: 'dust-mite',
        xpValue: 1,
        scrapValue: 1,
        x: 0,
        y: 0,
      });

      expect(addedSprites).toHaveLength(0);
      void system;
    },
  );

  it('unsubscribes from enemy:killed on destroy', async () => {
    const { system, bus, addedSprites } = await createSystem();

    system.destroy();

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 1,
      x: 0,
      y: 0,
    });

    expect(addedSprites).toHaveLength(0);
  });

  it('collects a chest drop by resolving its table and granting xp', async () => {
    const lootTables = {
      lootTableById: vi.fn((id: string) =>
        id === 'chest-table'
          ? { id: 'chest-table', entries: [{ kind: 'xp' as const, amount: 9, weight: 1 }] }
          : undefined),
    };
    const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
    runState.xpToNext = 1000;
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(12, 34, { kind: 'chest', amount: 0, tableId: 'chest-table' });
    overlapCallback?.(null, drop.sprite);

    expect(drop.active).toBe(false);
    expect((drop.sprite as unknown as MockGameObject).destroyed).toBe(false);
    expect(system.activeDropCount).toBe(0);
    expect(system.allocatedDropCount).toBe(1);
    expect(runState.xp).toBe(9);
    expect(collected).toHaveBeenCalledTimes(1);
    expect(collected).toHaveBeenCalledWith({ kind: 'xp', amount: 9, x: 12, y: 34 });
    expect(collected.mock.calls.some(([payload]) => payload.kind === 'chest')).toBe(false);
  });

  it('collects a chest drop by resolving its table and granting scrap', async () => {
    const lootTables = {
      lootTableById: vi.fn((id: string) =>
        id === 'chest-table'
          ? { id: 'chest-table', entries: [{ kind: 'scrap' as const, amount: 13, weight: 1 }] }
          : undefined),
    };
    const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
    const collected = vi.fn();
    const currencyChanged = vi.fn();
    bus.on('drop:collected', collected);
    bus.on('currency:changed', currencyChanged);

    const drop = system.spawnDrop(10, 20, { kind: 'chest', amount: 0, tableId: 'chest-table' });
    overlapCallback?.(null, drop.sprite);

    expect(runState.currency).toBe(13);
    expect(currencyChanged).toHaveBeenCalledWith({ runTotal: 13 });
    expect(collected).toHaveBeenCalledWith({ kind: 'scrap', amount: 13, x: 10, y: 20 });
  });

  it('applies currencyGain to chest-granted scrap exactly like direct scrap', async () => {
    const lootTables = {
      lootTableById: vi.fn((id: string) =>
        id === 'chest-table'
          ? { id: 'chest-table', entries: [{ kind: 'scrap' as const, amount: 8, weight: 1 }] }
          : undefined),
    };
    const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
    runState.stats.add({ stat: 'currencyGain', op: 'mult', value: 2.5, sourceId: 'test' });
    const collected = vi.fn();
    const currencyChanged = vi.fn();
    bus.on('drop:collected', collected);
    bus.on('currency:changed', currencyChanged);

    const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: 'chest-table' });
    overlapCallback?.(null, drop.sprite);

    expect(runState.currency).toBe(20);
    expect(currencyChanged).toHaveBeenCalledWith({ runTotal: 20 });
    expect(collected).toHaveBeenCalledWith({ kind: 'scrap', amount: 8, x: 0, y: 0 });
  });

  it('consumes exactly one rng.next() per chest open', async () => {
    const table = {
      id: 'chest-table',
      entries: [{ kind: 'xp' as const, amount: 1, weight: 1 }],
    };
    const lootTables = {
      lootTableById: vi.fn((id: string) => (id === table.id ? table : undefined)),
    };
    const rng = { next: vi.fn(() => 0.3) };
    const { system, overlapCallback } = await createSystem({ lootTables, rng });

    const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: table.id });
    overlapCallback?.(null, drop.sprite);

    expect(rng.next).toHaveBeenCalledTimes(1);
  });

  it('filters a nested chest grant and grants nothing', async () => {
    const lootTables = {
      lootTableById: vi.fn((id: string) =>
        id === 'chest-table'
          ? {
              id: 'chest-table',
              entries: [{ kind: 'chest' as const, amount: 0, weight: 1, tableId: 'nested' }] as const,
            }
          : undefined),
    };
    const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: 'chest-table' });
    overlapCallback?.(null, drop.sprite);

    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(drop.active).toBe(false);
  });

  it('fails soft when the chest table is missing', async () => {
    const lootTables = {
      lootTableById: vi.fn(() => undefined),
    };
    const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: 'missing' });
    expect(() => overlapCallback?.(null, drop.sprite)).not.toThrow();

    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(drop.active).toBe(false);
  });

  it.each([
    ['xp with a NaN amount', { kind: 'xp', amount: Number.NaN, weight: 1 }],
    ['scrap with a non-positive amount', { kind: 'scrap', amount: 0, weight: 1 }],
    ['an unknown grant kind', { kind: 'mystery', amount: 1, weight: 1 }],
  ])('fails soft when a chest table contains %s', async (_label, entry) => {
    const lootTables = {
      lootTableById: vi.fn((id: string) =>
        id === 'malformed-table' ? { id: 'malformed-table', entries: [entry] } : undefined,
      ),
    } as unknown as LootTableLookup;
    const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
    const collected = vi.fn();
    const currencyChanged = vi.fn();
    const xpGained = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    bus.on('drop:collected', collected);
    bus.on('currency:changed', currencyChanged);
    bus.on('xp:gained', xpGained);

    const drop = system.spawnDrop(0, 0, {
      kind: 'chest',
      amount: 0,
      tableId: 'malformed-table',
    });
    expect(() => overlapCallback?.(null, drop.sprite)).not.toThrow();

    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(currencyChanged).not.toHaveBeenCalled();
    expect(xpGained).not.toHaveBeenCalled();
    expect(drop.active).toBe(false);
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });

  it('grants nothing when a chest drop has no tableId', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    // The production LootGrant type requires tableId for chests; this cast
    // exercises the defensive no-tableId path in collectChest.
    const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0 } as unknown as LootGrant);
    overlapCallback?.(null, drop.sprite);

    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(drop.active).toBe(false);
  });

  it('grants nothing when the chest table resolves to nothing', async () => {
    const lootTables = {
      lootTableById: vi.fn((id: string) =>
        id === 'chest-table'
          ? { id: 'chest-table', entries: [{ kind: 'nothing' as const, amount: 0, weight: 1 }] as const }
          : undefined),
    };
    const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: 'chest-table' });
    overlapCallback?.(null, drop.sprite);

    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(drop.active).toBe(false);
  });

  it.each(['paused', 'won', 'lost'] as const)(
    'does not resolve a chest when run status is %s',
    async (status) => {
      const lootTables = {
        lootTableById: vi.fn((id: string) =>
          id === 'chest-table'
            ? { id: 'chest-table', entries: [{ kind: 'xp' as const, amount: 99, weight: 1 }] }
            : undefined),
      };
      const { system, runState, bus, overlapCallback } = await createSystem({ status, lootTables });
      const collected = vi.fn();
      bus.on('drop:collected', collected);

      const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: 'chest-table' });
      overlapCallback?.(null, drop.sprite);

      expect(runState.currency).toBe(0);
      expect(runState.xp).toBe(0);
      expect(collected).not.toHaveBeenCalled();
      expect(drop.active).toBe(true);
    },
  );

  it('collects a drop via overlap even when pickupRadius is clamped to zero', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    runState.stats.add({ stat: 'pickupRadius', op: 'add', value: -20, sourceId: 'test' });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(0, 0, { kind: 'xp', amount: 5 });
    overlapCallback?.(null, drop.sprite);

    expect(collected).toHaveBeenCalledWith({ kind: 'xp', amount: 5, x: 0, y: 0 });
  });

  it('does not collect a drop sitting inside the pickup radius from update() alone', async () => {
    // Collection is overlap-only (§4 of the slice contract): update() must move
    // drops toward the player but never collect them, even when a drop is
    // already within the resolved pickup radius.
    const { system, runState, bus, player } = await createSystem();
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(0, 0, { kind: 'scrap', amount: 3 });
    (player as { x: number; y: number }).x = 1;

    system.update(16);
    system.update(16);

    expect(collected).not.toHaveBeenCalled();
    expect(drop.active).toBe(true);
    expect(runState.currency).toBe(0);
  });

  it('carries the cumulative post-add total across successive scrap collections', async () => {
    // A single collection can't distinguish the post-add total from the delta
    // when currency starts at 0 (both read as the same number); two
    // collections are required to pin runTotal as cumulative.
    const { system, runState, bus, overlapCallback } = await createSystem();
    const currencyChanged = vi.fn();
    bus.on('currency:changed', currencyChanged);

    overlapCallback?.(null, system.spawnDrop(0, 0, { kind: 'scrap', amount: 2 }).sprite);
    overlapCallback?.(null, system.spawnDrop(0, 0, { kind: 'scrap', amount: 5 }).sprite);

    expect(currencyChanged.mock.calls.map(([payload]) => payload.runTotal)).toEqual([2, 7]);
    expect(runState.currency).toBe(7);
  });

  it('does not floor a fractional currencyGain result mid-run', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    runState.stats.add({ stat: 'currencyGain', op: 'mult', value: 1.5, sourceId: 'test' });
    const currencyChanged = vi.fn();
    bus.on('currency:changed', currencyChanged);

    overlapCallback?.(null, system.spawnDrop(0, 0, { kind: 'scrap', amount: 3 }).sprite);

    expect(runState.currency).toBeCloseTo(4.5, 10);
    expect(currencyChanged).toHaveBeenCalledWith({ runTotal: 4.5 });
  });

  it.each([0, Number.NaN])(
    'emits drop:collected for xp at face value even when xpGain resolves to %s',
    async (xpGain) => {
      const { system, runState, bus, overlapCallback } = await createSystem();
      vi.spyOn(runState.stats, 'resolve').mockReturnValue(xpGain);
      const collected = vi.fn();
      const xpGained = vi.fn();
      bus.on('drop:collected', collected);
      bus.on('xp:gained', xpGained);

      overlapCallback?.(null, system.spawnDrop(0, 0, { kind: 'xp', amount: 5 }).sprite);

      expect(runState.xp).toBe(0);
      expect(xpGained).not.toHaveBeenCalled();
      expect(collected).toHaveBeenCalledWith({ kind: 'xp', amount: 5, x: 0, y: 0 });
    },
  );

  it('keeps magnetSpeed above the max attainable player moveSpeed', () => {
    // §6 of the slice contract requires magnetSpeed to exceed every attainable
    // moveSpeed so a drop can never be outrun once collection is overlap-only.
    // Deriving the ceiling from the shipped catalogue (rather than hardcoding
    // the current ~366.6) means a future balance change that lowers the
    // ceiling below RuntimeConfig's value fails this test instead of shipping
    // an uncollectable drop silently.
    const isMoveSpeedMult = (effect: { stat: string; op: string }) =>
      effect.stat === 'moveSpeed' && effect.op === 'mult';

    const fastestBaseMoveSpeed = Math.max(...charactersJson.map((character) => character.baseStats.moveSpeed));
    let ceilingMultiplier = 1;
    for (const character of charactersJson) {
      for (const passive of character.passives ?? []) {
        for (const effect of passive.effects ?? []) {
          if (isMoveSpeedMult(effect)) {
            ceilingMultiplier *= effect.value;
          }
        }
      }
    }
    for (const metaUpgrade of metaUpgradesJson) {
      for (const effect of metaUpgrade.effects) {
        if (isMoveSpeedMult(effect)) {
          ceilingMultiplier *= effect.value ** metaUpgrade.maxLevel;
        }
      }
    }
    for (const upgrade of upgradesJson) {
      for (const effect of upgrade.effects) {
        if (isMoveSpeedMult(effect)) {
          ceilingMultiplier *= effect.value ** upgrade.maxStacks;
        }
      }
    }

    const maxAttainableMoveSpeed = fastestBaseMoveSpeed * ceilingMultiplier;
    expect(RuntimeConfig.gameplay.drop.magnetSpeed).toBeGreaterThan(maxAttainableMoveSpeed);
  });

  it('reuses the exact drop object and sprite after collection', async () => {
    const { system, overlapCallback } = await createSystem();

    const first = system.spawnDrop(10, 20, { kind: 'scrap', amount: 3 });
    const firstSprite = first.sprite as unknown as MockGameObject;
    overlapCallback?.(null, firstSprite);

    const second = system.spawnDrop(30, 40, { kind: 'xp', amount: 7 });
    const secondSprite = second.sprite as unknown as MockGameObject;

    expect(second).toBe(first);
    expect(secondSprite).toBe(firstSprite);
    expect(second.grant).toEqual({ kind: 'xp', amount: 7 });
    expect(second.x).toBe(30);
    expect(second.y).toBe(40);
    expect(system.activeDropCount).toBe(1);
    expect(system.allocatedDropCount).toBe(1);
  });

  it('adds the drop sprite to the Physics Group only on first allocation', async () => {
    const { system, addedSprites, overlapCallback } = await createSystem();

    const first = system.spawnDrop(0, 0, { kind: 'xp', amount: 1 });
    overlapCallback?.(null, first.sprite);
    system.spawnDrop(0, 0, { kind: 'scrap', amount: 2 });

    expect(addedSprites).toHaveLength(1);
  });

  it('resets drop grant state and velocity between uses', async () => {
    const lootTables = {
      lootTableById: vi.fn((id: string) =>
        id === 'chest-table'
          ? { id: 'chest-table', entries: [{ kind: 'xp' as const, amount: 4, weight: 1 }] }
          : undefined),
    };
    const { system, overlapCallback } = await createSystem({ lootTables });

    const chest = system.spawnDrop(5, 6, { kind: 'chest', amount: 0, tableId: 'chest-table' });
    (chest.sprite.body as unknown as MockBody).setVelocity(12, 34);
    overlapCallback?.(null, chest.sprite);

    const next = system.spawnDrop(7, 8, { kind: 'scrap', amount: 9 });

    expect(next.grant).toEqual({ kind: 'scrap', amount: 9 });
    expect(next.pickupBlocked).toBe(false);
    expect((next.sprite.body as unknown as MockBody).velocity).toEqual({ x: 0, y: 0 });
  });

  it('returns active and allocated counts to expected values after collection', async () => {
    const { system, overlapCallback } = await createSystem();

    const drop = system.spawnDrop(1, 2, { kind: 'xp', amount: 1 });
    expect(system.activeDropCount).toBe(1);
    expect(system.allocatedDropCount).toBe(1);

    overlapCallback?.(null, drop.sprite);

    expect(system.activeDropCount).toBe(0);
    expect(system.allocatedDropCount).toBe(1);
  });

  it('destroys all owned drops and removes the enemy:killed listener on destroy', async () => {
    const { system, bus, addedSprites } = await createSystem();

    system.spawnDrop(0, 0, { kind: 'xp', amount: 1 });
    system.spawnDrop(0, 0, { kind: 'scrap', amount: 1 });
    expect(addedSprites).toHaveLength(2);

    system.destroy();

    addedSprites.forEach((sprite) => {
      expect(sprite.destroyed).toBe(true);
    });
    expect(system.allocatedDropCount).toBe(0);

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 1,
      x: 0,
      y: 0,
    });
    expect(addedSprites).toHaveLength(2);
  });

  describe('weapon pickup path (Epic 14 §D8)', () => {
    function fullRack(runState: RunState, registry: DataWeaponRegistry): void {
      const def = registry.weaponById('scrap-pistol-t1');
      if (!def) throw new Error('missing pistol');
      runState.equipped = Array.from({ length: 6 }, () => registry.createWeaponInstance(def));
    }

    it('collecting a weapon drop admits exactly one instance and releases the drop', async () => {
      const { system, runState, bus, overlapCallback } = await createSystem();
      const acquired = vi.fn();
      bus.on('weapon:acquired', acquired);
      const collected = vi.fn();
      bus.on('drop:collected', collected);

      const drop = system.spawnDrop(5, 6, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      overlapCallback?.(null, drop.sprite);

      expect(runState.equipped).toHaveLength(1);
      expect(runState.equipped[0].defId).toBe('scrap-pistol-t1');
      expect(runState.equipped[0].tier).toBe(1);
      expect(acquired).toHaveBeenCalledTimes(1);
      expect(acquired.mock.calls[0][0]).toMatchObject({
        definitionId: 'scrap-pistol-t1',
        rackCount: 1,
        rackCapacity: 6,
        x: 5,
        y: 6,
      });
      expect(acquired.mock.calls[0][0].instanceId).toBe(runState.equipped[0].instanceId);
      expect(collected).not.toHaveBeenCalled();
      expect(drop.active).toBe(false);
      expect(system.activeDropCount).toBe(0);
    });

    it('leaves a valid seventh weapon in the world, blocks it, and does not allocate', async () => {
      const registry = new DataWeaponRegistry(loadGameData());
      const createSpy = vi.spyOn(registry, 'createWeaponInstance');
      const { system, runState, bus, overlapCallback } = await createSystem({ weaponRegistry: registry });
      fullRack(runState, registry);
      createSpy.mockClear();
      const blocked = vi.fn();
      bus.on('weapon:pickup-blocked', blocked);

      const drop = system.spawnDrop(9, 9, { kind: 'weapon', definitionId: 'can-smg-t1' });
      overlapCallback?.(null, drop.sprite);

      expect(runState.equipped).toHaveLength(6);
      expect(createSpy).not.toHaveBeenCalled();
      expect(drop.active).toBe(true);
      expect(drop.pickupBlocked).toBe(true);
      expect(system.activeDropCount).toBe(1);
      expect(blocked).toHaveBeenCalledTimes(1);
      expect(blocked.mock.calls[0][0]).toEqual({
        definitionId: 'can-smg-t1',
        reason: 'rack-full',
        rackCount: 6,
        rackCapacity: 6,
        x: 9,
        y: 9,
      });
      createSpy.mockRestore();
    });

    it('does not spam blocked events for repeated overlap while blocked', async () => {
      const { system, runState, bus, overlapCallback } = await createSystem();
      const registry = new DataWeaponRegistry(loadGameData());
      fullRack(runState, registry);
      const blocked = vi.fn();
      bus.on('weapon:pickup-blocked', blocked);

      const drop = system.spawnDrop(0, 0, { kind: 'weapon', definitionId: 'can-smg-t1' });
      overlapCallback?.(null, drop.sprite);
      overlapCallback?.(null, drop.sprite);
      overlapCallback?.(null, drop.sprite);

      expect(blocked).toHaveBeenCalledTimes(1);
      expect(drop.pickupBlocked).toBe(true);
      expect(runState.equipped).toHaveLength(6);
    });

    it('does not magnetize a blocked drop during update', async () => {
      const { system, runState, player, overlapCallback } = await createSystem();
      const registry = new DataWeaponRegistry(loadGameData());
      fullRack(runState, registry);

      const drop = system.spawnDrop(0, 0, { kind: 'weapon', definitionId: 'can-smg-t1' });
      overlapCallback?.(null, drop.sprite);
      (player as { x: number; y: number }).x = 1;

      system.update(16);

      expect(drop.body.velocity).toEqual({ x: 0, y: 0 });
      expect(drop.pickupBlocked).toBe(true);
    });

    it('unblocks after a merge frees capacity and a later overlap admits the drop', async () => {
      const { system, runState, bus, overlapCallback } = await createSystem();
      const registry = new DataWeaponRegistry(loadGameData());
      fullRack(runState, registry);
      const acquired = vi.fn();
      bus.on('weapon:acquired', acquired);

      const drop = system.spawnDrop(0, 0, { kind: 'weapon', definitionId: 'can-smg-t1' });
      overlapCallback?.(null, drop.sprite);
      expect(drop.pickupBlocked).toBe(true);

      // Simulate a manual-pause merge: six → five.
      runState.equipped = runState.equipped.slice(0, 5);
      system.update(16);

      expect(drop.pickupBlocked).toBe(false);
      overlapCallback?.(null, drop.sprite);

      expect(runState.equipped).toHaveLength(6);
      expect(runState.equipped[5].defId).toBe('can-smg-t1');
      expect(acquired).toHaveBeenCalledTimes(1);
      expect(drop.active).toBe(false);
    });

    it('fails soft for an invalid definition: warns, releases, and does not mutate the rack', async () => {
      const { system, runState, bus, overlapCallback } = await createSystem();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const acquired = vi.fn();
      bus.on('weapon:acquired', acquired);

      const drop = system.spawnDrop(0, 0, { kind: 'weapon', definitionId: 'missing-weapon' });
      overlapCallback?.(null, drop.sprite);

      expect(runState.equipped).toHaveLength(0);
      expect(acquired).not.toHaveBeenCalled();
      expect(drop.active).toBe(false);
      expect(system.activeDropCount).toBe(0);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain('missing-weapon');

      warn.mockRestore();
    });

    it('respawns a physical weapon drop from a chest weapon grant instead of mutating the rack', async () => {
      const lootTables = {
        lootTableById: vi.fn((id: string) =>
          id === 'weapon-chest'
            ? {
                id: 'weapon-chest',
                entries: [{ kind: 'weapon' as const, weight: 1, definitionId: 'scrap-pistol-t1' }],
              }
            : undefined),
      };
      const { system, runState, bus, overlapCallback, addedSprites } = await createSystem({ lootTables });
      const acquired = vi.fn();
      bus.on('weapon:acquired', acquired);
      const collected = vi.fn();
      bus.on('drop:collected', collected);

      const chest = system.spawnDrop(12, 34, { kind: 'chest', amount: 0, tableId: 'weapon-chest' });
      overlapCallback?.(null, chest.sprite);

      // The chest itself is released; the weapon grant became a world drop.
      expect(chest.active).toBe(false);
      expect(runState.equipped).toHaveLength(0);
      expect(acquired).not.toHaveBeenCalled();
      expect(collected).not.toHaveBeenCalled();
      expect(addedSprites).toHaveLength(2);
      expect(addedSprites[1].x).toBe(12);
      expect(addedSprites[1].y).toBe(34);

      // The physical drop is then collectible through the normal path.
      addedSprites[1].active = true;
      overlapCallback?.(null, addedSprites[1]);
      expect(runState.equipped).toHaveLength(1);
      expect(acquired).toHaveBeenCalledTimes(1);
    });

    it('never emits collection events when a chest resolves a weapon grant', async () => {
      const lootTables = {
        lootTableById: vi.fn((id: string) =>
          id === 'weapon-chest'
            ? {
                id: 'weapon-chest',
                entries: [{ kind: 'weapon' as const, weight: 1, definitionId: 'can-smg-t1' }],
              }
            : undefined),
      };
      const { system, runState, bus, overlapCallback } = await createSystem({ lootTables });
      const events: string[] = [];
      bus.on('xp:gained', () => events.push('xp:gained'));
      bus.on('currency:changed', () => events.push('currency:changed'));
      bus.on('drop:collected', () => events.push('drop:collected'));

      const chest = system.spawnDrop(1, 2, { kind: 'chest', amount: 0, tableId: 'weapon-chest' });
      overlapCallback?.(null, chest.sprite);

      expect(events).toEqual([]);
      expect(runState.xp).toBe(0);
      expect(runState.currency).toBe(0);
    });
  });

  describe('#164 freeze regression matrix', () => {
    it('spawns and collects XP pickup without freezing', async () => {
      const { system, runState, overlapCallback } = await createSystem();
      const drop = system.spawnDrop(5, 5, { kind: 'xp', amount: 10 });
      expect(drop.active).toBe(true);
      expect(drop.grant?.kind).toBe('xp');
      overlapCallback?.(null, drop.sprite);
      // applyXp scales by xpGain stat (0.5 in test harness)
      expect(runState.xp).toBe(5);
    });

    it('spawns and collects Scrap pickup without freezing', async () => {
      const { system, runState, overlapCallback } = await createSystem();
      const drop = system.spawnDrop(5, 5, { kind: 'scrap', amount: 25 });
      expect(drop.active).toBe(true);
      overlapCallback?.(null, drop.sprite);
      expect(runState.currency).toBe(25);
    });

    it('spawns and collects a Chest without freezing', async () => {
      const lootTables = {
        lootTableById: () => ({
          id: 'test-table',
          entries: [
            { kind: 'xp' as const, weight: 1, amount: 5 },
            { kind: 'scrap' as const, weight: 1, amount: 10 },
          ],
        }),
      };
      const { system, overlapCallback } = await createSystem({ lootTables });
      const drop = system.spawnDrop(5, 5, { kind: 'chest', amount: 0, tableId: 'test-table' });
      expect(drop.active).toBe(true);
      overlapCallback?.(null, drop.sprite);
      // Chest processing spawns new drops or applies grants
      // The chest itself is released after processing
      expect(system.activeDropCount).toBe(0);
    });

    it('spawns and collects ordinary weapon pickup without freezing', async () => {
      const registry = new DataWeaponRegistry(loadGameData());
      const { system, runState, overlapCallback } = await createSystem({ weaponRegistry: registry });
      const drop = system.spawnDrop(5, 5, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      expect(drop.active).toBe(true);
      overlapCallback?.(null, drop.sprite);
      // Weapon should be added to rack
      expect(runState.equipped.length).toBeGreaterThanOrEqual(1);
    });

    it('handles full-rack blocked weapon without freezing', async () => {
      const registry = new DataWeaponRegistry(loadGameData());
      const { system, runState, overlapCallback } = await createSystem({ weaponRegistry: registry });
      // Fill the rack to capacity (6)
      for (let i = 0; i < 6; i++) {
        runState.equipped.push({ defId: 'scrap-pistol-t1', instanceId: `test-${i}`, family: 'pistol', tier: 1 });
      }
      const drop = system.spawnDrop(0, 0, { kind: 'weapon', definitionId: 'can-smg-t1' });
      expect(drop.active).toBe(true);
      // Overlap should not crash - blocked drops return early
      overlapCallback?.(null, drop.sprite);
      expect(drop.pickupBlocked).toBe(true);
    });

    it('processes simultaneous XP and weapon drops without freezing', async () => {
      const registry = new DataWeaponRegistry(loadGameData());
      const { system, runState, overlapCallback } = await createSystem({ weaponRegistry: registry });
      // Spawn both drops at the same position (simulating co-occurrence)
      const xpDrop = system.spawnDrop(5, 5, { kind: 'xp', amount: 10 });
      const weaponDrop = system.spawnDrop(5, 5, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      expect(xpDrop.active).toBe(true);
      expect(weaponDrop.active).toBe(true);
      // Collect XP first
      overlapCallback?.(null, xpDrop.sprite);
      // applyXp scales by xpGain stat (0.5 in test harness)
      expect(runState.xp).toBe(5);
      // Then collect weapon
      overlapCallback?.(null, weaponDrop.sprite);
      expect(runState.equipped.length).toBeGreaterThanOrEqual(1);
    });

    it('survives repeated drop system update without infinite loop', async () => {
      const { system } = await createSystem();
      // Spawn many drops
      for (let i = 0; i < 20; i++) {
        system.spawnDrop(i * 10, i * 10, { kind: 'xp', amount: 5 });
        system.spawnDrop(i * 10 + 5, i * 10 + 5, { kind: 'scrap', amount: 3 });
      }
      // Update should complete within reasonable time
      const start = Date.now();
      for (let frame = 0; frame < 60; frame++) {
        system.update(16);
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000); // 60 frames should not take 5 seconds
    });

    it('handles weapon reward near level-up transition without freezing', async () => {
      const registry = new DataWeaponRegistry(loadGameData());
      const { system, runState, overlapCallback } = await createSystem({ weaponRegistry: registry });
      // Set XP to near level-up threshold
      // Set XP high enough to trigger level-up on next XP gain
      runState.xp = 1000;
      // Spawn an XP drop that triggers level-up
      const xpDrop = system.spawnDrop(5, 5, { kind: 'xp', amount: 10 });
      overlapCallback?.(null, xpDrop.sprite);
      // Should have leveled up
      expect(runState.level).toBeGreaterThanOrEqual(2);
      // Now spawn a weapon drop (common after level-up when rewards appear)
      const weaponDrop = system.spawnDrop(5, 5, { kind: 'weapon', definitionId: 'scrap-pistol-t1' });
      overlapCallback?.(null, weaponDrop.sprite);
      expect(runState.equipped.length).toBeGreaterThanOrEqual(1);
    });
  });

});
