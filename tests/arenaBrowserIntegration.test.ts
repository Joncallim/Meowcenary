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
    expect(mockScene.add.rectangle).toHaveBeenCalledTimes(2);
    // Obstacle top-left→Phaser centre conversion
    expect(mockScene.add.rectangle).toHaveBeenCalledWith(540, 350, 80, 300, 0x2a3642);
    expect(mockScene.add.rectangle).toHaveBeenCalledWith(800, 430, 200, 60, 0x2a3642);

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

  it('spawnPoint produces obstacle-free points in all regions (50 seeds)', () => {
    const ctx = makeContext();
    ctx.selectArena('large-test-field', ctx.arenaSelectionRevision);
    const arena = ctx.arenas.arenaById('large-test-field')!;

    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = createRng(seed);
      const p = spawnPoint(arena, rng);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);

      // Edges band: [-28, 1228] × [-28, 928]
      expect(p.x).toBeGreaterThanOrEqual(-28);
      expect(p.x).toBeLessThanOrEqual(1228);
      expect(p.y).toBeGreaterThanOrEqual(-28);
      expect(p.y).toBeLessThanOrEqual(928);

      // Must NOT overlap any obstacle (inclusive check matches Arcade collision)
      const inObs1 = p.x >= 500 && p.x <= 580 && p.y >= 200 && p.y <= 500;
      const inObs2 = p.x >= 700 && p.x <= 900 && p.y >= 400 && p.y <= 460;
      expect(inObs1 || inObs2).toBe(false);
    }
  });

  it('edge spawns at margin=0 avoid boundary obstacles', () => {
    const ctx = makeContext({
      ...LARGE_ARENA,
      size: { width: 400, height: 400 },
      spawnRegions: [{ kind: 'edges', margin: 0 }],
      obstacles: [{ x: 50, y: 0, w: 100, h: 50 }],
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
});