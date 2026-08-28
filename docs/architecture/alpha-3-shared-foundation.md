# Alpha 3 Shared Foundation

> Status: implementation-locked architecture gate for Alpha 3. Tracks #92.
> This document sits between the Alpha 2 Golden Run and Epic 20 runtime implementation. It does not introduce a new player-facing Epic and does not renumber Epics 20–26.

## 1. Purpose

Alpha 3 adds several persistent and content-heavy systems: stages/contracts, bosses, achievements/mastery, persistent Gunsmith state, a larger mercenary roster, equipment sets, and integrated progression.

The repository already has strong foundations for one Golden Run: pure gameplay rules, named RNG streams, descriptor-driven validation, immutable data registries, versioned saves, and scene/system separation. The risk is not that those foundations are weak; it is that seven dependent Alpha 3 systems independently invent overlapping versions of stage composition, persistence, unlock conditions, rewards, content identity, validation, or content-version semantics.

This document freezes the shared boundaries that every Epic 20–26 architecture pass must inherit.

Also read:

- [`alpha-3-content-extensibility-contract.md`](alpha-3-content-extensibility-contract.md)
- [`../epics.md`](../epics.md)
- [`../roadmap.md`](../roadmap.md)
- Issue #92

## 1.1 Implemented contract decisions

The following decisions are now executable contracts, rather than proposals:

- `ComposedRunRequest` is a discriminated union: normal launches use
  `{ kind: 'stage', characterId, stageId, seed }`; legacy arena launches must
  use the explicit `{ kind: 'legacy-arena', characterId, arenaId, seed }`
  constructor. A stale normal-stage selection repairs to the catalog default;
  it never silently becomes a legacy arena run.
- `resolveRunPlan` is the sole stage-reference resolver. `GameScene` consumes
  the resolved plan and has no stage-ID branch. The arena spawn curve remains
  a narrow legacy compatibility input only.
- `SaveDataV3` owns sparse stage, boss, achievement, achievement-metric,
  character, Gunsmith-owned-instance, equipment-owned-instance/loadout and
  durable-receipt domains. `GameContext` is the only persistence boundary.
- A `DurableGrantTransaction` has a source-owned receipt ID. Its grants and
  receipt are saved together; a replay is a no-op. Publishing occurs only
  after persistence succeeds.
- Catalog/global IDs pass through conditions, grants and saves verbatim.
  Definition IDs, owned instance IDs and receipt IDs are distinct namespaces;
  no grant processor reconstructs prefixes.
- Conditions consume saved gameplay facts. In particular `boss-defeated`
  reads `SaveDataV3.bosses`, never an achievement derived from that fact.

The mandatory #94 certification prerequisite remains open because #78's
real-device evidence is still outstanding. This document records the safe
automatable contract baseline; it does not claim that prerequisite has passed.

## 2. Current Compatibility Baseline

Do not rewrite Alpha 2 to make Alpha 3 cleaner.

Current shipped/in-flight contracts remain valid until their owning epic deliberately supersedes them:

- `RunRequest` currently carries `characterId`, `arenaId`, and `seed`.
- `ArenaDefinition` currently references one `spawnCurveId`.
- the Alpha 2 Golden Run currently ends successfully when its spawn-curve duration elapses;
- `SaveDataV2` / `MetaState` currently own settings, scrap, unlock IDs, and permanent-upgrade levels;
- existing domain-local content IDs such as `scrap-tabby`, `junkyard-lot`, `dust-mite`, and weapon IDs are shipped identities;
- global/cross-domain identifiers such as `achievement:first-victory` and visual-art binding IDs already use namespaces;
- the current aggregate validation pipeline and descriptor ordering are compatibility contracts;
- the current Golden Run must remain replayable while Epic 20 introduces the new normal stage path.

Alpha 3 extends these contracts through explicit migrations/adapters. It does not silently redefine them.

## 3. Stage Becomes the Alpha 3 Composition Root

### 3.1 Decision

For the normal Alpha 3 game path, **Stage/Contract owns gameplay-content composition**.

A stage resolves references equivalent to:

