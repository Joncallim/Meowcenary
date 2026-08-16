import type { Rng } from '../engine/rng';
import type { Vec2 } from '../engine/vector';
import type { ArenaDefinition, SpawnRegion } from '../systems/types';
import { clamp } from './curves';
import { ENEMY_BODY_RADIUS } from '../engine/bodyDimensions';

const MAX_ATTEMPTS = 8;
const SCATTER_ATTEMPTS = 16;

type ObstacleBounds = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

type RingRegion = Extract<SpawnRegion, { readonly kind: 'ring' }>;
type EdgeLane = Extract<SpawnRegion, { readonly kind: 'edge-lanes' }>['lanes'][number];

export function spawnPoint(arena: Readonly<ArenaDefinition>, rng: Rng): Vec2 {
  const regions = arena.spawnRegions;
  const region = regions[rng.int(0, regions.length - 1)];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const p = samplePoint(region, arena, rng);
    if (isValidPoint(p, region, arena)) {
      return p;
    }
  }

  return searchFallback(region, arena, rng);
}

function samplePoint(region: SpawnRegion, arena: Readonly<ArenaDefinition>, rng: Rng): Vec2 {
  switch (region.kind) {
    case 'ring': {
      const theta = rng.next() * 2 * Math.PI;
      const r = region.minRadius + rng.next() * (region.maxRadius - region.minRadius);
      return { x: region.cx + r * Math.cos(theta), y: region.cy + r * Math.sin(theta) };
    }
    case 'rect': {
      return {
        x: region.x + rng.next() * region.w,
        y: region.y + rng.next() * region.h,
      };
    }
    case 'edges': {
      const { width, height } = arena.size;
      const margin = region.margin;
      const side = rng.int(0, 3);
      switch (side) {
        case 0: return { x: rng.int(0, width), y: -margin };
        case 1: return { x: width + margin, y: rng.int(0, height) };
        case 2: return { x: rng.int(0, width), y: height + margin };
        default: return { x: -margin, y: rng.int(0, height) };
      }
    }
    case 'edge-lanes': {
      const lane = region.lanes[rng.int(0, region.lanes.length - 1)]!;
      const coordinate = lane.offset + ENEMY_BODY_RADIUS + rng.next() *
        (lane.width - ENEMY_BODY_RADIUS * 2);
      switch (lane.side) {
        case 'top': return { x: coordinate, y: region.inset };
        case 'right': return { x: arena.size.width - region.inset, y: coordinate };
        case 'bottom': return { x: coordinate, y: arena.size.height - region.inset };
        case 'left': return { x: region.inset, y: coordinate };
      }
    }
  }
}

function isInsideSpawnableBand(
  p: Vec2,
  region: SpawnRegion,
  arena: Readonly<ArenaDefinition>,
): boolean {
  const { width, height } = arena.size;

  if (region.kind === 'ring' || region.kind === 'rect' || region.kind === 'edge-lanes') {
    return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
  }

  const margin = region.margin;
  return p.x >= -margin && p.x <= width + margin && p.y >= -margin && p.y <= height + margin;
}

function inAnyObstacle(
  p: Vec2,
  obstacles: readonly ObstacleBounds[],
): boolean {
  for (const o of obstacles) {
    if (p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h) {
      return true;
    }
  }
  return false;
}

function isInsideRing(p: Vec2, region: RingRegion): boolean {
  const distance = Math.hypot(p.x - region.cx, p.y - region.cy);
  return distance >= region.minRadius - 1e-9 && distance <= region.maxRadius + 1e-9;
}

function isValidPoint(p: Vec2, region: SpawnRegion, arena: Readonly<ArenaDefinition>): boolean {
  if (!isInsideSpawnableBand(p, region, arena)) return false;
  if (inAnyObstacle(p, arena.obstacles)) return false;
  if (region.kind === 'ring' && !isInsideRing(p, region)) return false;
  return true;
}

/**
 * Deterministic cell-sweep witness for rect spawn regions.
 * Collects X/Y cut points from region bounds and obstacle edges clipped to the
 * region, builds a sorted unique axis list, then inspects the midpoint of every
 * cell with positive area. Uses the shared `inAnyObstacle` predicate so edge
 * semantics match runtime collision. Returns the first valid midpoint, or null
 * if the region is fully covered by obstacles.
 */
