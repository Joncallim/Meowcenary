import type { Rng } from '../engine/rng';
import type { Rarity, UpgradeDefinition } from '../systems/types';
import type { RunState } from './runState';
import { STAT_KEYS, type Modifier, type StatKey } from './stats';

export const UPGRADE_RARITY_WEIGHTS = Object.freeze({
  common: 100,
  uncommon: 60,
  rare: 30,
  epic: 10,
  legendary: 3,
} satisfies Record<Rarity, number>);

const STAT_KEY_SET: ReadonlySet<string> = new Set(STAT_KEYS);
const UPGRADE_OPS: ReadonlySet<string> = new Set(['add', 'mult']);
const DEFAULT_OFFER_COUNT = 3;

export function offerCards(
  definitions: readonly UpgradeDefinition[],
  stacks: Readonly<Record<string, number>>,
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

  const eligible = definitions.filter((definition) => {
    if (!Number.isInteger(definition.maxStacks) || definition.maxStacks <= 0) {
      return false;
    }

    const currentStack = readStack(stacks, definition.id);
    return currentStack !== undefined && currentStack < definition.maxStacks;
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

  const id = definition.id;
  const maxStacks = definition.maxStacks;
  if (
    typeof id !== 'string' ||
    id.trim().length === 0 ||
    typeof maxStacks !== 'number' ||
    !Number.isInteger(maxStacks) ||
    maxStacks <= 0
  ) {
    return false;
  }

  const currentStack = readStack(run.upgradeStacks, id);
  if (currentStack === undefined || currentStack >= maxStacks) {
    return false;
  }

  const nextStack = currentStack + 1;
  if (!Number.isSafeInteger(nextStack)) {
    return false;
  }

  const sourceId = `upgrade:${id}:stack:${nextStack}`;
  if (sourceId.length === 0 || run.stats.countBySource(sourceId) !== 0) {
    return false;
  }

  const modifiers = prepareModifiers(definition.effects, sourceId);
  if (!modifiers) {
    return false;
  }

  try {
    modifiers.forEach((modifier) => {
      run.stats.add(modifier);
    });
  } catch {
    run.stats.remove(sourceId);
    return false;
  }

  run.upgradeStacks[id] = nextStack;
  return true;
}

function prepareModifiers(effects: unknown, sourceId: string): Modifier[] | undefined {
  if (!Array.isArray(effects) || effects.length === 0) {
    return undefined;
  }

  const modifiers: Modifier[] = [];
  for (const effect of effects) {
    if (
      !isRecord(effect) ||
      typeof effect.stat !== 'string' ||
      !STAT_KEY_SET.has(effect.stat) ||
      typeof effect.op !== 'string' ||
      !UPGRADE_OPS.has(effect.op) ||
      typeof effect.value !== 'number' ||
      !Number.isFinite(effect.value)
    ) {
      return undefined;
    }

    modifiers.push({
      stat: effect.stat as StatKey,
      op: effect.op as Modifier['op'],
      value: effect.value,
      sourceId,
    });
  }

  return modifiers;
}

function readStack(
  stacks: Readonly<Record<string, number>>,
  id: string,
): number | undefined {
  if (!Object.prototype.hasOwnProperty.call(stacks, id)) {
    return 0;
  }

  const value = stacks[id];
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
