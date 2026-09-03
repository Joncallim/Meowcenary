# Alpha 3 Content Authoring Templates

**Status:** canonical authoring/extensibility contract for Alpha 3 and future content packs.

**Companion:** `content-authoring-template-coverage.md` contains supporting-catalog templates, proof findings and the remediation register. The two files form one contract.

The requirement is stronger than “the runtime is data-driven”:

> **A future implementer must be able to add an ordinary instance of an existing content type by copying a nearby template, changing IDs/data/assets, running generic validation, and playtesting. They must not have to discover a hidden provider row, edit a scene/controller, duplicate owning identity in several places, or infer an undocumented naming convention.**

The current repository is implementation truth. Templates follow its stable ID contracts; they do not rename current content to make a theoretical namespace look tidier.

---

# 1. Universal rules

1. **Stable ID first.** Pick the permanent ID before art/copy/reward wiring.
2. **Preserve the domain's live ID convention.** Do not add/remove prefixes casually.
3. **One owner per fact.** Mechanical truth, presentation copy, art and durable state have explicit owners.
4. **Existing mechanic = data/assets only.** Code is justified only for a genuinely new mechanic/effect/condition/rendering contract.
5. **No content-ID branches.** Ordinary content may not add `if (id === ...)` to scenes/controllers/gameplay.
6. **No array-position identity.** Order may control display, never persistence identity.
7. **Sparse persistence.** New ordinary content does not add one save field per item.
8. **Explicit pools/composition.** Adding content globally does not silently perturb old seeded encounters/rewards/loot.
9. **Explicit cross-references.** Multi-asset presentation uses references; a simple naming convention is allowed only when documented and machine-validated.
10. **Generic conformance.** Validation loops over definitions; it does not enumerate the current roster.
11. **Synthetic N+1 proof.** Every scalable domain keeps a fixture proving the next ordinary item works without core source edits.
12. **Art collision review.** A new visible item identifies its closest current collision and proves distinction at actual display size.

A genuinely new primitive may require one registered implementation. Once registered, subsequent instances return to the data/assets-only path.

---

# 2. Current stable-ID conventions

These are intentionally not uniform. Preserve them unless a deliberate migration changes them.

| Domain | Current catalog ID examples | Template rule |
| --- | --- | --- |
| Character | `scrap-tabby`, `volt-lynx` | **unprefixed** character ID |
| Ability | `ability:scrap-burst` | `ability:<slug>` |
| Character passive | `scrap-hoarder` | character-owned, currently unprefixed |
| Enemy | `dust-mite`, `junk-nester` | **unprefixed** enemy ID |
| Boss (enemy catalog) | `boss-crusher`, `boss-forge` | current `boss-<slug>` convention |
| Weapon | `scrap-pistol-t1` | **unprefixed** weapon ID |
| Run upgrade | `quick-paws`, `pistol-needle-rounds` | **unprefixed** upgrade ID |
| Permanent/meta upgrade | `reinforced-vest` | **unprefixed** meta-upgrade ID |
| Equipment | `equipment:commando-helmet` | `equipment:<set>-<piece>` |
| Equipment set | `set:commando` | `set:<slug>` |
| Gun part | `part:receiver-compact` | `part:<slug>` |
| Achievement | `achievement:first-victory` | `achievement:<slug>` |
| Stage | `stage:junkyard-01` | `stage:<stable-slug>` |
| Chapter | `chapter:junkyard` | `chapter:<slug>` |
| Encounter | `encounter:junkyard-mixed` | `encounter:<slug>` |
| Difficulty | `difficulty:chapter-1-easy` | `difficulty:<slug>` |
| Reward profile | `reward:stage-01` | `reward:<slug>` |
| Arena | `junkyard-lot` | current arena IDs are unprefixed |
| Loot table | `chest-standard` | current loot-table IDs are unprefixed |
| Asset bundle | `bundle:core-junkyard` | `bundle:<slug>` |

Art IDs are separate semantic IDs. Current actor art deliberately uses the simple validated convention:

