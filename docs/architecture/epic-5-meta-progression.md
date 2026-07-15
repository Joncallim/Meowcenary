# Epic 5: Meta Progression Architecture

Status: implementation-ready architecture for Epic 5 / issue #6.

This document is the repository source of truth for Epic 5. It incorporates the
corrections established by PR #34 and supersedes conflicting Epic 5 issue text,
the older shared-save wording in `docs/epics.md`, and the old Epic 3 modifier
source spelling. It defines architecture only. The seven implementation slices
below are dependency-ordered implementation and review checkpoints; they
describe file ownership, tests, and acceptance criteria, not mandatory PR
topology.

## Decision summary

- Epic 5 ships before Epic 8. A terminal run banks the current
  `RunState.currency`, including zero.
- `SaveDataV1` remains the immutable historic schema. The current schema is
  `SaveDataV2`, reached by a single V1-to-V2 migration.
- Save and progression values are detached, deeply frozen snapshots. Updates
  replace snapshots; callers never mutate them in place.
- `GameContext` owns the one current save snapshot. Its `settings` property is a
  getter into that snapshot, not a second object.
- Permanent definition effects are per-level effects. Level N expands into N
  separate modifier sources; raw values are never multiplied by N.
- Modifier source namespaces are `meta:<upgradeId>:<level>`,
  `character:<characterId>:<passiveId>`, and
  `card:<upgradeId>:<stack>`.
- One `ProgressionSystem` subscribes to both existing terminal events and
  delegates them to one guarded banking method. There are no independent win
  and loss banking paths.
- Epic 5 exposes a Phaser-free `ProgressionController`, not a production menu.
  Epic 9 owns rendering, navigation, confirmation dialogs, layout, and
  accessibility.

## Repository baseline and constraints

The design is based on the current post-Epic-4 `main` branch:

- `BootScene` loads validated `GameData` before loading a save.
- `GameScene` creates a fresh `RunState` per scene lifecycle, equips the default
  weapon loadout, creates systems, and calls `startRun`.
- `Player` can terminate a run by calling `endRun(..., 'lost')`; `GameScene` can
  terminate it as won or lost. Both routes emit the existing terminal events.
- `ModifierStack` stores modifiers, resolves all additive effects before all
  multiplicative effects, clones additions, and can count/remove by source.
- `applyCard` is transactional, but its current source
  `upgrade:<id>:stack:<n>` must migrate to the fixed `card:<id>:<n>` namespace.
- `SaveManager` currently uses the historic storage key
  `meowcenary.save.v1`, performs no write during load, and treats browser storage
  as best effort.
- Data is imported from JSON in `src/systems/validation.ts`, validated as one
  `GameData` object, and exposed through immutable registries where runtime
  lookup needs isolation.

The historical storage key must not be renamed in Epic 5. Its suffix describes
the first deployed format, not the current in-value schema. Renaming it would
make the V1-to-V2 migration unable to find existing saves.

## Ownership and non-goals

| Owner | Owns in Epic 5 | Does not own |
| --- | --- | --- |
| `systems/save.ts` | V1 and V2 schemas, parsing, migration, field recovery, storage adapter results | Purchase, reward, unlock, or modifier rules |
| `engine/context.ts` | Current save snapshot, atomic replacement, persistence commands | Gameplay calculations or scene flow |
| `systems/metaUpgrades.ts` | Immutable lookup over validated definitions | Purchase rules or application to a run |
| `gameplay/meta.ts` | Pure cost, purchase, unlock, reward, banking, and modifier expansion | Storage, events, scenes, rendering |
| `gameplay/runStart.ts` | One ordered run-preparation pipeline | Character data loading or final selection UI |
| `systems/ProgressionSystem.ts` | Per-run terminal-event coordination and in-memory idempotency | Reward arithmetic or persistent transaction history |
| `ui/progressionController.ts` | Headless read/command model for purchases and reset | Phaser rendering, dialogs, navigation, responsive UI |
| `GameScene` | Construction and lifecycle coordination only | Cost, purchase, reward, migration, unlock, or modifier math |

Explicit non-goals:

- no ads, paid currency, payments, subscriptions, energy, timers, or daily-login
  pressure;
- no accounts, cloud saves, cross-device reconciliation, or transaction ledger;
- no Epic 6 character catalog, passive handler registry, or character UI;
- no Epic 8 drop generation or economy tuning;
- no Epic 9 production progression screen, reset dialog, navigation, or
  accessibility implementation;
- no XP-to-scrap conversion, victory multiplier, loss penalty, streak, or hidden
  reward constant;
- no replacement persistence framework, IndexedDB layer, state library, or new
  dependency.

## Shared identifiers and snapshot policy

### Identifier grammar

Content IDs use:

~~~text
^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
~~~

Unlock IDs use two content IDs separated by one colon:

~~~text
^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
~~~

Current producers use:

- `character:<characterId>`;
- `weapon:<weaponId>`;
- `achievement:<achievementId>`.

The save sanitizer accepts any syntactically valid namespace. It does not need
to know every future content type. This preserves well-formed unknown unlock
IDs for forward compatibility while discarding malformed strings.

Modifier source IDs are not content IDs. They are generated only by runtime
helpers:

- `meta:<upgradeId>:<one-based level>`;
- `character:<characterId>:<passiveId>`;
- `card:<upgradeId>:<one-based stack>`.

Because content IDs cannot contain a colon, the tuples are unambiguous. Several
effects belonging to one level, passive, or card stack intentionally share one
source ID so `ModifierStack.remove(sourceId)` remains useful.

### Snapshot policy

`Settings`, `MetaState`, `SaveDataV1`, `SaveDataV2`, `RunReward`, result
wrappers, registry definitions, controller snapshots, and pure-rule outputs are
plain JSON-compatible objects that are recursively frozen before publication.

- Factories and migrations return fresh snapshots with no shared mutable arrays
  or records.
- Pure functions never mutate input. Their exact no-op identity rules are listed
  in the pure-rule matrix below; every successful state change returns a new
  frozen snapshot.
- `SaveManager.save` sanitizes and serializes a detached snapshot and never
  retains its input.
- `GameContext` replaces its current root snapshot after a successful transform,
  even when browser persistence reports failure. Old references remain valid
  immutable historical snapshots and do not update.
