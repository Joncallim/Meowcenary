import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createGameContext, type GameContext } from '../src/engine/context';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataAchievementRegistry } from '../src/systems/achievements';
import { SaveManager, MemoryStorageAdapter, type StorageAdapter } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { StageRegistry } from '../src/systems/stageRegistry';
import { AchievementsController } from '../src/ui/achievementsController';
import achievementsJson from '../src/data/achievements.json';

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
  const controller = new AchievementsController(context, achievements);
  return { context, controller, achievements };
}

describe('AchievementsController (Epic 22 read model)', () => {
  it('lists every shipped achievement with locked/in-progress/completed state', () => {
    const { controller } = createHarness();
    const snap = controller.snapshot();
    expect(snap.totalCount).toBe(achievementsJson.length);
    expect(snap.completedCount).toBe(0);
    // Fresh save: nothing completed; non-hidden locked.
    for (const view of snap.achievements) {
      expect(view.status).toBe('locked');
    }
    expect(snap.achievements.find((view) => view.id === 'achievement:first-kill')?.rewardSummary)
      .toBe('+25 scrap');
  });

  it('hidden achievements are masked until completed', () => {
    const { controller } = createHarness();
    const snap = controller.snapshot();
    const hidden = snap.achievements.find((a) => a.id === 'achievement:scrap-banked-1000');
    expect(hidden?.hidden).toBe(true);
    expect(hidden?.name).toBe('???');
    expect(hidden?.status).toBe('locked');
  });

  it('hidden achievements reveal on completion', () => {
    const { context, controller } = createHarness();
    // Bank 1000 scrap in the progression state, then re-snapshot.
    // The controller reads saveData.achievements; simulate a completed entry.
    const withCompletion = Object.freeze({
      ...context.saveData,
      achievements: Object.freeze({
        ...context.saveData.achievements,
        'achievement:scrap-banked-1000': Object.freeze({ completed: true, progress: 1000, completedAt: 42 }),
      }),
    });
    // Rebuild a controller whose context exposes the completed state.
    const controller2 = createHarnessWithSave(withCompletion);
    const snap = controller2.snapshot();
    const hidden = snap.achievements.find((a) => a.id === 'achievement:scrap-banked-1000');
    expect(hidden?.status).toBe('completed');
    expect(hidden?.name).toBe('Scrap Tycoon');
    expect(snap.completedCount).toBeGreaterThan(0);
    void controller;
  });

  it('snapshot is deeply frozen and revision bumps on invalidation', () => {
    const { controller } = createHarness();
    const before = controller.snapshot();
    expect(Object.isFrozen(before)).toBe(true);
    expect(Object.isFrozen(before.achievements)).toBe(true);
    controller.invalidate();
    const after = controller.snapshot();
    expect(after.revision).toBeGreaterThan(before.revision);
  });
});

function createHarnessWithSave(saveData: unknown) {
  const data = loadGameData();
  const serialized = JSON.stringify(saveData);
  const storage: StorageAdapter = {
    getItem: () => serialized,
    setItem: () => true,
    removeItem: () => true,
  };
  const save = new SaveManager(storage, 'test', {});
  const context = createGameContext({
    bus: createEventBus(),
    menuRng: createRng(1),
    data,
    metaUpgrades: new DataMetaUpgradeRegistry(data),
    save,
    characters: new DataCharacterRegistry(data),
    arenas: new DataArenaRegistry(data),
    stages: new StageRegistry(data),
  }) as GameContext;
  const achievements = new DataAchievementRegistry({ achievements: achievementsJson });
  return new AchievementsController(context, achievements);
}