```text
character `scrap-tabby` -> art binding `character:scrap-tabby`
enemy `dust-mite`       -> art binding `enemy:dust-mite`
```

That convention is allowed because it is documented and validated. Do **not** extrapolate it into hidden string magic for portraits, badges, equipment icons, etc. Those use explicit presentation refs or a validated presentation catalog.

Recommended presentation IDs:

```text
character-portrait:<character-id>
ability-icon:<ability-tail>
passive-icon:<passive-id>
equipment-icon:<equipment-tail>
equipment-set-icon:<set-tail>
gun-part-icon:<part-tail>
gun-slot-icon:<slot>
trait-icon:<trait-tail>
achievement-icon:<achievement-tail>
permanent-upgrade-icon:<meta-upgrade-id>
objective-icon:<objective-type>
chapter-icon:<chapter-tail>
arena-card:<arena-id>
nav-icon:<destination>
stat-icon:<stat>
action-icon:<logical-action>
ui-chrome:<name>
```

Existing shipped IDs are never renamed merely for symmetry.

---

# 3. Character template

Adding Character N+1 with existing stat/ability/passive/unlock primitives must not require scene, controller or save-schema edits.

## 3.1 Definition

```json
{
  "id": "new-character",
  "name": "Display Name",
  "description": "One concise gameplay identity sentence.",
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
      "description": "Player-facing effect summary.",
      "effects": [
        { "stat": "existingStat", "op": "add", "value": 1 }
      ]
    }
  ],
  "unlock": { "type": "existing-condition", "...": "..." },
  "cosmeticSkinIds": []
}
```

Rules:

- character ID is currently unprefixed;
- exactly one valid starting T1 weapon according to current game contract;
- existing active `AbilityEffect.kind` => data-only ability definition;
- static passive => data-only modifiers;
- existing reactive passive handler => data-only handler reference;
- new reactive mechanic => one registered handler, never a character-ID branch;
- actor art resolves by documented `character:<id>` convention;
- portrait/ability/passive art uses explicit presentation refs when that presentation layer lands.

## 3.2 Character art packet

```text
Character ID
Gameplay role/read
Primary black-silhouette cue
Secondary silhouette cue
Species/body construction
Outfit/tool construction
Palette: base / shadow / highlight / identity accent
Actor canvas + runtime display target
Idle intent
Run intent
Hurt intent
Defeat intent
Portrait composition
Active-ability icon ownership
Passive icon ownership
Three nearest roster collisions + explicit differences
Originality/legal risks
Reduced-motion/static rule
Editable source path
Deterministic builder/export path
Runtime art IDs
```

Pass: identifiable in black fill at runtime scale and discovered through registry `.all()` without a fixed list.

## 3.3 Character N+1 test

A synthetic ninth character using only existing primitives must validate and appear in the character selection read model automatically. Shipped-content tests must not hard-code `8`.

---

# 4. Active ability template

Existing effect kind:

```json
{
  "id": "ability:new-ability",
  "name": "Ability Name",
  "description": "Player-facing effect.",
  "cooldownMs": 10000,
  "durationMs": 1000,
  "effect": {
    "kind": "existing-effect-kind",
    "...": "existing effect fields"
  }
}
```

Companion art:

```text
ability-icon:new-ability
```

The character stores only `abilityId`. UI reads name/description from the ability definition.

New effect kind = mechanic change + registered implementation + tests. Later abilities using it are data-only.

---

# 5. Passive template

## Static passive

Remain character-owned because they are simple character-specific stat composition:

```text
id
kind: static
name
description
effects using existing stat/op vocabulary
passive icon reference/presentation mapping
```

## Reactive passive

```text
passive ID
kind: reactive
registered handlerId
authoritative event/input consumed
player-facing description
lifecycle/reentrancy expectation
generic coordinator test
```

No `if characterId === ...` behavior.

---

# 6. Equipment-set template — target scalable model

The current implementation stores `setBonuses` and `upgradeUnlocks` on an arbitrary representative piece. That is **current authoring debt**, not the future template.

Before large-scale equipment expansion, move set-owned facts to a first-class validated set owner/catalog.

