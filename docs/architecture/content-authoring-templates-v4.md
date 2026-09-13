# Meowcenary V4 Content Authoring Templates

**Status:** canonical target authoring contract for the next Alpha 3 implementation tranche and later content growth.

**Precedence:** where this file conflicts with `content-authoring-templates.md`, `content-authoring-template-coverage.md`, or the current `f5ea5e2` implementation shape, **this V4 target wins**. The older files remain useful audit/history for how the target was derived.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The test is simple:

> A future author adding an ordinary Character, Enemy, Equipment Set, Part, Achievement, Contract or presentation asset should copy one template, supply content/data/art, run generic validation, and playtest. They should not edit engine switches, hidden provider rows, loader lists, save interfaces or current-ID enumerations merely because content count grew.

---

# 1. Universal authoring rules

1. Pick the permanent stable ID first.
2. Existing mechanic primitive → data/assets only.
3. New mechanic primitive → one registered implementation + tests; later content using it returns to data/assets only.
4. No content-ID branches in scenes/controllers/gameplay.
5. No array position as persistent identity.
6. No manually duplicated owner identity such as static modifier `sourceId`.
7. Availability/unlock fact has one authoritative owner.
8. Explicit encounter/reward/loot/bundle membership; catalog existence never implies global inclusion.
9. Sparse persistence only for player state; static definitions remain catalogs.
10. Logical art identity is separate from physical texture/atlas packing.
11. Generic conformance iterates definitions/resources; it does not enumerate current IDs.
12. Every visible new item states its closest current visual/gameplay collision and how it remains distinguishable.
13. Every ordinary N+1 path keeps a synthetic proof fixture.
14. Product acceptance remains required; a data-valid boring item is not finished.

---

# 2. V4 stable-ID conventions

Preserve shipped IDs.

| Domain | Convention / examples |
| --- | --- |
| Character | unprefixed: `scrap-tabby` |
| Ability | `ability:<slug>` |
| Character passive | character-owned unprefixed ID |
| Enemy | unprefixed: `dust-mite` |
| Boss | current `boss-<slug>` convention |
| Weapon | unprefixed weapon definition ID |
| Run upgrade | unprefixed upgrade ID |
| Equipment Set | `set:<slug>` |
| Equipment piece | `equipment:<set>-<piece>` |
| Gun Part | `part:<slug>` |
| Achievement | `achievement:<slug>` |
| Stage | `stage:<stable-slug>` |
| Chapter | `chapter:<slug>` |
| Encounter | `encounter:<slug>` |
| Difficulty | `difficulty:<slug>` |
| Reward profile | `reward:<slug>` |
| Arena | current unprefixed IDs (`junkyard-lot`, target `forge-foundry`) |
| Loot table | current unprefixed IDs |
| Logical art | semantic explicit ID |
| Physical art resource | `resource:<slug>` |
| Asset bundle | `bundle:<slug>` |

Do not rename historical `stage:junkyard-06` merely because Forge Warden now belongs visually to the Forge chapter.

The legacy permanent/meta-upgrade catalog is **not a V4 extensible domain**. It is retired by migration.

---

# 3. Definition-time modifier template

Static definitions use a source-free spec:

```ts
interface ModifierSpec {
  readonly stat: ModifierStatKey;
  readonly op: 'add' | 'mult';
  readonly value: number;
  readonly scope?: WeaponFamilyScope; // only where the owning domain permits it
}
```

Runtime derives source identity from the actual owner/instance/threshold.

Owned-tier scaling uses one shared helper:

```text
add:  value × tier
mult: 1 + (value - 1) × tier
```

Do not author a `sourceId` into Equipment, Set, Part or stat-burst Ability JSON.

---

# 4. Character template

```json
{
  "id": "new-character",
  "name": "Display Name",
  "description": "One sentence describing why this Mercenary plays differently.",
  "baseStats": {
    "maxHealth": 100,
    "moveSpeed": 175
  },
  "startingWeaponIds": ["scrap-pistol-t1"],
  "abilityId": "ability:existing-or-new",
  "passives": [
    {
      "id": "new-passive",
      "kind": "static",
      "name": "Passive Name",
      "description": "Concise effect.",
      "effects": [
        { "stat": "moveSpeed", "op": "mult", "value": 1.05 }
      ]
    }
  ],
  "unlock": { "type": "existing-condition", "...": "..." },
  "cosmeticSkinIds": []
}
```

