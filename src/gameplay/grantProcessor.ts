/**
 * Pure ProgressionGrant processor — transactional, exactly-once idempotent
 * application. Alpha 3 shared foundation §4: one grant model for all durable
 * progression rewards across Epics 20–26.
 *
 * Grants are data-defined and cross-reference validated. Durable grant
 * application is exactly-once where the source is exactly-once. UI cannot
 * grant persistent state directly.
 */
import type { ProgressionState, SaveDataV3 } from '../systems/save';
import { addUnlocks } from './meta';
import { isContentId, isGrantTransactionId, isInstanceId, isUnlockId } from '../systems/ids';

export type ProgressionGrant =
  | { readonly type: 'grant-scrap'; readonly amount: number }
  | { readonly type: 'unlock-stage'; readonly stageId: string }
  | { readonly type: 'unlock-character'; readonly characterId: string }
  | { readonly type: 'unlock-equipment'; readonly equipmentId: string }
  | { readonly type: 'unlock-part'; readonly partId: string }
  | { readonly type: 'unlock-trait'; readonly traitId: string }
  /** A source-owned persistent inventory reward. The caller supplies an
   * opaque stable instance ID, so replay can never mint a second copy. */
  | { readonly type: 'grant-part-instance'; readonly instanceId: string; readonly partId: string; readonly tier?: number }
  /** Source-owned equipment instance. Definition identity and owned identity
   * stay distinct, so two copies may be upgraded/equipped independently. */
  | { readonly type: 'grant-equipment-instance'; readonly instanceId: string; readonly equipmentId: string; readonly tier?: number }
  | { readonly type: 'grant-item'; readonly itemId: string; readonly amount?: number }
  | { readonly type: 'achievement-completed'; readonly achievementId: string }
  | { readonly type: 'permanent-upgrade-level'; readonly upgradeId: string; readonly levels: number };

/**
 * Result of processing a single grant against progression state.
 * The returned progression is a new (frozen) object if any change was made,
 * or the same reference if the grant was already applied (idempotent).
 */
export interface GrantResult {
  readonly progression: ProgressionState;
  readonly changed: boolean;
}

/** A source-owned, durable reward event. `id` is a receipt key, never a
 * catalog or instance ID. Replaying it is deliberately a no-op. */
export interface DurableGrantTransaction {
  readonly id: string;
  readonly grants: readonly ProgressionGrant[];
}

export interface DurableGrantResult {
  readonly save: SaveDataV3;
  /** False means the caller supplied an invalid transaction. A valid replay
   * instead has `valid: true, changed: false`, so the persistence boundary
   * can fail malformed producer input without treating retries as failures. */
  readonly valid: boolean;
  readonly changed: boolean;
}

/** Applies all grants and records their receipt in one immutable save
 * snapshot. Persistence/publishing is owned by GameContext; it must publish
 * this snapshot only after SaveManager.save succeeds. */
export function applyDurableGrantTransaction(save: SaveDataV3, transaction: DurableGrantTransaction): DurableGrantResult {
  // Validate the whole payload before touching progression.  A malformed
  // trailing grant must not leave an earlier currency/level mutation behind
  // without its receipt.
  if (!isValidTransaction(transaction)) return { save, valid: false, changed: false };
  if (Object.prototype.hasOwnProperty.call(save.appliedGrantTransactions, transaction.id)) {
    // A receipt that no longer has the owned/set-like effects it certifies is
    // corrupted state, not a successful retry.  Fail closed: silently
    // treating it as applied would permanently hide the lost reward.
    return transactionEffectsPresent(save, transaction)
      ? { save, valid: true, changed: false }
      : { save, valid: false, changed: false };
  }
  const partGrants = transaction.grants.filter((grant): grant is Extract<ProgressionGrant, { type: 'grant-part-instance' }> => grant.type === 'grant-part-instance');
  const equipmentGrants = transaction.grants.filter((grant): grant is Extract<ProgressionGrant, { type: 'grant-equipment-instance' }> => grant.type === 'grant-equipment-instance');
  // Reject a new transaction that collides with a pre-existing owned copy.
  // Treating it as a no-op while recording the receipt would silently lose
  // the source reward; a producer must choose a unique stable instance key.
  const partInstanceIds = new Set(partGrants.map((grant) => grant.instanceId));
  if (partInstanceIds.size !== partGrants.length || partGrants.some((grant) => Object.hasOwn(save.gunsmith.parts, grant.instanceId))) {
    return { save, valid: false, changed: false };
  }
  const equipmentInstanceIds = new Set(equipmentGrants.map((grant) => grant.instanceId));
  if (equipmentInstanceIds.size !== equipmentGrants.length || equipmentGrants.some((grant) => Object.hasOwn(save.equipment, grant.instanceId))) {
    return { save, valid: false, changed: false };
  }
  const progressionGrants = transaction.grants.filter((grant) => grant.type !== 'grant-part-instance' && grant.type !== 'grant-equipment-instance' && grant.type !== 'grant-item');
  const result = processGrants(save.progression, progressionGrants);
  const items = applyItemGrants(save.items, transaction.grants);
  const parts = Object.freeze({
    ...save.gunsmith.parts,
    ...Object.fromEntries(partGrants.map((grant) => [grant.instanceId, Object.freeze({
      partId: grant.partId,
      tier: grant.tier ?? 1,
      infusedTraits: Object.freeze([]),
    })])),
  });
  const equipment = Object.freeze({
    ...save.equipment,
    ...Object.fromEntries(equipmentGrants.map((grant) => [grant.instanceId, Object.freeze({
      equipmentId: grant.equipmentId,
      tier: grant.tier ?? 1,
    })])),
  });
  const appliedGrantTransactions = Object.freeze({ ...save.appliedGrantTransactions, [transaction.id]: true as const });
  return { save: Object.freeze({ ...save, progression: result.progression, items, equipment, gunsmith: Object.freeze({ ...save.gunsmith, parts }), appliedGrantTransactions }), valid: true, changed: true };
}

