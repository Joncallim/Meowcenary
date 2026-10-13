import { describe, expect, it } from 'vitest';
import { loadGameData, validateArenaCatalog } from '../src/systems/validation';
import { assertArenaLayout, resolveArenaLayout } from '../src/gameplay/arenaLayout';
import { validateArenaLayoutGeometry } from '../src/gameplay/arenaLayoutValidation';

const data = loadGameData();
const { generation, ...authored } = data.arenas[0]!;

describe('connected spawn witnesses and encounter-independent layout identity', () => {
  it('accepts a catalog-valid ring with connected clear points after an unsafe first raw witness', () => {
    expect(generation).toBeDefined();
    const arena = { ...authored, spawnRegions: [{ kind: 'ring' as const,
      cx: 384, cy: 672, minRadius: 700, maxRadius: 800 }] };
    expect(() => validateArenaCatalog([arena])).not.toThrow();
    // (0,0) is geometrically in the ring but lacks body clearance. (40,40)
    // is also in the same ring and reaches start through the open north route.
    expect(Math.hypot(40 - 384, 40 - 672)).toBeGreaterThan(700);
    expect(Math.hypot(40 - 384, 40 - 672)).toBeLessThan(800);
    expect(validateArenaLayoutGeometry(arena, true)).toEqual({ valid: true });
    expect(() => resolveArenaLayout(arena, 42, data.contentVersion)).not.toThrow();
  });

  it('chooses a connected rectangular witness when its first geometric partition is disconnected', () => {
    const obstacle = { id: 'divider', x: 200, y: 0, w: 64, h: authored.size.height };
    const arena = { ...authored, obstacles: [obstacle],
      spawnRegions: [{ kind: 'rect' as const, x: 100, y: 100, w: 300, h: 500 }],
      visual: { ...authored.visual, obstacleSkins: [{ ...authored.visual.obstacleSkins[0]!, obstacleId: obstacle.id }] } };
    expect(() => validateArenaCatalog([arena])).not.toThrow();
    // The left partition is disconnected, but the region also contains body-
    // safe points to the right of the divider, with both start and boss.
    expect(validateArenaLayoutGeometry(arena, true)).toEqual({ valid: true });
    expect(() => resolveArenaLayout(arena, 42, data.contentVersion)).not.toThrow();
    const disconnected = { ...arena, spawnRegions: [{ kind: 'rect' as const, x: 100, y: 100, w: 60, h: 500 }] };
    expect(validateArenaLayoutGeometry(disconnected, true)).toEqual({ valid: false, reason: 'unreachable-witness' });
  });

  it('attaches a sub-grid rectangular region by an exact-clearance continuous segment', () => {
    const arena = { ...authored, spawnRegions: [{ kind: 'rect' as const, x: 301, y: 501, w: 1, h: 1 }] };
    expect(validateArenaLayoutGeometry(arena, true)).toEqual({ valid: true });
  });

  for (const arena of data.arenas) it(`${arena.id}: the four-field tuple has one boss-safe layout for every encounter`, () => {
    for (const seed of [1, 2, 3, 42, 0xffff_ffff]) {
      const normal = resolveArenaLayout(arena, seed, data.contentVersion);
      const boss = resolveArenaLayout(arena, seed, data.contentVersion);
      expect(normal).toEqual(boss);
      expect(normal.hash).toBe(boss.hash);
      expect(normal.boss).toEqual({ x: arena.size.width / 2, y: Math.max(80, arena.size.height * 0.2) });
      expect(validateArenaLayoutGeometry(normal.arena, true)).toEqual({ valid: true });
      expect(() => assertArenaLayout(normal, arena.id, seed, data.contentVersion, true)).not.toThrow();
      expect(() => assertArenaLayout(normal, arena.id, seed, data.contentVersion, false)).not.toThrow();
    }
  });
});