Required companion presentation:

```text
actor binding
portrait
passive icon
referenced ability icon
starting weapon art already resolvable
```

Product brief adds:

```text
plain-language thesis
movement decision difference
build preference
closest two Mercenaries and why this one is not redundant
```

N+1: Character 20 appears automatically in registry/read model/scroll surface.

---

# 5. Ability template

Existing effect kind:

```json
{
  "id": "ability:new-ability",
  "name": "Ability Name",
  "description": "Immediate player-facing outcome.",
  "cooldownMs": 10000,
  "durationMs": 1000,
  "effect": {
    "kind": "existing-effect-kind",
    "...": "existing fields"
  }
}
```

Stat-burst modifiers are `ModifierSpec` with no authored source.

Direct enemy damage must route through the universal V4 enemy-damage/death boundary, never call a source-specific kill-settlement path.

Companion: one `icon` logical art binding.

---

# 6. Passive template

## Static

```text
id
kind: static
name
description
ModifierSpec[]
passive icon
```

## Reactive

```text
id
kind: reactive
name
description
authoritative event
registered handlerId
passive icon
```

A new reactive behavior requires one reusable handler; no character-ID branch.

---

# 7. Equipment Set template

V4 Set rows own all Set facts.

```json
{
  "id": "set:new-set",
  "name": "New Set",
  "description": "One sentence build thesis.",
  "unlock": { "type": "existing-condition", "...": "..." },
  "pieceFabricationCost": 60,
  "presentation": {
    "emblemArtId": "equipment-set-icon:new-set"
  },
  "setBonuses": {
    "2": {
      "modifiers": [
        { "stat": "damage", "op": "mult", "value": 1.05 }
      ]
    },
    "4": {
      "modifiers": [],
      "weaponTraits": ["EXPLOSIVE"]
    }
  }
}
```

`weaponTraits` uses only registered shared traits such as FIRE/EXPLOSIVE/PIERCING.

Set rows **do not** own per-Set equipment-tier gates in V4. The current release uses one shared Equipment upgrade policy.

Set product packet:

```text
build thesis
2-piece role
4-piece capstone
mixed 2+2 rationale
emblem
four-piece visual construction language
closest Set collision
```

N+1: one Set row + four pieces + five art assets.

---

# 8. Equipment upgrade policy template

One global release rule, e.g. `equipment-rules.json`:

```json
{
  "unlocks": {
    "2": { "type": "stage-cleared", "stageId": "stage:junkyard-03" },
    "3": { "type": "boss-defeated", "bossId": "boss-crusher" },
    "4": { "type": "boss-defeated", "bossId": "boss-forge" }
  }
}
```

Upgrade costs are one pure deterministic rule/data owner.

Do not add per-Set overrides until a real product requirement proves one is necessary.

---

# 9. Equipment piece template

```json
{
  "id": "equipment:new-set-helmet",
  "name": "New Set Helmet",
  "setId": "set:new-set",
  "slot": "helmet",
  "presentation": {
    "iconArtId": "equipment-icon:new-set-helmet"
  },
  "effects": [
    { "stat": "maxHealth", "op": "add", "value": 10 }
  ]
}
```

No static catalog `tier`.
No `setBonuses`.
No `upgradeUnlocks`.
No authored `sourceId`.

Owned instance carries its upgrade tier.

Every piece is fabricable when its Set unlock passes, costs its Set’s `pieceFabricationCost`, and can exist once per definition in the current Equipment model.

---

# 10. Gun Part template

```json
{
  "id": "part:new-part",
  "name": "New Part",
  "slot": "barrel",
  "rarity": "uncommon",
  "fabricationCost": 60,
  "presentation": {
    "iconArtId": "gun-part-icon:new-part"
  },
  "effects": [
    { "stat": "range", "op": "add", "value": 20 }
  ],
  "traits": [],
  "unlock": { "type": "stage-cleared", "stageId": "stage:junkyard-03" },
  "rewardPoolId": "pool:explicit-when-needed"
}
```

No static definition `tier`.
No authored `sourceId`.

`fabricationCost`:

- positive → repeatably fabricable once condition passes;
- absent → reward-only/non-fabricable.

