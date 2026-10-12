import { describe, expect, it, vi } from 'vitest';
import { createRng, deriveRunSeed, nextRunSeed } from '../src/engine/rng';
import { loadGameData } from '../src/systems/validation';
import type { ArenaDefinition, HazardDefinition } from '../src/systems/types';
import { resolveArenaLayout } from '../src/gameplay/arenaLayout';
import { arenaReservations, inflate, overlaps, validateArenaLayoutGeometry } from '../src/gameplay/arenaLayoutValidation';
import { floorArtIdForCell } from '../src/gameplay/arenaFloor';
import { reseedRunRequest } from '../src/gameplay/runRequest';

const data = loadGameData();
const seeds = [1, 2, 3, 42, 0xffff_ffff];

// Safe 64-wide corridors connect 192-wide rooms. They fit the player's
// inflated body but cannot fit a 48-wide decoration plus hazard clearance.
function decorationExhaustionArena(): ArenaDefinition {
  const original = data.arenas[0]!;
  const safe = [
    { x: 352, y: 0, w: 64, h: 1344 },
    { x: 288, y: 576, w: 192, h: 192 },
    { x: 288, y: 192, w: 192, h: 192 },
    // Keep the upper room for the always-reserved boss. A second collision
    // room and body-safe horizontal corridor sit outside both anchor reserves.
    { x: 64, y: 384, w: 192, h: 192 },
    { x: 64, y: 448, w: 352, h: 64 },
    { x: 288, y: 960, w: 192, h: 192 },
    { x: 64, y: 96, w: 192, h: 192 },
  ];
  const hazards: HazardDefinition[] = [];
  // Coalesce identical horizontal complements over consecutive 32-unit rows.
  const open = new Map<string, HazardDefinition>();
  for (let y = 0; y < 1344; y += 32) {
    const spans: { x: number; w: number }[] = [];
    for (let x = 0; x < 768; x += 32) {
      if (safe.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue;
      const previous = spans.at(-1);
      if (previous && previous.x + previous.w === x) previous.w += 32;
      else spans.push({ x, w: 32 });
    }
    const active = new Set<string>();
    for (const span of spans) {
      const key = `${span.x}:${span.w}`;
      active.add(key);
      const previous = open.get(key);
      if (previous && previous.y + previous.h === y) {
        const extended = { ...previous, h: previous.h + 32 };
        hazards[hazards.indexOf(previous)] = extended;
        open.set(key, extended);
      } else {
        const hazard = { id: `fixture-heat-${hazards.length}`, kind: 'heat', ...span, y, h: 32, damagePerSecond: 10 };
        hazards.push(hazard);
        open.set(key, hazard);
      }
    }
    for (const key of open.keys()) if (!active.has(key)) open.delete(key);
  }
  const source = { ...original.obstacles[0]!, x: 128, y: 160 };
  return {
    ...original,
    spawnRegions: [{ kind: 'rect', x: 376, y: 640, w: 16, h: 16 }],
    obstacles: [source], hazards,
    visual: { ...original.visual, obstacleSkins: [original.visual.obstacleSkins[0]!],
      hazardSkins: hazards.map(h => ({ hazardId: h.id, artId: 'world:forge-hazard:heat-grate' })) },
    generation: { obstacleIds: [source.id], extraObstacles: { min: 2, max: 2 }, zones: [
      { id: 'north', x: 64, y: 384, w: 192, h: 192 },
      { id: 'south', x: 288, y: 960, w: 192, h: 192 },
    ] },
  };
}

describe('arena layout safety and reproduction', () => {
  it('rejects origin-only placements when no authored zone fits the whole collider', () => {
    const arena = data.arenas[0]!;
    const narrow = { ...arena, generation: { ...arena.generation!, zones: [
      { id: 'north', x: 288, y: 256, w: 32, h: 32 },
      { id: 'south', x: 288, y: 960, w: 32, h: 32 },
    ] } };
    const layout = resolveArenaLayout(narrow, 42, data.contentVersion);
    expect(layout.diagnostic.mode).toBe('fallback');
    expect(layout.arena.obstacles).toEqual(arena.obstacles);
  });

  it('falls back the entire composition when collision fits but decoration cannot', () => {
    const arena = decorationExhaustionArena();
    expect(validateArenaLayoutGeometry(arena)).toEqual({ valid: true });
    const layout = resolveArenaLayout(arena, 42, data.contentVersion);
    expect(layout.diagnostic.mode).toBe('fallback');
    expect(layout.diagnostic.reason).toBe('insufficient-decoration-placement');
    expect(layout.arena.obstacles).toEqual(arena.obstacles);
    expect(layout.arena.visual).toEqual(arena.visual);
    const baseline = resolveArenaLayout({ ...arena, generation: undefined }, 42, data.contentVersion);
    expect(layout.floorPlan).toEqual(baseline.floorPlan);
    expect(layout).toEqual(resolveArenaLayout(arena, 42, data.contentVersion));
  });

  it('uses authored floor and visuals for an impossible collision fallback', () => {
    const arena = data.arenas[0]!;
    const impossible = { ...arena, generation: { ...arena.generation!, zones: [{ id: 'empty', x: 0, y: 0, w: 1, h: 1 }] } };
    const layout = resolveArenaLayout(impossible, 42, data.contentVersion);
    const baseline = resolveArenaLayout({ ...arena, generation: undefined }, 42, data.contentVersion);
    expect(layout.arena.visual).toEqual(baseline.arena.visual);
    expect(layout.floorPlan).toEqual(baseline.floorPlan);
  });

  it('does not depend on host locale collation for selection or layout identity', () => {
    const arena = data.arenas[0]!;
    const expected = resolveArenaLayout(arena, 42, data.contentVersion);
    const locale = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string) {
      return String(this) < other ? 1 : String(this) > other ? -1 : 0;
    });
    try { expect(resolveArenaLayout(arena, 42, data.contentVersion)).toEqual(expected); }
    finally { locale.mockRestore(); }
  });

  for (const arena of data.arenas) {
    it(`${arena.id}: unordered decoration palette rows do not change generated choices`, () => {
      const permuted = { ...arena, visual: { ...arena.visual, decorations: [...arena.visual.decorations].reverse() } };
      for (const seed of seeds) {
        const a = resolveArenaLayout(arena, seed, data.contentVersion);
        const b = resolveArenaLayout(permuted, seed, data.contentVersion);
        // Fixed authored row order remains presentation metadata, not a palette
        // selection dependency. Floor role arrays intentionally stay ordered.
        expect(b.arena.visual.decorations.slice(arena.visual.decorations.length)).toEqual(a.arena.visual.decorations.slice(arena.visual.decorations.length));
        expect(b.floorPlan).toEqual(a.floorPlan);
        expect(b.arena.obstacles).toEqual(a.arena.obstacles);
      }
    });

    it(`${arena.id}: generated footprints fit zones, reserves and separation`, () => {
      for (const seed of seeds) {
        const layout = resolveArenaLayout(arena, seed, data.contentVersion);
        expect(layout.diagnostic.mode).toBe('generated');
        const generated = layout.arena.obstacles.slice(arena.obstacles.length);
        for (const obstacle of generated) {
          expect(arena.generation!.zones.some(z => obstacle.x >= z.x && obstacle.y >= z.y && obstacle.x + obstacle.w <= z.x + z.w && obstacle.y + obstacle.h <= z.y + z.h)).toBe(true);
          expect(arenaReservations(arena, true).some(r => overlaps(obstacle, r))).toBe(false);
          expect([...layout.arena.obstacles.filter(r => r !== obstacle), ...arena.hazards].some(r => overlaps(obstacle, inflate(r, 64)))).toBe(false);
        }
      }
    });

    it(`${arena.id}: unprofiled arenas keep the authored geometry and floor roles`, () => {
      const template = { ...arena, generation: undefined };
      const a = resolveArenaLayout(template, 1, data.contentVersion);
      const b = resolveArenaLayout(template, 42, data.contentVersion);
      expect(a.diagnostic).toEqual({ mode: 'authored-baseline', attempts: 0 });
      expect(a.arena).toEqual(template);
      expect(a.arena).toEqual(b.arena);
      expect(a.floorPlan).toEqual(b.floorPlan);
      expect(a.floorPlan).toEqual(Array.from({ length: 1008 }, (_, i) => floorArtIdForCell(arena.visual.floorArtIds, i % 24, Math.floor(i / 24))));
      expect(Object.isFrozen(a.arena.visual.decorations)).toBe(true);
    });

    it(`${arena.id}: isolated streams and recorded seeds reproduce after other RNG activity`, () => {
      const snapshot = structuredClone(arena);
      for (const seed of seeds) {
        const names = ['spawns', 'loot', 'upgrades', 'weapon-rewards', 'performance-fixture'];
        const streams = names.map(name => createRng(deriveRunSeed(seed, name)));
        const controls = names.map(name => createRng(deriveRunSeed(seed, name)));
        streams.forEach(rng => rng.next()); controls.forEach(rng => rng.next());
        const layout = resolveArenaLayout(arena, seed, data.contentVersion);
        expect(layout.layoutSeed).toBe(deriveRunSeed(seed, `arena-layout:${data.contentVersion}:${arena.id}:${layout.generationVersion}`));
        expect(names.map(name => deriveRunSeed(seed, name))).not.toContain(layout.layoutSeed);
        expect(streams.map(rng => rng.next())).toEqual(controls.map(rng => rng.next()));
        streams.forEach(rng => { for (let i = 0; i < 20; i++) rng.next(); });
        expect(resolveArenaLayout(arena, seed, data.contentVersion)).toEqual(layout);
        expect(arena).toEqual(snapshot);
      }
    });
  }

  it('replaces only the seed for both composition variants without mutating the captured request', () => {
    const menu = createRng(42);
    for (const request of [
      { kind: 'stage' as const, stageId: 'contract', characterId: 'cat', seed: 42 },
      { kind: 'legacy-arena' as const, arenaId: 'training', characterId: 'cat', seed: 42 },
    ]) {
      const replay = reseedRunRequest(request, nextRunSeed(menu));
      expect(replay.seed).not.toBe(request.seed);
      expect({ ...replay, seed: request.seed }).toEqual(request);
      expect(request.seed).toBe(42);
      expect(Object.isFrozen(replay)).toBe(true);
    }
  });

  it('never uses ambient randomness for either normal generation or fallback', () => {
    const ambient = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Ambient RNG is forbidden'); });
    try {
      const arena = data.arenas[0]!;
      expect(resolveArenaLayout(arena, 42, data.contentVersion).diagnostic.mode).toBe('generated');
      expect(resolveArenaLayout(decorationExhaustionArena(), 42, data.contentVersion).diagnostic.mode).toBe('fallback');
      expect(ambient).not.toHaveBeenCalled();
    } finally { ambient.mockRestore(); }
  });

  it('rejects a sealed hazard corridor and a ring without any clear spawn witness', () => {
    const arena = data.arenas[0]!;
    const wall = { id: 'heat-wall', kind: 'heat', x: 0, y: 300, w: 768, h: 64, damagePerSecond: 10 };
    expect(validateArenaLayoutGeometry({ ...arena, hazards: [wall] })).toEqual({ valid: false, reason: 'unreachable-witness' });
    expect(validateArenaLayoutGeometry({ ...arena,
      spawnRegions: [{ kind: 'ring', cx: 150, cy: 150, minRadius: 30, maxRadius: 40 }],
      hazards: [{ ...wall, x: 100, y: 100, w: 100, h: 100 }],
    })).toEqual({ valid: false, reason: 'unreachable-witness' });
  });

  it('requires every edge ingress and boss witness to have an exact clear attachment', () => {
    const arena = data.arenas[0]!;
    const gate = { id: 'gate-blocker', x: 160, y: 32, w: 96, h: 64 };
    expect(validateArenaLayoutGeometry({ ...arena, obstacles: [...arena.obstacles, gate] })).toEqual({ valid: false, reason: 'unreachable-witness' });
    const boss = { id: 'boss-blocker', x: 360, y: 240, w: 48, h: 64 };
    expect(validateArenaLayoutGeometry({ ...arena, obstacles: [...arena.obstacles, boss] }, true)).toEqual({ valid: false, reason: 'unreachable-witness' });
  });
});
