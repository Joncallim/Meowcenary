# Alpha 3 V4 Content Scalability Closeout

**Status:** final adversarial scalability review for PR #169. This is a review/proof document; implementation authority remains `alpha-3-final-execution-handoff.md` and `content-authoring-templates-v4.md`.

**RC1 implementation baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The review asks a stricter question than “is Meowcenary data-driven?”:

> **Can ordinary future content scale from today’s roster to Character 20, Equipment Set 12, Part 50, Enemy 50, Contract 25, Achievement 40 and hundreds of presentation assets without repository archaeology or per-content engine edits?**

Final answer:

- **V4 architecture / authoring contract:** yes;
- **RC1 runtime/tooling:** not yet fully template-clean;
- **remaining implementation debt:** finite, explicit and tracked in #170;
- **release claim:** do not call runtime scalability PASS until the synthetic V4 scale gates actually pass.

---

# 1. Template-clean definition

An ordinary instance of an existing content type is template-clean only when a future author can:

1. choose one stable permanent ID;
2. instantiate the domain’s V4 definition template;
3. use existing registered mechanics/conditions/grants;
4. provide the required presentation/art/audio packet;
5. opt into intended encounter/reward/loot/resource composition explicitly;
6. run generic validation/N+1 tests;
7. playtest it;
8. ship without editing scenes, controller switches, save shape, loader core, renderer taxonomy or validator current-ID tables simply because content count increased.

A genuinely new mechanic may add one registered implementation. Later content using that primitive must return to the ordinary data/assets path.

A release-spec assertion such as “Alpha 3 ships eight Mercenaries” may intentionally change with the product. A generic controller or registry test may not use that release count as an engine limitation.

---

# 2. Final V4 domain verdict

| Domain | Ordinary N+1 path | V4 verdict |
| --- | --- | --- |
| Mercenary | character row + existing ability/passive/unlock/weapon refs + actor/presentation | **Template-clean target** |
| Ability | definition using existing effect kind + presentation | **Template-clean target** |
| Passive | static data or existing registered reactive handler + presentation | **Template-clean target** |
| Enemy | enemy row + existing archetype/mechanics + actor + explicit encounter + Compendium copy | **Template-clean target** |
| Boss | existing registered actions/phases + actor + explicit encounter/Contract | **Template-clean target** |
| Weapon | definition/tier + explicit art + explicit pool/feel membership | **Template-clean target** |
| Run upgrade | definition + explicit icon + existing run-effect vocabulary | **Template-clean target** |
| Equipment Set | **one Set row** + four plain pieces + art + generic fabrication | **Template-clean after #170** |
| Equipment piece | plain piece row + icon; mutable tier lives on owned instance | **Template-clean after #170** |
| Gunsmith Part | source-free definition + icon + fabrication/reward route; owned instance carries tier | **Template-clean after #170** |
| Achievement | definition + existing metric/condition/grant + badge | **Template-clean target** |
| Contract/Stage | existing arena/objective/encounter/difficulty/reward/unlock composition | **Template-clean target** |
| Encounter / difficulty / reward / loot | explicit profile composition | **Template-clean target** |
| Arena/world | one Arena row + world bundle using existing mechanics | **Template-clean target** |
| Audio | asset + existing event/family mapping | **Template-clean target** |
| Compendium | enemy-keyed editorial row + derived mechanics/stages/art + sparse discovery | **Template-clean after universal death fact** |
| Visual presentation | stable logical art ID -> compatible physical resource/frame/bundle | **Template-clean after #170 resource work** |
| Builder/export pipeline | family/manifest discovery + deterministic parity | **Template-clean after #170 tooling work** |
| Permanent/meta upgrade | **retired active V4 domain** | **Not an N+1 template** |

---

# 3. V4 ownership corrections that prevent future scale debt

## 3.1 Equipment Set ownership

RC1 stores `setBonuses` and upgrade metadata on one arbitrary physical piece and scans for the provider. V4 explicitly rejects this.

Target:

```text
EquipmentSetDefinition
  id
  name / thesis
  unlock condition
  pieceFabricationCost
  emblem logical art ref
  2-piece threshold
  4-piece threshold

EquipmentDefinition
  id
  name
  setId
  slot
  icon logical art ref
  source-free ModifierSpec[]
```

There is **no provider piece**.

### Global tier policy

Do not move RC1 per-Set tier gates from the provider piece onto each Set row. V4 has **one global Equipment upgrade policy** for T2/T3/T4 capability. Set N+1 automatically consumes it.

That is materially more scalable because adding twelve Sets does not copy the same tier milestone table twelve times.

## 3.2 Definition versus owned state

RC1 Part/Equipment definitions carry a `tier`, although the same definition can produce owned instances at higher tiers.

V4 separates blueprint from instance:

```text
Definition = immutable blueprint facts
Owned instance = mutable engineering/equipment tier + instance identity
```

Therefore ordinary Part/Equipment definition rows contain **no static tier**.

