# Alpha 3 V4 — Owned-State Migration Amendment

**Status:** narrow V4 migration amendment discovered during final adversarial review of PR #169.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** preserve legitimate player-owned Equipment/Part state and historically earned Mercenary availability when V4 changes acquisition, unlock and upgrade policy. This amendment does not preserve obsolete authoring structures or legacy runtime rules; it preserves earned ownership/availability while V4 definitions and shared mechanics become authoritative going forward.

---

# 1. Why this is required

RC1 and V4 do not expose identical Equipment tier gates or identical Mercenary unlock conditions.

Representative RC1 Equipment provider-piece policy:

```text
T2 -> clear stage:junkyard-02
T3 -> defeat boss-crusher
T4 -> complete achievement:boss-crusher
```

V4 deliberately replaces provider-owned gates with one global release policy:

```text
T2 -> clear stage:junkyard-03
T3 -> defeat boss-crusher
T4 -> defeat boss-forge
```

Therefore a legitimate V3 save can already contain owned T4 Equipment before the player has defeated Forge Warden under the new V4 progression sequence.

If V4 interpreted `maxEquipmentTier` as “maximum tier allowed to exist,” migration would either downgrade valid earned gear, reject it, or make it unusable. All are incorrect.

The V4 global tier policy is a **capability to perform future upgrade transitions**, not a retroactive validity rule for already-owned state.

Mercenary cadence also changes intentionally. Two important examples become stricter for a player who already earned them under RC1:

```text
Piston Ram
RC1 -> Scrap Tabby mastery tier 1
V4  -> Scrap Tabby mastery tier 2

Ember Cougar
RC1 -> clear stage:junkyard-05
V4  -> clear stage:forge-01
```

RC1 character selection is condition-driven. It does not persist a separate “this character was once selectable” fact automatically. If migration simply swaps in the new V4 definitions, a legitimate existing player can lose access to an already-playable Mercenary and a saved `selectedCharacterId` can be reset to the starter.

V4 must preserve that earned availability without fabricating mastery, Stage or Achievement history.

---

# 2. Frozen grandfathering rule — owned instances

For every known, structurally legal owned Equipment/Part instance loaded from V1–V3:

- preserve stable owned instance ID;
- preserve referenced stable definition ID when that definition still exists;
- preserve legal owned tier within the V4 domain bounds;
- preserve legitimate infused traits / fitted identity / loadout references subject to normal cross-reference sanitation;
- do not downgrade, delete, refund, disable or unequip solely because the current V4 acquisition/tier condition would not let a fresh player create that owned state today.

V4 definitions/mechanics then determine the item's current behavior. Grandfathering preserves **owned identity/tier**, not obsolete provider-piece code or old formula bugs.

Stale definitions that truly no longer exist still follow normal fail-soft/sanitization policy; this amendment is not a license to preserve invalid arbitrary keys.

---

# 3. Frozen grandfathering rule — Mercenary availability

`progression.unlocks` in V4 is reserved for explicit content entitlements rather than shadow Stage/Boss/Achievement facts. `character:<id>` is therefore an appropriate durable ownership entitlement for a Mercenary that was legitimately available before migration.

## 3.1 Migration-only RC1 eligibility snapshot

Save V4 migration must determine which current RC1 Mercenaries were legitimately selectable under **frozen V3/RC1 unlock semantics**, not by evaluating the changed V4 character definitions.

The migration-only RC1 rules are:

```text
scrap-tabby    -> always
bolt-hound     -> achievement:first-victory
volt-lynx      -> achievement:kill-milestone-25
brass-boar     -> boss-crusher defeated
ember-cougar   -> stage:junkyard-05 cleared
scrap-weasel   -> achievement:kill-milestone-100
rattle-raptor  -> boss-crusher defeated
piston-ram     -> Scrap Tabby mastery tier >= 1
```

This historical table belongs in migration code/tests only. It is not a second live character catalog and must not be consulted by normal V4 gameplay after migration.

When one of those historical rules evaluates true, add the explicit entitlement:

```text
character:<character-id>
```

Examples:

```text
V3 Piston Ram legitimately selectable
-> preserve/add character:piston-ram

V3 Ember Cougar legitimately selectable
-> preserve/add character:ember-cougar
```

Existing valid `character:*` entitlements are preserved.

The starter does not need a redundant entitlement because its V4 condition remains `always`, though preserving an already-present valid token is harmless.

## 3.2 Migration order

Do not lose V3 evidence before character grandfathering is calculated.

One valid ordering is:

```text
1. parse/sanitize V3 structural state
2. normalize known V3 achievement/boss compatibility evidence using frozen migration rules
3. evaluate frozen RC1 character-selectability rules
4. promote historically selectable Mercenaries to character:<id> entitlements
5. remove obsolete achievement/boss shadow tokens from the V4 entitlement bag
6. publish/freeze the final Save V4 snapshot
```

