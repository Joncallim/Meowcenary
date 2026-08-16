import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { ENEMY_BODY_RADIUS } from '../engine/bodyDimensions';
export { ENEMY_BODY_RADIUS } from '../engine/bodyDimensions';
import type { Vec2 } from '../engine/vector';
import {
  chaseStep,
  chargerStep,
  type ChargerMovementDefinition,
} from '../gameplay/enemyMovement';
import type { ResolvedEnemyDefinition, SpawnableEnemyArchetype } from '../systems/types';
import type { VisualArtBinding } from '../systems/types';
import { VisualDepth } from '../systems/visualDepths';
import type { Player } from './Player';
import { PlaceholderView, createAnimatedActorView, type ActorView } from './actorView';
import type { ChargerEnvironment } from '../gameplay/enemyMovement';

let nextEnemyInstanceId = 1;

const OUTLINE_COLOR = 0x0a0f14;
const SHADOW_RADIUS = 12;
const SHADOW_OFFSET_Y = 14;
const SHADOW_ALPHA = 0.28;

/** One display-only accent per archetype so silhouettes differ at a glance
 *  (style guide: readable at phone scale, distinct shapes). Elites inherit the
 *  accent of their base archetype. */
interface AccentStyle {
  readonly radius: number;
  readonly fill: number;
  readonly stroke?: { readonly width: number; readonly color: number; readonly alpha: number };
}

function accentStyle(def: Readonly<ResolvedEnemyDefinition>): AccentStyle {
  const effective = def.archetype === 'elite' ? def.baseArchetype : def.archetype;
  switch (effective) {
    case 'charger':
      return { radius: 5, fill: 0xfff3c4 }; // bright core — reads "armed"
    case 'tank':
      return {
        radius: 8,
        fill: 0x7c3aed,
        stroke: { width: 2, color: OUTLINE_COLOR, alpha: 1 },
      }; // armor plate
    case 'chaser':
    default:
      return { radius: 5, fill: OUTLINE_COLOR }; // dark core — reads "eye"
  }
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
    this.sprite = scene.add.circle(x, y, ENEMY_BODY_RADIUS, enemyColor(this.definition.archetype))
      .setStrokeStyle(3, OUTLINE_COLOR, 1)
      .setDepth(VisualDepth.enemy);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(ENEMY_BODY_RADIUS);

    // Presentation layers: display-only (no physics body), glued to the body
    // in update(). The body sprite stays the only object physics touches.
    const accent = accentStyle(this.definition);
    const accentNode = scene.add.circle(x, y, accent.radius, accent.fill).setDepth(VisualDepth.enemy);
    if (accent.stroke) {
      accentNode.setStrokeStyle(accent.stroke.width, accent.stroke.color, accent.stroke.alpha);
    }
    const shadow = scene.add.circle(x, y, SHADOW_RADIUS, 0x000000)
      .setAlpha(SHADOW_ALPHA)
      .setDepth(VisualDepth.lowDecoration);
    this.view = createAnimatedActorView(
      scene,
      this.sprite,
      { node: shadow, dy: SHADOW_OFFSET_Y },
      art,
      VisualDepth.enemy,
    ) ?? new PlaceholderView(
      this.sprite,
      [{ node: accentNode, dx: 0, dy: 0, flashes: false }],
      { node: shadow, dy: SHADOW_OFFSET_Y },
    );
    if (this.view instanceof PlaceholderView === false) accentNode.destroy();
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

    const chargerDefinition = asChargerMovementDefinition(this.definition);
    if (chargerDefinition) {
      const result = chargerStep(
        {
          pos: this.pos,
          state: this.state,
          stateTimerMs: this.stateTimerMs,
          dashDirection: this.dashDirection,
          dashOrigin: this.dashOrigin,
        },
        { x: player.x, y: player.y },
        chargerDefinition,
        dtMs,
        this.environment,
      );
      this.state = result.state;
      this.stateTimerMs = result.stateTimerMs;
      this.dashDirection = result.dashDirection;
      this.dashOrigin = result.dashOrigin;
      this.applyPosition(result.pos, dtMs, true);
      // Charger dashes use body.reset, so velocity never reflects motion:
      // the run clip is driven by actual displacement (dash or pursuit).
      this.syncPresentation(this.state === 'attacking', player);
      return;
    }

    if (pursuitArchetype(this.definition) !== undefined) {
      const next = chaseStep(this.pos, player, this.definition.speed, dtMs);
      this.applyPosition(next, dtMs);
      this.syncPresentation(Math.hypot(this.body.velocity.x, this.body.velocity.y) > 0.01);
      return;
    }

    this.body.setVelocity(0, 0);
    this.syncPresentation(false);
  }

  takeDamage(amount: number): boolean {
    if (this.state === 'dead' || !this.active || !Number.isFinite(amount) || amount <= 0) {
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
    const moved = this.presentationPos
      ? Math.hypot(current.x - this.presentationPos.x, current.y - this.presentationPos.y) > 0.01
      : false;
    this.presentationPos = current;
    this.view.update({ x: current.x, y: current.y, facing: this.facing, moving: moving || moved, alpha: 1 });
  }

  private destroyPresentation(): void {
    if (this.presentationDestroyed) {
      return;
    }
    this.presentationDestroyed = true;
    this.view.destroy();
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

function pursuitArchetype(
  definition: Readonly<ResolvedEnemyDefinition>,
): Exclude<SpawnableEnemyArchetype, 'charger'> | undefined {
  if (definition.archetype === 'chaser' || definition.archetype === 'tank') {
    return definition.archetype;
  }
  if (
    definition.archetype === 'elite' &&
    (definition.baseArchetype === 'chaser' || definition.baseArchetype === 'tank')
  ) {
    return definition.baseArchetype;
  }
  return undefined;
}

function asChargerMovementDefinition(
  definition: Readonly<ResolvedEnemyDefinition>,
): ChargerMovementDefinition | undefined {
  if (definition.archetype === 'charger') return definition;
  if (
    definition.archetype === 'elite' &&
    definition.baseArchetype === 'charger' &&
    'attack' in definition
  ) {
    return definition;
  }
  return undefined;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function enemyColor(archetype: ResolvedEnemyDefinition['archetype']): number {
  switch (archetype) {
    case 'charger':
      return 0xf97316;
    case 'tank':
      return 0xa855f7;
    default:
      return 0xef4444;
  }
}
