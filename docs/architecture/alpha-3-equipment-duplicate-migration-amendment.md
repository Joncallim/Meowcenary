# Alpha 3 V4 — Historical Duplicate Equipment Migration Amendment

**Status:** narrow Save V4 migration amendment discovered during the final RC1 adversarial review.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** reconcile a legitimate RC1 duplicate-Equipment state with the V4 rule that each Equipment definition has at most one owned instance. This is historical migration logic, not a new V4 duplicate-equipment mechanic.

---

# 1. The legitimate RC1 duplicate

RC1 can normally grant `equipment:commando-helmet` twice from two different durable sources:

```text
Junkyard 1 first clear
-> instanceId: reward:stage-01-commando-helmet
-> equipmentId: equipment:commando-helmet

Crusher Down achievement
-> instanceId: reward:crusher-commando-helmet
-> equipmentId: equipment:commando-helmet
```

Both are real source-owned instances and each may subsequently have been upgraded independently.

V4 deliberately changes Equipment ownership semantics:

```text
one owned instance per Equipment definition
+ repeatable upgrade of that one instance
```

Therefore V3 -> V4 may not simply:

- preserve both and claim the one-per-definition invariant passes; or
- silently delete one and potentially erase Scrap invested in its tier.

---

# 2. Frozen historical source pair

The current shipped migration recognizes exactly this legitimate duplicate pair:

```text
reward:stage-01-commando-helmet
reward:crusher-commando-helmet
```

and only when both structurally resolve to:

```text
equipment:commando-helmet
```

This source list is versioned migration data, not a live Equipment special case.

Do not award compensation for arbitrary hand-edited duplicate instance IDs merely because they reference the same definition. Unknown/impossible V3 duplicates are untrusted save state and follow the normal deterministic sanitizer policy without fabricated historical spend.

---

# 3. Canonical survivor

When both legitimate historical instances exist, choose exactly one survivor.

Selection order:

1. highest legal owned tier wins;
2. when tied, prefer the currently equipped instance if exactly one is equipped;
3. when still tied, use stable lexicographic instance-ID order.

The survivor keeps:

```text
its original stable instance ID
its equipment definition ID
its owned tier
```

Do not create a third synthetic Equipment instance ID merely for migration.

If the Equipment loadout points at the removed duplicate, rewrite that slot to the survivor ID atomically in the same migrated snapshot.

After migration:

```text
exactly one equipment:commando-helmet instance exists
loadout references only the survivor or nothing
```

---

# 4. Preserve real historical upgrade spend

The duplicate base copies were source rewards; the player did not spend Scrap to acquire either T1 copy. The migration therefore does **not** refund a free T1 duplicate merely because V4 removes redundant ownership.

The player may, however, have spent Scrap upgrading the copy that migration removes. Refund that historical sunk upgrade spend exactly.

RC1 upgrade cost is frozen migration data:

```text
T1 -> T2 = 100 Scrap
T2 -> T3 = 150 Scrap
T3 -> T4 = 200 Scrap
```

Cumulative historical investment by removed owned tier:

```text
T1 =   0
T2 = 100
T3 = 250
T4 = 450
```

Refund:

```text
progression.scrap += cumulativeHistoricalUpgradeSpend(removedDuplicate.tier)
```

with safe-integer clamping.

Do **not** calculate this from mutable V4 Equipment upgrade costs.

Why this is correct:

- the survivor already preserves the better of the two owned tiers;
- the removed copy's free base reward had no independent V4 utility once the definition is already owned;
- Scrap actually spent improving the redundant copy would otherwise be destroyed by migration.

---

# 5. Examples

## Both T1

```text
stage helmet   T1
crusher helmet T1
```

Result:

```text
one deterministic survivor T1
refund 0
```

## T4 + T1

```text
stage helmet   T4
crusher helmet T1
```

Result:

```text
stage helmet survives T4
refund 0 for removed T1
```

## T4 + T3

```text
stage helmet   T4
crusher helmet T3
```

Result:

```text
stage helmet survives T4
refund 250 for removed T3 historical upgrade spend
```

## Both T4

Result:

