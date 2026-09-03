# Alpha 3 Content Authoring Templates

**Status:** reviewed authoring/extensibility contract for Alpha 3 and future content packs.

**Applies to:** characters, abilities/passives, enemies, bosses, equipment, equipment sets, Gunsmith parts/traits, achievements, stages/chapters, art and Monster Compendium entries.

This document turns the existing Alpha 3 extensibility principles into a repeatable authoring workflow. The requirement is stronger than “the runtime is data-driven”:

> **A future implementer must be able to add an ordinary instance of an existing content type by copying a nearby template, changing IDs/data/assets, running generic validation, and playtesting. They must not have to discover a hidden provider row, edit a scene/controller, duplicate an owning ID in several places, or infer an undocumented cross-file convention.**

The repository implementation remains authoritative. If current code does not yet satisfy a template below, treat that as authoring debt to remove before scaling the affected domain.

---

# 1. Universal rules

Every ordinary content addition follows these rules.

1. **Stable ID first.** Pick the permanent ID before writing data or art.
2. **One owner for each fact.** Mechanical truth, presentation copy, art metadata and durable state each have one authoritative owner.
3. **Existing mechanic = data/assets only.** New source code is justified only for a genuinely new mechanic/effect/condition/rendering contract.
4. **No content-ID branches.** Never add `if (id === '...')` to scenes/controllers/gameplay to support an ordinary new item.
5. **No position identity.** Array order and menu position are presentation, never persistence identity.
6. **No new save field for a new content item.** Sparse maps keyed by stable IDs absorb new characters, equipment, enemies, stages and achievements.
7. **Explicit pools.** Adding global content does not silently join old deterministic encounter/reward/upgrade pools.
8. **Cross-reference validation.** Every referenced stable ID and art ID resolves generically.
9. **Generic conformance.** Existing test loops automatically cover the new definition.
10. **Data-only proof.** Every domain keeps at least one synthetic “next item” fixture proving no core source changes are necessary.

A new **type of mechanic** may require one registered implementation. Once registered, later instances using it return to the data/assets-only path.

---

# 2. Naming and identity templates

Use stable semantic namespaces. Do not encode array position, chapter order or mutable display names in persistence identity.

```text
character:<slug>
ability:<slug>
passive:<slug>                 # presentation/reference identity where needed

enemy:<slug>
boss:<slug>

set:<slug>
equipment:<set-slug>-<slot>

part:<slug>
trait:<slug>

achievement:<slug>
chapter:<slug>
stage:<chapter-or-stable-slug>
encounter:<slug>
difficulty:<slug>
reward:<slug>

character-portrait:<character-id-tail>
ability-icon:<ability-id-tail>
passive-icon:<passive-id-tail>
enemy:<enemy-id-tail>          # existing actor binding convention
character:<character-id-tail>  # existing actor binding convention
equipment-icon:<equipment-id-tail>
equipment-set-icon:<set-id-tail>
gun-part-icon:<part-id-tail>
trait-icon:<trait-id-tail>
achievement-icon:<achievement-id-tail>
objective-icon:<objective-type>
chapter-icon:<chapter-id-tail>
```

Existing shipped IDs are not renamed merely to satisfy these examples.

---

# 3. Character authoring template

Adding Character N+1 with existing stat/passive/ability primitives must not require scene, controller, save-schema or selection-logic changes.

## 3.1 Definition template

Add one entry to `src/data/characters.json`:

```json
{
  "id": "character-slug",
  "name": "Display Name",
  "description": "One concise gameplay-identity sentence.",
  "baseStats": {
    "maxHealth": 100,
    "moveSpeed": 175
  },
  "startingWeaponIds": ["existing-weapon-id"],
  "abilityId": "ability:existing-or-new-ability",
  "passives": [
    {
      "id": "passive-slug",
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

Notes:

- The current catalog uses ID tails such as `scrap-tabby` rather than the `character:` prefix inside `characters.json`; preserve the live contract unless a deliberate migration changes it.
- Static passives use existing stat modifiers and are fully data-authored.
- Reactive passives reference one registered `handlerId`; adding another instance of an existing handler is data-only. A genuinely new reactive behavior requires one handler implementation, never a character-ID branch.
- A new active ability using an existing `AbilityEffect.kind` is data-only in `abilities.json`; a new effect kind is a mechanic change.

## 3.2 Character art packet template

Every new character gets one art packet with these required headings:

```text
Character ID
Gameplay read / role
Primary black-silhouette cue
Secondary silhouette cue
Body/species construction
Outfit/tool construction
Palette: base / shadow / highlight / identity accent
Runtime actor canvas + display target
Idle animation intent
Run animation intent
Hurt animation intent
Defeat animation intent
Portrait composition
Active-ability icon ownership
Passive icon ownership
Three nearest roster collisions + explicit differences
Originality risks / forbidden shorthand
Reduced-motion/static presentation rule
Source (.pxo) path
Deterministic builder/export path
Runtime art binding IDs
```

Acceptance:

- black-fill silhouette is identifiable at runtime size;
- grayscale remains distinct from the two closest roster members;
- actor and portrait describe the same design;
- no new CharacterScene/MenuScene branch;
- character registry and selection UI discover the item through `.all()`.

## 3.3 Character synthetic extensibility fixture

Keep a test fixture equivalent to `character:test-next` using only existing ability/passive/unlock primitives. Generic validation and the character read model must include it without editing character runtime source.

---

# 4. Ability and passive templates

## 4.1 Active ability using an existing effect kind

```json
{
  "id": "ability:new-slug",
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

Required companion art:

```text
ability-icon:<new-slug>
```

The character references the ability by ID. The UI reads the definition; it does not duplicate name/description.

## 4.2 Static passive

Static passives remain embedded with the character because their identity is character-owned and they are ordinary stat composition. Use the character packet template and one passive icon.

## 4.3 Reactive passive

```text
passive id
registered handlerId
existing authoritative event
player-facing description
reentrancy/lifecycle expectation
unit fixture proving handler invocation through the generic coordinator
```

Do not create `if character === ...` behavior.

---

# 5. Equipment architecture: required hardening before scaling

The current Alpha 3 implementation is data-driven but **not yet a clean scalable authoring template** in one respect: `setBonuses` and `upgradeUnlocks` are stored on an arbitrary representative equipment piece, and runtime searches for “the piece in this set that carries the table.” This is a hidden provider convention.

That convention is acceptable as current implementation history; it is **not** the template for Set N+1.

Before the first substantial post-Alpha-3 equipment expansion, extract set-owned facts into a dedicated validated set catalog or equivalent first-class set definition.

Recommended direction:

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

Then each physical piece is only a piece:

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

## 5.1 Remove authored `sourceId` duplication

Current equipment/part effect rows repeat their owner ID as `sourceId`. That creates two mutable copies of the same identity and is unnecessary authoring friction.

Preferred scalable rule:

> Definition data declares the effect; runtime resolution injects the authoritative source from the owning definition/owned instance/set threshold.

For example:

```json
"effects": [
  { "stat": "maxHealth", "op": "add", "value": 15 }
]
```

Runtime derives an effective source such as the owned `instanceId`, while a set bonus derives `set:<id>:2` / `set:<id>:4` internally. Validation should not ask authors to repeat the owner ID manually.

This should be implemented as a focused data-contract migration before large-scale equipment/part authoring. Existing save identity does not need to change merely because static catalog effect rows stop carrying duplicated source strings.

---

# 6. Equipment-set art template

A complete set packet is authored once at the set level, then four slot pieces inherit its visual language.

Required set headings:

```text
Set ID
Gameplay identity
Construction motif
Primary material
Secondary material
Accent palette
Set emblem silhouette
Helmet silhouette rule
Armour silhouette rule
Glove silhouette rule
Boot silhouette rule
Closest competing set + difference
Second-closest set + difference
Grayscale distinction rule
Originality/legal risks
2-piece gameplay theme
4-piece gameplay theme
```

Then author exactly one piece brief per supported slot:

```text
Piece ID
Slot
Dominant silhouette mass
Set motif as expressed in this slot
What must remain visible at 24–32 px
Icon source/export path
Runtime art ID
Must-not-be-confused-with
```

Adding a new set using existing slots/modifiers/conditions requires:

1. one set definition;
2. four equipment definitions;
3. one set emblem;
4. four item icons;
5. reward/unlock pool references as needed;
6. generic validation/playtest.

It must not require changes to `equipment.ts`, `equipmentController.ts`, save schema or scene code.

---

# 7. Individual equipment-piece template

For an additional item in an existing set/slot:

```json
{
  "id": "equipment:<set>-<piece>",
  "name": "Display Name",
  "setId": "set:<existing-set>",
  "slot": "helmet",
  "tier": 1,
  "presentation": {
    "iconArtId": "equipment-icon:<set>-<piece>"
  },
  "effects": [
    { "stat": "existingStat", "op": "mult", "value": 1.05 }
  ]
}
```

Conformance checks:

- stable ID unique;
- set exists;
- slot is supported;
- icon resolves;
- modifier stats/operators validate;
- no authored owner/source duplication after the migration above;
- ordinary new item does not change set metadata or save shape.

---

# 8. Gunsmith part template

Adding a part using an existing slot/stat/trait vocabulary is data + art only.

```json
{
  "id": "part:new-part",
  "name": "New Part",
  "slot": "existing-slot",
  "rarity": "common",
  "tier": 1,
  "presentation": {
    "iconArtId": "gun-part-icon:new-part"
  },
  "effects": [
    { "stat": "existingStat", "op": "add", "value": 1 }
  ],
  "traits": ["EXISTING_TRAIT"],
  "unlock": { "type": "existing-condition", "...": "..." },
  "rewardPoolId": "existing-explicit-pool"
}
```

Authoring rules:

- `unlock` and `rewardPoolId` are omitted when not needed; do not add empty fake values;
- a new part does not automatically enter every reward pool;
- a new trait mechanic requires one registered/tested mechanic, then later trait-bearing parts are data-only;
- effect source identity should be derived from the owned part/definition rather than manually repeated in every row.

Part art brief headings:

```text
Part ID
Slot silhouette
Physical construction
Dominant functional cue
Trait overlay, if any
Closest same-slot part + difference
24–32 px readability rule
Source/export/binding IDs
```

---

# 9. Enemy template

Adding Enemy N+1 with an existing archetype/behavior is data + actor art + encounter membership + Compendium copy.

```json
{
  "id": "enemy:new-enemy",
  "name": "New Enemy",
  "archetype": "existing-archetype",
  "health": 1,
  "damage": 1,
  "speed": 1,
  "xpValue": 1,
  "scrapValue": 1,
  "contactDamage": true,
  "...": "fields required by the existing archetype"
}
```

Do not add a global “all enemies” random pool. Explicitly place it in the intended encounter profile(s).

Enemy art packet headings:

```text
Enemy ID
Threat behavior
Primary black-silhouette cue
Movement silhouette
Attack/telegraph pose
Defeat/split/summon visual requirement
Palette
Runtime canvas/display target
Closest roster collision + difference
Animation tags consumed by runtime
Source/export/binding IDs
```

Conformance:

- definition validates for its archetype;
- art resolves;
- encounter membership is explicit;
- old seeded encounters remain unchanged until edited;
- Compendium metadata resolves;
- no enemy-ID branches.

---

# 10. Boss template

A new boss using existing action/phase vocabulary is composition, not a bespoke scene.

Required definition concepts:

```text
boss stable ID
base combat stats
base registered attack/action composition
ordered phase thresholds
registered actions per phase
explicit reinforcement IDs/caps if summoning
explicit stage/encounter membership
```

Boss art packet adds:

```text
Boss silhouette thesis
Canvas evidence: 64x64 default, 96x96 only if justified
Base pose
Each mechanic telegraph pose/clip
Each phase visual escalation
Pinned body-center rule
Closest ordinary enemy/boss collision + difference
```

Compendium copy uses the generic entry template below.

---

# 11. Achievement template

Adding another achievement using existing metric/condition/grant types must be data-only.

```text
Achievement ID
Name
Description
Metric/condition primitive
Target
Hidden? / spoiler policy
Reward/grant profile using shared vocabulary
Badge art ID
Optional platform mirror mapping
```

The badge art brief must specify:

```text
central silhouette
shared badge frame
nearest badge collision
black-silhouette cue
hidden treatment behavior
```

No achievement-specific code or platform-gated unlock logic.

---

# 12. Stage / chapter template

A stage using existing arena/objective/encounter/difficulty/reward/condition primitives is data-only.

```text
Stage ID
Chapter ID / ordered membership
Display name
Arena ID
Objective definition
Encounter profile ID
Difficulty profile ID
Reward profile ID
Optional boss ID
Unlock condition
Asset bundle ID(s)
```

Art composes existing domain assets:

```text
chapter emblem
arena/location card
objective icon
boss-stage marker when applicable
state overlays from reusable UI chrome
```

Do not create one bespoke painting for every stage unless the product deliberately introduces a new location/art need.

Adding a new chapter with a new location may introduce a new world/art bundle, but BootScene must still load through bundle/manifest data rather than one hard-coded asset call per content item.

---

# 13. Monster Compendium entry template

Every release enemy/boss has one presentation entry keyed to the existing enemy ID.

```json
{
  "enemyId": "enemy:new-enemy",
  "displayOrder": 999,
  "fieldNote": "One short in-world observation.",
  "behaviour": "What the authoritative mechanics make it do.",
  "tells": "What the player can reliably read before/during the threat.",
  "counterplay": "What the player can do about it.",
  "spoilerPolicy": "silhouette-until-encountered"
}
```

Do **not** author:

- health/damage/speed numbers;
- stage lists;
- encounter IDs;
- reward tables;
- duplicated boss action arrays;
- kill counters unless the product later adds a real use for them.

Derived fields:

```text
name                 <- enemy definition
threat tags          <- archetype/mechanics
Found In             <- encounter profiles -> stages
actor art            <- visual-art registry
boss mechanics       <- registered action/phase composition
status               <- sparse Compendium save state
```

Editorial review template:

```text
Mechanics checked against SHA
Field note unique to creature
Behaviour factual
Tells actually exist in runtime/art
Counterplay actionable
No implementation-only numbers
No duplicated authoritative lists
Closest Compendium entry + prose distinction
```

Adding Enemy N+1 after the Compendium domain exists does not require a save migration; unseen is represented by absence from the sparse map.

---

# 14. Generic art-binding template

Do not let `VisualArtKind` grow one enum member for every gameplay domain. Kinds describe **rendering contracts**, while stable IDs describe semantic ownership.

Scalable direction:

```text
actor / animated-actor
projectile / animated-effect
pickup
icon
portrait
weapon-held
world
ui-chrome
```

The current shipped kinds remain valid, but future implementation should avoid `equipment-icon`, `part-icon`, `achievement-icon`, `ability-icon`, `passive-icon`, etc. as separate renderer behaviors unless they genuinely render differently. Those differences belong in IDs/cross-reference validation, not a growing switch statement.

A generic static icon binding template is conceptually:

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

Validation, not scene code, enforces that an equipment definition points to an icon-sized compatible binding.

---

# 15. Generic visual brief template

Every new art unit/family uses this authoring skeleton. Omit sections only when genuinely inapplicable.

```text
Stable owner ID
Asset/art ID
Gameplay/presentation purpose
Runtime context(s)
Source canvas
Runtime display size
Rendering/sampling contract
Primary silhouette
Secondary silhouette/detail
Palette/material rules
Animation tags and frame counts, if animated
Anchor/pivot rule
State variants / overlays
Nearest collision candidates
Explicit must-not-become rules
Grayscale test
Reduced-motion rule
Originality/legal review
Editable source path
Deterministic builder path
Runtime export path
Manifest/bundle membership
Automated validation expectations
Manual viewports/screens to review
```

For a family (character, set, weapon tier family, chapter), add a family-level brief first, then item-level deltas. Do not restate the entire style guide in every item.

---

# 16. Content-pack authoring checklist

A future content PR should state which template(s) it instantiates.

Example: “Add Character 9”

```text
[ ] stable character ID chosen
[ ] characters.json entry added
[ ] existing/new ability definition added as required
[ ] passive uses existing static/reactive vocabulary
[ ] actor + portrait + ability/passive art produced
[ ] visual bindings/bundle membership resolve
[ ] explicit unlock condition resolves
[ ] explicit starting weapon resolves
[ ] generic character catalog validation passes
[ ] generic art validation passes
[ ] synthetic/real selection read model includes character automatically
[ ] no scene/controller/save-schema changes
[ ] silhouette contact-sheet gate passes
[ ] gameplay/manual balance pass completed
```

Example: “Add Equipment Set 9”

```text
[ ] first-class set definition added
[ ] four supported slot definitions added
[ ] set emblem + four piece icons produced
[ ] all set/equipment/art cross-references resolve
[ ] set bonuses live only on set owner, not an arbitrary piece
[ ] upgrade unlocks live only on set owner
[ ] effects do not manually repeat owning source IDs
[ ] reward/unlock pools edited explicitly
[ ] generic equipment conformance passes
[ ] mixed-set and 2/4-piece tests pass
[ ] no equipment/controller/save-schema changes
[ ] grayscale 4-piece contact sheet passes
```

Example: “Add Enemy 11”

```text
[ ] stable enemy ID chosen
[ ] existing archetype/mechanic selected
[ ] enemies.json row added
[ ] actor art packet completed
[ ] explicit encounter profile(s) updated
[ ] existing old pools remain unchanged unless deliberately edited
[ ] Compendium presentation entry added
[ ] generic enemy/art/Compendium conformance passes
[ ] no GameScene/view/save-schema branches
[ ] runtime telegraph/counterplay truth checked
```

---

# 17. Machine-checkable extensibility gates

Documentation templates are insufficient if regressions can silently reintroduce bespoke content logic. The implementation should keep generic tests for these properties.

## Character gate

A synthetic ninth character using existing primitives:

- validates;
- appears in the registry and selection read model;
- can reference existing ability/passive/unlock/art IDs;
- requires no source edit outside fixture data.

## Equipment gate

After set metadata is first-class, a synthetic ninth four-piece set:

- validates as one set + four pieces;
- activates 2/4-piece bonuses generically;
- exposes all pieces in equipment read models;
- requires no runtime/controller source edit.

## Gun-part gate

A synthetic part in an existing slot with an existing trait:

- validates;
- appears in the registry/Gunsmith read model;
- does not enter unrelated reward pools automatically.

## Enemy gate

A synthetic direct enemy using an existing archetype:

- validates;
- resolves art;
- can be placed in a test encounter profile;
- appears in Compendium read models through generic derivation.

## Achievement/stage gates

Synthetic definitions using existing condition/grant/objective vocabulary validate and appear in read models without ID-specific source changes.

These tests should fail if a future refactor accidentally replaces catalog iteration with a fixed list.

---

# 18. Scalability review of the current Alpha 3 implementation

## Already in good shape

### Characters

- `DataCharacterRegistry` validates, clones, freezes and exposes `.all()` / lookup by stable ID.
- character selection maps over the registry rather than a fixed roster.
- unlocks use the shared condition vocabulary.
- active abilities are referenced by ID; existing effect kinds are data-authored.
- static passives are data-authored.

**Verdict:** ordinary Character N+1 is structurally scalable once its art/presentation packet follows this document.

### Equipment registry / persistence

- definitions are catalog-backed and registry-driven;
- owned state is sparse by instance ID;
- loadout is slot-keyed, not one field per equipment definition;
- controller iterates owned data and registry definitions rather than item IDs.

**Verdict:** ordinary pieces are scalable, but set authoring needs the provider-convention cleanup below.

### Gunsmith parts

- parts are catalog-backed with stable IDs and a generic registry;
- slots/traits/effects are typed vocabularies;
- explicit pools prevent automatic seeded-content perturbation.

**Verdict:** ordinary new parts are scalable; remove repeated authored `sourceId` when the data contract is next touched.

### Visual art

- `DataVisualArtRegistry` iterates the validated manifest and builds animation clips generically.

**Verdict:** scalable if new presentation art uses coarse rendering kinds and cross-reference validation, not one renderer switch branch per domain.

### Compendium plan

- presentation copy is keyed by enemy ID;
- name/mechanics/stages/art are derived;
- discovery state is sparse;
- generic tests explicitly require Enemy N+1 to appear without core changes.

**Verdict:** properly templated by this document + `monster-compendium.md`.

## Current authoring debt that must not become precedent

### A. Equipment set metadata on arbitrary provider pieces — **must be removed before large-scale set expansion**

Current runtime locates the first piece in a set carrying `setBonuses` / `upgradeUnlocks`. The author must know which piece is the hidden provider.

**Target:** first-class `EquipmentSetDefinition` (or equivalent explicit set-owner catalog).

### B. Authored `sourceId` inside equipment/part modifier rows — **should be removed during the same data-contract cleanup**

The owner ID is already known from the definition/instance. Repeating it is a drift opportunity.

**Target:** source identity injected by runtime resolution.

### C. Presentation assets are still split across catalogs without a single authoring checklist — **resolved at planning level by this document**

Future content PRs must name their template and run the cross-catalog checklist.

### D. Future `VisualArtKind` growth — **guardrail added**

Do not add a new rendering kind solely because the semantic owner is equipment/achievement/passive/etc. Use coarse rendering contracts.

---

# 19. Final pass condition

A domain is properly templated only when all of these are true:

1. a copyable definition skeleton exists;
2. a copyable art/presentation skeleton exists where applicable;
3. stable ID rules are explicit;
4. owning catalog is explicit;
5. cross-file references are explicit;
6. generic validation covers the new instance automatically;
7. a synthetic “next item” fixture proves no core source edit is necessary;
8. new content does not require a save migration;
9. old deterministic pools do not change implicitly;
10. there is no hidden provider/order/naming convention;
11. there is no duplicated authoritative identity that the author must keep manually synchronized;
12. the closest existing content-collision review is part of the template.

Under this standard, the **architecture direction is scalable**, but the equipment-set provider convention and duplicated modifier `sourceId` fields are explicitly not accepted as the final authoring model. They should be cleaned up before post-Alpha-3 equipment expansion; all other ordinary additions should follow the templates above.