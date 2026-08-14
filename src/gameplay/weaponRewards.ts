import type { Rng } from '../engine/rng';
import type { LootTableLookup } from '../systems/lootTables';
import { resolveLoot } from './loot';
import type { LootGrant } from './loot';

/** Dedicated T1 weapon reward table (Epic 14 §D10). Only T1 definitions may
 *  appear here; T2/T3 remain merge-earned. */
export const WEAPON_REWARD_TABLE_ID = 'weapon-world';

/** Epic 14 §D11 reward timing/placement tuning, sourced from
 *  `RuntimeConfig.gameplay.weaponRewards`. */
export interface WeaponRewardTimingConfig {
  readonly firstMinMs: number;
  readonly firstMaxMs: number;
  readonly repeatMinMs: number;
  readonly repeatMaxMs: number;
  readonly spawnOffset: number;
}

/** Range validation for reward timing configuration. Throws on malformed
 *  values so a broken constant fails fast instead of mis-scheduling rewards. */
export function assertWeaponRewardTiming(config: WeaponRewardTimingConfig): void {
  const ranges: ReadonlyArray<readonly [name: string, min: number, max: number]> = [
    ['firstMinMs', config.firstMinMs, config.firstMaxMs],
    ['repeatMinMs', config.repeatMinMs, config.repeatMaxMs],
  ];
  for (const [name, min, max] of ranges) {
    if (!Number.isSafeInteger(min) || min <= 0) {
      throw new Error(`Weapon reward timing "${name}" must be a positive integer`);
    }
    if (!Number.isSafeInteger(max) || max <= 0) {
      throw new Error(`Weapon reward timing "${name}" must be a positive integer`);
    }
    if (min > max) {
      throw new Error(`Weapon reward timing "${name}" minimum must not exceed its maximum`);
    }
  }
  if (!Number.isFinite(config.spawnOffset) || config.spawnOffset <= 0) {
    throw new Error('Weapon reward spawnOffset must be a positive finite number');
  }
}

/** Reward index 0 is always the starting weapon's definition — no weighted
 *  table draw is consumed (Epic 14 §D11). */
export function firstWeaponRewardGrant(startingDefinitionId: string): {
  readonly kind: 'weapon';
  readonly definitionId: string;
} {
  return { kind: 'weapon', definitionId: startingDefinitionId };
}

/** Later rewards resolve from the dedicated T1 `weapon-world` table using the
 *  provided weapon-reward stream (never the loot stream). Accepts exactly one
 *  `weapon` grant; anything else is a data/config defect and throws. */
export function resolveLaterWeaponReward(
  lookup: LootTableLookup,
  rng: Pick<Rng, 'next'>,
): LootGrant {
  const grants = resolveLoot(WEAPON_REWARD_TABLE_ID, lookup, rng);
  if (grants.length !== 1 || grants[0].kind !== 'weapon') {
    throw new Error(
      `Weapon reward table "${WEAPON_REWARD_TABLE_ID}" must resolve exactly one weapon grant`,
    );
  }
  return grants[0];
}

/** Deterministic first reward deadline in inclusive `[firstMinMs, firstMaxMs]`
 *  drawn only from the provided weapon-reward stream. */
export function firstWeaponRewardDeadlineMs(
  rng: Pick<Rng, 'int'>,
  config: WeaponRewardTimingConfig,
): number {
  return rng.int(config.firstMinMs, config.firstMaxMs);
}

/** Advances the schedule from the previous deadline — never from the current
 *  frame time — so coarse update deltas cannot shift the reward timeline. */
export function nextWeaponRewardDeadlineMs(
  previousDeadlineMs: number,
  rng: Pick<Rng, 'int'>,
  config: WeaponRewardTimingConfig,
): number {
  return previousDeadlineMs + rng.int(config.repeatMinMs, config.repeatMaxMs);
}