- Callers must reread `ctx.saveData` or use the value returned by an update.
  Object identity across updates is not a contract.

This replaces the Epic 0 shared-mutable-settings implementation detail while
preserving the `updateSettings(patch)` command as the only settings write seam.

## Save schema and migration

### Exact contracts

`src/systems/save.ts` owns these public contracts:

~~~ts
export interface Settings {
  readonly muted: boolean;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
}

export type MetaStateV1 = Readonly<Record<string, never>>;

export interface MetaState {
  readonly scrap: number;
  readonly unlocks: readonly string[];
  readonly permanentUpgrades: Readonly<Record<string, number>>;
}

export interface SaveDataV1 {
  readonly version: 1;
  readonly settings: Settings;
  readonly meta: MetaStateV1;
}

export interface SaveDataV2 {
  readonly version: 2;
  readonly settings: Settings;
  readonly meta: MetaState;
}

export type SaveData = SaveDataV2;
export type MetaUpgradeMaxLevels = Readonly<Record<string, number>>;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
}

export function createDefaultMeta(): MetaState;
export function createDefaultSave(): SaveData;
export function applySettingsPatch(
  settings: Settings,
  patch: Readonly<Partial<Settings>>,
): Settings;
export function sanitizeMeta(
  raw: unknown,
  maxLevels: MetaUpgradeMaxLevels,
): MetaState;
export function migrate(
  raw: unknown,
  maxLevels: MetaUpgradeMaxLevels,
): SaveData;
~~~

`SaveDataV1` continues to mean version 1 with an empty meta shell. No new field
is added to it and no TypeScript alias makes V1 mean V2.

`applySettingsPatch` is retained as the compatibility settings command helper,
but becomes pure: it uses the current settings as per-field fallback, returns
the exact input snapshot when no canonical value changes, and otherwise returns
a new frozen settings snapshot.

### Exact migration pipeline

`migrate(raw, maxLevels)` is total for every JavaScript input:

1. If `raw` is a string, trim it. Empty strings and JSON parse failures return
   `createDefaultSave()`.
2. If the parsed value is not a plain record, return the default.
3. Read only its own `version` property. Do not infer a version from the
   presence of `settings` or `meta`.
4. For `version === 1`, run `migrateV1ToV2`:
   - sanitize each settings field independently;
   - ignore the V1 empty meta shell and use `createDefaultMeta()`;
   - return `version: 2`.
5. For `version === 2`, sanitize settings and meta field by field and return
   `version: 2`.
6. Missing, non-integer, negative, zero, or future versions return the complete
   default V2 snapshot. No settings or meta values are salvaged from an unknown
   version.

The linear private step is:

~~~ts
function migrateV1ToV2(
  raw: Readonly<Record<string, unknown>>,
): SaveDataV2;

interface SaveDecodeResult {
  readonly data: SaveData;
  readonly unsupportedFutureVersion: boolean;
}

function decodeSave(
  raw: unknown,
  maxLevels: MetaUpgradeMaxLevels,
): SaveDecodeResult;
~~~

The public `migrate` returns `decodeSave(...).data`. `SaveManager.load` uses the
same private decode result to set write protection, so it does not parse or
migrate twice. `unsupportedFutureVersion` is true only for an own, safe-integer
`version > 2`. There is no V1-to-V1 normalization followed by an in-place
extension. A valid V1 fixture must remain checked into
`tests/fixtures/save-v1.json`.

### Field recovery matrix

| Field | Accepted value | Recovery |
| --- | --- | --- |
| `settings.muted` | boolean | field fallback from `DEFAULT_SETTINGS` |
| `settings.musicVolume` | finite number | clamp to 0 through 1; otherwise field fallback |
| `settings.sfxVolume` | finite number | clamp to 0 through 1; otherwise field fallback |
| `settings.reducedMotion` | boolean | field fallback |
| `meta.scrap` | non-negative safe integer | 0 |
| `meta.unlocks` | array of valid unlock IDs | discard invalid entries, preserve first occurrence order, deduplicate |
| `meta.permanentUpgrades` | plain record | empty record if not a record |
| upgrade key | valid content ID | discard malformed key |
| upgrade level | positive safe integer | discard zero, negative, fractional, non-finite, unsafe values |
| known upgrade level above `maxLevel` | otherwise valid | clamp to current definition `maxLevel` |
| syntactically valid unknown upgrade ID | otherwise valid positive safe level | preserve but do not apply until a definition exists |

Partially valid objects are recovered field by field. For example, valid scrap
survives an invalid unlock array, and a valid V1 `muted` value survives a broken
volume. The sanitizer never coerces strings, floors owned levels, or treats
truthy values as booleans.

Unknown saved upgrade entries are preserved because removing temporarily absent
content is irreversible. Runtime application iterates the current registry, so
unknown entries grant no effect and cannot be purchased. If the definition
returns, the next load clamps the saved level to its current maximum.

### SaveManager behavior

~~~ts
export class SaveManager {
  constructor(
    storage: StorageAdapter,
    key: string,
    maxLevels: MetaUpgradeMaxLevels,
  );

  load(): SaveData;
  save(data: SaveData): boolean;
  clear(): boolean;
}
~~~

- `load` calls `getItem` once, migrates once, and returns a fresh frozen V2
  snapshot. It never writes a migrated/default value back during load. A thrown
  read or malformed data returns the default. When the stored value has an
  integer version greater than 2, `load` also marks this manager write-protected
  for the rest of that loaded lifecycle.
- `save` re-sanitizes the supplied V2 snapshot, stringifies it, and calls
  `setItem` once. It returns `true` only when the adapter reports success.
  Serialization errors, quota errors, disabled storage, or adapter exceptions
  return `false` and never escape. A manager write-protected by an unsupported
  future version returns `false` without calling `setItem`, so an older build
  cannot overwrite newer data with defaults.
- `clear` removes only the configured key and returns the adapter result.
  It does not mutate any already loaded `GameContext` snapshot. A later
  `load` returns defaults. A successful explicit clear also removes the
  future-version write protection.
- `LocalStorageAdapter` catches browser access errors and returns `false` for
  failed writes/removals; `MemoryStorageAdapter` returns `true`.
- `resetProgression` does not call `clear` because clearing would also discard
  settings.

## GameContext persistence boundary

### Exact public surface

