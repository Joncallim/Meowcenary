# Alpha 3 Content Extensibility Contract

> Status: cross-cutting planning/architecture contract for Epics 20–26.
> This document is not a runtime implementation spec for any one epic. Each
> epic still requires its own dedicated architecture pass before coding.

## 1. Outcome

Alpha 3 must make Meowcenary easy to expand without turning every new stage,
enemy, boss, achievement, mercenary, equipment set, or Gunsmith part into a new
architecture exercise.

The default rule is:

> **Adding another instance of an existing content type should require data +
> assets, not gameplay-system source changes. New code is justified only when
> the new content introduces a genuinely new mechanic/behavior/effect/condition
> that the current registered vocabulary cannot express.**

This contract applies to:

- Epic 20 — Contracts, Objectives, and Stage Progression (#85)
- Epic 21 — Enemy Roster Expansion and Boss Framework (#86)
- Epic 22 — Achievements, Mastery, and Platform Sync (#91)
- Epic 23 — Persistent Gunsmith and Weapon-Part Crafting (#87)
- Epic 24 — Mercenary Roster Expansion (#88)
- Epic 25 — Armour Sets and Equipment Progression (#89)
- Epic 26 — Meta Progression Rebalance and Depth Integration (#90)

## 2. Stable Content IDs Are Permanent Contracts

All persistent/referenceable content uses stable string IDs. Array positions,
menu ordering, display names, and human-friendly numbers are never persistence
keys.

Representative namespaces:

```text
chapter:junkyard
stage:junkyard-05
arena:junkyard-lot
objective:kill-target
encounter:junkyard-ranged-heavy
difficulty:chapter-2-medium
reward:boss-tier-1
enemy:scrap-shooter
boss:crusher
achievement:first-boss
mastery:scrap-tabby-2
character:scrap-tabby
set:commando
equipment:commando-helmet-t2
part:incendiary-barrel
trait:fire
```

Rules:

- IDs are immutable once shipped in persistent saves.
- Reordering data never changes identity.
- Display names/localization are presentation only.
- Deleted/deprecated IDs fail soft when loaded from an old save; they never
  corrupt the entire save.
- Cross-catalog references validate at load/CI.
- Persistent state is keyed sparsely by stable IDs rather than fixed fields such
  as `stage1Complete`, `stage2Complete`, etc.

## 3. Content Packs / Chapters

Long-term content should be authorable in coherent packs rather than one giant
flat catalog. Exact file layout belongs to Epic 20 architecture, but the model
should support a structure equivalent to:

```text
content/
  junkyard/
    chapter
    stages
    encounters
    rewards
    assets

  sewers/
    chapter
    stages
    encounters
    rewards
    assets
```

A chapter owns ordered membership/presentation, not the implementation of each
system. Stages reference stable IDs for arenas, objectives, encounter profiles,
difficulty profiles, rewards, bosses, and unlock conditions.

A stage should conceptually compose independent data:

```text
Stage
  ├─ Arena
  ├─ Objective
  ├─ Encounter Profile
  ├─ Difficulty Profile
  ├─ Reward Profile
  ├─ Boss? / special encounter?
  └─ Unlock Conditions
```

Adding a new stage that only uses existing primitives must not require changes
to `GameScene` or objective/enemy/progression system source.

## 4. Typed Objective Vocabulary, Not Stage Scripts

Epic 20 should use a small typed/discriminated objective vocabulary rather than
special-casing stage IDs.

Representative direction:

```ts
type ObjectiveDefinition =
  | { type: 'kill'; count: number; enemyTag?: string }
  | { type: 'collect'; itemId: string; count: number }
  | { type: 'survive'; seconds: number }
  | { type: 'defeat'; enemyId: string };
```

Future primitives may include `hold-zone`, `protect`, `destroy`, or deliberate
compound objectives after real use cases appear.

Rules:

- Never implement `if (stageId === ...)` mission rules in scenes.
- Existing objective types are data-only to instantiate.
- A genuinely new objective type requires one new registered/tested rule
  implementation, after which future instances of that type are data-only.
- Prefer typed composition (`allOf`, `anyOf`) only when a second real use case
  justifies it; do not build a general scripting language in advance.

## 5. Separate Stage Composition From Difficulty

Stage definitions should not inline every health/damage/spawn number.
Difficulty and encounter composition are reusable profiles.

Example:

```text
stage:junkyard-07
  arena: arena:junkyard-lot
  objective: objective:collect-batteries
  encounterProfileId: encounter:junkyard-ranged-heavy
  difficultyProfileId: difficulty:chapter-2-medium
  rewardProfileId: reward:normal-tier-2
```

This lets one tuning change safely rebalance a family of stages without editing
individual stage contracts.

Rules:

- Encounter profile controls *what* threats appear and their composition.
- Difficulty profile controls approved scaling/pressure parameters.
- Reward profile controls reward cadence/content.
- Stage owns composition and objective, not duplicate tuning constants.

## 6. Registries: Data Instances vs New Mechanics

Each extensible domain separates:

1. static validated definitions;
2. stable behavior/effect/condition IDs;
3. a registry of tested implementations for genuinely different mechanics.

### Enemy / boss example

A new Shooter variant using an existing shooter behavior is data-only:

```text
enemy:scrap-shooter
behaviorId: shooter
health: ...
projectileId: acid-glob
cooldownMs: ...
```

A fundamentally new `teleport-ambusher` behavior requires one new registered
implementation. After registration, all teleport-ambusher variants are data.

Bosses should be compositions of reusable abilities/phases where practical:

```text
boss:crusher
phase 1: charge + aimed-volley
phase 2: summon-adds + radial-volley + charge
```

Do not branch in `GameScene` on boss IDs.

Apply the same pattern to:

- objective types;
- achievement metrics/conditions;
- Gunsmith traits/effects;
- character passives/abilities;
- armour/set effect types;
- unlock conditions and reward grants.

## 7. Shared Unlock / Condition Vocabulary

Epics 20–26 must not invent independent unlock syntaxes.

Architecture should converge on one validated condition vocabulary with stable
IDs and typed composition.

Representative primitives:

```text
stageCleared(stageId)
bossDefeated(bossId)
achievementCompleted(achievementId)
masteryReached(characterId, tier)
ownsItem(itemId)
```

Composition may support:

```text
all
any
not
```

Rules:

- Progression-critical requirements are explicit and inspectable.
- Conditions consume authoritative local Meowcenary state only.
- Game Center / Google Play state is never an unlock condition.
- Currency cannot bypass milestone conditions unless the product rule explicitly
  says so.
- Every referenced ID validates against the owning catalog.

## 8. Shared Reward / Grant Vocabulary

Similarly, stage, boss, achievement, and mastery rewards should use one grant
vocabulary instead of custom mutation code per epic.

Representative grant types:

```text
unlockStage
unlockCharacter
unlockEquipment
unlockPart
unlockTrait
grantCoins
grantItem
```

Rules:

- Rewards are data-defined and exactly-once.
- The progression/save boundary is the only durable mutation owner.
- UI cannot grant rewards directly.
- Existing grant types are data-only to instantiate.
- New reward mechanics require one new registered/tested grant handler, not
  content-ID special cases.

## 9. Sparse Persistent State

Persistent progress uses maps keyed by stable IDs, for example:

```ts
stageProgress: Record<StageId, StageProgress>;
achievementProgress: Record<AchievementId, AchievementProgress>;
characterMastery: Record<CharacterId, MasteryProgress>;
ownedEquipment: Record<EquipmentInstanceId, EquipmentInstance>;
ownedParts: Record<PartInstanceId, PartInstance>;
```

Rules:

- Missing/new IDs default safely to uncompleted/unowned state.
- Unknown stale IDs fail soft and remain recoverable/migratable.
- Never add one schema property per level/character/achievement.
- Save growth must remain bounded/understood; large future payloads can justify a
  storage-adapter change without changing game-domain ownership.

## 10. Save Schema Version != Content Version

Treat persistence structure and game content as separate version dimensions.

**Save schema version** changes when the persisted shape/semantics require a
migration.

**Content version** changes when available/tuned content changes.

Examples that must **not** require a save-schema migration:

- adding Stage 31;
- adding a new enemy definition;
- changing shotgun damage 15 → 16;
- adding a new achievement definition;
- adding a new armour set using existing effect types.

Examples that may require a migration:

- changing achievement progress from a boolean to structured counters;
- changing owned Gunsmith part instance shape;
- changing stage progress representation.

Runs/replay fixtures that need stable historical reproducibility may record a
content/version identifier explicitly; ordinary save migration must not be tied
to balance edits.

## 11. Deterministic Content Pools

Adding content globally must not silently perturb existing seeded behavior.

Avoid rules equivalent to:

> choose randomly from every enemy/upgrade/part currently in the game.

Instead, stages/reward profiles reference explicit stable pools.

Examples:

```text
encounter:junkyard-intro
  enemies: [dust-mite, junk-rusher, trash-brute]

upgradePool:golden-run-v1
  upgrades: [...explicit IDs...]

partPool:junkyard-tier-1
  parts: [...explicit IDs...]
```

Adding a new enemy/upgrade/part to the repository does not alter an existing
pool until that pool is deliberately edited.

Rules:

- RNG remains named/run-scoped.
- Pool membership/order/weight changes are explicit content changes.
- Deterministic tests pin representative pool resolution without overfitting
  every frame.

## 12. Asset Bundles / Manifests

The asset architecture should remain ID-driven and evolve toward bundle-aware
loading as content grows.

Conceptual bundles:

```text
core
chapter:junkyard
chapter:sewers
```

Rules:

- Required assets resolve from stable content IDs/manifests.
- Adding a chapter should not require hard-coded BootScene edits per asset.
- Current chapter assets may be loaded/preloaded independently from future
  chapter bundles once loading pressure justifies it.
- Missing required assets fail clearly in development/validation.
- Decorative/optional assets may fail soft only under an explicit fallback
  policy.
- Do not implement downloadable-DLC infrastructure now; preserve a path toward
  modular bundles without speculative platform complexity.

## 13. Generic Content Conformance Tests

Each catalog gets generic tests that automatically apply to every definition.

### Stage examples

For every stage:

- arena exists;
- objective validates;
- encounter/difficulty/reward profiles resolve;
- unlock references resolve;
- stage can initialize into a valid state;
- objective has a theoretical completion path;
- required assets/bundles resolve.

### Enemy / boss examples

For every enemy/boss:

- behavior IDs resolve;
- referenced projectiles/abilities resolve;
- boss phases/transitions are legal;
- defeat path exists;
- required assets resolve.

### Achievement examples

For every achievement:

- metric/condition IDs resolve;
- target is legal for its type;
- rewards/unlocks resolve;
- platform mappings are optional and unique where present.

### Gunsmith / character / equipment examples

For every definition:

- slot/effect/ability/trait IDs resolve;
- unlock conditions resolve;
- required assets resolve;
- data can build a valid immutable/read-model representation.

The same conformance suite should validate newly added content automatically.

## 14. Required Extensibility Gate for Epics 20–26

Every Alpha 3 epic must include this acceptance criterion:

> **Extensibility Gate:** The epic is not complete until a second representative
> content item of the same class can be added through data/assets only, with no
> changes to the system's core runtime source. Adding a genuinely new
> mechanic/behavior/effect/condition may require one new registered/tested
> implementation, but must never require special-casing existing content IDs.

Examples:

- Epic 20: add another stage using existing objective/profile types via data.
- Epic 21: add another enemy variant and another boss composition using existing
  registered behaviors via data/assets.
- Epic 22: add another achievement using existing metrics/conditions/rewards via
  data.
- Epic 23: add another part/trait instance using existing slot/effect/trait
  vocabulary via data/assets.
- Epic 24: add another character using existing passive/ability hooks via
  data/assets.
- Epic 25: add another four-piece set using existing effect/set-bonus vocabulary
  via data/assets.
- Epic 26: add another unlock/reward path using the shared condition/grant
  vocabularies via data.

Architecture PRs should include an explicit "data-only second fixture" test or
proof for this gate.

## 15. Content Authoring / Validation Workflow

Once the relevant systems exist, future content changes should follow a simple,
repeatable pipeline:

1. Add/modify definitions and assets.
2. Run aggregate data/reference/asset validation.
3. Run generic conformance tests.
4. Run deterministic representative fixtures.
5. Build.
6. Manual content playtest for readability/fun/balance.

A content addition that uses existing mechanics should not require an
architecture PR merely because another stage/enemy/item exists.

## 16. Explicit Non-Goals

Do **not** turn Meowcenary into a general game engine in Alpha 3.

Do not prebuild without evidence:

- a generic ECS rewrite;
- Lua/JS user scripting;
- a universal behavior-tree engine;
- a visual-scripting system;
- arbitrary executable JSON;
- a general-purpose level editor;
- downloadable-DLC infrastructure;
- plugin APIs for third-party mods.

Prefer typed unions, registries, validated definitions, and small pure rule
modules. Generalize only when a second/third real product use case proves the
need.

## 17. Architecture Review Checklist

Before approving any Epic 20–26 architecture, ask:

1. Can ordinary new content of this type be added without scene/runtime source
   changes?
2. Are IDs stable and persistent-state-safe?
3. Are new mechanics registered rather than content-ID special-cased?
4. Are stage composition, difficulty, and rewards separated appropriately?
5. Does the epic reuse shared unlock and reward vocabularies rather than invent
   another one?
6. Does adding global content silently perturb old seeded pools?
7. Is save-schema versioning separate from content/balance versioning?
8. Can required assets be resolved/validated by ID without per-content scene
   edits?
9. Does a generic conformance test automatically cover every definition?
10. Is there a data-only second fixture proving the extensibility gate?
11. Is the design simpler than a generic scripting/engine framework?

If the answer to any of 1–10 is "no", the architecture should explain why the
exception is necessary before implementation begins.
