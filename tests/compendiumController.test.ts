import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createGameContext } from '../src/engine/context';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { SaveManager, MemoryStorageAdapter } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { StageRegistry } from '../src/systems/stageRegistry';
import { CompendiumController } from '../src/ui/compendiumController';

function createHarness(data = loadGameData()) {
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data,
    save: new SaveManager(new MemoryStorageAdapter(), 'compendium-controller-test'),
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data), stages: new StageRegistry(data),
  });
  return { context, controller: new CompendiumController(context) };
}

describe('CompendiumController presentation', () => {
  it('exposes authoritative actor art for discovered threats while preserving spoiler state', () => {
    const { context, controller } = createHarness();
    context.recordCompendiumDiscovery('dust-mite', 'encountered');
    const snapshot = controller.snapshot();
    expect(snapshot.entries.find((entry) => entry.enemyId === 'dust-mite')).toMatchObject({
      name: 'Dust Mite', status: 'encountered', actorArtId: 'enemy:dust-mite',
    });
    const unseen = snapshot.entries.find((entry) => entry.status === 'unseen')!;
    expect(unseen.actorArtId).toBeUndefined();
  });

  it('retains an elite identity while resolving its inherited base actor art', () => {
    const base = loadGameData();
    const elite = { id: 'elite:test-dust', name: 'Veteran Dust Mite', archetype: 'elite' as const, baseEnemyId: 'dust-mite' };
    const data = { ...base, enemies: [...base.enemies, elite] };
    const { context, controller } = createHarness(data);
    context.recordCompendiumDiscovery(elite.id, 'encountered');

    expect(controller.snapshot().entries.find((entry) => entry.enemyId === elite.id)).toMatchObject({
      name: elite.name, status: 'encountered', actorArtId: 'enemy:dust-mite',
    });
  });
});
