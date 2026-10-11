import { describe, expect, it } from 'vitest';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import { resolveRunStartIntroModel, requiredRunStartIntroArtIds } from '../src/presentation/runStartIntro';
import { resolveAbilityEffectPresentation } from '../src/presentation/abilityEffectPresentation';
import { loadGameData } from '../src/systems/validation';
import { resolveRunPhysicalResources } from '../src/systems/resourceLoader';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { RunStartIntroController } from '../src/ui/runStartIntroController';
const data = loadGameData();
function fixture(stageId = 'stage:junkyard-06', characterId = 'scrap-tabby') {
  const request = Object.freeze({ kind: 'stage' as const, stageId, characterId, seed: 932 });
  const plan = resolveRunPlan(request, data as any);
  const model = resolveRunStartIntroModel({ data, request, plan });
  return { request, plan, model, controller: new RunStartIntroController(model) };
}
describe('captured run introduction', () => {
  it('captures the exact objective, speaker and identity with no selection dependency', () => {
    const { model, plan } = fixture();
    expect(model.identity).toMatchObject({ stageId: plan.stageId, characterId: plan.characterId, arenaId: plan.arenaId, seed: plan.seed, contentVersion: data.contentVersion });
    expect(model.objective).toMatchObject({ kind: 'stage', definition: plan.objective.definition, presentation: { copy: 'Defeat Forge Warden' } });
    expect(model.boss?.lines).toEqual(plan.openingDialogue?.lines);
    expect(Object.isFrozen(model.objective)).toBe(true);
    expect(Object.isFrozen(model.boss?.lines)).toBe(true);
    const different = fixture('stage:junkyard-01', 'bolt-hound');
    expect(different.model.identity).not.toEqual(model.identity);
    expect(model.objective).toMatchObject({ presentation: { copy: 'Defeat Forge Warden' } });
  });
  it('rejects mismatched plan identity and gives Training explicit nonpersistent objective copy', () => {
    const { request, plan } = fixture();
    expect(() => resolveRunStartIntroModel({ data, request: { ...request, seed: 5 }, plan })).toThrow('does not match');
    const training = { kind: 'legacy-arena' as const, characterId: 'scrap-tabby', arenaId: 'junkyard-lot', seed: 55 };
    expect(resolveRunStartIntroModel({ data, request: training })).toMatchObject({ contractName: 'Training', objective: { kind: 'training', copy: 'Training — survive 2 minutes. Progress is not saved.' } });
    expect(() => resolveRunStartIntroModel({ data, request: training, plan })).toThrow('Training');
  });
  it('closes every mercenary, objective and boss portrait through actual physical resources', () => {
    const art = new DataVisualArtRegistry(data);
    for (const stage of data.stages!) for (const character of data.characters) {
      const { model, plan } = fixture(stage.id, character.id);
      const resources = resolveRunPhysicalResources({ data, characterId: character.id, arena: data.arenas.find(row => row.id === plan.arenaId)!, encounterEnemyIds: plan.encounter.enemyIds, bossId: plan.encounter.bossId, introArtIds: requiredRunStartIntroArtIds(model) });
      for (const id of requiredRunStartIntroArtIds(model)) expect(resources.some(row => row.id === art.bindingById(id)?.resourceId), `${stage.id}/${character.id}/${id}`).toBe(true);
    }
  });
  it('describes all eight authored abilities numerically without fictitious one-shot durations', () => {
    for (const definition of data.abilities!) {
      const view = resolveAbilityEffectPresentation(definition);
      expect(view.cooldownLabel).toBe(`Cooldown ${definition.cooldownMs / 1000}s.`);
      if (definition.effect.kind === 'stat-burst' || definition.effect.kind === 'invulnerable') expect(view.durationLabel).toBe(`Active ${definition.durationMs / 1000}s`);
      else expect(view.durationLabel).toBeUndefined();
      expect(view.detail).not.toMatch(/attackSpeed|moveSpeed/);
    }
  });
});
describe('single bounded intro controller', () => {
  it('requires two explicit actions for a boss and consumes before emitting start', () => {
    const { controller } = fixture();
    expect(controller.command('start', 0)).toBe('none');
    expect(controller.command('continue', 0)).toBe('show-boss');
    expect(controller.command('start', 0)).toBe('none');
    expect(controller.command('start', 1)).toBe('begin-run');
    expect(controller.snapshot().phase).toBe('consumed');
    expect(controller.command('start', 2)).toBe('none');
    expect(controller.command('return-menu', 2)).toBe('none');
  });
  it('skips only dialogue and leaves ordinary contracts a single Start', () => {
    const boss = fixture().controller;
    expect(boss.command('skip-dialogue', 0)).toBe('begin-run');
    const ordinary = fixture('stage:junkyard-01').controller;
    expect(ordinary.command('continue', 0)).toBe('none');
    expect(ordinary.command('start', 0)).toBe('begin-run');
  });
  it('cancels idempotently and revokes delayed commands across destroy', () => {
    const { controller } = fixture();
    expect(controller.command('return-menu', 0)).toBe('return-menu');
    controller.destroy(); controller.destroy();
    expect(controller.command('start', controller.snapshot().revision)).toBe('none');
  });
});

describe('ability-optional presentation compatibility', () => {
  it.each(['stage:junkyard-01', 'stage:junkyard-06', 'training'])('keeps %s an explicit briefing without an ability', (stageId) => {
    const fixtureData = structuredClone(data); delete (fixtureData.characters[0] as { abilityId?: string }).abilityId;
    const request = stageId === 'training'
      ? { kind: 'legacy-arena' as const, characterId: fixtureData.characters[0].id, arenaId: 'junkyard-lot', seed: 71 }
      : { kind: 'stage' as const, characterId: fixtureData.characters[0].id, stageId, seed: 71 };
    const plan = request.kind === 'stage' ? resolveRunPlan(request, fixtureData as any) : undefined;
    const model = resolveRunStartIntroModel({ data: fixtureData, request, plan });
    expect(model).toMatchObject({ mercenary: { characterName: fixtureData.characters[0].name, portraitArtId: fixtureData.characters[0].presentation.portraitArtId } });
    expect(model.ability).toBeUndefined(); expect(Object.isFrozen(model)).toBe(true);
    const controller = new RunStartIntroController(model); expect(controller.snapshot().phase).toBe('brief');
    expect(requiredRunStartIntroArtIds(model)).not.toContain(data.abilities![0].presentation.iconArtId);
    const resources = resolveRunPhysicalResources({ data: fixtureData, characterId: request.characterId,
      arena: fixtureData.arenas.find(row => row.id === model.identity.arenaId)!,
      encounterEnemyIds: plan?.encounter.enemyIds ?? [], bossId: plan?.encounter.bossId,
      introArtIds: requiredRunStartIntroArtIds(model) });
    expect(resources.length).toBeGreaterThan(0);
    if (model.boss) expect(controller.command('continue', 0)).toBe('show-boss');
    expect(controller.command('start', controller.snapshot().revision)).toBe('begin-run');
  });
  it('rejects a supplied unknown ability rather than treating it as absent', () => {
    const fixtureData = structuredClone(data); fixtureData.characters[0] = { ...fixtureData.characters[0], abilityId: 'ability:missing' };
    const request = { kind: 'legacy-arena' as const, characterId: fixtureData.characters[0].id, arenaId: 'junkyard-lot', seed: 72 };
    expect(() => resolveRunStartIntroModel({ data: fixtureData, request })).toThrow(/ability/);
  });
});
