import Phaser from 'phaser';
import { SceneKey } from '../engine/sceneKeys';
import { GAME_DATA_REGISTRY_KEY, loadGameData } from '../systems/validation';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.registry.set(GAME_DATA_REGISTRY_KEY, loadGameData());
    this.scene.start(SceneKey.Game);
  }
}