Equivalent ordering is acceptable only if tests prove the same historical eligibility result.

Do **not**:

- set Scrap Tabby mastery to tier 2 merely to keep Piston Ram;
- fabricate `stage:forge-01` completion merely to keep Ember Cougar;
- fabricate boss/achievement facts solely to satisfy a new V4 character condition;
- wrap each V4 CharacterDefinition in a hard-coded compatibility `any(...)` branch;
- keep the old V3 condition evaluator as normal V4 runtime truth.

The preserved fact is **character ownership**, not fake progression history.

## 3.3 V4 selection rule

Normal V4 character availability may treat an explicit matching entitlement as already-earned ownership:

```text
selectable(character)
=
progression.unlocks contains character:<character.id>
OR
current V4 CharacterDefinition.unlock condition passes
```

This is generic by content type/ID. It is not a Piston/Ember branch.

For a fresh V4 save, no grandfather entitlements exist, so the new V4 unlock cadence is followed normally.

A later `Reset Progress` may deliberately clear earned entitlements according to reset semantics; migration grandfathering is not an undeletable account-level license.

---

# 4. Equipment global tier policy semantics

`maxEquipmentTier` means:

> **highest tier a V4 upgrade command may currently produce for an item that is below that tier.**

It does not mean:

> highest tier the save is allowed to contain.

Examples:

### Migrated V3 T4 before Forge Warden

```text
owned piece: T4
current V4 capability: T3
```

Result:

```text
piece remains T4
piece remains equippable
piece resolves its V4 T4 modifier contribution
no downgrade/refund
no T4 capability is granted to other T3 pieces
```

### Migrated V3 T3 before Forge Warden

```text
piece remains T3
T3 -> T4 upgrade remains disabled until boss-forge fact is durable
```

### Fresh V4 save

```text
cannot create T4 Equipment before the global T4 condition is satisfied
```

Grandfathered ownership therefore does not leak the capability to upgrade other items.

---

# 5. Equipment UI/read-model rule

Persistent availability/read models must keep these concepts separate:

```text
owned item tier
current maximum upgrade capability
next upgrade availability
```

A grandfathered T4 item may be displayed while the player's current global upgrade capability is only T3.

UI must not label the owned T4 item invalid, locked or corrupted merely because the current capability is lower.

The capability message applies to **new upgrade actions**, e.g.:

```text
Equipment upgrades can currently reach T3
```

not:

```text
all Equipment above T3 is illegal
```

Mercenary UI similarly distinguishes:

```text
owned/grandfathered selectable Mercenary
current V4 acquisition condition for a fresh player
```

A grandfathered character is shown as available, not “locked but selected.”

---

# 6. Part owned-tier migration

The same identity principle applies to Parts.

RC1 already permits owned Part tiers through reward/merge state. Save V4 removes static `PartDefinition.tier`; it does not rewrite legitimate owned Part tiers to a catalog default.

Examples:

- RC1 `reward:stage-05-fire-trait` T2 remains owned T2 even though a new V4 Crusher clear grants the same source-owned instance ID at T1;
- legitimate `merged-*` T2–T5 outputs remain at their owned tiers;
- infusion preserves the target owned instance tier/identity;
- Mastered Fire's V4 static definition has no tier, while a new Warden first-clear explicitly grants the owned instance at T3.

The historical-reward/fingerprint rules in `alpha-3-terminal-settlement-amendment.md` prevent migrated completed Stages from reminting current V4 first-clear rewards.

---

# 7. Fabrication serial namespace remains migration-safe

Pre-V4 owned Part IDs observed in the implementation use:

```text
reward:*     source-owned durable grants
merged-*     merge outputs
```

Infusion preserves the target instance ID.

V4 fabrication introduces:

```text
owned:<part-slug>:<serial>
```

Therefore Save V4 may initialize:

```text
gunsmith.fabricationSerials = {}
```

without reconstructing a serial from legacy inventory.

Required command invariant:

- derive next candidate `owned:*` ID from persisted per-definition serial;
- never overwrite an unexpectedly occupied candidate ID;
- serial advances only after the complete spend + item + serial candidate save is durable;
- merge/consumption never decrements serial;
- legacy `reward:*` and `merged-*` instances remain untouched.

---

# 8. Sanitization bounds

Grandfathering applies only to values legal in the V4 owned-state domain.

Current bounds remain:

```text
Equipment owned tier: 1..4
Part owned tier:      1..5
```

Values outside structural bounds are invalid/corrupt and follow sanitizer diagnostics; do not preserve T99 merely because it existed in storage.

Within the legal bounds, current progression conditions do not retroactively invalidate the owned tier.

Character entitlements are kept only for known valid Character definitions. An arbitrary `character:not-real` token is not preserved as usable content ownership merely because it has the right prefix.

---

