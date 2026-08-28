import type { GameContext } from '../engine/context';
import type { Rng } from '../engine/rng';
import { nextRunSeed } from '../engine/rng';
import { canSelectCharacter } from './characterSelection';
import { canSelectArena } from './arenaSelection';

export interface RunRequest {
  readonly characterId: string;
  readonly arenaId: string;
  readonly seed: number;
}

/** The only two composition inputs accepted by the runtime boundary. Legacy
 * arenas are deliberately explicit compatibility, never an implicit fallback
 * from a missing stage ID. Epic 85 may make `stage` the menu default. */
export type ComposedRunRequest =
  | { readonly kind: 'legacy-arena'; readonly characterId: string; readonly arenaId: string; readonly seed: number }
  | { readonly kind: 'stage'; readonly characterId: string; readonly stageId: string; readonly seed: number };

export function createStageRunRequest(options: {
  readonly characterId: string;
  readonly stageId: string;
  readonly rng: Pick<Rng, 'int'>;
}): ComposedRunRequest {
  return Object.freeze({ kind: 'stage', characterId: options.characterId, stageId: options.stageId, seed: nextRunSeed(options.rng) });
}

export function createRunRequest(options: {
  readonly characterId: string;
  readonly arenaId: string;
  readonly rng: Pick<Rng, 'int'>;
}): RunRequest {
  return Object.freeze({
    characterId: options.characterId,
    arenaId: options.arenaId,
    seed: nextRunSeed(options.rng),
  });
}

export function asLegacyComposedRunRequest(request: RunRequest): ComposedRunRequest {
  return Object.freeze({ kind: 'legacy-arena', ...request });
}

export function assembleRunRequest(ctx: GameContext, rng: Pick<Rng, 'int'>): RunRequest {
  const character = ctx.characters.characterById(ctx.selectedCharacterId);
  const characterId = character && canSelectCharacter(character, ctx.saveData.progression)
    ? ctx.selectedCharacterId
    : ctx.characters.defaultCharacterId();

  const arena = ctx.arenas.arenaById(ctx.selectedArenaId);
  const arenaId = arena && canSelectArena(arena, ctx.saveData.progression)
    ? ctx.selectedArenaId
    : ctx.arenas.defaultArenaId();

  return createRunRequest({ characterId, arenaId, rng });
}

/** Normal Alpha 3 composition. A valid selected stage is authoritative;
 * legacy arenas are available only through the explicit compatibility
 * constructor, never as a hidden stage fallback. */
export function assembleComposedRunRequest(ctx: GameContext, rng: Pick<Rng, 'int'>): ComposedRunRequest {
  const character = ctx.characters.characterById(ctx.selectedCharacterId);
  const characterId = character && canSelectCharacter(character, ctx.saveData.progression)
    ? ctx.selectedCharacterId
    : ctx.characters.defaultCharacterId();
  const stage = ctx.stages.stageById(ctx.selectedStageId);
  if (!stage) return asLegacyComposedRunRequest(assembleRunRequest(ctx, rng));
  return createStageRunRequest({ characterId, stageId: stage.id, rng });
}
