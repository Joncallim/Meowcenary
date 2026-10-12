import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { resolveRunPlan } from '../src/gameplay/stage/stageContracts';
import { requiredRunStartIntroArtIds, resolveRunStartIntroModel } from '../src/presentation/runStartIntro';
import { loadGameData, validateArenaCatalog } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { resolveArenaLayout } from '../src/gameplay/arenaLayout';
import { prepareRunPresentation, resolveRunPhysicalResources } from '../src/systems/resourceLoader';
import { MenuScene } from '../src/scenes/MenuScene';
import { GameScene } from '../src/scenes/GameScene';

// Keep real catalog, resolution, closure, serialization and entry guards. Only
// browser decoding/audio and the unrelated Menu render are replaced below.
vi.mock('../src/gameplay/arenaLayout', async original => {
  const actual = await original<typeof import('../src/gameplay/arenaLayout')>();
  return { ...actual, resolveArenaLayout: vi.fn(actual.resolveArenaLayout) };
});
vi.mock('../src/presentation/runStartIntro', async original => {
  const actual = await original<typeof import('../src/presentation/runStartIntro')>();
  return { ...actual, resolveRunStartIntroModel: vi.fn(actual.resolveRunStartIntroModel) };
});
vi.mock('../src/systems/resourceLoader', async original => {
  const actual = await original<typeof import('../src/systems/resourceLoader')>();
  return { ...actual, resolveRunPhysicalResources: vi.fn(actual.resolveRunPhysicalResources),
    prepareRunPresentation: vi.fn(async () => undefined) };
});
vi.mock('../src/systems/audioResources', async original => ({
  ...await original<typeof import('../src/systems/audioResources')>(),
  loadAudioResources: vi.fn(async () => undefined),
}));

const data = loadGameData();
const art = new DataVisualArtRegistry(data);

function createContext(fixtureData = data) {
  return createGameContext({ data: fixtureData, bus: createEventBus(), menuRng: createRng(53),
    arenas: new DataArenaRegistry(fixtureData), characters: new DataCharacterRegistry(fixtureData),
    save: new SaveManager(new MemoryStorageAdapter(), 'arena-resource-closure-proof') });
}

function createMenu(context: ReturnType<typeof createContext>) {
  const menu = new MenuScene() as any;
  menu.getContext = () => context;
  menu.isLive = true;
  menu.controller = { snapshot: () => ({ panel: 'training' }) };
  menu.render = vi.fn();
  menu.scene = { start: vi.fn() };
  return menu;
}

