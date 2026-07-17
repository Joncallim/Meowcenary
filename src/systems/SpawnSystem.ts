import type { GameContext } from '../engine/context';
import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import type { RunState } from '../gameplay/runState';
import { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { scaleEnemy } from '../gameplay/enemyScaling';
import {
  createSpawnDirector,
  type SpawnDirector,
  type SpawnRequest,
} from '../gameplay/spawnDirector';
import { spawnPoint } from '../gameplay/spawnRegion';
import { DataEnemyRegistry } from './enemies';
import type { ArenaDefinition, EnemyScalingDefinition, SpawnableEnemyDefinition, SpawnCurveDefinition } from './types';

export class SpawnSystem implements System {
  private readonly registry?: DataEnemyRegistry;
  private readonly director?: SpawnDirector;
  private readonly scaling?: EnemyScalingDefinition;

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
  ) {
    this.registry = new DataEnemyRegistry(this.ctx.data);
    this.director = createSpawnDirector(curve, this.rng);
    this.scaling = Object.freeze(structuredClone(curve.scaling));
    this.scene.physics.add.overlap(
      this.player.sprite,
      this.enemyGroup,
      this.handlePlayerEnemyOverlap,
      undefined,
      this,
    );
  }

  update(dtMs: number): void {
    if (this.runState.status !== 'active') {
      this.enemies.forEach((enemy) => {
        if (enemy.active) {
          enemy.body.setVelocity(0, 0);
        }
      });
      compactActive(this.enemies);
      return;
    }

    this.enemies.forEach((enemy) => {
      enemy.update(this.player, dtMs);
    });

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

    compactActive(this.enemies);
  }

  destroy(): void {
    this.enemies.forEach((enemy) => {
      enemy.destroy();
    });
    this.enemies.length = 0;
  }

  private spawn(request: SpawnRequest): void {
    const definition = this.registry?.spawnableById(request.enemyId);
    if (!definition || !this.scaling) return;

    const scaled = scaleEnemy(definition, request.scheduledAtMs, this.scaling);
    const runtimeDefinition: SpawnableEnemyDefinition = {
      ...definition,
      health: scaled.maxHealth,
      damage: scaled.damage,
      speed: scaled.speed,
      xpValue: scaled.xpValue,
      scrapValue: scaled.scrapValue,
    };
    const enemy = new Enemy(
      this.scene,
      runtimeDefinition,
      request.pos.x,
      request.pos.y,
      this.ctx.bus,
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