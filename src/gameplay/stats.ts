// Single source of truth for stat keys. The runtime list lets data validation
// reject unknown effect stats; the StatKey type is derived so the two cannot drift.
export const STAT_KEYS = [
  'moveSpeed',
  'maxHealth',
  'armor',
  'damage',
  'attackSpeed',
  'projectileSpeed',
  'projectileCount',
  'range',
  'critChance',
  'pickupRadius',
  'xpGain',
  'currencyGain',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

// Epic 18 (D3): weapon-behavior keys with authoritative semantics
// (Projectile.registerHit / projectileDirections) that legacy StatKey never
// carried. Kept separate from STAT_KEYS so meta upgrades and character
// static passives — which still validate against STAT_KEYS alone — cannot
// accept them.
export const WEAPON_BEHAVIOR_STAT_KEYS = ['pierce', 'spreadDeg'] as const;
export type WeaponBehaviorStatKey = (typeof WEAPON_BEHAVIOR_STAT_KEYS)[number];

// Runtime Modifier must still carry legacy StatKey values such as
// armor/critChance for existing meta/passive callers, even though run cards
// may not ship them (see RunUpgradeStatKey below, which is narrower).
export type ModifierStatKey = StatKey | WeaponBehaviorStatKey;

export const WEAPON_MODIFIER_STAT_KEYS = [
  'damage',
  'attackSpeed',
  'projectileSpeed',
  'projectileCount',
  'range',
  'pierce',
  'spreadDeg',
] as const satisfies readonly ModifierStatKey[];
export type WeaponModifierStatKey = (typeof WEAPON_MODIFIER_STAT_KEYS)[number];

// Epic 18 (D3): the complete run-upgrade-card stat vocabulary — deliberately
// not `StatKey | WeaponBehaviorStatKey`. That broad union would let dormant
// armor/critChance values compile as valid run-card data even though the
// validator rejects them; this narrowed union is the type-level version of
// the live Alpha 2 contract (only stats with a real authoritative consumer).
export const RUN_UPGRADE_STAT_KEYS = [
  'moveSpeed',
  'maxHealth',
  ...WEAPON_MODIFIER_STAT_KEYS,
  'pickupRadius',
  'xpGain',
  'currencyGain',
] as const satisfies readonly ModifierStatKey[];
export type RunUpgradeStatKey = (typeof RUN_UPGRADE_STAT_KEYS)[number];

/** Epic 18 (D3/D4): the only modifier scope. A weapon-family-scoped modifier
 *  applies only when the resolving weapon's family matches. */
export interface WeaponFamilyScope {
  readonly kind: 'weapon-family';
  readonly family: string;
}

export interface Modifier {
  stat: ModifierStatKey;
  op: 'add' | 'mult';
  value: number;
  sourceId: string;
  /** Epic 18: absent means "applies globally," matching every prior
   *  modifier's behavior unchanged. */
  scope?: WeaponFamilyScope;
}

export class ModifierStack {
  private readonly modifiers: Modifier[] = [];

  add(modifier: Modifier): void {
    if (!Number.isFinite(modifier.value)) {
      throw new Error('Modifier value must be finite');
    }

    // Defensively copy the nested scope (Epic 18 D4) so a caller mutating its
    // own scope object after add() cannot retarget a stored modifier.
    this.modifiers.push({
      ...modifier,
      ...(modifier.scope ? { scope: { ...modifier.scope } } : {}),
    });
  }

  remove(sourceId: string): void {
    let writeIndex = 0;
    for (const modifier of this.modifiers) {
      if (modifier.sourceId !== sourceId) {
        this.modifiers[writeIndex] = modifier;
        writeIndex += 1;
      }
    }
    this.modifiers.length = writeIndex;
  }

  countBySource(sourceId: string): number {
    return this.modifiers.filter((modifier) => modifier.sourceId === sourceId).length;
  }

  /** Epic 18 (D4): keeps the pre-Epic-18 semantics for **unscoped modifiers
   *  only**. A weapon-family-scoped modifier has no meaning without a family
   *  to resolve against, so it is skipped here rather than silently applied
   *  globally — `resolveWeapon()` is the only resolver that may honor scope. */
  resolve(stat: StatKey, baseValue: number): number {
    if (!Number.isFinite(baseValue)) {
      throw new Error(`Base value for "${stat}" must be finite`);
    }

    let value = baseValue;

    for (const modifier of this.modifiers) {
      if (modifier.stat === stat && modifier.op === 'add' && modifier.scope === undefined) {
        value += modifier.value;
      }
    }

    for (const modifier of this.modifiers) {
      if (modifier.stat === stat && modifier.op === 'mult' && modifier.scope === undefined) {
        value *= modifier.value;
      }
    }

    if (!Number.isFinite(value)) {
      throw new Error(`Resolved value for "${stat}" must be finite`);
    }

    return value;
  }

  /** Epic 18 (D4): weapon-stat resolution — the same two-pass insertion-order
   *  add-then-multiply algorithm as `resolve()`, with one added scope
   *  predicate (unscoped modifiers always apply; family-scoped modifiers
   *  apply only to a matching family). Ordinary loops, no filtered
   *  array/map allocation — this runs in the per-shot weapon-stats hot path. */
  resolveWeapon(stat: WeaponModifierStatKey, baseValue: number, family: string): number {
    if (!Number.isFinite(baseValue)) {
      throw new Error(`Base value for "${stat}" must be finite`);
    }

    let value = baseValue;

    for (const modifier of this.modifiers) {
      if (
        modifier.stat === stat &&
        modifier.op === 'add' &&
        (modifier.scope === undefined || modifier.scope.family === family)
      ) {
        value += modifier.value;
      }
    }

    for (const modifier of this.modifiers) {
      if (
        modifier.stat === stat &&
        modifier.op === 'mult' &&
        (modifier.scope === undefined || modifier.scope.family === family)
      ) {
        value *= modifier.value;
      }
    }

    if (!Number.isFinite(value)) {
      throw new Error(`Resolved value for "${stat}" must be finite`);
    }

    return value;
  }
}
