import Phaser from 'phaser';
import type { Vec2 } from '../engine/vector';
import { normalize } from '../engine/vector';
import type { VisualArtBinding } from '../systems/types';
import { visualAnimationKey } from '../systems/visualArt';
import { VisualDepth } from '../systems/visualDepths';
import { createStaticArtSprite } from './actorView';

export interface ProjectileSpawnOptions {
  speed: number;
  damage: number;
  range: number;
  pierce: number;
  /** Presentation-only (Epic 17): the firing weapon's identity, carried so
   *  `projectile:hit` can key impact cues/audio the same way `weapon:fired`
   *  already does. Never read by damage, pooling, or hit resolution. */
  weaponId: string;
  family: string;
  tier: number;
}

export class Projectile {
  readonly sprite: Phaser.GameObjects.Arc;
  active = false;
  damage = 0;
  weaponId = '';
  family = '';
  tier = 0;
  private readonly glow: Phaser.GameObjects.Arc;
  private readonly artSprite?: Phaser.GameObjects.Sprite;
  private speed = 0;
  private range = 0;
  private pierce = 0;
  private traveled = 0;
  private readonly hitEnemyIds = new Set<number>();

  constructor(
    scene: Phaser.Scene,
    private readonly radius: number,
    private readonly art?: Readonly<VisualArtBinding>,
  ) {
    this.sprite = scene.add.circle(0, 0, radius, 0x8bd3ff)
      .setDepth(VisualDepth.projectile)
      .setActive(false)
      .setVisible(false);
    // Display-only soft halo, constructed once per pooled projectile and
    // toggled with the body. No physics body.
    this.glow = scene.add.circle(0, 0, radius + 3, 0x8bd3ff)
      .setAlpha(0.22)
      .setDepth(VisualDepth.dropBody)
      .setActive(false)
      .setVisible(false);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(radius);
    this.body.enable = false;
    this.artSprite = createStaticArtSprite(scene, art, VisualDepth.projectile);
    if (this.artSprite) {
      this.sprite.setVisible(false);
      this.glow.setVisible(false);
    }
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
    this.weaponId = opts.weaponId;
    this.family = opts.family;
    this.tier = opts.tier;
    this.traveled = 0;
    this.hitEnemyIds.clear();

    this.sprite.setPosition(x, y).setActive(true).setVisible(!this.artSprite);
    this.glow.setPosition(x, y).setActive(true).setVisible(!this.artSprite);
    this.artSprite?.setPosition(x, y).setActive(true).setVisible(true);
    this.body.enable = true;
    this.body.setCircle(this.radius);
    this.body.setVelocity(normalized.x * this.speed, normalized.y * this.speed);
    if (this.artSprite) {
      this.artSprite.stop().setFrame(0).setAlpha(1);
      if (this.art?.clips?.fly) this.artSprite.play(visualAnimationKey(this.art.id, 'fly'));
      this.artSprite.setRotation(Math.atan2(normalized.y, normalized.x));
    }
  }

  update(dtMs: number): void {
    if (!this.active || !Number.isFinite(dtMs) || dtMs <= 0) {
      return;
    }

    // Arcade physics integrates before the scene update, so the body position
    // is the rendered frame's position — the halo follows exactly.
    this.glow.setPosition(this.sprite.x, this.sprite.y);
    this.artSprite?.setPosition(this.sprite.x, this.sprite.y);
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
    this.weaponId = '';
    this.family = '';
    this.tier = 0;
    this.traveled = 0;
    this.hitEnemyIds.clear();
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.glow.setActive(false).setVisible(false);
    this.artSprite?.stop().setFrame(0).setRotation(0).setAlpha(1).setActive(false).setVisible(false);
    this.sprite.setActive(false).setVisible(false);
  }

  destroy(): void {
    this.active = false;
    this.glow.destroy();
    this.artSprite?.destroy();
    this.sprite.destroy();
  }
}