describe('prepared arena resource boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unites selected world, Mercenary, objective and boss intro art with physical deduplication', () => {
    const context = createContext();
    for (const arena of data.arenas) for (const seed of [1, 42]) {
      const layout = resolveArenaLayout(arena, seed, data.contentVersion);
      for (const character of data.characters) {
        const stage = data.stages!.find(row => row.arenaId === arena.id && row.openingDialogue);
        expect(stage, `${arena.id} boss intro fixture`).toBeDefined();
        const request = { kind: 'stage' as const, characterId: character.id, stageId: stage!.id, seed };
        const plan = resolveRunPlan(request, context.stages.runPlanCatalog());
        const model = resolveRunStartIntroModel({ data, request, plan });
        expect(model.boss).toBeDefined();
        const resources = resolveRunPhysicalResources({ data, characterId: character.id,
          arena: layout.arena, layout, encounterEnemyIds: plan.encounter.enemyIds,
          bossId: plan.encounter.bossId, introArtIds: requiredRunStartIntroArtIds(model) });
        const resourceIds = new Set(resources.map(r => r.id));
        const chosenWorld = [layout.arena.visual.floorArtIds[0]!, ...layout.floorPlan,
          ...Object.values(layout.arena.visual.boundary),
          ...layout.arena.visual.decorations.map(d => d.artId),
          ...layout.obstacles.map(o => o.skin.artId), ...layout.hazards.map(h => h.artId)];
        const ability = data.abilities!.find(a => a.id === character.abilityId)!;
        for (const id of [...chosenWorld, character.presentation.portraitArtId, ability.presentation.iconArtId,
          ...requiredRunStartIntroArtIds(model)]) {
          expect(resourceIds.has(art.bindingById(id)!.resourceId!), `${arena.id}/${seed}/${id}`).toBe(true);
        }
        expect(resources.length).toBe(resourceIds.size);
      }
    }
  });

  it('includes an objective intro binding with a distinct physical resource outside the world closure', () => {
    const objectiveId = 'objective-icon:kill';
    const base = data.visualArt.bindings.find(binding => binding.id === objectiveId)!;
    const source = data.visualResources.find(resource => resource.id === base.resourceId)!;
    const objectiveResource = { ...source, id: 'resource:objective-intro-fixture', textureKey: 'art-objective-intro-fixture' };
    const fixtureData = { ...data, visualResources: [...data.visualResources, objectiveResource],
      visualArt: { ...data.visualArt, bindings: data.visualArt.bindings.map(binding =>
        binding.id === objectiveId ? { ...binding, resourceId: objectiveResource.id } : binding) } };
    const context = createContext(fixtureData);
    const request = { kind: 'stage' as const, characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 };
    const plan = resolveRunPlan(request, context.stages.runPlanCatalog());
    const model = resolveRunStartIntroModel({ data: fixtureData, request, plan });
    expect(model.objective.kind).toBe('stage');
    expect(requiredRunStartIntroArtIds(model)).toContain(objectiveId);
    const layout = resolveArenaLayout(context.arenas.arenaById(plan.arenaId)!, request.seed, fixtureData.contentVersion);
    const options = { data: fixtureData, characterId: request.characterId, arena: layout.arena, layout,
      encounterEnemyIds: plan.encounter.enemyIds, bossId: plan.encounter.bossId };
    expect(resolveRunPhysicalResources(options).map(resource => resource.id)).not.toContain(objectiveResource.id);
    const resources = resolveRunPhysicalResources({ ...options, introArtIds: requiredRunStartIntroArtIds(model) });
    expect(resources.filter(resource => resource.id === objectiveResource.id)).toEqual([objectiveResource]);
    expect(resources.length).toBe(new Set(resources.map(resource => resource.id)).size);
  });

  it('closes an ability-absent Mercenary intro and rejects a supplied unknown ability', () => {
    const fixtureData = structuredClone(data);
    delete (fixtureData.characters[0] as { abilityId?: string }).abilityId;
    const request = { kind: 'legacy-arena' as const, characterId: fixtureData.characters[0].id, arenaId: 'junkyard-lot', seed: 42 };
    const layout = resolveArenaLayout(fixtureData.arenas[0]!, request.seed, fixtureData.contentVersion);
    const model = resolveRunStartIntroModel({ data: fixtureData, request });
    expect(model.ability).toBeUndefined();
    const options = { data: fixtureData, characterId: request.characterId, arena: layout.arena, layout,
      encounterEnemyIds: [], introArtIds: requiredRunStartIntroArtIds(model) };
    const resources = resolveRunPhysicalResources(options);
    expect(resources.map(resource => resource.id)).toContain(art.bindingById(model.mercenary.portraitArtId)!.resourceId);
    fixtureData.characters[0] = { ...fixtureData.characters[0], abilityId: 'ability:unknown-fixture' };
    expect(() => resolveRunPhysicalResources(options)).toThrow('missing ability "ability:unknown-fixture"');
  });

  it('excludes an unselected valid floor-palette resource with its own physical identity', () => {
    // All current obstacle palette members are also required fixed anchors.
    // An authored floor palette can contain an unselected logical variant;
    // assign it a distinct texture/resource so atlas siblings cannot mask it.
    const base = data.visualArt.bindings.find(b => b.id === 'world:junkyard-floor:base')!;
    const source = data.visualResources.find(r => r.id === base.resourceId)!;
    const unused = { ...source, id: 'resource:world-unused-floor-fixture', textureKey: 'art-world-unused-floor-fixture' };
    const binding = { ...base, id: 'world:junkyard-floor:unused-fixture', resourceId: unused.id };
    const fixtureData = { ...data, visualResources: [...data.visualResources, unused],
      visualArt: { ...data.visualArt, bindings: [...data.visualArt.bindings, binding] } };
    const fixtureArt = new DataVisualArtRegistry(fixtureData);
    expect(fixtureArt.bindingById(binding.id)!.textureKey).toBe(unused.textureKey);
    const { generation, ...authored } = data.arenas[0]!;
    expect(generation).toBeDefined();
    const arena = { ...authored, size: { width: 256, height: 256 },
      spawnRegions: [{ kind: 'rect' as const, x: 112, y: 112, w: 32, h: 32 }], obstacles: [], hazards: [],
      visual: { ...data.arenas[0]!.visual, floorArtIds: [base.id, binding.id], decorations: [], obstacleSkins: [], hazardSkins: [] } };
    expect(() => validateArenaCatalog([arena])).not.toThrow();
    const layout = resolveArenaLayout(arena, 42, data.contentVersion);
    expect(layout.floorPlan).not.toContain(binding.id);
    const options = { data: fixtureData, characterId: 'scrap-tabby', arena: layout.arena, encounterEnemyIds: [] };
    // Positive control: the old template closure really would load this
    // unused resource, while the captured layout closes over selected nodes.
    expect(resolveRunPhysicalResources(options).map(r => r.id)).toContain(unused.id);
    expect(resolveRunPhysicalResources({ ...options, layout }).map(r => r.id)).not.toContain(unused.id);
  });

  it('rejects a lookalike arena object instead of closing over geometry outside its layout', () => {
    const layout = resolveArenaLayout(data.arenas[0]!, 42, data.contentVersion);
    expect(() => resolveRunPhysicalResources({ data, characterId: 'scrap-tabby',
      arena: structuredClone(layout.arena), layout, encounterEnemyIds: [] })).toThrow('prepared layout arena');
  });

  it.each([
    { name: 'Training', training: true },
    { name: 'normal Contract', training: false, stageId: 'stage:junkyard-01' },
    { name: 'boss Contract', training: false, stageId: 'stage:junkyard-06' },
  ])('forwards one immutable Menu layout and intro into guarded Game recovery for $name', async ({ training, stageId }) => {
    const context = createContext();
    const menu = createMenu(context);
    const seedDraw = vi.spyOn(context.menuRng, 'int');
    const saved = JSON.stringify(context.saveData);
    const started = vi.fn(); context.bus.on('run:start', started);
    const request = Object.freeze(training
      ? { kind: 'legacy-arena' as const, characterId: 'scrap-tabby', arenaId: 'junkyard-lot', seed: 42 }
      : { kind: 'stage' as const, characterId: 'scrap-tabby', stageId: stageId!, seed: 42 });
    await menu.startRunWithResources(request, training);
    expect(menu.scene.start).toHaveBeenCalledOnce();
    const launch = menu.scene.start.mock.calls[0][1];
    const layout = launch.arenaLayout;
    expect(launch.runRequest).toBe(request);
    expect(layout).toBe(menu.preparedArenaLayout);
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.arena.obstacles)).toBe(true);
    expect(launch.isTraining).toBe(training);
    expect(launch.introModel.identity.seed).toBe(request.seed);
    expect(launch.introModel.identity.arenaId).toBe(layout.arenaId);
    expect(Object.isFrozen(launch.introModel)).toBe(true);
    expect(launch.stagePlan === undefined).toBe(training);
    if (!training) {
      expect(launch.stagePlan.seed).toBe(request.seed);
      expect(launch.stagePlan.arenaId).toBe(layout.arenaId);
      expect(Object.isFrozen(launch.stagePlan)).toBe(true);
      expect(Boolean(launch.introModel.boss)).toBe(stageId === 'stage:junkyard-06');
    }
    expect(vi.mocked(resolveArenaLayout)).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveRunStartIntroModel)).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveRunStartIntroModel).mock.results[0].value).toBe(launch.introModel);
    expect(vi.mocked(resolveRunStartIntroModel).mock.calls[0][0].plan).toBe(launch.stagePlan);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[0][0].layout).toBe(layout);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[0][0].arena).toBe(layout.arena);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[0][0].introArtIds).toEqual(requiredRunStartIntroArtIds(launch.introModel));
    expect(vi.mocked(prepareRunPresentation).mock.calls[0][2]).toBe(vi.mocked(resolveRunPhysicalResources).mock.results[0].value);

    const game = new GameScene() as any;
    game.getContext = () => context;
    game.events = new EventEmitter();
    game.game = { events: new EventEmitter(), renderer: new EventEmitter() };
    game.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
    game.scene = { start: vi.fn() };
    // Stop at the real fail-closed resource guard before any entity is built.
    game.textures = { exists: () => false, get: () => { throw new Error('unexpected texture access'); } };
    expect(() => game.create(launch)).not.toThrow();
    expect(game.recovering).toBe(true);
    expect(game.scene.start).not.toHaveBeenCalled();
    expect(game.resolvedArenaLayout).toBe(layout);
    expect(game.stagePlan).toBe(launch.stagePlan);
    expect(game.player).toBeUndefined();
    expect(vi.mocked(resolveArenaLayout)).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveRunStartIntroModel)).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveRunPhysicalResources)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[1][0].layout).toBe(layout);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[1][0].arena).toBe(layout.arena);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[1][0].introArtIds).toEqual(requiredRunStartIntroArtIds(launch.introModel));
    game.game.events.emit('poststep'); game.game.events.emit('poststep');
    expect(game.scene.start).toHaveBeenCalledExactlyOnceWith('MenuScene', expect.objectContaining({
      failedRunRequest: request, failedArenaLayout: layout, isTraining: training,
      failedRunError: expect.stringContaining('Required run resources failed to load'),
    }));
    expect(game.scene.start.mock.calls[0][1].failedRunRequest).toBe(request);
    expect(game.scene.start.mock.calls[0][1].failedArenaLayout).toBe(layout);
    expect(started).not.toHaveBeenCalled();
    expect(seedDraw).not.toHaveBeenCalled();
    expect(JSON.stringify(context.saveData)).toBe(saved);
  });
});
