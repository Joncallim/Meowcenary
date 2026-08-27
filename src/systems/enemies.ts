import type {
  EnemyDefinition,
  ResolvedEliteEnemyDefinition,
  ResolvedEnemyDefinition,
  SpawnableEnemyDefinition,
} from './types';
import { deepFreeze } from '../engine/freeze';
import { isSpawnableEnemyDefinition } from './types';
import { validateEnemyCatalog } from './validation';

export const ELITE_MULTIPLIERS = Object.freeze({
  health: 2,
  damage: 1.5,
  speed: 1.1,
  xpValue: 2,
  scrapValue: 2,
} as const);

export class DataEnemyRegistry {
  private readonly byId = new Map<string, EnemyDefinition>();
  private readonly resolved = new Map<string, ResolvedEnemyDefinition>();
  private readonly snapshot: readonly EnemyDefinition[];

  constructor(data: { enemies: unknown }) {
    const validated = validateEnemyCatalog(data.enemies);
    const canonical = validated.map((enemy) => deepFreeze(structuredClone(enemy)));

    for (const enemy of canonical) {
      if (this.byId.has(enemy.id)) {
        throw new Error(`Duplicate enemy id "${enemy.id}"`);
      }
      this.byId.set(enemy.id, enemy);
    }

    for (const enemy of canonical) {
      if (enemy.archetype !== 'elite') {
        this.resolved.set(enemy.id, enemy);
        continue;
      }

      const base = this.byId.get(enemy.baseEnemyId);
      if (enemy.baseEnemyId === enemy.id) {
        throw new Error(`Elite "${enemy.id}" cannot reference itself`);
      }
      if (!base) {
        throw new Error(`Elite "${enemy.id}" references missing base "${enemy.baseEnemyId}"`);
      }
      if (!isSpawnableEnemyDefinition(base)) {
        throw new Error(
          `Elite "${enemy.id}" base must be a direct chaser, charger, or tank`,
        );
      }

      const spawnableBase = base;
      const resolvedStats = {
        health: spawnableBase.health * ELITE_MULTIPLIERS.health,
        damage: spawnableBase.damage * ELITE_MULTIPLIERS.damage,
        speed: spawnableBase.speed * ELITE_MULTIPLIERS.speed,
        xpValue: spawnableBase.xpValue * ELITE_MULTIPLIERS.xpValue,
        scrapValue: spawnableBase.scrapValue * ELITE_MULTIPLIERS.scrapValue,
      };
      assertValidResolvedStats(enemy.id, spawnableBase.id, resolvedStats);
      const resolved = {
        ...spawnableBase,
        id: enemy.id,
        name: enemy.name,
        archetype: 'elite' as const,
        baseEnemyId: enemy.baseEnemyId,
        baseArchetype: spawnableBase.archetype,
        ...resolvedStats,
      } as ResolvedEliteEnemyDefinition;
      this.resolved.set(enemy.id, deepFreeze(resolved));
    }

    this.snapshot = Object.freeze([...canonical]);
  }

  enemyById(id: string): EnemyDefinition | undefined {
    return this.byId.get(id);
  }

  resolvedById(id: string): ResolvedEnemyDefinition | undefined {
    return this.resolved.get(id);
  }

  spawnableById(id: string): SpawnableEnemyDefinition | undefined {
    const enemy = this.byId.get(id);
    return enemy && isSpawnableEnemyDefinition(enemy) ? enemy : undefined;
  }

  all(): readonly EnemyDefinition[] {
    return this.snapshot;
  }
}

function assertValidResolvedStats(
  eliteId: string,
  baseId: string,
  stats: {
    health: number;
    damage: number;
    speed: number;
    xpValue: number;
    scrapValue: number;
  },
): void {
  const checks: ReadonlyArray<[keyof typeof stats, boolean]> = [
    ['health', Number.isFinite(stats.health) && stats.health > 0],
    ['damage', Number.isFinite(stats.damage) && stats.damage > 0],
    ['speed', Number.isFinite(stats.speed) && stats.speed > 0],
    ['xpValue', Number.isSafeInteger(stats.xpValue) && stats.xpValue > 0],
    ['scrapValue', Number.isSafeInteger(stats.scrapValue) && stats.scrapValue >= 0],
  ];
  for (const [stat, valid] of checks) {
    if (!valid) {
      throw new Error(
        `Elite "${eliteId}" base "${baseId}" produced invalid resolved stat "${stat}"`,
      );
    }
  }
}
