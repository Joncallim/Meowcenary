import Phaser from 'phaser';
import { GAME_CONTEXT_REGISTRY_KEY, type GameContext } from '../engine/context';
import { SceneKey } from '../engine/sceneKeys';
import type { System } from '../engine/system';
import { AudioManager } from '../systems/audio';
import { DebugOverlay } from '../systems/debug';
import { InputController } from '../systems/input';

export class GameScene extends Phaser.Scene {
  private audioManager?: AudioManager;
  private debugOverlay?: DebugOverlay;
  private inputController?: InputController;
  private systems: System[] = [];

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    const { width, height } = this.scale;
    const ctx = this.getContext();
    this.inputController = new InputController(this);
    this.debugOverlay = new DebugOverlay(this);
    this.audioManager = new AudioManager(this);
    this.audioManager.setMuted(ctx.settings.muted);
    this.audioManager.setVolume(ctx.settings.sfxVolume);
    this.systems = [this.inputController, this.audioManager];

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.add
      .text(width / 2, height / 2 - 48, 'Meowcenary', {
        color: '#f7f1d5',
        fontFamily: 'Inter, sans-serif',
        fontSize: '36px',
        fontStyle: '700',
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height / 2 + 12,
        [
          `Data loaded: ${ctx.data.weapons.length} weapons`,
          `${ctx.data.enemies.length} enemies`,
          `${ctx.data.upgrades.length} upgrades`,
          `${ctx.data.spawnCurves.length} spawn curves`,
        ].join(', '),
        {
          align: 'center',
          color: '#a8d8ff',
          fontFamily: 'Inter, sans-serif',
          fontSize: '16px',
          wordWrap: { width: width - 48 },
        },
      )
      .setOrigin(0.5);
  }

  update(_time: number, delta: number): void {
    this.systems.forEach((system) => {
      system.update(delta);
    });

    const move = this.inputController?.getMoveVector() ?? { x: 0, y: 0 };
    const pointer = this.inputController?.getPointer();
    this.debugOverlay?.update([
      `dtMs: ${delta.toFixed(2)}`,
      `Move: ${move.x.toFixed(2)}, ${move.y.toFixed(2)}`,
      `Pointer: ${pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}` : 'none'}`,
    ]);
  }

  private handleShutdown(): void {
    this.systems.forEach((system) => {
      system.destroy();
    });
    this.systems = [];
    this.debugOverlay?.destroy();
    this.inputController = undefined;
    this.debugOverlay = undefined;
    this.audioManager = undefined;
  }

  private getContext(): GameContext {
    const ctx = this.registry.get(GAME_CONTEXT_REGISTRY_KEY) as GameContext | undefined;
    if (!ctx) {
      throw new Error('GameContext missing from Phaser registry');
    }

    return ctx;
  }
}
