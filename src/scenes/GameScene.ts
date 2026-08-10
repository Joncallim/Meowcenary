import Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../engine/context';
import { RuntimeConfig } from '../engine/config';
import { createRng, deriveRunSeed } from '../engine/rng';
import { SceneKey } from '../engine/sceneKeys';
import type { System } from '../engine/system';
import type { SpawnCurveDefinition } from '../systems/types';
import { AudioManager, AUDIO_MANAGER_REGISTRY_KEY } from '../systems/audio';
import { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { prepareRun } from '../gameplay/runStart';
import { assembleRunRequest } from '../gameplay/runRequest';
import {
  endRun,
  startRun,
  tickRun,
  type RunState,
} from '../gameplay/runState';
import { DebugOverlay } from '../systems/debug';
import { DropSystem } from '../systems/DropSystem';
import { InputController } from '../systems/input';
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
import { logicalCanvasViewport } from '../ui/layout';
import { PassiveCoordinator } from '../systems/PassiveCoordinator';
import { HazardSystem } from '../systems/HazardSystem';
import { DEFAULT_PASSIVE_HANDLERS, createPassiveHandlerRegistry } from '../gameplay/characterPassives';

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
  private dropSystem?: DropSystem;
  private upgradeSystem?: UpgradeSystem;
  private upgradeChooser?: UpgradeChooser;
  private progressionSystem?: ProgressionSystem;
  private runSummaryController?: RunSummaryController;
  private runSummaryView?: PhaserRunSummaryView;
  private spawnCurve?: Readonly<SpawnCurveDefinition>;
  private arenaScenery?: ArenaScenery;
  // Non-owning cache of the Boot-constructed, game-scoped manager.
  private audioManager?: AudioManager;

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    const { width } = this.scale;
    const ctx = this.getContext();
    const request = assembleRunRequest(ctx, ctx.menuRng);

    const arena = ctx.arenas.arenaById(request.arenaId);
    if (!arena) {
      throw new Error(`Selected arena "${request.arenaId}" is missing from the registry`);
    }
    const curve = ctx.data.spawnCurves.find((c) => c.id === arena.spawnCurveId);
    if (!curve) {
      throw new Error(`Arena "${arena.id}" references missing spawn curve "${arena.spawnCurveId}"`);
    }
    this.spawnCurve = curve;
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
      meta: ctx.saveData.meta,
      metaUpgrades: ctx.metaUpgrades,
      character: contribution,
    });
    this.runState = prepared.run;
    const spawnRng = createRng(deriveRunSeed(this.runState.seed, 'spawns'));
    const upgradeRng = createRng(deriveRunSeed(this.runState.seed, 'upgrades'));
    const lootRng = createRng(deriveRunSeed(this.runState.seed, 'loot'));
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
    });

    if (arena.size.width > this.scale.width || arena.size.height > this.scale.height) {
      this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    }

    const viewport = logicalCanvasViewport();
    this.hudController = new HudController(
      ctx.bus,
      createHudSource({
        runState: this.runState,
        player: this.player,
        durationMs: this.spawnCurve.durationSeconds * 1000,
        weaponRegistry,
      }),
      new PhaserHudView({ scene: this, viewport }),
    );
    this.controlsView = new ControlsView({
      scene: this,
      input: this.inputController,
      viewport,
      readReducedMotion: () => ctx.settings.reducedMotion,
      onPauseRequested: () => this.handlePauseKey(),
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
    this.pauseView = new PhaserPauseView({
      scene: this,
      viewport,
      bus: ctx.bus,
      controller: this.pauseController,
      inventory: this.inventoryController,
    });

    this.arenaScenery = buildArenaScenery(this, arena);
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
      rng: lootRng,
      dropRadius: RuntimeConfig.gameplay.drop.radius,
      magnetSpeed: RuntimeConfig.gameplay.drop.magnetSpeed,
      basePickupRadius: RuntimeConfig.gameplay.player.pickupRadius,
    });
    this.upgradeSystem = new UpgradeSystem({
      runState: this.runState,
      bus: ctx.bus,
      definitions: ctx.data.upgrades,
      rng: upgradeRng,
    });
    this.upgradeChooser = new UpgradeChooser(
      this,
      ctx.bus,
      this.upgradeSystem,
      () => ctx.settings.reducedMotion,
    );
    this.progressionSystem = new ProgressionSystem({
      runState: this.runState,
      bus: ctx.bus,
      context: ctx,
    });
    this.systems = [
      this.progressionSystem,
      new PassiveCoordinator({
        runState: this.runState,
        bus: ctx.bus,
        character,
        handlers: createPassiveHandlerRegistry(DEFAULT_PASSIVE_HANDLERS),
      }),
      new SpawnSystem(this, ctx, this.runState, spawnRng, this.player, this.enemies, this.enemyGroup, arena, curve),
      new HazardSystem({
        scene: this,
        runState: this.runState,
        bus: ctx.bus,
        player: this.player,
        hazards: arena.hazards,
      }),
      new WeaponSystem(
        this,
        ctx,
        this.runState,
        this.player,
        this.enemies,
        this.projectileGroup,
        this.enemyGroup,
        weaponRegistry,
        RuntimeConfig.gameplay.projectile.radius,
      ),
      this.dropSystem,
      this.upgradeSystem,
      this.hudController,
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
    });

    this.input.keyboard?.on('keydown-P', this.handlePauseKey, this);
    this.input.keyboard?.on('keydown-ESC', this.handlePauseKey, this);
    if (RuntimeConfig.isDev) {
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

    this.add.rectangle(
      arena.size.width / 2, arena.size.height / 2,
      arena.size.width - 24, arena.size.height - 24,
      0x16202a,
    ).setStrokeStyle(2, 0x2dd4bf, 0.28).setDepth(-1);
    this.add
      .text(
        width / 2,
        28,
        'Meowcenary',
        {
          align: 'center',
          color: '#f7f1d5',
          fontFamily: 'Inter, sans-serif',
          fontSize: '22px',
          fontStyle: '700',
          wordWrap: { width: width - 48 },
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0);

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

    this.inputController.update(delta);
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
    this.debugOverlay?.update([
      `dtMs: ${delta.toFixed(2)}`,
      `Run: ${runState.status} ${Math.floor(runState.timeMs / 1000)}s`,
      `Level: ${runState.level} XP: ${runState.xp.toFixed(1)}/${runState.xpToNext}`,
      `Health: ${this.player.health.toFixed(0)}/${this.player.maxHealth.toFixed(0)}`,
      `Enemies: ${this.enemies.length} Kills: ${runState.kills}`,
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
    this.input.keyboard?.off('keydown-P', this.handlePauseKey, this);
    this.input.keyboard?.off('keydown-ESC', this.handlePauseKey, this);
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
    this.player?.destroy();
    this.player = undefined;
    this.enemies.length = 0;
    this.debugOverlay?.destroy();
    this.inputController?.destroy();
    this.inputController = undefined;
    this.debugOverlay = undefined;
    this.upgradeSystem = undefined;
    this.spawnCurve = undefined;
    this.arenaScenery?.destroy();
    this.arenaScenery = undefined;
    this.runState = undefined;
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
    const ctx = this.registry.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext | undefined;
    if (!ctx) {
      throw new Error('GameContext missing from Phaser registry');
    }

    return ctx;
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
    this.input.once(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
    this.input.keyboard?.once('keydown', this.handleAudioUnlock, this);
  }

  private removeAudioUnlockListeners(): void {
    this.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleAudioUnlock,
      this,
    );
    this.input.keyboard?.off('keydown', this.handleAudioUnlock, this);
  }

  private getAudioManager(): AudioManager | undefined {
    return this.registry.get(AUDIO_MANAGER_REGISTRY_KEY) as
      | AudioManager
      | undefined;
  }

  private requireRunState(): RunState {
    if (!this.runState) {
      throw new Error('RunState missing from GameScene');
    }

    return this.runState;
  }

  /** P/Escape and the HUD pause button delegate here. Escape from inventory
   *  returns to pause; Escape from pause resumes; from a closed panel P opens
   *  the manual pause. A level-up pause is never stolen (PauseController
   *  rejects it), and the upgrade chooser remains the only level-up surface. */
  private handlePauseKey(): void {
    const controller = this.pauseController;
    if (!controller) {
      return;
    }

    const panel = controller.snapshot().panel;
    let accepted = false;
    let event: 'ui:confirm' | 'ui:back';

    if (panel === 'inventory') {
      accepted = controller.back();
      event = 'ui:back';
    } else if (panel === 'pause') {
      accepted = controller.resume();
      event = 'ui:back';
    } else {
      accepted = controller.pause();
      event = 'ui:confirm';
    }

    if (accepted) {
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