Owned Part carries engineering tier 1–5 and infused traits.

Part N+1 automatically appears in Gunsmith blueprints when existing condition/slot/stat/trait contracts validate.

---

# 11. Shared weapon-behavior trait template

Reusable behavior vocabulary is gameplay-owned, not Gunsmith-owned.

Current V4 target:

```text
FIRE       -> existing damage modifier + burn projectile effect
EXPLOSIVE  -> splash projectile effect
PIERCING   -> pierce modifier
```

Gunsmith Parts and Equipment Set thresholds may contribute the same trait IDs.

Runtime dedupes the same trait once per weapon family.

A new trait requires:

```text
stable trait ID
one registered behavior definition
mechanical tests
presentation icon
at least one concrete current content consumer
```

Do not create `MASTERED_FIRE` merely to make a reward sound rarer.

---

# 12. Weapon / Gunsmith build relation

A selected Gunsmith build is a **persistent engineered weapon-family configuration**, not an extra weapon injected into the rack.

Rules:

- character starting weapon remains the initial rack identity;
- selected Gunsmith modifiers are installed with family scope even if that family is not yet present;
- if the family is acquired later in the run, the engineering immediately applies;
- Equipment Set weapon traits apply to all current/future acquired weapon families;
- UI says whether the selected engineered family is active from the Mercenary’s starting loadout or will activate when that family is acquired.

This prevents hidden “my saved SMG build does nothing forever because I started with a pistol” behavior while preserving Mercenary starting-weapon identity.

---

# 13. Enemy template

```json
{
  "id": "new-enemy",
  "name": "New Enemy",
  "archetype": "existing-archetype",
  "health": 20,
  "damage": 5,
  "speed": 70,
  "xpValue": 1,
  "scrapValue": 1,
  "contactDamage": true,
  "...": "existing archetype fields"
}
```

Companion:

```text
enemy:new-enemy actor art
Compendium editorial row keyed to new-enemy
explicit intended encounter membership
```

Definition existence alone changes no old encounter pool.

All lethal sources reach one authoritative death boundary, so Enemy N+1 gets achievement/stage/Compendium kill facts automatically.

---

# 14. Boss template

Boss remains an Enemy definition using current `boss-<slug>` IDs.

Author:

```text
base stats
registered base attack/actions
ordered health-threshold phases
registered actions per phase
reinforcement references/caps
one explicit boss encounter
one defeat Contract
actor/telegraph art
Compendium row
```

Boss spawns through the generic boss-stage path; no boss-specific scene.

---

# 15. Weapon template

Preserve explicit art refs and family identity:

```json
{
  "id": "new-family-t1",
  "name": "New Family I",
  "family": "new-family",
  "rarity": "common",
  "fireRateMs": 500,
  "damage": 5,
  "projectileSpeed": 350,
  "range": 200,
  "mergeTier": 1,
  "maxTier": 3,
  "pierce": 0,
  "projectileCount": 1,
  "spreadDeg": 0,
  "art": {
    "iconId": "weapon-icon:new-family:t1",
    "heldId": "weapon-held:new-family:t1",
    "projectileId": "projectile:new-family"
  }
}
```

Add explicit loot/reward membership; no automatic global pool.

The V4 persistent-loadout resolver derives known weapon families from catalog data, so Family N+1 receives active global Equipment traits without a switch edit.

---

# 16. Run-upgrade template

Keep the existing narrow `RunUpgradeEffect` contract and explicit presentation:

```json
{
  "id": "new-upgrade",
  "name": "New Upgrade",
  "rarity": "uncommon",
  "target": "weapon",
  "description": "One clear effect/trade-off sentence.",
  "maxStacks": 3,
  "effects": [
    { "stat": "damage", "op": "mult", "value": 1.12 }
  ],
  "presentation": {
    "category": "offense",
    "iconArtId": "upgrade-icon:new-upgrade"
  }
}
```

Family-scoped cards use the existing weapon-family scope.

The four-slot V4 offer policy automatically considers the new row by category/family/rarity; no card-ID routing.

---

# 17. Achievement template

```json
{
  "id": "achievement:new-goal",
  "name": "Goal Name",
  "description": "Exact player-facing condition.",
  "kind": "standard",
  "target": 1,
  "condition": { "type": "existing-condition", "...": "..." },
  "rewards": [
    { "grant": { "type": "grant-scrap", "amount": 50 } }
  ]
}
```

