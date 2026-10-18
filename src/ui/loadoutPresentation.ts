import { deepFreeze } from '../engine/freeze';
import { scaleModifierByTier, WEAPON_MODIFIER_STAT_KEYS, type Modifier, type ModifierSpec, type ModifierStatKey } from '../gameplay/stats';
import { getWeaponFamily } from '../gameplay/weaponFamilies';
import type { BehaviorTrait } from '../gameplay/weaponTraits';
import type { ProjectileEffect } from '../gameplay/projectileEffects';
import type { EffectiveWeaponStats } from '../gameplay/weaponStats';

export type LoadoutState = 'EQUIPPED' | 'STORED' | 'ACTIVE' | 'LOCKED' | 'FABRICABLE' | 'REWARD ONLY';
export type LoadoutEffectTarget =
  | { readonly kind: 'mercenary'; readonly label: 'Mercenary' }
  | { readonly kind: 'all-weapons'; readonly label: 'All Weapons' }
  | { readonly kind: 'weapon-family'; readonly familyId: string; readonly label: string };

const STAT_LABELS: Readonly<Record<ModifierStatKey, string>> = Object.freeze({
  moveSpeed: 'Move Speed', maxHealth: 'Max Health', armor: 'Armour',
  damage: 'Damage', attackSpeed: 'Fire Rate', projectileSpeed: 'Projectile Speed',
  projectileCount: 'Projectiles', range: 'Range', critChance: 'Critical Chance',
  pickupRadius: 'Pickup Radius', xpGain: 'XP Gain', currencyGain: 'Scrap Gain',
  pierce: 'Pierce', spreadDeg: 'Accuracy',
});

export interface LoadoutModifierPresentation {
  readonly kind: 'modifier';
  readonly stat: ModifierStatKey;
  readonly label: string;
  readonly value: string;
  readonly text: string;
  readonly target: LoadoutEffectTarget;
  /** Runtime comparisons retain the authoritative source ID even though
   * static presentation effects remain source-free. */
  readonly modifier: ModifierSpec & { readonly sourceId?: string };
}
export interface LoadoutTraitPresentation {
  readonly kind: 'trait';
  readonly trait: BehaviorTrait;
  readonly label: string;
  readonly target: LoadoutEffectTarget;
}
export type LoadoutEffectPresentation = LoadoutModifierPresentation | LoadoutTraitPresentation;

/** Shared resolved run truth consumed by Equipment and Gunsmith comparison
 * surfaces. Keeping this structural avoids making either UI controller own
 * the other feature's domain model. */
export interface LoadoutRunTruth {
  readonly modifiers: readonly Modifier[];
  readonly families: readonly {
    readonly familyId: string;
    readonly projectileEffects: readonly ProjectileEffect[];
    readonly traits: readonly {
      readonly trait: BehaviorTrait;
      readonly sourceIds: readonly string[];
      readonly sourceLabels: readonly string[];
      readonly deduplicated: boolean;
    }[];
  }[];
}

export interface LoadoutModifierDelta {
  readonly stat: ModifierStatKey;
  readonly label: string;
  readonly target: LoadoutEffectTarget;
  readonly before?: LoadoutModifierPresentation;
  readonly after?: LoadoutModifierPresentation;
  readonly beforeValue?: string;
  readonly afterValue?: string;
  readonly state: 'added' | 'removed' | 'changed';
}

export interface LoadoutTraitDelta {
  readonly familyId: string;
  readonly trait: BehaviorTrait;
  readonly target: LoadoutEffectTarget;
  readonly before: boolean;
  readonly after: boolean;
  readonly beforeDeduplicated: boolean;
  readonly afterDeduplicated: boolean;
  readonly beforeSourceIds: readonly string[];
  readonly afterSourceIds: readonly string[];
  readonly beforeSourceLabels: readonly string[];
  readonly afterSourceLabels: readonly string[];
  readonly sourceChanged: boolean;
}

export interface LoadoutProjectileEffectDelta {
  readonly familyId: string;
  readonly before: readonly ProjectileEffect[];
  readonly after: readonly ProjectileEffect[];
}

export interface LoadoutRunTruthComparison {
  readonly modifiers: readonly LoadoutModifierDelta[];
  readonly traits: readonly LoadoutTraitDelta[];
  readonly projectileEffects: readonly LoadoutProjectileEffectDelta[];
}

