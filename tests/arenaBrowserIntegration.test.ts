import { describe, expect, it, vi } from 'vitest';
import { loadGameData } from '../src/systems/validation';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { buildArenaScenery } from '../src/systems/arenaScenery';
import { spawnPoint } from '../src/gameplay/spawnRegion';
import { assembleRunRequest } from '../src/gameplay/runRequest';

const LARGE_ARENA = {
  id: 'large-test-field',
  name: 'Large Test Field',
  size: { width: 1200, height: 900 },
  spawnCurveId: 'junkyard-intro',
  spawnRegions: [
    { kind: 'rect' as const, x: 100, y: 100, w: 400, h: 400 },
    { kind: 'edges' as const, margin: 28 },
  ],
  obstacles: [
    { x: 500, y: 200, w: 80, h: 300 },
    { x: 700, y: 400, w: 200, h: 60 },
  ],
  hazards: [
    { id: 'acid-pool', kind: 'acid', x: 50, y: 50, w: 200, h: 200, damagePerSecond: 15 },
  ],
  unlock: { type: 'default' as const },
};

describe('arena browser harness — data-level integration', () => {
  const data = loadGameData();
  const characters = new DataCharacterRegistry(data);

  function makeContext(arenaData: typeof LARGE_ARENA = LARGE_ARENA) {
    const arenas = new DataArenaRegistry({
      arenas: [data.arenas[0], arenaData],
    });
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const save = new SaveManager(new MemoryStorageAdapter(), 'harness-test', metaUpgrades.maxLevels());
    return createGameContext({
      bus: createEventBus(),
      menuRng: createRng(1),
      data,
      arenas,
      metaUpgrades,
      characters,
      save,
    });
  }

  it('resolves the large arena through the full selection chain', () => {
    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const request = assembleRunRequest(ctx, createRng(42));

    expect(request.arenaId).toBe('large-test-field');

    const arena = ctx.arenas.arenaById(request.arenaId)!;
    expect(arena.size).toEqual({ width: 1200, height: 900 });
    expect(arena.obstacles).toHaveLength(2);
    expect(arena.hazards).toHaveLength(1);
    expect(arena.spawnRegions).toHaveLength(2);

    const curve = ctx.data.spawnCurves.find((c) => c.id === arena.spawnCurveId);
    expect(curve).toBeDefined();
    expect(curve!.id).toBe('junkyard-intro');
  });

  it('world and camera bounds come from arena.size', () => {
    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    // Mock physics world
    const physicsBounds = { width: 0, height: 0 };
    const physicsWorld = {
      setBounds(_x: number, _y: number, w: number, h: number) {
        physicsBounds.width = w;
        physicsBounds.height = h;
      },
    };

    const cameraBounds = { width: 0, height: 0 };
    const camera = {
      setBounds(_x: number, _y: number, w: number, h: number) {
        cameraBounds.width = w;
        cameraBounds.height = h;
      },
    };

    physicsWorld.setBounds(0, 0, arena.size.width, arena.size.height);
    camera.setBounds(0, 0, arena.size.width, arena.size.height);

    expect(physicsBounds.width).toBe(1200);
    expect(physicsBounds.height).toBe(900);
    expect(cameraBounds.width).toBe(1200);
    expect(cameraBounds.height).toBe(900);
  });

  it('player spawns at arena centre', () => {
    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    const spawnX = arena.size.width / 2;
    const spawnY = arena.size.height / 2;
    expect(spawnX).toBe(600);
    expect(spawnY).toBe(450);
  });

  it('buildArenaScenery creates correct obstacle bodies', () => {
    const mockScene = {
      add: {
        rectangle: vi.fn((_x: number, _y: number, _w: number, _h: number) => ({
          setStrokeStyle: vi.fn().mockReturnValue({
            setDepth: vi.fn().mockReturnValue({}),
          }),
        })),
      },
      physics: {
        add: {
          existing: vi.fn(),
          staticGroup: vi.fn(() => ({
            add: vi.fn(),
            destroy: vi.fn(),
            children: { size: 0 },
          })),
        },
      },
    };

    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    const scenery = buildArenaScenery(mockScene as never, arena);

    // Two obstacle rectangles at correct centre positions
    expect(mockScene.add.rectangle).toHaveBeenCalledTimes(2);
    // Obstacle 1: (500,200,80,300) -> centre (540,350)
    expect(mockScene.add.rectangle).toHaveBeenCalledWith(540, 350, 80, 300, 0x2a3642);
    // Obstacle 2: (700,400,200,60) -> centre (800,430)
    expect(mockScene.add.rectangle).toHaveBeenCalledWith(800, 430, 200, 60, 0x2a3642);

    scenery.destroy();
  });

  it('empty obstacles produce empty scenery group', () => {
    const ctx = makeContext({
      ...LARGE_ARENA,
      obstacles: [],
      hazards: [],
      spawnRegions: [{ kind: 'edges', margin: 28 }],
    });
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    const group = { add: vi.fn(), destroy: vi.fn(), children: { size: 0 } };
    const mockScene = {
      add: { rectangle: vi.fn() },
      physics: {
        add: { existing: vi.fn(), staticGroup: vi.fn(() => group) },
      },
    };

    const scenery = buildArenaScenery(mockScene as never, arena);
    expect(mockScene.add.rectangle).not.toHaveBeenCalled();
    scenery.destroy();
  });

  it('spawn regions produce valid points in the large arena', () => {
    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = createRng(seed);
      const p = spawnPoint(arena, rng);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);

      // Must be in the inflated spawnable band (edges margin=28)
      expect(p.x).toBeGreaterThanOrEqual(-28);
      expect(p.x).toBeLessThanOrEqual(1228);
      expect(p.y).toBeGreaterThanOrEqual(-28);
      expect(p.y).toBeLessThanOrEqual(928);

      // Must NOT overlap any obstacle
      const inObs1 = p.x >= 500 && p.x <= 580 && p.y >= 200 && p.y <= 500;
      const inObs2 = p.x >= 700 && p.x <= 900 && p.y >= 400 && p.y <= 460;
      expect(inObs1 || inObs2).toBe(false);
    }
  });

  it('five-restart resource stability — arena resolves identically each time', () => {
    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);

    const results: Array<{ arenaId: string; width: number; height: number }> = [];
    for (let i = 0; i < 5; i += 1) {
      const request = assembleRunRequest(ctx, createRng(42 + i));
      const arena = ctx.arenas.arenaById(request.arenaId)!;
      results.push({
        arenaId: request.arenaId,
        width: arena.size.width,
        height: arena.size.height,
      });
    }

    for (const r of results) {
      expect(r.arenaId).toBe('large-test-field');
      expect(r.width).toBe(1200);
      expect(r.height).toBe(900);
    }
  });

  it('starter junkyard-lot arena is behaviourally identical to pre-Epic-7', () => {
    const ctx = makeContext();
    // Default selection is junkyard-lot
    const request = assembleRunRequest(ctx, createRng(42));
    expect(request.arenaId).toBe('junkyard-lot');

    const arena = ctx.arenas.arenaById(request.arenaId)!;
    expect(arena.size).toEqual({ width: 390, height: 844 });
    expect(arena.obstacles).toHaveLength(0);
    expect(arena.hazards).toHaveLength(0);
    expect(arena.spawnRegions).toHaveLength(1);
    expect(arena.spawnRegions[0]).toMatchObject({ kind: 'edges', margin: 28 });

    const curve = ctx.data.spawnCurves.find((c) => c.id === arena.spawnCurveId);
    expect(curve).toBeDefined();
    expect(curve!.durationSeconds).toBe(300);
  });
});