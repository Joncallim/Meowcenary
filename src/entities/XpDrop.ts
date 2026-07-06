import Phaser from 'phaser';

export class XpDrop {
  readonly sprite: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly amount: number, radius: number) {
    this.sprite = scene.add.circle(x, y, radius, 0x7dd3fc).setDepth(2);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(radius);
  }

  get active(): boolean {
    return this.sprite.active;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get body(): Phaser.Physics.Arcade.Body {
    return this.sprite.body as Phaser.Physics.Arcade.Body;
  }

  destroy(): void {
    if (this.sprite.active) {
      this.sprite.destroy();
    }
  }
}
