/**
 * V4 Equipment gameplay — pure, no Phaser, no side effects.
 *
 * First-class Equipment Sets with one global upgrade policy.
 * Set owns Set facts; piece owns piece facts.
 * No provider-piece conventions.
 * No static definition tier.
 * Uses source-free ModifierSpec and shared tier scaling.
 */
import { evaluateCondition, type ProgressionCondition, type ConditionContext } from './conditionEvaluator';
import { scaleModifierByTier, type ModifierSpec } from './stats';
import { type BehaviorTrait } from './weaponTraits';
import rawEquipmentRules from '../data/equipment-rules.json';

export type EquipmentSlot = 'helmet' | 'armour' | 'gloves' | 'boots';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['helmet', 'armour', 'gloves', 'boots'];

/** V4 Equipment Set definition. */
export interface EquipmentSetDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unlock: ProgressionCondition;
  readonly pieceFabricationCost: number;
  readonly presentation: {
    readonly emblemArtId: string;
  };
  readonly setBonuses: {
    readonly 2?: {
      readonly modifiers: readonly ModifierSpec[];
      readonly weaponTraits?: readonly BehaviorTrait[];
    };
    readonly 4?: {
      readonly modifiers: readonly ModifierSpec[];
      readonly weaponTraits?: readonly BehaviorTrait[];
    };
  };
}

/** V4 Equipment piece definition. */
export interface EquipmentPieceDefinition {
  readonly id: string;
  readonly name: string;
  readonly setId: string;
  readonly slot: EquipmentSlot;
  readonly presentation: {
    readonly iconArtId: string;
  };
  readonly effects: readonly ModifierSpec[];
}

/** V4 Equipment upgrade policy (one global rule). */
export interface EquipmentUpgradePolicy {
  readonly unlocks: {
    readonly 2: ProgressionCondition;
    readonly 3: ProgressionCondition;
    readonly 4: ProgressionCondition;
  };
}

let upgradePolicy: EquipmentUpgradePolicy | null = null;

function getUpgradePolicy(): EquipmentUpgradePolicy {
  if (!upgradePolicy) {
    const raw = rawEquipmentRules as any;
    upgradePolicy = Object.freeze({
      unlocks: Object.freeze({
        2: raw.unlocks[2] as ProgressionCondition,
        3: raw.unlocks[3] as ProgressionCondition,
        4: raw.unlocks[4] as ProgressionCondition,
      }),
    });
  }
  return upgradePolicy;
}

/** Maximum equipment tier a player can upgrade to, based on global policy
 *  and historical capability floors. */
export function maxEquipmentTier(
  facts: ConditionContext,
  capabilityFloors?: readonly string[],
): 1 | 2 | 3 | 4 {
  const policy = getUpgradePolicy();
  const hasFloor = (tier: number) => capabilityFloors?.includes(`capability:equipment-tier-${tier}`);
  
  if (evaluateCondition(policy.unlocks[4], facts) || hasFloor(4)) return 4;
  if (evaluateCondition(policy.unlocks[3], facts) || hasFloor(3)) return 3;
  if (evaluateCondition(policy.unlocks[2], facts) || hasFloor(2)) return 2;
  return 1;
}

/** Check if a tier upgrade is currently available. */
export function canUpgradeEquipment(
  currentTier: number,
  facts: ConditionContext,
  capabilityFloors?: readonly string[],
): boolean {
  if (currentTier < 1 || currentTier >= 4) return false;
  const nextTier = (currentTier + 1) as 2 | 3 | 4;
  const maxTier = maxEquipmentTier(facts, capabilityFloors);
  return nextTier <= maxTier;
}

/** Deterministic upgrade cost for the next tier step. */
export function upgradeCost(currentTier: number): number {
  return 50 * (currentTier + 1);
}

/** Resolve a piece's modifiers with owned-tier scaling. */
export function resolvePieceModifiers(
  effects: readonly ModifierSpec[],
  ownedTier: number,
): Array<{ stat: string; op: 'add' | 'mult'; value: number }> {
  return effects.map((spec) => ({
    stat: spec.stat,
    op: spec.op,
    value: scaleModifierByTier(spec, ownedTier),
  }));
}

/** Resolve set bonus modifiers with the set's owned-tier scaling (always
 *  at tier 1 for the bonus itself, but piece tier scaling is separate). */
export function resolveSetBonusModifiers(
  bonuses: readonly ModifierSpec[],
): Array<{ stat: string; op: 'add' | 'mult'; value: number }> {
  return bonuses.map((spec) => ({
    stat: spec.stat,
    op: spec.op,
    value: spec.value, // Set bonuses don't scale with tier
  }));
}

/** Determine the deterministic owned instance ID for a piece. */
export function ownedEquipmentId(pieceId: string): string {
  return `owned:${pieceId}`;
}
