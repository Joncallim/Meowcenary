import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { createEventBus } from '../src/engine/eventBus';
import { loadGameData } from '../src/systems/validation';

describe('GameScene achievement fact bridge', () => {
  it('accumulates banked run rewards across later wallet spending', () => {
    const scene = new GameScene() as any;
    scene.runState = { timeMs: 1_000 };
    const data = loadGameData();
    const ctx: any = {
      data,
      bus: createEventBus(),
      saveData: {
        progression: { scrap: 0, unlocks: [], permanentUpgrades: {} }, stages: {}, achievements: {},
        achievementMetrics: {}, characters: {}, bosses: {},
      },
      commitAchievementTransaction: vi.fn((achievements, metrics) => {
        ctx.saveData = { ...ctx.saveData, achievements, achievementMetrics: metrics };
        return true;
      }),
      reportAchievement: vi.fn(),
    };

    scene.evaluateLiveAchievements(ctx, { 'metric:scrap-banked': 600 });
    // The wallet can be spent entirely between runs; that must not erase the
    // lifetime fact used by the achievement definition.
    ctx.saveData = { ...ctx.saveData, progression: { ...ctx.saveData.progression, scrap: 0 } };
    scene.evaluateLiveAchievements(ctx, { 'metric:scrap-banked': 600 });

    expect(ctx.saveData.achievementMetrics['metric:scrap-banked']).toBe(1_200);
    expect(ctx.saveData.achievements['achievement:scrap-banked-1000']).toMatchObject({ completed: true });
  });
});
