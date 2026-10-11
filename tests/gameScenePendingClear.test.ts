/**
 * #164 RED→GREEN integration tests for GameScene pending-clear update ordering.
 *
 * These tests verify the actual GameScene.update() orchestration, not just
 * StageRuntime.describeObjective(). They prove:
 * - HudController updates during pendingClear (was skipped in this.systems)
 * - tickRun does NOT advance during pendingClear (clock freeze)
 * - Normal active gameplay updates everything
 * - Completion transition frame captures time once
 * - Pause round trip preserves extraction state
 * - Stale HUD (19/20 after 20/20) is impossible
 */

import { describe, expect, it, vi } from 'vitest';
import { MockArc, MockBody, MockGameObject } from './__mocks__/phaser';
import { GameScene } from '../src/scenes/GameScene';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import { createStageRuntime } from '../src/gameplay/stage/stageRuntime';
import { applyXp } from '../src/gameplay/xp';
import { UpgradeSystem } from '../src/systems/UpgradeSystem';
import { UpgradeChooserController } from '../src/ui/upgradeChooserController';
import { resolveRunStartIntroModel } from '../src/presentation/runStartIntro';
import { RunStartIntroController } from '../src/ui/runStartIntroController';
import { loadGameData } from '../src/systems/validation';

import { HudController } from '../src/ui/hud';
import { ControlsView } from '../src/ui/controls';

/** Create a minimal GameScene-like harness that exercises the real update
 *  orchestration without requiring Phaser boot. */
interface SceneHarness {
  scene: any; // GameScene cast to any for property injection
  hudController: HudController;
  controlsView: ControlsView;
  hudUpdateSpy: ReturnType<typeof vi.spyOn>;

  playerUpdateSpy: ReturnType<typeof vi.spyOn>;
  systemsUpdateSpy: ReturnType<typeof vi.spyOn>;
  pendingClearLootSpy: ReturnType<typeof vi.fn>;
}

