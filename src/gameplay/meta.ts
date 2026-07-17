import type { RunState } from './runState';
import type { Modifier } from './stats';
import type { MetaUpgradeDefinition } from '../systems/types';
import type { MetaState } from '../systems/save';
import type { MetaUpgradeLookup } from '../systems/metaUpgrades';
import { isUnlockId } from '../systems/ids';

export type PurchaseFailureReason = 'unknown-upgrade' | 'insufficient-scrap' | 'max-level';
export type PurchaseCheck =
  | { readonly ok: true; readonly currentLevel: number; readonly newLevel: number; readonly cost: number }
  | { readonly ok: false; readonly reason: PurchaseFailureReason; readonly currentLevel: number; readonly cost: number | null };
export type PurchaseResult =
  | { readonly ok: true; readonly meta: MetaState; readonly cost: number; readonly newLevel: number }
  | { readonly ok: false; readonly meta: MetaState; readonly reason: PurchaseFailureReason };
export interface RunReward { readonly scrap: number; readonly unlocks: readonly string[] }
export type UnlockRule = { readonly type: 'default' } |
  { readonly type: 'meta'; readonly requiresUnlockId: string };

export function costOf(definition: Readonly<MetaUpgradeDefinition>, currentLevel: number): number | null {
  if (!Number.isSafeInteger(currentLevel) || currentLevel < 0 || currentLevel >= definition.maxLevel) return null;
  const cost = Math.round(definition.cost.base * definition.cost.growth ** currentLevel);
  return Number.isSafeInteger(cost) && cost > 0 ? cost : null;
}

export function canPurchase(meta: MetaState, upgradeId: string, upgrades: MetaUpgradeLookup): PurchaseCheck {
  const definition = upgrades.metaUpgradeById(upgradeId);
  const savedLevel = readLevel(meta.permanentUpgrades, upgradeId);
  if (!definition) return freeze({ ok: false, reason: 'unknown-upgrade' as const, currentLevel: savedLevel, cost: null });
  const currentLevel = Math.min(savedLevel, definition.maxLevel);
  if (currentLevel >= definition.maxLevel) {
    return freeze({ ok: false, reason: 'max-level' as const, currentLevel, cost: null });
  }
  const cost = costOf(definition, currentLevel);
  if (cost === null || meta.scrap < cost) {
    return freeze({ ok: false, reason: 'insufficient-scrap' as const, currentLevel, cost });
  }
  return freeze({ ok: true, currentLevel, newLevel: currentLevel + 1, cost });
}

export function purchase(meta: MetaState, upgradeId: string, upgrades: MetaUpgradeLookup): PurchaseResult {
  const check = canPurchase(meta, upgradeId, upgrades);
  if (!check.ok) return freeze({ ok: false, meta, reason: check.reason });
  return freeze({
    ok: true,
    meta: freezeMeta({
      scrap: meta.scrap - check.cost,
      unlocks: meta.unlocks,
      permanentUpgrades: { ...meta.permanentUpgrades, [upgradeId]: check.newLevel },
    }),
    cost: check.cost,
    newLevel: check.newLevel,
  });
}

export function isUnlocked(meta: MetaState, id: string): boolean {
  return isUnlockId(id) && meta.unlocks.includes(id);
}

export function addUnlocks(meta: MetaState, ids: readonly string[]): MetaState {
  const next = [...meta.unlocks];
  const seen = new Set(next);
  for (const id of ids) {
    if (isUnlockId(id) && !seen.has(id)) { seen.add(id); next.push(id); }
  }
  return next.length === meta.unlocks.length ? meta : freezeMeta({ ...meta, unlocks: next });
}

export const FIRST_VICTORY_UNLOCK_ID = 'achievement:first-victory';

export function computeRunReward(run: Readonly<RunState>): RunReward | null {
  if (run.status !== 'won' && run.status !== 'lost') return null;
  const unlocks: readonly string[] =
    run.status === 'won' ? Object.freeze([FIRST_VICTORY_UNLOCK_ID]) : Object.freeze([]);
  return freeze({ scrap: sanitizeScrap(run.currency), unlocks });
}

export function bankReward(meta: MetaState, reward: Readonly<RunReward>): MetaState {
  const rewardScrap = sanitizeScrap(reward.scrap);
  const withUnlocks = addUnlocks(meta, reward.unlocks);
  if (rewardScrap === 0) return withUnlocks;
  return freezeMeta({
    ...withUnlocks,
    scrap: Math.min(Number.MAX_SAFE_INTEGER, withUnlocks.scrap + rewardScrap),
  });
}

export function permanentModifiers(
  definition: Readonly<MetaUpgradeDefinition>,
  ownedLevel: number,
): readonly Modifier[] {
  const levelCount = Number.isSafeInteger(ownedLevel)
    ? Math.min(definition.maxLevel, Math.max(0, ownedLevel))
    : 0;
  const modifiers: Modifier[] = [];
  for (let level = 1; level <= levelCount; level += 1) {
    for (const effect of definition.effects) {
      modifiers.push(freeze({ ...effect, sourceId: `meta:${definition.id}:${level}` }));
    }
  }
  return Object.freeze(modifiers);
}

function readLevel(record: Readonly<Record<string, number>>, id: string): number {
  const value = Object.hasOwn(record, id) ? record[id] : 0;
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function sanitizeScrap(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
}

function freezeMeta(meta: MetaState): MetaState {
  return Object.freeze({
    scrap: meta.scrap,
    unlocks: Object.freeze([...meta.unlocks]),
    permanentUpgrades: Object.freeze({ ...meta.permanentUpgrades }),
  });
}

function freeze<T extends object>(value: T): Readonly<T> { return Object.freeze(value); }
