# Epic 7: Maps and Arenas — Architecture Overview

Status: implementation-ready architecture for Epic 7 / issue #8. This document
is the repository **source of truth** for Epic 7 and the index for its seven
per-slice architecture PRs. It supersedes conflicting Epic 7 issue text — in
particular the `unlock: { type; requiresUnlockId?: string }` optional-field
shape (Epic 7 reuses the required `UnlockRule` union exactly as Epic 6 did) and
any wording that implies arena selection needs a new storage key or a
`SaveDataV3`.

Epic 7 is implemented as **seven dependency-ordered slices**, each shipped as
its own sub-issue under #8 and its own architecture PR. This overview freezes
the shared contracts every slice depends on; each slice PR carries the exact,
self-contained implementation spec for that slice.

## 1. Decision summary

- **Arena data is a new fail-closed JSON catalog** (`src/data/arenas.json`)
  validated by one authoritative path (`validateArenaCatalog`) reused by both
  `validateGameData` and a defensive `DataArenaRegistry` constructor — exactly
  the `DataCharacterRegistry`/`DataEnemyRegistry` precedent. A single malformed
  arena fails the whole `loadGameData()` call; there is no per-arena partial
  recovery.
- **Arena selection extends the Epic 6 `GameContext` pattern verbatim.**
  `GameContext` gains `arenas: ArenaRegistry`, an in-memory `selectedArenaId`, an
  `arenaSelectionRevision` counter, and `selectArena(arenaId, expectedRevision)`.
  Selection is session-transient: never written to `SaveDataV2`, never a
  `SaveDataV3`. Arena *unlocks* live in the existing `MetaState.unlocks` under
  the `arena:<arenaId>` namespace, gated through Epic 5's `isUnlocked`.
- **`RunState.arenaId` becomes authoritative.** Epic 6 shipped `arenaId` inside
  the pre-run `RunRequest` but sourced it from `defaultArenaId(ctx)` (which
  returned `spawnCurves[0].id`). Epic 7 sources it from the selected arena and
  makes every downstream reader (`SpawnSystem`, victory duration, HUD) resolve
  through `RunState.arenaId → arena → arena.spawnCurveId → curve` instead of
  independently re-deriving `ctx.data.spawnCurves[0]`. This closes the
  duplication flagged in `epic-6-characters.md` §26.
- **The spawn director stops knowing about screen geometry.** The
  screen-edge-only `SpawnSystem.spawnPoint` private method is replaced by a pure,
  Phaser-free `spawnPoint(arena, rng): Vec2` (`src/gameplay/spawnRegion.ts`) that
  the director consumes through its existing `ctx.spawnPoint` seam. The director
  (`createSpawnDirector`) is **not modified** — it already asks `ctx.spawnPoint`
  for positions and validates finite coordinates.
- **World bounds come from the arena.** At run start `GameScene` sets
  `physics.world.setBounds` and `cameras.main.setBounds` from `arena.size`, and
  the player spawns at the arena centre. Camera-follow is wired only when the
  arena exceeds the viewport, so a canvas-sized arena behaves exactly as today.
- **Static obstacles and hazards are additive shells.** The starter arena ships
  with empty `obstacles`/`hazards`, so the shipped run is behaviourally
  identical to today. Obstacles are static arcade bodies with player/enemy
  collision; hazards are optional overlap zones that emit the one new event
  (`hazard:triggered`) and apply `damagePerSecond`. No pathfinding is added.
- **Epic 7 adds exactly one `GameEventMap` event** (`hazard:triggered`) and no
  save-schema change.

## 2. Repository baseline (post-Epic-6 `main`, merged PR #36)

- `RunState.arenaId` already exists (`src/gameplay/runState.ts`) and already
  flows into the `run:start` event payload.
- The pre-run `RunRequest` (`src/gameplay/runRequest.ts`) already carries
  `{ characterId, arenaId, seed }`. `arenaId` is produced today by
  `defaultArenaId(ctx)` = `ctx.data.spawnCurves[0]?.id ?? 'arena'`, and the whole
  request is assembled by `CharacterSelectionController.buildRunRequest(rng)`.
