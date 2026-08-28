# Alpha 3 Shared Foundation Architecture — Issue #92

> **Status:** Architecture gate. Blocks Epic 20–26 runtime implementation.
> **Baseline:** Post-#94 certified Alpha 2 `main` branch (current: `bbe8bc5`).
> **Authoritative upstream:** [`docs/architecture/alpha-3-shared-foundation.md`](alpha-3-shared-foundation.md),
> [`docs/architecture/alpha-3-content-extensibility-contract.md`](alpha-3-content-extensibility-contract.md),
> [`docs/epics.md`](../epics.md), [`docs/roadmap.md`](../roadmap.md).

---

## 1. Purpose and Scope

Alpha 3 adds seven persistent and content-heavy systems (stages/contracts, enemy roster expansion,
bosses, achievements/mastery, persistent Gunsmith, larger mercenary roster, equipment sets, integrated
progression). Without frozen shared contracts, each Epic 20–26 architect would independently invent
competing versions of stage composition, persistence, unlock conditions, rewards, content identity,
validation, and content-version semantics.

This document is the **single implementation-ready contract** for every Epic 20–26 architecture pass.
It does not introduce a player-facing Epic and does not renumber Epics 20–26.

### Read-Only Artifacts Consumed

| Artifact | Role |
|---|---|
| `docs/epics.md` | Cross-epic module names, data shapes, boundaries, sequencing |
| `docs/architecture.md` | Runtime shape, system boundaries, input/action architecture, progression-layer boundary |
| `docs/architecture/alpha-3-shared-foundation.md` | Planning intent; this document is the finalized architecture |
| `docs/architecture/alpha-3-content-extensibility-contract.md` | Extensibility gate and second-fixture requirement |
| `docs/roadmap.md` | Epics 20–26 product scope and planned boundaries |
| `src/systems/types.ts` | All current TypeScript definitions |
| `src/systems/save.ts` | Save V1/V2, `SaveManager`, `MetaState`, migration machinery |
| `src/systems/validation.ts` | ~3000-line monolithic validator with `CATALOG_DESCRIPTORS` table |
| `src/systems/ids.ts` | `isContentId`, `isUnlockId` regex validators |
| `src/engine/rng.ts` | `createRng`, `deriveRunSeed`, FNV-1a stream derivation |
| `src/gameplay/runState.ts` | `RunState`, lifecycle transitions |
| `src/gameplay/runRequest.ts` | `RunRequest`, `assembleRunRequest` |
| `src/gameplay/stats.ts` | `ModifierStack`, stat vocabulary, weapon-family scope |
| `src/gameplay/upgrades.ts` | `offerCards`, `applyCard`, `UpgradeOfferContext` |
| `src/gameplay/meta.ts` | `UnlockRule`, `RunReward`, `bankReward`, `computeRunReward` |
| `src/gameplay/weaponRack.ts` | `WEAPON_RACK_CAPACITY`, `grantWeaponToRack` |
| `src/gameplay/loot.ts` | `resolveLoot`, `resolveKillLoot`, `LootGrant` |
| `src/gameplay/weaponRewards.ts` | `WEAPON_REWARD_TABLE_ID`, deterministic reward stream |
| `src/gameplay/spawnDirector.ts` | `SpawnDirector`, `createSpawnDirector` |
| `src/engine/eventBus.ts` | `GameEventMap`, `EventBus`, `GAME_EVENT_KEYS` |
| `src/engine/context.ts` | `GameContext`, `updateMeta`, persistence boundary |
| `src/systems/weaponRegistry.ts` | `DataWeaponRegistry`, validated-clone/deep-freeze lookup |
| `src/systems/lootTables.ts` | `DataLootTableRegistry` |
| `src/systems/visualArt.ts` | `DataVisualArtRegistry` |
| `src/scenes/GameScene.ts` | Scene composition root — 791 lines, target for growth-boundary enforcement |

---

## 2. Shared Vocabulary

### 2.1 Stable Content ID Policy

**IDs are immutable once persisted/shipped.** Array positions, display names, and human-friendly
numbers are never persistence keys.

**Preserved shipped IDs** (do not rename for aesthetic namespacing):

```
scrap-tabby, bolt-hound, junkyard-lot, dust-mite, junk-rusher, trash-brute, scrap-shot
scrap-pistol-t1, scrap-shotgun-t1, scrap-smg-t1 (and all tier variants)
```

**Namespaced IDs** for cross-domain/global identity spaces:

```
achievement:first-victory    stage:junkyard-05       condition:stage-cleared
reward:unlock-character      character:scrap-tabby    boss:crusher
enemy:scrap-shooter          chapter:junkyard         set:commando
equipment:commando-helmet-t2 part:incendiary-barrel   trait:fire
```

**Validation:** `isContentId` (`/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`) covers domain-local IDs.
`isUnlockId` (`/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`) covers
namespaced references like `achievement:first-victory`. New Alpha 3 catalogs must validate
IDs through these existing functions or a documented extension.

**Rules:**
- Identity is immutable; order/display name is never identity.
- Aliases/deprecations exist only when required by a real migration.
- Stale IDs fail soft and remain diagnosable.
- Every cross-catalog reference validates at load/CI.

### 2.2 Stage / Contract Vocabulary

```ts
// Stage ID pattern: stage:<chapter>-<number>
// Chapter ID pattern: chapter:<name>

type StageId = string;  // e.g. 'stage:junkyard-01'
type ChapterId = string; // e.g. 'chapter:junkyard'

// Objective families (discriminated union, not stage-ID branches)
type ObjectiveType =
  | { type: 'kill'; count: number; enemyTag?: string }
  | { type: 'collect'; itemId: string; count: number }
  | { type: 'survive'; seconds: number }
  | { type: 'defeat'; enemyId: string };

// Future primitives (only after real use cases): 'hold-zone', 'protect', 'destroy'
```