`src/engine/context.ts` adds a framework-free factory so tests and `BootScene`
share the same persistence behavior:

~~~ts
export interface PersistenceUpdate<T> {
  readonly value: T;
  readonly persisted: boolean;
}

export interface GameContext {
  readonly bus: EventBus;
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly saveData: SaveData;
  readonly settings: Settings;

  updateSettings(
    patch: Readonly<Partial<Settings>>,
  ): PersistenceUpdate<Settings>;

  updateMeta(
    transform: (meta: MetaState) => MetaState,
  ): PersistenceUpdate<MetaState>;

  resetProgression(): PersistenceUpdate<MetaState>;
}

export interface CreateGameContextOptions {
  readonly bus: EventBus;
  readonly menuRng: Rng;
  readonly data: GameData;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly save: SaveManager;
}

export function createGameContext(
  options: CreateGameContextOptions,
): GameContext;
~~~

`createGameContext` calls `save.load()` exactly once and keeps that returned
snapshot in a private closure. Both `saveData` and `settings` are getters:
`ctx.settings === ctx.saveData.settings` is always true for the current read.
There is no separately copied settings object.

`SaveManager` is a `CreateGameContextOptions` dependency only; it is not part
of the `GameContext` public surface. Publishing it would let a caller invoke
`load`/`save`/`clear` directly, creating a competing snapshot that `saveData`
never observes. Runtime persistence is exclusively available through
`updateSettings`, `updateMeta`, and `resetProgression`.

`updateSettings` sanitizes the merged patch using the current settings as the
field fallback, builds a new root snapshot with the existing meta, assigns it as
current, calls `save.save` once, and returns the new settings plus the
persistence result. An invalid patch field therefore preserves its current
value; migration recovery still uses `DEFAULT_SETTINGS`.

`updateMeta` calls the transform once with the frozen current meta. It sanitizes
the returned meta against the current max-level map, builds and assigns a new
root snapshot with the existing settings, saves once, and returns the new meta
plus the persistence result. A transform that throws is a programming error:
the old snapshot remains current, no persistence is attempted, and the error is
not converted into an expected purchase failure. Expected failures are resolved
by `purchase` before `updateMeta` is called.

`resetProgression` is exactly:

~~~ts
return updateMeta(() => createDefaultMeta());
~~~

Storage failure never rolls back in-memory state. The current browser session
continues with the new snapshot, `persisted` is false, and a reload may lose the
change. No `meta:changed` or `settings:changed` event and no subscriber API is
added in Epic 5; command callers already receive the replacement value. Epic 9
may render a persistence warning from `persisted` without changing this
contract.

### Boot order

`BootScene.create` becomes:

1. `loadGameData()`;
2. construct one `DataMetaUpgradeRegistry`;
3. construct `SaveManager` with the unchanged storage key and
   `registry.maxLevels()`;
4. construct `GameContext` with `createGameContext`;
5. store it in the Phaser registry;
6. start `GameScene`.

No update path calls `save.load()` again. This removes the current
`updateSettings` read-modify-write race that can reintroduce stale data.

## Meta-upgrade data

### Exact types and registry

`src/systems/types.ts` owns the JSON-safe definition:

~~~ts
export interface MetaUpgradeCost {
  readonly base: number;
  readonly growth: number;
}

export interface MetaUpgradeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxLevel: number;
  readonly cost: MetaUpgradeCost;
  readonly effects: readonly UpgradeEffect[];
}

export interface GameData {
  // existing fields...
  readonly metaUpgrades: readonly MetaUpgradeDefinition[];
}
~~~

`UpgradeEffect` is reused because it is already the JSON-safe
`stat`/`op`/`value` shape without a runtime `sourceId`. Permanent data must not
contain `Modifier` objects.

`src/systems/metaUpgrades.ts` owns:

~~~ts
export interface MetaUpgradeLookup {
  metaUpgradeById(
    id: string,
  ): Readonly<MetaUpgradeDefinition> | undefined;
}

export interface MetaUpgradeRegistry extends MetaUpgradeLookup {
  all(): readonly Readonly<MetaUpgradeDefinition>[];
  maxLevels(): MetaUpgradeMaxLevels;
}

export class DataMetaUpgradeRegistry implements MetaUpgradeRegistry {
  constructor(data: Pick<GameData, 'metaUpgrades'>);
  metaUpgradeById(id: string): Readonly<MetaUpgradeDefinition> | undefined;
  all(): readonly Readonly<MetaUpgradeDefinition>[];
  maxLevels(): MetaUpgradeMaxLevels;
}
~~~

The constructor validates before publication, clones and recursively freezes
definitions/effects, rejects duplicate IDs defensively, and returns frozen
snapshots. Lookups do not expose caller-owned JSON objects.

`src/systems/validation.ts` exports
`validateMetaUpgradeCatalog(raw: unknown): MetaUpgradeDefinition[]`. Both
`validateGameData` and the defensive registry constructor use that one
admission path.

### JSON shape and initial shipped set

`src/data/meta-upgrades.json` initially contains:

~~~json
[
  {
    "id": "reinforced-vest",
    "name": "Reinforced Vest",
    "description": "Gain 10 maximum health per level.",
    "maxLevel": 5,
    "cost": { "base": 10, "growth": 1.6 },
    "effects": [{ "stat": "maxHealth", "op": "add", "value": 10 }]
  },
  {
    "id": "quick-paws-training",
    "name": "Quick Paws Training",
    "description": "Increase movement speed by 3% per level.",
    "maxLevel": 5,
    "cost": { "base": 15, "growth": 1.6 },
    "effects": [{ "stat": "moveSpeed", "op": "mult", "value": 1.03 }]
  },
  {
    "id": "sharpened-ammo",
    "name": "Sharpened Ammo",
    "description": "Increase weapon damage by 5% per level.",
    "maxLevel": 5,
    "cost": { "base": 20, "growth": 1.7 },
    "effects": [{ "stat": "damage", "op": "mult", "value": 1.05 }]
  },
  {
    "id": "magnetic-whiskers",
    "name": "Magnetic Whiskers",
    "description": "Gain 5 pickup radius per level.",
    "maxLevel": 5,
    "cost": { "base": 10, "growth": 1.5 },
    "effects": [{ "stat": "pickupRadius", "op": "add", "value": 5 }]
  }
]
~~~