```text
Stage
  ├─ arenaId
  ├─ objectiveId / objective definition
  ├─ encounterProfileId
  ├─ difficultyProfileId
  ├─ rewardProfileId
  ├─ bossId? / special encounter?
  └─ unlock condition
```

The physical arena answers "where does this happen?" It does not answer "what enemies does this stage use?", "how hard is it?", "what is the objective?", "what reward does it grant?", or "when does it end?".

### 3.2 Alpha 2 compatibility

The existing `ArenaDefinition.spawnCurveId` may remain for the Golden Run/legacy path until Epic 20 completes the stage migration. Do not remove it merely to force the new architecture into Alpha 2.

Epic 20 architecture must define an explicit migration/deprecation path rather than making one giant incompatible Arena rewrite.

### 3.3 Run selection / resolved plan

The current `RunRequest` should evolve toward a stage-oriented request without making UI/scenes resolve stage internals themselves.

Implemented boundary:

```ts
interface StageRunRequest {
  readonly characterId: string;
  readonly stageId: string;
  readonly seed: number;
}

interface ResolvedRunPlan {
  readonly characterId: string;
  readonly stageId: string;
  readonly arenaId: string;
  readonly objective: ResolvedObjective;
  readonly encounter: ResolvedEncounterProfile;
  readonly difficulty: ResolvedDifficultyProfile;
  readonly reward: ResolvedRewardProfile;
  readonly seed: number;
}
```

The ownership is frozen:

- menu/stage selection chooses a stage ID;
- one pure resolver validates/constructs the run plan;
- `GameScene` receives/wires the resolved plan;
- systems consume only the relevant resolved data;
- scenes never branch on stage IDs.

## 4. Stage / Objective State Owns Alpha 3 Victory

The current Alpha 2 victory helper based on `spawnCurve.durationSeconds` is a compatibility rule for the Golden Run, not the long-term mission contract.

Alpha 3 must have an authoritative Phaser-free or Phaser-independent stage/objective state owner with explicit lifecycle transitions.

Conceptual lifecycle:

```text
intro -> active -> objective-complete -> clearing/extraction? -> won
                         \-> failed/lost
```

Exact extraction/greed semantics belong to Epic 20.

Rules:

- `GameScene` never decides success by content ID;
- the spawn director does not own mission success;
- the arena does not own mission success;
- terminal stage reward banking happens exactly once;
- stage/objective state remains deterministic and pause-safe;
- stage completion emits/records authoritative facts downstream systems can consume.

## 5. Save V3 Domain Envelope

### 5.1 Why V3 is planned before Epic 20 persistence

`MetaState` is intentionally small today. Alpha 3 must not append five unrelated domains to it one epic at a time with each epic inventing its own sanitizer and mutation path.

Before Epic 20 writes durable stage progress, #92 must freeze the Save V3 shape and migration.

### 5.2 Required persistent domains

The V3 design must provide explicit domain ownership for at least:

```text
settings
progression/economy
  scrap / persistent currency
  legacy permanent-upgrade state or its migration/retirement path
  durable unlock/grant compatibility state if retained
stages
  sparse stage/chapter completion/progress
achievements
  sparse achievement/mastery progress
characters
  sparse unlock/mastery state where not derivable solely from shared conditions
Gunsmith
  persistent guns / parts / selected build(s)
equipment
  owned/equipped/upgraded equipment instances
```

This is an ownership map, not permission to add empty speculative fields with no consumer. #92 freezes the exact serializable V3 representation and introduces only what the first migrations actually need.

### 5.3 Mutation boundary

There remains **one authoritative persistence/update boundary**.

The current `GameContext.updateMeta()` concept may evolve, but Alpha 3 must not introduce independent direct LocalStorage writes for stages, achievements, equipment, Gunsmith, etc.

The architecture should prefer domain-scoped commands/transactions over arbitrary UI mutation of the entire save.

Implemented mutation boundary:

```text
UI / gameplay fact
       ↓
pure domain command / grant transaction
       ↓
authoritative progression/save boundary
       ↓
sanitize + persist + publish updated read state
```

