/**
 * EnemyDamageResolver — one narrow post-damage lethal settlement boundary.
 *
 * Every lethal source must converge through this resolver to guarantee:
 *   - runState.kills is incremented exactly once per alive→dead transition
 *   - enemy:killed is emitted exactly once
 *   - shield blocks, non-lethal damage, and post-death hits are handled
 *     correctly without double-counting
 *
 * Enemy.takeDamage() remains the authoritative health/shield/death-state
 * owner; this resolver wraps it to add the shared kill-settlement side
 * effects that every caller previously duplicated (or omitted).
 */
import type { Enemy } from '../entities/Enemy';
import type { EventBus } from '../engine/eventBus';
import type { RunState } from './runState';

export interface EnemyDamageResult {
  /** Whether damage was applied (false = shield block / already dead). */
  readonly applied: boolean;
  /** Whether the enemy transitioned alive→dead by this hit. */
  readonly killed: boolean;
}

/**
 * Apply damage to an enemy through the universal lethal-settlement boundary.
 *
 * - Delegates to Enemy.takeDamage() for health/shield/block/death-state logic
 * - On the ONE alive→dead transition: increments runState.kills and emits
 *   exactly one canonical enemy:killed event
 * - Returns { applied, killed } for callers that need to react to kills
 *   (e.g. objective tracking, achievements, drops)
 *
 * This is the ONLY place that may increment runState.kills or emit
 * enemy:killed for a damage source.  Do not duplicate that logic elsewhere.
 */
export function applyEnemyDamage(
  enemy: Enemy,
  amount: number,
  runState: RunState,
  bus: EventBus,
  source?: Readonly<{ x: number; y: number }>,
): EnemyDamageResult {
  const killed = enemy.takeDamage(amount, source);

  if (killed) {
    runState.kills += 1;
    bus.emit('enemy:killed', {
      instanceId: enemy.instanceId,
      enemyId: enemy.defId,
      xpValue: enemy.xpValue,
      scrapValue: enemy.scrapValue,
      ...(enemy.definition.lootTableId ? { lootTableId: enemy.definition.lootTableId } : {}),
      x: enemy.x,
      y: enemy.y,
    });
    return { applied: true, killed: true };
  }

  // takeDamage returned false. Distinguish "damage applied but non-lethal"
  // from "blocked (shield/already dead/invalid)": if the enemy is still
  // active and not dead, the hit was applied as non-lethal damage.
  return { applied: enemy.active && enemy.state !== 'dead', killed: false };
}