# 9. Required migration tests

## Equipment grandfathering

Fixture:

```text
V3 save
boss-crusher defeated / achievement:boss-crusher complete
boss-forge not defeated
owned Equipment T4
```

After V4 migration:

```text
same instance ID
same equipment definition ID
same owned T4
still equippable
V4 T4 contribution resolves
current global capability remains T3
other T3 piece cannot upgrade to T4
```

After boss-forge becomes durable, the ordinary T3 -> T4 upgrade becomes available.

## Mercenary grandfathering — Piston Ram

Fixture:

```text
V3 Scrap Tabby mastery tier = 1
Piston Ram therefore selectable under RC1
V4 live Piston condition = mastery tier 2
```

After V4 migration:

```text
character:piston-ram entitlement present
mastery remains tier 1
Piston Ram remains selectable
other tier-2-gated behavior does not become available
```

## Mercenary grandfathering — Ember Cougar

Fixture:

```text
V3 stage:junkyard-05 completed
stage:forge-01 not completed
Ember Cougar therefore selectable under RC1
V4 live Ember condition = clear Forge 1
```

After V4 migration:

```text
character:ember-cougar entitlement present
stage:forge-01 remains incomplete
Ember Cougar remains selectable
Forge-1-gated non-character content remains locked
```

## Saved selected character

For a V3 save whose `selectedCharacterId` is a historically selectable Piston Ram or Ember Cougar:

```text
migration adds matching character entitlement
GameContext/selection revalidation keeps the same selectedCharacterId
no fallback to Scrap Tabby solely because the V4 live condition changed
```

A V3 save that never satisfied the historical RC1 condition gains no entitlement merely because its `selectedCharacterId` field was hand-edited or stale.

## Unchanged character conditions

Representative Bolt Hound / Volt Lynx / Scrap Weasel / Brass Boar cases remain selectable from their canonicalized V4 facts even without needing a special runtime branch. Migration may still promote the entitlement when they were historically selectable; doing so is durable ownership, not duplicate progression truth.

## Part tier preservation

- RC1 `reward:stage-05-fire-trait` T2 remains T2;
- representative `merged-*` T4/T5 instance remains at its legal tier;
- no static Part definition tier is reintroduced to explain migrated ownership.

## Fabrication namespace

V3 fixture contains representative:

```text
reward:*
merged-*
```

After V4 migration:

```text
fabricationSerials = {}
first fabrication creates owned:<part-slug>:1
legacy IDs remain unchanged
```

An intentionally occupied `owned:<part-slug>:1` fixture must never be overwritten; command fails/chooses the reviewed safe next behavior and only persists a serial consistent with the created instance.

## Fresh-save policy

A fresh V4 save:

- cannot obtain/upgrade Equipment beyond the global capability conditions merely because the migration path permits grandfathered tiers;
- does not receive migrated `character:*` entitlements;
- follows the new V4 Mercenary cadence normally.

---

# 10. N+1 rule

This migration policy is domain-generic:

- new Equipment/Part definitions do not need migration rows merely because content count grows;
- sparse owned state continues to reference stable definition IDs;
- capability conditions control future commands;
- already-owned valid tier remains player state;
- normal V4 Character N+1 remains definition/condition driven;
- only historically shipped character conditions belong in a versioned migration snapshot when a future release changes them in a way that could relock earned content.

Do not create a historical per-definition grandfather table except where a genuinely shipped acquisition contract changed and preserving earned ownership requires an explicit migration decision.

---

# 11. Implementation owners

- #89 — Equipment upgrade/loadout behavior;
- #87 — Part owned tier / fabrication / merge behavior;
- #88 — Mercenary selection/roster availability;
- #90 — Save V4 migration, entitlement promotion and sanitation;
- #170 — generic authoring/acquisition/N+1 validation.

---

# 12. PASS

This amendment passes implementation when:

1. legitimate V3 owned Equipment/Part IDs and legal tiers survive V4 migration;
2. RC1-earned T4 Equipment remains usable even before the new V4 boss-forge T4 capability is satisfied;
3. grandfathered ownership does not unlock T4 upgrades for other pieces;
4. global Equipment tier policy gates future transitions, not existing-state validity;
5. historical Part tiers survive definition-tier removal;
6. legacy reward/merge Part IDs coexist with the new fabrication namespace;
7. unexpectedly occupied fabricated IDs are never overwritten;
8. every Mercenary legitimately selectable under frozen RC1 semantics remains selectable after V4 migration;
9. Piston Ram/Ember Cougar grandfathering preserves character ownership without fabricating mastery or Stage facts;
10. a historically selected legitimate Mercenary is not reset solely because V4 tightened its acquisition condition;
11. fresh V4 saves still obey the new global Equipment and Mercenary progression gates;
12. no provider-piece, character-ID runtime branch or live V3 compatibility evaluator is reintroduced.