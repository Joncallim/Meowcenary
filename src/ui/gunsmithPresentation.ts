import { scaleModifierByTier, type ModifierSpec } from '../gameplay/stats';
import type { PartSlot } from '../gameplay/gunsmith';

/** Fixed player-facing order.  Family compatibility remains data-owned by
 * weaponFamilies; this only prevents an alphabetical inventory presentation. */
export const GUNSMITH_SLOT_ORDER: readonly PartSlot[] = Object.freeze([
  'receiver', 'barrel', 'optic', 'stock', 'trigger', 'magazine', 'underbarrel', 'trait',
]);

const SLOT_LABELS: Readonly<Record<PartSlot, string>> = Object.freeze({
  receiver: 'Receiver',
  barrel: 'Barrel',
  optic: 'Optic',
  stock: 'Stock',
  trigger: 'Trigger',
  magazine: 'Magazine',
  underbarrel: 'Underbarrel',
  trait: 'Traits',
});

const STAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  attackSpeed: 'Fire rate',
  damage: 'Damage',
  range: 'Range',
  projectileSpeed: 'Projectile speed',
  spreadDeg: 'Accuracy',
  projectileCount: 'Projectile',
  pierce: 'Pierce',
});

export function gunsmithSlotLabel(slot: PartSlot): string {
  return SLOT_LABELS[slot];
}

/** Formats authoritative scaled effects without exposing implementation keys. */
export function formatGunsmithEffect(effect: ModifierSpec, tier: number): string {
  const value = scaleModifierByTier(effect, Math.max(1, tier));
  if (effect.stat === 'spreadDeg') {
    const accuracy = -value;
    return `Accuracy ${accuracy >= 0 ? '+' : ''}${formatNumber(accuracy)}°`;
  }
  if (effect.stat === 'projectileCount' || effect.stat === 'pierce') {
    return `+${formatNumber(value)} ${STAT_LABELS[effect.stat]!.toLowerCase()}`;
  }
  const label = STAT_LABELS[effect.stat] ?? effect.stat;
  // Attack speed is stored as either an additive ratio (the compact receiver)
  // or a multiplier (the hair trigger); both describe the same player-facing
  // percentage instead of leaking two internal representations.
  if (effect.stat === 'attackSpeed') {
    const percentage = effect.op === 'mult' ? Math.round((value - 1) * 100) : Math.round(value * 100);
    return `${label} ${percentage >= 0 ? '+' : ''}${percentage}%`;
  }
  if (effect.op === 'mult') return `${label} ${Math.round((value - 1) * 100) >= 0 ? '+' : ''}${Math.round((value - 1) * 100)}%`;
  return `${label} ${value >= 0 ? '+' : ''}${formatNumber(value)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1).replace(/\.0$/, '');
}
