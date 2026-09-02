import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createGameContext } from '../src/engine/context';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataAchievementRegistry } from '../src/systems/achievements';
import { SaveManager, MemoryStorageAdapter } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { StageRegistry } from '../src/systems/stageRegistry';
import { ProgressionOverviewController } from '../src/ui/progressionOverviewController';
import achievementsJson from '../src/data/achievements.json';
import rewardProfilesJson from '../src/data/reward-profiles.json';
import stagesJson from '../src/data/stages.json';

function createHarness() {
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
  const achievements = new DataAchievementRegistry({ achievements: achievementsJson });
  const controller = new ProgressionOverviewController(context, achievements);
  return { context, controller, achievements };
}

describe('Epic 26 progression overview read model', () => {
  it('fresh save: shows the first locked stage as the top next goal', () => {
    const { controller } = createHarness();
    const snap = controller.snapshot();
    expect(snap.completedStages).toBe(0);
    expect(snap.totalStages).toBe(10);
    expect(snap.completedAchievements).toBe(0);
    expect(snap.totalAchievements).toBeGreaterThanOrEqual(8);
    expect(snap.unlockedCharacters).toBe(1);
    expect(snap.totalCharacters).toBe(8);

    expect(snap.nextGoals.length).toBeGreaterThan(0);
    expect(snap.nextGoals[0]).toMatchObject({ kind: 'stage', id: 'stage:junkyard-01' });
    // Goals are sorted by priority.
    const priorities = snap.nextGoals.map((g) => g.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });

  it('clearing stages advances the ladder and reveals the boss goal', () => {
    const { context, controller } = createHarness();
    context.completeStage('stage:junkyard-01', 100_000);
    const snap = controller.snapshot();
    expect(snap.completedStages).toBe(1);
    const top = snap.nextGoals[0];
    expect(top.kind).toBe('stage');
    expect(top.id).toBe('stage:junkyard-02');
  });

  it('clearing the whole chapter surfaces the boss milestone and next goals', () => {
    const { context, controller } = createHarness();
    for (let i = 1; i <= 4; i++) {
      context.completeStage(`stage:junkyard-0${i}`, 60_000);
    }
    const snap = controller.snapshot();
    expect(snap.completedStages).toBe(4);
    const bossGoal = snap.nextGoals.find((g) => g.kind === 'boss');
    expect(bossGoal).toBeDefined();
    expect(bossGoal?.id).toBe('stage:junkyard-05');
  });

  it('snapshot is deeply frozen and revision bumps on invalidation', () => {
    const { controller } = createHarness();
    const before = controller.snapshot();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.nextGoals)).toBe(true);
    controller.invalidate();
    expect(controller.snapshot().revision).toBeGreaterThan(before.revision);
  });

  it('unlocking characters via the shared grant vocabulary reflects in overview', () => {
    const { context, controller } = createHarness();
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory', 'achievement:kill-milestone-25'],
    }));
    const snap = controller.snapshot();
    expect(snap.unlockedCharacters).toBe(3); // tabby + bolt-hound + volt-lynx
  });
});

describe('Epic 26 reward cadence conformance', () => {
  const rewards = rewardProfilesJson as unknown as { id: string; scrapBase: number; scrapPerMinute: number }[];
  const stages = stagesJson as unknown as { id: string; chapterId: string; displayOrder: number; rewardProfileId: string }[];

  it('stage rewards scale monotonically within each chapter', () => {
    const byProfile = new Map(rewards.map((r) => [r.id, r]));
    const chapters = new Map<string, typeof stages>();
    for (const stage of stages) {
      chapters.set(stage.chapterId, [...(chapters.get(stage.chapterId) ?? []), stage]);
    }
    for (const chapter of chapters.values()) {
      const ordered = [...chapter]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((stage) => byProfile.get(stage.rewardProfileId)!.scrapBase);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
      }
    }
  });

  it('the boss milestone reward substantially exceeds ordinary stage farming (decision #9)', () => {
    const boss = rewards.find((r) => r.id === 'reward:stage-05-boss')!;
    const firstStage = rewards.find((r) => r.id === 'reward:stage-01')!;
    expect(boss.scrapBase).toBeGreaterThan(firstStage.scrapBase * 4);
    expect(boss.scrapPerMinute).toBeGreaterThan(firstStage.scrapPerMinute * 2);
  });

  it('every stage reward profile resolves and no reward is empty', () => {
    const byProfile = new Map(rewards.map((r) => [r.id, r]));
    for (const stage of stages) {
      const profile = byProfile.get(stage.rewardProfileId);
      expect(profile, stage.rewardProfileId).toBeDefined();
      expect(profile!.scrapBase).toBeGreaterThan(0);
    }
  });
});
