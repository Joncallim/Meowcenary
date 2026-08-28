/**
 * Pure Gunsmith gameplay — no Phaser, no side effects.
 * Epic 23 (#87): persistent weapon engineering. Static PartDefinition data
 * stays separate from persistent player-owned PartInstance records. Craft,
 * merge, and infusion rules live here and return explicit results; the UI
 * never decides eligibility.
 *
 * Combination rules are bounded and validated: infusion transfers a single
 * trait onto a compatible target slot part (e.g. barrel + FIRE → incendiary
 * barrel). Trait/rarity caps prevent combinatorial explosion. Existing part
 * IDs are never special-cased — rules operate on slot/effect/trait
 * primitives only.
 */
import type { Modifier } from './stats';

export type PartSlot =
  | 'receiver'
  | 'barrel'
  | 'optic'
  | 'stock'
  | 'trigger'
  | 'magazine'
  | 'underbarrel'
  | 'trait';

export type BehaviorTrait = 'FIRE' | 'EXPLOSIVE' | 'PIERCING' | 'RICOCHET' | 'CHAIN' | 'CRYO' | 'TOXIC';

export const PART_SLOTS: readonly PartSlot[] = [
  'receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait',
] as const;

export const BEHAVIOR_TRAITS: readonly BehaviorTrait[] = [
  'FIRE', 'EXPLOSIVE', 'PIERCING', 'RICOCHET', 'CHAIN', 'CRYO', 'TOXIC',
] as const;

/** Trait infusion caps: how many behavior traits a single part may carry. */
export const MAX_TRAITS_PER_PART = 2;
/** Rarity ladder used for merge tiers. */
export const RARITY_TIER: Readonly<Record<string, number>> = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
});

export interface PartDefinition {
  readonly id: string;
  readonly name: string;
  readonly slot: PartSlot;
  readonly rarity: string;
  readonly tier: number;
  readonly effects: readonly Modifier[];
  readonly traits: readonly BehaviorTrait[];
}

/** Persistent player-owned instance — sparse, ID-stable, migration-safe. */
export interface OwnedPart {
  readonly instanceId: string;
  readonly partId: string;
  /** Transferable traits acquired via infusion (subset of the definition's). */
  readonly infusedTraits: readonly BehaviorTrait[];
}

/** A fitted weapon: one main gun with one part per non-trait slot. */
export interface WeaponBuild {
  readonly id: string;
  readonly name: string;
  readonly baseWeaponFamily: string;
  readonly fitted: Readonly<Partial<Record<PartSlot, string>>>;
  readonly traitParts: readonly string[];
}

// ── Slot compatibility ────────────────────────────────────────────────

/** Canonical weapon-slot compatibility: which part slots a family accepts. */
export const WEAPON_SLOT_COMPATIBILITY: Readonly<Record<string, readonly PartSlot[]>> = {
  pistol: ['receiver', 'barrel', 'optic', 'trigger'],
  smg: ['receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine'],
  shotgun: ['receiver', 'barrel', 'optic', 'stock', 'trigger', 'underbarrel'],
} as const;

export function isSlotCompatible(family: string, slot: PartSlot): boolean {
  // Trait parts fit every weapon (the infusion fantasy is universal).
  if (slot === 'trait') return true;
  return (WEAPON_SLOT_COMPATIBILITY[family] ?? []).includes(slot);
}

export function compatibleSlotsFor(family: string): readonly PartSlot[] {
  return WEAPON_SLOT_COMPATIBILITY[family] ?? [];
}

// ── Pure commands ─────────────────────────────────────────────────────

export type EquipResult =
  | { readonly ok: true; readonly build: WeaponBuild }
  | { readonly ok: false; readonly reason: 'unknown-part' | 'slot-incompatible' | 'slot-full' };

/**
 * Fits an owned part into a weapon build. Transactional: returns a new build
 * or a failure; never mutates input.
 */
export function equipPart(
  build: WeaponBuild,
  part: OwnedPart,
  definitions: ReadonlyMap<string, PartDefinition>,
): EquipResult {
  const definition = definitions.get(part.partId);
  if (!definition) return { ok: false, reason: 'unknown-part' };
  if (!isSlotCompatible(build.baseWeaponFamily, definition.slot)) {
    return { ok: false, reason: 'slot-incompatible' };
  }
  if (definition.slot === 'trait') {
    // Trait parts accumulate in traitParts (capped by MAX_TRAITS_PER_PART).
    if (build.traitParts.length >= MAX_TRAITS_PER_PART) return { ok: false, reason: 'slot-full' };
    return {
      ok: true,
      build: {
        ...build,
        traitParts: [...build.traitParts, part.partId],
      },
    };
  }
  if (build.fitted[definition.slot] !== undefined) return { ok: false, reason: 'slot-full' };
  return {
    ok: true,
    build: {
      ...build,
      fitted: { ...build.fitted, [definition.slot]: part.partId },
    },
  };
}

export type UnequipResult =
  | { readonly ok: true; readonly build: WeaponBuild }
  | { readonly ok: false; readonly reason: 'slot-empty' | 'unknown-part' };

