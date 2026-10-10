import { floorArtIdForCell } from './arenaFloor';
import { deepFreeze } from '../engine/freeze';
import { createRng, deriveRunSeed } from '../engine/rng';
import type { ArenaDefinition, ArenaObstacleSkinDefinition, HazardDefinition, ObstacleDefinition } from '../systems/types';
import { arenaReservations, arenaWitnesses, inflate, overlaps, validateArenaLayoutGeometry } from './arenaLayoutValidation';

export const ARENA_GENERATION_VERSION = 1;
export const ARENA_LAYOUT_LIMITS = Object.freeze({ placementCell: 32, candidateCells: 4096, attempts: 8, obstacles: 5, decorations: 48 });
export interface ResolvedArenaLayout {
  readonly arenaId: string; readonly seed: number; readonly contentVersion: string; readonly generationVersion: number;
  readonly hash: string;
  readonly arena: Readonly<ArenaDefinition>;
  readonly obstacles: readonly { readonly instanceId: string; readonly archetypeId: string; readonly footprint: ObstacleDefinition; readonly skin: ArenaObstacleSkinDefinition }[];
  readonly hazards: readonly { readonly instanceId: string; readonly footprint: HazardDefinition; readonly artId: string }[];
  readonly start: { readonly x: number; readonly y: number };
  readonly boss?: { readonly x: number; readonly y: number };
  readonly floorPlan: readonly string[];
  readonly diagnostic: { readonly mode: 'generated' | 'authored-baseline' | 'fallback'; readonly attempts: number; readonly reason?: string };
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function layoutHash(value: unknown): string { return deriveRunSeed(0, JSON.stringify(canonical(value))).toString(16).padStart(8, '0'); }

export function resolveArenaLayout(template: Readonly<ArenaDefinition>, seed: number, contentVersion: string, hasBoss = false): ResolvedArenaLayout {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff || !contentVersion) throw new Error('Invalid arena layout tuple');
  if (template.generation) template = { ...template, generation: { ...template.generation, obstacleIds: [...template.generation.obstacleIds].sort(), zones: [...template.generation.zones].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) } };
  const columns = Math.ceil(template.size.width / 32); const rows = Math.ceil(template.size.height / 32);
  if (columns * rows > ARENA_LAYOUT_LIMITS.candidateCells) throw new Error('Arena layout candidate-cell-budget exceeded');
  const baseline = validateArenaLayoutGeometry(template, hasBoss);
  if (!baseline.valid) throw new Error(`Arena authored baseline invalid: ${baseline.reason}`);
  const rng = createRng(deriveRunSeed(seed, `arena-layout:${contentVersion}:${template.id}:${ARENA_GENERATION_VERSION}`));
  const profile = template.generation;
  let archetypes = new Map(template.obstacles.map(o => [o.id, o.id]));
  let arena = structuredClone(template); let attempts = 0; let mode: ResolvedArenaLayout['diagnostic']['mode'] = 'authored-baseline'; let reason: string | undefined;
  if (profile) {
    if (profile.obstacleIds.length === 0 || profile.obstacleIds.length > 5 || profile.zones.length > 16 || !Number.isSafeInteger(profile.extraObstacles.min) || !Number.isSafeInteger(profile.extraObstacles.max) || profile.extraObstacles.min < 2 || profile.extraObstacles.max > 3 || profile.extraObstacles.min > profile.extraObstacles.max || template.obstacles.length + profile.extraObstacles.max > 5 || template.visual.decorations.length === 0 || template.visual.decorations.length + 20 > 48) throw new Error('Arena generation profile budget exceeded');
    mode = 'fallback';
    const palette = [...profile.obstacleIds].sort().map(id => {
      const footprint = template.obstacles.find(o => o.id === id); const skin = template.visual.obstacleSkins.find(s => s.obstacleId === id);
      if (!footprint || !skin) throw new Error(`Arena generation missing paired archetype ${id}`);
      return { footprint, skin };
    });
    const reserves = arenaReservations(template, hasBoss);
    const zones = [...profile.zones].sort((a,b) => a.id.localeCompare(b.id));
    for (attempts = 1; attempts <= ARENA_LAYOUT_LIMITS.attempts; attempts++) {
      const obstacles = [...template.obstacles]; const skins = [...template.visual.obstacleSkins];
      const candidateArchetypes = new Map(template.obstacles.map(o => [o.id, o.id]));
      const target = rng.int(profile.extraObstacles.min, profile.extraObstacles.max);
      const cells: { x: number; y: number }[] = [];
      for (let row = 2; row < rows - 2; row++) for (let col = 2; col < columns - 2; col++) {
        const p = { x: col * 32, y: row * 32 };
        if (zones.some(z => p.x >= z.x && p.y >= z.y && p.x < z.x + z.w && p.y < z.y + z.h)) cells.push(p);
      }
      for (let i = cells.length - 1; i > 0; i--) { const j = rng.int(0, i); [cells[i], cells[j]] = [cells[j]!, cells[i]!]; }
      for (const p of cells) {
        if (obstacles.length === template.obstacles.length + target) break;
        const source = rng.pick(palette); const id = `generated-${obstacles.length - template.obstacles.length}`;
        const obstacle = { ...source.footprint, id, ...p };
        if (obstacle.x + obstacle.w > template.size.width - 64 || obstacle.y + obstacle.h > template.size.height - 64
          || reserves.some(r => overlaps(obstacle, r)) || [...obstacles, ...template.hazards].some(r => overlaps(obstacle, inflate(r, 64)))) continue;
        obstacles.push(obstacle); skins.push({ ...source.skin, obstacleId: id });
        candidateArchetypes.set(id, source.footprint.id);
      }
      if (obstacles.length !== template.obstacles.length + target) { reason = 'insufficient-legal-placement'; continue; }
      const candidate = { ...structuredClone(template), obstacles, visual: { ...structuredClone(template.visual), obstacleSkins: skins } };
      const result = validateArenaLayoutGeometry(candidate, hasBoss);
      if (!result.valid) { reason = result.reason; continue; }
      arena = candidate; archetypes = candidateArchetypes; mode = 'generated'; reason = undefined; break;
    }
    attempts = Math.min(attempts, ARENA_LAYOUT_LIMITS.attempts);
    if (mode === 'generated') {
      const decorations = [...arena.visual.decorations];
      const palette = [...template.visual.decorations].sort((a,b) => a.id.localeCompare(b.id));
      const count = rng.int(12, 20);
      const cells: { x: number; y: number }[] = [];
      for (let y = 64; y < template.size.height - 64; y += 32) for (let x = 64; x < template.size.width - 64; x += 32) {
        const footprint = { x: x - 24, y: y - 24, w: 48, h: 48 };
        if (![...arena.obstacles, ...arena.hazards].some(r => overlaps(footprint, inflate(r, 16))) && !reserves.some(r => overlaps(footprint, r))) cells.push({ x, y });
      }
      for (let i = cells.length - 1; i > 0; i--) { const j = rng.int(0, i); [cells[i], cells[j]] = [cells[j]!, cells[i]!]; }
      if (cells.length < count) throw new Error('Arena decoration placement budget exhausted');
      for (let i = 0; i < count; i++) {
        const source = rng.pick(palette);
        decorations.push({ ...source, id: `generated-decoration-${i}`, ...cells[i]!, flipX: rng.int(0, 1) === 1 });
      }
      arena = { ...arena, visual: { ...arena.visual, decorations } };
    }
  }
  const floorPlan: string[] = [];
  // Semantic role zero remains the quiet base. Coarse seeded patches retain readable material groups.
  const patches = new Map<string, number>();
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const key = `${Math.floor(x / 4)}:${Math.floor(y / 4)}`;
    if (!patches.has(key)) patches.set(key, rng.int(0, 4) === 0 && arena.visual.floorArtIds.length > 1 ? rng.int(1, arena.visual.floorArtIds.length - 1) : 0);
    floorPlan.push(!profile ? floorArtIdForCell(arena.visual.floorArtIds, x, y) : arena.visual.floorArtIds[rng.int(0, 3) === 0 ? 0 : patches.get(key)!]!);
  }
  const witnesses = arenaWitnesses(arena, hasBoss);
  const body = { arenaId: arena.id, seed, contentVersion, generationVersion: ARENA_GENERATION_VERSION, arena,
    obstacles: arena.obstacles.map(footprint => ({ instanceId: footprint.id, archetypeId: archetypes.get(footprint.id)!,
      footprint, skin: arena.visual.obstacleSkins.find(s => s.obstacleId === footprint.id)! })),
    hazards: arena.hazards.map(footprint => ({ instanceId: footprint.id, footprint, artId: arena.visual.hazardSkins.find(s => s.hazardId === footprint.id)!.artId })),
    start: witnesses[0]!, ...(hasBoss ? { boss: witnesses[1]! } : {}), floorPlan,
    diagnostic: { mode, attempts, ...(reason ? { reason } : {}) } };
  return deepFreeze({ ...body, hash: layoutHash(body) });
}

/** Validate the captured result; never draw RNG or regenerate at a consumer. */
export function assertArenaLayout(layout: ResolvedArenaLayout, arenaId: string, seed: number, contentVersion: string, hasBoss?: boolean): void {
  const { hash, ...body } = layout;
  if (hasBoss !== undefined && (layout.boss !== undefined) !== hasBoss) throw new Error('Resolved arena layout boss witness mismatch');
  if (layout.arenaId !== arenaId || layout.arena.id !== arenaId || layout.seed !== seed || layout.contentVersion !== contentVersion || layout.generationVersion !== ARENA_GENERATION_VERSION || hash !== layoutHash(body)) throw new Error('Resolved arena layout tuple/hash mismatch');
}
