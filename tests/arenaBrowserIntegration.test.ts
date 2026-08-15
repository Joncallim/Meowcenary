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
import { spawnPoint, findRectWitness } from '../src/gameplay/spawnRegion';
import { assembleRunRequest } from '../src/gameplay/runRequest';
import { TEST_ARENA_VISUAL } from './helpers/arena';
import { DataVisualArtRegistry } from '../src/systems/visualArt';

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
    { id: 'press', x: 500, y: 200, w: 80, h: 300 },
    { id: 'stack', x: 700, y: 400, w: 200, h: 60 },
  ],
  hazards: [
    { id: 'acid-pool', kind: 'acid', x: 50, y: 50, w: 200, h: 200, damagePerSecond: 15 },
  ],
  visual: TEST_ARENA_VISUAL,
  unlock: { type: 'default' as const },
};

describe('arena data-level integration', () => {
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

  it('resolves the large arena through assembleRunRequest→registry→curve', () => {
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

  it('buildArenaScenery creates correct obstacle bodies from data', () => {
    const mockScene = {
      add: {
        rectangle: vi.fn(() => {
          const node = { setVisible: vi.fn(() => node) };
          return node;
        }),
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
    expect(mockScene.add.rectangle).toHaveBeenCalledTimes(2);
    // Obstacle top-left→Phaser centre conversion
    expect(mockScene.add.rectangle).toHaveBeenCalledWith(540, 350, 80, 300, 0x000000, 0);
    expect(mockScene.add.rectangle).toHaveBeenCalledWith(800, 430, 200, 60, 0x000000, 0);

    scenery.destroy();
  });

  it('empty obstacles produce no rectangle calls', () => {
    const group = { add: vi.fn(), destroy: vi.fn(), children: { size: 0 } };
    const mockScene = {
      add: { rectangle: vi.fn() },
      physics: {
        add: { existing: vi.fn(), staticGroup: vi.fn(() => group) },
      },
    };

    const ctx = makeContext({
      ...LARGE_ARENA,
      obstacles: [],
      hazards: [],
      spawnRegions: [{ kind: 'edges', margin: 28 }],
    });
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    const scenery = buildArenaScenery(mockScene as never, arena);
    expect(mockScene.add.rectangle).not.toHaveBeenCalled();
    scenery.destroy();
  });

  it('renders the authored grid, exact visual gates, and only two authoritative colliders', () => {
    const data = loadGameData();
    const arena = data.arenas[0];
    const images: Array<{ textureKey: string; destroyed: boolean }> = [];
    const addImage = vi.fn((_x: number, _y: number, textureKey: string) => {
      const node = {
        textureKey,
        destroyed: false,
        setDisplaySize: vi.fn(() => node), setDepth: vi.fn(() => node),
        setRotation: vi.fn(() => node), setFlipX: vi.fn(() => node),
        destroy: vi.fn(() => { node.destroyed = true; }),
      };
      images.push(node);
      return node;
    });
    const rectangles: unknown[] = [];
    const addRectangle = vi.fn(() => {
      const node = { setVisible: vi.fn(() => node) };
      rectangles.push(node);
      return node;
    });
    const group = { add: vi.fn(), destroy: vi.fn(), children: { size: 2 } };
    const scene = {
      add: { image: addImage, rectangle: addRectangle },
      textures: { exists: () => true },
      physics: { add: { existing: vi.fn(), staticGroup: vi.fn(() => group) } },
    };

    const scenery = buildArenaScenery(
      scene as never,
      arena,
      new DataVisualArtRegistry(data),
    );

    const floorCount = (arena.size.width / 32) * (arena.size.height / 32);
    const boundaryCount = (arena.size.width / 32) * 2 + (arena.size.height / 32 - 2) * 2;
    expect(addImage).toHaveBeenCalledTimes(
      floorCount + boundaryCount + arena.visual.decorations.length + arena.obstacles.length,
    );
    expect(images.filter((image) => image.textureKey === 'art-world-junkyard-boundary-gate')).toHaveLength(12);
    expect(addRectangle).toHaveBeenCalledTimes(2);
    expect(scene.physics.add.existing).toHaveBeenCalledTimes(2);
    expect(group.add).toHaveBeenCalledTimes(2);

    scenery.destroy();
    expect(images.every((image) => image.destroyed)).toBe(true);
    expect(group.destroy).toHaveBeenCalledWith(true);
  });

  it('spawnPoint produces obstacle-free points (rect region overlapping obstacle, 50 seeds)', () => {
    const arena = {
      id: 'overlap-test', name: 'Overlap Test', size: { width: 400, height: 400 },
      spawnCurveId: 'junkyard-intro',
      spawnRegions: [{ kind: 'rect' as const, x: 200, y: 100, w: 200, h: 200 }],
      obstacles: [{ id: 'block', x: 250, y: 150, w: 100, h: 100 }],
      hazards: [],
      visual: TEST_ARENA_VISUAL,
      unlock: { type: 'default' as const },
    };
    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = createRng(seed);
      const p = spawnPoint(arena, rng);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      const inObs = p.x >= 250 && p.x <= 350 && p.y >= 150 && p.y <= 250;
      expect(inObs).toBe(false);
    }
  });

  it('edge spawns at margin=0 avoid boundary obstacles', () => {
    const ctx = makeContext({
      ...LARGE_ARENA,
      size: { width: 400, height: 400 },
      spawnRegions: [{ kind: 'edges', margin: 0 }],
      obstacles: [{ id: 'edge-block', x: 50, y: 0, w: 100, h: 50 }],
      hazards: [],
    });
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = createRng(seed);
      const p = spawnPoint(arena, rng);
      // Must not land inside the top-edge obstacle
      const inObs = p.x >= 50 && p.x <= 150 && p.y >= 0 && p.y <= 50;
      expect(inObs).toBe(false);
    }
  });

  it('findRectWitness returns null when region is fully covered', () => {
    const witness = findRectWitness(
      { x: 0, y: 0, w: 100, h: 100 },
      [
        { x: 0, y: 0, w: 100, h: 50 },
        { x: 0, y: 50, w: 100, h: 50 },
      ],
    );
    expect(witness).toBeNull();
  });

  it('findRectWitness finds open cell between obstacles', () => {
    const witness = findRectWitness(
      { x: 0, y: 0, w: 100, h: 100 },
      [
        { x: 0, y: 0, w: 100, h: 49 },
        { x: 0, y: 51, w: 100, h: 49 },
      ],
    );
    expect(witness).not.toBeNull();
    expect(witness!.x).toBeGreaterThan(0);
    expect(witness!.x).toBeLessThan(100);
    expect(witness!.y).toBeCloseTo(50, 0);
  });

  it('arena selection persists across 5 simulated restarts', () => {
    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    for (let restart = 1; restart <= 5; restart += 1) {
      const request = assembleRunRequest(ctx, createRng(100 + restart));
      expect(request.arenaId).toBe('large-test-field');
      const arena = ctx.arenas.arenaById(request.arenaId)!;
      expect(arena.size.width).toBe(1200);
      expect(arena.size.height).toBe(900);
    }
  });
});