**Rules:**
- Never implement `if (stageId === ...)` mission rules in scenes or systems.
- Existing objective types are data-only to instantiate.
- A genuinely new objective type requires one new registered/tested rule implementation.
- Typed composition (`allOf`, `anyOf`) only when a second real use case justifies it.

### 2.3 Shared Condition Vocabulary

One condition model for all unlock/prerequisite decisions across Epics 20–26:

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

**Rules:**
- Condition evaluation is pure and testable (no side effects, no I/O).
- Content definitions reference typed condition data, never functions.
- Platform Game Center / Google Play state is **never** a condition source.
- No `if (characterId === ...)` / `if (stageId === ...)` unlock code anywhere.
- New condition mechanics register one implementation; after which instances are data-only.
- Every referenced ID validates against its owning catalog.
- Currency cannot bypass milestone conditions unless the product rule explicitly allows it.

### 2.4 Shared Reward / Grant Vocabulary

One transactional grant model for durable progression rewards:

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

**Rules:**
- Grants are data-defined and cross-reference validated.
- Durable grant application is exactly-once where the source is exactly-once.
- UI cannot grant persistent state directly.
- One grant implementation shared by stages, bosses, achievements, and mastery.
- A new grant mechanic is a new registered/tested primitive, not a content-ID branch.

---

## 3. Stage / Progression Contracts

### 3.1 Stage as Alpha 3 Composition Root

**Decision: Stage/Contract owns gameplay-content composition for the normal Alpha 3 path.**

A stage resolves references equivalent to:

```text
Stage
  ├─ arenaId          → ArenaDefinition (physical world)
  ├─ objectiveId      → ObjectiveDefinition (typed objective vocabulary)
  ├─ encounterProfileId → EncounterProfile (what threats, composition)
  ├─ difficultyProfileId → DifficultyProfile (scaling/pressure parameters)
  ├─ rewardProfileId  → RewardProfile (reward cadence/content)
  ├─ bossId?          → BossDefinition (optional boss encounter)
  └─ unlock           → ProgressionCondition (unlock prerequisite)
```

The physical arena answers "where does this happen?" — it does **not** answer what enemies,
how hard, what objective, what reward, or when the stage ends.

### 3.2 Run Selection → Resolved Plan

The current `RunRequest` (`{ characterId, arenaId, seed }`) evolves toward a stage-oriented
request without making UI/scenes resolve stage internals:

```ts
// Stage-oriented run request — replaces the Alpha 2 RunRequest for normal play
interface StageRunRequest {
  readonly characterId: string;
  readonly stageId: string;
  readonly seed: number;
}

// Pure resolver output — GameScene wires this, systems consume relevant slices
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

// One pure resolver validates/constructs the plan
function resolveRunPlan(request: StageRunRequest, data: GameData): ResolvedRunPlan;
```

**Ownership:**
- Menu/stage selection chooses a stage ID.
- One pure resolver (`resolveRunPlan`) validates and constructs the run plan.
- `GameScene` receives and wires the resolved plan — never resolves stage internals.
- Systems consume only the relevant resolved data slices.
- Scenes never branch on stage IDs.

### 3.3 Alpha 2 Compatibility

The existing `ArenaDefinition.spawnCurveId` remains for the Golden Run/legacy path until
Epic 20 completes the stage migration. Do not remove it merely to force the new architecture
into Alpha 2.

The current Alpha 2 victory helper based on `spawnCurve.durationSeconds` is a compatibility
rule for the Golden Run, not the long-term mission contract. Epic 20 architecture must define
an explicit migration/deprecation path.

### 3.4 Stage / Objective State Owns Alpha 3 Victory

A new authoritative, Phaser-free stage/objective state owner with explicit lifecycle:

```ts
type StageStatus = 'intro' | 'active' | 'objective-complete' | 'won' | 'failed';

interface StageState {
  status: StageStatus;
  objectiveProgress: ObjectiveProgress;  // discriminated per ObjectiveType
  timeMs: number;
  // ... other stage-scoped state
}
```

**Lifecycle:**

```text
intro → active → objective-complete → won
                     ↘ failed
```

Epic 20 currently commits an immediate durable clear; optional extraction/greed
semantics are not part of this shared contract.

**Rules:**
- `GameScene` never decides success by content ID.
- The spawn director does not own mission success.
- The arena does not own mission success.
- Terminal stage reward banking happens exactly once.
- Stage/objective state remains deterministic and pause-safe.
- Stage completion emits/records authoritative facts downstream systems consume.

### 3.5 Separate Stage Composition from Difficulty

Stage definitions do not inline every health/damage/spawn number. Difficulty and encounter
composition are reusable profiles:

```text
stage:junkyard-07
  arena: arena:junkyard-lot
  objective: objective:collect-batteries
  encounterProfileId: encounter:junkyard-ranged-heavy
  difficultyProfileId: difficulty:chapter-2-medium
  rewardProfileId: reward:normal-tier-2
```

| Profile | Controls |
|---|---|
| Encounter | *What* threats appear and their composition |
| Difficulty | Approved scaling/pressure parameters |
| Reward | Reward cadence and content |
| Stage | Composition and objective, not duplicate tuning constants |

---

## 4. Save V3 Schema + V2→V3 Migration

### 4.1 Why V3 Is Required Before Epic 20 Persistence

`MetaState` is intentionally small today (`scrap`, `unlocks`, `permanentUpgrades`). Alpha 3
must not append five unrelated domains to it one epic at a time, with each epic inventing its
own sanitizer and mutation path.

**Before Epic 20 writes durable stage progress, #92 freezes the Save V3 shape and migration.**

### 4.2 Required Persistent Domains

