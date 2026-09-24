import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createGameContext, type GameContext } from '../src/engine/context';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { SaveManager, MemoryStorageAdapter, createDefaultSaveV3 } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { StageRegistry } from '../src/systems/stageRegistry';
import { StageSelectionController } from '../src/ui/stageSelectionController';

function createHarness(): { context: GameContext; controller: StageSelectionController } {
  const data = loadGameData();
  const context = createGameContext({
    bus: createEventBus(),
    menuRng: createRng(1),
    data,
    metaUpgrades: new DataMetaUpgradeRegistry(data),
    save: new SaveManager(new MemoryStorageAdapter(), 'test', {}),
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    stages: new StageRegistry(data),
  });
  return { context, controller: new StageSelectionController(context) };
}

describe('StageSelectionController (Epic 20)', () => {
  it('lists all stage contracts in progression order with unlocked/locked state', () => {
    const { controller } = createHarness();
    const snap = controller.snapshot();
    expect(snap.stages).toHaveLength(10);
    // Fresh save: only stage 1 (unlock-count 0) is unlocked
    expect(snap.stages[0].locked).toBe(false);
    expect(snap.stages[0].completed).toBe(false);
    expect(snap.stages[0]).toMatchObject({
      chapterName: 'Junkyard',
      locationName: 'Junkyard Lot',
      objective: { kind: 'kill', copy: 'Eliminate 25 threats' },
      reward: { firstClearScrap: 35 },
      boss: false,
    });
    expect(snap.stages[0].threats).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Dust Mite', actorArtId: 'enemy:dust-mite' }),
    ]));
    expect(snap.stages[1].lockCopy).toBe('Clear First Scavenge.');
    for (let i = 1; i < snap.stages.length; i++) {
      expect(snap.stages[i].locked).toBe(true);
    }
  });

  it('keeps every authoritative encounter threat in the read model, including current five- and six-member rosters', () => {
    const { controller } = createHarness();
    const snapshot = controller.snapshot();
    expect(snapshot.stages.find((stage) => stage.id === 'stage:junkyard-02')!.threats.map((threat) => threat.enemyId)).toEqual([
      'dust-mite', 'scrap-skitter', 'scrap-sniper', 'junk-nester', 'bastion-beetle',
    ]);
    expect(snapshot.stages.find((stage) => stage.id === 'stage:forge-04')!.threats.map((threat) => threat.enemyId)).toEqual([
      'dust-mite', 'scrap-sniper', 'junk-nester', 'junk-rusher', 'shard-bot', 'bastion-beetle',
    ]);
  });

  it('scales to an expanded N+1 encounter roster while deduplicating repeated authored IDs in display order', () => {
    const data = loadGameData();
    const targetId = data.stages![0]!.encounterProfileId;
    const expandedIds = data.enemies.map((enemy) => enemy.id);
    const encounterProfiles = data.encounterProfiles!.map((encounter) => encounter.id === targetId
      ? { ...encounter, enemyIds: [...expandedIds, expandedIds[2]!] }
      : encounter);
    const amended = { ...data, encounterProfiles };
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data: amended,
      metaUpgrades: new DataMetaUpgradeRegistry(amended), save: new SaveManager(new MemoryStorageAdapter(), 'n-plus-one-threats', {}),
      characters: new DataCharacterRegistry(amended), arenas: new DataArenaRegistry(amended), stages: new StageRegistry(amended),
    });

    expect(new StageSelectionController(context).snapshot().stages[0]!.threats.map((threat) => threat.enemyId)).toEqual(expandedIds);
  });

  it('keeps a data-only elite threat under its own identity while inheriting base actor art', () => {
    const data = loadGameData();
    const targetId = data.stages![0]!.encounterProfileId;
    const elite = { id: 'elite:test-dust', name: 'Veteran Dust Mite', archetype: 'elite' as const, baseEnemyId: 'dust-mite' };
    const amended = {
      ...data,
      enemies: [...data.enemies, elite],
      encounterProfiles: data.encounterProfiles!.map((encounter) => encounter.id === targetId
        ? { ...encounter, enemyIds: [...encounter.enemyIds, elite.id] }
        : encounter),
    };
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data: amended,
      metaUpgrades: new DataMetaUpgradeRegistry(amended), save: new SaveManager(new MemoryStorageAdapter(), 'elite-threat-art', {}),
      characters: new DataCharacterRegistry(amended), arenas: new DataArenaRegistry(amended), stages: new StageRegistry(amended),
    });

    expect(new StageSelectionController(context).snapshot().stages[0]!.threats).toContainEqual({
      enemyId: elite.id,
      name: elite.name,
      actorArtId: 'enemy:dust-mite',
    });
  });

  it('presents boss detail and the campaign-complete frontier without wrapping to the first Contract', () => {
    const { context, controller } = createHarness();
    for (const stage of context.stages.allStages()) context.completeStage(stage.id, 60_000);
    const snap = controller.snapshot();
    const warden = snap.stages.find((stage) => stage.id === 'stage:junkyard-06')!;
    expect(warden).toMatchObject({
      chapterName: 'Forge', locationName: 'Forge Foundry', boss: true,
      objective: { kind: 'defeat', copy: 'Defeat Forge Warden' },
      reward: { firstClearScrap: 180, headline: '180 Scrap + Mastered Fire Trait Core T3' }, completed: true, bestTimeMs: 60_000,
    });
    expect(snap.frontier).toMatchObject({ kind: 'campaign-complete', stageId: 'stage:junkyard-06' });
  });

  it('formats authored survive durations exactly instead of rounding them to whole minutes', () => {
    const data = loadGameData();
    const stages = (data.stages ?? []).map((stage, index) => index === 0
      ? { ...stage, objective: { type: 'survive' as const, seconds: 30 } }
      : index === 1
        ? { ...stage, objective: { type: 'survive' as const, seconds: 90 } }
        : stage);
    const amended = { ...data, stages };
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data: amended,
      metaUpgrades: new DataMetaUpgradeRegistry(amended),
      save: new SaveManager(new MemoryStorageAdapter(), 'survive-copy', {}),
      characters: new DataCharacterRegistry(amended), arenas: new DataArenaRegistry(amended),
      stages: new StageRegistry(amended),
    });

    const snapshot = new StageSelectionController(context).snapshot();
    expect(snapshot.stages[0]!.objective.copy).toBe('Survive 30 seconds');
    expect(snapshot.stages[1]!.objective.copy).toBe('Survive 1 minute 30 seconds');
  });

  it('derives collect copy and art identity from the authored item instead of assuming Scrap', () => {
    const data = loadGameData();
    const stages = (data.stages ?? []).map((stage, index) => index === 0
      ? { ...stage, objective: { type: 'collect' as const, itemId: 'item:coolant-cell', count: 3 } }
      : stage);
    const amended = { ...data, stages };
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data: amended,
      metaUpgrades: new DataMetaUpgradeRegistry(amended), save: new SaveManager(new MemoryStorageAdapter(), 'collect-copy', {}),
      characters: new DataCharacterRegistry(amended), arenas: new DataArenaRegistry(amended), stages: new StageRegistry(amended),
    });

    expect(new StageSelectionController(context).snapshot().stages[0]!.objective).toEqual({
      kind: 'collect', copy: 'Collect 3 Coolant Cell', artId: 'item:coolant-cell',
    });
  });

  it('keeps registry stage IDs in display order when authored data is reordered', () => {
    const data = loadGameData();
    const registry = new StageRegistry({ ...data, stages: [...(data.stages ?? [])].reverse() });
    expect(registry.allStageIds()).toEqual((data.stages ?? []).map((stage) => stage.id));
  });

  it('keeps a composite stage after its nested stage prerequisite', () => {
    const data = loadGameData();
    const composite = {
      ...data.stages![0],
      id: 'stage:composite-proof',
      chapterId: 'chapter:proof',
      displayOrder: 1,
      unlock: { type: 'all', conditions: [
        { type: 'stage-cleared', stageId: 'stage:junkyard-05' },
        { type: 'achievement-completed', achievementId: 'achievement:first-victory' },
      ] },
    };
    const registry = new StageRegistry({ ...data, stages: [composite, ...(data.stages ?? [])] });
    expect(registry.allStageIds().indexOf(composite.id)).toBeGreaterThan(registry.allStageIds().indexOf('stage:junkyard-05'));
  });

  it('describes the complete recursive lock condition instead of inventing a previous-Contract gate', () => {
    const data = loadGameData();
    const stages = (data.stages ?? []).map((stage, index) => index === 1 ? {
      ...stage,
      unlock: { type: 'all' as const, conditions: [
        { type: 'stage-cleared' as const, stageId: 'stage:junkyard-01' },
        { type: 'any' as const, conditions: [
          { type: 'boss-defeated' as const, bossId: 'boss-crusher' },
          { type: 'achievement-completed' as const, achievementId: 'achievement:first-victory' },
        ] },
      ] },
    } : stage);
    const amended = { ...data, stages };
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data: amended,
      metaUpgrades: new DataMetaUpgradeRegistry(amended), save: new SaveManager(new MemoryStorageAdapter(), 'condition-copy', {}),
      characters: new DataCharacterRegistry(amended), arenas: new DataArenaRegistry(amended), stages: new StageRegistry(amended),
    });

    expect(new StageSelectionController(context).snapshot().stages.find((stage) => stage.id === 'stage:junkyard-02')!.lockCopy).toBe(
      'Meet all requirements: Clear First Scavenge; Meet any requirement: Defeat Scrap Crusher; Complete First Victory.',
    );
  });

  it('keeps an N+1 grant kind visible in the first-clear reward headline', () => {
    const data = loadGameData();
    const targetId = data.stages![0]!.rewardProfileId;
    const rewardProfiles = data.rewardProfiles!.map((reward) => reward.id === targetId ? {
      ...reward,
      grants: [...(reward.grants ?? []), { type: 'grant-item' as const, itemId: 'item:future-signal', amount: 2 }],
    } : reward);
    const amended = { ...data, rewardProfiles };
    const context = createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data: amended,
      metaUpgrades: new DataMetaUpgradeRegistry(amended), save: new SaveManager(new MemoryStorageAdapter(), 'grant-copy', {}),
      characters: new DataCharacterRegistry(amended), arenas: new DataArenaRegistry(amended), stages: new StageRegistry(amended),
    });

    expect(new StageSelectionController(context).snapshot().stages[0]!.reward.headline).toContain('Future Signal ×2');
  });

  it('selects only unlocked stages; rejects locked ones', () => {
    const { controller } = createHarness();
    expect(controller.select('stage:junkyard-01').ok).toBe(true);
    expect(controller.select('stage:junkyard-02').ok).toBe(false);
    expect(controller.select('does-not-exist').ok).toBe(false);
  });

  it('rejects direct context selection of a locked stage', () => {
    const { context } = createHarness();
    expect(context.selectStage('stage:junkyard-02', context.stageSelectionRevision)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('navigates to the next/previous unlocked stage only', () => {
    const { controller } = createHarness();
    // Only stage 1 unlocked → next/prev have nowhere to go
    expect(controller.selectNext().ok).toBe(false);
    expect(controller.selectPrevious().ok).toBe(false);
    expect(controller.hasNextUnlockedStage()).toBe(false);
  });

  it('reflects completed stages and unlocks downstream stages', () => {
    const { context, controller } = createHarness();
    context.completeStage('stage:junkyard-01', 100_000);
    const snap = controller.snapshot();
    expect(snap.stages[0].completed).toBe(true);
    expect(snap.stages[1].locked).toBe(false);
    // Stage 2 now selectable
    expect(controller.select('stage:junkyard-02').ok).toBe(true);
    expect(controller.hasNextUnlockedStage()).toBe(false);
    controller.select('stage:junkyard-01');
    expect(controller.snapshot().frontier).toEqual({ kind: 'replay', stageId: 'stage:junkyard-01' });
  });

  it('keeps a frozen snapshot and bumps the revision on selection', () => {
    const { controller } = createHarness();
    const before = controller.snapshot();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.stages)).toBe(true);
    const after = controller.select('stage:junkyard-01');
    expect(after.snapshot.revision).toBeGreaterThan(before.revision);
    expect(after.snapshot.stages[0].selected).toBe(true);
  });

  it('persists stage completion through the Save V3 stages domain', () => {
    const { context } = createHarness();
    expect(context.saveData.stages).toEqual({});
    const saved = context.completeStage('stage:junkyard-01', 90_000);
    expect(saved).toBe(true);
    expect(context.saveData.stages['stage:junkyard-01']).toMatchObject({
      completed: true,
      bestTimeMs: 90_000,
    });
    // Best time is retained when a slower completion arrives
    context.completeStage('stage:junkyard-01', 120_000);
    expect(context.saveData.stages['stage:junkyard-01'].bestTimeMs).toBe(90_000);
  });

  it('rejects malformed stage facts before they can become live-only state', () => {
    const { context } = createHarness();
    expect(context.completeStage('stage:missing', 1)).toBe(false);
    expect(context.completeStage('stage:junkyard-01', Number.NaN)).toBe(false);
    expect(context.saveData.stages).toEqual({});
  });

  it('createDefaultSaveV3 has an empty stages domain (no fabricated progress)', () => {
    expect(createDefaultSaveV3().stages).toEqual({});
  });
});
