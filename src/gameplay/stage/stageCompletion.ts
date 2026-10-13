import type { StageDefinition } from './stageContracts';

export interface StageCompletionSnapshot {
  readonly mainCompleted: number;
  readonly mainTotal: number;
  readonly campaignComplete: boolean;
  readonly optionalCompleted: number;
  readonly optionalTotal: number;
  readonly optionalComplete: boolean;
}

/** Read only current catalog IDs; missing campaignRole preserves old campaigns. */
export function resolveStageCompletion(
  stages: readonly StageDefinition[],
  progress: Readonly<Record<string, { readonly completed?: boolean }>>,
): Readonly<StageCompletionSnapshot> {
  const main = stages.filter(stage => stage.campaignRole !== 'optional');
  const optional = stages.filter(stage => stage.campaignRole === 'optional');
  const mainCompleted = main.filter(stage => progress[stage.id]?.completed === true).length;
  const optionalCompleted = optional.filter(stage => progress[stage.id]?.completed === true).length;
  return Object.freeze({
    mainCompleted,
    mainTotal: main.length,
    campaignComplete: main.length > 0 && mainCompleted === main.length,
    optionalCompleted,
    optionalTotal: optional.length,
    optionalComplete: optional.length > 0 && optionalCompleted === optional.length,
  });
}
