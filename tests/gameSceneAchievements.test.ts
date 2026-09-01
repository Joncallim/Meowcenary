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

  it('retries accepted gameplay facts after a transient achievement-save failure', () => {
    const scene = new GameScene() as any;
    scene.runState = { timeMs: 1_000 };
    const data = loadGameData();
    let attempts = 0;
    const ctx: any = {
      data,
      bus: createEventBus(),
      saveData: {
        progression: { scrap: 0, unlocks: [], permanentUpgrades: {} }, stages: {}, achievements: {},
        achievementMetrics: {}, characters: {}, bosses: {},
      },
      commitAchievementTransaction: vi.fn((achievements, metrics) => {
        attempts += 1;
        if (attempts === 1) return false;
        ctx.saveData = { ...ctx.saveData, achievements, achievementMetrics: metrics };
        return true;
      }),
      reportAchievement: vi.fn(),
    };

    scene.evaluateLiveAchievements(ctx, { 'metric:enemies-defeated': 1 });
    expect(ctx.saveData.achievementMetrics).toEqual({});

    // No second kill occurs: the already-authoritative fact itself is retried.
    scene.retryPendingAchievementFacts(ctx);
    expect(ctx.saveData.achievementMetrics['metric:enemies-defeated']).toBe(1);
    expect(ctx.commitAchievementTransaction).toHaveBeenCalledTimes(2);
  });

  it('evaluates durable boss facts even when no metric increment accompanies the stage clear', () => {
    const scene = new GameScene() as any;
    scene.runState = { timeMs: 1_000 };
    const data = loadGameData();
    const ctx: any = {
      data,
      bus: createEventBus(),
      saveData: {
        progression: { scrap: 0, unlocks: [], permanentUpgrades: {} }, stages: {}, characters: {},
        bosses: { 'boss-crusher': { defeated: true } }, achievements: {}, achievementMetrics: {},
      },
      commitAchievementTransaction: vi.fn((achievements, metrics) => {
        ctx.saveData = { ...ctx.saveData, achievements, achievementMetrics: metrics };
        return true;
      }),
      reportAchievement: vi.fn(),
    };

    scene.evaluateLiveAchievements(ctx, {});
    expect(ctx.saveData.achievements['achievement:boss-crusher']).toMatchObject({ completed: true });
    expect(ctx.commitAchievementTransaction).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ id: 'achievement:boss-crusher:completion' }),
    );
  });
});