```ts
interface SaveDataV3 {
  readonly version: 3;
  readonly settings: Settings;           // unchanged from V2
  readonly progression: ProgressionState;
  readonly stages: StageProgressState;
  readonly achievements: AchievementProgressState;
  readonly characters: CharacterMasteryState;
  readonly gunsmith: GunsmithState;
  readonly equipment: EquipmentState;
  readonly items: ItemInventoryState;
}

// ProgressionState replaces the flat MetaState
interface ProgressionState {
  readonly scrap: number;
  readonly unlocks: readonly string[];              // existing unlock IDs preserved
  readonly permanentUpgrades: Readonly<Record<string, number>>; // legacy, retirement path TBD by Epic 26
}

// Sparse maps keyed by stable IDs — never fixed fields like stage1Complete, stage2Complete
type StageProgressState = Record<string, StageProgress>;       // keyed by StageId
type AchievementProgressState = Record<string, AchievementProgress>; // keyed by AchievementId
type CharacterMasteryState = Record<string, MasteryProgress>;  // keyed by CharacterId
type GunsmithState = { readonly builds: Build[]; readonly parts: Record<string, PartInstance> };
type EquipmentState = Record<string, EquipmentInstance>;       // keyed by EquipmentInstanceId
type ItemInventoryState = Record<string, number>;              // keyed by canonical item ID

interface StageProgress {
  readonly completed: boolean;
  readonly bestTimeMs?: number;
  // Extensible per future needs; never boolean flags per stage ID
}

interface AchievementProgress {
  readonly completed: boolean;
  readonly progress?: number;  // for incremental achievements
  readonly completedAt?: number; // timestamp
}

interface MasteryProgress {
  readonly tier: number;
  readonly xp: number;
}
```

### 4.3 Mutation Boundary

There remains **one authoritative persistence/update boundary**. The current
`GameContext.updateMeta()` concept evolves to domain-scoped commands:

```text
UI / gameplay fact
       ↓
pure domain command / grant transaction
       ↓
authoritative progression/save boundary (SaveManager + GameContext)
       ↓
sanitize + persist + publish updated read state
```

Alpha 3 must not introduce independent direct LocalStorage writes for stages, achievements,
equipment, Gunsmith, etc. The existing `SaveManager` + `StorageAdapter` pattern extends to V3
without creating new storage keys.

### 4.4 V2 → V3 Migration

```ts
const CURRENT_SAVE_VERSION = 3;

function migrateV2ToV3(raw: Readonly<Record<string, unknown>>): SaveDataV3 {
  const v2Meta = sanitizeMeta(readOwn(raw, 'meta'), maxLevels);
  return freezeSaveV3({
    version: 3,
    settings: sanitizeSettings(readOwn(raw, 'settings'), DEFAULT_SETTINGS),
    progression: {
      scrap: v2Meta.scrap,
      unlocks: v2Meta.unlocks,
      permanentUpgrades: v2Meta.permanentUpgrades,
    },
    stages: {},           // empty — no stage progress in V2
    achievements: migrateAchievementsFromV2(v2Meta), // see §4.5
    characters: {},       // empty — no mastery in V2
    gunsmith: { builds: [], parts: {} },
    equipment: {},
  });
}
```

**Preserved V2 state:**
- `scrap` → `progression.scrap`
- Existing valid unlock IDs → `progression.unlocks`
- Current permanent-upgrade levels → `progression.permanentUpgrades` (until Epic 26 retires/rebalances)
- `achievement:first-victory` compatibility → `achievements['achievement:first-victory']` so Bolt Hound access is not lost
- Settings → `settings` (unchanged)

### 4.5 First-Victory Achievement Migration

```ts
function migrateAchievementsFromV2(meta: MetaState): AchievementProgressState {
  const achievements: AchievementProgressState = {};
  if (meta.unlocks.includes('achievement:first-victory')) {
    achievements['achievement:first-victory'] = {
      completed: true,
      completedAt: undefined, // V2 has no timestamp
    };
  }
  return achievements;
}
```

Do not reinterpret old save state through future native achievement mirrors. The V2 unlock ID
`achievement:first-victory` is the authoritative source; V3 simply represents it in the new
domain structure.

### 4.6 SaveManager Extension

```ts
class SaveManager {
  // Existing: load(): SaveData, save(data: SaveData): boolean, clear(): boolean
  // V3 addition: version-aware load/save, write-protection for future versions > 3

  loadV3(): SaveDataV3 { /* decodes version 1/2/3, write-protects > 3 */ }
  saveV3(data: SaveDataV3): boolean { /* sanitizes + persists V3 */ }
}
```

The `writeProtected` flag for unsupported future versions is preserved and extended to version > 3.

---

## 5. Content Extensibility Contract (Second-Fixture Proof Required)

### 5.1 Default Rule

> **Adding another instance of an existing content type should require data + assets,
> not gameplay-system source changes. New code is justified only when the new content
> introduces a genuinely new mechanic/behavior/effect/condition that the current
> registered vocabulary cannot express.**

### 5.2 Required Extensibility Gate Per Epic

Every Epic 20–26 architecture PR must include:

> **Extensibility Gate:** The epic is not complete until a second representative content
> item of the same class can be added through data/assets only, with no changes to the
> system's core runtime source. Adding a genuinely new mechanic/behavior/effect/condition
> may require one new registered/tested implementation, but must never require
> special-casing existing content IDs.

**Second-fixture proofs required:**

| Epic | Proof |
|---|---|
| Epic 20 | Add another stage using existing objective/profile types via data |
| Epic 21 | Add another enemy variant and boss composition using existing registered behaviors via data/assets |
| Epic 22 | Add another achievement using existing metrics/conditions/rewards via data |
| Epic 23 | Add another part/trait instance using existing slot/effect/trait vocabulary via data/assets |
| Epic 24 | Add another character using existing passive/ability hooks via data/assets |
| Epic 25 | Add another four-piece set using existing effect/set-bonus vocabulary via data/assets |
| Epic 26 | Add another unlock/reward path using shared condition/grant vocabularies via data |

### 5.3 Registry Pattern: Data Instances vs New Mechanics