```text
one T4 survivor
refund 450 for the removed independently upgraded T4 copy
```

## Equipped lower-tier copy

```text
loadout helmet -> crusher copy T2
stage copy     -> T4
```

Result:

```text
T4 stage copy survives
helmet loadout rewritten to T4 survivor
removed T2 refunds 100
```

The migration does not preserve a weaker equipped duplicate merely to avoid rewriting an opaque instance reference.

---

# 6. Historical receipts remain history

Both RC1 source receipts/fingerprints may remain in the migrated save as historical evidence of what was committed in RC1.

After this explicit structural migration, the removed duplicate's historical receipt is **not** reinterpreted as proof that the V4 inventory must still contain two copies.

Do not:

- rewrite the old receipt fingerprint;
- replay the old Stage/Achievement reward to recreate the removed copy;
- mark either historical source as uncompleted;
- manufacture a V4 reward receipt for the consolidation refund.

The refund/consolidation belongs to the versioned Save V4 migration itself.

Completed Stage/Achievement replay is already classified before current reward reconstruction by the V4 settlement rules.

---

# 7. V4 post-migration invariant

After migration and sanitation, current active Equipment state satisfies:

```text
at most one owned instance per current EquipmentDefinition
```

Therefore:

- fabrication checks definition ownership, not one preferred instance-ID spelling;
- Set counting cannot double-count duplicate same-slot definitions;
- upgrade/equip UI presents one current item per definition;
- future V4 runtime never needs duplicate-Equipment merge/sell logic solely to handle RC1 history.

Do not create an Equipment duplicate system to preserve an obsolete RC1 reward accident.

---

# 8. Unknown/impossible V3 duplicates

For any other duplicate same-definition V3 state not recognized as a legitimate shipped historical source combination:

- validate/sanitize as untrusted input;
- retain at most one deterministic best legal instance under the same survivor ordering;
- rewrite a matching loadout reference to the survivor where safe;
- grant **no historical-spend compensation** unless a future migration explicitly registers another legitimate historical source/price contract.

This prevents a hand-edited save from minting Scrap by inventing arbitrary T4 duplicates.

---

# 9. Required tests

## Legitimate current duplicate

Construct V3 fixtures containing both exact RC1 Commando Helmet instance IDs.

Prove:

- T1/T1 -> one T1, 0 refund;
- T4/T1 -> T4 survivor, 0 refund;
- T4/T3 -> T4 survivor, +250 Scrap;
- T4/T4 -> one T4, +450 Scrap;
- tied tier prefers equipped instance;
- higher tier beats an equipped lower tier and loadout rewrites to survivor;
- safe-integer Scrap clamps correctly.

## Receipt history

Both historical source receipt IDs/fingerprints survive migration unchanged while only one current owned Commando Helmet remains.

A later J1/Crusher replay/completion evaluation does not recreate the removed duplicate.

## Unknown duplicate

Synthetic hand-edited same-definition T4 duplicate with an unrecognized instance ID:

```text
-> deterministic single survivor
-> no compensation minted
```

## V4 current state

After migration:

- Equipment fabrication refuses another Commando Helmet because the definition is already owned;
- Set count uses the one equipped slot only;
- save round-trip keeps the canonical single instance;
- Reset Progress returns the normal fresh V4 empty Equipment state.

---

# 10. Implementation owners

- #89 — Equipment ownership/upgrade/loadout semantics;
- #90 — V1/V2/V3 -> V4 migration and historical compensation;
- #170 — one-per-definition validation/N+1 invariant.

---

# 11. PASS

This amendment passes when:

1. the legitimate RC1 Commando Helmet duplicate is recognized deterministically;
2. exactly one current V4 owned instance survives;
3. highest tier is preserved;
4. loadout reference remains valid;
5. only real historical upgrade spend on the removed legitimate copy is refunded;
6. current V4 costs do not affect the historical refund;
7. old source receipts/fingerprints remain unchanged and never remint the removed copy;
8. arbitrary duplicate save edits cannot mint compensation;
9. post-migration Equipment obeys the V4 one-instance-per-definition invariant without adding a duplicate-management feature.