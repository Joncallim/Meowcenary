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

  const fallback = fallbackPoint(region, arena);
  if (!isValidPoint(fallback, region, arena)) {
    throw new Error(
      `spawnPoint: exhausted all candidates for region kind "${region.kind}" ` +
      `in arena; validation should have rejected this configuration`,
    );
  }
  return fallback;
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

function fallbackPoint(region: SpawnRegion, arena: Readonly<ArenaDefinition>): Vec2 {
  const { width, height } = arena.size;

  switch (region.kind) {
    case 'ring': {
      const midR = (region.minRadius + region.maxRadius) / 2;
      const steps = 32;
      const radii = [midR, region.minRadius, region.maxRadius,
        (region.minRadius + midR) / 2, (midR + region.maxRadius) / 2,
        region.minRadius + (midR - region.minRadius) / 4,
        midR + (region.maxRadius - midR) / 4];
      for (let i = 0; i < steps; i += 1) {
        const a = (2 * Math.PI * i) / steps;
        for (const r of radii) {
          const p = { x: region.cx + r * Math.cos(a), y: region.cy + r * Math.sin(a) };
          if (isValidPoint(p, region, arena)) return p;
        }
      }
      const x = Math.max(0, Math.min(width, region.cx + midR));
      return { x, y: Math.max(0, Math.min(height, region.cy)) };
    }
    case 'rect': {
      const maxStep = Math.max(1, Math.min(region.w, region.h, 4));
      for (let step = 1; step <= maxStep; step *= 2) {
        for (let sx = region.x; sx <= region.x + region.w; sx += step) {
          for (let sy = region.y; sy <= region.y + region.h; sy += step) {
            const p = { x: sx, y: sy };
            if (isValidPoint(p, region, arena)) return p;
          }
        }
      }
      // Half-unit precision pass for thin strips
      const halfW = region.w / 2;
      const halfH = region.h / 2;
      for (const dx of [0, halfW, region.w]) {
        for (const dy of [0, halfH, region.h]) {
          const p = { x: region.x + dx, y: region.y + dy };
          if (isValidPoint(p, region, arena)) return p;
        }
      }
      return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
    }
    case 'edges': {
      return { x: width / 2, y: -region.margin };
    }
  }
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