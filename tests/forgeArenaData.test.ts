import { describe, expect, it } from 'vitest';
import arenasJson from '../src/data/arenas.json';
import stagesJson from '../src/data/stages.json';
import bundlesJson from '../src/data/asset-bundles.json';
import type { ArenaDefinition, VisualArtCatalog } from '../src/systems/types';
import { assertArenaVisualReferences } from '../src/systems/validation';

describe('Forge Foundry arena data', () => {
  it('declares a second arena with the canonical Forge world packet', () => {
    const arena = (arenasJson as readonly ArenaDefinition[]).find((candidate) => candidate.id === 'forge-foundry');
    expect(arena).toBeDefined();
    expect(arena).toMatchObject({
      name: 'Forge Foundry',
      spawnCurveId: 'junkyard-intro',
      hazards: [{ id: 'heat-grate', kind: 'heat-grate' }],
    });
    expect(arena?.visual.floorArtIds).toEqual([
      'world:forge-floor:base',
      'world:forge-floor:grate-patch',
      'world:forge-floor:heat-scar',
    ]);
    expect(Object.values(arena?.visual.boundary ?? {})).toEqual([
      'world:forge-boundary:straight',
      'world:forge-boundary:corner',
      'world:forge-boundary:patch',
      'world:forge-boundary:gate',
    ]);
    expect(arena?.visual.decorations.map((decoration) => decoration.artId)).toEqual([
      'world:forge-prop:coil-rack',
      'world:forge-prop:ingot-pallet',
      'world:forge-prop:quench-drum',
      'world:forge-prop:tool-cart',
      'world:forge-prop:slag-pile',
      'world:forge-prop:heat-beacon',
    ]);
    expect(arena?.visual.obstacleSkins.map((skin) => skin.artId)).toEqual([
      'world:forge-landmark:furnace-throat',
      'world:forge-landmark:cooling-manifold',
    ]);
  });

  it('repoints every Forge contract while preserving historical stage:junkyard-06', () => {
    const stages = stagesJson as readonly { id: string; chapterId: string; arenaId: string; assetBundleId: string }[];
    const forgeStages = stages.filter((stage) => stage.chapterId === 'chapter:forge');
    expect(forgeStages).toHaveLength(5);
    expect(forgeStages.map((stage) => stage.arenaId)).toEqual(Array(5).fill('forge-foundry'));
    expect(forgeStages.map((stage) => stage.assetBundleId)).toEqual(Array(5).fill('bundle:core-forge'));
    expect(stages.find((stage) => stage.id === 'stage:junkyard-06')).toMatchObject({
      arenaId: 'forge-foundry',
      assetBundleId: 'bundle:core-forge',
    });
  });

  it('declares the full Forge world packet while keeping hazard art out of ArenaVisualDefinition', () => {
    const bundle = (bundlesJson as readonly { id: string; resourceIds: readonly string[] }[]).find((candidate) => candidate.id === 'bundle:core-forge');
    expect(bundle?.resourceIds).toEqual(['resource:world-forge-atlas']);
  });

  it('accepts a declared non-Junkyard world art family', () => {
    const arena = (arenasJson as readonly ArenaDefinition[]).find((candidate) => candidate.id === 'forge-foundry');
    expect(arena).toBeDefined();
    const forgeBindings = [
      ...arena!.visual.floorArtIds,
      ...Object.values(arena!.visual.boundary),
      ...arena!.visual.decorations.map((decoration) => decoration.artId),
      ...arena!.visual.obstacleSkins.map((skin) => skin.artId),
    ].map((id) => ({ id, kind: 'world' as const, required: true }));
    const catalog = { bindings: forgeBindings } as unknown as VisualArtCatalog;
    expect(() => assertArenaVisualReferences([arena!], catalog)).not.toThrow();
  });
});