- `GameContext` (`src/engine/context.ts`) already owns the Epic 6 selection
  triplet (`characters`, `selectedCharacterId`, `selectionRevision`,
  `selectCharacter`) plus a `revalidateSelection()` hook that runs after every
  meta mutation. Epic 7 mirrors all of it for arenas.
- `SpawnSystem` (`src/systems/SpawnSystem.ts`) constructs its director from
  `this.ctx.data.spawnCurves[0]` directly and owns a private screen-edge
  `spawnPoint(rng)` that reads `this.scene.scale.width/height`. Enemies do **not**
  set `collideWorldBounds`; only `Player` does (`Player.ts`,
  `body.setCollideWorldBounds(true)`).
- `GameScene` re-derives `ctx.data.spawnCurves[0]?.durationSeconds` in two more
  places (`maybeEndRunForVictory`, `updateHud`). No `physics.world.setBounds` or
  `cameras.main.setBounds`/`startFollow` call exists anywhere; world bounds
  default to the 390×844 canvas.
- `createSpawnDirector` (`src/gameplay/spawnDirector.ts`) is pure, seeded, and
  already calls `context.spawnPoint(rng)` and throws on non-finite coordinates.
  Epic 7 does not touch it.
- Registries (`DataEnemyRegistry`, `DataCharacterRegistry`,
  `DataMetaUpgradeRegistry`) share one shape: validate raw input in the
  constructor, `structuredClone` + recursively `deepFreeze`, build a `byId` map,
  publish a frozen `snapshot`. `DataArenaRegistry` follows it exactly.
- Cross-catalog reference checks (`assertSpawnReferences`,
  `assertCharacterWeaponReferences`) run only from `validateGameData`, after the
  referenced catalog validates. `assertArenaSpawnCurveReferences` follows the
  same rule.
- `UnlockRule` (`src/gameplay/meta.ts`) is `{ type: 'default' } | { type:
  'meta'; requiresUnlockId: string }` — required, no optional field.
  `isUnlocked(meta, id)`/`addUnlocks(meta, ids)` and the `arena:<id>` /
  `achievement:<id>` unlock namespaces already exist.

## 3. Ownership table

| Owner | Owns in Epic 7 | Does not own |
| --- | --- | --- |
| `src/data/arenas.json` | Arena content | Spawn-curve/enemy/character content |
| `src/systems/types.ts` | `ArenaDefinition` and nested JSON-safe shapes (`ArenaSize`, `SpawnRegion`, `ObstacleDefinition`, `HazardDefinition`); `arenas` on `GameData` | Runtime scene objects |
| `src/systems/validation.ts` | `validateArenaCatalog`, `assertArenaSpawnCurveReferences`, `assertArenaDefaultExists`, obstacle/region legality checks, shared `checkUnlockRule` | Selection, world-bounds, or hazard-runtime rules |
| `src/systems/arenas.ts` | `ArenaRegistry`/`DataArenaRegistry`: immutable lookup | Selection state, unlock gating logic |
| `src/gameplay/arenaSelection.ts` | Pure `canSelectArena`, `selectableArenas`, `defaultArenaId(registry)` | Storage, events, scenes |
| `src/gameplay/spawnRegion.ts` | Pure `spawnPoint(arena, rng)` region geometry | Spawn scheduling (owned by `spawnDirector.ts`) |
| `src/gameplay/runRequest.ts` | `assembleRunRequest(ctx, rng)` (reads both selections) | Character/arena content or selection state |
| `src/engine/context.ts` | `arenas`, `selectedArenaId`, `arenaSelectionRevision`, `selectArena`, arena revalidation | Gameplay calculations, scene flow |
| `src/ui/arenaSelectionController.ts` | Headless read/command model for arena selection | Phaser rendering, dialogs, navigation |
| `src/systems/HazardSystem.ts` | Per-run hazard overlap → damage + `hazard:triggered` | Hazard content, obstacle collision |
| `src/scenes/BootScene.ts` | Constructing `DataArenaRegistry`, passing `arenas` into `createGameContext` | Arena rules |
| `src/scenes/GameScene.ts` | World/camera bounds from `arena.size`, resolving the arena + its curve once, wiring obstacles/hazards and the pure `spawnPoint`, a dev-only arena hotkey | Selection rules, region geometry, curve scheduling |
| `src/systems/SpawnSystem.ts` | Consuming the resolved arena + curve and the pure `spawnPoint`; dropping its private screen-edge helper and `spawnCurves[0]` read | Arena data model, region math |

