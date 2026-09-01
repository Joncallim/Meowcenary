import { deepFreeze } from '../engine/freeze';
import type { GameContext } from '../engine/context';
import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import type { RunState } from '../gameplay/runState';
import { Enemy, ENEMY_BODY_RADIUS } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import type { Player } from '../entities/Player';
import { scaleEnemy } from '../gameplay/enemyScaling';
import {
  createSpawnDirector,
  type SpawnDirector,
  type SpawnRequest,
} from '../gameplay/spawnDirector';
import { spawnPoint } from '../gameplay/spawnRegion';
import { DataEnemyRegistry } from './enemies';
import type { ArenaDefinition, EnemyScalingDefinition, ResolvedEnemyDefinition, SpawnCurveDefinition } from './types';
import type { VisualArtLookup } from './visualArt';
import type { ChargerEnvironment } from '../gameplay/enemyMovement';
import type { ResolvedDifficultyProfile } from '../gameplay/stage/stageContracts';

export class SpawnSystem implements System {
  // Current encounter caps can combine ranged adds with boss volleys. Keep
  // enough preallocated slots for that authored worst case so a live,
  // telegraphed threat is never silently dropped under normal composition.
  private static readonly ENEMY_PROJECTILE_POOL = 64;
  private static readonly MAX_PENDING_SUMMONS = 32;
  private readonly registry?: DataEnemyRegistry;
  private readonly director?: SpawnDirector;
  private readonly scaling?: EnemyScalingDefinition;
  private readonly environment: ChargerEnvironment;
  private readonly enemyProjectiles: Projectile[] = [];
  private readonly unsubscribeRangedShot: () => void;
  private readonly unsubscribeDashHit: () => void;
  private readonly unsubscribeSummon: () => void;
  private readonly pendingSummons: Array<{ enemyId: string; count: number; maxActive: number; x: number; y: number }> = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly runState: RunState,
    private readonly rng: Rng,
    private readonly player: Player,
    private readonly enemies: Enemy[],
    private readonly enemyGroup: Phaser.Physics.Arcade.Group,
    private readonly arena: Readonly<ArenaDefinition>,
    curve: Readonly<SpawnCurveDefinition>,
    private readonly visualArt?: VisualArtLookup,
    private readonly stageDifficulty?: Pick<ResolvedDifficultyProfile, 'healthMultiplier' | 'damageMultiplier' | 'speedMultiplier'>,
  ) {
    this.registry = new DataEnemyRegistry(this.ctx.data);
    this.director = createSpawnDirector(curve, this.rng);
    this.scaling = Object.freeze(structuredClone(curve.scaling));
    this.environment = deepFreeze({
      bounds: { x: 0, y: 0, width: arena.size.width, height: arena.size.height },
      obstacles: structuredClone(arena.obstacles),
      bodyRadius: ENEMY_BODY_RADIUS,
    });
    this.scene.physics.add.overlap(
      this.player.sprite,
      this.enemyGroup,
      this.handlePlayerEnemyOverlap,
      undefined,
      this,
    );
    for (let index = 0; index < SpawnSystem.ENEMY_PROJECTILE_POOL; index += 1) {
      const projectile = new Projectile(this.scene, 6);
      this.enemyProjectiles.push(projectile);
      this.scene.physics.add.overlap(this.player.sprite, projectile.sprite, () => {
        if (!projectile.active || this.runState.status !== 'active') return;
        this.player.takeDamage(projectile.damage);
        projectile.reset();
      });
    }
    this.unsubscribeRangedShot = this.ctx.bus.on('enemy:ranged-shot', this.handleRangedShot);
    this.unsubscribeDashHit = this.ctx.bus.on('enemy:dash-hit', this.handleDashHit);
    this.unsubscribeSummon = this.ctx.bus.on('enemy:summon', this.handleSummon);
  }

  update(dtMs: number): void {
    if (this.runState.status !== 'active') {
      this.enemies.forEach((enemy) => {
        if (enemy.active) {
          enemy.body.setVelocity(0, 0);
        }
      });
      this.enemyProjectiles.forEach((projectile) => projectile.setPaused(true));
      compactActive(this.enemies);
      return;
    }

    this.enemyProjectiles.forEach((projectile) => projectile.setPaused(false));

    this.enemies.forEach((enemy) => {
      enemy.update(this.player, dtMs);
    });
    this.enemyProjectiles.forEach((projectile) => projectile.update(dtMs));

    const activeCounts = Object.create(null) as Record<string, number>;
    for (const enemy of this.enemies) {
      if (enemy.active) activeCounts[enemy.defId] = (activeCounts[enemy.defId] ?? 0) + 1;
    }
    const requests =
      this.director?.update(dtMs, {
        activeCounts,
        spawnPoint: (rng) => spawnPoint(this.arena, rng),
      }) ?? [];
    for (const request of requests) {
      this.spawn(request);
    }

    this.flushSummons();

    compactActive(this.enemies);
  }

  destroy(): void {
    this.unsubscribeRangedShot();
    this.unsubscribeDashHit();
    this.unsubscribeSummon();
    this.enemyProjectiles.forEach((projectile) => projectile.destroy());
    this.enemies.forEach((enemy) => {
      enemy.destroy();
    });
    this.enemies.length = 0;
  }

  /** Explicit encounter/boss entrypoint. Stage composition owns *when* this
   * occurs; this system remains the sole owner of materialising enemy state. */
  spawnEncounterEnemy(enemyId: string, x: number, y: number): boolean {
    const before = this.enemies.length;
    this.spawn({ enemyId, pos: { x, y }, scheduledAtMs: this.runState.timeMs });
    return this.enemies.length > before;
  }

  private readonly handleRangedShot = (shot: { x: number; y: number; dirX: number; dirY: number; damage: number }): void => {
    if (this.runState.status !== 'active') return;
    const projectile = this.enemyProjectiles.find((candidate) => !candidate.active);
    // Saturation drops the newest shot; it never allocates or evicts a live,
    // already-telegraphed projectile.
    if (!projectile) return;
    projectile.spawn(shot.x, shot.y, { x: shot.dirX, y: shot.dirY }, {
      speed: 210,
      damage: shot.damage,
      range: 330,
      pierce: 0,
      weaponId: 'enemy:ranged',
      family: 'enemy',
      tier: 0,
      // Enemy fallback projectiles must remain visually distinct from the
      // player's cyan shots even before bespoke enemy art is authored.
      color: 0xff5a48,
    });
  };

  private readonly handleDashHit = (hit: { damage: number }): void => {
    if (this.runState.status !== 'active' || !Number.isFinite(hit.damage) || hit.damage <= 0) return;
    this.player.takeDamage(hit.damage);
  };

  private readonly handleSummon = (request: { enemyId: string; count: number; maxActive: number; x: number; y: number }): void => {
    if (!Number.isSafeInteger(request.count) || request.count <= 0 || !Number.isSafeInteger(request.maxActive) || request.maxActive <= 0) return;
    if (this.pendingSummons.length >= SpawnSystem.MAX_PENDING_SUMMONS) return;
    this.pendingSummons.push({ ...request });
  };

  private flushSummons(): void {
    while (this.pendingSummons.length > 0 && this.enemies.length < 256) {
      const request = this.pendingSummons.shift()!;
      let active = this.enemies.filter((enemy) => enemy.active && enemy.defId === request.enemyId).length;
      for (let index = 0; index < request.count && active < request.maxActive && this.enemies.length < 256; index += 1) {
        const angle = (index / request.count) * Math.PI * 2;
        this.spawn({
          enemyId: request.enemyId,
          pos: { x: request.x + Math.cos(angle) * 24, y: request.y + Math.sin(angle) * 24 },
          scheduledAtMs: this.runState.timeMs,
        });
        active += 1;
      }
    }
  }

  private spawn(request: SpawnRequest): void {
    const definition = this.registry?.spawnableById(request.enemyId)
      ?? this.registry?.resolvedById(request.enemyId);
    if (!definition || !this.scaling) return;

    const scaled = scaleEnemy(definition, request.scheduledAtMs, this.scaling);
    const difficulty = this.stageDifficulty;
    const runtimeDefinition: ResolvedEnemyDefinition = {
      ...definition,
      health: scaled.maxHealth * (difficulty?.healthMultiplier ?? 1),
      damage: scaled.damage * (difficulty?.damageMultiplier ?? 1),
      speed: scaled.speed * (difficulty?.speedMultiplier ?? 1),
      xpValue: scaled.xpValue,
      scrapValue: scaled.scrapValue,
    };
    const enemy = new Enemy(
      this.scene,
      runtimeDefinition,
      request.pos.x,
      request.pos.y,
      this.ctx.bus,
      this.visualArt?.bindingById(`enemy:${definition.id}`),
      this.environment,
    );
    this.enemies.push(enemy);
    this.enemyGroup.add(enemy.sprite);
    this.ctx.bus.emit('enemy:spawned', {
      instanceId: enemy.instanceId,
      enemyId: enemy.defId,
      x: enemy.x,
      y: enemy.y,
    });
  }

  private handlePlayerEnemyOverlap(_playerObject: unknown, enemyObject: unknown): void {
    if (this.runState.status !== 'active') return;
    const enemyGameObject = unwrapGameObject(enemyObject);
    const enemy = this.enemies.find((candidate) => candidate.sprite === enemyGameObject);
    if (
      !enemy?.active ||
      enemy.state === 'dead' ||
      !enemy.definition.contactDamage ||
      !this.player.active
    ) {
      return;
    }
    this.player.takeDamage(enemy.definition.damage);
  }
}

function unwrapGameObject(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && 'gameObject' in value) {
    return (value as { gameObject: unknown }).gameObject;
  }
  return value;
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
