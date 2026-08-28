/**
 * Pure Equipment gameplay — no Phaser, no side effects. Epic 25.
 *
 * Persistent loadout layer: 4 slots (helmet/armour/gloves/boots), equipment
 * set families with 2-piece and 4-piece set bonuses, tier progression, and
 * coin-funded upgrades. Commands are pure/transactional and return explicit
 * results; the UI never decides eligibility.
 */
import type { Modifier } from './stats';

export type EquipmentSlot = 'helmet' | 'armour' | 'gloves' | 'boots';

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['helmet', 'armour', 'gloves', 'boots'] as const;

export const EQUIPMENT_TIERS = ['standard', 'advanced', 'elite', 'legendary'] as const;
export type EquipmentTier = (typeof EQUIPMENT_TIERS)[number];

export interface EquipmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly setId: string;
  readonly slot: EquipmentSlot;
  readonly tier: number;
  readonly effects: readonly Modifier[];
  /** Optional data-owned 2/4-piece table. One representative piece may carry
   * it so a complete future set needs no central runtime registration. */
  readonly setBonuses?: Readonly<Partial<Record<2 | 4, readonly Modifier[]>>>;
}

/** Set bonus table: set id → piece-count bonuses (2-piece, 4-piece). */
export interface SetBonusDefinition {
  readonly setId: string;
  readonly name: string;
  readonly bonuses: Readonly<Partial<Record<2 | 4, readonly Modifier[]>>>;
}

export const SET_BONUSES: Readonly<Record<string, SetBonusDefinition>> = {
  'set:commando': {
    setId: 'set:commando',
    name: 'Commando',
    bonuses: {
      2: [{ stat: 'attackSpeed', op: 'mult', value: 1.1, sourceId: 'set:commando:2' }],
      4: [{ stat: 'spreadDeg', op: 'add', value: -4, sourceId: 'set:commando:4' }],
    },
  },
  'set:scavenger': {
    setId: 'set:scavenger',
    name: 'Scavenger',
    bonuses: {
      2: [{ stat: 'currencyGain', op: 'mult', value: 1.15, sourceId: 'set:scavenger:2' }],
      4: [{ stat: 'pickupRadius', op: 'add', value: 30, sourceId: 'set:scavenger:4' }],
    },
  },
  'set:juggernaut': {
    setId: 'set:juggernaut',
    name: 'Juggernaut',
    bonuses: {
      2: [{ stat: 'maxHealth', op: 'mult', value: 1.1, sourceId: 'set:juggernaut:2' }],
      4: [{ stat: 'maxHealth', op: 'add', value: 40, sourceId: 'set:juggernaut:4' }],
    },
  },
  'set:demolition': {
    setId: 'set:demolition',
    name: 'Demolition',
    bonuses: {
      2: [{ stat: 'damage', op: 'mult', value: 1.08, sourceId: 'set:demolition:2' }],
      4: [{ stat: 'damage', op: 'mult', value: 1.15, sourceId: 'set:demolition:4' }],
    },
  },
  'set:pyro': {
    setId: 'set:pyro',
    name: 'Pyro',
    bonuses: {
      2: [{ stat: 'damage', op: 'mult', value: 1.06, sourceId: 'set:pyro:2' }],
      4: [{ stat: 'damage', op: 'mult', value: 1.12, sourceId: 'set:pyro:4' }],
    },
  },
  'set:recon': {
    setId: 'set:recon',
    name: 'Recon',
    bonuses: {
      2: [{ stat: 'moveSpeed', op: 'mult', value: 1.06, sourceId: 'set:recon:2' }],
      4: [{ stat: 'range', op: 'add', value: 30, sourceId: 'set:recon:4' }],
    },
  },
  'set:technician': {
    setId: 'set:technician',
    name: 'Technician',
    bonuses: {
      2: [{ stat: 'attackSpeed', op: 'mult', value: 1.05, sourceId: 'set:technician:2' }],
      4: [{ stat: 'attackSpeed', op: 'mult', value: 1.12, sourceId: 'set:technician:4' }],
    },
  },
  'set:medic': {
    setId: 'set:medic',
    name: 'Medic',
    bonuses: {
      2: [{ stat: 'maxHealth', op: 'add', value: 20, sourceId: 'set:medic:2' }],
      4: [{ stat: 'maxHealth', op: 'mult', value: 1.1, sourceId: 'set:medic:4' }],
    },
  },
} as const satisfies Readonly<Record<string, SetBonusDefinition>>;

/** Persistent owned instance (Save V3 equipment domain shape). */
export interface OwnedEquipment {
  readonly instanceId: string;
  readonly equipmentId: string;
  readonly tier: number;
}

/** Equipped loadout: one piece per slot. */
export interface EquipmentLoadout {
  /** Values are opaque owned instance IDs, never catalog definition IDs. */
  readonly equipped: Readonly<Partial<Record<EquipmentSlot, string>>>;
}

// ── Set bonus calculation ─────────────────────────────────────────────

/**
 * Counts equipped pieces per set and returns the active set bonuses
 * (2-piece and 4-piece thresholds). Mixed sets are viable: each set is
 * counted independently.
 */
