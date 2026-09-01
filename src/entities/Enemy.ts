import { deepFreeze } from '../engine/freeze';
import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { ENEMY_BODY_RADIUS } from '../engine/bodyDimensions';
export { ENEMY_BODY_RADIUS } from '../engine/bodyDimensions';
import type { Vec2 } from '../engine/vector';
import { enemyBehaviorFor, type RegisteredEnemyBehavior } from '../gameplay/enemyBehaviors';
import { executeBossActions, type BossActionEvent } from '../gameplay/bossActions';
import type { ChargerEnvironment } from '../gameplay/enemyMovement';
import type { ResolvedEnemyDefinition } from '../systems/types';
import type { VisualArtBinding } from '../systems/types';
import { VisualDepth } from '../systems/visualDepths';
import type { Player } from './Player';
import {
  ACTOR_VISUAL_SCALE_BY_KIND,
  PlaceholderView,
  createAnimatedActorView,
  type ActorView,
} from './actorView';

let nextEnemyInstanceId = 1;

const OUTLINE_COLOR = 0x0a0f14;
const SHADOW_RADIUS = 12;
const SHADOW_OFFSET_Y = 14;
const SHADOW_ALPHA = 0.28;
const ENEMY_VISUAL_FACTOR = ACTOR_VISUAL_SCALE_BY_KIND.enemy;
/** Epic 17 (D7): Trash Brute's "lower-frequency" landing-pulse cadence — at
 *  its 42px/s pursuit speed this reads roughly once per second, distinctly
 *  slower than a chaser/charger's footfall would be. */
const HEAVY_STEP_INTERVAL_PX = 48;

/** Epic 21: presentation (accent/color) and movement dispatch come from the
 *  behavior registry — one registration per archetype, no switch chains. */
function accentStyle(def: Readonly<ResolvedEnemyDefinition>): RegisteredEnemyBehavior['accent'] {
  return enemyBehaviorFor(def).accent;
}

export type EnemyState = 'idle' | 'pursuing' | 'winding' | 'attacking' | 'dead';

export interface EnemyInstance {
  readonly instanceId: number;
  readonly defId: string;
  readonly archetype: ResolvedEnemyDefinition['archetype'];
  readonly pos: Vec2;
  health: number;
  readonly maxHealth: number;
  readonly xpValue: number;
  state: EnemyState;
  stateTimerMs: number;
}

export class Enemy implements EnemyInstance {
  readonly instanceId = nextEnemyInstanceId;
  readonly sprite: Phaser.GameObjects.Arc;
  health: number;
  readonly maxHealth: number;
  readonly definition: Readonly<ResolvedEnemyDefinition>;
  state: EnemyState = 'pursuing';
  stateTimerMs = 0;
  private readonly view: ActorView;
  private presentationDestroyed = false;
  private dashDirection: Vec2 = { x: 0, y: 0 };
  private dashOrigin: Vec2 = { x: 0, y: 0 };
  private facing: 1 | -1 = 1;
  private presentationPos: Vec2 | undefined;
  /** Epic 17 (D7): distance accumulated since the last Trash Brute landing
   *  pulse — a movement-cadence accumulator, not a duplicate of the
   *  winding-telegraph's stateTimerMs (D7 forbids only the latter). */
  private heavyStepAccumPx = 0;
  /** The base moveset is phase 0.  Higher phases are derived from health,
   * while this counter only prevents duplicate threshold facts. */
  private announcedBossPhase = 0;
  private dashHitEmitted = false;