function createHarness(options: {
  pendingClear?: boolean;
  timeMs?: number;
} = {}): SceneHarness {
  const scene = new GameScene() as any;

  // Minimal run state
  const runState = createRunState({ seed: 1, characterId: 'scrap-tabby', arenaId: 'junkyard-lot' });
  runState.status = 'active';
  if (options.timeMs !== undefined) runState.timeMs = options.timeMs;
  scene.runState = runState;

  // Mock physics
  scene.physics = { world: { pause: vi.fn(), resume: vi.fn() } };

  // Mock input controller
  scene.inputController = {
    update: vi.fn(),
    quarantineUntilNeutral: vi.fn(),
    getMoveVector: () => ({ x: 0, y: 0 }),
    getPointer: () => null,
  };

  // Mock player
  scene.player = { update: vi.fn(), x: 0, y: 0, health: 100, maxHealth: 100 };

  // Mock systems list (empty - we track calls via spies)
  scene.systems = [];
  const systemUpdateSpy = vi.fn();
  scene.systems.push({ update: systemUpdateSpy });
  const pendingClearLootSpy = vi.fn();
  scene.dropSystem = { settlePendingClearLoot: pendingClearLootSpy };

  // Mock HUD controller
  const hudSource = { snapshot: () => ({ timeMs: runState.timeMs, level: runState.level, xp: runState.xp, xpToNext: runState.xpToNext, health: 100, maxHealth: 100, status: runState.status, objective: '', currency: 0, kills: 0, stageLabel: '', ability: '', achievement: '' }) };
  const hudView = { render: vi.fn(), destroy: vi.fn() };
  const hudController = new HudController({ on: vi.fn() } as any, hudSource, hudView);
  const hudUpdateSpy = vi.spyOn(hudController, 'update');
  scene.hudController = hudController;

  // Mock controls view
  const controlsView = { update: vi.fn(), destroy: vi.fn(), setExtractionState: vi.fn() } as any;
  vi.spyOn(controlsView, 'update');
  scene.controlsView = controlsView;

  // Mock audio
  scene.audioManager = { update: vi.fn() };

  // Mock debug overlay
  scene.debugOverlay = { update: vi.fn() };

  // Mock pause view, run summary, upgrade chooser
  scene.pauseView = { refreshInputPresentation: vi.fn() };
  scene.runSummaryView = { refreshInputPresentation: vi.fn(), refresh: vi.fn() };
  scene.upgradeChooser = { refreshInputPresentation: vi.fn() };

  // Mock perf sampler
  scene.perfSampler = { recordFrame: vi.fn(), snapshot: () => null };

  // Mock various required methods
  scene.getContext = () => ({ bus: { on: vi.fn(), emit: vi.fn() } });
  scene.hasPendingTerminalPersistence = () => false;
  scene.retryPendingCharacterMastery = vi.fn();
  scene.retryPendingAchievementFacts = vi.fn();

  // Setup stage runtime based on options
  if (options.pendingClear) {
    const runtime = createStageRuntime({
      stageId: 'stage:junkyard-01',
      objective: { definition: { type: 'kill', enemyTag: 'grunt', count: 20 } },
      encounter: {},
      reward: { firstClearScrap: 50, grants: [] },
    } as any);
    runtime.tick(0, 0);
    // Complete the objective
    for (let i = 0; i < 20; i++) {
      runtime.recordEnemyDefeat(`enemy-${i}`, 'grunt');
    }
    runtime.tick(0, options.timeMs ?? 30_000);
    scene.stageRuntime = runtime;
  } else {
    // No pendingClear - runtime exists but hasn't completed
    const runtime = createStageRuntime({
      stageId: 'stage:junkyard-01',
      objective: { definition: { type: 'kill', enemyTag: 'grunt', count: 20 } },
      encounter: {},
      reward: { firstClearScrap: 50, grants: [] },
    } as any);
    runtime.tick(0, 0);
    // Partial progress
    for (let i = 0; i < 5; i++) {
      runtime.recordEnemyDefeat(`enemy-${i}`, 'grunt');
    }
    scene.stageRuntime = runtime;
  // stagePlan is required by updateStageObjective to call runtime.tick
  // rather than maybeEndRunForVictory.
  scene.stagePlan = {};
  }

  return {
    scene,
    hudController,
    controlsView,
    hudUpdateSpy,

    playerUpdateSpy: vi.spyOn(scene.player, 'update'),
    systemsUpdateSpy: systemUpdateSpy,
    pendingClearLootSpy,
  };
}

