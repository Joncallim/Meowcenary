import { deepFreeze } from '../engine/freeze';
import type { ComposedRunRequest } from '../gameplay/runRequest';
import type { ObjectiveType, ResolvedRunPlan } from '../gameplay/stage/stageContracts';
import type { GameData } from '../systems/types';
import { DataVisualArtRegistry } from '../systems/visualArt';
import { describeCollectible } from '../ui/progressionPresentation';
import { resolveAbilityEffectPresentation, type AbilityEffectPresentation } from './abilityEffectPresentation';
import { formatObjectiveDuration, resolveObjectivePresentation, type ObjectivePresentation } from './stageObjective';
export interface RunStartIntroModel {
  readonly identity: { readonly characterId: string; readonly stageId?: string; readonly arenaId: string; readonly seed: number; readonly contentVersion: string };
  readonly contractName: string;
  readonly objective: { readonly kind: 'stage'; readonly definition: ObjectiveType; readonly presentation: ObjectivePresentation } | { readonly kind: 'training'; readonly copy: string; readonly durationSeconds: number };
  readonly mercenary: { readonly characterName: string; readonly portraitArtId: string };
  readonly ability?: { readonly iconArtId: string; readonly name: string; readonly effect: AbilityEffectPresentation };
  readonly boss?: { readonly enemyId: string; readonly name: string; readonly actorArtId: string; readonly lines: readonly string[] };
}
export function resolveRunStartIntroModel({ data, request, plan }: { data: GameData; request: ComposedRunRequest; plan?: ResolvedRunPlan }): Readonly<RunStartIntroModel> {
  const character = data.characters.find(row => row.id === request.characterId);
  if (!character) throw new Error('Run introduction requires a valid mercenary');
  const ability = character.abilityId === undefined ? undefined : data.abilities?.find(row => row.id === character.abilityId);
  if (character.abilityId !== undefined && !ability) throw new Error('Run introduction requires a valid supplied ability');
  if (request.kind === 'legacy-arena' && plan) throw new Error('Training must not receive a stage plan');
  if (request.kind === 'stage' && (!plan || plan.stageId !== request.stageId || plan.characterId !== request.characterId || plan.seed !== request.seed)) throw new Error('Intro plan does not match launch');
  const arenaId = request.kind === 'stage' ? plan!.arenaId : request.arenaId;
  const stage = request.kind === 'stage' ? data.stages?.find(row => row.id === request.stageId) : undefined;
  if (request.kind === 'stage' && !stage) throw new Error('Intro contract is unavailable');
  const arena = data.arenas.find(row => row.id === arenaId);
  const curve = data.spawnCurves.find(row => row.id === arena?.spawnCurveId);
  if (!arena || !curve) throw new Error('Intro arena is unavailable');
  const visualArt = new DataVisualArtRegistry(data);
  const objective: RunStartIntroModel['objective'] = plan
    ? { kind: 'stage', definition: structuredClone(plan.objective.definition), presentation: resolveObjectivePresentation(plan.objective.definition, {
      enemyName: id => data.enemies.find(row => row.id === id)?.name,
      collectibleName: id => describeCollectible(id, visualArt).name,
    }) } : { kind: 'training', durationSeconds: curve.durationSeconds, copy: `Training — survive ${formatObjectiveDuration(curve.durationSeconds)}. Progress is not saved.` };
  const opening = plan?.openingDialogue;
  const enemy = opening ? data.enemies.find(row => row.id === opening.speakerEnemyId) : undefined;
  if (opening && (!enemy || enemy.archetype !== 'boss' || enemy.id !== plan?.encounter.bossId)) throw new Error('Intro speaker does not match boss');
  const model = deepFreeze({ identity: { characterId: request.characterId, ...(stage ? { stageId: stage.id } : {}), arenaId, seed: request.seed, contentVersion: data.contentVersion },
    contractName: stage?.name ?? 'Training', objective,
    mercenary: { characterName: character.name, portraitArtId: character.presentation.portraitArtId },
    ...(ability ? { ability: { iconArtId: ability.presentation.iconArtId, name: ability.name, effect: resolveAbilityEffectPresentation(ability) } } : {}),
    ...(opening && enemy ? { boss: { enemyId: enemy.id, name: enemy.name, actorArtId: `enemy:${enemy.id}`, lines: [...opening.lines] } } : {}) });
  for (const id of requiredRunStartIntroArtIds(model)) if (!visualArt.bindingById(id)?.required) throw new Error(`Intro art ${id} is unavailable`);
  return model;
}
export function requiredRunStartIntroArtIds(model: RunStartIntroModel): readonly string[] {
  return Object.freeze([...new Set([model.mercenary.portraitArtId, ...(model.ability ? [model.ability.iconArtId] : []),
    ...(model.objective.kind === 'stage' ? [model.objective.presentation.artId] : []), ...(model.boss ? [model.boss.actorArtId] : [])])]);
}