  constructor(
    scene: Phaser.Scene,
    definition: ResolvedEnemyDefinition,
    x: number,
    y: number,
    private readonly bus: EventBus,
    art?: Readonly<VisualArtBinding>,
    private readonly environment?: ChargerEnvironment,
  ) {
    nextEnemyInstanceId += 1;
    this.definition = deepFreeze(structuredClone(definition));
    this.health = this.definition.health;
    this.maxHealth = this.definition.health;
    this.sprite = scene.add.circle(x, y, ENEMY_BODY_RADIUS, enemyBehaviorFor(this.definition).color)
      .setStrokeStyle(3, OUTLINE_COLOR, 1)
      .setDepth(VisualDepth.enemy);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(ENEMY_BODY_RADIUS);
    // The Arcade body owns collision only. Enlarged fallback art below is a
    // display-only follower, never a second body.
    this.sprite.setVisible(false);

    const shadow = scene.add.circle(x, y, SHADOW_RADIUS * ENEMY_VISUAL_FACTOR, 0x000000)
      .setAlpha(SHADOW_ALPHA)
      .setDepth(VisualDepth.lowDecoration);
    const animatedView = createAnimatedActorView(
      scene,
      this.sprite,
      { node: shadow, dy: SHADOW_OFFSET_Y * ENEMY_VISUAL_FACTOR },
      art,
      VisualDepth.enemy,
    );
    if (animatedView) {
      this.view = animatedView;
    } else {
      const visualBody = scene.add
        .circle(x, y, ENEMY_BODY_RADIUS * ENEMY_VISUAL_FACTOR, enemyBehaviorFor(this.definition).color)
        .setStrokeStyle(3, OUTLINE_COLOR, 1)
        .setDepth(VisualDepth.enemy);
      const accent = accentStyle(this.definition);
      const accentNode = scene.add
        .circle(x, y, accent.radius * ENEMY_VISUAL_FACTOR, accent.fill)
        .setDepth(VisualDepth.enemy);
      if (accent.stroke) {
        accentNode.setStrokeStyle(accent.stroke.width, accent.stroke.color, accent.stroke.alpha);
      }
      this.view = new PlaceholderView(
        this.sprite,
        [
          { node: visualBody, dx: 0, dy: 0, flashes: false },
          { node: accentNode, dx: 0, dy: 0, flashes: false, telegraphTint: true },
        ],
        { node: shadow, dy: SHADOW_OFFSET_Y * ENEMY_VISUAL_FACTOR },
      );
    }
    this.syncPresentation(false);
  }

  get active(): boolean {
    return this.sprite.active;
  }

  get id(): number {
    return this.instanceId;
  }

  get defId(): string {
    return this.definition.id;
  }

  get archetype(): ResolvedEnemyDefinition['archetype'] {
    return this.definition.archetype;
  }

  get xpValue(): number {
    return this.definition.xpValue;
  }

  get scrapValue(): number {
    return this.definition.scrapValue;
  }

