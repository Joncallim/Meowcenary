import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { prepareRun as _prepareRun } from '../src/gameplay/runStart';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { StageSelectionController } from '../src/ui/stageSelectionController';
import { DataAchievementRegistry, registeredMetricIds } from '../src/systems/achievements';
import { evaluateAchievements } from '../src/gameplay/achievementSystem';

describe('V4 progression integration', () => {
  it('banks scrap from a won run', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const bus = createEventBus();
    const context = createGameContext({
      bus, menuRng: createRng(1), data, arenas, characters,
      save: new SaveManager(new MemoryStorageAdapter(), 'integration'),
    });

    const settled = context.settleRunTerminal({
      terminalStatus: 'win', runScrap: 25, characterId: 'scrap-tabby', runDurationMs: 10_000,
      isTraining: true,
    });
    expect(settled).toMatchObject({ ok: true, terminalApplied: true, runScrapBanked: 25 });
    // The terminal candidate may also settle a newly-completed mastery
    // Achievement. Its source-owned reward is additive, while the accepted
    // run-Scrap field remains exactly this run's collection.
    expect(context.saveData.progression.scrap).toBeGreaterThanOrEqual(25);
  });

  it('makes Scrap Weasel selectable only after the canonical 100-kill achievement grant', () => {
    const data = loadGameData();
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
      save: new SaveManager(new MemoryStorageAdapter(), 'kill-100-character'),
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
    expect(context.saveData.progression.unlocks).toContain('achievement:kill-milestone-100');
    expect(context.selectCharacter('scrap-weasel', context.selectionRevision)).toMatchObject({ ok: true });
  });

  it('connects a boss stage fact to an achievement, durable equipment reward, and next-stage availability', () => {
    const data = loadGameData();
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
      save: new SaveManager(new MemoryStorageAdapter(), 'boss-to-equipment'),
    });
    const stage = data.stages?.find((candidate) => candidate.id === 'stage:junkyard-05');
    const reward = data.rewardProfiles?.find((candidate) => candidate.id === stage?.rewardProfileId);
    if (!reward) throw new Error('Missing stage reward profile');
    expect(context.completeStageTransaction('stage:junkyard-05', 120_000, 'boss-crusher', {
      id: 'stage:junkyard-05:first-clear',
      grants: [{ type: 'grant-scrap', amount: reward.firstClearScrap + 2 * 0 }, ...(reward.grants ?? [])],
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
