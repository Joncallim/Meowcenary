import { beforeEach, describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { loadGameData, validateArenaCatalog } from '../src/systems/validation';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { DataArenaRegistry } from '../src/systems/arenas';
import { resolveArenaLayout } from '../src/gameplay/arenaLayout';
import { prepareRunPresentation, resolveRunPhysicalResources } from '../src/systems/resourceLoader';
import { MenuScene } from '../src/scenes/MenuScene';
import { GameScene } from '../src/scenes/GameScene';

// Keep real catalog, resolution, closure, serialization and entry guards. Only
// browser decoding/audio and the unrelated Menu render are replaced below.
vi.mock('../src/engine/context', async original => ({
  ...await original<typeof import('../src/engine/context')>(),
  getGameContext: (scene: any) => scene.testContext,
}));
vi.mock('../src/gameplay/arenaLayout', async original => {
  const actual = await original<typeof import('../src/gameplay/arenaLayout')>();
  return { ...actual, resolveArenaLayout: vi.fn(actual.resolveArenaLayout) };
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

describe('prepared arena resource boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads every selected paired skin and keeps every Mercenary portrait and ability icon', () => {
    for (const arena of data.arenas) for (const seed of [1, 42]) {
      const layout = resolveArenaLayout(arena, seed, data.contentVersion);
      for (const character of data.characters) {
        const resources = resolveRunPhysicalResources({ data, characterId: character.id,
          arena: layout.arena, layout, encounterEnemyIds: [] });
        const resourceIds = new Set(resources.map(r => r.id));
        const chosenWorld = [layout.arena.visual.floorArtIds[0]!, ...layout.floorPlan,
          ...Object.values(layout.arena.visual.boundary),
          ...layout.arena.visual.decorations.map(d => d.artId),
          ...layout.obstacles.map(o => o.skin.artId), ...layout.hazards.map(h => h.artId)];
        const ability = data.abilities!.find(a => a.id === character.abilityId)!;
        for (const id of [...chosenWorld, character.presentation.portraitArtId, ability.presentation.iconArtId]) {
          expect(resourceIds.has(art.bindingById(id)!.resourceId!), `${arena.id}/${seed}/${id}`).toBe(true);
        }
        expect(resources.length).toBe(resourceIds.size);
      }
    }
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

  it('forwards the same immutable Menu result through preparation and Game entry without another RNG resolution', async () => {
    const context = { data, arenas: new DataArenaRegistry(data),
      characters: { characterById: (id: string) => data.characters.find(c => c.id === id) },
      captureRunPresentationBaseline: () => Object.freeze({ fixture: 'captured-baseline' }) };
    const menu = new MenuScene() as any;
    menu.testContext = context;
    menu.isLive = true;
    menu.controller = { snapshot: () => ({ panel: 'training' }) };
    menu.render = vi.fn();
    menu.scene = { start: vi.fn() };
    const request = Object.freeze({ kind: 'legacy-arena' as const, characterId: 'scrap-tabby', arenaId: 'junkyard-lot', seed: 42 });
    await menu.startRunWithResources(request, true);
    expect(menu.scene.start).toHaveBeenCalledOnce();
    const launch = menu.scene.start.mock.calls[0][1];
    const layout = launch.arenaLayout;
    expect(launch.runRequest).toBe(request);
    expect(layout).toBe(menu.preparedArenaLayout);
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.arena.obstacles)).toBe(true);
    expect(vi.mocked(resolveArenaLayout)).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[0][0].layout).toBe(layout);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[0][0].arena).toBe(layout.arena);
    expect(vi.mocked(prepareRunPresentation).mock.calls[0][2]).toBe(vi.mocked(resolveRunPhysicalResources).mock.results[0].value);

    const game = new GameScene() as any;
    game.testContext = context;
    // Stop at the real fail-closed resource guard before any entity is built.
    game.textures = { exists: () => false, get: () => { throw new Error('unexpected texture access'); } };
    expect(() => game.create(launch)).toThrow('Required run resources failed to load');
    expect(game.resolvedArenaLayout).toBe(layout);
    expect(game.player).toBeUndefined();
    expect(vi.mocked(resolveArenaLayout)).toHaveBeenCalledOnce();
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[1][0].layout).toBe(layout);
    expect(vi.mocked(resolveRunPhysicalResources).mock.calls[1][0].arena).toBe(layout.arena);
  });
});
