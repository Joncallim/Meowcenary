import Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../engine/context';
import { RuntimeConfig } from '../engine/config';
import { createRng, deriveRunSeed } from '../engine/rng';
import { SceneKey } from '../engine/sceneKeys';
import type { System } from '../engine/system';
import { Player } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { prepareRun } from '../gameplay/runStart';
import {
  canRestartRun,
  endRun,
  pauseRun,
  resumeRun,
  startRun,
  tickRun,
  type RunState,
} from '../gameplay/runState';
import { AudioManager } from '../systems/audio';
import { DebugOverlay } from '../systems/debug';
import { DropSystem } from '../systems/DropSystem';
import { InputController } from '../systems/input';
import { SpawnSystem } from '../systems/SpawnSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { DataWeaponRegistry } from '../systems/weaponRegistry';
import { WeaponSystem } from '../systems/WeaponSystem';
import { UpgradeChooser } from '../ui/UpgradeChooser';
import { CharacterSelectionController } from '../ui/characterSelectionController';
import { resolveCharacterRunContribution } from '../gameplay/characterContribution';
import { PassiveCoordinator } from '../systems/PassiveCoordinator';
import { DEFAULT_PASSIVE_HANDLERS, createPassiveHandlerRegistry } from '../gameplay/characterPassives';

export class GameScene extends Phaser.Scene {
  private audioManager?: AudioManager;
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
  private hudText?: Phaser.GameObjects.Text;
  private centerText?: Phaser.GameObjects.Text;
  private overlayText?: Phaser.GameObjects.Text;
  private physicsPausedByRun = false;
  private upgradeSystem?: UpgradeSystem;
  private upgradeChooser?: UpgradeChooser;
  private characterController?: CharacterSelectionController;

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    const { width, height } = this.scale;
    const ctx = this.getContext();
    const characterController = new CharacterSelectionController(ctx);
    this.characterController = characterController;
    const request = characterController.buildRunRequest(ctx.menuRng);
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

    this.inputController = new InputController(this);
    this.debugOverlay = new DebugOverlay(this);
    this.audioManager = new AudioManager(this);
    this.audioManager.setMuted(ctx.settings.muted);
    this.audioManager.setVolume(ctx.settings.sfxVolume);

    this.enemyGroup = this.physics.add.group();
    this.projectileGroup = this.physics.add.group();
    this.dropGroup = this.physics.add.group();
    this.player = new Player(this, this.inputController, this.runState, ctx.bus, {
      baseMaxHealth: prepared.basePlayer.maxHealth,
      baseMoveSpeed: prepared.basePlayer.moveSpeed,
      invulnerabilityMs: RuntimeConfig.gameplay.player.invulnerabilityMs,
    });
    const dropSystem = new DropSystem(
      this,
      ctx,
      this.runState,
      this.player,
      this.dropGroup,
      RuntimeConfig.gameplay.xpDrop.radius,
      RuntimeConfig.gameplay.player.pickupRadius,
    );
    this.upgradeSystem = new UpgradeSystem({
      runState: this.runState,
      bus: ctx.bus,
      definitions: ctx.data.upgrades,
      rng: upgradeRng,
    });
    this.upgradeChooser = new UpgradeChooser(this, ctx.bus, this.upgradeSystem);
    this.systems = [
      new ProgressionSystem({ runState: this.runState, bus: ctx.bus, context: ctx }),
      new PassiveCoordinator({
        runState: this.runState,
        bus: ctx.bus,
        character,
        handlers: createPassiveHandlerRegistry(DEFAULT_PASSIVE_HANDLERS),
      }),
      new SpawnSystem(this, ctx, this.runState, spawnRng, this.player, this.enemies, this.enemyGroup),
      new WeaponSystem(
        this,
        ctx,
        this.runState,
        this.player,
        this.enemies,
        this.projectileGroup,
        this.enemyGroup,
        weaponRegistry,
        dropSystem.createXpDrop.bind(dropSystem),
        RuntimeConfig.gameplay.projectile.radius,
      ),
      dropSystem,
      this.upgradeSystem,
      this.audioManager,
    ];