```json
{
  "id": "set:new-set",
  "name": "New Set",
  "presentation": {
    "emblemArtId": "equipment-set-icon:new-set"
  },
  "setBonuses": {
    "2": [
      { "stat": "existingStat", "op": "mult", "value": 1.05 }
    ],
    "4": [
      { "stat": "existingStat", "op": "add", "value": 10 }
    ]
  },
  "upgradeUnlocks": {
    "2": { "type": "existing-condition", "...": "..." },
    "3": { "type": "existing-condition", "...": "..." },
    "4": { "type": "existing-condition", "...": "..." }
  }
}
```

A full set packet defines:

```text
Set ID
Gameplay identity
Construction motif
Primary/secondary material
Accent palette
Set emblem silhouette
Helmet silhouette rule
Armour silhouette rule
Glove silhouette rule
Boot silhouette rule
Closest competing sets + differences
Grayscale rule
Originality/legal risks
2-piece theme
4-piece theme
```

Adding Set N+1 with existing slots/modifiers/conditions requires one set definition, four piece definitions, one emblem, four icons and explicit reward/unlock placement—no runtime/controller/save edits.

---

# 7. Equipment-piece template

```json
{
  "id": "equipment:new-set-helmet",
  "name": "New Set Helmet",
  "setId": "set:new-set",
  "slot": "helmet",
  "tier": 1,
  "presentation": {
    "iconArtId": "equipment-icon:new-set-helmet"
  },
  "effects": [
    { "stat": "existingStat", "op": "add", "value": 5 }
  ]
}
```

Piece art delta:

```text
Piece ID
Slot
Dominant silhouette mass
Set motif in this slot
What survives at 24–32 px
Icon source/export path
Runtime art ID
Closest same-slot collision
```

Validation:

- ID/set/slot/icon resolve;
- stat/operator valid;
- piece contains no set-owned metadata after the set refactor;
- ordinary item does not alter save shape.

## Remove authored source duplication

Current equipment/part effects repeat their owner as `sourceId`. The scalable target is:

```json
{ "stat": "maxHealth", "op": "add", "value": 15 }
```

Runtime derives source identity from the owned instance/definition/set threshold. Authors should not keep two copies of the same identity synchronized.

---

# 8. Gunsmith part template

Current part IDs use `part:<slug>` and current slot vocabulary includes:

```text
receiver
barrel
optic
stock
trigger
magazine
underbarrel
trait
```

Ordinary new part using existing slot/stat/trait vocabulary:

```json
{
  "id": "part:new-part",
  "name": "New Part",
  "slot": "barrel",
  "rarity": "common",
  "tier": 1,
  "presentation": {
    "iconArtId": "gun-part-icon:new-part"
  },
  "effects": [
    { "stat": "existingStat", "op": "add", "value": 1 }
  ],
  "traits": []
}
```

Optional `unlock` / `rewardPoolId` are authored only when needed. A new part never silently enters all reward pools.

Part art packet:

```text
Part ID
Slot silhouette
Physical construction
Dominant functional cue
Trait overlay/core relation if applicable
Closest same-slot part + difference
24–32 px rule
Source/export/binding IDs
```

New trait mechanic = one registered mechanic; later parts using it are data-only.

---

# 9. Enemy template

Current enemy catalog IDs are **unprefixed**. Current bosses use `boss-<slug>` within the same catalog.

Ordinary Enemy N+1 using an existing archetype:

```json
{
  "id": "new-enemy",
  "name": "New Enemy",
  "archetype": "existing-archetype",
  "health": 10,
  "damage": 5,
  "speed": 70,
  "xpValue": 1,
  "scrapValue": 1,
  "contactDamage": true,
  "...": "existing-archetype fields"
}
```

Actor art uses the validated binding convention:

```text
new-enemy -> enemy:new-enemy
```

Then explicitly add the enemy to only the intended encounter profile(s). Global definition membership never changes old seeded composition by itself.

Enemy art packet:

