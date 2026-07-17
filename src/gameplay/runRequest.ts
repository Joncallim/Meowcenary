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

export function assembleRunRequest(ctx: GameContext, rng: Pick<Rng, 'int'>): RunRequest {
  const character = ctx.characters.characterById(ctx.selectedCharacterId);
  const characterId = character && canSelectCharacter(character, ctx.saveData.meta)
    ? ctx.selectedCharacterId
    : ctx.characters.defaultCharacterId();

  const arena = ctx.arenas.arenaById(ctx.selectedArenaId);
  const arenaId = arena && canSelectArena(arena, ctx.saveData.meta)
    ? ctx.selectedArenaId
    : ctx.arenas.defaultArenaId();

  return createRunRequest({ characterId, arenaId, rng });
}