    this.input.keyboard?.on('keydown-P', this.togglePause, this);
    this.input.keyboard?.on('keydown-ESC', this.togglePause, this);
    if (RuntimeConfig.isDev) {
      this.input.keyboard?.on('keydown-F8', this.forceLoseRun, this);
      this.input.keyboard?.on('keydown-F9', this.forceWinRun, this);
      this.input.keyboard?.on('keydown-C', this.cycleCharacterDev, this);
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
        this.showOverlay('Run Complete\nYou survived the wave.\nPress R to restart');
      }),
      ctx.bus.on('run:lost', () => {
        this.syncPhysicsPause(this.requireRunState());
        this.showOverlay('Run Failed\nPress R to restart');
      }),
    );
    this.input.keyboard?.on('keydown-R', this.restartRun, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);

    this.add.rectangle(width / 2, height / 2, width - 24, height - 24, 0x16202a).setStrokeStyle(2, 0x2dd4bf, 0.28);
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
      .setOrigin(0.5);
    this.hudText = this.add
      .text(12, 54, '', {
        color: '#d6f7ff',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        lineSpacing: 3,
      })
      .setDepth(100)
      .setScrollFactor(0);
    this.centerText = this.add
      .text(width / 2, height / 2, 'WASD / arrows / drag to move\nAuto-fire starts when enemies are near\nP or Esc pauses', {
        align: 'center',
        backgroundColor: 'rgba(11, 17, 23, 0.72)',
        color: '#f7f1d5',
        fontFamily: 'Inter, sans-serif',
        fontSize: '15px',
        padding: { x: 12, y: 10 },
      })
      .setDepth(200)
      .setOrigin(0.5);
    this.time.delayedCall(2200, () => {
      this.centerText?.setVisible(false);
    });
    this.overlayText = this.add
      .text(width / 2, height / 2, '', {
        align: 'center',
        backgroundColor: 'rgba(11, 17, 23, 0.86)',
        color: '#ffffff',
        fontFamily: 'Inter, sans-serif',
        fontSize: '18px',
        lineSpacing: 8,
        padding: { x: 18, y: 16 },
      })
      .setDepth(300)
      .setOrigin(0.5)
      .setVisible(false);

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

    this.updateHud(runState);
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
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers = [];
    this.input.keyboard?.off('keydown-P', this.togglePause, this);
    this.input.keyboard?.off('keydown-ESC', this.togglePause, this);
    this.input.keyboard?.off('keydown-R', this.restartRun, this);
    this.input.keyboard?.off('keydown-F8', this.forceLoseRun, this);
    this.input.keyboard?.off('keydown-F9', this.forceWinRun, this);
    this.input.keyboard?.off('keydown-C', this.cycleCharacterDev, this);
    this.upgradeChooser?.destroy();
    this.upgradeChooser = undefined;
    this.systems.forEach((system) => {
      system.destroy();
    });
    this.systems = [];
    this.player?.destroy();
    this.player = undefined;
    this.enemies.length = 0;
    this.debugOverlay?.destroy();
    this.inputController?.destroy();
    this.inputController = undefined;
    this.debugOverlay = undefined;
    this.audioManager = undefined;
    this.upgradeSystem = undefined;
    this.characterController = undefined;
    this.runState = undefined;
    if (this.physicsPausedByRun) {
      this.physics.world?.resume();
      this.physicsPausedByRun = false;
    }
    this.enemyGroup = undefined;
    this.projectileGroup = undefined;
    this.dropGroup = undefined;
    this.hudText = undefined;
    this.centerText = undefined;
    this.overlayText = undefined;
  }

  private getContext(): GameContext {
    const ctx = this.registry.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext | undefined;
    if (!ctx) {
      throw new Error('GameContext missing from Phaser registry');
    }

    return ctx;
  }

  private requireRunState(): RunState {
    if (!this.runState) {
      throw new Error('RunState missing from GameScene');
    }

    return this.runState;
  }

  private togglePause(): void {
    const runState = this.runState;
    if (!runState) {
      return;
    }

    const ctx = this.getContext();
    if (runState.status === 'active') {
      pauseRun(runState, ctx.bus, 'manual');
      this.syncPhysicsPause(runState);
      this.showOverlay('Paused\nP / Esc to resume');
      return;
    }

    if (runState.status === 'paused' && runState.pauseReason === 'manual') {
      resumeRun(runState, ctx.bus, 'manual');
      this.syncPhysicsPause(runState);
      this.hideOverlay();
    }
  }

  private restartRun(): void {
    if (!canRestartRun(this.runState)) {
      return;
    }

    this.scene.restart();
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

  private cycleCharacterDev(): void {
    if (!RuntimeConfig.isDev || !this.characterController) return;

    const snapshot = this.characterController.snapshot();
    const currentIndex = snapshot.characters.findIndex((c) => c.selected);
    if (currentIndex < 0) return;

    const count = snapshot.characters.length;
    for (let offset = 1; offset <= count; offset += 1) {
      const candidate = snapshot.characters[(currentIndex + offset) % count];
      if (candidate.locked) continue;

      const result = this.characterController.select(candidate.id, snapshot.revision);
      if (result.ok) {
        console.log(
          `[dev] Character cycled to "${candidate.name}" (${candidate.id}). Restart to apply.`,
        );
      } else {
        console.warn(`[dev] Failed to select "${candidate.name}":`, result.reason);
      }
      return;
    }
  }

  private maybeEndRunForVictory(ctx: GameContext, runState: RunState): void {
    const durationSeconds = ctx.data.spawnCurves[0]?.durationSeconds;
    if (
      runState.status === 'active' &&
      durationSeconds !== undefined &&
      runState.timeMs >= durationSeconds * 1000
    ) {
      endRun(runState, 'won', ctx.bus);
    }
  }

  private updateHud(runState: RunState): void {
    if (!this.hudText || !this.player) {
      return;
    }

    const durationSeconds = this.getContext().data.spawnCurves[0]?.durationSeconds ?? 0;
    const remainingSeconds = Math.max(0, Math.ceil(durationSeconds - runState.timeMs / 1000));
    this.hudText.setText(
      [
        `Status: ${runState.status}`,
        `Pause: ${runState.pauseReason ?? 'none'}`,
        `Time: ${formatClock(runState.timeMs)} / ${formatClock(durationSeconds * 1000)}`,
        `Survive: ${remainingSeconds}s`,
        `Health: ${Math.ceil(this.player.health)} / ${Math.ceil(this.player.maxHealth)}`,
        `Level: ${runState.level}  XP: ${Math.floor(runState.xp)} / ${runState.xpToNext}`,
        `Kills: ${runState.kills}`,
        `Weapons: ${runState.equipped.map((weapon) => `${weapon.family} T${weapon.tier}`).join(', ')}`,
        'Move: WASD/arrows/drag',
        'Pause: P/Esc',
      ].join('\n'),
    );
  }

  private showOverlay(text: string): void {
    this.centerText?.setVisible(false);
    this.overlayText?.setText(text).setVisible(true);
  }

  private hideOverlay(): void {
    this.overlayText?.setVisible(false);
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

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
