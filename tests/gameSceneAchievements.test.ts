import { describe, expect, it, vi } from 'vitest';
import { MockInputPlugin } from './__mocks__/phaser';
import { EventEmitter } from 'node:events';
import { resolveRunStartIntroModel } from '../src/presentation/runStartIntro';
import { RunStartIntroController } from '../src/ui/runStartIntroController';
import { GameScene } from '../src/scenes/GameScene';
import { createEventBus } from '../src/engine/eventBus';
import { loadGameData } from '../src/systems/validation';
import { createGameContext } from '../src/engine/context';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';

function attachLifecycle(scene: any): void {
  scene.events = new MockInputPlugin();
  scene.game = { events: new EventEmitter(), renderer: new EventEmitter() };
  scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };
  scene.scene = { start: vi.fn() };
}

/** Settlement fixtures omit rendering/combat composition but cross actual
 * create/reset and the real intro controller/Start boundary before terminal
 * facts. Failed-create coverage belongs to gameSceneIntro.test.ts. */
function installHeadlessPreparation(scene: any, context: any): void {
  attachLifecycle(scene);
  let seed = 0;
  scene.getContext = () => context;
  scene.createPreparedRun = () => {
    const request = { kind: 'legacy-arena' as const, characterId: 'scrap-tabby', arenaId: 'junkyard-lot', seed: ++seed };
    scene.launchRequest = request;
    scene.runState = createRunState(request);
    scene.introModel = resolveRunStartIntroModel({ data: context.data, request });
    scene.introController = new RunStartIntroController(scene.introModel);
    scene.inputController = { isQuarantined: () => false, quarantineUntilNeutral: vi.fn(), destroy: vi.fn() };
  };
}

