import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from '../gameplay/runState';
import { endRun } from '../gameplay/runState';
import { PLAYER_BODY_RADIUS } from '../engine/bodyDimensions';
export { PLAYER_BODY_RADIUS } from '../engine/bodyDimensions';
import type { InputController } from '../systems/input';
import type { VisualArtBinding } from '../systems/types';
import { VisualDepth } from '../systems/visualDepths';
import { PlaceholderView, createAnimatedActorView, type ActorView } from './actorView';

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
  private readonly view: ActorView;
  private invulnerableMs = 0;
  private facing: 1 | -1 = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputController,
    private readonly runState: RunState,
    private readonly bus: EventBus,
    private readonly options: PlayerOptions,
    art?: Readonly<VisualArtBinding>,
  ) {
    this.health = this.maxHealth;
    this.sprite = scene.add
      .circle(options.spawnX, options.spawnY, PLAYER_BODY_RADIUS, BODY_COLOR)
      .setStrokeStyle(3, OUTLINE_COLOR, 1)
      .setDepth(VisualDepth.player);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(PLAYER_BODY_RADIUS);
    this.body.setCollideWorldBounds(true);

    // Presentation layers: the body sprite stays the only physics body; ears
    // and shadow are display-only and are glued to the body in update().
    const leftEar = scene.add
      .circle(options.spawnX - EAR_OFFSET_X, options.spawnY - EAR_OFFSET_Y, EAR_RADIUS, BODY_COLOR)
      .setStrokeStyle(2, OUTLINE_COLOR, 1)
      .setDepth(VisualDepth.player);
    const rightEar = scene.add
      .circle(options.spawnX + EAR_OFFSET_X, options.spawnY - EAR_OFFSET_Y, EAR_RADIUS, BODY_COLOR)
      .setStrokeStyle(2, OUTLINE_COLOR, 1)
      .setDepth(VisualDepth.player);
    const shadow = scene.add
      .circle(options.spawnX, options.spawnY + SHADOW_OFFSET_Y, SHADOW_RADIUS, 0x000000)
      .setAlpha(SHADOW_ALPHA)
      .setDepth(VisualDepth.lowDecoration);
    this.view = createAnimatedActorView(
      scene,
      this.sprite,
      { node: shadow, dy: SHADOW_OFFSET_Y },
      art,
      VisualDepth.player,
    ) ?? new PlaceholderView(
      this.sprite,
      [
        { node: leftEar, dx: -EAR_OFFSET_X, dy: -EAR_OFFSET_Y, flashes: true },
        { node: rightEar, dx: EAR_OFFSET_X, dy: -EAR_OFFSET_Y, flashes: true },
      ],
      { node: shadow, dy: SHADOW_OFFSET_Y },
    );
    if (this.view instanceof PlaceholderView === false) {
      leftEar.destroy();
      rightEar.destroy();
    }
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
    return body?.halfWidth ?? PLAYER_BODY_RADIUS;
  }

  get maxHealth(): number {
    return Math.max(1, this.runState.stats.resolve('maxHealth', this.options.baseMaxHealth));
  }

  update(dtMs: number): void {
    this.health = Math.min(this.health, this.maxHealth);
    const move = this.input.getMoveVector();
    if (move.x !== 0) this.facing = move.x < 0 ? -1 : 1;
    this.view.update(this.currentPose(move));
    if (this.runState.status !== 'active') {
      this.body.setVelocity(0, 0);
      return;
    }

    if (this.invulnerableMs > 0 && Number.isFinite(dtMs) && dtMs > 0) {
      this.invulnerableMs = Math.max(0, this.invulnerableMs - dtMs);
      if (this.invulnerableMs === 0) {
        this.view.update(this.currentPose());
      }
    }

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
      this.view.update(this.currentPose());
    }
    this.view.playOneShot(this.health <= 0 ? 'defeat' : 'hurt');
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
    this.view.playOneShot(this.health <= 0 ? 'defeat' : 'hurt');
    this.bus.emit('player:damaged', { amount, healthRemaining: this.health });
    if (this.health <= 0) {
      this.bus.emit('player:died', {});
      endRun(this.runState, 'lost', this.bus);
      this.body.setVelocity(0, 0);
    }
  }

  destroy(): void {
    this.view.destroy();
    this.sprite.destroy();
  }

  /** Glue the display-only ears and ground shadow to the physics-driven body.
   *  Arcade physics integrates before the scene update, so reading the body
   *  position here is already the rendered frame's position. */
  private currentPose(move = this.input.getMoveVector()) {
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      moving: this.runState.status === 'active' && (move.x !== 0 || move.y !== 0),
      alpha: this.invulnerableMs > 0 ? 0.45 : 1,
    } as const;
  }
}
