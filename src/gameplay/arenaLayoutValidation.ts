import { findRectWitness, findRingWitness } from './spawnRegion';
import { PLAYER_BODY_RADIUS } from '../engine/bodyDimensions';
import type { ArenaDefinition, ObstacleDefinition } from '../systems/types';

export const ARENA_VALIDATION_CELL = 8;
export const ARENA_MAX_VALIDATION_CELLS = 65_536;
export const ARENA_CLEARANCE = PLAYER_BODY_RADIUS + 8;
export interface ArenaPoint {
  readonly x: number;
  readonly y: number;
}
export interface ArenaRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export const overlaps = (a: ArenaRect, b: ArenaRect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
export const inflate = (r: ArenaRect, n: number): ArenaRect => ({
  x: r.x - n,
  y: r.y - n,
  w: r.w + n * 2,
  h: r.h + n * 2,
});

export function arenaWitnesses(
  arena: Readonly<ArenaDefinition>,
  hasBoss: boolean,
): ArenaPoint[] {
  const { width: w, height: h } = arena.size;
  const points: ArenaPoint[] = [{ x: w / 2, y: h / 2 }];
  if (hasBoss) points.push({ x: w / 2, y: Math.max(80, h * 0.2) });
  for (const region of arena.spawnRegions)
    if (region.kind === 'edge-lanes')
      for (const lane of region.lanes) {
        const mid = lane.offset + lane.width / 2;
        points.push(
          lane.side === 'top'
            ? { x: mid, y: 64 }
            : lane.side === 'bottom'
              ? { x: mid, y: h - 64 }
              : lane.side === 'left'
                ? { x: 64, y: mid }
                : { x: w - 64, y: mid },
        );
      }
  for (const region of arena.spawnRegions) {
    if (region.kind === 'rect' || region.kind === 'ring') {
      const blocked = [...arena.obstacles, ...arena.hazards].map((r) =>
        inflate(r, ARENA_CLEARANCE),
      );
      const witness =
        region.kind === 'rect'
          ? findRectWitness(region, blocked)
          : findRingWitness(region, arena.size, blocked);
      // A missing witness must fail attachment rather than silently omit a route.
      points.push(witness ?? { x: -1, y: -1 });
    } else if (region.kind === 'edges') {
      points.push(
        { x: w / 2, y: 64 },
        { x: w / 2, y: h - 64 },
        { x: 64, y: h / 2 },
        { x: w - 64, y: h / 2 },
      );
    }
  }
  return points;
}

export function arenaReservations(
  arena: Readonly<ArenaDefinition>,
  hasBoss: boolean,
): ArenaRect[] {
  const { width: w, height: h } = arena.size;
  const reserves = arenaWitnesses(arena, hasBoss)
    .slice(0, hasBoss ? 2 : 1)
    .map((p) => ({ x: p.x - 96, y: p.y - 96, w: 192, h: 192 }));
  for (const region of arena.spawnRegions)
    if (region.kind === 'edge-lanes')
      for (const lane of region.lanes) {
        reserves.push(
          lane.side === 'top'
            ? { x: lane.offset, y: 0, w: lane.width, h: 128 }
            : lane.side === 'bottom'
              ? { x: lane.offset, y: h - 128, w: lane.width, h: 128 }
              : lane.side === 'left'
                ? { x: 0, y: lane.offset, w: 128, h: lane.width }
                : { x: w - 128, y: lane.offset, w: 128, h: lane.width },
        );
      }
  return reserves;
}

function segmentClear(
  a: ArenaPoint,
  b: ArenaPoint,
  blockers: readonly ArenaRect[],
): boolean {
  for (const box of blockers) {
    let enter = 0;
    let leave = 1;
    for (const [origin, delta, min, max] of [
      [a.x, b.x - a.x, box.x, box.x + box.w],
      [a.y, b.y - a.y, box.y, box.y + box.h],
    ]) {
      if (delta === 0) {
        if (origin < min || origin > max) {
          enter = 2;
          break;
        }
      } else {
        const t1 = (min - origin) / delta;
        const t2 = (max - origin) / delta;
        enter = Math.max(enter, Math.min(t1, t2));
        leave = Math.min(leave, Math.max(t1, t2));
      }
    }
    if (enter <= leave) return false;
  }
  return true;
}

/** Conservative four-neighbour connectivity; hazards are unavailable safe routes.
 * Cells intersecting inflated footprints are blocked, including their edges. */
export function validateArenaLayoutGeometry(
  arena: Readonly<ArenaDefinition>,
  hasBoss = false,
): { readonly valid: boolean; readonly reason?: string } {
  const { width, height } = arena.size;
  const columns = Math.ceil(width / ARENA_VALIDATION_CELL);
  const rows = Math.ceil(height / ARENA_VALIDATION_CELL);
  if (
    !Number.isFinite(columns * rows) ||
    columns * rows > ARENA_MAX_VALIDATION_CELLS
  )
    return { valid: false, reason: 'validation-cell-budget' };
  const obstacles: readonly ObstacleDefinition[] = arena.obstacles;
  for (const r of [...obstacles, ...arena.hazards])
    if (r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height)
      return { valid: false, reason: 'out-of-bounds' };
  for (let i = 0; i < obstacles.length; i++)
    for (let j = i + 1; j < obstacles.length; j++)
      if (overlaps(obstacles[i]!, obstacles[j]!))
        return { valid: false, reason: 'obstacle-overlap' };
  if (obstacles.reduce((sum, r) => sum + r.w * r.h, 0) > width * height * 0.18)
    return { valid: false, reason: 'obstacle-area-budget' };
  const blockers = [...obstacles, ...arena.hazards].map((r) =>
    inflate(r, ARENA_CLEARANCE),
  );
  const occupied = new Uint8Array(columns * rows);
  const center = (i: number): ArenaPoint => ({
    x: ((i % columns) + 0.5) * ARENA_VALIDATION_CELL,
    y: (Math.floor(i / columns) + 0.5) * ARENA_VALIDATION_CELL,
  });
  for (let i = 0; i < occupied.length; i++) {
    const p = center(i);
    const cell = { x: p.x - 4, y: p.y - 4, w: 8, h: 8 };
    if (
      cell.x < ARENA_CLEARANCE ||
      cell.y < ARENA_CLEARANCE ||
      cell.x + 8 > width - ARENA_CLEARANCE ||
      cell.y + 8 > height - ARENA_CLEARANCE ||
      blockers.some((r) => overlaps(cell, r))
    )
      occupied[i] = 1;
  }
  const attachment = (p: ArenaPoint): number[] => {
    if (
      p.x < ARENA_CLEARANCE ||
      p.y < ARENA_CLEARANCE ||
      p.x > width - ARENA_CLEARANCE ||
      p.y > height - ARENA_CLEARANCE
    )
      return [];
    const result: number[] = [];
    for (
      let y = Math.max(0, Math.floor((p.y - 32) / 8));
      y <= Math.min(rows - 1, Math.floor((p.y + 32) / 8));
      y++
    )
      for (
        let x = Math.max(0, Math.floor((p.x - 32) / 8));
        x <= Math.min(columns - 1, Math.floor((p.x + 32) / 8));
        x++
      ) {
        const i = y * columns + x;
        const c = center(i);
        if (
          !occupied[i] &&
          Math.hypot(c.x - p.x, c.y - p.y) <= 32 &&
          segmentClear(p, c, blockers)
        )
          result.push(i);
      }
    return result;
  };
  const witnesses = arenaWitnesses(arena, hasBoss);
  const start = attachment(witnesses[0]!)[0];
  if (start === undefined) return { valid: false, reason: 'unsafe-start' };
  const visited = new Uint8Array(occupied.length);
  const queue = new Int32Array(occupied.length);
  let head = 0;
  let tail = 1;
  queue[0] = start;
  visited[start] = 1;
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % columns;
    for (const n of [
      x > 0 ? i - 1 : -1,
      x < columns - 1 ? i + 1 : -1,
      i - columns,
      i + columns,
    ])
      if (n >= 0 && n < occupied.length && !occupied[n] && !visited[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
  }
  return witnesses.every((p) => attachment(p).some((i) => visited[i]))
    ? { valid: true }
    : { valid: false, reason: 'unreachable-witness' };
}
