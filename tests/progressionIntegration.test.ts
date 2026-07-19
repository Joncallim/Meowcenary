import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { isUnlocked } from '../src/gameplay/meta';
import { prepareRun } from '../src/gameplay/runStart';
import { createRunState } from '../src/gameplay/runState';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { ProgressionController } from '../src/ui/progressionController';

describe('meta progression integration', () => {
  it('banks a run, purchases from the current snapshot, and applies it only to the next run', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const bus = createEventBus();
    const context = createGameContext({
      bus, menuRng: createRng(1), data, arenas, metaUpgrades, characters,
      save: new SaveManager(new MemoryStorageAdapter(), 'integration', metaUpgrades.maxLevels()),
    });
    const active = prepared(context.saveData.meta, metaUpgrades);
    expect(active.stats.resolve('maxHealth', 100)).toBe(100);

    const finished = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    finished.status = 'won'; finished.currency = 25;
    new ProgressionSystem({ runState: finished, bus, context }).bankFinishedRun();
    expect(context.saveData.meta.scrap).toBe(25);

    const controller = new ProgressionController(context);
    expect(controller.purchase('reinforced-vest')).toMatchObject({ ok: true, cost: 10, newLevel: 1 });
    expect(active.stats.resolve('maxHealth', 100)).toBe(100);
    const next = prepared(context.saveData.meta, metaUpgrades);
    expect(next.stats.resolve('maxHealth', 100)).toBe(110);
    expect(context.saveData.meta.scrap).toBe(15);
  });

  it('grants the first-victory unlock on a win, making bolt-hound selectable', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const bus = createEventBus();
    const context = createGameContext({
      bus, menuRng: createRng(1), data, arenas, metaUpgrades, characters,
      save: new SaveManager(new MemoryStorageAdapter(), 'first-victory', metaUpgrades.maxLevels()),
    });

    expect(context.selectCharacter('bolt-hound', context.selectionRevision))
      .toMatchObject({ ok: false, reason: 'locked' });

    const won = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
    won.status = 'won';
    new ProgressionSystem({ runState: won, bus, context }).bankFinishedRun();
    expect(isUnlocked(context.saveData.meta, 'achievement:first-victory')).toBe(true);

    expect(context.selectCharacter('bolt-hound', context.selectionRevision))
      .toMatchObject({ ok: true, characterId: 'bolt-hound' });
  });
});

function prepared(meta: Parameters<typeof prepareRun>[0]['meta'], metaUpgrades: DataMetaUpgradeRegistry) {
  return prepareRun({
    state: { seed: 1, characterId: 'cat', arenaId: 'arena' },
    basePlayer: { maxHealth: 100, moveSpeed: 100 }, meta, metaUpgrades,
    character: { baseStats: {}, passiveModifiers: [], startingWeapons: [] },
  }).run;
}
