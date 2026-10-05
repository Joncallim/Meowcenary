import type { RunUpgradeStatKey } from '../gameplay/stats';
import { WEAPON_MODIFIER_STAT_KEYS } from '../gameplay/stats';
import type { RunUpgradeEffect, UpgradeCardReadModel } from '../systems/types';

const STAT_LABELS: Readonly<Record<RunUpgradeStatKey, string>> = {
  moveSpeed: 'movement speed', maxHealth: 'max health', damage: 'damage',
  attackSpeed: 'fire rate', projectileSpeed: 'projectile speed',
  projectileCount: 'projectile', range: 'range', pierce: 'enemy pierced',
  spreadDeg: 'spread', pickupRadius: 'pickup radius', xpGain: 'XP gained',
  currencyGain: 'Scrap gained',
};

function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}`;
}

/** Exact per-pick consequences, including downsides. Stacks remain the
 * system's frozen facts; these percentages do not claim additive totals. */
export function describeUpgradeEffect(effect: RunUpgradeEffect): string {
  const change = effect.op === 'mult'
    ? `${signed((effect.value - 1) * 100)}%`
    : `${signed(effect.value)}${effect.stat === 'spreadDeg' ? '°' : ''}`;
  const plural = effect.op === 'add' && Math.abs(effect.value) !== 1
    && (effect.stat === 'projectileCount' || effect.stat === 'pierce') ? 's' : '';
  return `${change} ${STAT_LABELS[effect.stat]}${plural}`;
}

export function resolveUpgradeCardPresentation(choice: UpgradeCardReadModel): {
  readonly effect: string;
  readonly scope: string;
  readonly stacks: string;
  readonly status: string;
} {
  const scopedFamilies = [...new Set(choice.effects.flatMap(effect => effect.scope ? [effect.scope.family] : []))];
  const global = choice.effects.filter(effect => !effect.scope);
  const allWeapons = global.length > 0 && global.every(effect =>
    (WEAPON_MODIFIER_STAT_KEYS as readonly string[]).includes(effect.stat));
  const allMercenary = global.length > 0 && global.every(effect =>
    effect.stat === 'moveSpeed' || effect.stat === 'maxHealth' || effect.stat === 'pickupRadius');
  const scope = scopedFamilies.length > 0 && global.length === 0
    ? scopedFamilies.map(family => family === 'smg' ? 'SMG' : family.charAt(0).toUpperCase() + family.slice(1)).join(' + ')
    : allWeapons ? 'All weapons' : allMercenary ? 'Mercenary' : 'Run';
  const maxed = choice.currentStacks >= choice.maxStacks;
  // Keep stack copy in the bundled Latin font; U+2192 invokes an OS fallback.
  const stacks = maxed
    ? `MAX ${choice.currentStacks}/${choice.maxStacks}`
    : `${choice.owned ? 'OWNED' : 'NEW'} ${choice.currentStacks} to ${choice.nextStack}/${choice.maxStacks}${choice.nextStack === choice.maxStacks ? ' MAX' : ''}`;
  return Object.freeze({
    effect: choice.effects.map(describeUpgradeEffect).join(' · '),
    scope,
    stacks,
    status: `${scope} · ${stacks}`,
  });
}
