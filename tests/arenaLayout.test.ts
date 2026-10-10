import { describe, expect, it } from 'vitest';
import { loadGameData, validateArenaCatalog } from '../src/systems/validation';
import { resolveArenaLayout, assertArenaLayout } from '../src/gameplay/arenaLayout';
import { validateArenaLayoutGeometry } from '../src/gameplay/arenaLayoutValidation';
import { reseedRunRequest } from '../src/gameplay/runRequest';

const data = loadGameData();
const seeds = [1, 2, 3, 42, 0xffff_ffff];
describe('one bounded seeded arena layout', () => {
  for (const arena of data.arenas) {
    it(`${arena.id}: authored baseline connects start, boss and gates`, () => {
      expect(validateArenaLayoutGeometry(arena, true)).toEqual({ valid: true });
    });
    it(`${arena.id}: deterministic safe paired collision variation`, () => {
      const collision = new Set<string>();
      for (const seed of seeds) {
        const layout = resolveArenaLayout(arena, seed, data.contentVersion, true);
        expect(layout).toEqual(resolveArenaLayout(arena, seed, data.contentVersion, true));
        expect(layout.diagnostic.mode).toBe('generated');
        expect(Object.isFrozen(layout.arena.obstacles)).toBe(true);
        expect(validateArenaLayoutGeometry(layout.arena, true)).toEqual({ valid: true });
        expect(layout.obstacles.length).toBeGreaterThanOrEqual(4);
        expect(layout.obstacles.length).toBeLessThanOrEqual(5);
        expect(layout.arena.visual.decorations.length).toBeGreaterThanOrEqual(26);
        expect(layout.arena.visual.decorations.length).toBeLessThanOrEqual(34);
        expect(layout.floorPlan).toHaveLength(1008);
        for (const paired of layout.obstacles) {
          expect(paired.instanceId).toBe(paired.footprint.id);
          expect(paired.skin.obstacleId).toBe(paired.instanceId);
        }
        expect(() => assertArenaLayout(layout, arena.id, seed, data.contentVersion)).not.toThrow();
        collision.add(JSON.stringify(layout.arena.obstacles));
      }
      expect(collision.size).toBe(seeds.length);
    });
    it(`${arena.id}: unordered palettes/zones do not perturb layout`, () => {
      const clone = structuredClone(arena);
      const generation = clone.generation!;
      const permuted = { ...clone, generation: { ...generation, obstacleIds: [...generation.obstacleIds].reverse(), zones: [...generation.zones].reverse() } };
      // Template metadata is preserved; compare selected geometry and floor, not metadata ordering.
      const a = resolveArenaLayout(arena, 42, data.contentVersion);
      const b = resolveArenaLayout(permuted, 42, data.contentVersion);
      expect(b.arena.obstacles).toEqual(a.arena.obstacles);
      expect(b.floorPlan).toEqual(a.floorPlan);
      expect(b.hash).toBe(a.hash);
    });
    it(`${arena.id}: impossible zones produce validated deterministic fallback`, () => {
      const impossible = { ...arena, generation: { ...arena.generation!, zones: [{ id: 'no-room', x: 0, y: 0, w: 1, h: 1 }] } };
      const layout = resolveArenaLayout(impossible, 42, data.contentVersion, true);
      expect(layout.diagnostic).toEqual({ mode: 'fallback', attempts: 8, reason: 'insufficient-legal-placement' });
      expect(layout.arena.obstacles).toEqual(arena.obstacles);
      expect(layout).toEqual(resolveArenaLayout(impossible, 42, data.contentVersion, true));
    });
  }
  it('fails early for huge candidate grids and invalid baselines', () => {
    expect(() => resolveArenaLayout({ ...data.arenas[0]!, size: { width: 16384, height: 16384 } }, 1, 'test')).toThrow('budget');
    const arena = data.arenas[0]!;
    expect(() => resolveArenaLayout({ ...arena, obstacles: [...arena.obstacles, { id: 'unsafe', x: 360, y: 640, w: 64, h: 64 }] }, 1, 'test')).toThrow('unsafe-start');
  });
  it('rejects captured layout tampering and stale tuples', () => {
    const layout = resolveArenaLayout(data.arenas[0]!, 42, data.contentVersion);
    expect(() => assertArenaLayout(layout, layout.arenaId, 43, data.contentVersion)).toThrow('mismatch');
    expect(() => assertArenaLayout({ ...layout, floorPlan: [] }, layout.arenaId, 42, data.contentVersion)).toThrow('mismatch');
  });
  it('validates generation references and finite budgets at catalog load', () => {
    const arena = data.arenas[0]!;
    expect(() => validateArenaCatalog([{ ...arena, generation: { ...arena.generation, obstacleIds: ['missing'] } }])).toThrow('obstacleIds');
    expect(() => validateArenaCatalog([{ ...arena, generation: { ...arena.generation, extraObstacles: { min: 2, max: 100 } } }])).toThrow('max');
  });
  it('terminal replay preserves identity while replacing exactly the seed', () => {
    expect(reseedRunRequest({ kind: 'stage', stageId: 'stage', characterId: 'cat', seed: 1 }, 2)).toEqual({ kind: 'stage', stageId: 'stage', characterId: 'cat', seed: 2 });
  });
});
