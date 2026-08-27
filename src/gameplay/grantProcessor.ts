/**
 * Pure ProgressionGrant processor — transactional, exactly-once idempotent
 * application. Alpha 3 shared foundation §4: one grant model for all durable
 * progression rewards across Epics 20–26.
 *
 * Grants are data-defined and cross-reference validated. Durable grant
 * application is exactly-once where the source is exactly-once. UI cannot
 * grant persistent state directly.
 */
import type { ProgressionState } from '../systems/save';
import { addUnlocks } from './meta';

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
      return applyUnlock(progression, `stage:${grant.stageId}`);

    case 'unlock-character':
      return applyUnlock(progression, `character:${grant.characterId}`);

    case 'unlock-equipment':
      return applyUnlock(progression, `equipment:${grant.equipmentId}`);

    case 'unlock-part':
      return applyUnlock(progression, `part:${grant.partId}`);

    case 'unlock-trait':
      return applyUnlock(progression, `trait:${grant.traitId}`);

    case 'grant-item':
      // Durable item grants are unlock-only in V3; runtime items use LootGrant.
      return applyUnlock(progression, `item:${grant.itemId}`);

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