type ComparableModifier = ModifierSpec & { readonly sourceId?: string };

function comparableModifierKey(modifier: ComparableModifier): string {
  return JSON.stringify([modifier.sourceId ?? '', modifier.stat, modifier.op, modifier.scope]);
}

/** Resolve effect, trait, and projectile changes once for all Loadout and
 * Gunsmith consumers. Surfaces may format these facts, but never infer them
 * from prose or raw modifier keys. */
export function presentLoadoutRunTruthComparison(
  before: LoadoutRunTruth,
  after: LoadoutRunTruth,
): LoadoutRunTruthComparison {
  const group = (truth: LoadoutRunTruth): ReadonlyMap<string, ComparableModifier> => {
    const duplicates = new Map<string, number>();
    return new Map(truth.modifiers.map((modifier) => {
      const base = comparableModifierKey(modifier);
      const index = duplicates.get(base) ?? 0;
      duplicates.set(base, index + 1);
      return [`${base}:${index}`, modifier] as const;
    }));
  };
  const beforeModifiers = group(before);
  const afterModifiers = group(after);
  const modifiers: LoadoutModifierDelta[] = [];
  for (const key of new Set([...beforeModifiers.keys(), ...afterModifiers.keys()])) {
    const previous = beforeModifiers.get(key);
    const current = afterModifiers.get(key);
    if (previous?.value === current?.value) continue;
    const beforePresentation = previous === undefined ? undefined : presentLoadoutModifier(previous);
    const afterPresentation = current === undefined ? undefined : presentLoadoutModifier(current);
    const sample = afterPresentation ?? beforePresentation!;
    modifiers.push({
      stat: sample.stat, label: sample.label, target: sample.target,
      ...(beforePresentation === undefined ? {} : { before: beforePresentation, beforeValue: beforePresentation.value }),
      ...(afterPresentation === undefined ? {} : { after: afterPresentation, afterValue: afterPresentation.value }),
      state: previous === undefined ? 'added' : current === undefined ? 'removed' : 'changed',
    });
  }

  const beforeFamilies = new Map(before.families.map((family) => [family.familyId, family] as const));
  const afterFamilies = new Map(after.families.map((family) => [family.familyId, family] as const));
  const traits: LoadoutTraitDelta[] = [];
  const projectileEffects: LoadoutProjectileEffectDelta[] = [];
  for (const familyId of new Set([...beforeFamilies.keys(), ...afterFamilies.keys()])) {
    const previous = beforeFamilies.get(familyId);
    const current = afterFamilies.get(familyId);
    const beforeTraits = new Map(previous?.traits.map((trait) => [trait.trait, trait] as const));
    const afterTraits = new Map(current?.traits.map((trait) => [trait.trait, trait] as const));
    for (const trait of new Set([...beforeTraits.keys(), ...afterTraits.keys()])) {
      const oldTrait = beforeTraits.get(trait);
      const newTrait = afterTraits.get(trait);
      const beforeSourceLabels = oldTrait?.sourceLabels ?? [];
      const afterSourceLabels = newTrait?.sourceLabels ?? [];
      const sourceChanged = JSON.stringify(oldTrait?.sourceIds ?? []) !== JSON.stringify(newTrait?.sourceIds ?? [])
        || JSON.stringify(beforeSourceLabels) !== JSON.stringify(afterSourceLabels);
      if (oldTrait?.deduplicated === newTrait?.deduplicated && (oldTrait !== undefined) === (newTrait !== undefined) && !sourceChanged) continue;
      traits.push({ familyId, trait, target: presentLoadoutTrait(trait, familyId).target,
        before: oldTrait !== undefined, after: newTrait !== undefined,
        beforeDeduplicated: oldTrait?.deduplicated ?? false, afterDeduplicated: newTrait?.deduplicated ?? false,
        beforeSourceIds: oldTrait?.sourceIds ?? [], afterSourceIds: newTrait?.sourceIds ?? [],
        beforeSourceLabels, afterSourceLabels, sourceChanged });
    }
    const beforeEffects = previous?.projectileEffects ?? [];
    const afterEffects = current?.projectileEffects ?? [];
    if (JSON.stringify(beforeEffects) !== JSON.stringify(afterEffects)) {
      projectileEffects.push({ familyId, before: beforeEffects, after: afterEffects });
    }
  }
  return deepFreeze({ modifiers, traits, projectileEffects });
}