### 5.4 V2 migration requirements

V2 -> V3 must preserve legitimate existing state, including:

- scrap;
- current permanent-upgrade levels until explicitly retired/rebalanced;
- existing valid unlock IDs;
- `achievement:first-victory` compatibility so already-unlocked Bolt Hound access is not lost;
- settings.

Do not reinterpret old save state through future native achievement mirrors.

## 6. Stable ID Policy

### 6.1 Preserve shipped IDs

Do **not** rename existing shipped domain IDs solely to make all catalogs visually namespaced.

Examples that remain legitimate stable IDs:

```text
scrap-tabby
bolt-hound
junkyard-lot
dust-mite
scrap-pistol-t1
```

### 6.2 When namespaces are useful

Use namespaced IDs where a value lives in a global/cross-domain identifier space or where collisions would otherwise be ambiguous.

Examples:

```text
achievement:first-victory
stage:junkyard-05
condition:stage-cleared
reward:unlock-character
character:scrap-tabby   # acceptable as a cross-domain reference wrapper/binding ID
```

A cross-domain namespaced reference does not require renaming the underlying domain-local definition ID.

### 6.3 Rules

- identity is immutable once persisted/shipped;
- order/display name is never identity;
- aliases/deprecations exist only when required by a real migration;
- stale IDs fail soft and remain diagnosable;
- every cross-catalog reference validates.

## 7. Shared Condition Vocabulary

Epics 20–26 use one condition model for unlock/prerequisite decisions.

Representative direction:

```ts
type ProgressionCondition =
  | { type: 'stage-cleared'; stageId: string }
  | { type: 'boss-defeated'; bossId: string }
  | { type: 'achievement-completed'; achievementId: string }
  | { type: 'mastery-reached'; subjectId: string; tier: number }
  | { type: 'owns-content'; contentId: string }
  | { type: 'all'; conditions: readonly ProgressionCondition[] }
  | { type: 'any'; conditions: readonly ProgressionCondition[] }
  | { type: 'not'; condition: ProgressionCondition };
```

Exact initial variants should remain deliberately small and may omit composition variants until real content requires them.

Rules:

- condition evaluation is pure/testable;
- content definitions reference typed condition data, not functions;
- platform Game Center / Google Play state is never a condition source;
- no `if (characterId === ...)` / `if (stageId === ...)` unlock code;
- new condition mechanics register one implementation, after which instances are data-only.

## 8. Shared Reward / Grant Vocabulary

Durable progression rewards use one transactional grant model.

Representative direction:

```ts
type ProgressionGrant =
  | { type: 'grant-scrap'; amount: number }
  | { type: 'unlock-stage'; stageId: string }
  | { type: 'unlock-character'; characterId: string }
  | { type: 'unlock-equipment'; equipmentId: string }
  | { type: 'unlock-part'; partId: string }
  | { type: 'unlock-trait'; traitId: string }
  | { type: 'grant-item'; itemId: string; amount?: number };
```

`DurableGrantTransaction` wraps one or more of these grants with a separate
source receipt ID. Individual pure grants are intentionally additive; only a
durable transaction is retry-safe. This prevents callers from mistaking a
numeric reward helper for an exactly-once boundary.

Rules:

- grants are data-defined and cross-reference validated;
- durable grant application is exactly-once where the source is exactly-once;
- UI cannot grant persistent state directly;
- one grant implementation is shared by stages, bosses, achievements and mastery;
- a new grant mechanic is a new registered/tested primitive, not a content-ID branch.

## 9. Catalog / Registry Standard

Alpha 3 should formalize the pattern the repository already uses rather than build a generic framework.

For an extensible content domain:

1. static JSON/data definition;
2. strict per-catalog validator;
3. aggregate descriptor registration;
4. cross-catalog validation;
5. immutable lookup registry when runtime lookup is needed;
6. pure registered behavior/effect implementation only when definitions reference a genuine runtime mechanic;
7. generic catalog-wide conformance tests.

### Validator modularization

`src/systems/validation.ts` remains the aggregate registration/error-order boundary, but new Alpha 3 domain validators should be allowed to live in focused modules once they become substantial.

