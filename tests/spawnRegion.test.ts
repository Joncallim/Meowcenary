import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../src/engine/rng';
import { spawnPoint } from '../src/gameplay/spawnRegion';
import type { ArenaDefinition } from '../src/systems/types';
import { TEST_ARENA_VISUAL } from './helpers/arena';

const canvasArena: ArenaDefinition = {
  id: 'test',
  name: 'Test',
  size: { width: 390, height: 844 },
  spawnCurveId: 'test',
  spawnRegions: [{ kind: 'edges', margin: 28 }],
  obstacles: [],
  hazards: [],
  visual: TEST_ARENA_VISUAL,
  unlock: { type: 'default' },
};

function sequenceRng(values: readonly number[]): Rng {
  let index = 0;
  return {
    next() {
      const value = values[index];
      index += 1;
      if (value === undefined) throw new Error('sequenceRng exhausted');
      return value;
    },
    int() { return 0; },
    pick<T>(items: readonly T[]) { return items[0]; },
    weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>) { return entries[0].item; },
  };
}

describe('spawnPoint', () => {
  it('edges region produces points matching the four screen-edge branches', () => {
    const rng = createRng(42);
    // Collect many points and ensure they all fall into the expected edge bands
    for (let i = 0; i < 100; i += 1) {
      const p = spawnPoint(canvasArena, rng);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);

      const { width, height } = canvasArena.size;
      const margin = 28;
      // Must be in one of the four edge bands
      const onTop = p.y === -margin && p.x >= 0 && p.x <= width;
      const onRight = p.x === width + margin && p.y >= 0 && p.y <= height;
      const onBottom = p.y === height + margin && p.x >= 0 && p.x <= width;
      const onLeft = p.x === -margin && p.y >= 0 && p.y <= height;
      expect(onTop || onRight || onBottom || onLeft).toBe(true);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const rng1 = createRng(123);
    const rng2 = createRng(123);
    for (let i = 0; i < 20; i += 1) {
      const p1 = spawnPoint(canvasArena, rng1);
      const p2 = spawnPoint(canvasArena, rng2);
      expect(p1.x).toBe(p2.x);
      expect(p1.y).toBe(p2.y);
    }
  });

  it('ring region returns points within the ring and in bounds', () => {
    const ringArena: ArenaDefinition = {
      ...canvasArena,
      size: { width: 400, height: 400 },
      spawnRegions: [{ kind: 'ring', cx: 200, cy: 200, minRadius: 50, maxRadius: 150 }],
    };
    const rng = createRng(99);
    for (let i = 0; i < 100; i += 1) {
      const p = spawnPoint(ringArena, rng);
      const dist = Math.sqrt((p.x - 200) ** 2 + (p.y - 200) ** 2);
      // Allow a tiny epsilon for floating point
      expect(dist).toBeGreaterThanOrEqual(49.99);
      expect(dist).toBeLessThanOrEqual(150.01);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(400);
    }
  });

  it('rect region returns points within the rect and in bounds', () => {
    const rectArena: ArenaDefinition = {
      ...canvasArena,
      size: { width: 400, height: 400 },
      spawnRegions: [{ kind: 'rect', x: 50, y: 50, w: 100, h: 200 }],
    };
    const rng = createRng(77);
    for (let i = 0; i < 100; i += 1) {
      const p = spawnPoint(rectArena, rng);
      expect(p.x).toBeGreaterThanOrEqual(50);
      expect(p.x).toBeLessThanOrEqual(150);
      expect(p.y).toBeGreaterThanOrEqual(50);
      expect(p.y).toBeLessThanOrEqual(250);
    }
  });

  it('returns finite coordinates always', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i += 1) {
      const p = spawnPoint(canvasArena, rng);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('avoids obstacles when sampling a rect region that overlaps an obstacle', () => {
    const arenaWithObstacle: ArenaDefinition = {
      ...canvasArena,
      size: { width: 400, height: 400 },
      spawnRegions: [{ kind: 'rect', x: 0, y: 0, w: 200, h: 200 }],
      obstacles: [{ id: 'block', x: 50, y: 50, w: 100, h: 100 }],
    };
    const rng = createRng(55);
    let insideObstacleCount = 0;
    for (let i = 0; i < 200; i += 1) {
      const p = spawnPoint(arenaWithObstacle, rng);
      if (
        p.x >= 50 && p.x <= 150 &&
        p.y >= 50 && p.y <= 150
      ) {
        insideObstacleCount += 1;
      }
    }
    expect(insideObstacleCount).toBe(0);
  });

  it('rejects a deterministic candidate exactly on an obstacle edge', () => {
    const arena: ArenaDefinition = {
      id: 'test', name: 'Test', size: { width: 400, height: 400 },
      spawnCurveId: 'test', hazards: [], unlock: { type: 'default' },
      spawnRegions: [{ kind: 'ring', cx: 200, cy: 200, minRadius: 50, maxRadius: 100 }],
      obstacles: [{ id: 'block', x: 275, y: 150, w: 50, h: 100 }],
      visual: TEST_ARENA_VISUAL,
    };

    // First candidate: angle 0, radius 75 => (275, 200), exactly on the
    // obstacle's left edge. Second candidate is the opposite valid point.
    const p = spawnPoint(arena, sequenceRng([0, 0.5, 0.5, 0.5]));

    expect(p.x).toBeCloseTo(125);
    expect(p.y).toBeCloseTo(200);
    expect(p.x >= 275 && p.x <= 325 && p.y >= 150 && p.y <= 250).toBe(false);
  });

  it('returns total points for a bottom-edge ring', () => {
    const arena: ArenaDefinition = {
      id: 'test', name: 'Test', size: { width: 400, height: 400 },
      spawnCurveId: 'test', hazards: [], unlock: { type: 'default' },
      spawnRegions: [{ kind: 'ring', cx: 200, cy: 400, minRadius: 390, maxRadius: 400 }],
      obstacles: [],
      visual: TEST_ARENA_VISUAL,
    };
    // Includes the former first failure at seed 146; the deterministic witness
    // makes the result total rather than probabilistic.
    for (let seed = 1; seed <= 1_000; seed += 1) {
      const rng = createRng(seed);
      const p = spawnPoint(arena, rng);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      // Must be in bounds
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(400);
      // Must be on the annulus
      const dist = Math.sqrt((p.x - 200) ** 2 + (p.y - 400) ** 2);
      expect(dist).toBeGreaterThanOrEqual(389.99);
      expect(dist).toBeLessThanOrEqual(400.01);
    }
  });

  it('uses a deterministic witness for a narrow obstacle-constrained ring arc', () => {
    const obstacles = [
      { id: 'left', x: 40, y: 40, w: 60, h: 120 },
      { id: 'top', x: 100, y: 40, w: 60, h: 59 },
      { id: 'bottom', x: 100, y: 101, w: 60, h: 59 },
      { id: 'strip', x: 100, y: 99, w: 49, h: 2 },
    ];
    const arena: ArenaDefinition = {
      id: 'test', name: 'Test', size: { width: 400, height: 400 },
      spawnCurveId: 'test', hazards: [], unlock: { type: 'default' },
      spawnRegions: [{ kind: 'ring', cx: 100, cy: 100, minRadius: 50, maxRadius: 60 }],
      obstacles,
      visual: TEST_ARENA_VISUAL,
    };

    // All eight random samples target the covered left arc; fallback must find
    // the narrow open strip at x=149..160, y=99..101 deterministically.
    const p = spawnPoint(arena, sequenceRng(Array(16).fill(0.5)));
    const distance = Math.hypot(p.x - 100, p.y - 100);

    expect(distance).toBeGreaterThanOrEqual(50);
    expect(distance).toBeLessThanOrEqual(60);
    expect(obstacles.some((obstacle) =>
      p.x >= obstacle.x && p.x <= obstacle.x + obstacle.w &&
      p.y >= obstacle.y && p.y <= obstacle.y + obstacle.h,
    )).toBe(false);
  });

  it('corner ring (0,0,500,550) in 400x400 has valid points', () => {
    const arena: ArenaDefinition = {
      id: 'test', name: 'Test', size: { width: 400, height: 400 },
      spawnCurveId: 'test', hazards: [], unlock: { type: 'default' },
      spawnRegions: [{ kind: 'ring', cx: 0, cy: 0, minRadius: 500, maxRadius: 550 }],
      obstacles: [],
      visual: TEST_ARENA_VISUAL,
    };
    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = createRng(seed);
      const p = spawnPoint(arena, rng);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(400);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(400);
      const dist = Math.sqrt((p.x - 0) ** 2 + (p.y - 0) ** 2);
      expect(dist).toBeGreaterThanOrEqual(499.99);
      expect(dist).toBeLessThanOrEqual(550.01);
    }
  });

  it('samples all inside-edge lanes within body-safe intervals', () => {
    const arena: ArenaDefinition = {
      ...canvasArena,
      size: { width: 768, height: 1344 },
      spawnRegions: [{
        kind: 'edge-lanes', inset: 20,
        lanes: [
          { side: 'top', offset: 160, width: 96 },
          { side: 'right', offset: 896, width: 96 },
          { side: 'bottom', offset: 512, width: 96 },
          { side: 'left', offset: 320, width: 96 },
        ],
      }],
    };
    let nextSide = 0;
    const rng: Rng = {
      next: () => 0.5,
      int: (_min, max) => {
        if (max === 0) return 0;
        const side = nextSide;
        nextSide = (nextSide + 1) % (max + 1);
        return side;
      },
      pick: <T>(items: readonly T[]) => items[0]!,
      weighted: <T>(entries: ReadonlyArray<{ item: T; weight: number }>) => entries[0]!.item,
    };
    const points = Array.from({ length: 4 }, () => spawnPoint(arena, rng));
    expect(points).toEqual([
      { x: 208, y: 20 },
      { x: 748, y: 944 },
      { x: 560, y: 1324 },
      { x: 20, y: 368 },
    ]);
  });
});