Each extensible domain separates:
1. Static validated definitions (data)
2. Stable behavior/effect/condition IDs (vocabulary)
3. A registry of tested implementations for genuinely different mechanics

**Enemy example:**

```text
# New variant using existing shooter behavior → data only
enemy:scrap-shooter
  behaviorId: shooter
  health: ...
  projectileId: acid-glob
  cooldownMs: ...

# Fundamentally new behavior → one new registered implementation
enemy:teleport-ambusher
  behaviorId: teleport-ambusher  ← new, requires one implementation
  health: ...
  teleportRange: ...
```

**Boss example:**

```text
boss:crusher
  phase 1: charge + aimed-volley     ← reuse registered phase behaviors
  phase 2: summon-adds + radial-volley + charge
```

**Do not branch in `GameScene` on boss/enemy IDs.**

Apply the same pattern to: objective types, achievement metrics/conditions, Gunsmith
traits/effects, character passives/abilities, armour/set effect types, unlock conditions,
and reward grants.

---

## 6. Enemy / Upgrade / Reward Registry Patterns

### 6.1 Enemy Archetype Registration (Cross-Reference: #94 Deferred)

Current `EnemyArchetype` vocabulary in `src/systems/types.ts`:

```ts
type EnemyArchetype = 'chaser' | 'charger' | 'ranged' | 'tank' | 'elite' | 'boss';
type SpawnableEnemyArchetype = 'chaser' | 'charger' | 'tank';
```

Epic 21 expands to ~8 behavioral archetypes. The registry pattern is:

1. **Static definition** in JSON data (e.g., `src/data/enemies.json` extended)
2. **Per-catalog validator** (eventually in `src/systems/validation/enemies.ts` after the planned split)
3. **Immutable lookup registry** (`DataEnemyRegistry`, following the `DataWeaponRegistry` pattern of validated-clone/deep-freeze)
4. **Registered behavior implementations** for genuinely different mechanics

```ts
// Epic 21 expanded archetype vocabulary (additive to existing)
type EnemyArchetype =
  | 'chaser' | 'charger' | 'ranged' | 'tank' | 'elite' | 'boss'
  | 'shooter' | 'spawner' | 'shielded' | 'splitter';

// Behavior registry: one implementation per behaviorId
interface EnemyBehaviorRegistry {
  registerBehavior(id: string, behavior: EnemyBehavior): void;
  getBehavior(id: string): EnemyBehavior | undefined;
}
```

**Enemy definition example (new shooter variant — data only):**

```json
{
  "id": "scrap-shooter",
  "name": "Scrap Shooter",
  "archetype": "shooter",
  "behaviorId": "shooter",
  "health": 80,
  "damage": 12,
  "speed": 60,
  "xpValue": 15,
  "scrapValue": 3,
  "contactDamage": false,
  "projectileId": "acid-glob",
  "attack": { "range": 250, "telegraphMs": 600, "cooldownMs": 2000 }
}
```

### 6.2 Upgrade Registry (Existing + Extensions)

Current pattern (`UpgradeDefinition` → `UpgradeSystem` → `offerCards`/`applyCard`) is sound
and extends to Alpha 3:

- JSON effects omit `sourceId`; application assigns stable per-stack sources (`card:<id>:<stack>`)
- `RunState.upgradeStacks[id]` is the stack-limit authority
- Card application is transactional (rollback on failure)
- Multi-level gains queue one offer per level
- `card:offered` uses a per-run monotonically increasing `offerId`
- Empty eligible pools cannot deadlock the run

**Alpha 3 extension:** Epic 20/26 may introduce stage-scoped upgrade pools (different card
pools per chapter) without changing the offer/apply machinery:

```ts
interface UpgradePoolDefinition {
  readonly id: string;         // e.g. 'upgrade-pool:junkyard-v1'
  readonly upgradeIds: readonly string[];  // explicit membership, not "all current upgrades"
}
```

### 6.3 Reward Registry

Rewards follow the same pattern:

```ts
interface RewardProfileDefinition {
  readonly id: string;          // e.g. 'reward:boss-tier-1'
  readonly grants: readonly ProgressionGrant[];  // typed grant vocabulary
  readonly lootTableId?: string;  // optional in-run loot table
}
```

The existing `LootGrant` / `LootTable` machinery (weighted selection, chest recursion, weapon
grants) remains authoritative for in-run loot. Durable progression rewards use the new
`ProgressionGrant` vocabulary routed through the save/progression boundary.

### 6.4 Generic Conformance Registration

New catalogs need automatic definition-wide verification without one giant bespoke test file:

```ts
// Each catalog registers conformance assertions
interface CatalogConformance {
  readonly catalogId: string;
  readonly assertions: ReadonlyArray<{
    readonly name: string;
    readonly check: (definition: unknown, allDefinitions: readonly unknown[]) => void;
  }>;
}

// Examples:
// - Every stage has a valid objective/arena/encounter/difficulty/reward path
// - Every boss has a valid behavior/phase/defeat path
// - Every achievement resolves metrics/conditions/rewards
// - Every character resolves passive/ability/unlock/assets
// - Every equipment item/set resolves slot/tier/effects/assets
// - Every Gunsmith part resolves slot/trait/effects/assets

function runConformanceTests(conformances: readonly CatalogConformance[]): void;
```

The same conformance tests must automatically cover newly added definitions.

---

## 7. Deterministic Seed / RNG

### 7.1 Existing Contract (Preserved)

```ts
interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T;
}

function createRng(seed: number): Rng;
function deriveRunSeed(seed: number, stream: string): number;
```

- All gameplay randomness flows through deterministic run-scoped streams derived from the run seed.
- Never call `Math.random()` in gameplay code.
- `GameContext.menuRng` is menu-only.
- Subsystems own named streams so one subsystem's RNG consumption cannot silently perturb another.
- FNV-1a hash over `seed:streamName` derives stable uint32 stream seeds.