These values are initial data, not TypeScript constants. Later balance-only PRs
may tune them without changing the contracts. No `currencyGain` permanent ships
before Epic 8 because it would be inert in the current runtime.

Unlock prerequisites do not belong in `MetaUpgradeDefinition`. Every shipped
meta upgrade is visible and purchasable subject only to level and scrap. Future
content gating uses the shared `UnlockRule` on the gated content definition, not
an implicit dependency graph inside permanent upgrades.

### Validation

`loadGameData` imports `meta-upgrades.json`, adds `metaUpgrades` to the exact root
field set, validates it, and includes it in `GameData`.

Validation rejects:

- unknown fields at every level;
- IDs outside the content-ID grammar or duplicate IDs;
- empty/untrimmed names and descriptions;
- `maxLevel` outside the safe operational range 1 through 100;
- a non-safe-integer or non-positive `cost.base`;
- non-finite `cost.growth` or a value less than 1;
- any next-level cost for `currentLevel` 0 through `maxLevel - 1` that rounds
  outside positive safe integer range;
- an empty effects array;
- unknown `StatKey` or operations other than `add` and `mult`;
- non-finite effect values;
- `add` values less than or equal to 0;
- `mult` values less than or equal to 1;
- duplicate `(stat, op)` pairs within one definition;
- an additive aggregate `value * maxLevel` or multiplicative aggregate
  `value ** maxLevel` that is non-finite.

The 100-level ceiling is an admission-safety bound for runtime expansion, not a
balance constant. Current content uses five levels.

## Pure progression rules

`src/gameplay/meta.ts` has no Phaser, storage, event, or scene import.

### Contracts

~~~ts
export type PurchaseFailureReason =
  | 'unknown-upgrade'
  | 'insufficient-scrap'
  | 'max-level';

export type PurchaseCheck =
  | {
      readonly ok: true;
      readonly currentLevel: number;
      readonly newLevel: number;
      readonly cost: number;
    }
  | {
      readonly ok: false;
      readonly reason: PurchaseFailureReason;
      readonly currentLevel: number;
      readonly cost: number | null;
    };

export type PurchaseResult =
  | {
      readonly ok: true;
      readonly meta: MetaState;
      readonly cost: number;
      readonly newLevel: number;
    }
  | {
      readonly ok: false;
      readonly meta: MetaState;
      readonly reason: PurchaseFailureReason;
    };

export interface RunReward {
  readonly scrap: number;
  readonly unlocks: readonly string[];
}

export type UnlockRule =
  | { readonly type: 'default' }
  | {
      readonly type: 'meta';
      readonly requiresUnlockId: string;
    };

export function costOf(
  definition: Readonly<MetaUpgradeDefinition>,
  currentLevel: number,
): number | null;

export function canPurchase(
  meta: MetaState,
  upgradeId: string,
  upgrades: MetaUpgradeLookup,
): PurchaseCheck;

export function purchase(
  meta: MetaState,
  upgradeId: string,
  upgrades: MetaUpgradeLookup,
): PurchaseResult;

export function isUnlocked(meta: MetaState, id: string): boolean;

export function addUnlocks(
  meta: MetaState,
  ids: readonly string[],
): MetaState;

export function computeRunReward(
  run: Readonly<RunState>,
): RunReward | null;

export function bankReward(
  meta: MetaState,
  reward: Readonly<RunReward>,
): MetaState;

export function permanentModifiers(
  definition: Readonly<MetaUpgradeDefinition>,
  ownedLevel: number,
): readonly Modifier[];
~~~

### Mutation and identity matrix

| Function | Input mutation | Return identity |
| --- | --- | --- |
| `createDefaultMeta` | none | always a fresh frozen meta |
| `costOf` | none | primitive or null |
| `canPurchase` | none | fresh frozen check |
| `purchase` | none | exact input meta on failure; fresh frozen meta on success |
| `isUnlocked` | none | primitive |
| `addUnlocks` | none | exact input meta when no new valid ID remains; otherwise fresh frozen meta |
| `computeRunReward` | none | null for non-terminal; otherwise fresh frozen reward |
| `bankReward` | none | exact input meta when sanitized scrap is zero and no new valid unlock remains; otherwise fresh frozen meta |
| `permanentModifiers` | none | always a fresh frozen array of fresh frozen modifiers |

### Cost and purchase semantics

For current owned level L:

~~~text
next cost = Math.round(cost.base * cost.growth ** L)
~~~

L is zero-based: buying the first level uses exponent 0. `costOf` returns
`null` for a negative/fractional/unsafe level, a level at or above
`maxLevel`, or a non-safe result. Validated shipped definitions make the final
case unreachable in normal play.

`canPurchase`:

1. looks up `upgradeId`; absent definitions return `unknown-upgrade`, the
   canonical saved level for that ID (or 0 when absent), and `cost: null`;
2. reads a missing owned level as zero and defensively clamps a valid stored
   level to the definition maximum;
3. returns `max-level` and `cost: null` at the maximum;
4. computes cost and returns `insufficient-scrap` with that cost when needed;
5. otherwise returns the successful current/new levels and cost.

`purchase` calls `canPurchase`. Failure returns the exact input meta reference
and never persists. Success deducts cost, writes only the purchased ID's new
level, preserves unlock/order/unknown upgrade entries, and returns a new frozen
meta. Expected failures never throw.

### Unlock semantics

Default content is represented by `{ type: 'default' }` on its definition. It
is always selectable and is not duplicated in `MetaState.unlocks`.

`isUnlocked` returns true only when a syntactically valid ID exists in the
canonical saved array. Epic 6 uses:

~~~ts
definition.unlock.type === 'default' ||
  isUnlocked(meta, definition.unlock.requiresUnlockId)
~~~

`addUnlocks` filters invalid IDs, keeps first-seen order across existing and new
values, and deduplicates. It returns the input meta when nothing new survives.
Unknown but well-formed saved IDs remain available. Epic 5 does not hardcode a
list of character, weapon, or achievement definitions.

### Reward and banking semantics

`computeRunReward` returns `null` for `intro`, `active`, and `paused` runs.
It returns a reward for `won` and `lost` runs; both outcomes use identical
currency conversion in Epic 5.

Currency conversion is one-to-one:

- finite values less than or equal to zero become zero;
- positive finite fractional values are floored once at banking
  (`12.9 -> 12`);