export function resolveSetBonuses(
  loadout: EquipmentLoadout,
  definitions: ReadonlyMap<string, EquipmentDefinition>,
  owned: ReadonlyMap<string, OwnedEquipment>,
): readonly Modifier[] {
  const setCounts = new Map<string, number>();
  for (const [slot, instanceId] of Object.entries(loadout.equipped) as [EquipmentSlot, string | undefined][]) {
    const instance = instanceId && owned.get(instanceId);
    const definition = instance && definitions.get(instance.equipmentId);
    if (!definition || definition.slot !== slot) continue;
    setCounts.set(definition.setId, (setCounts.get(definition.setId) ?? 0) + 1);
  }

  const modifiers: Modifier[] = [];
  for (const [setId, count] of setCounts) {
    const dataBonuses = [...definitions.values()].find((definition) => definition.setId === setId && definition.setBonuses !== undefined)?.setBonuses;
    const bonus = dataBonuses === undefined ? SET_BONUSES[setId]?.bonuses : dataBonuses;
    if (!bonus) continue;
    // Threshold bonuses stack: a four-piece set retains the two-piece payoff
    // as well as gaining its four-piece capstone.
    if (count >= 2 && bonus[2]) modifiers.push(...bonus[2]);
    if (count >= 4 && bonus[4]) modifiers.push(...bonus[4]);
  }
  return modifiers;
}

// ── Pure commands ─────────────────────────────────────────────────────

export type EquipEquipmentResult =
  | { readonly ok: true; readonly loadout: EquipmentLoadout }
  | { readonly ok: false; readonly reason: 'unknown-equipment' | 'slot-full' };

/** Equips an owned piece; replaces any piece in the same slot. */
export function equipEquipment(
  loadout: EquipmentLoadout,
  instanceId: string,
  definitions: ReadonlyMap<string, EquipmentDefinition>,
  owned: ReadonlyMap<string, OwnedEquipment>,
): EquipEquipmentResult {
  const instance = owned.get(instanceId);
  const definition = instance && definitions.get(instance.equipmentId);
  if (!definition) return { ok: false, reason: 'unknown-equipment' };
  return {
    ok: true,
    loadout: {
      equipped: { ...loadout.equipped, [definition.slot]: instanceId },
    },
  };
}

export type UnequipEquipmentResult =
  | { readonly ok: true; readonly loadout: EquipmentLoadout }
  | { readonly ok: false; readonly reason: 'slot-empty' };

export function unequipEquipment(loadout: EquipmentLoadout, slot: EquipmentSlot): UnequipEquipmentResult {
  if (loadout.equipped[slot] === undefined) return { ok: false, reason: 'slot-empty' };
  const equipped = { ...loadout.equipped };
  delete equipped[slot];
  return { ok: true, loadout: { equipped } };
}

export type UpgradeEquipmentResult =
  | { readonly ok: true; readonly output: OwnedEquipment; readonly cost: number }
  | { readonly ok: false; readonly reason: 'unknown-equipment' | 'max-tier' | 'insufficient-funds' };

/** Coin-funded tier upgrade: consumes funds, raises tier by one. */
export function upgradeEquipment(
  owned: OwnedEquipment,
  funds: number,
  definitions: ReadonlyMap<string, EquipmentDefinition>,
): UpgradeEquipmentResult {
  const definition = definitions.get(owned.equipmentId);
  if (!definition) return { ok: false, reason: 'unknown-equipment' };
  if (owned.tier >= EQUIPMENT_TIERS.length) return { ok: false, reason: 'max-tier' };
  const cost = upgradeCost(owned.tier);
  if (funds < cost) return { ok: false, reason: 'insufficient-funds' };
  return {
    ok: true,
    cost,
    output: Object.freeze({ ...owned, tier: owned.tier + 1 }),
  };
}

/** Deterministic coin cost per tier step (no RNG, no menus). */
export function upgradeCost(currentTier: number): number {
  return 50 * (currentTier + 1);
}

// ── Effective stat resolution ─────────────────────────────────────────

/** Piece effects + active set bonuses — single source of truth. */
export function resolveEquipmentModifiers(
  loadout: EquipmentLoadout,
  definitions: ReadonlyMap<string, EquipmentDefinition>,
  owned: ReadonlyMap<string, OwnedEquipment>,
): readonly Modifier[] {
  const modifiers: Modifier[] = [];
  for (const [slot, instanceId] of Object.entries(loadout.equipped) as [EquipmentSlot, string | undefined][]) {
    const instance = instanceId && owned.get(instanceId);
    const definition = instance && definitions.get(instance.equipmentId);
    if (!instance || !definition || definition.slot !== slot) continue;
    for (const effect of definition.effects) {
      const tier = Math.max(1, Math.min(EQUIPMENT_TIERS.length, instance.tier));
      const value = effect.op === 'mult'
        ? 1 + (effect.value - 1) * tier
        : effect.value * tier;
      modifiers.push({ ...effect, value, sourceId: instance.instanceId });
    }
  }
  modifiers.push(...resolveSetBonuses(loadout, definitions, owned));
  return modifiers;
}
