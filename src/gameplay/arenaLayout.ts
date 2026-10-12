import { floorArtIdForCell } from './arenaFloor';
import { deepFreeze } from '../engine/freeze';
import { createRng, deriveRunSeed } from '../engine/rng';
import type {
  ArenaDefinition,
  ArenaObstacleSkinDefinition,
  HazardDefinition,
  ObstacleDefinition,
} from '../systems/types';
import {
  arenaReservations,
  arenaWitnesses,
  inflate,
  overlaps,
  validateArenaLayoutGeometry,
} from './arenaLayoutValidation';

export const ARENA_GENERATION_VERSION = 1;
export const ARENA_LAYOUT_LIMITS = Object.freeze({
  placementCell: 32,
  candidateCells: 4096,
  attempts: 8,
  obstacles: 5,
  decorations: 48,
});
export interface ResolvedArenaLayout {
  readonly arenaId: string;
  readonly seed: number;
  readonly layoutSeed: number;
  readonly contentVersion: string;
  readonly generationVersion: number;
  readonly hash: string;
  readonly arena: Readonly<ArenaDefinition>;
  readonly obstacles: readonly {
    readonly instanceId: string;
    readonly archetypeId: string;
    readonly footprint: ObstacleDefinition;
    readonly skin: ArenaObstacleSkinDefinition;
  }[];
  readonly hazards: readonly {
    readonly instanceId: string;
    readonly footprint: HazardDefinition;
    readonly artId: string;
  }[];
  readonly start: { readonly x: number; readonly y: number };
  readonly boss?: { readonly x: number; readonly y: number };
  readonly floorPlan: readonly string[];
  readonly diagnostic: {
    readonly mode: 'generated' | 'authored-baseline' | 'fallback';
    readonly attempts: number;
    readonly reason?: string;
  };
}
/** UTF-16 code-unit order is stable across host languages and locales. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compareIds(a, b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
function layoutHash(value: unknown): string {
  return deriveRunSeed(0, JSON.stringify(canonical(value)))
    .toString(16)
    .padStart(8, '0');
}

export function resolveArenaLayout(
  template: Readonly<ArenaDefinition>,
  seed: number,
  contentVersion: string,
): ResolvedArenaLayout {
  if (
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffff_ffff ||
    !contentVersion
  )
    throw new Error('Invalid arena layout tuple');
  if (template.generation)
    template = {
      ...template,
      generation: {
        ...template.generation,
        obstacleIds: [...template.generation.obstacleIds].sort(compareIds),
        zones: [...template.generation.zones].sort((a, b) => compareIds(a.id, b.id)),
      },
    };
  const columns = Math.ceil(template.size.width / 32);
  const rows = Math.ceil(template.size.height / 32);
  if (columns * rows > ARENA_LAYOUT_LIMITS.candidateCells)
    throw new Error('Arena layout candidate-cell-budget exceeded');
  // Every tuple has one boss-safe anchor and geometry, irrespective of which
  // encounter consumes it. Composition does not enter generation identity.
  const baseline = validateArenaLayoutGeometry(template, true);
  if (!baseline.valid)
    throw new Error(`Arena authored baseline invalid: ${baseline.reason}`);
  const layoutSeed = deriveRunSeed(
    seed,
    `arena-layout:${contentVersion}:${template.id}:${ARENA_GENERATION_VERSION}`,
  );
  const rng = createRng(layoutSeed);
  const profile = template.generation;
  let archetypes = new Map(template.obstacles.map((o) => [o.id, o.id]));
  let arena = structuredClone(template);
  let attempts = 0;
  let mode: ResolvedArenaLayout['diagnostic']['mode'] = 'authored-baseline';
  let reason: string | undefined;
  if (profile) {
    if (
      profile.obstacleIds.length === 0 ||
      profile.obstacleIds.length > 5 ||
      profile.zones.length > 16 ||
      !Number.isSafeInteger(profile.extraObstacles.min) ||
      !Number.isSafeInteger(profile.extraObstacles.max) ||
      profile.extraObstacles.min < 2 ||
      profile.extraObstacles.max > 3 ||
      profile.extraObstacles.min > profile.extraObstacles.max ||
      template.obstacles.length + profile.extraObstacles.max > 5 ||
      template.visual.decorations.length === 0 ||
      template.visual.decorations.length + 20 > 48
    )
      throw new Error('Arena generation profile budget exceeded');
    mode = 'fallback';
    const palette = [...profile.obstacleIds].sort(compareIds).map((id) => {
      const footprint = template.obstacles.find((o) => o.id === id);
      const skin = template.visual.obstacleSkins.find(
        (s) => s.obstacleId === id,
      );
      if (!footprint || !skin)
        throw new Error(`Arena generation missing paired archetype ${id}`);
      return { footprint, skin };
    });
    const reserves = arenaReservations(template, true);
    const zones = [...profile.zones].sort((a, b) => compareIds(a.id, b.id));
    for (attempts = 1; attempts <= ARENA_LAYOUT_LIMITS.attempts; attempts++) {
      const obstacles = [...template.obstacles];
      const skins = [...template.visual.obstacleSkins];
      const candidateArchetypes = new Map(
        template.obstacles.map((o) => [o.id, o.id]),
      );
      const target = rng.int(
        profile.extraObstacles.min,
        profile.extraObstacles.max,
      );
      const cells: { x: number; y: number }[] = [];
      for (let row = 2; row < rows - 2; row++)
        for (let col = 2; col < columns - 2; col++) {
          const p = { x: col * 32, y: row * 32 };
          if (
            zones.some(
              (z) =>
                p.x >= z.x && p.y >= z.y && p.x < z.x + z.w && p.y < z.y + z.h,
            )
          )
            cells.push(p);
        }
      for (let i = cells.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [cells[i], cells[j]] = [cells[j]!, cells[i]!];
      }
      for (const p of cells) {
        if (obstacles.length === template.obstacles.length + target) break;
        const source = rng.pick(palette);
        const id = `generated-${obstacles.length - template.obstacles.length}`;
        const obstacle = { ...source.footprint, id, ...p };
        if (
          !zones.some(z => obstacle.x >= z.x && obstacle.y >= z.y &&
            obstacle.x + obstacle.w <= z.x + z.w && obstacle.y + obstacle.h <= z.y + z.h) ||
          obstacle.x + obstacle.w > template.size.width - 64 ||
          obstacle.y + obstacle.h > template.size.height - 64 ||
          reserves.some((r) => overlaps(obstacle, r)) ||
          [...obstacles, ...template.hazards].some((r) =>
            overlaps(obstacle, inflate(r, 64)),
          )
        )
          continue;
        obstacles.push(obstacle);
        skins.push({ ...source.skin, obstacleId: id });
        candidateArchetypes.set(id, source.footprint.id);
      }
      if (obstacles.length !== template.obstacles.length + target) {
        reason = 'insufficient-legal-placement';
        continue;
      }
      const candidate = {
        ...structuredClone(template),
        obstacles,
        visual: { ...structuredClone(template.visual), obstacleSkins: skins },
      };
      const result = validateArenaLayoutGeometry(candidate, true);
      if (!result.valid) {
        reason = result.reason;
        continue;
      }
      arena = candidate;
      archetypes = candidateArchetypes;
      mode = 'generated';
      reason = undefined;
      break;
    }
    attempts = Math.min(attempts, ARENA_LAYOUT_LIMITS.attempts);
    if (mode === 'generated') {
      const decorations = [...arena.visual.decorations];
      const palette = [...template.visual.decorations].sort((a, b) =>
        compareIds(a.id, b.id),
      );
      const count = rng.int(12, 20);
      const cells: { x: number; y: number }[] = [];
      for (let y = 64; y < template.size.height - 64; y += 32)
        for (let x = 64; x < template.size.width - 64; x += 32) {
          const footprint = { x: x - 24, y: y - 24, w: 48, h: 48 };
          if (
            ![...arena.obstacles, ...arena.hazards].some((r) =>
              overlaps(footprint, inflate(r, 16)),
            ) &&
            !reserves.some((r) => overlaps(footprint, r))
          )
            cells.push({ x, y });
        }
      for (let i = cells.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [cells[i], cells[j]] = [cells[j]!, cells[i]!];
      }
      if (cells.length < count) {
        // Collision alone is not a complete layout. Discard every generated
        // node and materialize the already validated authored composition.
        arena = structuredClone(template);
        archetypes = new Map(template.obstacles.map(o => [o.id, o.id]));
        mode = 'fallback';
        reason = 'insufficient-decoration-placement';
      } else {
        for (let i = 0; i < count; i++) {
          const source = rng.pick(palette);
          decorations.push({
            ...source,
            id: `generated-decoration-${i}`,
            ...cells[i]!,
            flipX: rng.int(0, 1) === 1,
          });
        }
        arena = { ...arena, visual: { ...arena.visual, decorations } };
      }
    }
  }
  const floorPlan: string[] = [];
  // Semantic role zero remains the quiet base. Coarse seeded patches retain readable material groups.
  const patches = new Map<string, number>();
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < columns; x++) {
      const key = `${Math.floor(x / 4)}:${Math.floor(y / 4)}`;
      if (mode === 'generated' && !patches.has(key))
        patches.set(
          key,
          rng.int(0, 4) === 0 && arena.visual.floorArtIds.length > 1
            ? rng.int(1, arena.visual.floorArtIds.length - 1)
            : 0,
        );
      floorPlan.push(
        mode !== 'generated'
          ? floorArtIdForCell(arena.visual.floorArtIds, x, y)
          : arena.visual.floorArtIds[
              rng.int(0, 3) === 0 ? 0 : patches.get(key)!
            ]!,
      );
    }
  const witnesses = arenaWitnesses(arena, true);
  const body = {
    arenaId: arena.id,
    seed,
    layoutSeed,
    contentVersion,
    generationVersion: ARENA_GENERATION_VERSION,
    arena,
    obstacles: arena.obstacles.map((footprint) => ({
      instanceId: footprint.id,
      archetypeId: archetypes.get(footprint.id)!,
      footprint,
      skin: arena.visual.obstacleSkins.find(
        (s) => s.obstacleId === footprint.id,
      )!,
    })),
    hazards: arena.hazards.map((footprint) => ({
      instanceId: footprint.id,
      footprint,
      artId: arena.visual.hazardSkins.find((s) => s.hazardId === footprint.id)!
        .artId,
    })),
    start: witnesses[0]!,
    boss: witnesses[1]!,
    floorPlan,
    diagnostic: { mode, attempts, ...(reason ? { reason } : {}) },
  };
  return deepFreeze({ ...body, hash: layoutHash(body) });
}

/** Validate the captured result; never draw RNG or regenerate at a consumer. */
export function assertArenaLayout(
  layout: ResolvedArenaLayout,
  arenaId: string,
  seed: number,
  contentVersion: string,
  hasBoss?: boolean,
): void {
  const { hash, ...body } = layout;
  if (hasBoss === true && layout.boss === undefined)
    throw new Error('Resolved arena layout boss witness mismatch');
  if (
    layout.arenaId !== arenaId ||
    layout.arena.id !== arenaId ||
    layout.seed !== seed ||
    layout.layoutSeed !== deriveRunSeed(seed, `arena-layout:${contentVersion}:${arenaId}:${ARENA_GENERATION_VERSION}`) ||
    layout.contentVersion !== contentVersion ||
    layout.generationVersion !== ARENA_GENERATION_VERSION ||
    hash !== layoutHash(body)
  )
    throw new Error('Resolved arena layout tuple/hash mismatch');
}
