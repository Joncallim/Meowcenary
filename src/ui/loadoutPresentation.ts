import { deepFreeze } from '../engine/freeze';
import { scaleModifierByTier, WEAPON_MODIFIER_STAT_KEYS, type ModifierSpec, type ModifierStatKey } from '../gameplay/stats';
import { getWeaponFamily } from '../gameplay/weaponFamilies';
import type { BehaviorTrait } from '../gameplay/weaponTraits';

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
  readonly modifier: ModifierSpec;
}
export interface LoadoutTraitPresentation {
  readonly kind: 'trait';
  readonly trait: BehaviorTrait;
  readonly label: string;
  readonly target: LoadoutEffectTarget;
}
export type LoadoutEffectPresentation = LoadoutModifierPresentation | LoadoutTraitPresentation;

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
export function presentLoadoutModifier(effect: ModifierSpec, tier = 1): LoadoutModifierPresentation {
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
