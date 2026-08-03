import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { loadGameData } from '../src/systems/validation';
import { DataLootTableRegistry } from '../src/systems/lootTables';
import { createEventBus } from '../src/engine/eventBus';
import { createRng, deriveRunSeed } from '../src/engine/rng';
import { createRunState, type RunState } from '../src/gameplay/runState';
import type { GameContext } from '../src/engine/context';
import type { Player } from '../src/entities/Player';
import type { LootTableLookup } from '../src/systems/lootTables';
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

const BRUTE_KILL = {
  instanceId: 1,
  enemyId: 'trash-brute',
  xpValue: 8,
  scrapValue: 5,
  lootTableId: 'brute-cache',
  x: 120,
  y: 240,
} as const;

// Pre-computed against deriveRunSeed(seed, 'loot') + the shipped table weights.
// brute-cache weights: xp 6 (60), scrap 5 (30), chest → chest-standard (10).
// chest-standard weights: xp 15 (55), scrap 10 (35), scrap 40 (10).
const SEED_CHEST_XP_15 = 7;
const SEED_CHEST_SCRAP_10 = 12;
const SEED_CHEST_SCRAP_40 = 79;
const SEED_NO_CHEST_XP_6 = 2;

interface Harness {
  system: DropSystem;
  runState: RunState;
  bus: ReturnType<typeof createEventBus>;
  overlapCallback?: (playerObject: unknown, dropObject: unknown) => void;
  addedSprites: MockGameObject[];
}

async function createHarness(options: {
  seed: number;
  lootTables?: LootTableLookup;
}): Promise<Harness> {
  const { DropSystem } = await import('../src/systems/DropSystem');
  const runState = createRunState({ seed: options.seed, characterId: 'starter', arenaId: 'arena' });
  runState.status = 'active';
  // Isolate XP grants from the default xpToNext of 5 so assertions are simple.
  runState.xpToNext = 1000;
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

  const data = loadGameData();
  const lootTables = options.lootTables ?? new DataLootTableRegistry(data);
  const rng = createRng(deriveRunSeed(options.seed, 'loot'));

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
    get overlapCallback() {
      return overlapState.callback;
    },
    addedSprites,
  };
}

