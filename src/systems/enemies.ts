import type {
  EnemyDefinition,
  EnemyArchetype,
  ResolvedEliteEnemyDefinition,
  ResolvedEnemyDefinition,
  SpawnableEnemyDefinition,
} from './types';

export const ELITE_MULTIPLIERS = Object.freeze({
  health: 2,
  damage: 1.5,
  speed: 1.1,
  xpValue: 2,
  scrapValue: 2,
} as const);

const SPAWNABLE_ARCHETYPES = new Set(['chaser', 'charger', 'tank']);

export class DataEnemyRegistry {
  private readonly byId = new Map<string, EnemyDefinition<EnemyArchetype>>();
  private readonly resolved = new Map<string, ResolvedEnemyDefinition>();
  private readonly snapshot: readonly EnemyDefinition<EnemyArchetype>[];

  constructor(data: { enemies: readonly EnemyDefinition<EnemyArchetype>[] }) {
    const canonical = data.enemies.map((enemy) => deepFreeze(structuredClone(enemy)));

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
      if (!SPAWNABLE_ARCHETYPES.has(base.archetype)) {
        throw new Error(
          `Elite "${enemy.id}" base must be a direct chaser, charger, or tank`,
        );
      }

      const spawnableBase = base as SpawnableEnemyDefinition;
      const resolved = {
        ...spawnableBase,
        id: enemy.id,
        name: enemy.name,
        archetype: 'elite' as const,
        baseEnemyId: enemy.baseEnemyId,
        baseArchetype: spawnableBase.archetype,
        health: spawnableBase.health * ELITE_MULTIPLIERS.health,
        damage: spawnableBase.damage * ELITE_MULTIPLIERS.damage,
        speed: spawnableBase.speed * ELITE_MULTIPLIERS.speed,
        xpValue: spawnableBase.xpValue * ELITE_MULTIPLIERS.xpValue,
        scrapValue: spawnableBase.scrapValue * ELITE_MULTIPLIERS.scrapValue,
      } as ResolvedEliteEnemyDefinition;
      this.resolved.set(enemy.id, deepFreeze(resolved));
    }

    this.snapshot = Object.freeze([...canonical]);
  }

  enemyById(id: string): EnemyDefinition<EnemyArchetype> | undefined {
    return this.byId.get(id);
  }

  resolvedById(id: string): ResolvedEnemyDefinition | undefined {
    return this.resolved.get(id);
  }

  spawnableById(id: string): SpawnableEnemyDefinition | undefined {
    const enemy = this.byId.get(id);
    return enemy && SPAWNABLE_ARCHETYPES.has(enemy.archetype)
      ? enemy as SpawnableEnemyDefinition
      : undefined;
  }

  all(): readonly EnemyDefinition<EnemyArchetype>[] {
    return this.snapshot;
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