```text
Enemy ID
Threat behavior
Primary black-silhouette cue
Movement silhouette
Attack/telegraph pose
Defeat/split/summon visual requirement
Palette
Canvas/display target
Closest roster collision
Animation tags consumed by runtime
Source/export/binding IDs
```

Compendium presentation row uses the same **unprefixed enemy catalog ID**.

---

# 10. Boss template

Current boss IDs are `boss-crusher`, `boss-forge`; do not silently convert them to a colon namespace.

A new boss using existing action/phase vocabulary is composition:

```text
boss stable ID using current convention
base combat stats
base registered attack/action composition
ordered phases/thresholds
registered actions per phase
explicit reinforcement IDs/caps if summoning
explicit encounter/stage membership
```

Boss art packet adds:

```text
Boss silhouette thesis
64×64 starting canvas; 96×96 only on evidence
Base pose
Each mechanic telegraph pose/clip
Phase visual escalation
Pinned body center
Closest enemy/boss collision
```

No boss-specific scene.

---

# 11. Weapon template

Current weapon IDs are unprefixed. `weapons.json` already models art well through explicit references.

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

Family packet:

```text
family ID
mechanical identity
T1/T2/T3 silhouette progression
projectile identity
held grip anchor
explicit loot/reward membership
weapon-feel entry
nearest weapon collision
```

No automatic pool inclusion.

---

# 12. Run-upgrade template

Current run-upgrade IDs are unprefixed; explicit icon refs are already the correct pattern.

```json
{
  "id": "new-upgrade",
  "name": "New Upgrade",
  "rarity": "common",
  "target": "run",
  "description": "Player-facing summary.",
  "maxStacks": 3,
  "effects": [
    { "stat": "existingStat", "op": "mult", "value": 1.05 }
  ],
  "presentation": {
    "category": "utility",
    "iconArtId": "upgrade-icon:new-upgrade"
  }
}
```

Existing effect/scope primitive => data + icon only. New effect primitive => one registered implementation.

---

# 13. Permanent/meta-upgrade template

Current IDs are unprefixed. Use only if #165 retains this progression surface.

```json
{
  "id": "new-permanent-upgrade",
  "name": "New Permanent Upgrade",
  "description": "Player-facing summary.",
  "maxLevel": 5,
  "cost": { "base": 20, "growth": 1.6 },
  "effects": [
    { "stat": "existingStat", "op": "mult", "value": 1.03 }
  ],
  "presentation": {
    "iconArtId": "permanent-upgrade-icon:new-permanent-upgrade"
  }
}
```

New definition is absorbed by ID-keyed progression/max-level maps; no per-item save field.

---

# 14. Achievement template

Current IDs use `achievement:<slug>`.

```text
Achievement ID
Name
Description
Existing metric/condition primitive
Target
Hidden/spoiler policy
Shared reward/grant profile
Explicit badge art reference
Optional platform mirror mapping
```

No achievement-specific code or platform-gated progression.

Badge brief:

```text
central silhouette
shared badge frame
nearest badge collision
black-silhouette cue
hidden treatment
```

---

# 15. Stage/chapter template

Current stages/chapters use prefixed IDs while arenas remain unprefixed.

```json
{
  "id": "stage:new-01",
  "name": "Stage Name",
  "chapterId": "chapter:new",
  "displayOrder": 1,
  "arenaId": "existing-arena",
  "assetBundleId": "bundle:existing",
  "objective": { "type": "existing-objective", "...": "..." },
  "encounterProfileId": "encounter:new",
  "difficultyProfileId": "difficulty:new",
  "rewardProfileId": "reward:new",
  "unlock": { "type": "existing-condition", "...": "..." }
}
```

Optional `bossId` appears only for boss content.

Stage art composes:

```text
chapter emblem
arena/location card
objective icon
boss-stage marker if needed
reusable locked/cleared/selected chrome
```

A second ordinary stage with existing location/objective/encounter/difficulty/reward primitives is data-only.

---

# 16. Monster Compendium template

Compendium keys use the **exact existing enemy catalog ID**, not the actor-art ID.

