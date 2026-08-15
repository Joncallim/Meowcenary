import Phaser from 'phaser';
import { createCadence, type Cadence } from '../engine/cadence';
import type { GameContext } from '../engine/context';
import { createPool, type Pool } from '../engine/pool';
import type { System } from '../engine/system';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import type { HeldWeaponPresentation } from '../entities/heldWeaponView';
import { projectileDirections } from '../gameplay/projectilePattern';
import type { RunState } from '../gameplay/runState';
import { nearestTarget } from '../gameplay/targeting';
import { resolveWeaponStats, type EffectiveWeaponStats } from '../gameplay/weaponStats';
import type { WeaponInstance, WeaponRegistry } from '../gameplay/weapons';
import type { WeaponDefinition } from './types';
import type { VisualArtLookup } from './visualArt';

interface WeaponCadenceRuntime {
  intervalMs: number;
  cadence: Cadence;
}

export class WeaponSystem implements System {
  private readonly projectilePools = new Map<string, Pool<Projectile>>();
  private readonly projectileOwners = new Map<Projectile, Pool<Projectile>>();
  private readonly liveProjectiles = new Set<Projectile>();
  private readonly ownedProjectiles: Projectile[] = [];
  private readonly projectileBySprite = new Map<Phaser.GameObjects.GameObject, Projectile>();
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
    private readonly visualArt?: VisualArtLookup,
    private readonly heldWeapon?: HeldWeaponPresentation,
  ) {
    for (const projectileArtId of new Set(ctx.data.weapons.map((weapon) => weapon.art.projectileId))) {
      const binding = visualArt?.bindingById(projectileArtId);
      let pool: Pool<Projectile>;
      pool = createPool(
        () => {
          const projectile = new Projectile(this.scene, this.projectileRadius, binding);
          this.ownedProjectiles.push(projectile);
          this.projectileOwners.set(projectile, pool);
          this.projectileBySprite.set(projectile.sprite, projectile);

          // Preserve the existing Phaser invariant: a PhysicsGroup re-applies
          // body defaults on add. Add exactly once while disabled; spawn owns
          // final position and velocity.
          this.projectileGroup.add(projectile.sprite);
          return projectile;
        },
        (projectile) => projectile.reset(),
      );
      this.projectilePools.set(projectileArtId, pool);
    }

    this.scene.physics.add.overlap(
      this.projectileGroup,
      this.enemyGroup,
      this.handleProjectileEnemyOverlap,
      undefined,
      this,
    );
  }

  get activeProjectileCount(): number {
    return this.liveProjectiles.size;
  }

  get allocatedProjectileCount(): number {
    return this.ownedProjectiles.length;
  }

  update(dtMs: number): void {
    this.heldWeapon?.update(dtMs);
    if (this.runState.status !== 'active') {
      return;
    }

    for (const projectile of this.liveProjectiles) {
      projectile.update(dtMs);
      if (!projectile.active) {
        this.releaseProjectile(projectile);
      }
    }

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
        this.fireAtNearestTarget(definition, stats);
      }
    }
  }

  destroy(): void {
    for (const projectile of this.ownedProjectiles) {
      projectile.destroy();
    }
    this.ownedProjectiles.length = 0;
    this.liveProjectiles.clear();
    this.projectileBySprite.clear();
    this.projectileOwners.clear();
    this.projectilePools.clear();
    this.cadences.clear();
    this.heldWeapon?.destroy();
  }

  private releaseProjectile(projectile: Projectile): void {
    if (!this.liveProjectiles.delete(projectile)) {
      return;
    }
    this.projectileOwners.get(projectile)?.release(projectile);
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

  private fireAtNearestTarget(definition: WeaponDefinition, stats: EffectiveWeaponStats): void {
    const target = nearestTarget(this.player, this.enemies, stats.range);
    if (!target) {
      return;
    }
    const pool = this.projectilePools.get(definition.art.projectileId);
    if (!pool) return;

    const directions = projectileDirections({
      origin: this.player,
      target,
      projectileCount: stats.projectileCount,
      spreadDeg: stats.spreadDeg,
    });

    for (const direction of directions) {
      const projectile = pool.acquire();
      this.liveProjectiles.add(projectile);
      projectile.spawn(this.player.x, this.player.y, direction, {
        speed: stats.projectileSpeed,
        damage: stats.damage,
        range: stats.range,
        pierce: stats.pierce,
      });
    }

    const heldBinding = this.visualArt?.bindingById(definition.art.heldId);
    if (heldBinding) {
      this.heldWeapon?.show(
        heldBinding,
        this.player.x,
        this.player.y,
        Math.atan2(target.y - this.player.y, target.x - this.player.x),
      );
    }

    this.ctx.bus.emit('weapon:fired', {
      weaponId: definition.id,
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
    const projectile = projectileGameObject ? this.projectileBySprite.get(projectileGameObject) : undefined;
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
      if (!projectile.active) {
        this.releaseProjectile(projectile);
      }
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

    if (!projectile.active) {
      this.releaseProjectile(projectile);
    }
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