### 7.2 Alpha 3 Stream Naming Convention

```text
Stream naming: <domain>[:<subdomain>]

Existing:  spawn, loot, upgrade-offer, weapon-reward
Alpha 3 additions:
  stage-objective    — objective randomization (e.g. collect-item positions)
  stage-encounter    — encounter composition draws
  stage-reward       — stage reward resolution
  boss-phase         — boss phase/attack selection
  gunsmith-craft     — crafting outcome RNG
  equipment-drop     — equipment drop RNG
```

Each subsystem that consumes randomness gets exactly one named stream, derived once at run
start and reused throughout the run.

### 7.3 Deterministic Content Pools

Adding content globally must not silently perturb existing seeded behavior. Avoid rules
equivalent to "choose randomly from every enemy/upgrade/part currently in the game."

Instead, stages/reward profiles reference explicit stable pools:

```text
encounter:junkyard-intro
  enemies: [dust-mite, junk-rusher, trash-brute]

upgrade-pool:golden-run-v1
  upgrades: [...explicit IDs...]

part-pool:junkyard-tier-1
  parts: [...explicit IDs...]
```

**Rules:**
- Adding a new enemy/upgrade/part to the repository does not alter an existing pool until
  that pool is deliberately edited.
- RNG remains named/run-scoped.
- Pool membership/order/weight changes are explicit content changes.
- Deterministic tests pin representative pool resolution without overfitting every frame.

---

## 8. Validation Architecture (Modular Per-Domain Validators)

### 8.1 Current State

`src/systems/validation.ts` is a ~3000-line monolithic file with a `CATALOG_DESCRIPTORS` table
that registers each catalog's JSON import, row pipeline, and aggregate assembly. The planned
split is documented in the file header:

```text
src/systems/validation/
  weapons.ts       — validateWeaponCatalog, validateWeaponFeelCatalog
  enemies.ts       — validateEnemyCatalog
  upgrades.ts      — validateMetaUpgradeCatalog, upgrade validators
  arenas.ts        — validateArenaCatalog
  characters.ts    — validateCharacterCatalog
  loot.ts          — validateLootTableCatalog
  meta.ts          — meta-upgrade validators
  visual-art.ts    — validateVisualArtCatalog
  audio.ts         — validateAudioAssets, validateAudioMapCatalog
  index.ts         — shared aggregate registry (validateGameData, validateAllData, shared helpers)
```

### 8.2 Split Strategy

**The split belongs to #94 remediation, not #92.** However, #92 freezes the architecture
so new Alpha 3 domain validators follow the modular pattern from day one:

1. **`src/systems/validation/index.ts`** retains the `CATALOG_DESCRIPTORS` table, `validateGameData`,
   `validateAllData`, `collectValidationErrors`, `validate<T>`, and all shared helpers.
2. **New Alpha 3 validators** live in `src/systems/validation/<domain>.ts` (e.g.,
   `stages.ts`, `achievements.ts`, `gunsmith.ts`, `equipment.ts`).
3. **Each new validator** exports a `validate<Domain>Catalog` function and a `check<Domain>`
   row-check function following the existing `RowCheck` signature:
   ```ts
   type RowCheck = (row: unknown, index: number) => string[];
   ```
4. **New catalogs register** in `CATALOG_DESCRIPTORS` (one entry) and `CATALOG_LEVEL_ASSERTIONS`
   (if they need cross-catalog assertions).
5. **Existing validators are not rewritten** solely for modularity — the split happens
   incrementally as part of #94 or when a domain's validator grows substantially.

### 8.3 Alpha 3 Catalog Registration

Each new Alpha 3 catalog adds one descriptor entry:

```ts
{
  key: 'stages',           // GameData assembly key
  file: 'stages.json',     // JSON file name
  rootKey: 'stages',       // aggregate root field
  data: stagesJson,        // shipped JSON import
  read: (raw) => readOwnField(raw, 'stages'),
  validateRows: validateStageCatalog,  // from validation/stages.ts
}
```

### 8.4 Cross-Catalog Validation

Alpha 3 extends the cross-reference validation chain in `validateGameData`:

```ts
// New cross-reference assertions (appended after existing ones, preserving
// frozen first-error order):
assertStageArenaReferences(stages, arenas);
assertStageEncounterReferences(stages, encounterProfiles);
assertStageRewardReferences(stages, rewardProfiles);
assertStageUnlockReferences(stages);  // validates ProgressionCondition references
assertBossStageReferences(bosses, stages);
assertAchievementRewardReferences(achievements);
assertEquipmentSetReferences(equipment);
assertGunsmithPartReferences(parts, traits);
// ... etc.
```

### 8.5 Future `content:validate` Command

When enough Alpha 3 catalogs exist, add one umbrella script:

```json
{
  "scripts": {
    "content:validate": "node scripts/content-validate.mjs"
  }
}
```

This invokes:
1. Aggregate game-data validation (existing `validateGameData`)
2. Visual/art asset validation (existing `npm run art:validate`)
3. Generic catalog conformance checks (new)
4. Focused content reference checks (new)

CI calls this in addition to existing `npm test`, `npm run lint`, `npm run build`.

---

## 9. Build / Bundle Manifest

### 9.1 Current Pattern

PR #83's validated visual-art manifest (`src/data/visual-art.json`, 46 bindings) is the
preferred starting pattern. Each binding has a stable `id`, `kind`, `textureKey`, `url`,
`required` flag, `sampling`, `load` descriptor, and `display` dimensions.

The `DataVisualArtRegistry` validates and deep-freezes bindings; `BootScene` preloads
required assets; `ensureVisualAnimations` creates spritesheet animations.

### 9.2 Bundle-Aware Manifest Evolution

Alpha 3 preserves a path toward bundle-aware manifests without implementing DLC
infrastructure now:

```text
Conceptual bundles:
  core              — always loaded (UI, common effects, shared assets)
  chapter:junkyard  — current chapter content
  chapter:sewers    — future chapter content
```

**Requirements:**
- Content resolves assets by stable IDs (existing `VisualArtBinding.id` pattern).
- No per-content hard-coded `BootScene` additions.
- Required asset failures remain explicit (throw in dev/validation, fail-soft only under
  explicit fallback policy).
- Bundle membership is validated.
- Loading only relevant chapter bundles may be introduced when a second real chapter proves
  it necessary.
- No downloadable-DLC/mod/plugin infrastructure is built in advance.

### 9.3 Content Version ≠ Save Version

```ts
// Separate version dimensions
const CONTENT_VERSION = 1;  // changes when definitions, pools, or balance change
const SAVE_VERSION = 3;     // changes when persisted shape/semantics require migration
```

**Must NOT force a save migration:**
- Adding Stage 31
- Adding an enemy definition
- Adding an achievement definition
- Adding a part/equipment definition using existing instance shapes
- Tuning damage/spawn/reward values
- Adding a new armour set using existing effect types

**May require a save migration:**
- Changing achievement progress from boolean to structured counters
- Changing owned Gunsmith part instance shape
- Changing stage progress representation
- Adding a new persistent domain that didn't exist before

If deterministic replay/regression fixtures need to preserve an old content snapshot, the
run/fixture records the relevant content version explicitly. Ordinary saves do not migrate
on every balance patch.

---

## 10. GameScene Growth Boundary (Cross-Reference: #94 Closures)

### 10.1 Current State

`src/scenes/GameScene.ts` is 791 lines. It is the composition root — it creates systems,
wires them, and owns the update loop. It is already at the upper bound of acceptable scene
complexity.

### 10.2 Alpha 3 Rejection Rules

**Reject Alpha 3 designs that place the following directly in `GameScene`:**

- Stage-ID objective logic
- Boss-ID behavior logic
- Achievement conditions/counters
- Persistent reward/unlock mutation
- Character-ID ability behavior
- Equipment/set-ID behavior
- Gunsmith crafting rules
- Device-specific controller gameplay branches

### 10.3 Preferred Pattern

When a new feature materially expands scene wiring, prefer:

1. A **resolved plan** (`ResolvedRunPlan`) produced by a pure resolver before scene creation
2. A **dedicated system/coordinator** with lifecycle ownership (`create()`, `update(dtMs)`,
   `shutdown()`)
3. The scene calls the system's update; the system owns its domain logic

**Example — Stage system integration:**

```ts
// In GameScene.create():
const plan = resolveRunPlan(request, ctx.data);  // pure, pre-scene
this.stageSystem = createStageSystem(plan, this.runState, ctx.bus);

// In GameScene.update():
this.stageSystem.update(dtMs);
// stageSystem emits stage:complete → progression system banks rewards
// stageSystem emits stage:failed → run ends
```

### 10.4 Deferred #94 Items Affecting #92

| #94 Item | Impact on #92 | Resolution |
|---|---|---|
| Weapon registry immutability/validation inconsistency | Before persistent Gunsmith state depends on the weapon registry, its static-definition immutability/validation behavior must be reconciled with the standard pattern | Fix in #94; #92 documents the required consistency |
| Validation file split | New Alpha 3 validators follow the modular pattern; existing validators are not rewritten solely for modularity | #94 may split incrementally; #92 only requires new validators to follow the pattern |
| GameScene refactoring | #92 freezes the growth boundary so Epic 20–26 designs do not add to the scene's domain logic | #94 may reduce scene size; #92 prevents regrowth |
| Enemy archetype registration | Current `EnemyArchetype` union is a type-level registry; Epic 21 needs a runtime behavior registry | #92 specifies the registry pattern; #94 may add the runtime registry shell |

---

## 11. Automated Acceptance Criteria

### 11.1 Per-Catalog Conformance Tests

Every Alpha 3 catalog must have automated tests that verify, for every definition:

| Catalog | Required Checks |
|---|---|
| Stages | arena exists; objective validates; encounter/difficulty/reward profiles resolve; unlock references resolve; stage can initialize into a valid state; objective has a theoretical completion path; required assets resolve |
| Enemies | behavior IDs resolve; referenced projectiles/abilities resolve; spawnable archetypes have valid wave integration |
| Bosses | phase/transition legality; defeat path exists; required assets resolve; stage integration valid |
| Achievements | metric/condition IDs resolve; target is legal for its type; rewards/unlocks resolve; platform mappings are optional and unique where present |
| Characters | passive/ability IDs resolve; unlock conditions resolve; required assets resolve; data can build a valid immutable/read-model representation |
| Gunsmith parts | slot/effect/trait IDs resolve; unlock conditions resolve; required assets resolve |
| Equipment | slot/effect/set-bonus IDs resolve; unlock conditions resolve; required assets resolve; set bonuses are legal for 2/4-piece |

### 11.2 Second-Fixture Tests

Every epic must include at least one test that:
1. Loads the shipped catalog
2. Adds a second valid definition of the same type using only existing mechanics
3. Validates the augmented catalog passes all conformance checks
4. Verifies no source changes were needed

### 11.3 Deterministic Replay Fixtures

Stage/encounter resolution must be pinned by deterministic tests:

```ts
test('stage:junkyard-01 resolves deterministically for seed 42', () => {
  const plan1 = resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 }, data);
  const plan2 = resolveRunPlan({ characterId: 'scrap-tabby', stageId: 'stage:junkyard-01', seed: 42 }, data);
  expect(plan1).toEqual(plan2);
});
```

### 11.4 Save Migration Tests

