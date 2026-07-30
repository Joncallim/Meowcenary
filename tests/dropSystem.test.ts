import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { createEventBus } from '../src/engine/eventBus';
import type { GameContext } from '../src/engine/context';
import { createRunState, type RunState } from '../src/gameplay/runState';
import type { LootTableLookup } from '../src/systems/lootTables';
import type { Player } from '../src/entities/Player';
import type { DropSystem } from '../src/systems/DropSystem';

class MockGameObject {
  active = true;
  visible = true;
  destroyed = false;
  depth = 0;
  fillColor?: number;
  body?: MockBody;

  constructor(
    public x = 0,
    public y = 0,
  ) {}

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  setActive(active: boolean): this {
    this.active = active;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setFillStyle(color: number): this {
    this.fillColor = color;
    return this;
  }

  destroy(): void {
    this.active = false;
    this.destroyed = true;
  }
}

class MockArc extends MockGameObject {}

class MockBody {
  enable = true;
  velocity = { x: 0, y: 0 };
  circleRadius?: number;

  constructor(readonly gameObject: MockGameObject) {}

  setCircle(radius: number): void {
    this.circleRadius = radius;
  }

  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }
}

vi.mock('phaser', () => ({
  default: {
    GameObjects: { GameObject: MockGameObject },
    Physics: { Arcade: { Body: MockBody, StaticBody: MockBody } },
  },
}));

interface TestSystem {
  system: DropSystem;
  runState: RunState;
  bus: ReturnType<typeof createEventBus>;
  player: Player;
  overlapCallback?: (playerObject: unknown, dropObject: unknown) => void;
  addedSprites: MockGameObject[];
  lootTables: { lootTableById: ReturnType<typeof vi.fn> };
  rng: { next: ReturnType<typeof vi.fn> };
}

async function createSystem(options: {
  status?: RunState['status'];
  lootTables?: LootTableLookup;
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
      addedSprites.push(sprite);
    },
  } as unknown as Phaser.Physics.Arcade.Group;
  const lootTables = options.lootTables ?? { lootTableById: vi.fn() };
  // A concrete RNG value ensures resolveLoot traverses the weighted-selection
  // path instead of the floating-point safety-net fallback.
  const rng = { next: vi.fn(() => 0.3) };

  const system = new DropSystem({
    scene: scene as unknown as Phaser.Scene,
    ctx,
    runState,
    player,
    dropGroup,
    lootTables,
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
    lootTables: lootTables as { lootTableById: ReturnType<typeof vi.fn> },
    rng,
  };
}

describe('DropSystem', () => {
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

  it('produces identical table-path drops for identical RNG state and kill order', async () => {
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
    const first = await createSystem({ lootTables });
    const second = await createSystem({ lootTables });
    const firstCollected = vi.fn();
    const secondCollected = vi.fn();
    first.bus.on('drop:collected', firstCollected);
    second.bus.on('drop:collected', secondCollected);

    first.bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'any',
      xpValue: 1,
      scrapValue: 1,
      lootTableId: table.id,
      x: 10,
      y: 20,
    });
    second.bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'any',
      xpValue: 1,
      scrapValue: 1,
      lootTableId: table.id,
      x: 10,
      y: 20,
    });

    expect(first.addedSprites).toHaveLength(1);
    expect(second.addedSprites).toHaveLength(1);
    expect(first.addedSprites[0].x).toBe(second.addedSprites[0].x);
    expect(first.addedSprites[0].y).toBe(second.addedSprites[0].y);
    first.overlapCallback?.(null, first.addedSprites[0]);
    second.overlapCallback?.(null, second.addedSprites[0]);
    expect(firstCollected.mock.calls).toEqual(secondCollected.mock.calls);
    expect(first.rng.next).toHaveBeenCalledOnce();
    expect(second.rng.next).toHaveBeenCalledOnce();
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

  it.each([-1, Number.NaN])(
    'does not write currency or emit currency:changed when currencyGain is %s',
    async (currencyGain) => {
      const { system, runState, bus, overlapCallback } = await createSystem();
      if (Number.isNaN(currencyGain)) {
        vi.spyOn(runState.stats, 'resolve').mockReturnValue(Number.NaN);
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

  it('clamps a negative resolved pickup radius to zero', async () => {
    const { system, bus, runState, addedSprites } = await createSystem();
    runState.stats.add({ stat: 'pickupRadius', op: 'add', value: -20, sourceId: 'invalid' });

    bus.emit('enemy:killed', {
      instanceId: 1,
      enemyId: 'dust-mite',
      xpValue: 1,
      scrapValue: 0,
      x: 0,
      y: 0,
    });

    system.update(16);

    expect(addedSprites[0].body?.velocity.x).toBe(0);
    expect(addedSprites[0].body?.velocity.y).toBe(0);
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

  it('destroys a chest drop without granting or emitting drop:collected', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    const collected = vi.fn();
    bus.on('drop:collected', collected);
    const currencyChanged = vi.fn();
    bus.on('currency:changed', currencyChanged);

    const drop = system.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: 'chest-table' });
    overlapCallback?.(null, drop.sprite);

    expect(drop.active).toBe(false);
    expect((drop.sprite as unknown as MockGameObject).destroyed).toBe(true);
    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(currencyChanged).not.toHaveBeenCalled();
  });

  it('collects a drop via overlap even when pickupRadius is clamped to zero', async () => {
    const { system, runState, bus, overlapCallback } = await createSystem();
    runState.stats.add({ stat: 'pickupRadius', op: 'add', value: -20, sourceId: 'test' });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(0, 0, { kind: 'xp', amount: 5 });
    overlapCallback?.(null, drop.sprite);

    expect(collected).toHaveBeenCalledWith({ kind: 'xp', amount: 5, x: 0, y: 0 });
  });
});
