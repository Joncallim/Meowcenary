import Phaser from 'phaser';
import { createCadence, type Cadence } from '../engine/cadence';
import type { GameContext } from '../engine/context';
import type { Rng } from '../engine/rng';
import type { System } from '../engine/system';
import type { RunState } from '../gameplay/runState';
import { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { EnemyDefinition, SpawnWaveDefinition } from './types';

interface WaveRuntime {
  definition: SpawnWaveDefinition;
  cadence: Cadence;
}

export class SpawnSystem implements System {
  private readonly enemiesById = new Map<string, EnemyDefinition>();
  private readonly waves: WaveRuntime[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly runState: RunState,
    private readonly rng: Rng,
    private readonly player: Player,
    private readonly enemies: Enemy[],
    private readonly enemyGroup: Phaser.Physics.Arcade.Group,
  ) {
    this.ctx.data.enemies.forEach((enemy) => {
      this.enemiesById.set(enemy.id, enemy);
    });
    const curve = this.ctx.data.spawnCurves[0];
    this.waves =
      curve?.waves.map((definition) => ({
        definition,
        cadence: createCadence(definition.spawnEveryMs),
      })) ?? [];
  }

  update(dtMs: number): void {
    if (this.runState.status !== 'active') {
      this.enemies.forEach((enemy) => {
        enemy.body.setVelocity(0, 0);
      });
      return;
    }

    this.enemies.forEach((enemy) => {
      enemy.update(this.player);
    });

    const elapsedSeconds = this.runState.timeMs / 1000;
    for (const wave of this.waves) {
      if (elapsedSeconds < wave.definition.startSecond) {
        continue;
      }

      const ticks = wave.cadence.update(dtMs);
      for (let i = 0; i < ticks; i += 1) {
        this.spawnFromWave(wave.definition);
      }
    }

    compactActive(this.enemies);
  }

  destroy(): void {
    this.enemies.forEach((enemy) => {
      enemy.destroy();
    });
    this.enemies.length = 0;
  }

  private spawnFromWave(wave: SpawnWaveDefinition): void {
    const aliveForWave = this.enemies.filter(
      (enemy) => enemy.active && enemy.definition.id === wave.enemyId,
    ).length;
    if (aliveForWave >= wave.maxAlive) {
      return;
    }

    const definition = this.enemiesById.get(wave.enemyId);
    if (!definition) {
      return;
    }

    const point = this.spawnPoint();
    const enemy = new Enemy(this.scene, definition, point.x, point.y, this.ctx.bus);
    this.enemies.push(enemy);
    this.enemyGroup.add(enemy.sprite);
    this.ctx.bus.emit('enemy:spawned', {
      instanceId: enemy.instanceId,
      enemyId: definition.id,
      x: enemy.x,
      y: enemy.y,
    });
  }

  private spawnPoint(): { x: number; y: number } {
    const margin = 28;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const side = this.rng.int(0, 3);

    if (side === 0) {
      return { x: this.rng.int(0, width), y: -margin };
    }
    if (side === 1) {
      return { x: width + margin, y: this.rng.int(0, height) };
    }
    if (side === 2) {
      return { x: this.rng.int(0, width), y: height + margin };
    }
    return { x: -margin, y: this.rng.int(0, height) };
  }
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