## 3.3 Source-free modifier definitions

RC1 Equipment/Part and stat-burst Ability JSON repeats the owning ID as `sourceId` in each modifier. The owner is already known, so the author maintains duplicate identity.

V4 definition shape:

```json
{ "stat": "damage", "op": "mult", "value": 1.12 }
```

Runtime derives source identity from:

- owned Equipment/Part instance;
- Equipment Set threshold;
- Ability owner/lifecycle.

Shared tier scaling is pinned:

```text
add  => value × tier
mult => 1 + (value - 1) × tier
```

Example: `1.12` at T2 becomes `1.24`, not `2.24`.

## 3.4 Persistent acquisition is part of extensibility

A definition that validates but can never be obtained is not a scalable content path.

V4 uses one availability/acquisition resolver over authoritative progression facts:

- Character condition -> selectable when satisfied;
- Equipment Set condition + `pieceFabricationCost` -> its missing pieces become fabricable;
- Part condition + positive `fabricationCost` -> fabricable;
- absent Part fabrication cost -> reward-only/non-fabricable;
- global Equipment tier policy -> maximum upgrade capability.

Release validation rejects circular/unsatisfiable acquisition routes.

Fabricated Part IDs use persisted per-definition serials so consumed/merged IDs are never accidentally reused.

---

# 4. Character scalability evidence

RC1 already demonstrates most of the right pattern:

- `DataCharacterRegistry` iterates definitions generically;
- selection reads the registry rather than a fixed runtime roster;
- unlock conditions use the shared condition vocabulary;
- abilities/passives are referenced/registered primitives;
- `tests/roster.test.ts` has a synthetic extra-character fixture using existing mechanics.

Remaining RC1 cleanliness issue:

- generic `characterSelectionController.test.ts` still asserts exactly eight rows.

V4 rule:

- generic membership derives from registry/fixture;
- a separate product-content test may deliberately assert the active release roster count.

Synthetic **Character 20** must remain selectable/navigable through the shared list/focus UI without controller/core changes.

---

# 5. Equipment / Part scalability evidence and RC1 blockers

RC1 already has generic registries, sparse owned state, slot-keyed loadout and data-backed Part/Equipment mechanics.

But current validators/tests actively encode the wrong authoring model:

- `assertEquipmentSetBonuses` requires exactly one provider piece;
- Equipment/Part validators require authored `sourceId`;
- Part/Equipment presentation is constrained to `upgrade-icon` bindings;
- synthetic Equipment Set fixture puts Set metadata on `index === 0`;
- release tests require every Set’s pieces to be stage-rewarded.

These tests are useful RC1 implementation evidence but must be **retired**, not carried forward as invariants.

V4 Set N+1 proof is:

```text
1 Set row
+ 4 plain piece rows
+ emblem/item art
+ no provider
+ no per-Set tier gates
+ no static definition tier
+ no authored source IDs
+ generic fabrication
```

Synthetic **12 Sets / 48 pieces** must satisfy the same runtime/read-model path.

Part 50 similarly uses existing slot/stat/trait vocabulary + art + explicit acquisition route with no Gunsmith-core registration.

---

# 6. Enemy / Compendium scalability

Enemy content is already registry/encounter driven, but Compendium defeat discovery exposed a lifecycle authority defect:

- RC1 `enemy:killed` settlement lives in WeaponSystem;
- Heat Vent/elemental burst can damage/kill directly through `Enemy.takeDamage`.

V4 prerequisite:

- one narrow universal enemy damage/death settlement;
- `enemy:killed` emitted exactly once for every alive->dead transition regardless of lethal source;
- `enemy:spawned` remains the existing encounter discovery fact;
- no `enemy:encountered` duplicate event.

Compendium then remains scalable because it derives:

- name/mechanics from Enemy definitions/registered behavior;
- `Found In` from encounters -> stages;
- art from logical presentation registry;
- discovery from sparse `save.compendium.enemies`;
- only editorial copy is Compendium-owned.

Synthetic **Enemy/Compendium 50** must enter without save-shape, event-map, menu-core or renderer changes.

---

# 7. Logical art versus physical resources

This is the largest hidden scale limit in RC1.

Current implementation couples:

```text
one VisualArtBinding
~ one semantic renderer kind
~ one texture key
~ one physical PNG/source/builder
~ global non-world Boot preload
```

and caps logical bindings at 256.

The V4 product/art target can approach that ceiling quickly before future content is considered.

## V4 resource model

Separate stable semantic ownership from physical packing:

```text
VisualArtBinding (logical)
  stable logical ID
  renderer contract
  physical resource ID
  optional named frame/clip
  display metadata

VisualTextureResource (physical)
  resource ID
  image / atlas / spritesheet metadata
  URL/source/export contract
```

Consequences:

- many static icons may share one deterministic named-frame atlas;
- actor sheets may remain dedicated spritesheets;
- atlas repacking does not rename `equipment-icon:*`, `achievement-icon:*`, etc.;
- logical binding limits and physical resource limits are independent;
- `required`/bundle validation operates on the actual selected resource closure.