- values above `Number.MAX_SAFE_INTEGER` saturate at that limit;
- `NaN` and either infinity become zero.

The flooring rule converts the run's continuous `number` field to the
persistent integer scrap domain; it is not a reward multiplier. Epic 8 may keep
`RunState.currency` integral, but does not change this defensive boundary.

XP, level, kills, time, victory, and loss add no persistent reward in Epic 5.
There is no victory bonus, loss penalty, or automatic achievement unlock.
`RunReward.unlocks` is an empty array until a later data-backed achievement
rule supplies IDs; the stable field and `bankReward` already support that
addition.

`bankReward` sanitizes reward scrap with the same rule, saturating-adds it to
banked scrap, and delegates unlock merging to `addUnlocks`. It does not know
whether a run has already banked. Calling it twice deliberately applies the
reward twice; exactly-once lifecycle behavior belongs only to
`ProgressionSystem`.

### Per-level permanent expansion

`permanentModifiers` treats every effect as the effect of one level. It clamps a
defensive owned level to 0 through `maxLevel` and emits, in deterministic order:

1. level 1 effects in JSON order;
2. level 2 effects in JSON order;
3. continuing through the owned level.

Every effect at one level shares `meta:<upgradeId>:<level>`.

Examples:

- `maxHealth add 10` at level 3 emits three add-10 modifiers with
  `meta:reinforced-vest:1`, `:2`, and `:3`. Against base 100, resolution is
  130.
- `moveSpeed mult 1.05` at level 3 emits three mult-1.05 modifiers with
  `meta:quick-paws-training:1` through `:3`. Against base 100, resolution is
  `100 * 1.05 * 1.05 * 1.05 = 115.7625`.
- It never emits one modifier with value 1.15 and never multiplies the raw 1.05
  by 3.

The returned array and modifiers are new and frozen. The definition and meta
are not mutated.

## Run-start construction

### Normalized preparation contract

`src/gameplay/runStart.ts` owns a small normalized seam, not an Epic 6 catalog:

~~~ts
export interface PlayerBaseStats {
  readonly maxHealth: number;
  readonly moveSpeed: number;
}

export interface CharacterRunContribution {
  readonly baseStats: Readonly<Partial<PlayerBaseStats>>;
  readonly passiveModifiers: readonly Modifier[];
  readonly startingWeapons: readonly WeaponInstance[];
}

export interface PrepareRunOptions {
  readonly state: CreateRunStateOptions;
  readonly basePlayer: PlayerBaseStats;
  readonly meta: MetaState;
  readonly metaUpgrades: MetaUpgradeRegistry;
  readonly character: CharacterRunContribution;
}

export interface PreparedRun {
  readonly run: RunState;
  readonly basePlayer: PlayerBaseStats;
}

export function applyPermanentProgression(
  run: RunState,
  meta: MetaState,
  upgrades: MetaUpgradeRegistry,
): boolean;

export function prepareRun(options: PrepareRunOptions): PreparedRun;
~~~

Epic 5's `GameScene` supplies current runtime config as `basePlayer` and builds
a starter character contribution with an empty `baseStats` patch, an empty
passive array, and `createDefaultWeaponLoadout`. Epic 6 later maps one validated
character definition into the same contribution; its absolute base-stat fields
replace matching global-base fields at stage 4. Epic 5 does not add
`characters.json`, passive handlers, selection, or unlock gating.

`prepareRun` is the one construction pipeline:

1. create an empty intro `RunState`;
2. copy and validate the global base player state;
3. apply all known owned permanent modifiers transactionally;
4. replace base fields declared by `character.baseStats`, then apply normalized
   character passive modifiers requiring
   `character:<state.characterId>:<passiveId>` sources;
5. copy the character starting weapon instances into `run.equipped`;
6. return the prepared intro run and base-player snapshot;
7. after `GameScene` constructs Player and systems, call `startRun`;
8. only later card choices call `applyCard` with
   `card:<upgradeId>:<stack>` sources.

Permanent modifiers live in `ModifierStack` and therefore resolve against the
effective base selected at stage 4 when Player reads the stat. The stage order
does not require prematurely resolving a permanent modifier against the global
base.

`applyPermanentProgression` iterates the registry, not the saved record, so
unknown saved upgrades do nothing. It expands every known owned level, preflights
that every generated source has count zero, then adds all modifiers. A source
collision returns false with no change. If an addition unexpectedly throws, it
removes every generated source and returns false.

A second call on the same run therefore cannot double-apply permanent effects.
A scene restart creates a new `RunState`/`ModifierStack`, so the normal
preparation succeeds again with the latest meta.

### GameScene ordering change

Current `GameScene.create` assigns a default loadout immediately after
`createRunState`. Slice 5 replaces those separate steps with `prepareRun` before
Player construction. Player receives `PreparedRun.basePlayer`, so max health and
movement resolve against the selected base plus already installed permanent and
character modifiers on its first read.

The scene does not subscribe to `run:start` to apply modifiers. Event-listener
ordering is not used for run construction. This prevents late application after
Player health or weapon systems have already consumed starting state.

The integration test freezes phases rather than `ModifierStack` internal array
layout:

- after `prepareRun` and before `startRun`, permanent and character sources are
  present and card sources are absent;
- after `startRun` but before a choice, the same is true;
- after one `applyCard`, exactly one card-stack source is present;
- resolved additive/multiplicative values match `ModifierStack` semantics.

```mermaid
flowchart LR
  Empty[Empty intro RunState] --> Base[Global base player state]
  Base --> Meta[Permanent meta modifiers]
  Meta --> Character[Character base overrides and passives]
  Character --> Weapons[Character starting weapons]
  Weapons --> Active[startRun to active]
  Active --> Cards[Later run-card modifiers]
```

## Exactly-once terminal banking

### Runtime adapter

`src/systems/ProgressionSystem.ts` owns:

~~~ts
export interface ProgressionSystemOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly context: GameContext;
}

export interface BankedRun {
  readonly reward: RunReward;
  readonly meta: MetaState;
  readonly persisted: boolean;
}

export class ProgressionSystem implements System {
  constructor(options: ProgressionSystemOptions);
  get hasBanked(): boolean;
  get lastBankedRun(): BankedRun | null;
  bankFinishedRun(): BankedRun | null;
  update(_dtMs: number): void;
  destroy(): void;
}
~~~

