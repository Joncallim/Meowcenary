import type { RunState } from './runState';
import type { WeaponDefinition } from '../systems/types';

export interface EffectiveWeaponStats {
  intervalMs: number;
  damage: number;
  projectileSpeed: number;
  range: number;
  pierce: number;
  projectileCount: number;
  spreadDeg: number;
}

export function resolveWeaponStats(runState: RunState, def: WeaponDefinition): EffectiveWeaponStats {
  const family = def.family;
  const attackSpeed = runState.stats.resolveWeapon('attackSpeed', 1, family);

  return {
    intervalMs: def.fireRateMs / Math.max(0.1, attackSpeed),
    damage: runState.stats.resolveWeapon('damage', def.damage, family),
    projectileSpeed: runState.stats.resolveWeapon('projectileSpeed', def.projectileSpeed, family),
    range: runState.stats.resolveWeapon('range', def.range, family),
    // Epic 18 (D4): pierce/spreadDeg now flow through the same weapon-aware
    // resolver as every other stat; post-resolution clamps stay explicit so
    // a negative/fractional aggregate can never reach projectile math.
    pierce: Math.max(0, Math.floor(runState.stats.resolveWeapon('pierce', def.pierce, family))),
    projectileCount: Math.max(
      1,
      Math.floor(runState.stats.resolveWeapon('projectileCount', def.projectileCount, family)),
    ),
    spreadDeg: Math.max(0, runState.stats.resolveWeapon('spreadDeg', def.spreadDeg, family)),
  };
}