function transactionEffectsPresent(save: SaveDataV3, transaction: DurableGrantTransaction): boolean {
  return transaction.grants.every((grant) => {
    switch (grant.type) {
      // Currency and permanent levels are spendable/retirable state. A later
      // legitimate spend cannot be distinguished from corruption using only
      // a receipt ID, so receipt integrity is asserted for non-consumable
      // identity-bearing effects below rather than rejecting a valid replay.
      case 'grant-scrap': return true;
      case 'unlock-stage': return save.progression.unlocks.includes(grant.stageId);
      case 'unlock-character': return save.progression.unlocks.includes(grant.characterId);
      case 'unlock-equipment': return save.progression.unlocks.includes(grant.equipmentId);
      case 'unlock-part': return save.progression.unlocks.includes(grant.partId);
      case 'unlock-trait': return save.progression.unlocks.includes(grant.traitId);
      case 'grant-item': return (save.items[grant.itemId] ?? 0) >= (grant.amount ?? 1);
      case 'achievement-completed': return save.progression.unlocks.includes(grant.achievementId);
      case 'permanent-upgrade-level': return true;
      case 'grant-part-instance': {
        const part = save.gunsmith.parts[grant.instanceId];
        return part?.partId === grant.partId && part.tier === (grant.tier ?? 1);
      }
      case 'grant-equipment-instance': {
        const equipment = save.equipment[grant.instanceId];
        return equipment?.equipmentId === grant.equipmentId && equipment.tier === (grant.tier ?? 1);
      }
    }
  });
}

function isValidTransaction(transaction: DurableGrantTransaction): boolean {
  return transaction !== null
    && typeof transaction === 'object'
    && isGrantTransactionId(transaction.id)
    && Array.isArray(transaction.grants)
    && transaction.grants.every(isValidProgressionGrant);
}

export function isValidProgressionGrant(grant: unknown): grant is ProgressionGrant {
  if (grant === null || typeof grant !== 'object' || !('type' in grant)) return false;
  const value = grant as Record<string, unknown>;
  const validId = (field: string) => typeof value[field] === 'string' && isUnlockId(value[field] as string);
  const validPrefix = (field: string, prefix: string) => validId(field) && (value[field] as string).startsWith(prefix);
  switch (value.type) {
    case 'grant-scrap': return Number.isSafeInteger(value.amount) && (value.amount as number) > 0;
    case 'unlock-stage': return validPrefix('stageId', 'stage:');
    case 'unlock-character': return validPrefix('characterId', 'character:');
    case 'unlock-equipment': return validPrefix('equipmentId', 'equipment:');
    case 'unlock-part': return validPrefix('partId', 'part:');
    case 'unlock-trait': return validPrefix('traitId', 'trait:');
    case 'grant-part-instance': return typeof value.instanceId === 'string' && isInstanceId(value.instanceId)
      && validPrefix('partId', 'part:')
      && (value.tier === undefined || (Number.isSafeInteger(value.tier) && (value.tier as number) >= 1 && (value.tier as number) <= 5));
    case 'grant-equipment-instance': return typeof value.instanceId === 'string' && isInstanceId(value.instanceId)
      && validPrefix('equipmentId', 'equipment:')
      && (value.tier === undefined || (Number.isSafeInteger(value.tier) && (value.tier as number) >= 1 && (value.tier as number) <= 4));
    case 'grant-item': return validPrefix('itemId', 'item:') && (value.amount === undefined || (Number.isSafeInteger(value.amount) && (value.amount as number) > 0));
    case 'achievement-completed': return validPrefix('achievementId', 'achievement:');
    case 'permanent-upgrade-level': return typeof value.upgradeId === 'string' && isContentId(value.upgradeId) && Number.isSafeInteger(value.levels) && (value.levels as number) > 0;
    default: return false;
  }
}

