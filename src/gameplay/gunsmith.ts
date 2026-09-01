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
import type { ProjectileEffect } from './projectileEffects';

export type PartSlot =
  | 'receiver'
  | 'barrel'
  | 'optic'
  | 'stock'
  | 'trigger'
  | 'magazine'
  | 'underbarrel'
  | 'trait';

export type BehaviorTrait = 'FIRE' | 'EXPLOSIVE' | 'PIERCING';

export const PART_SLOTS: readonly PartSlot[] = [
  'receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait',
] as const;

export const BEHAVIOR_TRAITS: readonly BehaviorTrait[] = [
  'FIRE', 'EXPLOSIVE', 'PIERCING',
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

/** Registered live behavior for transferable traits.  Part catalog rows only
 * name typed traits; they never need per-ID runtime branches. */
export interface TraitBehavior {
  readonly modifier?: Omit<Modifier, 'sourceId' | 'scope'>;
  readonly projectileEffect?: ProjectileEffect;
}

export const TRAIT_BEHAVIORS: Readonly<Record<BehaviorTrait, TraitBehavior>> = Object.freeze({
  FIRE: { modifier: { stat: 'damage', op: 'mult', value: 1.15 } },
  // A grenade attachment detonates on its first impact; splash uses the
  // direct hit damage so all ordinary stat and tier modifiers still apply.
  EXPLOSIVE: { projectileEffect: { kind: 'explosive', radius: 80, damageMultiplier: 0.65 } },
  // Projectile piercing is already an authoritative combat primitive:
  // resolveWeaponStats -> Projectile.registerHit. Keeping it here makes an
  // infused PIERCING trait behave exactly like a native piercing part,
  // without any part-ID branch in GameScene or WeaponSystem.
  PIERCING: { modifier: { stat: 'pierce', op: 'add', value: 1 } },
});

/** Backwards-compatible view for stat-only consumers. */
export const TRAIT_MODIFIERS: Readonly<Partial<Record<BehaviorTrait, Omit<Modifier, 'sourceId' | 'scope'>>>> = Object.freeze(
  Object.fromEntries(Object.entries(TRAIT_BEHAVIORS)
    .filter(([, behavior]) => behavior.modifier !== undefined)
    .map(([trait, behavior]) => [trait, behavior.modifier])) as Partial<Record<BehaviorTrait, Omit<Modifier, 'sourceId' | 'scope'>>>,
);

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
  readonly tier: number;
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
  if (Object.values(build.fitted).includes(part.instanceId) || build.traitParts.includes(part.instanceId)) {
    return { ok: false, reason: 'slot-full' };
  }
  if (definition.slot === 'trait') {
    // Trait parts accumulate in traitParts (capped by MAX_TRAITS_PER_PART).
    if (build.traitParts.length >= MAX_TRAITS_PER_PART) return { ok: false, reason: 'slot-full' };
    return {
      ok: true,
      build: {
        ...build,
        traitParts: [...build.traitParts, part.instanceId],
      },
    };
  }
  if (build.fitted[definition.slot] !== undefined) return { ok: false, reason: 'slot-full' };
  return {
    ok: true,
    build: {
      ...build,
      fitted: { ...build.fitted, [definition.slot]: part.instanceId },
    },
  };
}

export type UnequipResult =
  | { readonly ok: true; readonly build: WeaponBuild }
  | { readonly ok: false; readonly reason: 'slot-empty' | 'unknown-part' };

/** Removes a fitted part by its owned instance ID, never by definition ID. */
export function unequipPart(build: WeaponBuild, instanceId: string): UnequipResult {
  if (build.traitParts.includes(instanceId)) {
    return { ok: true, build: { ...build, traitParts: build.traitParts.filter((id) => id !== instanceId) } };
  }
  const slot = Object.entries(build.fitted).find(([, id]) => id === instanceId)?.[0] as PartSlot | undefined;
  if (!slot) return { ok: false, reason: 'unknown-part' };
  const fitted = { ...build.fitted };
  delete fitted[slot];
  return { ok: true, build: { ...build, fitted } };
}

export type MergeResult =
  | { readonly ok: true; readonly output: OwnedPart; readonly consumed: readonly string[] }
  | { readonly ok: false; readonly reason: 'different-parts' | 'different-tiers' | 'not-mergeable' | 'missing-parts' };

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
  if (first.tier !== second.tier) return { ok: false, reason: 'different-tiers' };
  const definition = definitions.get(first.partId);
  if (!definition) return { ok: false, reason: 'not-mergeable' };
  const currentTier = Math.max(1, first.tier);
  if (currentTier >= RARITY_TIER.legendary) return { ok: false, reason: 'not-mergeable' };

  const nextRarity = Object.entries(RARITY_TIER)
    .filter(([, tier]) => tier === currentTier + 1)
    .map(([rarity]) => rarity)[0];
  if (!nextRarity) return { ok: false, reason: 'not-mergeable' };

  return {
    ok: true,
    consumed: [first.instanceId, second.instanceId],
    output: Object.freeze({
      // A durable owned ID, not a reconstructed definition ID.  Keep it in
      // the shared opaque-instance grammar (at most one namespace colon) so
      // Save V3 will round-trip merged output instead of silently dropping it.
      instanceId: `merged-${stableInstanceHash(`${first.partId}|${first.instanceId}|${second.instanceId}`)}`,
      partId: first.partId,
      tier: currentTier + 1,
      infusedTraits: Object.freeze([...first.infusedTraits, ...second.infusedTraits]
        .filter((trait, index, all) => all.indexOf(trait) === index)
        .slice(0, MAX_TRAITS_PER_PART)),
    }),
  };
}

function stableInstanceHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
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
  if (!traitDef || traitDef.slot !== 'trait' || traitDef.traits.length !== 1) return { ok: false, reason: 'unknown-trait' };
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
  ownedParts: ReadonlyMap<string, OwnedPart>,
): readonly Modifier[] {
  const modifiers: Modifier[] = [];
  for (const { part, definition } of resolvedBuildParts(build, definitions, ownedParts)) {
    for (const effect of definition.effects) {
      modifiers.push({
        ...effect,
        value: effect.value * Math.max(1, part.tier),
        sourceId: part.instanceId,
        // A persistent pistol build must not secretly improve an SMG that is
        // acquired later in the same run.  The existing stat resolver owns
        // family scope, so the Gunsmith contributes data rather than a new
        // parallel weapon-stat path.
        scope: { kind: 'weapon-family', family: build.baseWeaponFamily },
      });
    }
  }
  return modifiers;
}

/** Whether a build carries a given behavior trait (from any fitted part). */
export function buildHasTrait(
  build: WeaponBuild,
  trait: BehaviorTrait,
  definitions: ReadonlyMap<string, PartDefinition>,
  ownedParts: ReadonlyMap<string, OwnedPart>,
): boolean {
  return resolvedBuildParts(build, definitions, ownedParts).some(({ part, definition }) =>
    definition.traits.includes(trait) || part.infusedTraits.includes(trait));
}

/** Persistent saves are untrusted input: one owned instance may contribute
 * through exactly one compatible, definition-matching slot. */
function resolvedBuildParts(
  build: WeaponBuild,
  definitions: ReadonlyMap<string, PartDefinition>,
  ownedParts: ReadonlyMap<string, OwnedPart>,
): readonly { readonly part: OwnedPart; readonly definition: PartDefinition }[] {
  const resolved: Array<{ readonly part: OwnedPart; readonly definition: PartDefinition }> = [];
  const seen = new Set<string>();
  const accept = (instanceId: string | undefined, slot: PartSlot): void => {
    if (!instanceId || seen.has(instanceId) || !isSlotCompatible(build.baseWeaponFamily, slot)) return;
    const part = ownedParts.get(instanceId);
    const definition = part === undefined ? undefined : definitions.get(part.partId);
    if (!part || !definition || definition.slot !== slot) return;
    seen.add(instanceId);
    resolved.push({ part, definition });
  };
  for (const [slot, instanceId] of Object.entries(build.fitted)) {
    if (!PART_SLOTS.includes(slot as PartSlot) || slot === 'trait') continue;
    accept(instanceId, slot as PartSlot);
  }
  for (const instanceId of build.traitParts) accept(instanceId, 'trait');
  return resolved;
}

/** Resolves registered trait behavior through the same family-aware weapon
 * stat stack as ordinary part modifiers. */
export function resolveBuildTraitModifiers(
  build: WeaponBuild,
  definitions: ReadonlyMap<string, PartDefinition>,
  ownedParts: ReadonlyMap<string, OwnedPart>,
): readonly Modifier[] {
  const modifiers: Modifier[] = [];
  for (const trait of BEHAVIOR_TRAITS) {
    const effect = TRAIT_BEHAVIORS[trait].modifier;
    if (!effect || !buildHasTrait(build, trait, definitions, ownedParts)) continue;
    modifiers.push({ ...effect, sourceId: `trait:${build.id}:${trait.toLowerCase()}`, scope: { kind: 'weapon-family', family: build.baseWeaponFamily } });
  }
  return modifiers;
}

/** Resolves behavior payloads alongside stat modifiers.  The typed payload is
 * consumed by WeaponSystem rather than re-interpreting Gunsmith IDs there. */
export function resolveBuildProjectileEffects(
  build: WeaponBuild,
  definitions: ReadonlyMap<string, PartDefinition>,
  ownedParts: ReadonlyMap<string, OwnedPart>,
): readonly ProjectileEffect[] {
  const effects: ProjectileEffect[] = [];
  for (const trait of BEHAVIOR_TRAITS) {
    const effect = TRAIT_BEHAVIORS[trait].projectileEffect;
    if (effect && buildHasTrait(build, trait, definitions, ownedParts)) effects.push(effect);
  }
  return Object.freeze(effects);
}