The aggregate descriptor table remains the single place where a shipped catalog joins the root pipeline.

Do not rewrite existing validators solely to achieve prettier modularity.

### Registry consistency

New registries follow the validated-clone/deep-freeze lookup pattern used by existing character/arena/loot registries unless a domain has a documented reason not to.

The existing weapon registry is a known consistency gap: before persistent Gunsmith state depends on it, its static-definition immutability/validation behavior should be reconciled with the standard rather than copied into new registries.

## 10. Generic Conformance Registration

New catalogs need automatic definition-wide verification without creating one giant bespoke test file.

The #92 architecture should freeze a small test/validation registration pattern, conceptually:

```text
catalog descriptor
  + row validation
  + cross-reference validation
  + optional conformance assertions
```

Examples:

- every stage has a valid objective/arena/encounter/difficulty/reward path;
- every boss has a valid behavior/phase/defeat path;
- every achievement resolves metrics/conditions/rewards;
- every character resolves passive/ability/unlock/assets;
- every equipment item/set resolves slot/tier/effects/assets;
- every Gunsmith part resolves slot/trait/effects/assets.

The same tests must automatically cover newly added definitions.

## 11. Content Version != Save Version

Alpha 3 defines a lightweight content/catalog version concept independent of `SaveData.version`.

A save migration is for structural/semantic persistence changes.

A content version may change because definitions, pool membership or balance changed.

The following must not, by themselves, force a save migration:

- adding Stage 31;
- adding an enemy;
- adding an achievement;
- adding a part/equipment definition using existing instance shapes;
- tuning damage/spawn/reward values.

If deterministic replay/regression fixtures need to preserve an old content snapshot, the run/fixture records the relevant content version explicitly. Ordinary saves do not migrate on every balance patch.

## 12. Deterministic Explicit Pools

Any random content selection uses an explicit pool/profile ID.

Never define future behavior as "choose from every current X definition" unless that global behavior is deliberately the product rule.

Examples:

```text
encounter:junkyard-intro
upgrade-pool:golden-run-v1
reward-pool:junkyard-stage-t1
part-pool:junkyard-t1
```

Adding a new global definition does not alter an existing seeded pool until that pool is explicitly edited.

Pool weights/order/membership are validated content changes.

## 13. Asset Bundle Seam

PR #83's validated visual-art manifest is the preferred starting pattern.

Alpha 3 should preserve a path toward bundle-aware manifests:

```text
core
chapter:junkyard
chapter:sewers
```

Requirements:

- content resolves assets by stable IDs;
- no per-content hard-coded BootScene additions;
- required asset failures remain explicit;
- bundle membership is validated;
- loading only relevant chapter bundles may be introduced when a second real chapter proves it necessary;
- no downloadable-DLC/mod/plugin infrastructure is built in advance.

## 14. Combat Effect Seam Across Epics 17, 18 and 23

Epic 17/18 should not create temporary private mechanisms that Epic 23 later has to replace.

Before Alpha 2 closes, architecture should establish a **small reusable weapon/combat-effect vocabulary** sufficient for the actual Golden Run content that needs behavioral effects.

Potential primitives include concepts such as:

- pierce;
- explosive impact;
- burn/incendiary damage;
- ricochet;
- projectile count/spread/pattern changes;
- other family behavior proven by Epic 17/18 playtests.

Rules:

- do not implement speculative traits solely for future Gunsmith content;
- gameplay-affecting effects have one authoritative pure/system resolution path;
- Epic 18 cards may reference existing effects;
- Epic 23 parts/traits later compose the same approved effect semantics rather than introducing a parallel damage model;
- no weapon/card/part ID special cases in `GameScene`.

## 15. Input / Upgrade-Chooser Seam Across Epics 18 and 19

The upgrade engine already supports a configurable offer count. Alpha 2 should not grow its current `1`/`2`/`3` key special case into `1`–`5` as the primary architecture.

Epic 18 provides richer offer/read-model data. Epic 19 owns generic logical navigation/confirm.

Target behavior:

