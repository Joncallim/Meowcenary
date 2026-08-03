import Phaser from 'phaser';
import { createCadence, type Cadence } from '../engine/cadence';
import type { GameContext } from '../engine/context';
import type { System } from '../engine/system';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { projectileDirections } from '../gameplay/projectilePattern';
import type { RunState } from '../gameplay/runState';
import { nearestTarget } from '../gameplay/targeting';
import { resolveWeaponStats, type EffectiveWeaponStats } from '../gameplay/weaponStats';
import type { WeaponInstance, WeaponRegistry } from '../gameplay/weapons';

interface WeaponCadenceRuntime {
  intervalMs: number;
  cadence: Cadence;
}

export class WeaponSystem implements System {
  private readonly projectiles: Projectile[] = [];
  private readonly cadences = new Map<string, WeaponCadenceRuntime>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly runState: RunState,
    private readonly player: Player,
    private readonly enemies: Enemy[],
    private readonly projectileGroup: Phaser.Physics.Arcade.Group,
    private readonly enemyGroup: Phaser.Physics.Arcade.Group,
    private readonly weaponRegistry: WeaponRegistry,
    private readonly projectileRadius: number,
  ) {
    this.scene.physics.add.overlap(
      this.projectileGroup,
      this.enemyGroup,
      this.handleProjectileEnemyOverlap,
      undefined,
      this,
    );
  }

  update(dtMs: number): void {
    if (this.runState.status !== 'active') {
      return;
    }

    this.projectiles.forEach((projectile) => {
      projectile.update(dtMs);
    });
    compactActive(this.projectiles);

    const equippedInstanceIds = new Set<string>();
    const duplicateInstanceIds = new Set<string>();
    for (const weapon of this.runState.equipped) {
      if (equippedInstanceIds.has(weapon.instanceId)) {
        duplicateInstanceIds.add(weapon.instanceId);
      }
      equippedInstanceIds.add(weapon.instanceId);
    }
    this.pruneCadences(equippedInstanceIds);

    for (const weapon of this.runState.equipped) {
      if (duplicateInstanceIds.has(weapon.instanceId)) {
        this.cadences.delete(weapon.instanceId);
        continue;
      }

      const definition = this.weaponRegistry.weaponById(weapon.defId);
      if (
        !definition ||
        definition.family !== weapon.family ||
        definition.mergeTier !== weapon.tier
      ) {
        this.cadences.delete(weapon.instanceId);
        continue;
      }

      const stats = resolveWeaponStats(this.runState, definition);
      if (stats.damage <= 0 || stats.projectileSpeed <= 0 || stats.range <= 0) {
        this.cadences.delete(weapon.instanceId);
        continue;
      }

      const cadence = this.cadenceFor(weapon, stats.intervalMs);
      const ticks = cadence.update(dtMs);
      for (let i = 0; i < ticks; i += 1) {
        this.fireAtNearestTarget(definition.id, stats);
      }
    }
  }

  destroy(): void {
    this.projectiles.forEach((projectile) => {
      projectile.destroy();
    });
    this.projectiles.length = 0;
    this.cadences.clear();
  }

  private pruneCadences(equippedInstanceIds: ReadonlySet<string>): void {
    for (const instanceId of this.cadences.keys()) {
      if (!equippedInstanceIds.has(instanceId)) {
        this.cadences.delete(instanceId);
      }
    }
  }

  private cadenceFor(weapon: WeaponInstance, intervalMs: number): Cadence {
    const current = this.cadences.get(weapon.instanceId);
    if (current) {
      if (current.intervalMs !== intervalMs) {
        current.intervalMs = intervalMs;
        current.cadence.setInterval(intervalMs);
      }

      return current.cadence;
    }

    const runtime = {
      intervalMs,
      cadence: createCadence(intervalMs),
    };
    this.cadences.set(weapon.instanceId, runtime);
    return runtime.cadence;
  }

  private fireAtNearestTarget(weaponId: string, stats: EffectiveWeaponStats): void {
    const target = nearestTarget(this.player, this.enemies, stats.range);
    if (!target) {
      return;
    }

    const directions = projectileDirections({
      origin: this.player,
      target,
      projectileCount: stats.projectileCount,
      spreadDeg: stats.spreadDeg,
    });

    for (const direction of directions) {
      const projectile = new Projectile(this.scene, this.projectileRadius);
      this.projectiles.push(projectile);
      // Add to the Arcade group BEFORE spawning: Phaser's PhysicsGroup re-applies its
      // body defaults (including velocity 0) on add, so spawn() must set velocity last.
      this.projectileGroup.add(projectile.sprite);
      projectile.spawn(this.player.x, this.player.y, direction, {
        speed: stats.projectileSpeed,
        damage: stats.damage,
        range: stats.range,
        pierce: stats.pierce,
      });
    }

    this.ctx.bus.emit('weapon:fired', {
      weaponId,
      x: this.player.x,
      y: this.player.y,
    });
  }

  private handleProjectileEnemyOverlap(projectileObject: unknown, enemyObject: unknown): void {
    if (this.runState.status !== 'active') {
      return;
    }

    const projectileGameObject = arcadeGameObject(projectileObject);
    const enemyGameObject = arcadeGameObject(enemyObject);
    const projectile = this.projectiles.find((candidate) => candidate.sprite === projectileGameObject);
    const enemy = this.enemies.find((candidate) => candidate.sprite === enemyGameObject);
    if (!projectile?.active || !enemy?.active) {
      return;
    }

    const damage = projectile.damage;
    if (!projectile.registerHit(enemy.instanceId)) {
      return;
    }

    const hitX = enemy.x;
    const hitY = enemy.y;
    const killed = enemy.takeDamage(damage);
    this.ctx.bus.emit('projectile:hit', {
      x: hitX,
      y: hitY,
      damage,
      killed,
    });

    if (!killed) {
      return;
    }

    this.runState.kills += 1;
    this.ctx.bus.emit('enemy:killed', {
      instanceId: enemy.instanceId,
      enemyId: enemy.defId,
      xpValue: enemy.xpValue,
      scrapValue: enemy.scrapValue,
      ...(enemy.definition.lootTableId ? { lootTableId: enemy.definition.lootTableId } : {}),
      x: hitX,
      y: hitY,
    });
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

function compactActive<T extends { active: boolean; destroy(): void }>(items: T[]): void {
  let writeIndex = 0;
  for (const item of items) {
    if (item.active) {
      items[writeIndex] = item;
      writeIndex += 1;
    } else {
      item.destroy();
    }
  }
  items.length = writeIndex;
}
