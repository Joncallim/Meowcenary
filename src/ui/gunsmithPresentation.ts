import type { ModifierSpec } from '../gameplay/stats';
import type { PartSlot } from '../gameplay/gunsmith';
import { presentLoadoutModifier } from './loadoutPresentation';

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

export function gunsmithSlotLabel(slot: PartSlot): string {
  return SLOT_LABELS[slot];
}

/** Formats authoritative scaled effects without exposing implementation keys. */
export function formatGunsmithEffect(effect: ModifierSpec, tier: number): string {
  return presentLoadoutModifier(effect, Math.max(1, tier)).text;
}