export function resolveLoadoutEffectTarget(effect: Pick<ModifierSpec, 'stat' | 'scope'>): LoadoutEffectTarget {
  if (effect.scope) {
    if (effect.scope.kind !== 'weapon-family') throw new Error('Unsupported Loadout modifier scope');
    return Object.freeze({ kind: 'weapon-family', familyId: effect.scope.family,
      label: getWeaponFamily(effect.scope.family)?.name ?? effect.scope.family });
  }
  return (WEAPON_MODIFIER_STAT_KEYS as readonly string[]).includes(effect.stat)
    ? Object.freeze({ kind: 'all-weapons', label: 'All Weapons' })
    : Object.freeze({ kind: 'mercenary', label: 'Mercenary' });
}

function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

/** Lower spread is better; multiplicative spread is a percentage rather
 * than degrees. The same vocabulary is consumed by Equipment and Gunsmith. */
export function presentLoadoutModifier(effect: ModifierSpec & { readonly sourceId?: string }, tier = 1): LoadoutModifierPresentation {
  const scaled = scaleModifierByTier(effect, tier);
  const lowerIsBetter = effect.stat === 'spreadDeg';
  const percent = effect.op === 'mult' || effect.stat === 'attackSpeed' || effect.stat === 'critChance';
  const amount = effect.op === 'mult' ? (scaled - 1) * 100 : percent ? scaled * 100 : scaled;
  const value = `${signed(lowerIsBetter ? -amount : amount)}${percent ? '%' : lowerIsBetter ? '°' : ''}`;
  const label = STAT_LABELS[effect.stat];
  return deepFreeze({ kind: 'modifier', stat: effect.stat, label, value, text: `${value} ${label}`,
    target: resolveLoadoutEffectTarget(effect), modifier: { ...effect, value: scaled, ...(effect.scope ? { scope: { ...effect.scope } } : {}) } });
}

export function presentLoadoutTrait(trait: BehaviorTrait, familyId?: string): LoadoutTraitPresentation {
  return deepFreeze({ kind: 'trait', trait, label: trait,
    target: familyId === undefined ? { kind: 'all-weapons', label: 'All Weapons' }
      : { kind: 'weapon-family', familyId, label: getWeaponFamily(familyId)?.name ?? familyId } });
}

export function loadoutStatImprovement(stat: ModifierStatKey, before: number, after: number): 'better' | 'worse' | 'same' {
  if (before === after) return 'same';
  return (stat === 'spreadDeg' ? after < before : after > before) ? 'better' : 'worse';
}

export interface LoadoutWeaponStatDelta {
  readonly key: keyof EffectiveWeaponStats;
  readonly label: string;
  readonly before: number;
  readonly after: number;
  readonly displayBefore: string;
  readonly displayAfter: string;
  readonly direction: 'better' | 'worse' | 'neutral';
}

/** Same vocabulary as piece effects; values are already production-resolved.
 * Fire interval is displayed as shots/second, and lower spread as Accuracy.
 */
export function presentLoadoutWeaponStats(before: EffectiveWeaponStats, after: EffectiveWeaponStats): readonly LoadoutWeaponStatDelta[] {
  const format = (key: keyof EffectiveWeaponStats, value: number): string => {
    const shown = key === 'intervalMs' ? 1000 / value : value;
    const number = Number.isInteger(shown) ? `${shown}` : shown.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${number}${key === 'intervalMs' ? '/s' : key === 'spreadDeg' ? '° spread' : ''}`;
  };
  return deepFreeze((Object.keys(before) as (keyof EffectiveWeaponStats)[]).map(key => ({
    key, label: key === 'intervalMs' ? STAT_LABELS.attackSpeed : STAT_LABELS[key],
    before: before[key], after: after[key],
    displayBefore: format(key, before[key]), displayAfter: format(key, after[key]),
    direction: Math.abs(before[key] - after[key]) < 1e-9 ? 'neutral'
      : (key === 'intervalMs' || key === 'spreadDeg' ? after[key] < before[key] : after[key] > before[key]) ? 'better' : 'worse',
  })));
}
