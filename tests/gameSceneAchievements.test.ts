import { describe, expect, it, vi } from 'vitest';
import './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { createEventBus } from '../src/engine/eventBus';
import { loadGameData } from '../src/systems/validation';

describe('GameScene achievement fact bridge', () => {
  it('clears this-run terminal achievement presentation on every persistent scene create', () => {
    const scene = new GameScene() as any;
    scene.completedAchievementNames = ['First Blood'];
    scene.completedAchievements = [{ id: 'first-kill', name: 'First Blood', iconArtId: 'achievement-icon:first-kill' }];
    // The minimal context intentionally fails later run composition. The
    // lifecycle assertion is that create has already cleared state before any
    // fresh-run resource work, exactly as a Phaser Retry/Replay reuse does.
    scene.getContext = () => ({});

    expect(() => scene.create()).toThrow();
    expect(scene.completedAchievementNames).toEqual([]);
    expect(scene.completedAchievements).toEqual([]);
  });

  it('retains run-local metric facts for the terminal candidate', () => {
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

    scene.evaluateLiveAchievements(ctx, { 'metric:scrap-banked': 5000 });
    scene.evaluateLiveAchievements(ctx, { 'metric:scrap-banked': 5000 });
    expect(scene.pendingAchievementFacts['metric:scrap-banked']).toBe(10_000);
    expect(ctx.commitAchievementTransaction).not.toHaveBeenCalled();
  });

  it('does not persist gameplay facts before terminal settlement', () => {
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

    scene.retryPendingAchievementFacts(ctx);
    expect(scene.pendingAchievementFacts['metric:enemies-defeated']).toBe(1);
    expect(ctx.commitAchievementTransaction).not.toHaveBeenCalled();
  });

  it('leaves boss achievement evaluation to the terminal candidate', () => {
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
    expect(ctx.saveData.achievements['achievement:boss-crusher']).toBeUndefined();
    expect(ctx.commitAchievementTransaction).not.toHaveBeenCalled();
  });

  it('routes won-run mastery through the terminal settlement owner', () => {
    const scene = new GameScene() as any;
    scene.runState = { status: 'won', timeMs: 1_000, currency: 12, characterId: 'scrap-tabby' };
    scene.isTraining = true;
    const data = loadGameData();
    const ctx: any = {
      data,
      bus: createEventBus(),
      settleRunTerminal: vi.fn(() => ({ ok: true, terminalApplied: true, runScrapBanked: 12, firstClear: false, bestTimeImproved: false, firstClearScrap: 0, persistentGrantIds: [], achievementIdsCompleted: [], scrapAwardedFromAchievements: 0, masteryTierAwarded: 1 })),
    };
    scene.trySettleTerminal(ctx, 'win');
    expect(ctx.settleRunTerminal).toHaveBeenCalledWith(expect.objectContaining({ terminalStatus: 'win', characterId: 'scrap-tabby', isTraining: true }));
    expect(scene.hasPendingTerminalPersistence()).toBe(false);
  });

  it('carries the captured launch presentation baseline to terminal settlement', () => {
    const scene = new GameScene() as any;
    scene.runState = { status: 'lost', timeMs: 1_000, currency: 12, characterId: 'scrap-tabby' };
    scene.isTraining = false;
    scene.runStartPresentation = Object.freeze({
      availability: Object.freeze({
        selectableCharacterIds: Object.freeze(['scrap-tabby']),
        fabricableEquipmentSetIds: Object.freeze([]),
        fabricablePartIds: Object.freeze([]),
        maxEquipmentTier: 1,
      }),
      completedAchievementIds: Object.freeze([]),
    });
    const ctx: any = {
      data: loadGameData(), bus: createEventBus(),
      settleRunTerminal: vi.fn(() => ({ ok: true, terminalApplied: true, runScrapBanked: 12 })),
    };

    scene.trySettleTerminal(ctx, 'loss');

    expect(ctx.settleRunTerminal).toHaveBeenCalledWith(expect.objectContaining({
      presentationBaseline: scene.runStartPresentation,
    }));
  });
});
