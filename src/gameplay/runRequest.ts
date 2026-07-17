import type { GameContext } from '../engine/context';
import type { Rng } from '../engine/rng';
import { nextRunSeed } from '../engine/rng';

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

export function defaultArenaId(ctx: Pick<GameContext, 'data'>): string {
  return ctx.data.spawnCurves[0]?.id ?? 'arena';
}
