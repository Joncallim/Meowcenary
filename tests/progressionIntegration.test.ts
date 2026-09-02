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
import { StageSelectionController } from '../src/ui/stageSelectionController';
import { DataAchievementRegistry, registeredMetricIds } from '../src/systems/achievements';
import { evaluateAchievements } from '../src/gameplay/achievementSystem';

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
    const active = prepared(context.saveData.progression, metaUpgrades);
    expect(active.stats.resolve('maxHealth', 100)).toBe(100);

    const finished = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    finished.status = 'won'; finished.currency = 25;
    new ProgressionSystem({ runState: finished, bus, context }).bankFinishedRun();
    expect(context.saveData.progression.scrap).toBe(25);

    const controller = new ProgressionController(context);
    expect(controller.purchase('reinforced-vest')).toMatchObject({ ok: true, cost: 10, newLevel: 1 });
    expect(active.stats.resolve('maxHealth', 100)).toBe(100);
    const next = prepared(context.saveData.progression, metaUpgrades);
    expect(next.stats.resolve('maxHealth', 100)).toBe(110);
    expect(context.saveData.progression.scrap).toBe(15);
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
    expect(isUnlocked(context.saveData.progression, 'achievement:first-victory')).toBe(true);

    expect(context.selectCharacter('bolt-hound', context.selectionRevision))
      .toMatchObject({ ok: true, characterId: 'bolt-hound' });
  });

  it('makes Scrap Weasel selectable only after the canonical 100-kill achievement grant', () => {
    const data = loadGameData();
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas: new DataArenaRegistry(data), metaUpgrades, characters: new DataCharacterRegistry(data),
      save: new SaveManager(new MemoryStorageAdapter(), 'kill-100-character', metaUpgrades.maxLevels()),
    });
    expect(context.selectCharacter('scrap-weasel', context.selectionRevision)).toMatchObject({ ok: false, reason: 'locked' });

    const registry = new DataAchievementRegistry({ achievements: data.achievements ?? [] });
    const metrics = new Map(registeredMetricIds().map((id) => [id, (facts: { metrics: Record<string, number> }) => facts.metrics[id] ?? 0]));
    const result = evaluateAchievements(context.saveData.achievements, {
      metrics: { 'metric:enemies-defeated': 100 }, progression: context.saveData.progression,
    }, { definitions: registry.asMap(), metrics }, 100_000);
    expect(result.completed).toContain('achievement:kill-milestone-100');
    expect(context.commitAchievementTransaction(result.state, context.saveData.achievementMetrics, {
      id: 'achievement:kill-milestone-100:completion', grants: result.rewards,
    })).toBe(true);
    expect(context.saveData.progression.unlocks).toContain('character:scrap-weasel');
    expect(context.selectCharacter('scrap-weasel', context.selectionRevision)).toMatchObject({ ok: true });
  });

  it('connects a boss stage fact to an achievement, durable equipment reward, and next-stage availability', () => {
    const data = loadGameData();
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas: new DataArenaRegistry(data), metaUpgrades, characters: new DataCharacterRegistry(data),
      save: new SaveManager(new MemoryStorageAdapter(), 'boss-to-equipment', metaUpgrades.maxLevels()),
    });
    const stage = data.stages?.find((candidate) => candidate.id === 'stage:junkyard-05');
    const reward = data.rewardProfiles?.find((candidate) => candidate.id === stage?.rewardProfileId);
    if (!reward) throw new Error('Missing stage reward profile');
    expect(context.completeStageTransaction('stage:junkyard-05', 120_000, 'boss-crusher', {
      id: 'stage:junkyard-05:first-clear',
      grants: [{ type: 'grant-scrap', amount: reward.scrapBase + 2 * reward.scrapPerMinute }, ...(reward.grants ?? [])],
    })).toBe(true);
    const registry = new DataAchievementRegistry({ achievements: data.achievements ?? [] });
    const metrics = new Map(registeredMetricIds().map((id) => [id, (facts: { metrics: Record<string, number> }) => facts.metrics[id] ?? 0]));
    const result = evaluateAchievements(context.saveData.achievements, {
      metrics: context.saveData.achievementMetrics,
      progression: context.saveData.progression,
      stages: context.saveData.stages,
      characters: context.saveData.characters,
      bosses: context.saveData.bosses,
    }, { definitions: registry.asMap(), metrics }, 120_000);
    expect(result.completed).toContain('achievement:boss-crusher');
    expect(context.commitAchievementTransaction(result.state, context.saveData.achievementMetrics, {
      id: 'achievement:boss-crusher:completion', grants: result.rewards,
    })).toBe(true);
    expect(context.saveData.equipment['reward:crusher-commando-helmet']).toMatchObject({ equipmentId: 'equipment:commando-helmet' });
    expect(context.saveData.progression.unlocks).toContain('achievement:boss-crusher');
    expect(new StageSelectionController(context).snapshot().stages.find((stage) => stage.id === 'stage:forge-01')?.locked).toBe(false);
  });
});

function prepared(meta: Parameters<typeof prepareRun>[0]['meta'], metaUpgrades: DataMetaUpgradeRegistry) {
  return prepareRun({
    state: { seed: 1, characterId: 'cat', arenaId: 'arena' },
    basePlayer: { maxHealth: 100, moveSpeed: 100 }, meta, metaUpgrades,
    character: { baseStats: {}, passiveModifiers: [], startingWeapons: [] },
  }).run;
}