export function findRectWitness(
  region: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  obstacles: readonly ObstacleBounds[],
): Vec2 | null {
  const xs = new Set<number>([region.x, region.x + region.w]);
  const ys = new Set<number>([region.y, region.y + region.h]);

  for (const o of obstacles) {
    if (o.x + o.w <= region.x || o.x >= region.x + region.w) continue;
    if (o.y + o.h <= region.y || o.y >= region.y + region.h) continue;
    xs.add(Math.max(region.x, o.x));
    xs.add(Math.min(region.x + region.w, o.x + o.w));
    ys.add(Math.max(region.y, o.y));
    ys.add(Math.min(region.y + region.h, o.y + o.h));
  }

  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);

  for (let ix = 0; ix < sortedX.length - 1; ix += 1) {
    const cx = (sortedX[ix] + sortedX[ix + 1]) / 2;
    for (let iy = 0; iy < sortedY.length - 1; iy += 1) {
      const cy = (sortedY[iy] + sortedY[iy + 1]) / 2;
      // Cell midpoints are interior to positive-area cut intervals;
      // use shared predicate for consistent edge semantics.
      if (!inAnyObstacle({ x: cx, y: cy }, obstacles)) return { x: cx, y: cy };
    }
  }

  return null;
}

/**
 * Deterministic witness for a single edge-lane's body-safe strip. The lane's
 * side and the region's inset fix one axis (the cross-axis coordinate); only
 * the along-lane axis varies over [low, high]. Obstacles that actually cross
 * the fixed coordinate (expanded by the enemy body radius) partition that
 * interval into cells; the first cell whose midpoint clears every such
 * obstacle is the witness. One-dimensional sibling of findRectWitness's
 * cell-sweep, and the single source of truth both validation and runtime
 * fallback use so "spawnable" means the same thing in both places.
 */
export function findEdgeLaneWitness(
  lane: EdgeLane,
  inset: number,
  arenaSize: { readonly width: number; readonly height: number },
  obstacles: readonly ObstacleBounds[],
): Vec2 | null {
  const low = lane.offset + ENEMY_BODY_RADIUS;
  const high = lane.offset + lane.width - ENEMY_BODY_RADIUS;
  if (low > high) return null;

  const horizontal = lane.side === 'top' || lane.side === 'bottom';
  const coordinate = lane.side === 'top' || lane.side === 'left'
    ? inset
    : lane.side === 'right' ? arenaSize.width - inset : arenaSize.height - inset;

  const spans: Array<[number, number]> = [];
  for (const o of obstacles) {
    const expanded = {
      x: o.x - ENEMY_BODY_RADIUS, y: o.y - ENEMY_BODY_RADIUS,
      w: o.w + ENEMY_BODY_RADIUS * 2, h: o.h + ENEMY_BODY_RADIUS * 2,
    };
    const crosses = horizontal
      ? coordinate >= expanded.y && coordinate <= expanded.y + expanded.h
      : coordinate >= expanded.x && coordinate <= expanded.x + expanded.w;
    if (crosses) {
      spans.push(horizontal ? [expanded.x, expanded.x + expanded.w] : [expanded.y, expanded.y + expanded.h]);
    }
  }

  const covered = (point: number): boolean => spans.some(([start, end]) => point >= start && point <= end);
  const cuts = [...new Set([low, high, ...spans.flat().filter((c) => c > low && c < high)])]
    .sort((a, b) => a - b);

  for (let i = 0; i < cuts.length - 1; i += 1) {
    const mid = (cuts[i]! + cuts[i + 1]!) / 2;
    if (!covered(mid)) return horizontal ? { x: mid, y: coordinate } : { x: coordinate, y: mid };
  }
  if (low === high && !covered(low)) {
    return horizontal ? { x: low, y: coordinate } : { x: coordinate, y: low };
  }
  return null;
}

function distanceFromRingCentre(p: Vec2, region: RingRegion): number {
  return Math.hypot(p.x - region.cx, p.y - region.cy);
}

function pointAtRadiusInCell(
  region: RingRegion,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Vec2 | null {
  const nearest = {
    x: clamp(region.cx, x1, x2),
    y: clamp(region.cy, y1, y2),
  };
  const corners = [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x1, y: y2 },
    { x: x2, y: y2 },
  ];
  const farthest = corners.reduce((best, candidate) =>
    distanceFromRingCentre(candidate, region) > distanceFromRingCentre(best, region)
      ? candidate
      : best,
  );

  const nearestRadius = distanceFromRingCentre(nearest, region);
  const farthestRadius = distanceFromRingCentre(farthest, region);
  const lowRadius = Math.max(region.minRadius, nearestRadius);
  const highRadius = Math.min(region.maxRadius, farthestRadius);
  if (lowRadius > highRadius + 1e-9) return null;

  const targetRadius = (lowRadius + highRadius) / 2;
  if (Math.abs(targetRadius - nearestRadius) <= 1e-9) return nearest;
  if (Math.abs(targetRadius - farthestRadius) <= 1e-9) return farthest;

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const t = (low + high) / 2;
    const candidate = {
      x: nearest.x + (farthest.x - nearest.x) * t,
      y: nearest.y + (farthest.y - nearest.y) * t,
    };
    if (distanceFromRingCentre(candidate, region) < targetRadius) low = t;
    else high = t;
  }

  return {
    x: nearest.x + (farthest.x - nearest.x) * high,
    y: nearest.y + (farthest.y - nearest.y) * high,
  };
}

