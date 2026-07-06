import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { AudioManager } from '../systems/audio';
import { DebugOverlay } from '../systems/debug';
import { InputController } from '../systems/input';
import { LocalStorageAdapter, SaveManager, type SaveDataV1 } from '../systems/save';
import type { GameData } from '../systems/types';
import { GAME_DATA_REGISTRY_KEY, loadGameData } from '../systems/validation';

export class GameScene extends Phaser.Scene {
  private audioManager?: AudioManager;
  private debugOverlay?: DebugOverlay;
  private inputController?: InputController;
  private saveData?: SaveDataV1;
  private saveManager?: SaveManager;

  constructor() {
    super(SceneKey.Game);
  }

  create(): void {
    const { width, height } = this.scale;
    const gameData: GameData = this.registry.get(GAME_DATA_REGISTRY_KEY) ?? loadGameData();
    this.inputController = new InputController(this);
    this.saveManager = new SaveManager(new LocalStorageAdapter());
    this.saveData = this.saveManager.load();
    this.debugOverlay = new DebugOverlay(this);
    this.audioManager = new AudioManager(this);
    this.audioManager.setMuted(this.saveData.settings.muted);
    this.audioManager.setVolume(this.saveData.settings.sfxVolume);

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
          `Data loaded: ${gameData.weapons.length} weapons`,
          `${gameData.enemies.length} enemies`,
          `${gameData.upgrades.length} upgrades`,
          `${gameData.spawnCurves.length} spawn curves`,
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

  update(): void {
    this.inputController?.update();

    const move = this.inputController?.getMoveVector() ?? { x: 0, y: 0 };
    const pointer = this.inputController?.getPointer();
    this.debugOverlay?.update([
      `Move: ${move.x.toFixed(2)}, ${move.y.toFixed(2)}`,
      `Pointer: ${pointer ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)}` : 'none'}`,
    ]);
  }

  private handleShutdown(): void {
    this.inputController?.destroy();
    this.debugOverlay?.destroy();
    this.audioManager?.destroy();
    this.inputController = undefined;
    this.debugOverlay = undefined;
    this.audioManager = undefined;
  }
}
