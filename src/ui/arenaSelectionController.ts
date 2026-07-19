import type { GameContext, SelectArenaFailureReason } from '../engine/context';
import { canSelectArena } from '../gameplay/arenaSelection';

export interface ArenaOptionView {
  readonly id: string;
  readonly name: string;
  readonly locked: boolean;
  readonly selected: boolean;
}

export interface ArenaSelectionSnapshot {
  readonly revision: number;
  readonly selectedArenaId: string;
  readonly arenas: readonly ArenaOptionView[];
}

export type SelectArenaCommandResult =
  | { readonly ok: true; readonly snapshot: ArenaSelectionSnapshot }
  | {
      readonly ok: false;
      readonly reason: SelectArenaFailureReason;
      readonly snapshot: ArenaSelectionSnapshot;
    };

export class ArenaSelectionController {
  private readonly context: GameContext;

  constructor(context: GameContext) {
    this.context = context;
  }

  snapshot(): ArenaSelectionSnapshot {
    const { context } = this;
    const selectedArenaId = context.selectedArenaId;
    const revision = context.arenaSelectionRevision;
    const arenas = context.arenas.all().map((arena) => ({
      id: arena.id,
      name: arena.name,
      locked: !canSelectArena(arena, context.saveData.meta),
      selected: arena.id === selectedArenaId,
    }));
    return Object.freeze({
      revision,
      selectedArenaId,
      arenas: Object.freeze(arenas),
    });
  }

  select(
    arenaId: string,
    expectedRevision: number,
  ): SelectArenaCommandResult {
    const result = this.context.selectArena(arenaId, expectedRevision);
    const snapshot = this.snapshot();
    if (result.ok) {
      return Object.freeze({ ok: true, snapshot });
    }
    return Object.freeze({ ok: false, reason: result.reason, snapshot });
  }
}