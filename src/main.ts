import Phaser from 'phaser';
import { RuntimeConfig } from './engine/config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import './styles.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#101820',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: RuntimeConfig.canvas.width,
    height: RuntimeConfig.canvas.height,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: RuntimeConfig.isDev,
    },
  },
  scene: [BootScene, GameScene],
};

// Exported as a minimal Slice 3 browser-smoke seam; gameplay ownership remains
// in the scene and systems rather than on a global window object.
export const game = new Phaser.Game(config);