Explicit non-goals (deferred, per issue #8 and cross-epic rules):

- no tile tooling, tilemaps, or map editor;
- no pathfinding or navigation meshes — enemy movement stays simple steering and
  may overlap obstacles;
- no production arena-select menu, transitions, or responsive layout (Epic 9
  builds it against `ArenaSelectionController.snapshot()`/`.select(...)`);
- no final map art, backgrounds, or tilesets (Epic 12 polish);
- no boss arenas or arena-specific scripted events;
- no persisted arena selection, `SaveDataV3`, or new storage key;
- no reward/economy changes — hazards damage the player only, they never write
  `MetaState` or generate loot;
- no new `GameEventMap` events beyond `hazard:triggered`.

## 4. Shared TypeScript contracts (frozen here)

### 4.1 Arena data (`src/systems/types.ts` additions)

```ts
import type { UnlockRule } from '../gameplay/meta';

export interface ArenaSize {
  readonly width: number;
  readonly height: number;
}

export type SpawnRegion =
  | { readonly kind: 'ring'; readonly cx: number; readonly cy: number; readonly minRadius: number; readonly maxRadius: number }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly kind: 'edges'; readonly margin: number };

export interface ObstacleDefinition {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface HazardDefinition {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly damagePerSecond: number;
}

export interface ArenaDefinition {
  readonly id: string;
  readonly name: string;
  readonly size: ArenaSize;
  readonly spawnCurveId: string;
  readonly spawnRegions: readonly SpawnRegion[];
  readonly obstacles: readonly ObstacleDefinition[];
  readonly hazards: readonly HazardDefinition[];
  readonly unlock: UnlockRule;
}

export interface GameData {
  // ...existing fields...
  arenas: ArenaDefinition[];
}
```

- `UnlockRule` is reused verbatim (required, no optional `requiresUnlockId?`).
  This supersedes the issue-#8 optional-field wording, exactly as Epic 6 did for
  characters. Import it `import type` only.
- All coordinates are **arena/world space**: origin top-left `(0,0)`, extent
  `(size.width, size.height)`, the same coordinate system Phaser world bounds
  use. There is no screen-space coordinate anywhere in arena data.
- `SpawnRegion` is a discriminated union on `kind` (`ring` | `rect` | `edges`) —
  the exact three kinds issue #8 names. `edges` reproduces today's off-screen
  ring spawn (`margin` band around the arena boundary).

### 4.2 Arena registry (`src/systems/arenas.ts`)

```ts
export interface ArenaLookup {
  arenaById(id: string): Readonly<ArenaDefinition> | undefined;
}

export interface ArenaRegistry extends ArenaLookup {
  all(): readonly Readonly<ArenaDefinition>[];
  defaultArenaId(): string;
}

export class DataArenaRegistry implements ArenaRegistry {
  constructor(data: Pick<GameData, 'arenas'>);
  arenaById(id: string): Readonly<ArenaDefinition> | undefined;
  all(): readonly Readonly<ArenaDefinition>[];
  defaultArenaId(): string;
}
```

Mirrors `DataCharacterRegistry` exactly: constructor calls
`validateArenaCatalog(data.arenas)`, then `structuredClone` + `deepFreeze`s each
definition and the snapshot; `defaultArenaId()` delegates to
`arenaSelection.defaultArenaId(this)` so there is one implementation of "which
arena is the default." It takes only `Pick<GameData, 'arenas'>` — no
`spawnCurves` parameter — because the cross-catalog spawn-curve check is a
`validateGameData`-only concern (§4.3), matching `DataCharacterRegistry`'s
scoping.

### 4.3 Cross-catalog and catalog-level checks (`validateGameData`)

- `ROOT_FIELDS` gains `'arenas'`; `GameData` requires it like every other
  catalog.
- `assertArenaSpawnCurveReferences(arenas, spawnCurves)` — every
  `arena.spawnCurveId` must equal some `spawnCurves` `id`. Runs only from
  `validateGameData`, after both catalogs validate (mirrors
  `assertCharacterWeaponReferences`).
- `assertArenaDefaultExists(arenas)` and `assertUniqueIds('arenas.json', arenas)`
  run inside `validateArenaCatalog` (self-contained, like the character catalog).
- Obstacle/region legality that needs only the arena's own `size`/`spawnRegions`
  (in-bounds, not covering a `rect`/`ring` region or the arena centre) is checked
  per-row inside `validateArenaCatalog`.


- **Witness-based feasibility checks:** validation deterministically proves that
  every `rect` and `ring` spawn region has at least one valid spawn point by
  running a shared cell-sweep routine (`findRectWitness` / `findRingWitness`).
  For `edges` regions, every edge midpoint is checked against obstacles.
  Catalog-level caps reject arenas exceeding `MAX_SPAWN_REGIONS=16`,
  `MAX_OBSTACLES=256`, or `MAX_HAZARDS=64` to bound the witness-scan cost.

### 4.4 Pure selection rules (`src/gameplay/arenaSelection.ts`)

```ts
export function canSelectArena(arena: Readonly<ArenaDefinition>, meta: Readonly<MetaState>): boolean;
export function selectableArenas(registry, meta): readonly Readonly<ArenaDefinition>[];
export function defaultArenaId(registry: Pick<ArenaRegistry, 'all'>): string;
```

Byte-for-byte parallel to `characterSelection.ts`: `canSelectArena` is
`arena.unlock.type === 'default' || isUnlocked(meta, arena.unlock.requiresUnlockId)`;
`selectableArenas` preserves registry order and drops only locked entries;
`defaultArenaId` returns the JSON-first `unlock.type === 'default'` arena and is
the single shared implementation `DataArenaRegistry.defaultArenaId()` delegates
to. A stale `arena:<id>` unlock whose arena no longer exists is inert (Epic 5's
"never delete a well-formed unknown unlock id" rule), exactly like characters.

### 4.5 Pure spawn-region geometry (`src/gameplay/spawnRegion.ts`)

```ts
export function spawnPoint(arena: Readonly<ArenaDefinition>, rng: Rng): Vec2;
```

Phaser-free. Picks one of `arena.spawnRegions` uniformly with `rng.int`, samples
a point for that region kind, and returns finite `Vec2` world coordinates. This
is exactly the `ctx.spawnPoint` the director calls, so the director never learns
region types. Full semantics (per-kind sampling, obstacle-avoidance retry,
fallbacks, the in-bounds invariant) are frozen in the Slice 3 doc.

### 4.6 `GameContext` additions (`src/engine/context.ts`)

```ts
export type SelectArenaFailureReason = 'unknown-arena' | 'locked' | 'stale-selection';
export type SelectArenaResult =
  | { readonly ok: true; readonly arenaId: string; readonly revision: number }
  | { readonly ok: false; readonly reason: SelectArenaFailureReason; readonly arenaId: string; readonly revision: number };

export interface GameContext {
  // ...existing fields...
  readonly arenas: ArenaRegistry;
  readonly selectedArenaId: string;
  readonly arenaSelectionRevision: number;
  selectArena(arenaId: string, expectedRevision: number): SelectArenaResult;
}
```

`createGameContext` sets `selectedArenaId = arenas.defaultArenaId()` and
`arenaSelectionRevision = 1`. `selectArena` mirrors `selectCharacter` branch for
branch (unknown → stale → locked → idempotent-no-bump → change+bump-by-1) and
never touches `saveData`. `revalidateSelection()` is extended to also reset the
arena to default if a meta mutation makes the current arena unselectable
(bumping `arenaSelectionRevision`).

### 4.7 Pre-run assembly (`src/gameplay/runRequest.ts`)

`RunRequest`'s shape is unchanged. Epic 7 replaces the character-controller-owned
`buildRunRequest` with a neutral free function that reads **both** selections:

```ts
export function assembleRunRequest(ctx: GameContext, rng: Pick<Rng, 'int'>): RunRequest {
  // characterId: ctx.selectedCharacterId, re-checked against canSelectCharacter → default fallback
  // arenaId:     ctx.selectedArenaId,     re-checked against canSelectArena     → default fallback
  // seed:        nextRunSeed(rng)
}
```

`defaultArenaId(ctx)` (the old `spawnCurves[0]` fallback in `runRequest.ts`) is
**removed**; the only `defaultArenaId` is now `arenaSelection.defaultArenaId(registry)`.
`CharacterSelectionController.buildRunRequest` is removed too; the controller
keeps only `snapshot()`/`select(...)`.

### 4.8 The one new event (`src/engine/eventBus.ts`)

```ts
'hazard:triggered': { hazardId: string; damage: number; x: number; y: number };
```

`damage` is the amount applied **this tick** (`damagePerSecond * dtMs / 1000`),
not the static rate. Emitted by `HazardSystem` when the player overlaps a hazard
during an active run. Feedback subscribers (Epic 10 audio, Epic 12 vignette)
consume it later; Epic 7 only emits.

## 5. Starter arena (`src/data/arenas.json`)

Ships exactly one arena, canvas-sized with a single `edges` region and empty
obstacles/hazards, so the shipped run is behaviourally identical to today:

```json
[
  {
    "id": "junkyard-lot",
    "name": "Junkyard Lot",
    "size": { "width": 390, "height": 844 },
    "spawnCurveId": "junkyard-intro",
    "spawnRegions": [{ "kind": "edges", "margin": 28 }],
    "obstacles": [],
    "hazards": [],
    "unlock": { "type": "default" }
  }
]
```

`spawnCurveId` references the existing `junkyard-intro` curve; `margin: 28`
reproduces the current `SpawnSystem.spawnPoint` constant. The default,
canvas-sized bounds and single edge region mean Slice 5's integration is a pure
refactor with no gameplay change. A second, larger arena with obstacles/hazards
is added by later content or by the Slice 6/7 test fixtures — never required for
Epic 7 to be correct.

## 6. Dependency-ordered slice index

Each slice is a sub-issue under #8 and a standalone architecture PR. Prereqs are
strict: a slice's PR should not be implemented before its prerequisites merge.

| # | Slice | Creates / modifies | Prereqs |
| --- | --- | --- | --- |
| 1 | Arena data model, validation & registry | `arenas.json`, `types.ts`, `validation.ts`, `arenas.ts`, tests | none (post-Epic-6 `main`) |
| 2 | Pure arena selection & unlock rules | `arenaSelection.ts`, tests | 1 |
| 3 | Pure spawn-region geometry (`spawnPoint`) | `spawnRegion.ts`, tests | 1 |
| 4 | Pre-run wiring: `GameContext` + `RunRequest` + `BootScene` | `context.ts`, `runRequest.ts`, `arenaSelectionController.ts`, `BootScene.ts`, tests | 1, 2 |
| 5 | World bounds + arena-authoritative spawn/duration integration | `GameScene.ts`, `SpawnSystem.ts`, `Player.ts`, tests | 3, 4 |
| 6 | Static obstacles | obstacle builder + colliders, a fixture arena, tests | 1, 5 |
| 7 | Hazard shell + `hazard:triggered` + dev hotkey + cleanup/sign-off | `eventBus.ts`, `HazardSystem.ts`, `GameScene.ts`, tests | 5, 6 |

Slices 2 and 3 are independent of each other and can be implemented in parallel
once Slice 1 merges. Slices 1–5 leave the shipped starter run behaviourally
identical; Slices 6–7 are additive shells the starter arena does not exercise.

## 7. Dependency and data-flow map

```mermaid
flowchart LR
  ArenaJSON[arenas.json] --> ArenaValidation[validateArenaCatalog]
  CurveJSON[spawn-curves.json] --> CurveValidation[validate spawn curves]
  ArenaValidation --> GameDataFn[validateGameData]
  CurveValidation --> GameDataFn
  GameDataFn -->|assertArenaSpawnCurveReferences| GameData[GameData.arenas]
  GameData --> ArenaRegistry[DataArenaRegistry]
  ArenaRegistry --> Context[GameContext.arenas]
  Context --> SelectionRules[gameplay/arenaSelection.ts]
  Context --> SelectionController[ui/arenaSelectionController.ts]
  Context --> Assemble[gameplay/runRequest.assembleRunRequest]
  Assemble --> GameScene[GameScene.create]
  ArenaRegistry --> GameScene
  GameScene -->|arena.size| WorldBounds[physics.world + camera bounds]
  GameScene -->|arena + curve| SpawnSystem[SpawnSystem]
  SpawnRegion[gameplay/spawnRegion.spawnPoint] --> SpawnSystem
  SpawnSystem -->|ctx.spawnPoint| Director[spawnDirector (unchanged)]
  GameScene --> Obstacles[static obstacle bodies]
  GameScene --> Hazards[HazardSystem]
  Hazards -->|hazard:triggered| Bus[EventBus]
```

## 8. Cross-epic boundaries

- **Epic 4 (spawn director):** unchanged. Epic 7 only supplies a smarter
  `ctx.spawnPoint`. The director keeps owning *when* and *how many*; the arena
  owns *where*.
- **Epic 5 (meta/unlocks):** arena unlocks reuse `MetaState.unlocks`
  (`arena:<id>`), `isUnlocked`, and `addUnlocks` unchanged. No save migration.
- **Epic 6 (characters):** arena selection is a structural copy of character
  selection. The pre-run `RunRequest` boundary is extended, not reshaped. The
  `buildRunRequest`/`defaultArenaId(ctx)` relocation (Slice 4) is the only Epic 6
  surface Epic 7 edits, and it is a clean refactor with migrated tests.
- **Epic 8 (loot/economy):** unaffected — hazards damage the player and never
  touch currency, XP, or `MetaState`; `spawnPoint` positions do not change drop
  rules.
- **Epic 9 (UI):** builds the production arena-select screen against
  `ArenaSelectionController`; retires the Slice 7 dev hotkey.
- **Epic 12 (polish):** adds arena backgrounds/tilesets and obstacle/hazard art
  against this data contract; no gameplay change.

## 9. Global acceptance criteria (all slices)

- `arenas.json` is a required, fail-closed catalog with one authoritative
  validator reused by the registry constructor.
- The shipped starter arena reproduces today's run exactly (canvas bounds,
  off-screen edge spawns, no obstacles/hazards, same victory duration).