/**
 * Applies a single ProgressionGrant to the given ProgressionState.
 * Returns a new frozen ProgressionState if the grant actually changed
 * state, or the same reference if already applied (idempotent).
 *
 * Pure — no side effects, no I/O.
 */
export function processGrant(
  progression: ProgressionState,
  grant: ProgressionGrant,
): GrantResult {
  switch (grant.type) {
    case 'grant-scrap':
      return applyScrap(progression, grant.amount);

    case 'unlock-stage':
      return applyUnlock(progression, grant.stageId);

    case 'unlock-character':
      return applyUnlock(progression, grant.characterId);

    case 'unlock-equipment':
      return applyUnlock(progression, grant.equipmentId);

    case 'unlock-part':
      return applyUnlock(progression, grant.partId);

    case 'unlock-trait':
      return applyUnlock(progression, grant.traitId);

    case 'grant-item':
      // Item quantities are owned by Save V3's durable inventory domain and
      // are applied with the transaction receipt in applyItemGrants().
      return { progression, changed: false };

    case 'grant-equipment-instance':
      return { progression, changed: false };

    case 'achievement-completed':
      return applyUnlock(progression, grant.achievementId);

    case 'permanent-upgrade-level': {
      const currentLevel = progression.permanentUpgrades[grant.upgradeId] ?? 0;
      // A durable receipt must never survive a save sanitizer dropping an
      // overflowed numeric reward. Keep the value representable before the
      // transaction snapshot is constructed.
      const newLevel = Math.min(Number.MAX_SAFE_INTEGER, currentLevel + grant.levels);
      if (newLevel <= currentLevel) return { progression, changed: false };
      return freezeResult({
        ...progression,
        permanentUpgrades: { ...progression.permanentUpgrades, [grant.upgradeId]: newLevel },
      });
    }

    default:
      return { progression, changed: false };
  }
}

function applyItemGrants(items: SaveDataV3['items'], grants: readonly ProgressionGrant[]): SaveDataV3['items'] {
  const next: Record<string, number> = { ...items };
  for (const grant of grants) {
    if (grant.type !== 'grant-item') continue;
    const amount = grant.amount ?? 1;
    const current = next[grant.itemId] ?? 0;
    next[grant.itemId] = Math.min(Number.MAX_SAFE_INTEGER, current + amount);
  }
  return Object.freeze(next);
}

/**
 * Applies multiple grants in sequence, accumulating changes.
 * Order is preserved — grants are applied left-to-right.
 * Each grant is independently idempotent.
 */
export function processGrants(
  progression: ProgressionState,
  grants: readonly ProgressionGrant[],
): GrantResult {
  let current = progression;
  let anyChanged = false;

  for (const grant of grants) {
    const result = processGrant(current, grant);
    if (result.changed) {
      current = result.progression;
      anyChanged = true;
    }
  }

  return { progression: anyChanged ? freezeProgression(current) : progression, changed: anyChanged };
}

// ── Internal helpers ─────────────────────────────────────────────────

function applyScrap(progression: ProgressionState, amount: number): GrantResult {
  const safeAmount = Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
  if (safeAmount === 0) return { progression, changed: false };
  const newScrap = Math.min(Number.MAX_SAFE_INTEGER, progression.scrap + safeAmount);
  return freezeResult({ ...progression, scrap: newScrap });
}

function applyUnlock(progression: ProgressionState, unlockId: string): GrantResult {
  const updated = addUnlocks(progression, [unlockId]);
  return { progression: updated, changed: updated !== progression };
}

function freezeResult(progression: ProgressionState): GrantResult {
  return { progression: freezeProgression(progression), changed: true };
}

function freezeProgression(p: ProgressionState): ProgressionState {
  return Object.freeze({
    scrap: p.scrap,
    unlocks: Object.freeze([...p.unlocks]),
    permanentUpgrades: Object.freeze({ ...p.permanentUpgrades }),
  });
}
