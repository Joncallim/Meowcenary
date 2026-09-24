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
  readonly bestTimeMs?: number;
  readonly chapterName: string;
  readonly locationName: string;
  readonly locationArtId: string;
  readonly objective: { readonly kind: string; readonly copy: string; readonly artId: string };
  readonly threats: readonly { readonly enemyId: string; readonly name: string; readonly actorArtId: string }[];
  readonly reward: { readonly firstClearScrap: number; readonly headline: string };
  readonly boss: boolean;
  readonly lockCopy?: string;
}

export type StageFrontierView =
  | { readonly kind: 'next' | 'replay'; readonly stageId: string }
  | { readonly kind: 'campaign-complete'; readonly stageId: string };

export interface StageSelectionSnapshot {
  readonly revision: number;
  readonly selectedStageId: string;
  readonly stages: readonly StageOptionView[];
  readonly frontier: StageFrontierView;
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
    const stageDefinitions = context.stages.allStages();
    const stages = stageDefinitions.map((stage) => {
      const condition = stage.unlock as unknown as ProgressionCondition;
      const locked = !evaluateCondition(condition, ctx);
      const completed = context.saveData.stages[stage.id]?.completed === true;

      return this.present(stage, locked, stage.id === selectedStageId, completed);
    });

    const next = stages.find((stage) => !stage.completed && !stage.locked);
    const selected = stages.find((stage) => stage.id === selectedStageId) ?? stages[0]!;
    const allComplete = stages.length > 0 && stages.every((stage) => stage.completed);
    const frontier: StageFrontierView = allComplete
      ? Object.freeze({ kind: 'campaign-complete', stageId: stages[stages.length - 1]!.id })
      : next
        ? Object.freeze({ kind: 'next', stageId: next.id })
        : Object.freeze({ kind: selected.completed ? 'replay' : 'next', stageId: selected.id });

    return Object.freeze({
      revision: context.stageSelectionRevision,
      selectedStageId,
      stages: Object.freeze(stages),
      frontier,
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
    const next = this.nextUnlocked(snap);
    if (next) return this.select(next.id);
    return { ok: false, snapshot: snap };
  }

  /** Read-only counterpart to selectNext for terminal UI affordances. */
  hasNextUnlockedStage(): boolean {
    return this.nextUnlocked(this.snapshot()) !== undefined;
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

  private nextUnlocked(snapshot: StageSelectionSnapshot): StageOptionView | undefined {
    const currentIdx = snapshot.stages.findIndex((stage) => stage.id === snapshot.selectedStageId);
    return snapshot.stages.slice(currentIdx + 1).find((stage) => !stage.locked);
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
      return this.present(stage, locked, false, this.context.saveData.stages[stage.id]?.completed === true);
    });
  }

  private present(
    stage: ReturnType<GameContext['stages']['allStages']>[number],
    locked: boolean,
    selected: boolean,
    completed: boolean,
  ): StageOptionView {
    const arena = this.context.arenas.arenaById(stage.arenaId);
    const encounter = this.context.data.encounterProfiles?.find((row) => row.id === stage.encounterProfileId);
    const reward = this.context.data.rewardProfiles?.find((row) => row.id === stage.rewardProfileId);
    const priorStageId = stage.unlock.type === 'stage-cleared' && typeof stage.unlock.stageId === 'string'
      ? stage.unlock.stageId : undefined;
    const priorName = priorStageId ? this.context.stages.stageById(priorStageId)?.name : undefined;
    const threats = (encounter?.enemyIds ?? []).slice(0, 4).flatMap((enemyId) => {
      const enemy = this.context.data.enemies.find((row) => row.id === enemyId);
      return enemy ? [{ enemyId, name: enemy.name, actorArtId: `enemy:${enemyId}` }] : [];
    });
    const firstClearScrap = reward?.firstClearScrap ?? 0;
    const grantNames = (reward?.grants ?? []).flatMap((grant) => {
      if (grant.type === 'grant-part-instance' || grant.type === 'unlock-part') {
        const part = this.context.data.gunParts?.find((row) => row.id === grant.partId);
        return part ? [part.name] : [];
      }
      if (grant.type === 'grant-equipment-instance' || grant.type === 'unlock-equipment') {
        const equipment = this.context.data.equipment?.find((row) => row.id === grant.equipmentId);
        return equipment ? [equipment.name] : [];
      }
      return [];
    });
    const bestTimeMs = this.context.saveData.stages[stage.id]?.bestTimeMs;
    return Object.freeze({
      id: stage.id, name: stage.name, chapterId: stage.chapterId,
      chapterName: chapterName(stage.chapterId), displayOrder: stage.displayOrder,
      locked, selected, completed, ...(bestTimeMs === undefined ? {} : { bestTimeMs }),
      locationName: arena?.name ?? 'Unknown location',
      locationArtId: arena?.visual.floorArtIds[0] ?? '',
      objective: objectivePresentation(stage.objective, this.context),
      threats: Object.freeze(threats),
      reward: Object.freeze({
        firstClearScrap,
        headline: [`${firstClearScrap} Scrap`, ...grantNames].join(' + '),
      }),
      boss: stage.bossId !== undefined,
      ...(locked ? { lockCopy: priorName ? `Clear ${priorName} first.` : 'Complete the previous Contract first.' } : {}),
    });
  }
}

function chapterName(chapterId: string): string {
  const slug = chapterId.split(':').at(-1) ?? chapterId;
  return slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function objectivePresentation(
  objective: ReturnType<GameContext['stages']['allStages']>[number]['objective'],
  context: GameContext,
): StageOptionView['objective'] {
  switch (objective.type) {
    case 'kill': return Object.freeze({ kind: 'kill', copy: objective.enemyTag ? `Eliminate ${objective.count} ${objective.enemyTag} threats` : `Eliminate ${objective.count} threats`, artId: 'upgrade-icon:heavy-rounds' });
    case 'collect': return Object.freeze({ kind: 'collect', copy: `Collect ${objective.count} Scrap`, artId: 'drop:scrap' });
    case 'survive': return Object.freeze({ kind: 'survive', copy: `Survive ${Math.round(objective.seconds / 60)} minutes`, artId: 'upgrade-icon:quick-paws' });
    case 'defeat': {
      const enemy = context.data.enemies.find((row) => row.id === objective.enemyId);
      return Object.freeze({ kind: 'defeat', copy: `Defeat ${enemy?.name ?? 'the boss'}`, artId: `enemy:${objective.enemyId}` });
    }
  }
}
