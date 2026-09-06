# Alpha 3 V4 — Weapon Family Authoring Amendment

**Status:** narrow V4 scalability amendment discovered during the final whole-repo adversarial review of PR #169.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** remove the remaining hard-coded `pistol | smg | shotgun` family list from Gunsmith/save/UI compatibility so a future weapon family using existing firing/Part mechanics can follow the same data-first path as ordinary content. This does not introduce a weapon scripting system or generic behavior framework.

---

# 1. Contradiction found in the V4 scalability claim

Most weapon runtime code is already family-generic:

```text
DataWeaponRegistry        -> indexes arbitrary family strings and merge tiers
weapon rack admission     -> definition-driven
weapon merge              -> family/tier registry lookup
scheduled weapon rewards  -> explicit loot-table membership
family-scoped stat stack  -> string family scope
```

But RC1 still hard-codes the current three families in several persistent/Gunsmith paths:

```text
WEAPON_SLOT_COMPATIBILITY = {
  pistol:  [...],
  smg:     [...],
  shotgun: [...]
}

GunsmithController.createBuild()
  accepts only ['pistol', 'smg', 'shotgun']

Save sanitization
  validates Build.baseWeaponFamily against the same code-owned map
```

Therefore a fourth family would require core-code edits even if its weapons use existing firing, merge, Part and trait primitives.

That contradicts the V4 goal that ordinary compatible content should grow data/assets and explicit composition rather than hidden source lists.

---

# 2. Frozen target: one small Weapon Family catalog

Add one data-owned family definition catalog, e.g. `src/data/weapon-families.json`.

Target shape:

```ts
interface WeaponFamilyDefinition {
  readonly id: string;
  readonly name: string;
  /** Physical Gunsmith slots accepted by this family. The shared trait slot
   * remains universally compatible under the current V4 mechanic. */
  readonly gunsmithSlots: readonly Exclude<PartSlot, 'trait'>[];
}
```

Initial data:

```json
[
  {
    "id": "pistol",
    "name": "Pistol",
    "gunsmithSlots": ["receiver", "barrel", "optic", "trigger"]
  },
  {
    "id": "smg",
    "name": "SMG",
    "gunsmithSlots": ["receiver", "barrel", "optic", "stock", "trigger", "magazine"]
  },
  {
    "id": "shotgun",
    "name": "Shotgun",
    "gunsmithSlots": ["receiver", "barrel", "optic", "stock", "trigger", "underbarrel"]
  }
]
```

The `trait` slot remains a V4 shared Gunsmith mechanic compatible with every registered family. Do not duplicate `trait` into every row merely to restate that invariant.

If a future family genuinely cannot accept shared trait engineering, that is a new reviewed mechanic requirement rather than a hidden boolean added pre-emptively.

---

# 3. Ownership after the change

Weapon family catalog owns only:

```text
stable family identity
player-facing family name
Gunsmith physical-slot compatibility
```

It does **not** own:

- weapon tier definitions;
- fire rate/damage/projectile behavior;
- loot/reward membership;
- character starting loadouts;
- run-upgrade definitions;
- art assets;
- behavior scripts.

Those remain in their current authoritative catalogs/mechanics.

A family is a small shared identity/configuration row, not another progression system.

---

# 4. Required consumers

Replace current family enumerations with the family registry in:

## Gunsmith gameplay

`isSlotCompatible(family, slot)` resolves the family definition and checks `gunsmithSlots`; `trait` remains the shared universal exception.

No `Record<'pistol' | 'smg' | 'shotgun', ...>` or family switch remains in the compatibility owner.

## Gunsmith UI

Build creation/listing derives legal families from the family registry rather than:

```text
['pistol', 'smg', 'shotgun']
```

A future Family 4 using existing mechanics appears without a controller edit.

## Save sanitization

`Build.baseWeaponFamily` is valid when it resolves through the family registry.

