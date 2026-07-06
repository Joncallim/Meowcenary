import Phaser from 'phaser';
import { towards } from '../engine/vector';

export class Projectile {
  readonly sprite: Phaser.GameObjects.Arc;
  private traveled = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: { x: number; y: number },
    readonly damage: number,
    private readonly speed: number,
    private readonly range: number,
    radius: number,
  ) {
    this.sprite = scene.add.circle(x, y, radius, 0x8bd3ff).setDepth(3);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(radius);

    const direction = towards({ x, y }, target);
    this.body.setVelocity(direction.x * speed, direction.y * speed);
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

  update(dtMs: number): void {
    if (!this.active) {
      return;
    }

    this.traveled += this.speed * (dtMs / 1000);
    if (this.traveled >= this.range) {
      this.destroy();
    }
  }

  destroy(): void {
    if (this.sprite.active) {
      this.sprite.destroy();
    }
  }
}
