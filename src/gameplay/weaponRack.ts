import type { RunState } from './runState';
import type { WeaponInstance, WeaponRegistry } from './weapons';
import type { WeaponDefinition } from '../systems/types';

/**
 * Rack-capacity invariant for the active weapon rack (Epic 14 §D2).
 * `RunState.equipped` remains the single authoritative rack array; this
 * constant is enforced at every acquisition mutation boundary.
 */
export const WEAPON_RACK_CAPACITY = 6;

export type WeaponAdmissionDecision =
  | { readonly status: 'can-add'; readonly definition: WeaponDefinition }
  | { readonly status: 'rack-full' }
  | { readonly status: 'invalid-definition'; readonly definitionId: string };

export type WeaponAdmissionResult =
  | { readonly status: 'added'; readonly weapon: WeaponInstance; readonly rackCount: number }
  | { readonly status: 'rack-full'; readonly rackCount: number }
  | { readonly status: 'invalid-definition'; readonly definitionId: string; readonly rackCount: number };

/**
 * Pure admission preflight (Epic 14 §D5): validates the definition ID before
 * checking capacity. No instance is allocated and nothing is mutated.
 */
export function evaluateWeaponAdmission(
  rack: readonly WeaponInstance[],
  definitionId: string,
  registry: Pick<WeaponRegistry, 'weaponById'>,
): WeaponAdmissionDecision {
  const definition = registry.weaponById(definitionId);
  if (!definition) {
    return { status: 'invalid-definition', definitionId };
  }
  if (rack.length >= WEAPON_RACK_CAPACITY) {
    return { status: 'rack-full' };
  }
  return { status: 'can-add', definition };
}

/**
 * Atomic capacity-checked grant (Epic 14 §D5): evaluates admission first and
 * only then calls `createWeaponInstance` exactly once and assigns the fresh
 * instance to the end of the rack. A rejected seventh pickup never burns a
 * `weapon-N` instance ID and never mutates the rack.
 */
export function grantWeaponToRack(
  runState: RunState,
  definitionId: string,
  registry: Pick<WeaponRegistry, 'weaponById' | 'createWeaponInstance'>,
): WeaponAdmissionResult {
  const decision = evaluateWeaponAdmission(runState.equipped, definitionId, registry);
  switch (decision.status) {
    case 'invalid-definition':
      return { status: 'invalid-definition', definitionId, rackCount: runState.equipped.length };
    case 'rack-full':
      return { status: 'rack-full', rackCount: runState.equipped.length };
    case 'can-add': {
      const weapon = registry.createWeaponInstance(decision.definition);
      runState.equipped = [...runState.equipped, weapon];
      return { status: 'added', weapon, rackCount: runState.equipped.length };
    }
  }
}
