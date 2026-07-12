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
  const attackSpeed = runState.stats.resolve('attackSpeed', 1);

  return {
    intervalMs: def.fireRateMs / Math.max(0.1, attackSpeed),
    damage: runState.stats.resolve('damage', def.damage),
    projectileSpeed: runState.stats.resolve('projectileSpeed', def.projectileSpeed),
    range: runState.stats.resolve('range', def.range),
    pierce: def.pierce,
    projectileCount: Math.max(
      1,
      Math.floor(runState.stats.resolve('projectileCount', def.projectileCount)),
    ),
    spreadDeg: def.spreadDeg,
  };
}
