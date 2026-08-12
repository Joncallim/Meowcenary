import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from '../gameplay/runState';
import { endRun } from '../gameplay/runState';
import type { InputController } from '../systems/input';

export interface PlayerOptions {
  baseMaxHealth: number;
  baseMoveSpeed: number;
  invulnerabilityMs: number;
  spawnX: number;
  spawnY: number;
}

const BODY_COLOR = 0xf7c948;
const OUTLINE_COLOR = 0x0a0f14;
const EAR_OFFSET_X = 9;
const EAR_OFFSET_Y = 13;
const EAR_RADIUS = 4.5;
const SHADOW_RADIUS = 13;
const SHADOW_OFFSET_Y = 15;
const SHADOW_ALPHA = 0.32;

export class Player {
  readonly sprite: Phaser.GameObjects.Arc;
  health: number;
  private readonly leftEar: Phaser.GameObjects.Arc;
  private readonly rightEar: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Arc;
  private invulnerableMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputController,
    private readonly runState: RunState,
    private readonly bus: EventBus,
    private readonly options: PlayerOptions,
  ) {
    this.health = this.maxHealth;
    this.sprite = scene.add
      .circle(options.spawnX, options.spawnY, 14, BODY_COLOR)
      .setStrokeStyle(3, OUTLINE_COLOR, 1)
      .setDepth(5);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(14);
    this.body.setCollideWorldBounds(true);

    // Presentation layers: the body sprite stays the only physics body; ears
    // and shadow are display-only and are glued to the body in update().
    this.leftEar = scene.add
      .circle(options.spawnX - EAR_OFFSET_X, options.spawnY - EAR_OFFSET_Y, EAR_RADIUS, BODY_COLOR)
      .setStrokeStyle(2, OUTLINE_COLOR, 1)
      .setDepth(5);
    this.rightEar = scene.add
      .circle(options.spawnX + EAR_OFFSET_X, options.spawnY - EAR_OFFSET_Y, EAR_RADIUS, BODY_COLOR)
      .setStrokeStyle(2, OUTLINE_COLOR, 1)
      .setDepth(5);
    this.shadow = scene.add
      .circle(options.spawnX, options.spawnY + SHADOW_OFFSET_Y, SHADOW_RADIUS, 0x000000)
      .setAlpha(SHADOW_ALPHA)
      .setDepth(3);
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

  get bodyRadius(): number {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    return body?.halfWidth ?? 14;
  }

  get maxHealth(): number {
    return Math.max(1, this.runState.stats.resolve('maxHealth', this.options.baseMaxHealth));
  }

  update(dtMs: number): void {
    this.health = Math.min(this.health, this.maxHealth);
    this.syncPresentation();
    if (this.runState.status !== 'active') {
      this.body.setVelocity(0, 0);
      return;
    }

    if (this.invulnerableMs > 0 && Number.isFinite(dtMs) && dtMs > 0) {
      this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
      if (this.invulnerableMs === 0) {
        this.setBodyAlpha(1);
      }
    }

    const move = this.input.getMoveVector();
    const speed = Math.max(0, this.runState.stats.resolve('moveSpeed', this.options.baseMoveSpeed));
    this.body.setVelocity(move.x * speed, move.y * speed);
  }

  takeDamage(amount: number): void {
    if (
      this.runState.status !== 'active' ||
      this.invulnerableMs > 0 ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.invulnerableMs = Number.isFinite(this.options.invulnerabilityMs)
      ? Math.max(0, this.options.invulnerabilityMs)
      : 0;
    // Only tint while an invulnerability window is active; update() clears the tint
    // when the countdown reaches 0. Guarding here avoids a permanently stuck tint
    // when invulnerabilityMs is 0 (no i-frames), which update() would never restore.
    if (this.invulnerableMs > 0) {
      this.setBodyAlpha(0.45);
    }
    this.bus.emit('player:damaged', { amount, healthRemaining: this.health });

    if (this.health <= 0) {
      this.bus.emit('player:died', {});
      endRun(this.runState, 'lost', this.bus);
      this.body.setVelocity(0, 0);
    }
  }

  takeEnvironmentalDamage(amount: number): void {
    if (this.runState.status !== 'active' || !Number.isFinite(amount) || amount <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.bus.emit('player:damaged', { amount, healthRemaining: this.health });
    if (this.health <= 0) {
      this.bus.emit('player:died', {});
      endRun(this.runState, 'lost', this.bus);
      this.body.setVelocity(0, 0);
    }
  }

  destroy(): void {
    this.leftEar.destroy();
    this.rightEar.destroy();
    this.shadow.destroy();
    this.sprite.destroy();
  }

  /** Glue the display-only ears and ground shadow to the physics-driven body.
   *  Arcade physics integrates before the scene update, so reading the body
   *  position here is already the rendered frame's position. */
  private syncPresentation(): void {
    this.shadow.setPosition(this.x, this.y + SHADOW_OFFSET_Y);
    this.leftEar.setPosition(this.x - EAR_OFFSET_X, this.y - EAR_OFFSET_Y);
    this.rightEar.setPosition(this.x + EAR_OFFSET_X, this.y - EAR_OFFSET_Y);
  }

  /** Damage tint covers the body and ears together so the head reads as one
   *  silhouette; the ground shadow is never tinted. */
  private setBodyAlpha(alpha: number): void {
    this.sprite.setAlpha(alpha);
    this.leftEar.setAlpha(alpha);
    this.rightEar.setAlpha(alpha);
  }
}
