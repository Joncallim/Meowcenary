import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { towards, type Vec2 } from '../engine/vector';
import type { ResolvedEnemyDefinition } from '../systems/types';
import type { Player } from './Player';

let nextEnemyInstanceId = 1;

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
    this.sprite = scene.add.circle(x, y, 13, enemyColor(this.definition.archetype)).setDepth(4);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(13);
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

  update(player: Player): void {
    if (!this.active || !player.active) {
      return;
    }

    const direction = towards(this, player);
    this.body.setVelocity(direction.x * this.definition.speed, direction.y * this.definition.speed);
  }

  takeDamage(amount: number): boolean {
    if (this.state === 'dead' || !this.active || !Number.isFinite(amount) || amount <= 0) {
      return false;
    }

    const x = this.x;
    const y = this.y;
    const nextHealth = Math.max(0, this.health - amount);
    const killed = nextHealth === 0;

    this.health = nextHealth;
    if (killed) {
      this.state = 'dead';
      this.stateTimerMs = 0;
    }

    this.bus.emit('enemy:damaged', {
      instanceId: this.instanceId,
      amount,
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

    if (!this.sprite.active) {
      return;
    }

    const body = this.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setVelocity(0, 0);
    this.sprite.destroy();
  }
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