```ts
test('V2 → V3 migration preserves scrap and first-victory', () => {
  const v2 = { version: 2, settings: DEFAULT_SETTINGS, meta: { scrap: 100, unlocks: ['achievement:first-victory'], permanentUpgrades: {} } };
  const v3 = migrateV2ToV3(v2);
  expect(v3.progression.scrap).toBe(100);
  expect(v3.achievements['achievement:first-victory']?.completed).toBe(true);
});

test('V1 → V3 migration chain works', () => { /* V1 → V2 → V3 */ });
test('unknown future version write-protects', () => { /* version 99 → writeProtected = true */ });
test('malformed save falls back to default V3', () => { /* corrupted JSON → createDefaultSaveV3() */ });
```

### 11.5 Validation Tests

```ts
test('every shipped stage passes catalog validation', () => { /* validateStageCatalog */ });
test('every shipped achievement passes catalog validation', () => { /* validateAchievementCatalog */ });
test('cross-catalog stage references are valid', () => { /* stage→arena, stage→encounter, etc. */ });
test('cross-catalog achievement references are valid', () => { /* achievement→reward, etc. */ });
```

---

## 12. Cross-Reference: #94 Closures and Deferred Items

### 12.1 Items That Must Be Closed in #94 Before #92 Implements

| Item | Rationale |
|---|---|
| Weapon registry immutability/validation consistency | `DataWeaponRegistry` clones and deep-freezes but does not run its own validator (validation happens upstream in `validateGameData`). Before persistent Gunsmith state references weapon IDs, the registry's defensive posture must be reconciled with the standard `DataLootTableRegistry`/`DataVisualArtRegistry` pattern (validate-then-clone-then-freeze). |
| Any P0/P1 findings with downstream impact on stage composition, persistence, or content identity | #92 must architect from a certified baseline, not compensate for known debt. |
| Validation file split (optional — see §8.2) | The split is planned but belongs to #94. #92 only requires new validators to follow the modular pattern. |

### 12.2 Items #92 Documents That #94 May Address

| Item | #92 Position |
|---|---|
| `GameScene` composition | #92 freezes the growth boundary. #94 may reduce existing scene size but #92 prevents regrowth from Epics 20–26. |
| Enemy archetype registration | #92 specifies the runtime behavior registry pattern. #94 may add the registry shell; Epic 21 implements behaviors. |
| `CATALOG_DESCRIPTORS` extension | #92 defines the registration contract for new catalogs. #94 may split the validator file but must preserve the descriptor table's compile-time safety. |

### 12.3 Items Deferred Past #92

| Item | Deferred To | Reason |
|---|---|---|
| Exact extraction/greed semantics | Epic 20 architecture | Belongs to objective design, not shared foundation |
| Specific boss move sets | Epic 21 architecture | Bosses compose registered behaviors; exact moves are content |
| Achievement metric implementations | Epic 22 architecture | #92 freezes the condition/grant vocabulary; metrics are Epic 22's domain |
| Gunsmith UI/UX | Epic 23 architecture | #92 freezes the part/trait data model and persistence shape |
| Character ability implementations | Epic 24 architecture | #92 freezes the passive/ability registration pattern |
| Legacy permanent-upgrade retirement | Epic 26 architecture | #92 preserves V2 state in V3; Epic 26 decides retirement |
| `content:validate` script implementation | When ≥3 Alpha 3 catalogs exist | Premature without real content to validate |

---

## 13. Architecture Document Standards

### 13.1 What Permanent Architecture Contains

- Decisions and rationale
- Contracts/types (TypeScript interfaces, data shapes)
- Ownership/module map
- Compatibility/migration rules
- Ordered implementation slices
- Tests/acceptance criteria
- Reviewer traps/exceptions

### 13.2 What Architecture Does Not Contain

- Duplicated cross-cutting rules already frozen by this document or the content-extensibility
  contract (link them instead)
- Large execution evidence (lives in PR body/checklist, `docs/delivery/` records, or CI)
- Old run counts or browser transcripts that stop mattering

### 13.3 Reviewer Traps

Reject architecture/implementation that:

- Renames existing shipped IDs for aesthetic consistency
- Makes Arena own Alpha 3 objective/difficulty/reward rules
- Keeps `spawnCurve.durationSeconds` as universal stage victory
- Adds `stage1Complete`, `stage2Complete`, etc. save fields
- Lets each Epic invent a different unlock/reward grammar
- Uses Game Center/Google Play as progression truth
- Selects randomly from all globally defined future content by default
- Writes persistent state outside the central save/progression boundary
- Makes `GameScene` branch on content IDs
- Turns the shared foundation into a generic game engine or scripting framework
- Forces save migrations for ordinary new content
- Copies multi-page shared contracts into every later epic document

---

## 14. Done When

The #92 architecture is ready when an Epic 20 architect can answer all of the following by
referencing frozen shared contracts rather than inventing them:

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

---

## Appendix A: TypeScript Contract Summary

