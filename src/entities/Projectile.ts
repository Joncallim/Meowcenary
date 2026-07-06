import Phaser from 'phaser';
import type { Vec2 } from '../engine/vector';
import { normalize } from '../engine/vector';

export interface ProjectileSpawnOptions {
  speed: number;
  damage: number;
  range: number;
  pierce: number;
}

export class Projectile {
  readonly sprite: Phaser.GameObjects.Arc;
  active = false;
  damage = 0;
  private speed = 0;
  private range = 0;
  private pierce = 0;
  private traveled = 0;
  private readonly hitEnemyIds = new Set<number>();

  constructor(
    scene: Phaser.Scene,
    private readonly radius: number,
  ) {
    this.sprite = scene.add.circle(0, 0, radius, 0x8bd3ff).setDepth(3).setActive(false).setVisible(false);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(radius);
    this.body.enable = false;
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

  spawn(x: number, y: number, direction: Vec2, opts: ProjectileSpawnOptions): void {
    const normalized = normalize(direction);
    this.active = true;
    this.damage = opts.damage;
    this.speed = opts.speed;
    this.range = opts.range;
    this.pierce = Math.max(0, Math.floor(opts.pierce));
    this.traveled = 0;
    this.hitEnemyIds.clear();

    this.sprite.setPosition(x, y).setActive(true).setVisible(true);
    this.body.enable = true;
    this.body.setCircle(this.radius);
    this.body.setVelocity(normalized.x * this.speed, normalized.y * this.speed);
  }

  update(dtMs: number): void {
    if (!this.active) {
      return;
    }

    this.traveled += this.speed * (dtMs / 1000);
    if (this.traveled >= this.range) {
      this.reset();
    }
  }

  registerHit(enemyInstanceId: number): boolean {
    if (!this.active || this.hitEnemyIds.has(enemyInstanceId)) {
      return false;
    }

    this.hitEnemyIds.add(enemyInstanceId);
    const shouldReset = this.hitEnemyIds.size >= this.pierce + 1;
    if (shouldReset) {
      this.reset();
    }

    return true;
  }

  reset(): void {
    if (!this.active && !this.sprite.active) {
      return;
    }

    this.active = false;
    this.damage = 0;
    this.speed = 0;
    this.range = 0;
    this.pierce = 0;
    this.traveled = 0;
    this.hitEnemyIds.clear();
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.sprite.setActive(false).setVisible(false);
  }

  destroy(): void {
    this.active = false;
    this.sprite.destroy();
  }
}