/** Removes a fitted part (by definition id) from a build. */
export function unequipPart(build: WeaponBuild, partId: string): UnequipResult {
  if (build.traitParts.includes(partId)) {
    return { ok: true, build: { ...build, traitParts: build.traitParts.filter((id) => id !== partId) } };
  }
  const slot = Object.entries(build.fitted).find(([, id]) => id === partId)?.[0] as PartSlot | undefined;
  if (!slot) return { ok: false, reason: 'unknown-part' };
  const fitted = { ...build.fitted };
  delete fitted[slot];
  return { ok: true, build: { ...build, fitted } };
}

export type MergeResult =
  | { readonly ok: true; readonly output: OwnedPart; readonly consumed: readonly string[] }
  | { readonly ok: false; readonly reason: 'different-parts' | 'not-mergeable' | 'missing-parts' };

/**
 * Merges two owned copies of the SAME part into one upgraded copy.
 * Consumes exactly two instances, produces exactly one of the next tier
 * (rarity capped at legendary; tier +1). Returns the consumed instance ids.
 */
export function mergeParts(
  first: OwnedPart,
  second: OwnedPart,
  definitions: ReadonlyMap<string, PartDefinition>,
): MergeResult {
  if (first.partId !== second.partId) return { ok: false, reason: 'different-parts' };
  if (first.instanceId === second.instanceId) return { ok: false, reason: 'missing-parts' };
  const definition = definitions.get(first.partId);
  if (!definition) return { ok: false, reason: 'not-mergeable' };
  const currentTier = RARITY_TIER[definition.rarity] ?? 1;
  if (currentTier >= RARITY_TIER.legendary) return { ok: false, reason: 'not-mergeable' };

  const nextRarity = Object.entries(RARITY_TIER)
    .filter(([, tier]) => tier === currentTier + 1)
    .map(([rarity]) => rarity)[0];
  if (!nextRarity) return { ok: false, reason: 'not-mergeable' };

  return {
    ok: true,
    consumed: [first.instanceId, second.instanceId],
    output: Object.freeze({
      instanceId: `merged:${first.partId}:${first.instanceId.slice(-4)}${second.instanceId.slice(-4)}`,
      partId: first.partId,
      infusedTraits: Object.freeze([...first.infusedTraits, ...second.infusedTraits]
        .filter((trait, index, all) => all.indexOf(trait) === index)
        .slice(0, MAX_TRAITS_PER_PART)),
    }),
  };
}

export type InfuseResult =
  | { readonly ok: true; readonly output: OwnedPart }
  | {
      readonly ok: false;
      readonly reason: 'unknown-part' | 'unknown-trait' | 'trait-cap-reached' | 'trait-incompatible';
    };

/**
 * Infuses a transferable trait onto a target part (the hybrid-outcome core):
 * e.g. a conventional barrel + FIRE trait → an incendiary barrel. Deterministic;
 * rejects invalid slot/trait/cap combinations.
 */
export function infuseTrait(
  target: OwnedPart,
  traitPart: OwnedPart,
  definitions: ReadonlyMap<string, PartDefinition>,
): InfuseResult {
  const targetDef = definitions.get(target.partId);
  const traitDef = definitions.get(traitPart.partId);
  if (!targetDef) return { ok: false, reason: 'unknown-part' };
  if (!traitDef || !traitDef.traits.includes(traitDef.traits[0])) return { ok: false, reason: 'unknown-trait' };
  const trait = traitDef.traits[0];
  if (targetDef.slot === 'trait') return { ok: false, reason: 'trait-incompatible' };
  if (target.infusedTraits.length >= MAX_TRAITS_PER_PART) return { ok: false, reason: 'trait-cap-reached' };
  if (target.infusedTraits.includes(trait)) return { ok: false, reason: 'trait-cap-reached' };

  return {
    ok: true,
    output: Object.freeze({
      ...target,
      infusedTraits: Object.freeze([...target.infusedTraits, trait]),
    }),
  };
}

// ── Effective stat resolution ─────────────────────────────────────────

/**
 * Resolves the effective weapon modifiers from an assembled build: the sum of
 * every fitted part's effects plus trait-part effects. Single source of
 * truth — UI never duplicates these constants.
 */
export function resolveBuildModifiers(
  build: WeaponBuild,
  definitions: ReadonlyMap<string, PartDefinition>,
): readonly Modifier[] {
  const partIds = [
    ...Object.values(build.fitted),
    ...build.traitParts,
  ];
  const modifiers: Modifier[] = [];
  for (const partId of partIds) {
    const definition = definitions.get(partId);
    if (!definition) continue;
    modifiers.push(...definition.effects);
  }
  return modifiers;
}

/** Whether a build carries a given behavior trait (from any fitted part). */
export function buildHasTrait(
  build: WeaponBuild,
  trait: BehaviorTrait,
  definitions: ReadonlyMap<string, PartDefinition>,
): boolean {
  const partIds = [...Object.values(build.fitted), ...build.traitParts];
  return partIds.some((partId) => definitions.get(partId)?.traits.includes(trait));
}