```json
{
  "enemyId": "new-enemy",
  "displayOrder": 999,
  "fieldNote": "One short in-world observation.",
  "behaviour": "What authoritative mechanics make it do.",
  "tells": "What the player can reliably read.",
  "counterplay": "What the player can do about it.",
  "spoilerPolicy": "silhouette-until-encountered"
}
```

Derived, never authored here:

```text
name          <- enemies.json
threat tags   <- archetype/mechanics
Found In      <- encounter profiles -> stages
actor art     <- enemy:<enemyId> validated actor binding
boss mechanics<- registered action/phase composition
status        <- sparse Compendium state
```

Do not duplicate health/damage/speed, stage lists, encounter IDs, reward tables or boss action arrays.

New Enemy N+1 after the Compendium save domain exists requires no save migration.

---

# 17. Generic visual brief template

Every visible new art unit/family uses:

```text
Stable owner ID
Explicit asset/art ID or documented validated convention
Gameplay/presentation purpose
Runtime contexts
Source canvas
Runtime display size
Rendering/sampling contract
Primary silhouette
Secondary silhouette/detail
Palette/material rules
Animation tags/frame counts if animated
Anchor/pivot rule
State variants/overlays
Nearest collision candidates
Must-not-become rules
Grayscale test
Reduced-motion rule
Originality/legal review
Editable source path
Deterministic builder path
Runtime export path
Manifest/bundle membership
Automated validation
Manual viewports/screens
```

For a family (character, equipment set, weapon family, chapter), write one family brief + item deltas rather than duplicating the full style guide per item.

---

# 18. Visual-art binding template

Do not let renderer kinds grow one value per semantic content domain.

Target coarse rendering contracts:

```text
animated-actor
projectile / animated-effect
pickup
icon
portrait
weapon-held
world
ui-chrome
```

A generic static icon binding is conceptually:

```json
{
  "id": "equipment-icon:new-set-helmet",
  "kind": "icon",
  "textureKey": "art-equipment-icon-new-set-helmet",
  "url": "assets/equipment/new-set/new-set-helmet.png",
  "required": true,
  "load": { "type": "image" },
  "display": { "width": 32, "height": 32 },
  "sampling": "nearest"
}
```

Current semantic kinds may remain until #167 integration migrates/freezes the model. The pass condition is that adding another equipment/achievement/passive icon does not add another renderer branch simply because ownership changed.

---

# 19. Content-pack PR declaration

Every future content PR declares its template(s):

```text
CONTENT TEMPLATE(S):
MECHANIC STATUS: existing primitive | new primitive (justify)
STABLE CATALOG IDS ADDED:
ART/PRESENTATION IDS ADDED:
EXPLICIT POOLS/COMPOSITIONS EDITED:
SAVE MIGRATION REQUIRED: no for ordinary content; explain exception
GENERIC CONFORMANCE TEST:
SYNTHETIC N+1 GATE:
MANUAL PLAYTEST:
```

Reviewer rejects an ordinary content PR if it had to edit a scene/controller switch, fixed roster list, save interface or renderer branch without introducing a genuinely new mechanic contract.

---

# 20. Example checklists

## Character 9

```text
[ ] unprefixed stable character ID chosen
[ ] characters.json row added
[ ] ability/passive use existing registered primitives or justified new primitive
[ ] starting T1 weapon resolves
[ ] unlock condition resolves
[ ] actor binding character:<id> resolves
[ ] portrait/ability/passive presentation refs resolve
[ ] generic catalog/art validation passes
[ ] synthetic/real selection read model discovers it automatically
[ ] no fixed roster-count test edited just to change 8 -> 9
[ ] no scene/controller/save-schema change
[ ] silhouette/grayscale gate passes
[ ] gameplay/manual balance pass
```

## Equipment Set 9

```text
[ ] set:new-set first-class set definition added
[ ] four supported piece definitions added
[ ] emblem + four icons produced
[ ] set bonuses/unlocks live only on set owner
[ ] piece effects do not repeat owner sourceId after migration
[ ] reward/unlock pools edited explicitly
[ ] generic set/piece/art validation passes
[ ] synthetic Set N+1 test uses first-class set owner
[ ] mixed 2/4-piece behavior passes
[ ] no equipment/controller/save-schema changes
[ ] grayscale construction gate passes
```

