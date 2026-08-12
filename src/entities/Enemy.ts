import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import type { Vec2 } from '../engine/vector';
import {
  chaseStep,
  chargerStep,
  type ChargerMovementDefinition,
} from '../gameplay/enemyMovement';
import type { ResolvedEnemyDefinition, SpawnableEnemyArchetype } from '../systems/types';
import type { Player } from './Player';

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
  private readonly accent: Phaser.GameObjects.Arc;
  private readonly shadow: Phaser.GameObjects.Arc;
  private presentationDestroyed = false;
  private dashDirection: Vec2 = { x: 0, y: 0 };
  private dashOrigin: Vec2 = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    definition: ResolvedEnemyDefinition,
    x: number,
    y: number,
    private readonly bus: EventBus,
  ) {
    nextEnemyInstanceId += 1;
    this.definition = deepFreeze(structuredClone(definition));
    this.health = this.definition.health;
    this.maxHealth = this.definition.health;
    this.sprite = scene.add.circle(x, y, 13, enemyColor(this.definition.archetype))
      .setStrokeStyle(3, OUTLINE_COLOR, 1)
      .setDepth(4);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(13);

    // Presentation layers: display-only (no physics body), glued to the body
    // in update(). The body sprite stays the only object physics touches.
    const accent = accentStyle(this.definition);
    this.accent = scene.add.circle(x, y, accent.radius, accent.fill).setDepth(4);
    if (accent.stroke) {
      this.accent.setStrokeStyle(accent.stroke.width, accent.stroke.color, accent.stroke.alpha);
    }
    this.shadow = scene.add.circle(x, y, SHADOW_RADIUS, 0x000000)
      .setAlpha(SHADOW_ALPHA)
      .setDepth(2);
    this.syncPresentation();
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
    this.syncPresentation();
    if (!Number.isFinite(dtMs) || dtMs <= 0) {
      this.body.setVelocity(0, 0);
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
      );
      this.state = result.state;
      this.stateTimerMs = result.stateTimerMs;
      this.dashDirection = result.dashDirection;
      this.dashOrigin = result.dashOrigin;
      this.applyPosition(result.pos, dtMs, true);
      this.syncPresentation();
      return;
    }

    if (pursuitArchetype(this.definition) !== undefined) {
      const next = chaseStep(this.pos, player, this.definition.speed, dtMs);
      this.applyPosition(next, dtMs);
      this.syncPresentation();
      return;
    }

    this.body.setVelocity(0, 0);
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
   *  position read here is the rendered frame's position. */
  private syncPresentation(): void {
    this.shadow.setPosition(this.x, this.y + SHADOW_OFFSET_Y);
    this.accent.setPosition(this.x, this.y);
  }

  private destroyPresentation(): void {
    if (this.presentationDestroyed) {
      return;
    }
    this.presentationDestroyed = true;
    this.accent.destroy();
    this.shadow.destroy();
  }

  private applyPosition(next: Vec2, dtMs: number, immediate = false): void {
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) {
      throw new Error('Enemy runtime position must remain finite');
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