describe('GameScene achievement fact bridge', () => {
  it.each(['normal-win', 'training', 'loss-retry', 'discarded-save'] as const)(
    'settles the second run on the same Scene and production save owner after %s', (prior) => {
      const data = loadGameData();
      const save = new SaveManager(new MemoryStorageAdapter(), `scene-reuse-${prior}`);
      const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data, save,
        arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data) });
      const settle = vi.spyOn(context, 'settleRunTerminal');
      const scene = new GameScene() as any;
      installHeadlessPreparation(scene, context);
      scene.create({ isTraining: prior === 'training' });
      expect(scene.runState.status).toBe('intro');
      scene.handleIntroCommand('start', 0);
      expect(scene.runState.status).toBe('active');
      scene.runState.status = prior === 'normal-win' ? 'won' : 'lost';
      scene.runState.currency = 10;
      scene.runState.timeMs = 1000;
      if (prior === 'normal-win') scene.terminalStageId = 'stage:junkyard-01';
      if (prior === 'discarded-save') {
        vi.spyOn(save, 'save').mockReturnValueOnce(false);
        scene.pendingAchievementFacts = { 'metric:enemies-defeated': 99 };
      }
      scene.trySettleTerminal(context, prior === 'normal-win' ? 'win' : 'loss');
      const priorSettlement = scene.terminalSettlement;
      if (prior === 'discarded-save') scene.discardPendingTerminalPersistence();
      else expect(priorSettlement.terminalApplied).toBe(true);
      const beforeSecond = context.saveData.progression.scrap;
      settle.mockClear();

      scene.create();
      expect(scene.runState.status).toBe('intro');
      scene.handleIntroCommand('start', 0);
      expect(scene.runState.status).toBe('active');
      expect(scene.terminalStageId).toBeUndefined();
      expect(scene.pendingAchievementFacts).toEqual({});
      scene.runState.status = 'lost';
      scene.runState.currency = 30;
      scene.runState.timeMs = 2000;
      scene.trySettleTerminal(context, 'loss');
      scene.trySettleTerminal(context, 'loss');

      expect(settle).toHaveBeenCalledOnce();
      expect(settle).toHaveBeenCalledWith(expect.objectContaining({ runScrap: 30, runDurationMs: 2000,
        isTraining: false, metricIncrements: {} }));
      expect(scene.terminalSettlement).not.toBe(priorSettlement);
      expect(scene.terminalSettlement.terminalApplied).toBe(true);
      expect(context.saveData.progression.scrap - beforeSecond).toBe(scene.terminalSettlement.runScrapBanked);
      expect(context.saveData.achievementMetrics['metric:enemies-defeated']).not.toBe(99);
    },
  );
  it('clears this-run terminal achievement presentation on every persistent scene create', () => {
    const scene = new GameScene() as any;
    scene.completedAchievementNames = ['First Blood'];
    scene.completedAchievements = [{ id: 'first-kill', name: 'First Blood', iconArtId: 'achievement-icon:first-kill' }];
    // The minimal context intentionally fails later run composition. The
    // lifecycle assertion is that create has already cleared state before any
    // fresh-run resource work, exactly as a Phaser Retry/Replay reuse does.
    attachLifecycle(scene);
    scene.getContext = () => ({});

    expect(() => scene.create()).not.toThrow();
    expect(scene.recovering).toBe(true);
    expect(scene.completedAchievementNames).toEqual([]);
    expect(scene.completedAchievements).toEqual([]);
  });

  it('clears terminal persistence state before reusing the scene for another run', () => {
    const scene = new GameScene() as any;
    scene.terminalSettlement = { terminalApplied: true, runScrapBanked: 99 };
    scene.terminalStageId = 'stage:junkyard-01';
    scene.pendingAchievementFacts = { 'metric:enemies-defeated': 7 };
    scene.achievementToast = { text: 'Old run', untilMs: 99_999 };
    scene._wasPendingClear = true;
    attachLifecycle(scene);
    scene.getContext = () => ({});

    expect(() => scene.create()).not.toThrow();
    expect(scene.recovering).toBe(true);

    expect(scene.terminalSettlement).toBeUndefined();
    expect(scene.terminalStageId).toBeUndefined();
    expect(scene.pendingAchievementFacts).toEqual({});
    expect(scene.achievementToast).toBeUndefined();
    expect(scene._wasPendingClear).toBe(false);

    scene.runState = { status: 'lost', timeMs: 500, currency: 3, characterId: 'scrap-tabby' };
    const settleRunTerminal = vi.fn(() => ({
      ok: true, terminalApplied: true, runScrapBanked: 3,
      persistentGrantIds: [], achievementIdsCompleted: [],
    }));
    scene.trySettleTerminal({ data: loadGameData(), bus: createEventBus(), settleRunTerminal }, 'loss');
    expect(settleRunTerminal).not.toHaveBeenCalled(); // A failed create cannot settle fabricated terminal facts.
  });

  it('discards pending achievement facts when the player leaves without saving', () => {
    const scene = new GameScene() as any;
    scene.terminalSettlement = { terminalApplied: false };
    scene.pendingAchievementFacts = { 'metric:enemies-defeated': 4 };

    scene.discardPendingTerminalPersistence();

    expect(scene.terminalSettlement).toBeUndefined();
    expect(scene.pendingAchievementFacts).toEqual({});
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
    scene.runState = Object.assign(createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' }), { timeMs: 1_000, currency: 12 });
    scene.isTraining = true;
    const data = loadGameData();
    const ctx: any = {
      data,
      bus: createEventBus(),
      settleRunTerminal: vi.fn(() => ({ ok: true, terminalApplied: true, runScrapBanked: 12, firstClear: false, bestTimeImproved: false, firstClearScrap: 0, persistentGrantIds: [], achievementIdsCompleted: [], scrapAwardedFromAchievements: 0, masteryTierAwarded: 1 })),
    };
    scene.getContext = () => ctx;
    scene.inputController = { isQuarantined: () => false, quarantineUntilNeutral: vi.fn() };
    scene.introController = new RunStartIntroController(resolveRunStartIntroModel({
      data: ctx.data, request: { kind: 'legacy-arena', characterId: 'scrap-tabby', arenaId: 'junkyard-lot', seed: 1 },
    }));
    scene.handleIntroCommand('start', 0);
    expect(scene.runState.status).toBe('active');
    scene.runState.status = 'won'; // Terminal fixture follows actual Start admission.
    scene.trySettleTerminal(ctx, 'win');
    expect(ctx.settleRunTerminal).toHaveBeenCalledWith(expect.objectContaining({ terminalStatus: 'win', characterId: 'scrap-tabby', isTraining: true }));
    expect(scene.hasPendingTerminalPersistence()).toBe(false);
  });

  it('carries the captured launch presentation baseline to terminal settlement', () => {
    const scene = new GameScene() as any;
    scene.runState = Object.assign(createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' }), { timeMs: 1_000, currency: 12 });
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
      settleRunTerminal: vi.fn(() => ({
        ok: true, terminalApplied: true, runScrapBanked: 12,
        persistentGrantIds: [], achievementIdsCompleted: [],
      })),
    };

    scene.getContext = () => ctx;
    scene.inputController = { isQuarantined: () => false, quarantineUntilNeutral: vi.fn() };
    scene.introController = new RunStartIntroController(resolveRunStartIntroModel({
      data: ctx.data, request: { kind: 'legacy-arena', characterId: 'scrap-tabby', arenaId: 'junkyard-lot', seed: 1 },
    }));
    scene.handleIntroCommand('start', 0);
    expect(scene.runState.status).toBe('active');
    scene.runState.status = 'lost'; // Terminal fixture follows actual Start admission.
    scene.trySettleTerminal(ctx, 'loss');

    expect(ctx.settleRunTerminal).toHaveBeenCalledWith(expect.objectContaining({
      presentationBaseline: scene.runStartPresentation,
    }));
  });
});
