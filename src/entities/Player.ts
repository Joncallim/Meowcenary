import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from '../gameplay/runState';
import { endRun } from '../gameplay/runState';
import { PLAYER_BODY_RADIUS } from '../engine/bodyDimensions';
export { PLAYER_BODY_RADIUS } from '../engine/bodyDimensions';
import type { InputController } from '../systems/input';
import type { VisualArtBinding } from '../systems/types';
import { VisualDepth } from '../systems/visualDepths';
import {
  ACTOR_VISUAL_SCALE_BY_KIND,
  PlaceholderView,
  createAnimatedActorView,
  type ActorViewFallbackOptions,
  type ActorView,
} from './actorView';

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
const PLAYER_VISUAL_FACTOR = ACTOR_VISUAL_SCALE_BY_KIND.character;

export class Player {
  readonly sprite: Phaser.GameObjects.Arc;
  health: number;
  private readonly view: ActorView;
  private contactInvulnerableMs = 0;
  private abilityInvulnerableMs = 0;
  private facing: 1 | -1 = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputController,
    private readonly runState: RunState,
    private readonly bus: EventBus,
    private readonly options: PlayerOptions,
    art?: Readonly<VisualArtBinding>,
    fallbackOptions?: Readonly<ActorViewFallbackOptions>,
  ) {
    this.health = this.maxHealth;
    this.sprite = scene.add
      .circle(options.spawnX, options.spawnY, PLAYER_BODY_RADIUS, BODY_COLOR)
      .setStrokeStyle(3, OUTLINE_COLOR, 1)
      .setDepth(VisualDepth.player);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(PLAYER_BODY_RADIUS);
    this.body.setCollideWorldBounds(true);
    // The Arcade body is deliberately presentation-free: fallback geometry
    // below is display-only, so enlarging actors cannot change collisions.
    this.sprite.setVisible(false);

    const shadow = scene.add
      .circle(
        options.spawnX,
        options.spawnY + SHADOW_OFFSET_Y * PLAYER_VISUAL_FACTOR,
        SHADOW_RADIUS * PLAYER_VISUAL_FACTOR,
        0x000000,
      )
      .setAlpha(SHADOW_ALPHA)
      .setDepth(VisualDepth.lowDecoration);
    const animatedView = createAnimatedActorView(
      scene,
      this.sprite,
      { node: shadow, dy: SHADOW_OFFSET_Y * PLAYER_VISUAL_FACTOR },
      art,
      VisualDepth.player,
      fallbackOptions,
    );
    if (animatedView) {
      this.view = animatedView;
    } else {
      const visualBody = scene.add
        .circle(options.spawnX, options.spawnY, PLAYER_BODY_RADIUS * PLAYER_VISUAL_FACTOR, BODY_COLOR)
        .setStrokeStyle(3, OUTLINE_COLOR, 1)
        .setDepth(VisualDepth.player);
      const leftEar = scene.add
        .circle(
          options.spawnX - EAR_OFFSET_X * PLAYER_VISUAL_FACTOR,
          options.spawnY - EAR_OFFSET_Y * PLAYER_VISUAL_FACTOR,
          EAR_RADIUS * PLAYER_VISUAL_FACTOR,
          BODY_COLOR,
        )
        .setStrokeStyle(2, OUTLINE_COLOR, 1)
        .setDepth(VisualDepth.player);
      const rightEar = scene.add
        .circle(
          options.spawnX + EAR_OFFSET_X * PLAYER_VISUAL_FACTOR,
          options.spawnY - EAR_OFFSET_Y * PLAYER_VISUAL_FACTOR,
          EAR_RADIUS * PLAYER_VISUAL_FACTOR,
          BODY_COLOR,
        )
        .setStrokeStyle(2, OUTLINE_COLOR, 1)
        .setDepth(VisualDepth.player);
      this.view = new PlaceholderView(
        this.sprite,
        [
          { node: visualBody, dx: 0, dy: 0, flashes: true },
          {
            node: leftEar,
            dx: -EAR_OFFSET_X * PLAYER_VISUAL_FACTOR,
            dy: -EAR_OFFSET_Y * PLAYER_VISUAL_FACTOR,
            flashes: true,
          },
          {
            node: rightEar,
            dx: EAR_OFFSET_X * PLAYER_VISUAL_FACTOR,
            dy: -EAR_OFFSET_Y * PLAYER_VISUAL_FACTOR,
            flashes: true,
          },
        ],
        { node: shadow, dy: SHADOW_OFFSET_Y * PLAYER_VISUAL_FACTOR },
      );
    }
  }

  /** Actual rendered actor footprint; the hidden Arcade proxy is not presentation. */
  writePresentationBounds(output: Phaser.Geom.Rectangle): void {
    this.view.writeWorldBounds(output);
  }

  /** Viewport framing includes every player layer; HUD readability continues
   * to use the base actor footprint above, not a shadow-only overlap. */
  writeCompletePresentationBounds(output: Phaser.Geom.Rectangle): void {
    this.view.writeCompleteWorldBounds(output);
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

    const wasInvulnerable = this.hasAnyInvulnerability();
    if (Number.isFinite(dtMs) && dtMs > 0 && wasInvulnerable) {
      this.contactInvulnerableMs = Math.max(0, this.contactInvulnerableMs - dtMs);
      this.abilityInvulnerableMs = Math.max(0, this.abilityInvulnerableMs - dtMs);
      if (wasInvulnerable && !this.hasAnyInvulnerability()) this.view.update(this.currentPose());
    }

    const speed = Math.max(0, this.runState.stats.resolve('moveSpeed', this.options.baseMoveSpeed));
    this.body.setVelocity(move.x * speed, move.y * speed);
  }

  takeDamage(amount: number): void {
    if (
      this.runState.status !== 'active' ||
      this.hasAnyInvulnerability() ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.contactInvulnerableMs = Number.isFinite(this.options.invulnerabilityMs)
      ? Math.max(0, this.options.invulnerabilityMs)
      : 0;
    // Only tint while an invulnerability window is active; update() clears the tint
    // when the countdown reaches 0. Guarding here avoids a permanently stuck tint
    // when invulnerabilityMs is 0 (no i-frames), which update() would never restore.
    if (this.hasAnyInvulnerability()) {
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

  /** Active abilities use the same authoritative health/invulnerability state
   * as combat; they do not bypass run lifecycle checks. */
  heal(amount: number): number {
    if (this.runState.status !== 'active' || !Number.isFinite(amount) || amount <= 0) return 0;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  grantInvulnerability(durationMs: number): void {
    if (this.runState.status !== 'active' || !Number.isFinite(durationMs) || durationMs <= 0) return;
    this.abilityInvulnerableMs = Math.max(this.abilityInvulnerableMs, durationMs);
    this.view.update(this.currentPose());
  }

  takeEnvironmentalDamage(amount: number): void {
    // Environmental hazards use this separate entry point so they can apply
    // continuous damage without creating combat hit-stun. They must still
    // respect the same explicit invulnerability window granted by abilities
    // (for example Shield Flicker), otherwise Forge hazards bypass the ability.
    if (
      this.runState.status !== 'active' ||
      this.abilityInvulnerableMs > 0 ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) return;
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
      alpha: this.hasAnyInvulnerability() ? 0.45 : 1,
    } as const;
  }

  private hasAnyInvulnerability(): boolean {
    return this.contactInvulnerableMs > 0 || this.abilityInvulnerableMs > 0;
  }
}