## Enemy 11

```text
[ ] unprefixed stable enemy ID chosen
[ ] existing archetype/mechanic selected
[ ] enemies.json row added
[ ] actor binding enemy:<id> produced
[ ] intended encounter profiles edited explicitly
[ ] old pools remain unchanged unless deliberately edited
[ ] Compendium row uses exact unprefixed enemy ID
[ ] generic enemy/art/Compendium validation passes
[ ] canonical spawn/death discovery path applies automatically
[ ] no GameScene/UI/save-schema branch
[ ] telegraph/counterplay manual check
```

---

# 21. Machine-checkable extensibility gates

## Character gate

Synthetic Character N+1:

- validates;
- appears through registry `.all()` and selection read model;
- uses existing ability/passive/unlock primitives;
- resolves actor/presentation art;
- requires no runtime source edit.

## Equipment gate

After first-class set metadata:

- one synthetic Set N+1 + four plain pieces validates;
- 2/4 bonuses and upgrade unlocks resolve from set owner;
- no arbitrary provider piece;
- no manually synchronized owner `sourceId`;
- no runtime/controller source edit.

## Gun-part gate

Synthetic part in existing slot/trait vocabulary:

- validates;
- appears in Gunsmith read model;
- does not enter unrelated reward pools automatically.

## Enemy gate

Synthetic Enemy N+1:

- uses unprefixed enemy ID;
- resolves `enemy:<id>` actor art;
- joins an explicit test encounter;
- appears in Compendium derivation;
- requires no scene/UI/save edit.

## Achievement/stage/supporting catalogs

Synthetic definitions using existing condition/grant/objective/profile vocabulary validate and appear without ID-specific source changes.

The supporting-catalog matrix in `content-authoring-template-coverage.md` must be updated when a new `src/data` content catalog appears.

---

# 22. Current scalability verdict

## Structurally good

- characters: registry-driven, shared conditions, data-authored abilities/static passives;
- enemies/bosses: catalog + registered mechanic composition;
- weapons: explicit art references;
- run upgrades: explicit presentation refs;
- equipment ownership/loadout: sparse and registry-driven;
- Gunsmith parts: registry-driven/explicit pools;
- stages/encounters/difficulty/rewards: explicit composition;
- achievements: catalog/metric driven;
- visual art: registry-driven;
- Compendium plan: one copy catalog + sparse discovery + derived relationships.

## Must not become precedent

The live implementation/test layer still has concrete authoring debt:

1. equipment set metadata lives on an arbitrary provider piece;
2. equipment/part effects repeat authored owner `sourceId`;
3. character-selection test hard-codes current roster count `8`;
4. equipment synthetic extensibility test teaches the provider-piece convention;
5. current visual-art kind/prefix model must be generalized/frozen during #167 before many new presentation families land;
6. permanent/meta-upgrade icon ref should be formalized only if #165 retains that surface.

The canonical IDs/severity/resolution are recorded as TPL-01 through TPL-08 in `content-authoring-template-coverage.md`.

---

# 23. Final pass condition

A domain is properly templated only when:

1. a copyable definition skeleton exists;
2. a copyable art/presentation skeleton exists where applicable;
3. the live stable-ID convention is explicit;
4. one owning catalog is explicit;
5. cross-file refs are explicit or the naming convention is simple/documented/validated;
6. generic validation covers the new instance;
7. synthetic N+1 proves no core source edit;
8. ordinary content needs no save migration;
9. old deterministic pools do not change implicitly;
10. no hidden provider/order/naming convention exists;
11. no duplicated authoritative identity must be synchronized manually;
12. no test requires changing a magic roster/set count;
13. closest visual/semantic collision is reviewed;
14. every content-bearing catalog is represented in the coverage matrix.

Under this standard, the **planning/authoring contract is comprehensive and ID-correct**, but the live runtime/test surface should not be called fully template-clean until TPL-01 through TPL-04 are implemented. TPL-06 closes during #167 integration.