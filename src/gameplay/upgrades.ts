import type { Rng } from '../engine/rng';
import type { Rarity, UpgradeDefinition } from '../systems/types';
import type { WeaponInstance } from './weapons';
import type { RunState } from './runState';
import {
  RUN_UPGRADE_STAT_KEYS,
  WEAPON_MODIFIER_STAT_KEYS,
  type Modifier,
  type RunUpgradeStatKey,
} from './stats';

export const UPGRADE_RARITY_WEIGHTS = Object.freeze({
  common: 100,
  uncommon: 60,
  rare: 30,
  epic: 10,
  legendary: 3,
} satisfies Record<Rarity, number>);

const RUN_UPGRADE_STAT_KEY_SET: ReadonlySet<string> = new Set(RUN_UPGRADE_STAT_KEYS);
const WEAPON_MODIFIER_STAT_KEY_SET: ReadonlySet<string> = new Set(WEAPON_MODIFIER_STAT_KEYS);
const UPGRADE_OPS: ReadonlySet<string> = new Set(['add', 'mult']);
const DEFAULT_OFFER_COUNT = 3;

/** Epic 18 (D6): the minimum offer-time context `offerCards` needs — never
 *  the whole `RunState`. `equipped` drives family-card eligibility; it is
 *  read fresh per offer and never cached across offers. */
export interface UpgradeOfferContext {
  readonly stacks: Readonly<Record<string, number>>;
  readonly equipped: readonly WeaponInstance[];
}

export function offerCards(
  definitions: readonly UpgradeDefinition[],
  context: UpgradeOfferContext,
  rng: Rng,
  count = DEFAULT_OFFER_COUNT,
): UpgradeDefinition[] {
  if (!Number.isFinite(count) || count <= 0) {
    return [];
  }

  const requestedCount = Math.floor(count);
  if (requestedCount === 0) {
    return [];
  }

  assertUniqueDefinitionIds(definitions);
  const equippedFamilies = new Set(context.equipped.map((weapon) => weapon.family));
  const eligible = definitions.filter((definition) => {
    if (!Number.isInteger(definition.maxStacks) || definition.maxStacks <= 0) {
      return false;
    }

    const currentStack = readStack(context.stacks, definition.id);
    if (currentStack === undefined || currentStack >= definition.maxStacks) {
      return false;
    }

    const family = singleScopedFamily(definition.effects);
    return family === undefined || equippedFamilies.has(family);
  });
  const offer: UpgradeDefinition[] = [];

  while (offer.length < requestedCount && eligible.length > 0) {
    const entries = eligible.map((definition) => ({
      item: definition,
      weight: UPGRADE_RARITY_WEIGHTS[definition.rarity],
    }));
    const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      throw new Error('Upgrade offer requires a positive finite total rarity weight');
    }

    const selected = rng.weighted(entries);
    const selectedIndex = eligible.indexOf(selected);
    if (selectedIndex < 0) {
      throw new Error('Upgrade RNG returned an item outside the eligible pool');
    }

    offer.push(selected);
    eligible.splice(selectedIndex, 1);
  }

  return offer;
}

export function applyCard(run: RunState, definition: UpgradeDefinition): boolean {
  if (!isRecord(definition)) {
    return false;
  }

  let id: unknown;
  let maxStacks: unknown;
  let effects: unknown;
  let target: unknown;
  try {
    id = definition.id;
    maxStacks = definition.maxStacks;
    effects = definition.effects;
    target = definition.target;
  } catch {
    return false;
  }

  if (
    typeof id !== 'string' ||
    id.trim().length === 0 ||
    typeof maxStacks !== 'number' ||
    !Number.isInteger(maxStacks) ||
    maxStacks <= 0
  ) {
    return false;
  }

  let currentStack: number | undefined;
  let hadStack: boolean;
  try {
    hadStack = Object.prototype.hasOwnProperty.call(run.upgradeStacks, id);
    currentStack = readStack(run.upgradeStacks, id);
  } catch {
    return false;
  }
  if (currentStack === undefined || currentStack >= maxStacks) {
    return false;
  }

  const nextStack = currentStack + 1;
  if (!Number.isSafeInteger(nextStack)) {
    return false;
  }

  const sourceId = `card:${id}:${nextStack}`;
  let sourceCount: number;
  try {
    sourceCount = run.stats.countBySource(sourceId);
  } catch {
    return false;
  }
  if (sourceId.length === 0 || sourceCount !== 0) {
    return false;
  }

  let modifiers: Modifier[] | undefined;
  try {
    modifiers = prepareModifiers(effects, target, sourceId);
  } catch {
    return false;
  }
  if (!modifiers) {
    return false;
  }

  try {
    modifiers.forEach((modifier) => {
      run.stats.add(modifier);
    });
    run.upgradeStacks[id] = nextStack;
    if (run.upgradeStacks[id] !== nextStack) {
      throw new Error('Upgrade stack commit was not retained');
    }
  } catch {
    run.stats.remove(sourceId);
    restoreStack(run.upgradeStacks, id, hadStack, currentStack);
    return false;
  }

  return true;
}