- `RunState.arenaId` is authoritative: no code path re-derives
  `ctx.data.spawnCurves[0]` after Slice 5; the spawn curve, world bounds, and
  victory duration all resolve through the selected arena.
- Arena selection cannot be persisted, cannot introduce `SaveDataV3`, and mirrors
  the character-selection revision discipline exactly.
- Region geometry, selection rules, and unlock rules are pure, Phaser-free, and
  seeded/deterministic where randomness is involved.
- Adding a new arena is a `arenas.json`-only change with zero
  `GameScene`/`SpawnSystem` edits.
- Obstacles and hazards are opt-in per arena; an empty array behaves as today.
- `hazard:triggered` is the only new event; there is no new save schema.
- Every slice keeps lint, the full Vitest suite, the production build, and
  `git diff --check` green.

## 10. Reviewer traps (repeated in each slice doc as relevant)

- Do not give `DataArenaRegistry`'s constructor a `spawnCurves` parameter — the
  cross-catalog check belongs to `validateGameData` only.
- Do not leave two `defaultArenaId` functions after Slice 4 — the
  `spawnCurves[0]` one in `runRequest.ts` is removed; only
  `arenaSelection.defaultArenaId(registry)` remains.
- Do not let `spawnRegion.ts` import Phaser or read `scene.scale` — it is a pure
  world-space function.
- Do not modify `createSpawnDirector`; it already consumes `ctx.spawnPoint`.
- Do not persist `selectedArenaId` into `SaveDataV2` or invent `SaveDataV3`.
- Do not add an `arena:changed`/`selection:changed` event — callers read the new
  state from each command's return value, exactly like characters.
- Do not treat a well-formed unknown `arena:<id>` unlock as an error.
- Do not add pathfinding; enemies may overlap obstacles.
- Do not make the starter arena larger than the canvas — parity with today is a
  slice acceptance gate.
- Do not let hazard damage route through the player i-frame path; continuous
  damage must not depend on the invulnerability window (Slice 7).