```ts
// === Stage / Progression ===
interface StageRunRequest { readonly characterId: string; readonly stageId: string; readonly seed: number; }
interface ResolvedRunPlan { readonly characterId: string; readonly stageId: string; readonly arenaId: string; readonly objective: ResolvedObjective; readonly encounter: ResolvedEncounterProfile; readonly difficulty: ResolvedDifficultyProfile; readonly reward: ResolvedRewardProfile; readonly seed: number; }
type StageStatus = 'intro' | 'active' | 'objective-complete' | 'won' | 'failed';
interface StageState { status: StageStatus; objectiveProgress: ObjectiveProgress; timeMs: number; }

// === Objective Vocabulary ===
type ObjectiveType = { type: 'kill'; count: number; enemyTag?: string } | { type: 'collect'; itemId: string; count: number } | { type: 'survive'; seconds: number } | { type: 'defeat'; enemyId: string };

// === Shared Conditions ===
type ProgressionCondition = { type: 'stage-cleared'; stageId: string } | { type: 'boss-defeated'; bossId: string } | { type: 'achievement-completed'; achievementId: string } | { type: 'mastery-reached'; subjectId: string; tier: number } | { type: 'owns-content'; contentId: string } | { type: 'all'; conditions: readonly ProgressionCondition[] } | { type: 'any'; conditions: readonly ProgressionCondition[] } | { type: 'not'; condition: ProgressionCondition };

// === Shared Grants ===
type ProgressionGrant = { type: 'grant-scrap'; amount: number } | { type: 'unlock-stage'; stageId: string } | { type: 'unlock-character'; characterId: string } | { type: 'unlock-equipment'; equipmentId: string } | { type: 'unlock-part'; partId: string } | { type: 'unlock-trait'; traitId: string } | { type: 'grant-item'; itemId: string; amount?: number };

// === Save V3 ===
interface SaveDataV3 { readonly version: 3; readonly settings: Settings; readonly progression: ProgressionState; readonly stages: Record<string, StageProgress>; readonly achievements: Record<string, AchievementProgress>; readonly characters: Record<string, MasteryProgress>; readonly gunsmith: GunsmithState; readonly equipment: Record<string, EquipmentInstance>; }
interface ProgressionState { readonly scrap: number; readonly unlocks: readonly string[]; readonly permanentUpgrades: Readonly<Record<string, number>>; }
interface StageProgress { readonly completed: boolean; readonly bestTimeMs?: number; }
interface AchievementProgress { readonly completed: boolean; readonly progress?: number; readonly completedAt?: number; }
interface MasteryProgress { readonly tier: number; readonly xp: number; }

// === Content / Save Version Separation ===
const CONTENT_VERSION: number;  // changes on definition/pool/balance changes
const CURRENT_SAVE_VERSION = 3; // changes on persistence shape/semantics changes

// === Enemy Archetype (Epic 21 expanded) ===
type EnemyArchetype = 'chaser' | 'charger' | 'ranged' | 'tank' | 'elite' | 'boss' | 'shooter' | 'spawner' | 'shielded' | 'splitter';
```

---

## Appendix B: File Layout (Planned)

```text
src/
  data/
    stages.json              — stage definitions (new)
    encounter-profiles.json  — encounter composition profiles (new)
    difficulty-profiles.json — difficulty scaling profiles (new)
    reward-profiles.json     — reward profiles (new)
    bosses.json              — boss definitions (new)
    achievements.json        — achievement definitions (new)
    equipment.json           — equipment/set definitions (new)
    gunsmith-parts.json      — Gunsmith part definitions (new)
    gunsmith-traits.json     — Gunsmith trait definitions (new)
  systems/
    validation/
      index.ts               — aggregate registry (refactored from validation.ts)
      stages.ts              — stage catalog validator (new)
      bosses.ts              — boss catalog validator (new)
      achievements.ts        — achievement catalog validator (new)
      equipment.ts           — equipment catalog validator (new)
      gunsmith.ts            — Gunsmith catalog validator (new)
      enemies.ts             — enemy catalog validator (split from validation.ts)
      ... (other split files)
    stageRegistry.ts         — validated-clone/deep-freeze stage lookup (new)
    bossRegistry.ts          — validated-clone/deep-freeze boss lookup (new)
    achievementRegistry.ts   — validated-clone/deep-freeze achievement lookup (new)
    conditionEvaluator.ts    — pure ProgressionCondition evaluator (new)
    grantProcessor.ts        — ProgressionGrant → ProgressionState transaction (new)
  gameplay/
    stageResolution.ts       — resolveRunPlan, pure stage resolver (new)
    stageState.ts            — StageState lifecycle transitions (new)
    objectiveProgress.ts     — ObjectiveProgress per-type logic (new)
  scenes/
    GameScene.ts             — wires ResolvedRunPlan; no domain logic growth
tests/
  validation/
    stages.test.ts           — stage catalog validation + conformance
    bosses.test.ts           — boss catalog validation + conformance
    achievements.test.ts     — achievement catalog validation + conformance
    equipment.test.ts        — equipment catalog validation + conformance
    gunsmith.test.ts         — Gunsmith catalog validation + conformance
  stageResolution.test.ts    — deterministic plan resolution
  stageState.test.ts         — lifecycle transitions
  conditionEvaluator.test.ts — pure condition evaluation
  grantProcessor.test.ts     — grant transaction tests
  saveV3.test.ts             — V2→V3 migration, V1→V3 chain, future-version protection
  conformance/
    stages.conformance.test.ts   — generic: every stage passes all checks
    bosses.conformance.test.ts   — generic: every boss passes all checks
    achievements.conformance.test.ts — generic: every achievement passes all checks
    secondFixture/
      stage-second-fixture.test.ts     — add stage:junkyard-06 via data only
      enemy-second-fixture.test.ts     — add enemy variant via data only
      achievement-second-fixture.test.ts — add achievement via data only
      character-second-fixture.test.ts — add character via data only
      equipment-second-fixture.test.ts — add equipment set via data only
      gunsmith-second-fixture.test.ts  — add part via data only
```

---

## Appendix C: Implementation Order (Post-#94)

1. **#92 gate closure:** This document reviewed and approved against the #94-certified baseline.
2. **Save V3 migration:** `SaveDataV3`, `migrateV2ToV3`, `SaveManager` extension. No new
   persistent domains written yet — just the envelope and migration.
3. **Condition evaluator + grant processor:** Pure, testable, shared by all Epics 20–26.
4. **Stage/objective contracts:** `StageDefinition`, `ObjectiveType`, `ResolvedRunPlan`,
   `resolveRunPlan`. Golden Run path preserved via compatibility adapter.
5. **Epic 20 architecture:** Consumes #92 contracts; adds stage selection UI, objective
   progress, extraction semantics, first chapter content.
6. **Epic 21 architecture:** Enemy behavior registry, boss framework, encounter profiles.
7. **Epic 22 architecture:** Achievement definitions, metrics, persistent progress,
   platform adapter interface.
8. **Epics 23–26:** In sequence, each consuming #92 shared contracts and prior epic state.