## Renderer vocabulary

Rendering kind describes behavior rather than business domain. Target bounded vocabulary is approximately:

```text
animated-actor
sprite
icon
portrait
weapon-held
world
ui-chrome
```

Do not add another renderer branch simply because the icon belongs to Equipment, Achievement, Part or Ability.

## Load model

Boot loads only boot/Home-critical resources. Heavy surfaces load explicit resource bundles on entry; run closure derives from selected Mercenary, current encounter/boss/summon/split closure, relevant weapons, world bundle and run-core presentation.

Loading a visual resource never changes gameplay pool eligibility.

Synthetic **500 logical static bindings** must validate with a bounded physical-resource count and without 500 global Boot texture assumptions.

---

# 8. Builder/source/export scalability

RC1 structural validation is strong, but `validate-builders.lua` still registers many current asset IDs directly.

V4 target:

- validated production metadata/manifest discovers ordinary assets;
- one reusable family contract defines dimensions/layers/tags for a renderer/animation family;
- Character N+1 / Enemy N+1 / Icon N+1 does not append another validator-core row;
- deliberately new animation contract adds one reusable family rule;
- temp rebuild/compare verifies accepted source <-> deterministic builder/import <-> normalized export parity.

Generated source rule:

- preserve selected raw generated source as provenance when used;
- deterministic import is allowed;
- review/edit/polish in Pixelorama as required;
- final reproducibility targets the **accepted production source**;
- no ceremonial redraw is required only because generation was part of source creation.

Synthetic **Builder N+1** must become structurally verified from metadata/family registration alone, and a deliberate mismatch must fail parity validation.

---

# 9. Supporting catalogs

Ordinary supporting catalogs remain explicit and data-driven:

```text
Weapons
Run upgrades
Encounter profiles
Difficulty profiles
Reward profiles
Loot tables
Arenas/world bundles
Audio assets/map
Achievements
Contracts/Stages
```

V4 refinements:

- RewardProfile uses fixed `firstClearScrap` + optional explicit grants;
- no dead clear-time `lootTableId`;
- no `scrapPerMinute` reward for taking longer;
- old deterministic pools never gain new global content implicitly;
- permanent/meta-upgrades are retired active V4 content, not a future N+1 template.

---

# 10. Synthetic scale gate

The runtime/tooling is not declared template-clean until a dedicated V4 scale suite proves at least:

## Character 20

- existing ability/passive/unlock/weapon primitives;
- registry + selection + shared scroll read model discovers all rows;
- no scene/controller/save/loader/validator-ID edit.

## Equipment Set 12 + 48 pieces

- one Set + four plain pieces per family;
- generic 2/4 threshold resolution;
- one global T2/T3/T4 policy;
- fabrication/equip/mixed-Set behavior works;
- no provider/static tier/source duplication.

## Part 50

- existing slot/stat/trait;
- explicit fabricable or deterministic reward route;
- generic icon/resource contract;
- untouched reward pools remain unchanged.

## Enemy/Compendium 50

- existing archetypes/mechanics;
- explicit encounters/editorial rows;
- generic actor-builder/resource discovery;
- sparse discovery absorbs new IDs;
- canonical spawn/death fact consumers need no enemy-specific edits.

## Contract 25 / Achievement 40

- existing objective/condition/metric/grant primitives;
- sparse save state absorbs IDs;
- read models/lists do not depend on current release counts.

## Presentation 500

- 500 logical static bindings;
- bounded atlas/resource count;
- no semantic-renderer explosion;
- no all-global Boot preload assumption.

## Builder N+1

- metadata/family addition is sufficient;
- deliberate source/export parity break fails the gate.

---

# 11. Non-goals

Scalability does **not** justify adding:

- generic ECS;
- arbitrary executable JSON;
- visual scripting;
- mod/plugin runtime;
- universal behavior trees;
- per-content save fields;
- content-ID scene/controller branches.

The target remains deliberately small:

> **validated catalogs + registered mechanic primitives + stable logical IDs + sparse persistence + explicit composition + source-free definition specs + resource bundles + generic conformance.**

---

# 12. Closeout verdict

### Planning / authoring layer

**PASS.** The V4 contract now has an explicit N+1 path for every active content-bearing domain, clear ownership, acquisition rules, resource architecture and synthetic proof target.

### RC1 implementation/tooling layer

**NOT YET PASS.** The audited baseline still contains provider-piece Set metadata, authored `sourceId`, static definition tier semantics, semantic `upgrade-icon` coupling, a 256 logical-binding ceiling, global non-world preload, per-ID builder registration and at least one generic fixed-roster test.

### Closure owner

Issue **#170** owns these cross-cutting implementation/tooling remediations. Domain issues instantiate the resulting templates; they must not reopen competing architecture.

The final standard is simple:

> **Adding ordinary content should grow content data/assets and explicit composition, not the amount of core engine code an author must understand.**