  get pos(): Vec2 {
    return { x: this.x, y: this.y };
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

  update(player: Player, dtMs: number): void {
    if (!this.active || !player.active) {
      return;
    }
    if (!Number.isFinite(dtMs) || dtMs <= 0) {
      this.body.setVelocity(0, 0);
      this.syncPresentation(false);
      return;
    }

    const phase = this.resolveBossPhase();
    if (phase.index > this.announcedBossPhase) {
      for (let index = this.announcedBossPhase + 1; index <= phase.index; index += 1) {
        this.bus.emit('enemy:boss-phase', {
          instanceId: this.instanceId,
          enemyId: this.defId,
          phase: index,
          healthFraction: this.health / this.maxHealth,
        });
      }
      this.announcedBossPhase = phase.index;
    }
    const behavior = enemyBehaviorFor(phase.definition);
    const result = behavior.step({
      pos: this.pos,
      target: { x: player.x, y: player.y },
      definition: phase.definition,
      dtMs,
      env: this.environment,
      state: this.state,
      stateTimerMs: this.stateTimerMs,
      dashDirection: this.dashDirection,
      dashOrigin: this.dashOrigin,
    });

    // Epic 17 (D7): fires once at the pursuing/winding → attacking edge,
    // not every frame — FeedbackSystem owns the heavy-motion gate and the
    // pooled trail dots, Enemy just reports the moment.
    if (result.dashSweep !== undefined && this.state !== 'attacking') this.dashHitEmitted = false;
    this.state = result.state;
    this.stateTimerMs = result.stateTimerMs;
    this.dashDirection = result.dashDirection;
    this.dashOrigin = result.dashOrigin;
    if (result.enteredAttack) this.dashHitEmitted = false;
    this.applyPosition(result.pos, dtMs, behavior.immediate);
    this.emitBossDashHit(player, result.dashSweep);
    if (result.enteredAttack) {
      if ('summon' in phase.definition && phase.definition.summon) {
        this.bus.emit('enemy:summon', {
          sourceEnemyId: this.defId,
          enemyId: phase.definition.summon.enemyId,
          count: phase.definition.summon.count,
          maxActive: phase.definition.summon.maxActive,
          x: this.x,
          y: this.y,
        });
      }
      const attackContext = {
        definition: phase.definition,
        enemyId: this.defId,
        pos: this.pos,
        target: { x: player.x, y: player.y },
        dashDirection: this.dashDirection,
      };
      for (const event of behavior.attackEvents(attackContext)) {
        this.emitAttackEvent(event);
      }
      for (const event of executeBossActions(phase.actions, {
        enemyId: this.defId,
        damage: this.definition.damage,
        pos: this.pos,
        target: { x: player.x, y: player.y },
      })) {
        this.emitBossActionEvent(event);
      }
    }
    // Charger/boss dashes use body.reset, so velocity never reflects motion:
    // the run clip is driven by actual displacement (dash or pursuit).
    this.syncPresentation(this.state === 'attacking', player);
  }

  takeDamage(amount: number, source?: Readonly<Vec2>): boolean {
    if (this.state === 'dead' || !this.active || !Number.isFinite(amount) || amount <= 0) {
      return false;
    }

    if (this.blocksIncomingDamage(source)) {
      this.bus.emit('enemy:shield-blocked', { instanceId: this.instanceId, enemyId: this.defId, x: this.x, y: this.y });
      return false;
    }

    const x = this.x;
    const y = this.y;
    // amount is capped at remaining health: the event payload reports the
    // health actually removed, so dev-tooling meters (Epic 11 §7) never
    // overcount overkill from high-damage hits on low-health enemies.
    const applied = Math.min(amount, this.health);
    const nextHealth = this.health - applied;
    const killed = nextHealth === 0;

    this.health = nextHealth;
    if (killed) {
      this.state = 'dead';
      this.stateTimerMs = 0;
    }

    if (!killed) this.view.playOneShot('hurt');

    this.bus.emit('enemy:damaged', {
      instanceId: this.instanceId,
      amount: applied,
      x,
      y,
    });

    if (!killed) {
      return false;
    }

    if (this.definition.splitOnDeath) {
      this.bus.emit('enemy:summon', {
        sourceEnemyId: this.defId,
        enemyId: this.definition.splitOnDeath.enemyId,
        count: this.definition.splitOnDeath.count,
        maxActive: this.definition.splitOnDeath.maxActive,
        x,
        y,
      });
    }

    this.destroy();
    return true;
  }

  destroy(): void {
    this.health = 0;
    this.state = 'dead';
    this.stateTimerMs = 0;
    this.destroyPresentation();

    if (!this.sprite.active) {
      return;
    }

    const body = this.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setVelocity(0, 0);
    this.sprite.destroy();
  }

  /** Glue the display-only accent and ground shadow to the physics-driven
   *  body. Arcade physics integrates before the scene update, so the body
   *  position read here is the rendered frame's position.
   *
   *  Facing rules (Epic 13 §7.5): pursuit and idle face the velocity x;
   *  winding is stationary but faces the target; attacking faces the dash
   *  direction x. `moving` is the explicit state signal merged with observed
   *  displacement so chargers (body.reset application, zero velocity) still
   *  show the run clip while pursuing or dashing. */
  private syncPresentation(moving: boolean, target?: Player): void {
    if (this.state === 'attacking' && this.dashDirection.x !== 0) {
      this.facing = this.dashDirection.x < 0 ? -1 : 1;
    } else if (this.state === 'winding' && target) {
      const horizontal = target.x - this.x;
      if (horizontal !== 0) this.facing = horizontal < 0 ? -1 : 1;
    } else if (this.body.velocity.x !== 0) {
      this.facing = this.body.velocity.x < 0 ? -1 : 1;
    }
    const current = { x: this.x, y: this.y };
    const distanceSincePresentation = this.presentationPos
      ? Math.hypot(current.x - this.presentationPos.x, current.y - this.presentationPos.y)
      : 0;
    const moved = distanceSincePresentation > 0.01;
    this.presentationPos = current;
    this.accumulateHeavyStep(distanceSincePresentation);
    const telegraph = this.telegraphProgress();
    this.view.update({
      x: current.x,
      y: current.y,
      facing: this.facing,
      moving: moving || moved,
      alpha: 1,
      ...(telegraph !== undefined ? { telegraph } : {}),
    });
  }

  /** Epic 17 (D7): 0→1 as the winding charge completes, derived purely from
   *  the already-authoritative stateTimerMs (which counts DOWN from
   *  attack.telegraphMs) — never a second countdown. */
  private telegraphProgress(): number | undefined {
    if (this.state !== 'winding') {
      return undefined;
    }
    const telegraphMs = enemyBehaviorFor(this.definition).telegraphMs(this.definition);
    if (!telegraphMs || telegraphMs <= 0) {
      return undefined;
    }
    const remaining = Math.min(telegraphMs, Math.max(0, this.stateTimerMs));
    return 1 - remaining / telegraphMs;
  }

  /** Epic 17 (D7): Trash Brute-only landing pulse, cadenced by *actually
   *  resolved* distance travelled (the same current-vs-presentationPos delta
   *  syncPresentation already computes for the moving flag) rather than a
   *  timer or the pursuit branch's unobstructed chaseStep target — so a
   *  Brute stuck against an obstacle correctly stops pulsing instead of
   *  reading as still walking. Reports the moment to FeedbackSystem, which
   *  owns the heavy-motion gate and the pooled cue. */
  private accumulateHeavyStep(distancePx: number): void {
    if (!enemyBehaviorFor(this.definition).heavyStep || this.state !== 'pursuing' || !Number.isFinite(distancePx)) {
      return;
    }
    this.heavyStepAccumPx += distancePx;
    if (this.heavyStepAccumPx < HEAVY_STEP_INTERVAL_PX) {
      return;
    }
    this.heavyStepAccumPx -= HEAVY_STEP_INTERVAL_PX;
    this.bus.emit('enemy:heavyStep', { x: this.x, y: this.y });
  }

  private destroyPresentation(): void {
    if (this.presentationDestroyed) {
      return;
    }
    this.presentationDestroyed = true;
    this.view.destroy();
  }

  private blocksIncomingDamage(source: Readonly<Vec2> | undefined): boolean {
    if (this.definition.archetype !== 'shielded' || !source) return false;
    const dx = source.x - this.x;
    const dy = source.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance === 0) return false;
    const facingAngle = this.facing === 1 ? 0 : Math.PI;
    const incomingAngle = Math.atan2(dy, dx);
    const delta = Math.atan2(Math.sin(incomingAngle - facingAngle), Math.cos(incomingAngle - facingAngle));
    return Math.abs(delta) <= (this.definition.shieldArcDeg * Math.PI) / 360;
  }