The constructor creates one callback and registers that same callback for
`run:won` and `run:lost`. Both subscriptions call `bankFinishedRun`; neither
contains reward or persistence logic. This preserves current terminal events
and covers both `Player` loss and `GameScene` terminal paths without moving
`endRun` ownership in Epic 5. Explicit GameScene-only banking calls are not used
because Player already owns a legitimate terminal path; duplicating calls at
all end sites would recreate the ownership problem.

The module owns a `WeakSet<RunState>` of handled in-memory run identities.
This is the guard authority shared by every adapter facade for that same run.
It is garbage-collectable runtime state, not persistent transaction history.

`bankFinishedRun`:

1. returns null when destroyed, already handled, or the run is non-terminal;
2. calls `computeRunReward`;
3. adds the `RunState` identity to the shared weak set before updating context,
   preventing synchronous re-entry and accidental duplicate adapters;
4. calls
   `context.updateMeta(meta => bankReward(meta, reward))` exactly once, even
   for a zero reward;
5. stores and returns the reward, replacement meta, and persistence result.

The existing terminal payloads do not need currency or outcome fields. The
system owns the current `RunState` reference and reads the authoritative status
and currency from it. Richer duplicate payloads would create another state
source.

`destroy` unsubscribes both listeners and is idempotent. It does not remove a
handled run from the weak set. `GameScene` constructs the system before
`startRun`, includes it once in `systems`, and relies on the existing
shutdown/destroy cleanup loop. Scene restart destroys the old adapter and
creates a new adapter with a new `RunState` identity.

The guarantee is exactly once for one in-memory run lifecycle. Reloading after a
write failure can lose the reward; browser crashes between update and storage
are not solved. No transaction IDs, banked-run IDs, or persistent history are
added.

~~~mermaid
sequenceDiagram
  participant End as endRun
  participant Bus as EventBus
  participant Progression as ProgressionSystem
  participant Rules as Pure meta rules
  participant Context as GameContext
  participant Storage as SaveManager

  End->>Bus: run:won or run:lost
  Bus->>Progression: one shared terminal callback
  Progression->>Progression: guard terminal run
  Progression->>Rules: computeRunReward(run)
  Rules-->>Progression: RunReward
  Progression->>Context: updateMeta(bankReward)
  Context->>Storage: save(current V2 snapshot)
  Storage-->>Context: persisted boolean
  Context-->>Progression: replacement meta + result
  Bus->>Progression: duplicate terminal notification
  Progression-->>Bus: ignored by guard
~~~

No correctness assertion may depend on whether the progression listener runs
before a UI terminal listener. Banking uses only the terminal run and context;
UI reads can happen independently.

## Minimal progression interface

`src/ui/progressionController.ts` is Phaser-free:

~~~ts
export interface MetaUpgradeView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currentLevel: number;
  readonly maxLevel: number;
  readonly nextCost: number | null;
  readonly canPurchase: boolean;
}

export interface ProgressionSnapshot {
  readonly scrap: number;
  readonly upgrades: readonly MetaUpgradeView[];
}

export type ProgressionPurchaseResult =
  | {
      readonly ok: true;
      readonly meta: MetaState;
      readonly cost: number;
      readonly newLevel: number;
      readonly persisted: boolean;
    }
  | {
      readonly ok: false;
      readonly meta: MetaState;
      readonly reason: PurchaseFailureReason;
    };

export type ResetProgressionResult =
  | {
      readonly ok: true;
      readonly meta: MetaState;
      readonly persisted: boolean;
    }
  | {
      readonly ok: false;
      readonly meta: MetaState;
      readonly reason: 'confirmation-required';
    };

export class ProgressionController {
  constructor(context: GameContext);
  snapshot(): ProgressionSnapshot;
  purchase(upgradeId: string): ProgressionPurchaseResult;
  reset(confirmed: boolean): ResetProgressionResult;
}
~~~

`snapshot` reads the current context on every call and returns registry order.
`purchase` uses the pure purchase result; it calls `updateMeta` only on success
and carries `persisted` into the command result. `reset(false)` returns
`confirmation-required` without mutation. `reset(true)` calls
`context.resetProgression`.

The controller is sufficient to inspect scrap, levels, costs, purchase success
or failure, and reset behavior in tests or a development shell. It owns no
confirmation dialog. Epic 9 must obtain deliberate user confirmation before
calling `reset(true)`.

Starting a new run remains the scene command already used by restart/start.
`prepareRun` always reads the latest context meta, so the next run after a
successful purchase receives the new permanent effect. No live mutation of an
already active run occurs.

## File and dependency map

~~~mermaid
flowchart LR
  JSON[meta-upgrades.json] --> Validation[validation.ts]
  Validation --> Data[GameData]
  Data --> Registry[DataMetaUpgradeRegistry]
  Registry --> Save[save.ts migration limits]
  Registry --> Rules[gameplay/meta.ts]
  Save --> Context[GameContext current snapshot]
  Rules --> Controller[ProgressionController]
  Context --> Controller
  Rules --> RunStart[runStart.ts]
  Registry --> RunStart
  RunStart --> Game[GameScene]
  Rules --> Runtime[ProgressionSystem]
  Context --> Runtime
  Runtime --> Game
  Game --> Cards[UpgradeSystem and applyCard]
~~~

| Slice | May consume | Exposes to later slices |
| --- | --- | --- |
| 1. Meta data | Existing `StatKey`/`UpgradeEffect` and validation helpers | validated definitions, immutable registry, max-level map |
| 2. V2 save | Slice 1 max-level map, existing settings/storage | current save schema, migration, persistence result |
| 3. Pure rules | Slices 1-2 types/lookup, current RunState/ModifierStack | purchase, unlock, reward, bank, expansion |
| 4. Context | Slices 1-3, existing bus/RNG/data | one current snapshot and controlled persistence commands |
| 5. Run start | Slices 1, 3, 4; current weapons/player/run/card code | ordered prepared run and fixed source namespaces |
| 6. Banking | Slices 3-4; existing terminal events/System lifecycle | exactly-once per-run runtime adapter |
| 7. Controller/integration | All previous public contracts | headless Epic 9 seam and end-to-end proof |

No slice consumes Epic 6, Epic 8, or Epic 9 implementation.