function assertUniqueDefinitionIds(definitions: readonly UpgradeDefinition[]): void {
  const seen = new Set<string>();
  for (const definition of definitions) {
    const id = definition.id;
    if (seen.has(id)) {
      throw new Error(`Upgrade offer requires unique definition IDs; duplicate "${id}"`);
    }
    seen.add(id);
  }
}

/** Epic 18 (D5/D6): structural boundary for `applyCard`'s caller-supplied
 *  definition — this is not a catalog/art cross-reference re-check (D6
 *  explicitly forbids re-checking family ownership here), only shape
 *  validity: known stat, known op, finite value, and — when a scope is
 *  present — a well-formed `{kind, family}` scoped to a weapon-modifier stat
 *  on a `weapon`-target upgrade, with every scoped effect in one upgrade
 *  referencing the same family. */
function prepareModifiers(effects: unknown, target: unknown, sourceId: string): Modifier[] | undefined {
  if (!Array.isArray(effects) || effects.length === 0) {
    return undefined;
  }

  const modifiers: Modifier[] = [];
  let sharedFamily: string | undefined;
  let sawScope = false;
  for (const effect of effects) {
    if (
      !isRecord(effect) ||
      typeof effect.stat !== 'string' ||
      !RUN_UPGRADE_STAT_KEY_SET.has(effect.stat) ||
      typeof effect.op !== 'string' ||
      !UPGRADE_OPS.has(effect.op) ||
      typeof effect.value !== 'number' ||
      !Number.isFinite(effect.value)
    ) {
      return undefined;
    }

    let scope: Modifier['scope'];
    if (effect.scope !== undefined) {
      sawScope = true;
      const rawScope = effect.scope;
      if (
        !isRecord(rawScope) ||
        rawScope.kind !== 'weapon-family' ||
        typeof rawScope.family !== 'string' ||
        rawScope.family.trim().length === 0 ||
        !WEAPON_MODIFIER_STAT_KEY_SET.has(effect.stat)
      ) {
        return undefined;
      }
      if (sharedFamily === undefined) {
        sharedFamily = rawScope.family;
      } else if (sharedFamily !== rawScope.family) {
        return undefined;
      }
      scope = { kind: 'weapon-family', family: rawScope.family };
    }

    modifiers.push({
      stat: effect.stat as RunUpgradeStatKey,
      op: effect.op as Modifier['op'],
      value: effect.value,
      sourceId,
      ...(scope ? { scope } : {}),
    });
  }

  if (sawScope && target !== 'weapon') {
    return undefined;
  }

  return modifiers;
}

/** Returns the one weapon family every scoped effect in `effects` shares, or
 *  `undefined` when the upgrade has no scoped effect. Callers rely on
 *  validation already guaranteeing a single shared family per upgrade
 *  (D5) — this reads only the first scoped effect found. */
export function singleScopedFamily(effects: readonly { readonly scope?: { readonly family: string } }[]): string | undefined {
  for (const effect of effects) {
    if (effect.scope) {
      return effect.scope.family;
    }
  }
  return undefined;
}

export function readStack(
  stacks: Readonly<Record<string, number>>,
  id: string,
): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(stacks, id)) {
    return 0;
  }

  const value = stacks[id];
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function restoreStack(
  stacks: Record<string, number>,
  id: string,
  hadStack: boolean,
  previousStack: number,
): void {
  try {
    if (hadStack) {
      stacks[id] = previousStack;
    } else {
      Reflect.deleteProperty(stacks, id);
    }
  } catch {
    // A hostile stack record may also reject rollback; the modifier source has
    // still been removed, and ordinary/frozen records retain the prior value.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