or metric-driven with an existing registered metric.

V4 truth rule:

- completion lives in `save.achievements`;
- evaluator does **not** mirror completion into `progression.unlocks`;
- each completion’s explicit reward grants, when any, use that achievement’s own exactly-once reward receipt inside one atomic evaluation commit;
- character/stage/content may use `achievement-completed` conditions against the achievement domain.

New metric kind = registered metric primitive. New achievement using an existing metric/condition is data-only.

Retired achievements remain save history but are not active catalog templates.

---

# 18. Stage / Contract template

```json
{
  "id": "stage:new-chapter-01",
  "name": "Contract Name",
  "chapterId": "chapter:new-chapter",
  "displayOrder": 1,
  "arenaId": "existing-or-new-arena",
  "assetBundleId": "bundle:new-location",
  "objective": { "type": "kill", "count": 25 },
  "encounterProfileId": "encounter:new-contract",
  "difficultyProfileId": "difficulty:new-chapter-medium",
  "rewardProfileId": "reward:new-contract",
  "unlock": { "type": "stage-cleared", "stageId": "stage:previous" }
}
```

Boss stage additionally has matching `bossId` and `defeat` objective.

Product packet must include:

```text
“This contract is about ___, so the player must ___.”
location
objective movement/priority consequence
ordered encounter-pressure thesis
first-clear reward/project change
nearest Contract collision
```

Reject functionally interchangeable theses.

Starter Contract uses `unlock: {type:'always'}` in V4, not an `unlock-count: 0` trick.

---

# 19. Encounter template

```json
{
  "id": "encounter:new-contract",
  "enemyIds": [
    "enemy-a",
    "enemy-b",
    "enemy-c",
    "enemy-d",
    "enemy-e"
  ],
  "compositionWeights": {
    "enemy-a": 2,
    "enemy-b": 1
  }
}
```

Roster order is meaningful under the current stage composer because it determines layer arrival across the source curve.

For ordinary 120s Contracts, use enough meaningful layers to avoid long unchanged pressure; do not invent encounter scripting before composition fails real playtests.

Explicit boss encounter adds `bossId`.

---

# 20. Difficulty template

```json
{
  "id": "difficulty:new-chapter-medium",
  "healthMultiplier": 1.3,
  "damageMultiplier": 1.2,
  "speedMultiplier": 1.05,
  "spawnPressure": 0.45
}
```

Difficulty supports a Contract thesis; it is not the thesis itself.

Values require real playtest traces.

---

# 21. Reward profile template

V4 first-clear reward is fixed and legible:

```json
{
  "id": "reward:new-contract",
  "firstClearScrap": 60,
  "grants": [
    {
      "type": "grant-part-instance",
      "instanceId": "reward:new-contract-example-part",
      "partId": "part:example",
      "tier": 1
    }
  ]
}
```

Rules:

- **no `scrapPerMinute`**: first-clear reward never incentivizes intentionally slower objective completion;
- **no dead `lootTableId`**: world loot remains enemy/loot-system owned;
- ordinary clear at most two persistent owned-instance grants, normally one;
- boss clear one headline capability/item plus at most two supporting persistent items;
- Set/Part blueprint availability is normally derived from stage/boss/achievement facts, not duplicated as reward tokens;
- exact transaction remains deterministic and exactly once.

Repeat-run Scrap comes from the run’s ordinary collection/combat economy, not a replayed first-clear transaction.

---

# 22. Arena template

Use the existing Arena contract:

```text
stable arena ID
name
size
source spawn curve
spawn regions
obstacles
hazards
visual refs
legacy/default unlock metadata as required by Arena registry
```

A new Arena with existing region/obstacle/hazard mechanics is data + world art.

Hazard V4 presentation gains an explicit art ref while damage rectangle/timing remains authoritative gameplay data.

New environment mechanic = one reusable registered primitive, not stage-ID code.

---

# 23. Compendium template

Presentation metadata keyed to **the existing enemy ID**:

```text
enemyId
field note
Behaviour
Tells
Counterplay
optional editorial categorisation that is not duplicate mechanic truth
```

Derived, never duplicated:

```text
name
actor art
threat tags from mechanics
Found In from encounters → stages
boss phases/actions
```

Discovery remains sparse:

```text
unseen = absent
encountered
defeated
```

Enemy N+1 requires no save migration.

---

# 24. Logical art binding template

Semantic content references logical art, never a physical PNG path.

```json
{
  "id": "equipment-icon:new-set-helmet",
  "kind": "icon",
  "resourceId": "resource:ui-equipment",
  "frameKey": "equipment-icon:new-set-helmet",
  "display": { "width": 28, "height": 28 },
  "production": {
    "sourcePath": "assets-src/.../source/...pxo",
    "builderPath": "docs/art/scripts/...lua",
    "exportPath": "public/assets/...png"
  }
}
```

Physical resource:

```json
{
  "id": "resource:ui-equipment",
  "textureKey": "art-ui-equipment",
  "sampling": "nearest",
  "load": {
    "type": "atlas",
    "imageUrl": "assets/ui/equipment.png",
    "dataUrl": "assets/ui/equipment.json"
  }
}
```

Static icons may share deterministic named-frame atlases.
Animated actors normally remain dedicated spritesheets until profiling proves otherwise.

A semantic owner never creates a new renderer kind merely for ownership.

---

# 25. Asset-bundle template

Bundles collect **logical art IDs/resource closure**, never gameplay eligibility.

Examples:

```text
bundle:boot-core
bundle:menu-mercenary
bundle:menu-loadout
bundle:menu-career
bundle:core-junkyard
bundle:core-forge
```

Run closure is derived from selected character + encounter/boss + world + run-core + explicit weapon/content pools.

Opening Equipment does not preload every future Compendium resource.

---

# 26. Audio template

Existing audio contracts remain:

```text
asset key + URL
explicit event/family map
bounded cooldown/fade metadata
```

New content reuses an existing family/event sound where appropriate or adds a new asset/mapping explicitly.

Do not infer gameplay identity from filename conventions.

---

# 27. Acquisition coverage template

Every persistent release definition has an obtainable route.

Equipment:

```text
piece -> Set -> satisfiable Set unlock + fabrication cost
```

Part:

```text
fabricationCost + satisfiable condition
OR deterministic reward source
OR both (free first copy + later fabrication)
```

Character:

```text
satisfiable ProgressionCondition
```

Reject circular/unsatisfiable/self-owned routes.

---

# 28. Content PR checklist

Every ordinary content PR states:

```text
Domain/template used
Stable IDs added
Existing mechanic primitives consumed
Any new primitive? why necessary?
Explicit pool/composition membership
Unlock/acquisition route
Presentation logical IDs
Physical resource/bundle mapping
Closest gameplay collision
Closest visual collision
N+1/generic conformance evidence
Seed/determinism impact
Save impact (normally none)
Phone/controller/keyboard evidence where player-facing
Fun/design thesis
```

If the author cannot explain why a runtime source edit is required, the default expectation is that it should not be required.

---

# 29. Synthetic scale gates

Before calling V4 template-clean, prove:

- Character 20;
- Equipment Set 12 + 48 pieces;
- Part 50;
- Enemy 50 / Compendium 50;
- Contract 25 across later chapters;
- Achievement 40;
- 500 logical static art bindings backed by a bounded resource count;
- builder N+1 without validator-ID edit.

These are synthetic conformance fixtures, not release-content commitments.

---

# 30. Explicitly retired authoring patterns

Do not copy these current-RC patterns into new content:

- permanent/meta-upgrade shop rows;
- Equipment provider piece owning Set metadata;
- per-Set duplicated tier-upgrade policy;
- static Equipment `tier`;
- static Part `tier`;
- modifier `sourceId` duplicated in definition JSON;
- Equipment/Part art forced through `upgrade-icon`;
- one logical icon = one dedicated Phaser texture by default;
- required Boot preload of every future UI asset;
- `RewardProfile.lootTableId` with no runtime consumer;
- time-increasing first-clear Scrap;
- automatic `achievement-completed` shadow token in `progression.unlocks`;
- Arena and Contract as peer campaign choices;
- bespoke list pagination per screen;
- content-count assumptions inside generic UI/controller tests.

These exist in the reviewed baseline because Alpha 3 was assembled incrementally. V4 is the cleanup boundary.