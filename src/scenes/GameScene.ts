import Phaser from 'phaser';
import { getGameContext, type GameContext } from '../engine/context';
import { RuntimeConfig } from '../engine/config';
import { createRng, deriveRunSeed } from '../engine/rng';
import { SceneKey } from '../engine/sceneKeys';
import type { System } from '../engine/system';
import type { SpawnCurveDefinition } from '../systems/types';
import { AudioManager, getAudioManager } from '../systems/audio';
import { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { prepareRun } from '../gameplay/runStart';
import { assembleRunRequest } from '../gameplay/runRequest';
import { resolveRunPlan } from '../gameplay/stage/stageContracts';
import {
  endRun,
  startRun,
  tickRun,
  type RunState,
} from '../gameplay/runState';
import {
  DebugCheatSystem,
  DebugOverlay,
  debugCheatsActive,
  getDebugFlags,
  scaleSpawnCurveIntervals,
  togglePhysicsDebugWorld,
} from '../systems/debug';
import { DropSystem } from '../systems/DropSystem';
import { WeaponRewardSystem } from '../systems/WeaponRewardSystem';
import { InputController, type GameAction } from '../systems/input';
import { SpawnSystem } from '../systems/SpawnSystem';
import { buildArenaScenery, type ArenaScenery } from '../systems/arenaScenery';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { ProgressionSystem, type BankedRun } from '../systems/ProgressionSystem';
import { DataWeaponRegistry } from '../systems/weaponRegistry';
import { DataLootTableRegistry } from '../systems/lootTables';
import { WeaponSystem } from '../systems/WeaponSystem';
import { UpgradeChooser } from '../ui/UpgradeChooser';
import { resolveCharacterRunContribution } from '../gameplay/characterContribution';
import { HudController, PhaserHudView, createHudSource } from '../ui/hud';
import { ControlsView } from '../ui/controls';
import { InventoryController } from '../ui/inventory';
import { PauseController, PhaserPauseView } from '../ui/pause';
import {
  PhaserRunSummaryView,
  RunSummaryController,
  type RunSummarySource,
} from '../ui/runSummary';
import { GAMEPLAY_ZOOM, zoomedGameUiViewport } from '../ui/layout';
import { FullscreenController } from '../ui/fullscreen';
import { PassiveCoordinator } from '../systems/PassiveCoordinator';
import { HazardSystem } from '../systems/HazardSystem';
import { DEFAULT_PASSIVE_HANDLERS, createPassiveHandlerRegistry } from '../gameplay/characterPassives';
import { createDpsMeter, type DpsMeter } from '../gameplay/metrics';
import { createPerfSampler, type PerfSampler } from '../gameplay/perf';
import { PlaytestSummarySystem } from '../systems/playtestSummary';
import { FeedbackSystem, PhaserFeedbackRenderer } from '../systems/feedback';
import { DataVisualArtRegistry } from '../systems/visualArt';
import { HeldWeaponView } from '../entities/heldWeaponView';
import { DefeatPresentationSystem } from '../systems/defeatPresentation';
import type { FocusDirection } from '../ui/focusList';

/** U6: the gameplay camera shows canvas/zoom world units — 312×675.2 on the
 *  390×844 canvas at the 1.25× gameplay zoom. */
export function zoomedVisibleSize(
  canvasWidth: number,
  canvasHeight: number,
  zoom = GAMEPLAY_ZOOM,
): { readonly width: number; readonly height: number } {
  return { width: canvasWidth / zoom, height: canvasHeight / zoom };
}

/** U6: the camera follows the player exactly when the arena is larger than
 *  the visible area — including intermediate arenas between the zoomed
 *  logical canvas (312×675.2) and the full canvas (390×844), where a static
 *  camera would let the player walk off-screen. */
export function arenaFollowEnabled(
  arenaWidth: number,
  arenaHeight: number,
  visibleWidth: number,
  visibleHeight: number,
): boolean {
  return arenaWidth > visibleWidth || arenaHeight > visibleHeight;
}

export class GameScene extends Phaser.Scene {
  private debugOverlay?: DebugOverlay;
  private inputController?: InputController;
  private player?: Player;
  private runState?: RunState;
  private enemies: Enemy[] = [];
  private systems: System[] = [];
  private unsubscribers: Array<() => void> = [];
  private enemyGroup?: Phaser.Physics.Arcade.Group;
  private projectileGroup?: Phaser.Physics.Arcade.Group;
  private dropGroup?: Phaser.Physics.Arcade.Group;
  private physicsPausedByRun = false;
  private hudController?: HudController;
  private controlsView?: ControlsView;
  private pauseController?: PauseController;
  private inventoryController?: InventoryController;
  private pauseView?: PhaserPauseView;
  private fullscreenController?: FullscreenController;
  private dropSystem?: DropSystem;
  private weaponRewardSystem?: WeaponRewardSystem;
  private upgradeSystem?: UpgradeSystem;
  private upgradeChooser?: UpgradeChooser;
  private progressionSystem?: ProgressionSystem;
  private runSummaryController?: RunSummaryController;
  private runSummaryView?: PhaserRunSummaryView;
  private spawnCurve?: Readonly<SpawnCurveDefinition>;
  private arenaScenery?: ArenaScenery;
  private weaponSystem?: WeaponSystem;
  private feedbackSystem?: FeedbackSystem;
  private defeatPresentationSystem?: DefeatPresentationSystem;
  private perfSampler?: PerfSampler;
  // Non-owning cache of the Boot-constructed, game-scoped manager.
  private audioManager?: AudioManager;
  private audioUnlockUnsub?: () => void;
  private dpsMeter?: DpsMeter;

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    const ctx = this.getContext();
    const request = assembleRunRequest(ctx, ctx.menuRng);
    // Alpha 3 normal composition resolves the selected contract once at the
    // boundary. GameScene consumes its physical arena result; #85 wires the
    // remaining objective/encounter/reward fields to live systems.
    const plan = resolveRunPlan({ characterId: request.characterId, stageId: ctx.selectedStageId, seed: request.seed }, {
      stages: ctx.data.stages ?? [],
      encounterProfiles: ctx.data.encounterProfiles ?? [],
      difficultyProfiles: ctx.data.difficultyProfiles ?? [],
      rewardProfiles: ctx.data.rewardProfiles ?? [],
    });
    const visualArt = new DataVisualArtRegistry(ctx.data);

    const arena = ctx.arenas.arenaById(plan.arenaId);
    if (!arena) {
      throw new Error(`Selected arena "${request.arenaId}" is missing from the registry`);
    }
    const curve = ctx.data.spawnCurves.find((c) => c.id === arena.spawnCurveId);
    if (!curve) {
      throw new Error(`Arena "${arena.id}" references missing spawn curve "${arena.spawnCurveId}"`);
    }
    this.spawnCurve = curve;
    // Development-only debug cheats. The flags are cached once per page by
    // getDebugFlags, and the master `?cheats=1` switch is required. The
    // original curve stays authoritative for HUD/victory duration; only
    // SpawnSystem receives the optional faster-cadence copy.
    const debugFlags = import.meta.env.DEV ? getDebugFlags() : undefined;
    const cheatsActive =
      debugFlags !== undefined && debugCheatsActive(debugFlags, true);
    const directorCurve =
      cheatsActive && debugFlags
        ? scaleSpawnCurveIntervals(curve, debugFlags.spawnMultiplier)
        : curve;
    const character = ctx.characters.characterById(request.characterId);
    if (!character) {
      throw new Error(`Selected character "${request.characterId}" is missing from the registry`);
    }
    const weaponRegistry = new DataWeaponRegistry(ctx.data);
    const contribution = resolveCharacterRunContribution(character, weaponRegistry);
    const prepared = prepareRun({
      state: {
        seed: request.seed,
        characterId: request.characterId,
        arenaId: request.arenaId,
      },
      basePlayer: {
        maxHealth: RuntimeConfig.gameplay.player.baseMaxHealth,
        moveSpeed: RuntimeConfig.gameplay.player.baseMoveSpeed,
      },
      meta: ctx.saveData.progression,
      metaUpgrades: ctx.metaUpgrades,
      character: contribution,
    });
    this.runState = prepared.run;
    // Run-clock-stamped effective-damage meter. The listener captures the
    // run-state local so it never re-reads scene state after shutdown.
    const dpsMeter = createDpsMeter();
    this.dpsMeter = dpsMeter;
    const runStateForMetrics = this.runState;
    this.unsubscribers.push(
      ctx.bus.on('enemy:damaged', ({ amount }) => {
        dpsMeter.record(amount, runStateForMetrics.timeMs);
      }),
    );
    const spawnRng = createRng(deriveRunSeed(this.runState.seed, 'spawns'));
    const upgradeRng = createRng(deriveRunSeed(this.runState.seed, 'upgrades'));
    const lootRng = createRng(deriveRunSeed(this.runState.seed, 'loot'));
    // Epic 14 §D10: dedicated stream for scheduled weapon rewards so their
    // draws never perturb the established loot/spawn/upgrade sequences.
    const weaponRewardRng = createRng(deriveRunSeed(this.runState.seed, 'weapon-rewards'));
    const lootTables = new DataLootTableRegistry(ctx.data);

    this.inputController = new InputController(this);
    this.debugOverlay = new DebugOverlay(this);

    this.enemyGroup = this.physics.add.group();
    this.projectileGroup = this.physics.add.group();
    this.dropGroup = this.physics.add.group();

    this.physics.world.setBounds(0, 0, arena.size.width, arena.size.height);
    this.cameras.main.setBounds(0, 0, arena.size.width, arena.size.height);

    this.player = new Player(this, this.inputController, this.runState, ctx.bus, {
      baseMaxHealth: prepared.basePlayer.maxHealth,
      baseMoveSpeed: prepared.basePlayer.moveSpeed,
      invulnerabilityMs: RuntimeConfig.gameplay.player.invulnerabilityMs,
      spawnX: arena.size.width / 2,
      spawnY: arena.size.height / 2,
    }, visualArt.bindingById(`character:${request.characterId}`));

    const visibleSize = zoomedVisibleSize(this.scale.width, this.scale.height);
    // Fractional zoom must retain subpixel camera motion; Phaser's integer
    // scroll rounding produces a visible sawtooth in the follow trace.
    this.cameras.main.roundPixels = false;
    // U6: intermediate arenas (larger than the 312×675.2 visible area but
    // smaller than the full canvas) MUST follow the player within bounds.
    if (arenaFollowEnabled(arena.size.width, arena.size.height, visibleSize.width, visibleSize.height)) {
      this.cameras.main.startFollow(this.player.sprite, false, 0.1, 0.1);
    }
    this.cameras.main.setZoom(GAMEPLAY_ZOOM);

    const viewport = zoomedGameUiViewport(
      this.scale.displaySize.width,
      this.scale.displaySize.height,
      this.scale.parentSize.width,
      this.scale.parentSize.height,
    );
    this.hudController = new HudController(
      ctx.bus,
      createHudSource({
        runState: this.runState,
        player: this.player,
        durationMs: this.spawnCurve.durationSeconds * 1000,
      }),
      new PhaserHudView({
        scene: this,
        viewport,
      }),
    );
    this.controlsView = new ControlsView({
      scene: this,
      input: this.inputController,
      viewport,
      readReducedMotion: () => ctx.settings.reducedMotion,
      onPauseRequested: () => this.routeAction('pause'),
    });

    this.inventoryController = new InventoryController({
      runState: this.runState,
      bus: ctx.bus,
      weaponRegistry,
    });
    this.pauseController = new PauseController({
      runState: this.runState,
      bus: ctx.bus,
      inventory: this.inventoryController,
    });
    this.fullscreenController = new FullscreenController(this.scale);
    this.pauseView = new PhaserPauseView({
      scene: this,
      viewport,
      bus: ctx.bus,
      controller: this.pauseController,
      inventory: this.inventoryController,
      visualArt,
      readInputMode: () => this.inputController!.getInputMode(),
      fullscreen: this.fullscreenController,
    });

    this.arenaScenery = buildArenaScenery(this, arena, visualArt);
    if (this.arenaScenery.obstacleGroup.children?.size > 0) {
      this.physics.add.collider(this.player.sprite, this.arenaScenery.obstacleGroup);
      this.physics.add.collider(this.enemyGroup, this.arenaScenery.obstacleGroup);
    }
    this.dropSystem = new DropSystem({
      scene: this,
      ctx,
      runState: this.runState,
      player: this.player,
      dropGroup: this.dropGroup,
      lootTables,
      weaponRegistry,
      rng: lootRng,
      dropRadius: RuntimeConfig.gameplay.drop.radius,
      magnetSpeed: RuntimeConfig.gameplay.drop.magnetSpeed,
      basePickupRadius: RuntimeConfig.gameplay.player.pickupRadius,
      artByKind: Object.freeze({
        xp: visualArt.bindingById('drop:xp'),
        scrap: visualArt.bindingById('drop:scrap'),
        chest: visualArt.bindingById('drop:chest'),
        weapon: visualArt.bindingById('drop:weapon'),
      }),
    });
    // Constructed after DropSystem so the injected callback can request world
    // drops through the one physical pickup boundary (Epic 14 §D6/D8).
    this.weaponRewardSystem = new WeaponRewardSystem({
      runState: this.runState,
      rng: weaponRewardRng,
      lootTables,
      config: RuntimeConfig.gameplay.weaponRewards,
      dropRadius: RuntimeConfig.gameplay.drop.radius,
      basePickupRadius: RuntimeConfig.gameplay.player.pickupRadius,
      spawnDrop: (x, y, grant) => this.dropSystem!.spawnDrop(x, y, grant),
      playerPosition: () => ({ x: this.player!.x, y: this.player!.y }),
      arenaBounds: { width: arena.size.width, height: arena.size.height },
      obstacles: arena.obstacles,
    });
    this.upgradeSystem = new UpgradeSystem({
      runState: this.runState,
      bus: ctx.bus,
      definitions: ctx.data.upgrades,
      rng: upgradeRng,
      offerCount: RuntimeConfig.gameplay.upgrades.offerCount,
    });
    this.upgradeChooser = new UpgradeChooser(
      this,
      ctx.bus,
      this.upgradeSystem,
      () => ctx.settings.reducedMotion,
      visualArt,
      () => this.inputController!.getInputMode(),
      viewport,
    );
    this.progressionSystem = new ProgressionSystem({
      runState: this.runState,
      bus: ctx.bus,
      context: ctx,
    });
    const debugCheatSystem =
      cheatsActive && debugFlags
        ? new DebugCheatSystem({
            runState: this.runState,
            player: this.player,
            flags: debugFlags,
          })
        : undefined;
    // Development-only local playtest summary, constructed after
    // ProgressionSystem so banking still runs first in listener order.
    const playtestSummarySystem =
      import.meta.env.DEV
        ? new PlaytestSummarySystem({
            runState: this.runState,
            bus: ctx.bus,
            dpsMeter,
            weaponRewardIssuedCount: () => this.weaponRewardSystem?.issuedCount ?? 0,
          })
        : undefined;
    this.weaponSystem = new WeaponSystem(
      this,
      ctx,
      this.runState,
      this.player,
      this.enemies,
      this.projectileGroup,
      this.enemyGroup,
      weaponRegistry,
      RuntimeConfig.gameplay.projectile.radius,
      visualArt,
      new HeldWeaponView(this),
    );
    this.feedbackSystem = new FeedbackSystem({
      bus: ctx.bus,
      settings: ctx.settings,
      renderer: new PhaserFeedbackRenderer({
        scene: this,
        maxEffects: RuntimeConfig.performance.maxFeedbackEffects,
        maxHeavyEffects: RuntimeConfig.performance.maxHeavyFeedbackEffects,
        weaponFeel: ctx.data.weaponFeel,
        viewport,
      }),
    });
    this.defeatPresentationSystem = new DefeatPresentationSystem({
      scene: this,
      bus: ctx.bus,
      visualArt,
      maxPresentations: RuntimeConfig.performance.maxDefeatPresentations,
    });
    this.perfSampler = createPerfSampler(
      RuntimeConfig.performance.sampleWindowFrames,
      RuntimeConfig.performance.targetFps,
    );

    this.systems = [
      this.progressionSystem,
      new PassiveCoordinator({
        runState: this.runState,
        bus: ctx.bus,
        character,
        handlers: createPassiveHandlerRegistry(DEFAULT_PASSIVE_HANDLERS),
      }),
      new SpawnSystem(this, ctx, this.runState, spawnRng, this.player, this.enemies, this.enemyGroup, arena, directorCurve, visualArt),
      new HazardSystem({
        scene: this,
        runState: this.runState,
        bus: ctx.bus,
        player: this.player,
        hazards: arena.hazards,
      }),
      this.feedbackSystem,
      this.defeatPresentationSystem,
      this.weaponSystem,
      // Immediately before DropSystem so a reward spawned this update enters
      // the ordinary drop update/physics lifecycle in the same frame without
      // ever touching the rack directly (Epic 14 §7).
      this.weaponRewardSystem,
      this.dropSystem,
      this.upgradeSystem,
      ...(debugCheatSystem ? [debugCheatSystem] : []),
      this.hudController,
      ...(playtestSummarySystem ? [playtestSummarySystem] : []),
    ];

    // The run summary source is getter-backed so banking (which happens first
    // in listener order) is visible to the summary's later snapshot reads.
    const scene = this;
    const runSummarySource: RunSummarySource = {
      get runState(): Readonly<RunState> {
        return scene.requireRunState();
      },
      get lastBankedRun(): BankedRun | null {
        return scene.progressionSystem?.lastBankedRun ?? null;
      },
    };
    this.runSummaryController = new RunSummaryController(runSummarySource);
    this.runSummaryView = new PhaserRunSummaryView({
      scene: this,
      viewport,
      bus: ctx.bus,
      controller: this.runSummaryController,
      readInputMode: () => this.inputController!.getInputMode(),
    });

    this.inputController.onAction('pause', () => this.routeAction('pause'));
    this.inputController.onAction('back', () => this.routeAction('back'));
    this.inputController.onAction('inventory', () => this.routeAction('inventory'));
    this.inputController.onAction('navUp', () => this.routeAction('navUp'));
    this.inputController.onAction('navDown', () => this.routeAction('navDown'));
    this.inputController.onAction('navLeft', () => this.routeAction('navLeft'));
    this.inputController.onAction('navRight', () => this.routeAction('navRight'));
    this.inputController.onAction('confirm', () => this.routeAction('confirm'));
    if (RuntimeConfig.isDev) {
      this.input.keyboard?.on('keydown-F4', this.togglePhysicsDebug, this);
      this.input.keyboard?.on('keydown-F8', this.forceLoseRun, this);
      this.input.keyboard?.on('keydown-F9', this.forceWinRun, this);
      this.input.keyboard?.on('keydown-F10', this.spawnChestDev, this);
    }
    this.unsubscribers.push(
      ctx.bus.on('run:paused', () => {
        this.syncPhysicsPause(this.requireRunState());
      }),
      ctx.bus.on('run:resumed', () => {
        this.syncPhysicsPause(this.requireRunState());
      }),
      ctx.bus.on('run:won', () => {
        this.syncPhysicsPause(this.requireRunState());
      }),
      ctx.bus.on('run:lost', () => {
        this.syncPhysicsPause(this.requireRunState());
      }),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);

    // Audio wiring after the display tree is constructed, immediately before
    // the run starts: fetch the shared manager, select the run loop, and arm
    // the first-gesture unlock pair. A missing registry entry is tolerated.
    this.audioManager = this.getAudioManager();
    this.audioManager?.playMusic('music-run');
    this.installAudioUnlockListeners();

    startRun(this.runState, ctx.bus);
  }

  update(_time: number, delta: number): void {
    const runState = this.runState;
    const ctx = this.getContext();
    if (!runState || !this.inputController || !this.player) {
      return;
    }

    this.perfSampler?.recordFrame(delta);
    this.inputController.update(delta);
    this.pauseView?.refreshInputPresentation();
    this.runSummaryView?.refreshInputPresentation();
    this.upgradeChooser?.refreshInputPresentation();
    tickRun(runState, delta);
    this.maybeEndRunForVictory(ctx, runState);
    this.syncPhysicsPause(runState);
    this.player.update(delta);
    this.systems.forEach((system) => {
      system.update(delta);
    });
    // The manager's deterministic clock stays aligned with the active scene
    // update so terminal music fades continue while the summary remains
    // visible.
    this.audioManager?.update(delta);

    this.controlsView?.update(delta);
    const move = this.inputController.getMoveVector();
    const pointer = this.inputController.getPointer();
    const perf = this.perfSampler?.snapshot();
    const perfLine = perf
      ? `Frame(${perf.sampleCount}): ${perf.averageFrameMs.toFixed(1)}ms ~${perf.averageFps.toFixed(1)}fps slow ${Math.round(perf.overBudgetRatio * 100)}%`
      : 'Frame: --';
    this.debugOverlay?.update([
      `dtMs: ${delta.toFixed(2)}`,
      `PhysDebug: ${this.physics.world.drawDebug ? 'on' : 'off'}`,
      perfLine,
      `Run: ${runState.status} ${Math.floor(runState.timeMs / 1000)}s`,
      `Level: ${runState.level} XP: ${runState.xp.toFixed(1)}/${runState.xpToNext}`,
      `Health: ${this.player.health.toFixed(0)}/${this.player.maxHealth.toFixed(0)}`,
      `Enemies: ${this.enemies.length} Kills: ${runState.kills}`,
      `Projectiles: ${this.weaponSystem?.activeProjectileCount ?? 0} active / ${this.weaponSystem?.allocatedProjectileCount ?? 0} allocated`,
      `Drops: ${this.dropSystem?.activeDropCount ?? 0} active / ${this.dropSystem?.allocatedDropCount ?? 0} allocated`,
      `FX: ${this.feedbackSystem?.activeEffectCount ?? 0} active / ${this.feedbackSystem?.allocatedEffectCount ?? 0} allocated / ${this.feedbackSystem?.droppedEffectCount ?? 0} dropped`,
      `Defeats: ${this.defeatPresentationSystem?.activePresentationCount ?? 0} active / ${this.defeatPresentationSystem?.allocatedPresentationCount ?? 0} allocated / ${this.defeatPresentationSystem?.droppedPresentationCount ?? 0} dropped`,
      `DPS(5s): ${(this.dpsMeter?.windowDps(runState.timeMs) ?? 0).toFixed(1)}`,
      `Weapons: ${runState.equipped.map((weapon) => `${weapon.family} T${weapon.tier}`).join(', ')}`,
      `Move: ${move.x.toFixed(2)}, ${move.y.toFixed(2)}`,
      `Pointer: ${pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}` : 'none'}`,
    ]);
  }

  private handleShutdown(): void {
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.off(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
    this.removeAudioUnlockListeners();
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers = [];
    this.input.keyboard?.off('keydown-F4', this.togglePhysicsDebug, this);
    this.input.keyboard?.off('keydown-F8', this.forceLoseRun, this);
    this.input.keyboard?.off('keydown-F9', this.forceWinRun, this);
    this.input.keyboard?.off('keydown-F10', this.spawnChestDev, this);
    this.upgradeChooser?.destroy();
    this.upgradeChooser = undefined;
    this.controlsView?.destroy();
    this.controlsView = undefined;
    this.pauseView?.destroy();
    this.pauseView = undefined;
    this.pauseController?.destroy();
    this.pauseController = undefined;
    this.fullscreenController?.destroy();
    this.fullscreenController = undefined;
    this.inventoryController = undefined;
    this.runSummaryView?.destroy();
    this.runSummaryView = undefined;
    this.runSummaryController = undefined;
    this.systems.forEach((system) => {
      system.destroy();
    });
    this.systems = [];
    this.progressionSystem = undefined;
    this.hudController = undefined;
    this.dropSystem = undefined;
    this.weaponRewardSystem = undefined;
    this.player?.destroy();
    this.player = undefined;
    this.enemies.length = 0;
    this.debugOverlay?.destroy();
    this.inputController?.destroy();
    this.inputController = undefined;
    this.debugOverlay = undefined;
    this.upgradeSystem = undefined;
    this.weaponSystem = undefined;
    this.feedbackSystem = undefined;
    this.defeatPresentationSystem = undefined;
    this.perfSampler = undefined;
    this.spawnCurve = undefined;
    this.arenaScenery?.destroy();
    this.arenaScenery = undefined;
    this.runState = undefined;
    this.dpsMeter = undefined;
    if (this.physicsPausedByRun) {
      this.physics.world?.resume();
      this.physicsPausedByRun = false;
    }
    this.enemyGroup = undefined;
    this.projectileGroup = undefined;
    this.dropGroup = undefined;
    // The manager is game-scoped and Boot-owned: shutdown only drops this
    // scene's reference — never destroy/stopMusic/stopAll.
    this.audioManager = undefined;
  }

  private getContext(): GameContext {
    return getGameContext(this);
  }

  private readonly handleAudioUnlock = (): void => {
    this.removeAudioUnlockListeners();
    this.audioManager?.unlock();
  };

  private installAudioUnlockListeners(): void {
    if (!this.audioManager) {
      return;
    }
    this.removeAudioUnlockListeners();
    this.audioUnlockUnsub = this.inputController!.onAnyAction(() =>
      this.handleAudioUnlock(),
    );
    this.input.once(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
  }

  private removeAudioUnlockListeners(): void {
    this.audioUnlockUnsub?.();
    this.audioUnlockUnsub = undefined;
    this.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
  }

  private getAudioManager(): AudioManager | undefined {
    return getAudioManager(this);
  }

  private requireRunState(): RunState {
    if (!this.runState) {
      throw new Error('RunState missing from GameScene');
    }

    return this.runState;
  }

  /** Epic 19 §5 run-level routing matrix. Each logical action maps to a
   *  context-specific command; a discarded action returns from its matched
   *  context and must never fall through to a lower-priority row (round-1
   *  adversarial finding F2). The scene always owns a run in production, so
   *  an absent runState is a teardown/inconsistent seam and every action is
   *  discarded immediately — no panel fallback routes commands without a run. */
  private routeAction(action: GameAction): void {
    const runState = this.runState;
    if (!runState) {
      return;
    }
    const direction: FocusDirection | undefined =
      action === 'navUp' ? 'up' : action === 'navDown' ? 'down' :
        action === 'navLeft' ? 'left' : action === 'navRight' ? 'right' : undefined;

    // 1. Terminal run: summary owns previous/next/confirm. Back, Pause, and
    //    Inventory are deliberate no-ops in the terminal context.
    if (runState.status === 'won' || runState.status === 'lost') {
      if (direction) this.runSummaryView?.moveFocus(direction);
      else if (action === 'confirm') this.runSummaryView?.confirmFocused();
      return;
    }

    // 2. Level-up chooser: precedence over any stale manual PauseSnapshot.
    //    Back/Pause/Inventory are discarded while the chooser owns the pause.
    if (runState.status === 'paused' && runState.pauseReason === 'levelUp') {
      if (action === 'navUp' || action === 'navLeft') this.upgradeChooser?.focusPrevious();
      else if (action === 'navDown' || action === 'navRight') this.upgradeChooser?.focusNext();
      else if (action === 'confirm') this.upgradeChooser?.confirmFocused();
      return;
    }

    const controller = this.pauseController;
    if (!controller) {
      return;
    }

    const panel = controller.snapshot().panel;

    // 3. Inventory/rack: nav/confirm delegate to the rack through the Pause
    //    view; only Back walks back to the pause panel. Pause and Inventory
    //    edges are discarded here.
    if (panel === 'inventory') {
      if (direction) this.pauseView?.moveFocus(direction);
      else if (action === 'confirm') this.pauseView?.confirmFocused();
      else if (action === 'back') {
        const accepted = controller.back();
        if (accepted) this.getContext().bus.emit('ui:back', {});
        this.pauseView?.render(controller.snapshot());
      }
      return;
    }

    // 4. Pause panel: nav/confirm delegate to the Pause view; Back/Pause
    //    resume; Inventory opens the rack.
    if (panel === 'pause') {
      if (direction) this.pauseView?.moveFocus(direction);
      else if (action === 'confirm') this.pauseView?.confirmFocused();
      else if (action === 'back' || action === 'pause') {
        const accepted = controller.resume();
        if (accepted) this.getContext().bus.emit('ui:back', {});
        this.pauseView?.render(controller.snapshot());
      } else if (action === 'inventory') {
        const accepted = controller.openInventory();
        if (accepted) this.getContext().bus.emit('ui:confirm', {});
        this.pauseView?.render(controller.snapshot());
      }
      return;
    }

    // 5. Active run / no modal: only Back/Pause pause and Inventory
    //    direct-opens. Nav/confirm/dash/ability and every unmatched action
    //    are discarded immediately — they must not fall through to a pause
    //    view render or any other lower-priority command.
    if (runState.status !== 'active' || panel !== 'closed') {
      return;
    }
    let accepted = false;
    let event: 'ui:confirm' | 'ui:back' | null = null;

    if (action === 'back' || action === 'pause') {
      accepted = controller.pause();
      event = 'ui:confirm';
    } else if (action === 'inventory') {
      accepted = controller.openInventoryFromRun();
      event = 'ui:confirm';
    } else {
      return;
    }

    if (accepted && event) {
      this.getContext().bus.emit(event, {});
    }
    this.pauseView?.render(controller.snapshot());
  }

  private forceLoseRun(): void {
    const runState = this.runState;
    if (!RuntimeConfig.isDev || !runState || runState.status !== 'active') {
      return;
    }

    endRun(runState, 'lost', this.getContext().bus);
  }

  private togglePhysicsDebug(): void {
    if (!RuntimeConfig.isDev) return;
    const next = togglePhysicsDebugWorld(this.physics.world);
    console.info(`[physics-debug] ${next ? 'on' : 'off'}`);
  }

  private forceWinRun(): void {
    const runState = this.runState;
    if (!RuntimeConfig.isDev || !runState || runState.status !== 'active') {
      return;
    }

    endRun(runState, 'won', this.getContext().bus);
  }

  private spawnChestDev(): void {
    if (
      !RuntimeConfig.isDev ||
      !this.runState ||
      this.runState.status !== 'active' ||
      !this.player ||
      !this.dropSystem
    ) {
      return;
    }

    const x = this.player.x + 48;
    const y = this.player.y;
    this.dropSystem.spawnDrop(x, y, { kind: 'chest', amount: 0, tableId: 'chest-standard' });
    console.log(`[dev] Chest spawned at (${Math.round(x)}, ${Math.round(y)}) — walk over it to open.`);
  }

  private maybeEndRunForVictory(ctx: GameContext, runState: RunState): void {
    const durationSeconds = this.spawnCurve?.durationSeconds;
    if (
      runState.status === 'active' &&
      durationSeconds !== undefined &&
      runState.timeMs >= durationSeconds * 1000
    ) {
      endRun(runState, 'won', ctx.bus);
    }
  }

  private syncPhysicsPause(runState: RunState): void {
    const shouldPause = runState.status !== 'active';
    if (shouldPause && !this.physicsPausedByRun) {
      this.physics.world.pause();
      this.physicsPausedByRun = true;
      return;
    }

    if (!shouldPause && this.physicsPausedByRun) {
      this.physics.world.resume();
      this.physicsPausedByRun = false;
    }
  }
}
