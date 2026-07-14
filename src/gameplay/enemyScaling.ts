import type { EnemyScalingDefinition, EnemyStats } from '../systems/types';

export interface ScaledEnemyStats {
  maxHealth: number;
  damage: number;
  speed: number;
  xpValue: number;
  scrapValue: number;
}

/**
 * Applies the curve's additive per-minute pressure at spawn time. Scheduling
 * jitter may produce fractional milliseconds. Times before the run starts are
 * intentionally clamped to zero so they receive exactly the base stats.
 */
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
  if (
    scaling.healthPerMinute < 0 ||
    scaling.healthPerMinute > 1 ||
    scaling.damagePerMinute < 0 ||
    scaling.damagePerMinute > 1
  ) {
    throw new Error('Enemy scaling rates must be from 0 through 1');
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
