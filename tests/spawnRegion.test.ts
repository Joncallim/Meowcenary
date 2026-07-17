import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { spawnPoint } from '../src/gameplay/spawnRegion';
import type { ArenaDefinition } from '../src/systems/types';

const canvasArena: ArenaDefinition = {
  id: 'test',
  name: 'Test',
  size: { width: 390, height: 844 },
  spawnCurveId: 'test',
  spawnRegions: [{ kind: 'edges', margin: 28 }],
  obstacles: [],
  hazards: [],
  unlock: { type: 'default' },
};

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
      obstacles: [{ x: 50, y: 50, w: 100, h: 100 }],
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
    // With 8 retry attempts, most points should avoid the obstacle
    // The fallback may still land inside due to the rect center being within the obstacle.
    // For this test, we verify the vast majority avoid it.
    expect(insideObstacleCount).toBeLessThanOrEqual(50);
  });
});