A stale removed family fails soft according to normal save sanitation; do not silently reinterpret it as pistol solely because a code map lacks the key.

Migration from V3 requires no rewrite for current builds because the stable strings `pistol`, `smg`, `shotgun` remain unchanged and become valid family IDs in the new catalog.

## Persistent run-loadout resolver

Known families come from validated family/weapon data, not a scene switch. Family-scoped Gunsmith engineering can be installed before the family is acquired and activates when a matching weapon later enters the rack.

## Family-scoped content validation

Any family reference in:

- WeaponDefinition;
- family-scoped run upgrades;
- persistent Gunsmith builds;
- other existing family-scoped definition data

must resolve to one WeaponFamilyDefinition.

Do not let each domain maintain its own separate list of legal family strings.

---

# 5. Weapon definition template clarification

There are two different N+1 cases.

## New weapon/tier inside an existing family

Ordinary data/assets change:

```text
WeaponDefinition
+ art
+ explicit pool/reward membership when intended
```

No family row change.

## New family using existing weapon mechanics

Add:

```text
one WeaponFamilyDefinition
+ one or more WeaponDefinitions
+ art
+ explicit pool/reward membership
+ any family-scoped cards/content deliberately authored for it
```

No Gunsmith core, save-schema, scene/controller family switch, stat resolver or renderer edit.

If the new family needs a genuinely new firing/projectile mechanic, that mechanic is the exceptional registered implementation; the family identity/compatibility still remains data-owned.

---

# 6. Validation

Generic family validation must prove:

- family IDs are unique stable slugs;
- player-facing name is non-empty;
- every `gunsmithSlots` entry is a current legal physical PartSlot;
- slots are unique within the row;
- every WeaponDefinition.family resolves;
- every family row has at least one WeaponDefinition;
- family-scoped upgrade/content refs resolve;
- current saved-build family sanitizer uses the same registry;
- no definition existence implicitly changes old loot/reward pools.

Do not require every family to expose every Part slot.

---

# 7. Synthetic N+1 proof

Add a synthetic fourth family, for example `carbine`, using only existing weapon firing/merge/stat/trait primitives.

The proof must demonstrate:

```text
family definition validates
T1/T2/T3 weapon rows resolve through DataWeaponRegistry
Gunsmith can create/select a carbine build
configured physical slots accept/reject Parts correctly
trait slot works through the shared invariant
save round-trip preserves baseWeaponFamily: carbine
family-scoped modifiers activate when a carbine is acquired later in the run
old weapon reward/loot pools remain unchanged unless explicitly edited
no Gunsmith/save/scene/controller family-ID switch edit
```

The synthetic family need not ship in Alpha 3.

---

# 8. Non-goals

Do not add:

- arbitrary weapon scripting;
- per-family subclasses;
- per-family save fields;
- automatic family-specific upgrade generation;
- implicit entry into every loot table;
- a plugin/mod framework.

The target remains:

> **one small validated family row + existing generic weapon mechanics.**

---

# 9. Implementation owners

- #170 — family catalog, validation, GameData/registry and synthetic N+1 proof;
- #87 — Gunsmith compatibility/build/read-model consumption;
- #90 — Save V4 build-family sanitation/migration compatibility;
- #171 — current product content remains the same three shipped families unless playtest/product scope deliberately changes.

---

# 10. PASS

This amendment passes implementation when:

1. no normal V4 Gunsmith/save/UI path hard-codes the current three family IDs;
2. `pistol`, `smg`, `shotgun` behavior/slot compatibility remains unchanged;
3. current V3 saved build family strings migrate without identity changes;
4. all weapon/family-scoped refs resolve through one family catalog;
5. synthetic Family 4 using existing mechanics works through Gunsmith + save + persistent loadout without family-ID code branches;
6. explicit pools remain explicit;
7. genuinely new firing behavior remains an explicit reusable mechanic rather than executable family data.