  private resolveBossPhase(): { definition: Readonly<ResolvedEnemyDefinition>; index: number; actions: readonly import('../systems/types').BossActionDefinition[] } {
    if (this.definition.archetype !== 'boss' || !this.definition.phases?.length) {
      return { definition: this.definition, index: 0, actions: this.definition.archetype === 'boss' ? this.definition.actions : [] };
    }
    const healthFraction = this.health / this.maxHealth;
    let phaseIndex = 0;
    let selected = undefined as (typeof this.definition.phases)[number] | undefined;
    for (const phase of this.definition.phases) {
      if (healthFraction <= phase.atHealthFraction) {
        phaseIndex += 1;
        selected = phase;
      }
    }
    if (!selected) return { definition: this.definition, index: 0, actions: this.definition.actions };
    return {
      definition: { ...this.definition, attack: selected.attack },
      index: phaseIndex,
      // Phase actions add to, rather than silently replace, the base moveset.
      actions: [...this.definition.actions, ...selected.actions],
    };
  }

  private emitAttackEvent(event: import('../gameplay/enemyBehaviors').EnemyAttackEvent): void {
    if (event.type === 'dash') {
      this.bus.emit('enemy:dashed', event);
      return;
    }
    this.bus.emit('enemy:ranged-shot', event);
  }

  /** Bosses deliberately have no ordinary contact damage. Their readable
   * lunge instead damages once when its actual swept body intersects the
   * player, so moving after the telegraph can evade it. */
  private emitBossDashHit(player: Player, sweep: { readonly from: Readonly<Vec2>; readonly to: Readonly<Vec2> } | undefined): void {
    if (this.definition.archetype !== 'boss' || sweep === undefined || this.dashHitEmitted || !player.active) return;
    const { from, to } = sweep;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((player.x - from.x) * dx + (player.y - from.y) * dy) / lengthSquared));
    const hitX = from.x + dx * t;
    const hitY = from.y + dy * t;
    // Player and enemy body radii plus a small Arcade rounding allowance.
    if (Math.hypot(player.x - hitX, player.y - hitY) > ENEMY_BODY_RADIUS + 14) return;
    this.dashHitEmitted = true;
    this.bus.emit('enemy:dash-hit', { instanceId: this.instanceId, enemyId: this.defId, damage: this.definition.damage });
  }

  private emitBossActionEvent(event: BossActionEvent): void {
    if (event.type === 'summon') {
      this.bus.emit('enemy:summon', event);
      return;
    }
    this.bus.emit('enemy:ranged-shot', event);
  }

  private applyPosition(next: Vec2, dtMs: number, immediate = false): void {
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) {
      throw new Error(
        `Enemy runtime position must remain finite (enemy=${this.defId}, next=${next.x},${next.y}, ` +
        `current=${this.x},${this.y}, dtMs=${dtMs}, immediate=${immediate})`,
      );
    }
    // Charger dash → body.reset (directional lunge, designed to reach target).
    // Chaser pursuit → velocity-based (Arcade Physics collides with obstacles).
    if (immediate) {
      this.body.reset(next.x, next.y);
      return;
    }
    const dx = next.x - this.x;
    const dy = next.y - this.y;
    const speedMs = Math.sqrt(dx * dx + dy * dy);
    if (speedMs > 0.01 && dtMs > 0) {
      this.body.setVelocity((dx / dtMs) * 1000, (dy / dtMs) * 1000);
    } else {
      this.body.setVelocity(0, 0);
    }
  }
}