## Implementation slices and acceptance criteria

### Slice 1: meta-upgrade data, validation, and registry

Prerequisites: current `main` only.

Create:

- `src/data/meta-upgrades.json`;
- `src/systems/metaUpgrades.ts`;
- `tests/metaUpgrades.test.ts`.

Modify:

- `src/systems/types.ts`;
- `src/systems/validation.ts`;
- `tests/validation.test.ts`.

Acceptance:

- exact initial JSON above loads through `loadGameData`;
- `GameData.metaUpgrades` is required;
- every validation rule in this document has a focused failure test;
- duplicate effects and unsafe final costs fail with path-specific errors;
- registry values are detached and recursively frozen;
- missing lookup returns undefined; order matches JSON;
- lint, full tests, and build pass.

Deferred: save state, purchases, modifier application, runtime, controller.

### Slice 2: V2 save schema and migration

Prerequisites: Checkpoint 1 complete.

Create:

- `tests/fixtures/save-v1.json`.

Modify:

- `src/systems/save.ts`;
- `src/scenes/BootScene.ts` only to pass registry limits to `SaveManager`;
- `tests/save.test.ts`;
- tests that instantiate `SaveManager`.

Acceptance:

- default save is exactly V2 with default meta;
- valid V1 migrates settings and creates default meta;
- partially corrupt V1 preserves valid settings fields;
- corrupt V2 recovers fields independently;
- malformed JSON, missing version, and unknown future version return complete
  defaults without a load-time write;
- an unknown future version write-protects the manager until an explicit
  successful clear, so default recovery cannot overwrite newer data;
- known excessive levels clamp, unknown canonical upgrades survive, invalid
  entries are dropped;
- unlock order/deduplication and storage exceptions are covered;
- `save`/`clear` return accurate booleans;
- the storage key remains unchanged;
- lint, full tests, and build pass.

Deferred: context ownership and gameplay rules.

### Slice 3: pure progression rules

Prerequisites: Checkpoints 1-2 complete.

Create:

- `src/gameplay/meta.ts`;
- `tests/meta.test.ts`.

Modify: none outside import/type adjustments required by TypeScript.

Acceptance:

- `costOf` rounding is deterministic at every initial definition level;
- unknown, insufficient, and max-level purchases return exact reasons;
- successful purchase deducts exact cost and increments exactly one level;
- every input non-mutation and no-op identity rule is tested with frozen inputs;
- unlock IDs filter/dedupe while preserving unknown canonical IDs;
- non-terminal reward returns null; won/lost zero and non-zero behavior matches;
- negative, fractional, NaN, infinite, and oversized currency are covered;
- XP never contributes;
- banking saturates safely and remains intentionally non-idempotent;
- additive and multiplicative per-level examples match;
- lint, full tests, and build pass.

Deferred: persistence integration and scene flow.

### Slice 4: GameContext current snapshot

Prerequisites: Checkpoints 1-3 complete.

Modify:

- `src/engine/context.ts`;
- `src/scenes/BootScene.ts`;
- `tests/contextSystem.test.ts`;
- `tests/weaponSystem.test.ts` and any other structural `GameContext` fixtures.

Acceptance:

- Boot loads once and retains one V2 snapshot;
- `settings` is always the current `saveData.settings`;
- settings and meta updates replace the root and preserve the other half;
- each update persists exactly once and returns the adapter result;
- failed persistence keeps the new in-memory snapshot;
- reset uses `createDefaultMeta` and preserves settings byte-for-byte;
- a throwing transform leaves state and storage untouched;
- no scene contains migration, purchase, reward, or unlock rules;
- lint, full tests, and build pass.

Deferred: run modifiers, terminal banking, UI.

### Slice 5: ordered run-start integration and source namespaces

Prerequisites: Checkpoints 1-4 complete.

Create:

- `src/gameplay/runStart.ts`;
- `tests/runStart.test.ts`.

Modify:

- `src/scenes/GameScene.ts`;
- `src/gameplay/upgrades.ts`;
- `src/systems/types.ts` source-identity comment;
- `tests/upgrades.test.ts`.

Acceptance:

- `prepareRun` is the only initial modifier/loadout path;
- Player is constructed only after permanent/character contributions exist;
- duplicate permanent application is transactional and rejected;
- scene restart uses the new meta and a fresh stack;
- additive and multiplicative permanent sources are per level;
- card sources are exactly `card:<upgradeId>:<stack>`;
- normalized character sources must be
  `character:<characterId>:<passiveId>`;
- phase integration test freezes permanent-before-character-before-card;
- no character catalog/passive handler/UI is added;
- lint, full tests, build, and a basic browser run pass.

Deferred: Epic 6 character implementation and Epic 8 currency generation.

### Slice 6: terminal reward banking and lifecycle idempotency

Prerequisites: Checkpoints 1-5 complete.

Create:

- `src/systems/ProgressionSystem.ts`;
- `tests/progressionSystem.test.ts`.

Modify:

- `src/scenes/GameScene.ts`.

Acceptance:

- one adapter uses one shared handler for both existing terminal events;
- won and lost bank through the same method;
- duplicate/mixed terminal notifications for one run update meta once;
- duplicate adapters for one `RunState` still update meta once;
- a zero-reward terminal run still completes the guard once;
- non-terminal notifications do not consume the guard;
- destroy removes subscriptions idempotently;
- restart creates a new guard and can bank the next run;
- persistence failure is reported without a duplicate retry;
- `bankReward` stays pure and has no runtime guard;
- lint, full tests, build, and F8/F9 browser terminal smokes pass in development.

Deferred: persistent transaction history, cloud durability, run-summary UI.

### Slice 7: headless controller and integration cleanup

Prerequisites: Checkpoints 1-6 complete.

Create:

- `src/ui/progressionController.ts`;
- `tests/progressionController.test.ts`;
- `tests/progressionIntegration.test.ts`.

Modify only documentation or small integration fixtures required by the final
public surface.

Acceptance:

- snapshot exposes scrap, current/max levels, and next costs in registry order;
- purchase surfaces all three failure reasons and persistence status on success;
- `reset(false)` cannot reset and `reset(true)` preserves settings;
- purchase then new-run preparation applies the newly owned effect;
- terminal reward then a later purchase uses the current context snapshot;
- controller has no Phaser import, rendering, navigation, or dialog;
- full lint, tests, production build, and the Epic 5 browser checklist pass.