/**
 * Deterministic witness for a ring region inside arena bounds and outside the
 * union of axis-aligned obstacles. Obstacle edges partition the arena into
 * cells whose interiors have constant coverage. For each open cell, the
 * minimum and maximum distance to the ring centre prove whether the annulus
 * intersects it; a monotonic segment search then constructs the witness.
 */
export function findRingWitness(
  region: RingRegion,
  size: { readonly width: number; readonly height: number },
  obstacles: readonly ObstacleBounds[],
): Vec2 | null {
  const isValid = (p: Vec2): boolean =>
    p.x >= 0 && p.x <= size.width &&
    p.y >= 0 && p.y <= size.height &&
    !inAnyObstacle(p, obstacles) &&
    isInsideRing(p, region);

  const xs = new Set<number>([0, size.width]);
  const ys = new Set<number>([0, size.height]);
  for (const obstacle of obstacles) {
    if (obstacle.x + obstacle.w <= 0 || obstacle.x >= size.width) continue;
    if (obstacle.y + obstacle.h <= 0 || obstacle.y >= size.height) continue;
    xs.add(clamp(obstacle.x, 0, size.width));
    xs.add(clamp(obstacle.x + obstacle.w, 0, size.width));
    ys.add(clamp(obstacle.y, 0, size.height));
    ys.add(clamp(obstacle.y + obstacle.h, 0, size.height));
  }

  const sortedX = [...xs].sort((a, b) => a - b);
  const sortedY = [...ys].sort((a, b) => a - b);

  for (const corner of [
    { x: 0, y: 0 },
    { x: size.width, y: 0 },
    { x: 0, y: size.height },
    { x: size.width, y: size.height },
  ]) {
    if (isValid(corner)) return corner;
  }

  for (let xIndex = 0; xIndex < sortedX.length - 1; xIndex += 1) {
    const x1 = sortedX[xIndex];
    const x2 = sortedX[xIndex + 1];
    if (x2 <= x1) continue;
    for (let yIndex = 0; yIndex < sortedY.length - 1; yIndex += 1) {
      const y1 = sortedY[yIndex];
      const y2 = sortedY[yIndex + 1];
      if (y2 <= y1) continue;

      const midpoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
      if (inAnyObstacle(midpoint, obstacles)) continue;

      const witness = pointAtRadiusInCell(region, x1, y1, x2, y2);
      if (witness && isValid(witness)) return witness;
    }
  }

  return null;
}

/**
 * Fallback search for spawn points.
 * - Rect: uses the deterministic cell-sweep witness (findRectWitness).
 * - Ring: deterministic cell-sweep witness (findRingWitness).
 * - Edges: edge midpoints + random scatter.
 * - Edge-lanes: deterministic per-lane witness (findEdgeLaneWitness).
 */
function searchFallback(
  region: SpawnRegion,
  arena: Readonly<ArenaDefinition>,
  rng: Rng,
): Vec2 {
  if (region.kind === 'rect') {
    const witness = findRectWitness(
      { x: region.x, y: region.y, w: region.w, h: region.h },
      arena.obstacles,
    );
    if (witness && isValidPoint(witness, region, arena)) return witness;
    throw new Error(
      `spawnPoint: rectangle region has no spawnable point — ` +
      `validation should have rejected`,
    );
  }

  if (region.kind === 'ring') {
    const witness = findRingWitness(region, arena.size, arena.obstacles);
    if (witness && isValidPoint(witness, region, arena)) return witness;
    throw new Error(
      `spawnPoint: ring region has no spawnable point — ` +
      `validation should have rejected`,
    );
  } else if (region.kind === 'edges') {
    // Edges
    const { width, height } = arena.size;
    const margin = region.margin;
    for (const p of [
      { x: width / 2, y: -margin },
      { x: width + margin, y: height / 2 },
      { x: width / 2, y: height + margin },
      { x: -margin, y: height / 2 },
    ]) {
      if (isValidPoint(p, region, arena)) return p;
    }
    for (let attempt = 0; attempt < SCATTER_ATTEMPTS; attempt += 1) {
      const p = samplePoint(region, arena, rng);
      if (isValidPoint(p, region, arena)) return p;
    }
  } else {
    for (const lane of region.lanes) {
      const witness = findEdgeLaneWitness(lane, region.inset, arena.size, arena.obstacles);
      if (witness && isValidPoint(witness, region, arena)) return witness;
    }
  }

  throw new Error(
    `spawnPoint: exhausted fallback candidates for region kind "${region.kind}"`,
  );
}
