import Phaser from 'phaser';
import weapons from '../data/weapons.json';
import enemies from '../data/enemies.json';
import upgrades from '../data/upgrades.json';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create(): void {
    const { width, height } = this.scale;

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
        `Data loaded: ${weapons.length} weapons, ${enemies.length} enemies, ${upgrades.length} upgrades`,
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
}
