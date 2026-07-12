import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from '../gameplay/runState';
import { endRun } from '../gameplay/runState';
import type { InputController } from '../systems/input';

export interface PlayerOptions {
  baseMaxHealth: number;
  baseMoveSpeed: number;
  invulnerabilityMs: number;
}

export class Player {
  readonly sprite: Phaser.GameObjects.Arc;
  health: number;
  private invulnerableMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputController,
    private readonly runState: RunState,
    private readonly bus: EventBus,
    private readonly options: PlayerOptions,
  ) {
    const { width, height } = scene.scale;
    this.health = this.maxHealth;
    this.sprite = scene.add.circle(width / 2, height / 2, 14, 0xf7c948).setDepth(5);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(14);
    this.body.setCollideWorldBounds(true);
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

  get maxHealth(): number {
    return this.runState.stats.resolve('maxHealth', this.options.baseMaxHealth);
  }

  update(dtMs: number): void {
    if (this.runState.status !== 'active') {
      this.body.setVelocity(0, 0);
      return;
    }

    if (this.invulnerableMs > 0 && Number.isFinite(dtMs) && dtMs > 0) {
      this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
      if (this.invulnerableMs === 0) {
        this.sprite.setAlpha(1);
      }
    }

    const move = this.input.getMoveVector();
    const speed = this.runState.stats.resolve('moveSpeed', this.options.baseMoveSpeed);
    this.body.setVelocity(move.x * speed, move.y * speed);
  }

  takeDamage(amount: number): void {
    if (this.runState.status !== 'active' || this.invulnerableMs > 0 || amount <= 0) {
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.invulnerableMs = this.options.invulnerabilityMs;
    // Only tint while an invulnerability window is active; update() clears the tint
    // when the countdown reaches 0. Guarding here avoids a permanently stuck tint
    // when invulnerabilityMs is 0 (no i-frames), which update() would never restore.
    if (this.invulnerableMs > 0) {
      this.sprite.setAlpha(0.45);
    }
    this.bus.emit('player:damaged', { amount, healthRemaining: this.health });

    if (this.health <= 0) {
      this.bus.emit('player:died', {});
      endRun(this.runState, 'lost', this.bus);
      this.body.setVelocity(0, 0);
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
