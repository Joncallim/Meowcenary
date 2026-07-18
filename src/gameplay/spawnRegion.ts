import type { Rng } from '../engine/rng';
import type { Vec2 } from '../engine/vector';
import type { ArenaDefinition, SpawnRegion } from '../systems/types';

const MAX_ATTEMPTS = 8;
const FALLBACK_BUDGET = 128;

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
    if (p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h) {
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
 * Fixed-budget stratified fallback search. Uses deterministic logarithmic-step
 * sweep (capped at FALLBACK_BUDGET calls to isValidPoint) followed by random
 * exploration. If all attempts exhaust, throws a descriptive error.
 */
function searchFallback(
  region: SpawnRegion,
  arena: Readonly<ArenaDefinition>,
  rng: Rng,
): Vec2 {
  let checks = 0;

  const tryPoint = (p: Vec2): Vec2 | null => {
    checks += 1;
    return isValidPoint(p, region, arena) ? p : null;
  };

  switch (region.kind) {
    case 'ring': {
      const midR = (region.minRadius + region.maxRadius) / 2;
      const radii = [midR, region.minRadius, region.maxRadius,
        (region.minRadius + midR) / 2, (midR + region.maxRadius) / 2];
      // Stratified sweep: 32 angles × radii
      for (let i = 0; i < 32 && checks < FALLBACK_BUDGET / 2; i += 1) {
        const a = (2 * Math.PI * i) / 32;
        for (const r of radii) {
          if (checks >= FALLBACK_BUDGET / 2) break;
          const found = tryPoint({ x: region.cx + r * Math.cos(a), y: region.cy + r * Math.sin(a) });
          if (found) return found;
        }
      }
      // Random scatter for the rest of the budget
      while (checks < FALLBACK_BUDGET) {
        const found = tryPoint(samplePoint(region, arena, rng));
        if (found) return found;
      }
      break;
    }
    case 'rect': {
      const COARSE_BUDGET = 40;
      const EDGE_BUDGET = 8;
      // Coarse grid: max 40 points across the region
      const maxDim = Math.max(region.w, region.h);
      for (let step = Math.max(2, Math.ceil(maxDim / 5)); step >= 2 && checks < COARSE_BUDGET; step = Math.floor(step / 2)) {
        for (let sx = region.x; sx <= region.x + region.w && checks < COARSE_BUDGET; sx += step) {
          for (let sy = region.y; sy <= region.y + region.h && checks < COARSE_BUDGET; sy += step) {
            const found = tryPoint({ x: sx, y: sy });
            if (found) return found;
          }
        }
      }
      // Edge/corner pass
      const pts = [
        { x: region.x, y: region.y },
        { x: region.x + region.w, y: region.y },
        { x: region.x, y: region.y + region.h },
        { x: region.x + region.w, y: region.y + region.h },
        { x: region.x + region.w / 2, y: region.y },
        { x: region.x + region.w / 2, y: region.y + region.h },
        { x: region.x, y: region.y + region.h / 2 },
        { x: region.x + region.w, y: region.y + region.h / 2 },
      ];
      for (const p of pts) {
        if (checks >= COARSE_BUDGET + EDGE_BUDGET) break;
        const found = tryPoint(p);
        if (found) return found;
      }
      // Random scatter — guaranteed budget
      while (checks < FALLBACK_BUDGET) {
        const found = tryPoint(samplePoint(region, arena, rng));
        if (found) return found;
      }
      break;
    }
    case 'edges': {
      const { width, height } = arena.size;
      const margin = region.margin;
      // Try all four edge midpoints first
      const edgePts = [
        { x: width / 2, y: -margin },
        { x: width + margin, y: height / 2 },
        { x: width / 2, y: height + margin },
        { x: -margin, y: height / 2 },
      ];
      for (const p of edgePts) {
        const found = tryPoint(p);
        if (found) return found;
      }
      // Random scatter
      while (checks < FALLBACK_BUDGET) {
        const found = tryPoint(samplePoint(region, arena, rng));
        if (found) return found;
      }
      break;
    }
  }

  throw new Error(
    `spawnPoint: exhausted ${FALLBACK_BUDGET} fallback candidates for region kind ` +
    `"${region.kind}" in arena; validation should have rejected or data is pathological`,
  );
}