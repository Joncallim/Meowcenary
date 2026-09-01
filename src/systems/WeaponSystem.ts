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
import { weaponFeelByFamily, type WeaponDefinition, type WeaponFeelDefinition } from './types';
import type { VisualArtLookup } from './visualArt';
import type { ProjectileEffect } from '../gameplay/projectileEffects';

interface WeaponCadenceRuntime {
  intervalMs: number;
  cadence: Cadence;
}

interface BurnRuntime {
  readonly enemy: Enemy;
  readonly damage: number;
  readonly weaponId: string;
  readonly family: string;
  readonly tier: number;
  readonly tickIntervalMs: number;
  remainingMs: number;
  elapsedMs: number;
}

export class WeaponSystem implements System {
  private readonly projectilePools = new Map<string, Pool<Projectile>>();
  private readonly projectileOwners = new Map<Projectile, Pool<Projectile>>();
  private readonly liveProjectiles = new Set<Projectile>();
  private readonly ownedProjectiles: Projectile[] = [];
  private readonly projectileBySprite = new Map<Phaser.GameObjects.GameObject, Projectile>();
  private readonly cadences = new Map<string, WeaponCadenceRuntime>();
  private readonly burnsByEnemyId = new Map<number, BurnRuntime>();
  private readonly weaponFeelByFamily: ReadonlyMap<string, WeaponFeelDefinition>;

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
    private readonly projectileEffectsByFamily: ReadonlyMap<string, readonly ProjectileEffect[]> = new Map(),
  ) {
    this.weaponFeelByFamily = weaponFeelByFamily(ctx.data.weaponFeel);

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
    this.heldWeapon?.update(dtMs, this.player.x, this.player.y);
    if (this.runState.status !== 'active') {
      return;
    }

    for (const projectile of this.liveProjectiles) {
      projectile.update(dtMs);
      if (!projectile.active) {
        this.releaseProjectile(projectile);
      }
    }
    this.updateBurns(dtMs);

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
    this.burnsByEnemyId.clear();
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
        weaponId: definition.id,
        family: definition.family,
        tier: definition.mergeTier,
        effects: this.projectileEffectsByFamily.get(definition.family),
      });
    }

    const heldBinding = this.visualArt?.bindingById(definition.art.heldId);
    if (heldBinding) {
      this.heldWeapon?.show(
        heldBinding,
        this.player.x,
        this.player.y,
        Math.atan2(target.y - this.player.y, target.x - this.player.x),
        this.weaponFeelByFamily.get(definition.family)?.recoilPx,
      );
    }

    this.ctx.bus.emit('weapon:fired', {
      weaponId: definition.id,
      family: definition.family,
      tier: definition.mergeTier,
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

    // Captured before registerHit(), which resets the projectile (clearing
    // these presentation-only fields) once pierce is exhausted.
    const damage = projectile.damage;
    const weaponId = projectile.weaponId;
    const family = projectile.family;
    const tier = projectile.tier;
    const effects = projectile.effects;
    if (!projectile.registerHit(enemy.instanceId)) {
      return;
    }

    this.applyProjectileDamage(enemy, damage, { weaponId, family, tier, x: projectile.x, y: projectile.y });

    for (const effect of effects) {
      if (effect.kind === 'explosive') {
        for (const nearby of this.enemies) {
          if (!nearby.active || nearby === enemy) continue;
          if (Math.hypot(nearby.x - enemy.x, nearby.y - enemy.y) > effect.radius) continue;
          this.applyProjectileDamage(nearby, damage * effect.damageMultiplier, { weaponId, family, tier, x: enemy.x, y: enemy.y });
        }
        // An explosive projectile consumes itself on the first valid hit even
        // if a separate pierce modifier is also present.
        projectile.reset();
        continue;
      }
      if (effect.kind === 'burn' && enemy.active) {
        this.applyBurn(enemy, damage * effect.damageMultiplier, effect.durationMs, effect.tickIntervalMs, { weaponId, family, tier });
      }
    }

    if (!projectile.active) {
      this.releaseProjectile(projectile);
    }
  }

  private applyProjectileDamage(
    enemy: Enemy,
    damage: number,
    hit: { readonly weaponId: string; readonly family: string; readonly tier: number; readonly x: number; readonly y: number },
  ): void {
    const killed = enemy.takeDamage(damage, { x: hit.x, y: hit.y });
    this.ctx.bus.emit('projectile:hit', {
      weaponId: hit.weaponId, family: hit.family, tier: hit.tier,
      x: enemy.x, y: enemy.y, damage, killed,
    });
    if (!killed) return;
    this.runState.kills += 1;
    this.ctx.bus.emit('enemy:killed', {
      instanceId: enemy.instanceId,
      enemyId: enemy.defId,
      xpValue: enemy.xpValue,
      scrapValue: enemy.scrapValue,
      ...(enemy.definition.lootTableId ? { lootTableId: enemy.definition.lootTableId } : {}),
      x: enemy.x,
      y: enemy.y,
    });
  }

  private applyBurn(
    enemy: Enemy,
    damage: number,
    durationMs: number,
    tickIntervalMs: number,
    source: { readonly weaponId: string; readonly family: string; readonly tier: number },
  ): void {
    if (!(damage > 0) || !(durationMs > 0) || !(tickIntervalMs > 0)) return;
    const existing = this.burnsByEnemyId.get(enemy.instanceId);
    if (existing) {
      existing.remainingMs = Math.max(existing.remainingMs, durationMs);
      existing.elapsedMs = Math.min(existing.elapsedMs, tickIntervalMs);
      return;
    }
    this.burnsByEnemyId.set(enemy.instanceId, {
      enemy, damage, weaponId: source.weaponId, family: source.family, tier: source.tier, tickIntervalMs,
      remainingMs: durationMs, elapsedMs: 0,
    });
  }

  private updateBurns(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    for (const [instanceId, burn] of this.burnsByEnemyId) {
      if (!burn.enemy.active) {
        this.burnsByEnemyId.delete(instanceId);
        continue;
      }
      // Only time while the burn is active contributes ticks.  Process that
      // active slice before expiring the runtime so a slow frame still gets
      // every scheduled tick through the exact end of the effect.
      const activeMs = Math.min(dtMs, Math.max(0, burn.remainingMs));
      burn.remainingMs -= dtMs;
      burn.elapsedMs += activeMs;
      while (burn.elapsedMs >= burn.tickIntervalMs && burn.enemy.active) {
        burn.elapsedMs -= burn.tickIntervalMs;
        this.applyProjectileDamage(burn.enemy, burn.damage, {
          weaponId: burn.weaponId, family: burn.family, tier: burn.tier,
          x: burn.enemy.x, y: burn.enemy.y,
        });
      }
      if (burn.remainingMs <= 0 || !burn.enemy.active) {
        this.burnsByEnemyId.delete(instanceId);
      }
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
