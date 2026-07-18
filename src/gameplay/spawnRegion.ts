import type { Rng } from '../engine/rng';
import type { Vec2 } from '../engine/vector';
import type { ArenaDefinition, SpawnRegion } from '../systems/types';

const MAX_ATTEMPTS = 8;

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
  }
}

function isInsideSpawnableBand(
  p: Vec2,
  region: SpawnRegion,
  arena: Readonly<ArenaDefinition>,
): boolean {
  const { width, height } = arena.size;

  if (region.kind === 'ring' || region.kind === 'rect') {
    return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
  }

  const margin = region.margin;
  return p.x >= -margin && p.x <= width + margin && p.y >= -margin && p.y <= height + margin;
}

function inAnyObstacle(
  p: Vec2,
  obstacles: ReadonlyArray<{ readonly x: number; readonly y: number; readonly w: number; readonly h: number }>,
): boolean {
  for (const o of obstacles) {
    if (p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h) {
      return true;
    }
  }
  return false;
}

function isValidPoint(p: Vec2, region: SpawnRegion, arena: Readonly<ArenaDefinition>): boolean {
  if (!isInsideSpawnableBand(p, region, arena)) return false;
  if (region.kind !== 'edges' && inAnyObstacle(p, arena.obstacles)) return false;
  if (region.kind === 'ring') {
    const dx = p.x - region.cx;
    const dy = p.y - region.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < region.minRadius - 1e-9 || dist > region.maxRadius + 1e-9) return false;
  }
  return true;
}

/**
 * Deterministic cell-sweep witness for rect spawn regions.
 * Collects X/Y cut points from region bounds and obstacle edges clipped to the
 * region, builds a sorted unique axis list, then inspects the midpoint of every
 * cell with positive area. Returns the first valid midpoint, or null if the
 * region is fully covered by obstacles.
 *
 * Used both by `searchFallback` (runtime) and by `checkArena` (validation)
 * so the proof of spawnability is shared.
 */
export function findRectWitness(
  region: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  obstacles: ReadonlyArray<{ readonly x: number; readonly y: number; readonly w: number; readonly h: number }>,
): Vec2 | null {
  const x1 = region.x;
  const x2 = region.x + region.w;
  const y1 = region.y;
  const y2 = region.y + region.h;

  const xs = new Set<number>([x1, x2]);
  const ys = new Set<number>([y1, y2]);

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
      // Use strict interior check to avoid obstacle edges
      let blocked = false;
      for (const o of obstacles) {
        if (cx > o.x && cx < o.x + o.w && cy > o.y && cy < o.y + o.h) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return { x: cx, y: cy };
    }
  }

  return null;
}

/**
 * Fallback search for spawn points. For rect regions, uses the deterministic
 * cell-sweep witness (findRectWitness). For ring/edges, uses stratified sweep
 * followed by random scatter. Throws if no valid point is found — which should
 * not happen if validation accepted the region.
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

  // Ring and edges use stratified sweep + random scatter
  let checks = 0;
  const tryPoint = (p: Vec2): Vec2 | null => {
    if (checks >= 64) return null;
    checks += 1;
    return isValidPoint(p, region, arena) ? p : null;
  };

  if (region.kind === 'ring') {
    const midR = (region.minRadius + region.maxRadius) / 2;
    const radii = [midR, region.minRadius, region.maxRadius,
      (region.minRadius + midR) / 2, (midR + region.maxRadius) / 2];
    for (let i = 0; i < 32; i += 1) {
      const a = (2 * Math.PI * i) / 32;
      for (const r of radii) {
        const found = tryPoint({ x: region.cx + r * Math.cos(a), y: region.cy + r * Math.sin(a) });
        if (found) return found;
      }
    }
    while (checks < 64) {
      const found = tryPoint(samplePoint(region, arena, rng));
      if (found) return found;
    }
  } else {
    const { width, height } = arena.size;
    const margin = region.margin;
    for (const p of [
      { x: width / 2, y: -margin },
      { x: width + margin, y: height / 2 },
      { x: width / 2, y: height + margin },
      { x: -margin, y: height / 2 },
    ]) {
      const found = tryPoint(p);
      if (found) return found;
    }
    while (checks < 64) {
      const found = tryPoint(samplePoint(region, arena, rng));
      if (found) return found;
    }
  }

  throw new Error(
    `spawnPoint: exhausted fallback candidates for region kind "${region.kind}"`,
  );
}