describe('#164 GameScene pending-clear update ordering', () => {
  it('keeps physics paused from final chooser confirmation through capture of a pulse-completed objective', async () => {
    const { DropSystem } = await import('../src/systems/DropSystem');
    const { scene, systemsUpdateSpy, playerUpdateSpy } = createHarness({ timeMs: 30_000 });
    const run = scene.runState;
    const bus = createEventBus();
    scene.getContext = () => ({ bus });
    // Admit the fixture through the real intro command before publishing
    // gameplay facts. The elapsed clock below remains the test's 30s fixture.
    run.status = 'intro';
    scene.inputController.isQuarantined = () => false;
    scene.introController = new RunStartIntroController(resolveRunStartIntroModel({
      data: loadGameData(), request: { kind: 'legacy-arena', characterId: run.characterId, arenaId: run.arenaId, seed: run.seed },
    }));
    scene.handleIntroCommand('start', 0);
    expect(run.status).toBe('active');
    const runtime = createStageRuntime({
      stageId: 'stage:pulse-clear-proof',
      objective: { definition: { type: 'collect', itemId: 'drop:scrap', count: 1 } },
      encounter: {}, reward: { firstClearScrap: 0, grants: [] },
    } as any);
    runtime.tick(0, run.timeMs);
    scene.stageRuntime = runtime;
    scene.installAuthoritativeFactListeners({ bus });
    // Use the same synchronous physics resolver as the production run event
    // listeners. Chooser commands do not wait for GameScene.update().
    const paused = bus.on('run:paused', () => scene.syncPhysicsPause(run));
    const resumed = bus.on('run:resumed', () => scene.syncPhysicsPause(run));
    const upgrades = new UpgradeSystem({
      runState: run, bus, rng: createRng(1),
      definitions: [{
        id: 'pulse-clear-speed', name: 'Pulse Clear Speed', rarity: 'common', target: 'player',
        description: 'One chooser option.', maxStacks: 10,
        effects: [{ stat: 'moveSpeed', op: 'add', value: 1 }],
        presentation: { category: 'mobility', iconArtId: 'upgrade-icon:pulse-clear-speed' },
      }],
    });
    let select!: (offerId: number, choiceIndex: number) => boolean;
    const chooser = new UpgradeChooserController(bus, upgrades, {
      render: (_offer, command) => { select = command; },
      setEnabled: vi.fn(), clear: vi.fn(), destroy: vi.fn(),
      focusPrevious: () => false, focusNext: () => false, confirmFocused: () => false,
    });
    scene.player.sprite = new MockArc(0, 0);
    scene.add = { circle: () => new MockArc(0, 0) };
    scene.physics.add = {
      existing: (sprite: MockGameObject) => { sprite.body = new MockBody(sprite); },
      overlap: () => ({ destroy: () => undefined }),
    };
    const drops = new DropSystem({
      scene, ctx: { bus } as any, runState: run, player: scene.player,
      dropGroup: { add: () => undefined } as any,
      lootTables: { lootTableById: (id) => id === 'clear-xp'
        ? { id, entries: [{ kind: 'xp', amount: 7, weight: 1 }] } : undefined },
      weaponRegistry: { weaponById: () => undefined, createWeaponInstance: () => { throw new Error('unused'); } },
      rng: createRng(1), dropRadius: 4, magnetSpeed: 450, basePickupRadius: 10,
    });
    scene.dropSystem = drops;
    const settle = vi.spyOn(drops, 'settlePendingClearLoot');
    scene.pauseController = { snapshot: () => ({ panel: 'closed' }) };
    try {
      drops.spawnDrop(1, 0, { kind: 'xp', amount: run.xpToNext });
      drops.spawnDrop(2, 0, { kind: 'scrap', amount: 1 });
      // A nearby chest survives the consumable-only pulse. It must be settled
      // with level events suppressed after extraction captures the boundary.
      const chest = drops.spawnDrop(0, 0, { kind: 'chest', amount: 0, tableId: 'clear-xp' });
      expect(drops.collectNearbyConsumables(10)).toBe(2);
      expect(run.status).toBe('paused');
      expect(run.pauseReason).toBe('levelUp');
      expect(runtime.state.status).toBe('objective-complete');
      expect(runtime.pendingClear).toBeUndefined();
      expect(scene.physicsPausedByRun).toBe(true);
      scene.update(0, 16);
      expect(runtime.pendingClear).toBeUndefined();
      expect(settle).not.toHaveBeenCalled();
      systemsUpdateSpy.mockClear(); playerUpdateSpy.mockClear();

      // Invoke the rendered card's real controller command outside the scene
      // update, as touch/pointer and number-key chooser submissions do.
      expect(select(chooser.currentOfferId!, 0)).toBe(true);
      expect(upgrades.pendingCount).toBe(0);
      expect(run.status).toBe('active');
      expect(runtime.pendingClear).toBeUndefined();
      expect(scene.physics.world.resume).not.toHaveBeenCalled();
      expect(scene.physicsPausedByRun).toBe(true);

      scene.update(0, 16);
      expect(runtime.pendingClear?.timeMs).toBe(30_000);
      expect(settle).toHaveBeenCalledOnce();
      expect(chest.active).toBe(false);
      expect(run.level).toBe(3);
      expect(upgrades.pendingCount).toBe(0);
      expect(run.status).toBe('active');
      expect(run.timeMs).toBe(30_000);
      expect(systemsUpdateSpy).not.toHaveBeenCalled();
      expect(playerUpdateSpy).not.toHaveBeenCalled();
      expect(scene.physics.world.resume).not.toHaveBeenCalled();
      expect(scene.controlsView.setExtractionState).toHaveBeenCalledWith(true);
      scene.routeAction('confirm');
      expect(runtime.state.status).toBe('won');
      expect(run.status).toBe('won');
      expect(scene.terminalStageId).toBe('stage:pulse-clear-proof');
    } finally {
      paused(); resumed(); chooser.destroy(); upgrades.destroy(); drops.destroy();
      for (const unsubscribe of scene.unsubscribers) unsubscribe();
    }
  });

  it('resumes physics on final chooser confirmation while the objective remains incomplete', () => {
    const { scene } = createHarness();
    const run = scene.runState;
    const bus = createEventBus();
    const paused = bus.on('run:paused', () => scene.syncPhysicsPause(run));
    const resumed = bus.on('run:resumed', () => scene.syncPhysicsPause(run));
    const upgrades = new UpgradeSystem({
      runState: run, bus, rng: createRng(1),
      definitions: [{
        id: 'incomplete-clear-speed', name: 'Incomplete Clear Speed', rarity: 'common', target: 'player',
        description: 'One chooser option.', maxStacks: 10,
        effects: [{ stat: 'moveSpeed', op: 'add', value: 1 }],
        presentation: { category: 'mobility', iconArtId: 'upgrade-icon:incomplete-clear-speed' },
      }],
    });
    try {
      applyXp(run, run.xpToNext, bus);
      expect(run.status).toBe('paused');
      expect(scene.physicsPausedByRun).toBe(true);
      expect(scene.stageRuntime.state.status).toBe('active');

      expect(upgrades.chooseCard(upgrades.currentOfferId!, 'incomplete-clear-speed')).toBe(true);

      expect(upgrades.pendingCount).toBe(0);
      expect(run.status).toBe('active');
      expect(scene.stageRuntime.pendingClear).toBeUndefined();
      expect(scene.physics.world.resume).toHaveBeenCalledOnce();
      expect(scene.physicsPausedByRun).toBe(false);
    } finally {
      paused(); resumed(); upgrades.destroy();
    }
  });

  it('defers portrait-unblock physics resume until the scene-owned update boundary', () => {
    const { scene } = createHarness();
    scene.orientationBlocked = true;
    scene.physicsPausedByRun = true;

    scene.handleOrientationChange(false);

    expect(scene.physics.world.resume).not.toHaveBeenCalled();
    expect(scene.physicsPausedByRun).toBe(true);

    scene.update(0, 16);

    expect(scene.inputController.quarantineUntilNeutral).toHaveBeenCalled();
    expect(scene.physics.world.resume).toHaveBeenCalledOnce();
  });

  describe('RED 1: HUD update during pendingClear', () => {
    it('updates HudController when pendingClear is active', () => {
      const { scene, hudUpdateSpy } = createHarness({ pendingClear: true, timeMs: 30_000 });

      // Run one update frame
      scene.update(0, 16);

      // HudController must be updated even during pendingClear
      expect(hudUpdateSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT update simulation systems when pendingClear is active', () => {
      const { scene, playerUpdateSpy, systemsUpdateSpy } = createHarness({ pendingClear: true, timeMs: 30_000 });

      scene.update(0, 16);

      // Player and simulation systems must NOT be updated
      expect(playerUpdateSpy).not.toHaveBeenCalled();
      expect(systemsUpdateSpy).not.toHaveBeenCalled();
    });
  });

  describe('RED 2: Clock freezes during pendingClear', () => {
    it('does not advance runState.timeMs during pendingClear', () => {
      const { scene } = createHarness({ pendingClear: true, timeMs: 30_000 });
      const { runState } = scene;

      const timeBefore = runState.timeMs;

      // Multiple update frames
      scene.update(0, 16);
      scene.update(0, 16);
      scene.update(0, 16);

      // Time must NOT advance
      expect(runState.timeMs).toBe(timeBefore);
    });

    it('advances runState.timeMs normally when no pendingClear', () => {
      const { scene } = createHarness({ pendingClear: false });
      const { runState } = scene;

      const timeBefore = runState.timeMs;

      scene.update(0, 16);

      // Time must advance by delta
      expect(runState.timeMs).toBe(timeBefore + 16);
    });
  });

  describe('RED 3: Normal active run updates everything', () => {
    it('updates player, simulation systems, and HUD each frame', () => {
      const { scene, hudUpdateSpy, playerUpdateSpy, systemsUpdateSpy } = createHarness({ pendingClear: false });

      scene.update(0, 16);

      // Everything updates during normal gameplay
      expect(hudUpdateSpy).toHaveBeenCalledTimes(1);
      expect(playerUpdateSpy).toHaveBeenCalledTimes(1);
      expect(systemsUpdateSpy).toHaveBeenCalledTimes(1);
    });

    it('does not double-update HudController (once per frame)', () => {
      const { scene, hudUpdateSpy } = createHarness({ pendingClear: false });

      // Run two frames
      scene.update(0, 16);
      scene.update(0, 16);

      // HudController must be updated exactly once per frame
      expect(hudUpdateSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('RED 4: Completion transition frame', () => {
    it('captures completion time exactly once on the transition frame', () => {
      const { scene } = createHarness({ pendingClear: false });
      const { runState, stageRuntime } = scene;

      // Set up: one kill short of completion
      runState.timeMs = 30_000;

      // The runtime has 5/20 kills. Add 14 more to reach 19/20.
      for (let i = 5; i < 19; i++) {
        stageRuntime.recordEnemyDefeat(`enemy-${i}`, 'grunt');
      }
      // The update processes the 19 kills
      scene.update(0, 16);
      expect(stageRuntime.pendingClear).toBeUndefined();

      // Final kill + update to complete
      stageRuntime.recordEnemyDefeat('enemy-final', 'grunt');
      scene.update(0, 16);

      // Now pendingClear should exist with captured time.
      expect(stageRuntime.pendingClear).not.toBeUndefined();
      const capturedTime = stageRuntime.pendingClear.timeMs;

      // Subsequent frames must NOT advance the captured time
      scene.update(0, 16);
      scene.update(0, 16);

      expect(stageRuntime.pendingClear.timeMs).toBe(capturedTime);
      expect(runState.timeMs).toBe(capturedTime); // run clock frozen too
    });

    it('retries frozen completion loot when a pause-menu merge frees rack capacity', () => {
      const { scene, pendingClearLootSpy, systemsUpdateSpy } = createHarness({ pendingClear: true });
      scene.runState.equipped = Array.from({ length: 6 }, (_, index) => ({ instanceId: `weapon:${index}` }));
      scene.update(0, 16);
      scene.update(0, 16);
      expect(pendingClearLootSpy).toHaveBeenCalledOnce();
      scene.runState.equipped.pop();
      scene.update(0, 16);
      expect(pendingClearLootSpy).toHaveBeenCalledTimes(2);
      expect(systemsUpdateSpy).not.toHaveBeenCalled();
      expect(scene.physics.world.resume).not.toHaveBeenCalled();
    });

    it('pauses immediately when a simulation system completes the objective later in the frame', () => {
      const { scene, pendingClearLootSpy } = createHarness({ pendingClear: false, timeMs: 30_000 });
      const { stageRuntime } = scene;
      for (let index = 5; index < 19; index += 1) {
        stageRuntime.recordEnemyDefeat(`enemy-${index}`, 'grunt');
      }
      const afterKiller = { update: vi.fn() };
      scene.systems = [
        { update: () => stageRuntime.recordEnemyDefeat('enemy-final', 'grunt') },
        afterKiller,
      ];

      scene.update(0, 16);

      expect(stageRuntime.pendingClear).toBeDefined();
      expect(scene.physics.world.pause).toHaveBeenCalledOnce();
      expect(pendingClearLootSpy).toHaveBeenCalledOnce();
      expect(afterKiller.update).not.toHaveBeenCalled();
    });

    it('settles frozen loot exactly once when pending clear originated in physics', () => {
      const { scene, pendingClearLootSpy } = createHarness({ pendingClear: true, timeMs: 30_000 });

      scene.update(0, 16);
      scene.update(0, 16);

      expect(pendingClearLootSpy).toHaveBeenCalledOnce();
    });

    it('advances the frozen run clock through a survive completion frame', () => {
      const { scene } = createHarness({ pendingClear: false, timeMs: 1_000 });
      const runtime = createStageRuntime({
        stageId: 'stage:survive-proof',
        objective: { definition: { type: 'survive', seconds: 2 } },
        encounter: {},
        reward: { firstClearScrap: 50, grants: [] },
      } as any);
      runtime.tick(1_000, 0);
      scene.stageRuntime = runtime;

      scene.update(0, 1_000);

      expect(runtime.pendingClear?.timeMs).toBe(2_000);
      expect(scene.runState.timeMs).toBe(2_000);
    });

    it('does not advance a survive objective or run clock while paused', () => {
      const { scene } = createHarness({ pendingClear: false, timeMs: 1_000 });
      const runtime = createStageRuntime({
        stageId: 'stage:survive-pause-proof',
        objective: { definition: { type: 'survive', seconds: 2 } },
        encounter: {},
        reward: { firstClearScrap: 50, grants: [] },
      } as any);
      runtime.tick(1_000, 0);
      scene.stageRuntime = runtime;
      scene.runState.status = 'paused';

      scene.update(0, 1_000);

      expect(runtime.pendingClear).toBeUndefined();
      expect(scene.runState.timeMs).toBe(1_000);

      scene.runState.status = 'active';
      scene.update(0, 1_000);
      expect(runtime.pendingClear?.timeMs).toBe(2_000);
      expect(scene.runState.timeMs).toBe(2_000);
    });
  });

  describe('RED 5: Pause round trip', () => {
    it('preserves pendingClear after pause/resume cycle', () => {
      const { scene } = createHarness({ pendingClear: true, timeMs: 30_000 });
      const { stageRuntime, runState } = scene;

      const pendingBefore = stageRuntime.pendingClear;
      const timeBefore = runState.timeMs;

      // Simulate pause (run state changes to paused)
      runState.status = 'paused';
      scene.update(0, 16);

      // pendingClear must survive pause
      expect(stageRuntime.pendingClear).toBe(pendingBefore);
      expect(stageRuntime.pendingClear.timeMs).toBe(timeBefore);

      // Simulate resume
      runState.status = 'active';
      scene.update(0, 16);

      // pendingClear must still be present after resume
      expect(stageRuntime.pendingClear).toBe(pendingBefore);
      expect(stageRuntime.pendingClear.timeMs).toBe(timeBefore);
      // Time must not have advanced
      expect(runState.timeMs).toBe(timeBefore);
    });
  });

  describe('RED 6: Stale HUD regression invariant', () => {
    it('describeObjective never returns 19/20 after objective completion', () => {
      const { scene } = createHarness({ pendingClear: false });
      const { stageRuntime } = scene;

      // Get to 19/20
      for (let i = 5; i < 19; i++) {
        stageRuntime.recordEnemyDefeat(`enemy-${i}`, 'grunt');
      }
      scene.update(0, 16);
      expect(stageRuntime.describeObjective()).toContain('19 / 20');

      // Complete
      stageRuntime.recordEnemyDefeat('enemy-final', 'grunt');
      scene.update(0, 16);

      // Must show OBJECTIVE COMPLETE, never 19/20
      const desc = stageRuntime.describeObjective();
      expect(desc).toContain('OBJECTIVE COMPLETE');
      expect(desc).not.toContain('19 / 20');
    });
  });

  describe('RED 7: Weapon/XP coincidence regression', () => {
    it('completes objective with active drops and scheduled reward without apparent freeze', () => {
      const { scene } = createHarness({ pendingClear: false });
      const { stageRuntime, runState } = scene;

      // Simulate a scheduled weapon reward near completion
      // (WeaponRewardSystem integration is tested separately in
      // weaponRewardDropIntegration.test.ts; this test verifies
      // the update orchestration doesn't break when both are active.)
      runState.timeMs = 30_000;

      // Get to 19/20 with some drops active (simulated via systems list)
      for (let i = 5; i < 19; i++) {
        stageRuntime.recordEnemyDefeat(`enemy-${i}`, 'grunt');
      }
      scene.update(0, 16);

      // Final kill
      stageRuntime.recordEnemyDefeat('enemy-final', 'grunt');
      scene.update(0, 16);

      // Verify pendingClear is present
      expect(stageRuntime.pendingClear).not.toBeUndefined();
      expect(stageRuntime.describeObjective()).toContain('OBJECTIVE COMPLETE');
      // Time frozen at completion frame time
      expect(runState.timeMs).toBe(30_016);
    });
  });
});
