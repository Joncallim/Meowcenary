/**
 * Stage selection controller — read-model + controller for the stage
 * selection UI. Follows the ArenaSelectionController pattern.
 *
 * Stages are listed in display order with locked/unlocked state derived
 * from the player's progression (condition evaluation).
 */
import type { GameContext } from '../engine/context';
import { evaluateCondition } from '../gameplay/conditionEvaluator';
import { createConditionContext } from '../gameplay/conditionEvaluator';
import type { ProgressionCondition } from '../gameplay/conditionEvaluator';

export interface StageOptionView {
  readonly id: string;
  readonly name: string;
  readonly chapterId: string;
  readonly displayOrder: number;
  readonly locked: boolean;
  readonly selected: boolean;
  readonly completed: boolean;
}

export interface StageSelectionSnapshot {
  readonly revision: number;
  readonly selectedStageId: string;
  readonly stages: readonly StageOptionView[];
}

export class StageSelectionController {
  private readonly context: GameContext;

  constructor(context: GameContext) {
    this.context = context;
  }

  snapshot(): StageSelectionSnapshot {
    const { context } = this;
    const ctx = createConditionContext(
      context.saveData.progression,
      {
        stages: context.saveData.stages,
        achievements: context.saveData.achievements,
        characters: context.saveData.characters,
        bosses: context.saveData.bosses,
      },
    );

    const selectedStageId = this.getSelectedStageId();
    const stages = context.stages.allStages().map((stage) => {
      const condition = stage.unlock as unknown as ProgressionCondition;
      const locked = !evaluateCondition(condition, ctx);
      const completed = context.saveData.stages[stage.id]?.completed === true;

      return Object.freeze({
        id: stage.id,
        name: stage.name,
        chapterId: stage.chapterId,
        displayOrder: stage.displayOrder,
        locked,
        selected: stage.id === selectedStageId,
        completed,
      } satisfies StageOptionView);
    });

    return Object.freeze({
      revision: context.stageSelectionRevision,
      selectedStageId,
      stages: Object.freeze(stages),
    });
  }

  select(stageId: string): { readonly ok: boolean; readonly snapshot: StageSelectionSnapshot } {
    const stage = this.context.stages.stageById(stageId);
    if (!stage) {
      return { ok: false, snapshot: this.snapshot() };
    }

    // Check if the stage is unlocked
    const ctx = createConditionContext(
      this.context.saveData.progression,
      {
        stages: this.context.saveData.stages,
        achievements: this.context.saveData.achievements,
        characters: this.context.saveData.characters,
        bosses: this.context.saveData.bosses,
      },
    );
    const condition = stage.unlock as unknown as ProgressionCondition;
    if (!evaluateCondition(condition, ctx)) {
      return { ok: false, snapshot: this.snapshot() };
    }

    this.context.selectStage(stageId, this.context.stageSelectionRevision);
    return { ok: true, snapshot: this.snapshot() };
  }

  /** Select the next unlocked stage after the current one. */
  selectNext(): { readonly ok: boolean; readonly snapshot: StageSelectionSnapshot } {
    const snap = this.snapshot();
    const currentIdx = snap.stages.findIndex((s) => s.id === snap.selectedStageId);
    for (let i = currentIdx + 1; i < snap.stages.length; i++) {
      if (!snap.stages[i].locked) {
        return this.select(snap.stages[i].id);
      }
    }
    return { ok: false, snapshot: snap };
  }

  /** Select the previous unlocked stage before the current one. */
  selectPrevious(): { readonly ok: boolean; readonly snapshot: StageSelectionSnapshot } {
    const snap = this.snapshot();
    const currentIdx = snap.stages.findIndex((s) => s.id === snap.selectedStageId);
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (!snap.stages[i].locked) {
        return this.select(snap.stages[i].id);
      }
    }
    return { ok: false, snapshot: snap };
  }

  private getSelectedStageId(): string {
    const current = this.context.stages.stageById(this.context.selectedStageId);
    if (current !== undefined && !this.snapshotForSelection().find((stage) => stage.id === current.id)?.locked) return current.id;
    const snap = this.snapshotForSelection();
    for (const stage of snap) {
      if (!stage.locked) return stage.id;
    }
    return this.context.stages.defaultStageId();
  }

  private snapshotForSelection(): readonly StageOptionView[] {
    const ctx = createConditionContext(
      this.context.saveData.progression,
      {
        stages: this.context.saveData.stages,
        achievements: this.context.saveData.achievements,
        characters: this.context.saveData.characters,
        bosses: this.context.saveData.bosses,
      },
    );
    return this.context.stages.allStages().map((stage) => {
      const condition = stage.unlock as unknown as ProgressionCondition;
      const locked = !evaluateCondition(condition, ctx);
      return Object.freeze({
        id: stage.id,
        name: stage.name,
        chapterId: stage.chapterId,
        displayOrder: stage.displayOrder,
        locked,
        selected: false,
        completed: this.context.saveData.stages[stage.id]?.completed === true,
      } satisfies StageOptionView);
    });
  }
}
