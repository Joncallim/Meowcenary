import type { EnemyScalingDefinition, EnemyStats } from '../systems/types';

export interface ScaledEnemyStats {
  maxHealth: number;
  damage: number;
  speed: number;
  xpValue: number;
  scrapValue: number;
}

export function scaleEnemy(
  definition: EnemyStats,
  scheduledAtMs: number,
  scaling: EnemyScalingDefinition,
): ScaledEnemyStats {
  const inputs = [
    definition.health,
    definition.damage,
    definition.speed,
    definition.xpValue,
    definition.scrapValue,
    scheduledAtMs,
    scaling.healthPerMinute,
    scaling.damagePerMinute,
  ];
  if (inputs.some((value) => !Number.isFinite(value))) {
    throw new Error('Enemy scaling inputs must be finite');
  }

  const minutes = Math.max(0, scheduledAtMs) / 60_000;
  const result: ScaledEnemyStats = {
    maxHealth: definition.health * (1 + scaling.healthPerMinute * minutes),
    damage: definition.damage * (1 + scaling.damagePerMinute * minutes),
    speed: definition.speed,
    xpValue: definition.xpValue,
    scrapValue: definition.scrapValue,
  };

  if (Object.values(result).some((value) => !Number.isFinite(value))) {
    throw new Error('Enemy scaling result must be finite');
  }
  return result;
}
