import type { ObjectiveType } from '../gameplay/stage/stageContracts';
export interface ObjectivePresentation { readonly kind: ObjectiveType['type']; readonly copy: string; readonly artId: string }
export function formatObjectiveDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60); const remainder = seconds % 60;
  const m = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const s = `${remainder} second${remainder === 1 ? '' : 's'}`;
  return minutes === 0 ? s : remainder === 0 ? m : `${m} ${s}`;
}
export function resolveObjectivePresentation(objective: ObjectiveType, names: {
  enemyName(id: string): string | undefined; collectibleName(id: string): string;
}): Readonly<ObjectivePresentation> {
  let copy: string;
  switch (objective.type) {
    case 'kill': copy = `Eliminate ${objective.count}${objective.enemyTag ? ` ${objective.enemyTag}` : ''} threats`; break;
    case 'collect': copy = `Collect ${objective.count} ${names.collectibleName(objective.itemId)}`; break;
    case 'survive': copy = `Survive ${formatObjectiveDuration(objective.seconds)}`; break;
    case 'defeat': copy = `Defeat ${names.enemyName(objective.enemyId) ?? 'the boss'}`; break;
  }
  return Object.freeze({ kind: objective.type, copy, artId: `objective-icon:${objective.type}` });
}