describe('loot integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('full pipeline: kill → chest drop → +15 xp', async () => {
    const { bus, addedSprites, overlapCallback, runState } = await createHarness({ seed: SEED_CHEST_XP_15 });
    const collected = vi.fn();
    const xpGained = vi.fn();
    bus.on('drop:collected', collected);
    bus.on('xp:gained', xpGained);

    bus.emit('enemy:killed', BRUTE_KILL);

    expect(addedSprites).toHaveLength(1);
    expect(addedSprites[0].x).toBe(120);
    expect(addedSprites[0].y).toBe(240);
    const drop = addedSprites[0];
    drop.active = true;
    overlapCallback?.(null, drop);

    expect(xpGained).toHaveBeenCalledTimes(1);
    expect(xpGained).toHaveBeenCalledWith({ amount: 15, total: 15 });
    expect(runState.xp).toBe(15);
    expect(collected).toHaveBeenCalledTimes(1);
    expect(collected).toHaveBeenCalledWith({ kind: 'xp', amount: 15, x: 120, y: 240 });
    expect(collected.mock.calls.some(([payload]) => payload.kind === 'chest')).toBe(false);
    expect(drop.destroyed).toBe(true);
  });

  it('full pipeline: kill → chest drop → +10 scrap', async () => {
    const { bus, addedSprites, overlapCallback, runState } = await createHarness({ seed: SEED_CHEST_SCRAP_10 });
    const collected = vi.fn();
    const currencyChanged = vi.fn();
    bus.on('drop:collected', collected);
    bus.on('currency:changed', currencyChanged);

    bus.emit('enemy:killed', BRUTE_KILL);

    expect(addedSprites).toHaveLength(1);
    const drop = addedSprites[0];
    drop.active = true;
    overlapCallback?.(null, drop);

    expect(runState.currency).toBe(10);
    expect(currencyChanged).toHaveBeenCalledTimes(1);
    expect(currencyChanged).toHaveBeenCalledWith({ runTotal: 10 });
    expect(collected).toHaveBeenCalledTimes(1);
    expect(collected).toHaveBeenCalledWith({ kind: 'scrap', amount: 10, x: 120, y: 240 });
    expect(drop.destroyed).toBe(true);
  });

  it('full pipeline: kill → chest drop → +40 scrap', async () => {
    const { bus, addedSprites, overlapCallback, runState } = await createHarness({ seed: SEED_CHEST_SCRAP_40 });
    const collected = vi.fn();
    const currencyChanged = vi.fn();
    bus.on('drop:collected', collected);
    bus.on('currency:changed', currencyChanged);

    bus.emit('enemy:killed', BRUTE_KILL);

    expect(addedSprites).toHaveLength(1);
    const drop = addedSprites[0];
    drop.active = true;
    overlapCallback?.(null, drop);

    expect(runState.currency).toBe(40);
    expect(currencyChanged).toHaveBeenCalledWith({ runTotal: 40 });
    expect(collected).toHaveBeenCalledWith({ kind: 'scrap', amount: 40, x: 120, y: 240 });
  });

  it('table kill without chest spawns a plain xp drop', async () => {
    const { bus, addedSprites, overlapCallback, runState } = await createHarness({ seed: SEED_NO_CHEST_XP_6 });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    bus.emit('enemy:killed', BRUTE_KILL);

    expect(addedSprites).toHaveLength(1);
    const drop = addedSprites[0];
    drop.active = true;
    overlapCallback?.(null, drop);

    expect(runState.xp).toBe(6);
    expect(collected).toHaveBeenCalledTimes(1);
    expect(collected).toHaveBeenCalledWith({ kind: 'xp', amount: 6, x: 120, y: 240 });
  });

  it('produces identical grants and events for identical seed and event order', async () => {
    const first = await createHarness({ seed: SEED_CHEST_XP_15 });
    const second = await createHarness({ seed: SEED_CHEST_XP_15 });
    const firstCollected = vi.fn();
    const secondCollected = vi.fn();
    first.bus.on('drop:collected', firstCollected);
    second.bus.on('drop:collected', secondCollected);

    first.bus.emit('enemy:killed', BRUTE_KILL);
    second.bus.emit('enemy:killed', BRUTE_KILL);

    expect(first.addedSprites).toHaveLength(1);
    expect(second.addedSprites).toHaveLength(1);
    first.addedSprites[0].active = true;
    second.addedSprites[0].active = true;
    first.overlapCallback?.(null, first.addedSprites[0]);
    second.overlapCallback?.(null, second.addedSprites[0]);

    expect(firstCollected.mock.calls).toEqual(secondCollected.mock.calls);
    expect(first.runState.currency).toBe(second.runState.currency);
    expect(first.runState.xp).toBe(second.runState.xp);
    expect(first.runState.level).toBe(second.runState.level);
  });

  it('filters nested chest grants defensively and grants nothing', async () => {
    const lootTables: LootTableLookup = {
      lootTableById: (id: string) =>
        id === 'chest-standard'
          ? {
              id: 'chest-standard',
              entries: [
                { kind: 'chest', amount: 0, weight: 1, tableId: 'nowhere' },
              ],
            }
          : undefined,
    };
    const { bus, system, overlapCallback, runState } = await createHarness({ seed: SEED_CHEST_XP_15, lootTables });
    const collected = vi.fn();
    const currencyChanged = vi.fn();
    const xpGained = vi.fn();
    bus.on('drop:collected', collected);
    bus.on('currency:changed', currencyChanged);
    bus.on('xp:gained', xpGained);

    const drop = system.spawnDrop(50, 60, { kind: 'chest', amount: 0, tableId: 'chest-standard' });
    (drop.sprite as unknown as MockGameObject).active = true;
    overlapCallback?.(null, drop.sprite);

    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(currencyChanged).not.toHaveBeenCalled();
    expect(xpGained).not.toHaveBeenCalled();
    expect(drop.active).toBe(false);
    expect((drop.sprite as unknown as MockGameObject).destroyed).toBe(true);
  });

  it('fails soft when the chest table is missing', async () => {
    const lootTables: LootTableLookup = {
      lootTableById: () => undefined,
    };
    const { bus, system, overlapCallback, runState } = await createHarness({ seed: SEED_CHEST_XP_15, lootTables });
    const collected = vi.fn();
    bus.on('drop:collected', collected);

    const drop = system.spawnDrop(10, 20, { kind: 'chest', amount: 0, tableId: 'missing-table' });
    (drop.sprite as unknown as MockGameObject).active = true;
    expect(() => overlapCallback?.(null, drop.sprite)).not.toThrow();

    expect(runState.currency).toBe(0);
    expect(runState.xp).toBe(0);
    expect(collected).not.toHaveBeenCalled();
    expect(drop.active).toBe(false);
    expect((drop.sprite as unknown as MockGameObject).destroyed).toBe(true);
  });
});
