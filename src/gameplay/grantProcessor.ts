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
import { isGrantTransactionId } from '../systems/ids';

export type ProgressionGrant =
  | { readonly type: 'grant-scrap'; readonly amount: number }
  | { readonly type: 'unlock-stage'; readonly stageId: string }
  | { readonly type: 'unlock-character'; readonly characterId: string }
  | { readonly type: 'unlock-equipment'; readonly equipmentId: string }
  | { readonly type: 'unlock-part'; readonly partId: string }
  | { readonly type: 'unlock-trait'; readonly traitId: string }
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

export interface DurableGrantResult { readonly save: SaveDataV3; readonly changed: boolean }

/** Applies all grants and records their receipt in one immutable save
 * snapshot. Persistence/publishing is owned by GameContext; it must publish
 * this snapshot only after SaveManager.save succeeds. */
export function applyDurableGrantTransaction(save: SaveDataV3, transaction: DurableGrantTransaction): DurableGrantResult {
  // Validate the whole payload before touching progression.  A malformed
  // trailing grant must not leave an earlier currency/level mutation behind
  // without its receipt.
  if (!isValidTransaction(transaction)) return { save, changed: false };
  if (Object.prototype.hasOwnProperty.call(save.appliedGrantTransactions, transaction.id)) return { save, changed: false };
  const result = processGrants(save.progression, transaction.grants);
  const appliedGrantTransactions = Object.freeze({ ...save.appliedGrantTransactions, [transaction.id]: true as const });
  return { save: Object.freeze({ ...save, progression: result.progression, appliedGrantTransactions }), changed: true };
}

function isValidTransaction(transaction: DurableGrantTransaction): boolean {
  return transaction !== null
    && typeof transaction === 'object'
    && isGrantTransactionId(transaction.id)
    && Array.isArray(transaction.grants)
    && transaction.grants.every(isValidGrant);
}

function isValidGrant(grant: unknown): grant is ProgressionGrant {
  if (grant === null || typeof grant !== 'object' || !('type' in grant)) return false;
  const value = grant as Record<string, unknown>;
  const validId = (field: string) => typeof value[field] === 'string' && value[field].length > 0;
  switch (value.type) {
    case 'grant-scrap': return Number.isSafeInteger(value.amount) && (value.amount as number) > 0;
    case 'unlock-stage': return validId('stageId');
    case 'unlock-character': return validId('characterId');
    case 'unlock-equipment': return validId('equipmentId');
    case 'unlock-part': return validId('partId');
    case 'unlock-trait': return validId('traitId');
    case 'grant-item': return validId('itemId') && (value.amount === undefined || (Number.isSafeInteger(value.amount) && (value.amount as number) > 0));
    case 'achievement-completed': return validId('achievementId');
    case 'permanent-upgrade-level': return validId('upgradeId') && Number.isSafeInteger(value.levels) && (value.levels as number) > 0;
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
      // Durable item grants are unlock-only in V3; runtime items use LootGrant.
      return applyUnlock(progression, grant.itemId);

    case 'achievement-completed':
      return applyUnlock(progression, grant.achievementId);

    case 'permanent-upgrade-level': {
      const currentLevel = progression.permanentUpgrades[grant.upgradeId] ?? 0;
      const newLevel = currentLevel + grant.levels;
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