- touch may select a visible card directly;
- keyboard/controller use explicit focus/navigation + confirm;
- number keys may remain an optional shortcut, not the ownership model;
- 4–5 cards require no new card-specific command vocabulary;
- controller/keyboard/pointer all converge on the same authoritative chooser command.

## 16. `GameScene` Growth Boundary

`GameScene` is the composition root, not the domain-rule owner.

Reject Alpha 3 designs that place the following directly in `GameScene`:

- stage-ID objective logic;
- boss-ID behavior logic;
- achievement conditions/counters;
- persistent reward/unlock mutation;
- character-ID ability behavior;
- equipment/set-ID behavior;
- Gunsmith crafting rules;
- device-specific controller gameplay branches.

If a new feature materially expands scene wiring, prefer a resolved plan plus a dedicated system/coordinator with lifecycle ownership rather than adding another block of domain logic to the scene.

## 17. Content Validation Command

Do not add an empty/general-purpose `content:validate` package script yet.

When enough Alpha 3 catalogs exist to justify it, add one umbrella command that invokes the repository's actual validation layers, conceptually:

```text
content:validate
  -> aggregate game-data validation
  -> visual/art asset validation
  -> generic catalog conformance checks
  -> focused content reference checks
```

CI then calls this command in addition to or as a wrapper around existing component checks.

The command must represent real validation, not merely alias the entire test suite.

## 18. Architecture Docs vs Delivery Evidence

Future Alpha 3 architecture documents should be shorter than several existing epic delivery documents.

Permanent architecture should contain:

- decisions;
- contracts/types;
- ownership/module map;
- compatibility/migration rules;
- ordered implementation slices;
- tests/acceptance criteria;
- reviewer traps/exceptions.

Do not duplicate cross-cutting rules already frozen by this file or the content-extensibility contract. Link them.

Large execution evidence should live primarily in:

- PR body/checklist;
- a concise `docs/delivery/` record when durable evidence is useful;
- hosted CI/checks;
- linked manual QA record.

Architecture should remain useful after old run counts/browser transcripts stop mattering.

## 19. Foundation Gate Before Epic 20

No Epic 20 runtime implementation begins until #92 has frozen and reviewed:

- Stage/ResolvedRunPlan contracts;
- Alpha 2 arena/spawn-curve compatibility path;
- Save V3 migration/domain ownership;
- shared condition vocabulary;
- shared grant vocabulary;
- content/version semantics;
- catalog/registry/conformance pattern;
- deterministic pool rules;
- asset bundle seam;
- existing-ID compatibility policy.

Epics 21–26 then inherit those contracts and only architect their domain-specific additions/exceptions.

## 20. Reviewer Traps

Reject architecture/implementation that:

- renames existing shipped IDs for aesthetic consistency;
- makes Arena own Alpha 3 objective/difficulty/reward rules;
- keeps `spawnCurve.durationSeconds` as universal stage victory;
- adds `stage1Complete`, `stage2Complete`, etc. save fields;
- lets each Epic invent a different unlock/reward grammar;
- uses Game Center/Google Play as progression truth;
- selects randomly from all globally defined future content by default;
- writes persistent state outside the central save/progression boundary;
- makes `GameScene` branch on content IDs;
- turns the shared foundation into a generic game engine or scripting framework;
- forces save migrations for ordinary new content;
- copies multi-page shared contracts into every later epic document.

## 21. Done When

The #92 architecture pass is ready when an Epic 20 architect can answer all of the following by referencing frozen shared contracts rather than inventing them:

1. What identifies a stage and how does it resolve an arena/encounter/objective/difficulty/reward?
2. Who owns stage success/failure?
3. How is persistent stage progress stored and migrated?
4. How do unlock conditions work across every persistent system?
5. How do exactly-once durable rewards work?
6. How do new content definitions join validation/lookup/conformance?
7. How do old shipped IDs remain valid?
8. Why doesn't adding new content perturb old seeded pools?
9. When is a content-version change different from a save migration?
10. How can later chapter assets be bundled without a scene rewrite?

No player-facing Alpha 3 content needs to be implemented to close this architecture gate.
