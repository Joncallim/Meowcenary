import Phaser from 'phaser';
import type { EventBus } from '../engine/eventBus';
import { towards } from '../engine/vector';
import type { EnemyDefinition } from '../systems/types';
import type { Player } from './Player';

let nextEnemyInstanceId = 1;

export class Enemy {
  readonly instanceId = nextEnemyInstanceId;
  readonly sprite: Phaser.GameObjects.Arc;
  health: number;

  constructor(
    scene: Phaser.Scene,
    readonly definition: EnemyDefinition,
    x: number,
    y: number,
    private readonly bus: EventBus,
  ) {
    nextEnemyInstanceId += 1;
    this.health = definition.health;
    this.sprite = scene.add.circle(x, y, 13, enemyColor(definition.archetype)).setDepth(4);
    scene.physics.add.existing(this.sprite);
    this.body.setCircle(13);
  }

  get active(): boolean {
    return this.sprite.active;
  }

  get id(): number {
    return this.instanceId;
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
    if (!this.active || !Number.isFinite(amount) || amount <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    this.bus.emit('enemy:damaged', {
      instanceId: this.instanceId,
      amount,
      x: this.x,
      y: this.y,
    });

    if (this.health > 0) {
      return false;
    }

    this.destroy();
    return true;
  }

  destroy(): void {
    if (!this.sprite.active) {
      return;
    }

    this.body.setVelocity(0, 0);
    this.sprite.destroy();
  }
}

function enemyColor(archetype: EnemyDefinition['archetype']): number {
  switch (archetype) {
    case 'charger':
      return 0xf97316;
    case 'tank':
      return 0xa855f7;
    default:
      return 0xef4444;
  }
}
