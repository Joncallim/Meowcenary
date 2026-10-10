/** Pure shared mechanical explanation for selection, briefing and combat. */
import type { AbilityDefinition, AbilityResolution } from '../gameplay/abilities';
import type { Modifier, ModifierStatKey } from '../gameplay/stats';

export interface AbilityStatChip {
  readonly stat: ModifierStatKey;
  readonly label: string;
}
export interface AbilityEffectPresentation {
  readonly headline: string;
  readonly detail: string;
  readonly cooldownLabel: string;
  readonly durationLabel?: string;
  readonly targetKind: 'self' | 'self-area' | 'nearby-loot';
  readonly radius?: number;
  readonly statChips: readonly AbilityStatChip[];
}

const STAT_LABELS: Readonly<Record<ModifierStatKey, string>> = Object.freeze({
  moveSpeed: 'movement speed', maxHealth: 'max HP', armor: 'armour', damage: 'damage',
  attackSpeed: 'fire rate', projectileSpeed: 'projectile speed', projectileCount: 'projectiles',
  range: 'range', critChance: 'critical chance', pickupRadius: 'pickup range', xpGain: 'XP gain',
  currencyGain: 'Scrap gain', pierce: 'pierce', spreadDeg: 'spread',
});
function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Ability presentation requires finite mechanical values');
  return String(Number(value.toFixed(4)));
}
const seconds = (ms: number): string => `${number(ms / 1000)}s`;

function modifierValue(modifier: Readonly<Modifier>): number {
  return modifier.op === 'mult' ? (modifier.value - 1) * 100 : modifier.value;
}
function modifierUnit(modifier: Readonly<Modifier>): string {
  if (modifier.op === 'mult') return '%';
  return modifier.stat === 'spreadDeg' ? '°' : '';
}
function modifierLabel(modifier: Readonly<Modifier>): string {
  const label = STAT_LABELS[modifier.stat];
  if (!Object.hasOwn(STAT_LABELS, modifier.stat) || !label || (modifier.op !== 'add' && modifier.op !== 'mult') || !Number.isFinite(modifier.value)) {
    throw new Error('Unsupported ability modifier');
  }
  const value = modifierValue(modifier);
  const scope = modifier.scope ? ` (${modifier.scope.family})` : '';
  return `${value >= 0 ? '+' : ''}${number(value)}${modifierUnit(modifier)} ${label}${scope}`;
}
function join(values: readonly string[]): string {
  return values.length < 2 ? (values[0] ?? '') : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}
function modifierDetail(modifiers: readonly Readonly<Modifier>[], durationMs: number): string {
  if (modifiers.length === 0) throw new Error('Ability stat burst needs modifiers');
  // Single movement multiplier is naturally expressed as faster/slower;
  // signed generic clauses preserve mixed buffs and tradeoffs for other builds.
  const only = modifiers[0];
  if (modifiers.length === 1 && only.stat === 'moveSpeed' && only.op === 'mult' && !only.scope) {
    modifierLabel(only); // validate the same semantics as the chip
    const value = modifierValue(only);
    return `Move ${number(Math.abs(value))}% ${value >= 0 ? 'faster' : 'slower'} for ${seconds(durationMs)}.`;
  }
  const allPositive = modifiers.every((modifier) => modifierValue(modifier) >= 0);
  const labels = modifiers.map((modifier) => {
    const label = modifierLabel(modifier);
    // Percent gains read as 'Gain 50% fire rate'; flat bonuses keep '+1'.
    return allPositive && modifier.op === 'mult' ? label.replace(/^\+/, '') : label;
  });
  return `${allPositive ? 'Gain' : 'Apply'} ${join(labels)} for ${seconds(durationMs)}.`;
}

export function resolveAbilityEffectPresentation(definition: AbilityDefinition): AbilityEffectPresentation {
  const effect = definition.effect;
  const common = { headline: definition.name, cooldownLabel: `Cooldown ${seconds(definition.cooldownMs)}.` };
  const noChips: readonly AbilityStatChip[] = Object.freeze([]);
  switch (effect.kind) {
    case 'knockback':
      return Object.freeze({ ...common, detail: `Knock back enemies within ${number(effect.radius)} range.`, targetKind: 'self-area', radius: effect.radius, statChips: noChips });
    case 'elemental-burst':
      return Object.freeze({ ...common, detail: `Deal ${number(effect.power)} damage to enemies within ${number(effect.radius)} range.`, targetKind: 'self-area', radius: effect.radius, statChips: noChips });
    case 'loot-pulse':
      return Object.freeze({ ...common, detail: `Collect nearby Scrap and XP within ${number(effect.radius)} range.`, targetKind: 'nearby-loot', radius: effect.radius, statChips: noChips });
    case 'heal':
      return Object.freeze({ ...common, detail: `Restore up to ${number(effect.amount)} HP.`, targetKind: 'self', statChips: noChips });
    case 'invulnerable':
      return Object.freeze({ ...common, detail: `Become invulnerable for ${seconds(definition.durationMs)}.`, durationLabel: `Active ${seconds(definition.durationMs)}`, targetKind: 'self', statChips: noChips });
    case 'stat-burst':
      return Object.freeze({ ...common, detail: modifierDetail(effect.modifiers, definition.durationMs), durationLabel: `Active ${seconds(definition.durationMs)}`, targetKind: 'self',
        statChips: Object.freeze(effect.modifiers.map((modifier) => Object.freeze({ stat: modifier.stat, label: modifierLabel(modifier) }))) });
    default: {
      const unsupported: never = effect;
      throw new Error(`Unsupported ability effect: ${String(unsupported)}`);
    }
  }
}

/** Consequence copy consumes mutation receipts, never requested candidate counts. */
export function resolveAbilityResolutionCopy(resolution: AbilityResolution): string {
  switch (resolution.kind) {
    case 'heal': return `+${number(resolution.applied)} HP`;
    case 'loot-pulse': return `Collected ${number(resolution.collected)}`;
    case 'knockback': return `Knocked back ${number(resolution.affected)}`;
    case 'elemental-burst': return `Hit ${number(resolution.affected)}`;
    case 'invulnerable': return `INVULNERABLE ${seconds(resolution.durationMs)}`;
    case 'stat-burst': return `${resolution.modifiers.map(modifierLabel).join(' • ')} ${seconds(resolution.durationMs)}`;
    default: {
      const unsupported: never = resolution;
      throw new Error(`Unsupported ability resolution: ${String(unsupported)}`);
    }
  }
}
