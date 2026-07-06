import Phaser from 'phaser';
import { createCadence } from '../engine/cadence';
import type { GameContext } from '../engine/context';
import type { System } from '../engine/system';
import { Projectile } from '../entities/Projectile';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { nearestTarget } from '../gameplay/targeting';
import type { RunState } from '../gameplay/runState';
import type { XpDrop } from '../entities/XpDrop';
import type { WeaponDefinition } from './types';

export type XpDropFactory = (x: number, y: number, amount: number) => XpDrop;

export class StarterCombatSystem implements System {
  private readonly projectiles: Projectile[] = [];
  private readonly cadence;
  private readonly weapon: WeaponDefinition | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly runState: RunState,
    private readonly player: Player,
    private readonly enemies: Enemy[],
    private readonly projectileGroup: Phaser.Physics.Arcade.Group,
    private readonly enemyGroup: Phaser.Physics.Arcade.Group,
    private readonly createXpDrop: XpDropFactory,
    private readonly projectileRadius: number,
  ) {
    this.weapon = this.ctx.data.weapons[0];
    const baseInterval = this.weapon?.fireRateMs ?? 650;
    this.cadence = createCadence(baseInterval);
    this.scene.physics.add.overlap(
      this.projectileGroup,
      this.enemyGroup,
      this.handleProjectileEnemyOverlap,
      undefined,
      this,
    );
  }

  update(dtMs: number): void {
    this.projectiles.forEach((projectile) => {
      projectile.update(dtMs);
    });
    compactActive(this.projectiles);

    if (this.runState.status !== 'active' || !this.weapon) {
      return;
    }

    const attackSpeed = this.runState.stats.resolve(
      'attackSpeed',
      this.runState.stats.resolve('fireRate', 1),
    );
    const ticks = this.cadence.update(dtMs * Math.max(0.1, attackSpeed));
    for (let i = 0; i < ticks; i += 1) {
      this.fireAtNearestTarget();
    }
  }

  destroy(): void {
    this.projectiles.forEach((projectile) => {
      projectile.destroy();
    });
    this.projectiles.length = 0;
  }

  private fireAtNearestTarget(): void {
    if (!this.weapon) {
      return;
    }

    const target = nearestTarget(this.player, this.enemies, this.weapon.range);
    if (!target) {
      return;
    }

    const damage = this.runState.stats.resolve('damage', this.weapon.damage);
    const projectileSpeed = this.runState.stats.resolve(
      'projectileSpeed',
      this.weapon.projectileSpeed,
    );
    const range = this.runState.stats.resolve('range', this.weapon.range);
    const projectile = new Projectile(
      this.scene,
      this.player.x,
      this.player.y,
      target,
      damage,
      projectileSpeed,
      range,
      this.projectileRadius,
    );
    this.projectiles.push(projectile);
    this.projectileGroup.add(projectile.sprite);
    this.ctx.bus.emit('weapon:fired', { weaponId: this.weapon.id, x: this.player.x, y: this.player.y });
  }

  private handleProjectileEnemyOverlap(
    projectileObject: unknown,
    enemyObject: unknown,
  ): void {
    const projectileGameObject = arcadeGameObject(projectileObject);
    const enemyGameObject = arcadeGameObject(enemyObject);
    const projectile = this.projectiles.find((candidate) => candidate.sprite === projectileGameObject);
    const enemy = this.enemies.find((candidate) => candidate.sprite === enemyGameObject);
    if (!projectile?.active || !enemy?.active) {
      return;
    }

    const hitX = enemy.x;
    const hitY = enemy.y;
    const killed = enemy.takeDamage(projectile.damage);
    projectile.destroy();
    this.ctx.bus.emit('projectile:hit', {
      x: hitX,
      y: hitY,
      damage: projectile.damage,
      killed,
    });

    if (!killed) {
      return;
    }

    this.runState.kills += 1;
    this.ctx.bus.emit('enemy:killed', {
      instanceId: enemy.instanceId,
      enemyId: enemy.definition.id,
      x: hitX,
      y: hitY,
    });
    this.createXpDrop(hitX, hitY, enemy.definition.xpValue);
  }
}

function arcadeGameObject(value: unknown): Phaser.GameObjects.GameObject | undefined {
  if (value instanceof Phaser.GameObjects.GameObject) {
    return value;
  }

  if (
    value instanceof Phaser.Physics.Arcade.Body ||
    value instanceof Phaser.Physics.Arcade.StaticBody
  ) {
    return value.gameObject;
  }

  return undefined;
}

function compactActive<T extends { active: boolean }>(items: T[]): void {
  let writeIndex = 0;
  for (const item of items) {
    if (item.active) {
      items[writeIndex] = item;
      writeIndex += 1;
    }
  }
  items.length = writeIndex;
}