Deferred: all final presentation work to Epic 9.

## Test plan

| Contract | Target test | Level |
| --- | --- | --- |
| default V2 save | `tests/save.test.ts` | unit |
| valid V1 to V2 | `tests/save.test.ts` + fixture | unit |
| partially corrupt V1 | `tests/save.test.ts` | unit |
| corrupt V2 recovery | `tests/save.test.ts` | unit |
| malformed JSON | `tests/save.test.ts` | unit |
| unknown future version and write protection | `tests/save.test.ts` | unit |
| storage read/write/remove exceptions | `tests/save.test.ts` | unit |
| reset preserves settings | `tests/contextSystem.test.ts` | integration |
| settings/meta do not drift | `tests/contextSystem.test.ts` | integration |
| deterministic cost rounding | `tests/meta.test.ts` | unit |
| insufficient scrap/max/unknown | `tests/meta.test.ts` | unit |
| pure purchase and input non-mutation | `tests/meta.test.ts` | unit |
| unlock deduplication/unknown IDs | `tests/meta.test.ts` | unit |
| zero/non-zero/invalid reward | `tests/meta.test.ts` | unit |
| won versus lost | `tests/meta.test.ts` | unit |
| additive/multiplicative level expansion | `tests/meta.test.ts` | unit |
| data validation failures | `tests/validation.test.ts` | unit |
| immutable registry | `tests/metaUpgrades.test.ts` | unit |
| modifier phase ordering | `tests/runStart.test.ts` | integration |
| duplicate application and restart | `tests/runStart.test.ts` | integration |
| duplicate terminal banking | `tests/progressionSystem.test.ts` | integration |
| new guard after restart | `tests/progressionSystem.test.ts` | integration |
| controller failures/reset | `tests/progressionController.test.ts` | unit |
| purchase to next-run effect | `tests/progressionIntegration.test.ts` | integration |

Tests assert public state, return values, emitted source IDs, persistence calls,
and lifecycle behavior. They must not assert private arrays, private flags, map
implementation, listener registration order, or exact helper decomposition.

Minimal browser/playtest checks:

1. existing game boots with an empty/migrated V2 save and no console errors;
2. development fixture or controller can show scrap/levels/costs and all
   purchase failure copy inputs;
3. purchase a visible max-health, movement, damage, or pickup upgrade, restart,
   and observe it only on the new run;
4. force win and force loss through existing development keys and verify one
   bank per run;
5. press restart after a terminal run and verify the new run can bank again;
6. block LocalStorage and verify the session continues with a false persistence
   result and no crash;
7. reset only after the development shell supplies `confirmed: true` and verify
   settings survive.

## Architecture risks and review traps

- Do not change `RuntimeConfig.storageKey` to a V2 suffix. That bypasses
  migration.
- Do not redefine `SaveDataV1` or alias it to current data.
- Do not treat a missing/future version as V2 based on matching fields.
- Do not overwrite an unsupported future-version payload with the recovered
  default; the manager stays write-protected until explicit clear.
- Do not call `save.load` inside update methods; that recreates competing
  in-memory snapshots.
- Do not mutate `ctx.settings` or `ctx.saveData.meta` directly; they are frozen.
- Do not roll back in-memory progress because LocalStorage failed. Report the
  failure and keep the session coherent.
- Do not put `sourceId` in JSON.
- Do not multiply an effect value by owned level. Expand levels.
- Do not collapse three 1.05 modifiers into 1.15 or 3.15.
- Do not apply known permanent modifiers by iterating saved IDs without a
  registry lookup; unknown IDs must be inert.
- Do not use modifier counts as owned levels.
- Do not leave `applyCard` on the old `upgrade:...:stack:...` namespace.
- Do not apply permanent effects from a `run:start` listener after Player
  construction.
- Do not bank in separate scene win/loss callbacks or in `Player`.
- Do not scope the banking guard to one adapter instance; key it by
  `RunState` identity.
- Do not add idempotency to `bankReward`; that would require hidden state in a
  pure function.
- Do not assume EventBus listener order.
- Do not persist a transaction history for a per-lifecycle duplicate-event
  problem.
- Do not invent victory/loss/XP multipliers.
- Do not place character unlock prerequisites on meta-upgrade definitions.
- Do not store default-unlocked content in `MetaState.unlocks`.
- Do not delete well-formed unknown unlock or upgrade IDs merely because current
  data does not recognize them.
- Do not add a production progression menu or reset dialog in Epic 5.

## XHigh architecture review outcome

The final design was reviewed against the requested failure axes:

| Axis | Resolution |
| --- | --- |
| Contradictory ownership | Pure rules, storage, context, run setup, runtime guard, and controller each have one owner |
| Duplicate persistence paths | Only `GameContext` calls `SaveManager.save` after boot |
| Mutation leaks | Published save/progression/registry/controller values are deeply frozen |
| Scene-level rules | `GameScene` coordinates prepared run and systems only |
| Migration ambiguity | Exact version switch and one private V1-to-V2 step |
| Future-version corruption | Whole-save default plus write protection until explicit clear |
| Event ordering | Run construction is explicit; terminal banking does not depend on listener order |
| Duplicate modifiers | Transactional preflight by deterministic source |
| Multiplicative scaling | One modifier per level, demonstrated numerically |
| Cross-epic coupling | Normalized character contribution; no Epic 6/8/9 implementation |
| Epic 8 dependency | Zero/non-zero current currency already banks 1:1 |
| Epic 9 leakage | Headless controller only |
| Hidden tuning | Costs/effects live in JSON; reward conversion is fixed 1:1 |
| Brittle tests | Tests target public contracts and lifecycle state |
| Unmergeable slices | Seven dependency-ordered slices each compile/test independently |

No unresolved architecture decision remains. Later human product judgment is
limited to balance tuning and final Epic 9 presentation, neither of which blocks
Epic 5 implementation.

## Implementation ordering

Land the seven checkpoints above in dependency order, each green on
`npm run lint`, `npm test`, `npm run build`, and `git diff --check` before the
next begins. This is a checkpoint order, not a required PR topology: the
checkpoints may land as one PR or several, provided each checkpoint's
acceptance criteria and deferred work are satisfied before the next starts.
