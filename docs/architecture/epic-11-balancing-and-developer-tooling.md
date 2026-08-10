# Epic 11: Balancing and Developer Tooling — Architecture and Implementation Handoff

Status: **implementation-ready architecture** for Epic 11 / issue #12 on the
single delivery branch `agent/epic-11-balancing-and-developer-tooling`.

Baseline: `main` at `8985d52` (Epic 10 audio contracts + `AudioManager`,
934 tests / 68 files green, verified at branch time). This document is the
repository source of truth for Epic 11. It supersedes issue #12 where the
issue predates the live validation, scaling, spawn, and debug seams cited in
§2.

Epic 11 is one branch and one eventual delivery PR (the maintainer exception
established for Epics 9 and 10). The five slices in §10 are ordered commit
and review gates on that same branch; they are not separate branches or PRs.
Every intermediate commit must compile and keep the existing test suite green.

## 1. Outcome

Make the game easy to tune and test without changing how it plays for normal
players:

- one aggregate, non-throwing validation entry point —
  `validateAllData(): ValidationIssue[]` — runs every per-file validator plus
  cross-references and returns structured errors, so a Vitest CI test fails on
  bad tuning data with file/field attribution instead of a boot-time crash or
  a playtest surprise;
- `validateGameData`'s hardcoded per-file wiring is replaced by a descriptor
  table (the maintainer's Epic 0 review note on issue #12), so adding a data
  file is one entry, not three edits that drift;
- shared pure curve helpers (`src/gameplay/curves.ts`) define `lerp`, `clamp`,
  `growth`, `linearGrowth`, and `weightedPick` once; the existing scalers
  (`costOf`, `scaleEnemy`, `xpToNext`, spawn-region clamping) route through
  them with **byte-identical outputs**;
- developer cheat flags (`godMode`, XP/scrap/spawn multipliers) exist for
  playtesting, are off by default, are reachable only in development builds,
  and apply through the existing `ModifierStack` and spawn-curve seams — no
  bespoke branches in gameplay code;
- the F3 debug overlay shows the run metrics a tuner actually needs: FPS,
  active enemy/projectile/drop counts, run time/level/kills, and a rolling
  rough DPS, while remaining read-only;
- a local end-of-run playtest summary prints the finished run to the dev
  console (`console.table`): outcome, time, level, kills, currency, upgrades
  taken, and average DPS. No network, no PII, no player-facing change.

Epic 11 changes **no** shipped balance values, **no** event payloads, **no**
save schema, and adds **no** new bus events.

## 2. Architecture-pass findings and frozen corrections

The live repository was inspected at the baseline above. Read issue #12
through these corrections; each is evidence-backed against `main`.

1. **`validateGameData` throws on the first bad catalog today; the aggregate
   runner must not.** Per-file validators (`validate`, the catalog functions)
   throw via the single `throwIfErrors` site with messages that already follow
   one grammar — `file[index].field: message` (`src/systems/validation.ts`).
   Epic 0's `collectValidationErrors` is the non-throwing primitive the
   maintainer's note points at. Frozen design (§5): a `CATALOG_DESCRIPTORS`
   table drives both the existing throwing boot path (unchanged messages,
   unchanged first-error order) and the new collecting path; the collector
   maps thrown message lines to structured `ValidationIssue`s at the boundary.
   No check function is rewritten.
2. **Issue #12's "route `scaleEnemy` through `growth`" would change balance.**
   `growth(base, rate, step) = base * rate ** step` compounds, but Epic 4's
   `scaleEnemy` (`src/gameplay/enemyScaling.ts:43–49`) is deliberately linear:
   `base * (1 + rate * minutes)`. Routing it through `growth` would silently
   steepen late-run enemy scaling. Frozen correction: `curves.ts` defines both
   `growth` (used by `costOf`, `xpToNext`) and `linearGrowth` (used by
   `scaleEnemy`); every reroute is output-identical and pinned by exactness
   tests (§11). The issue's "curves are defined once" intent is preserved;
   the formula is not.
3. **`clamp` is currently duplicated privately; `lerp` does not exist.**
   `src/gameplay/spawnRegion.ts:137` holds a private `clamp`; all its call
   sites pass `min <= max`, so the shared `clamp` may throw on inverted bounds
   without changing behavior. No other `lerp`/`clamp` copies exist in `src/`.
4. **`armor` is a dead stat, so god mode cannot be a `Modifier`.** `armor` is
   declared in `STAT_KEYS` (`src/gameplay/stats.ts:6`) but nothing resolves
   it — `Player.takeDamage`/`takeEnvironmentalDamage` subtract raw amounts
   (`src/entities/Player.ts:78–116`). A god-mode armor modifier would do
   nothing; adding an armor resolution or an invulnerability branch to
   `Player` would be exactly the bespoke gameplay branch issue #12 forbids.
   Frozen design (§6): god mode lives entirely in the dev-only
   `DebugCheatSystem`, which refills `player.health` to the resolved
   `maxHealth` each update while the run is active. Accepted edge, documented:
   a single hit `>=` current max health can still end the run; shipped data
   makes this unreachable in practice (hardest single hit is trash-brute 14,
   worst-case scaled ≈ 21, vs 100 base health).
5. **XP and scrap multipliers already have exact seams.** `xp.ts:17` resolves
   `xpGain`; `DropSystem.ts:156` resolves `currencyGain`. Cheats are plain
   `mult` modifiers under the dev-only source namespace `debug:cheats`,
   removed on system destroy. No gameplay-file edits, no new `StatKey`.
6. **Spawn cadence is construction-time.** `createSpawnDirector` builds one
   `createCadence(wave.spawnEveryMs)` per wave up front
   (`src/gameplay/spawnDirector.ts:38–43`); there is no runtime rate seam.
   Frozen design (§6): `spawnMultiplier` scales a **copy** of the curve's
   `spawnEveryMs` values once at run setup, before `SpawnSystem` construction
   — rate only, `maxAlive` caps untouched (so pressure saturates at the caps,
   documented), multiplier clamped to `>= 1` with intervals rounded to
   integers `>= 1`, which preserves every director/validation invariant
   (first-due-before-end can only become *more* satisfied). The director
   itself is not edited.
7. **Cheat flags are parsed once per session; there is no mid-run toggle.**
   Issue #12's "runtime toggle" is satisfied at boot: `readDebugFlags` parses
   `URLSearchParams` (`?cheats=1&god=1&xp=2.5&scrap=3&spawn=2`) in development
   builds only, caches the result, and defaults everything off. Mid-run
   toggling was considered and rejected: it would require reconciling the
   construction-time spawn director (§2.6) for near-zero playtest value — the
   existing F8/F9/F10 dev hotkeys already cover live intervention. This is
   decision point D2 (§17).
8. **The gate is statically eliminated in production.**
   `RuntimeConfig.isDev` is `import.meta.env.DEV` (`src/engine/config.ts:19`),
   which Vite replaces with `false` in production builds, so
   `debugCheatsActive(flags, isDev = RuntimeConfig.isDev)` folds to constant
   `false` and every cheat branch is dead-code-eliminable. Cheats are
   unreachable in production with dev off — structurally, not by convention.
   Flags are never persisted and never touch the save path.
9. **The debug overlay is intentionally not dev-gated today and already does
   half the job.** `DebugOverlay` (`src/systems/debug.ts`) renders FPS plus
   caller-supplied lines; `GameScene.update` already passes run status/time,
   level/XP, health, enemy count/kills, weapons, and input state
   (`GameScene.ts:326–335`). Missing per issue #12: projectile count, drop
   count, rough DPS. Frozen design (§7): keep the overlay line-driven and
   read-only; add a pure `DpsMeter` (`src/gameplay/metrics.ts`) owned by
   `GameScene` and fed from `enemy:damaged` payloads at `runState.timeMs`
   (never `Date.now`/`performance.now`); counts come from
   `group.getLength()`. Whether the F3 overlay should remain reachable in
   production builds is decision point D4 — this architecture keeps the
   status quo.
10. **The Epic 9 run summary is player-facing UI; the playtest summary is a
    separate dev channel.** `RunSummaryController`/`PhaserRunSummaryView`
    render in-canvas at run end. Epic 11 adds no UI: a
    `PlaytestSummarySystem` (`src/systems/playtestSummary.ts`) subscribes
    `run:won`/`run:lost`, prints once per run through an injectable logger,
    and is constructed only when `RuntimeConfig.isDev` (§8). Printing in
    non-dev preview builds is decision point D3.
11. **Epic 10 merged partially; Epic 11 is unaffected.** PR #65 landed the
    audio data catalogs, events, and the game-scoped `AudioManager`, but
    slices 3–5 (context/scene wiring, `ui:*` emission, placeholder assets) are
    not on `main` — there is no `public/` or `scripts/` directory, and
    `GameContext.updateSettings` does not yet emit `settings:changed`. Epic 11
    consumes only the *data* side (`audio-assets.json`, `audio-map.json` and
    their validators), which is present and covered by `validateAllData`. The
    Epic 10 remainder is flagged as decision point D1; it does not block this
    epic.
12. **Minor observed drift, out of scope but recorded:** `ui/theme.ts`
    declares a `debugOverlay` depth of 2000 while `DebugOverlay` hardcodes
    `setDepth(10_000)`; roadmap/knowledge-graph status lines lag the Epic
    9/10 merges. Neither affects Epic 11 contracts; slice 5 refreshes only the
    Epic 11 status lines.

## 3. Ownership and non-goals

| Owner | Owns in Epic 11 | Does not own |
| --- | --- | --- |
| `src/gameplay/curves.ts` (new) | Pure `lerp`, `clamp`, `growth`, `linearGrowth`, `weightedPick` | Any caller policy, Phaser |
| `src/gameplay/metrics.ts` (new) | Pure rolling `DpsMeter` | Event subscription, rendering |
| `src/systems/validation.ts` | `CATALOG_DESCRIPTORS`, extracted per-file catalog validators, `ValidationIssue`, `validateAllData`, `collectGameDataErrors` | Boot behavior changes (none allowed) |
| `src/systems/debug.ts` | `DebugFlags`, URL parsing, cheat modifiers, spawn-curve scaler, `DebugCheatSystem`; keeps existing `DebugOverlay` | Gameplay rules, persistence |
| `src/systems/playtestSummary.ts` (new) | `PlaytestSummarySystem` console summary | Player-facing UI |
| `src/gameplay/enemyScaling.ts` / `meta.ts` / `xp.ts` / `spawnRegion.ts` | Reroute through `curves.ts` with identical outputs | Formula changes |
| `src/scenes/GameScene.ts` | Cheat wiring, scaled-curve selection, meter + overlay lines, summary construction | New gameplay logic |
| `tests/` | New focused test files per §11 | Weakening existing pins |
| `docs/balancing/data-driven-balancing.md` | Short "how to tune common values" note | Full balance guide |

Explicit non-goals:

- no shipped balance/value changes to any `src/data/*.json`;
- no new bus events, no event-payload changes, no new `StatKey`;
- no save-schema, storage-key, or settings changes; flags never persist;
- no remote analytics, player tracking, monetisation tooling, or public
  modding (issue #12 is explicit);
- no mid-run cheat toggling, no cheat UI panel, no production-reachable
  cheats;
- no balance retuning of enemies/weapons/curves (that is playtest output,
  applied later as data diffs);
- no Epic 12 work (pooling, performance passes, polish);
- no changes to Epic 10's audio runtime state (its remainder lands separately
  per D1);
- no new dependencies.

## 4. Curve helpers contract (`src/gameplay/curves.ts`, new)

Pure module; no Phaser; strict finite guards matching the repo's gameplay
style (`enemyScaling`, `stats.resolve` throw on non-finite):

```ts
export function lerp(a: number, b: number, t: number): number;
// a + (b - a) * t. All inputs finite or throw; a non-finite result throws
// (same result guard as growth/linearGrowth — large-but-finite inputs can
// overflow, e.g. lerp(Number.MAX_VALUE, 0, -1) === Infinity). t is
// deliberately NOT clamped: extrapolation is a caller decision (callers
// compose with clamp).

export function clamp(value: number, min: number, max: number): number;
// All inputs finite or throw; min > max throws. Equivalent to
// Math.min(max, Math.max(min, value)).

export function growth(base: number, rate: number, step: number): number;
// base * rate ** step. Inputs finite or throw; non-finite result throws.

export function linearGrowth(base: number, ratePerStep: number, steps: number): number;
// base * (1 + ratePerStep * steps). Inputs finite or throw; non-finite result throws.

export function weightedPick<T>(
  entries: ReadonlyArray<{ item: T; weight: number }>,
  rng: Rng,
): T;
// Thin delegate to rng.weighted (zero/negative weights and empty selection
// keep the existing Rng error behavior — Rng is the single validation
// surface, so no finite-weight guard is added here). Exists so balance
// tables read as curve helpers and call sites stay uniform. Deliberately
// public with no production caller yet (exercised by tests only); reserved
// for future balance-table call sites.
```

Reroutes (all output-identical; pinned by §11 exactness tests):

| Call site | Today | Becomes |
| --- | --- | --- |
| `meta.ts costOf` | `Math.round(base * growth ** level)` | `Math.round(growth(base, rate, level))` — null guards unchanged |
| `enemyScaling.ts scaleEnemy` | `stat * (1 + rate * minutes)` | `linearGrowth(stat, rate, minutes)` — input guards unchanged |
| `xp.ts xpToNext` | `Math.ceil(XP_BASE * XP_GROWTH ** (level - 1))` | `Math.ceil(growth(XP_BASE, XP_GROWTH, level - 1))` |
| `spawnRegion.ts` | private `clamp` | imports `clamp` from `curves.ts`; private copy deleted |

## 5. Aggregate validation contract (`src/systems/validation.ts`)

### 5.1 Structured issue

```ts
export interface ValidationIssue {
  readonly file: string;   // JSON file name, e.g. 'weapons.json'; '(unknown)' fallback
  readonly index: number;  // catalog row index; -1 for file-level errors
  readonly field: string;  // dotted field path, may embed [i]; '' for file-level errors
  readonly message: string;
}

export function validateAllData(): ValidationIssue[];                 // shipped data
export function collectGameDataErrors(raw: unknown): ValidationIssue[]; // injected fixtures
```

`validateAllData()` aggregates over the same imported JSON catalogs
`loadGameData` passes to `validateGameData` and never throws.
`collectGameDataErrors` is the injectable core used by the broken-fixture
tests.

**Root-phase attribution.** `assertGameDataRoot`'s messages are frozen
(§5.3) and carry the aggregate `game-data.` prefix. The collector remaps
catalog-root lines at its boundary (`game-data.enemies: required field` →
`enemies.json`) so issues group by file; lines naming no catalog — unknown
root fields, a non-object aggregate (`game-data: expected object`), the
`audio` pair itself — keep the prefix as a distinct root category. Each
remap pattern requires a separator (`:`, `.`, or `[`) after the catalog
name, so a future root field that prefix-extends a catalog (e.g.
`game-data.weaponsV2`, flaggable by `jsonSafetyErrors` before
`rejectUnknownFields` runs) never mis-remaps to a file name.

### 5.2 Descriptor table (maintainer note from the Epic 0 review)

```ts
interface CatalogDescriptor {
  readonly key: string;          // GameData assembly key ('weapons', …, audio pair)
  readonly file: string;         // 'weapons.json' — used in messages, unchanged
  readonly read: (raw: Record<string, unknown>) => unknown; // locate rows in the aggregate
  readonly validateCatalog: (rows: unknown) => unknown;     // FULL per-file pipeline (throws)
}
```

One `CATALOG_DESCRIPTORS` entry per data file, in today's exact validation
order: weapons, enemies, upgrades, metaUpgrades, spawnCurves, characters,
arenas, lootTables, audio-assets, audio-map. Each descriptor's
`validateCatalog` owns that file's *complete* pipeline — row checks,
uniqueness, and catalog-level assertions — so adding a future file is one
entry (the drift the maintainer flagged: today uniqueness/assembly are
separate edits).

To make that true for the three files whose assertions currently live inline
in `validateGameData`, extract (behavior-identical, newly exported):
`validateWeaponCatalog` (= `validate` + `assertUniqueIds` +
`assertWeaponTiers` + `assertStarterWeapons`), `validateUpgradeCatalog`
(= `validate` + `assertUniqueIds`), and `validateSpawnCurveCatalog`
(= `validate` + `assertUniqueIds` + `assertPlayableSpawnCurves`). The existing
`validateEnemy/MetaUpgrade/Character/Arena/LootTable/AudioAssets/AudioMap`
catalog functions are reused unchanged. Audio descriptors read
`raw.audio.assets` / `raw.audio.map`; the map descriptor keeps the Epic 10
normalized-array round-trip fallback (`validateNormalizedAudioMap` when given
an array).

The extracted validators are **intentionally public**: they are the per-file
pipeline entry points behind the descriptor table, pinned by the focused
tests, and available for future per-file tooling (e.g. a per-file validation
CLI) without widening the descriptor contract.

### 5.3 Throwing boot path — external behavior frozen

`validateGameData` keeps its signature, its throw-on-error contract, its exact
message strings, and its first-error order. Internally it becomes: root-shape
phase (extracted verbatim into an `assertGameDataRoot` helper shared with the
collector) → loop descriptors (each may throw, in descriptor order = today's
order) → the five cross-reference assertions in today's order
(`assertSpawnReferences`, `assertCharacterWeaponReferences`,
`assertArenaSpawnCurveReferences`, `assertEnemyLootTableReferences`,
`assertAudioMapReferences`) → assemble `GameData`. TypeScript's excess/missing
property checking on the assembly literal makes the "returned object" edit
compile-checked, closing the maintainer's third drift point. The entire
existing `tests/validation.test.ts` must pass **unmodified** — it is the pin.

### 5.4 Collecting path

`collectGameDataErrors(raw)`:

1. Root phase: run `assertGameDataRoot` inside try/catch; on failure map the
   lines and stop (root failures mask per-file reads, mirroring boot).
2. Per-file phase: for each descriptor, run `validateCatalog(read(raw))`
   inside try/catch and collect. A bad file therefore never aborts later
   files (issue #12's requirement).
3. Cross-reference phase: only when the per-file phase produced **zero**
   issues (the assertions require successfully typed catalogs), run the five
   assertions, each in its own try/catch, and collect.

Line mapping at the boundary (validators keep returning today's strings):

- strip the `Invalid game data:\n` prefix, split remaining lines;
- `file[index].field: message` → `{ file, index, field, message }`;
- `file: message` → `{ file, index: -1, field: '', message }`;
- `file[index]: message` → `{ file, index, field: '', message }`;
- anything else → `{ file: '(unknown)', index: -1, field: '', message: line }`.

Field paths keep their nested form (`spawnRegions[1].kind`,
`waves[0].enemyId`); the message is the text after the first `': '`.
Multi-line thrown messages map line-by-line.

## 6. Developer cheats contract (`src/systems/debug.ts`)

### 6.1 Flags and parsing

```ts
export interface DebugFlags {
  readonly enabled: boolean;
  readonly godMode: boolean;
  readonly xpMultiplier: number;     // neutral 1
  readonly scrapMultiplier: number;  // neutral 1
  readonly spawnMultiplier: number;  // neutral 1
}

export const DEFAULT_DEBUG_FLAGS: DebugFlags; // all off / neutral

export function readDebugFlags(search: string): DebugFlags;  // pure; never throws
export function getDebugFlags(): DebugFlags;                  // cached; prod-inert
export function debugCheatsActive(flags: DebugFlags, isDev?: boolean): boolean;
```

URL schema (development builds only): `?cheats=1` is the master switch;
`god=1`; `xp=<0.1..100>`; `scrap=<0.1..100>`; `spawn=<1..20>`. Unknown params
are ignored; missing, non-numeric, or out-of-range values fall back to that
field's default — parsing never throws and never rejects the boot.
`getDebugFlags()` parses `globalThis.location?.search` once and caches it; in
non-dev builds it returns `DEFAULT_DEBUG_FLAGS` without reading the location
(§2.8). `debugCheatsActive(flags, isDev = RuntimeConfig.isDev)` is the single
gate; the explicit parameter keeps both branches unit-testable.

### 6.2 Application seams — no gameplay branches

```ts
export const DEBUG_CHEAT_SOURCE = 'debug:cheats';

export function debugCheatModifiers(flags: DebugFlags): Modifier[];
// xpMultiplier !== 1  -> { stat: 'xpGain',       op: 'mult', value, sourceId: DEBUG_CHEAT_SOURCE }
// scrapMultiplier !== 1 -> { stat: 'currencyGain', op: 'mult', value, sourceId: DEBUG_CHEAT_SOURCE }

export function scaleSpawnCurveIntervals(
  curve: Readonly<SpawnCurveDefinition>, multiplier: number,
): SpawnCurveDefinition;
// multiplier <= 1 -> returns the SAME reference (identity fast path).
// Otherwise shallow-copies curve and waves with
// spawnEveryMs -> max(1, Math.round(spawnEveryMs / multiplier)).
// Ids, startSecond, maxAlive, durationSeconds, scaling untouched (§2.6).

export class DebugCheatSystem implements System {
  constructor(options: { runState: RunState; player: Player; flags: DebugFlags });
  // applies debugCheatModifiers to runState.stats; one console.info line
  // listing the active cheats.
  update(dtMs: number): void; // godMode && run active -> player.health = player.maxHealth
  destroy(): void;            // stats.remove(DEBUG_CHEAT_SOURCE); idempotent
}
```

Why this shape:

- XP/scrap ride the existing `xpGain`/`currencyGain` resolutions (§2.5) —
  `xp:gained`, `level:up`, `drop:collected`, and `currency:changed` payloads
  all reflect the multiplier for free, keeping overlay and summary honest.
- God mode is the §2.4 refill, not a stat.
- Spawn rate is the §2.6 construction-time curve copy; the victory-duration
  and HUD read of the curve keep the **original** object (durations are
  identical either way, but the original is the one true source).
- Cheats never write `MetaState`, never persist, and end with the run.
  End-of-run banking is unaffected (it reads `RunState.currency`, which the
  multiplier legitimately inflated during the dev run — documented, accepted:
  cheats are unreachable outside dev, and dev saves are disposable).

### 6.3 GameScene wiring (all gated on `debugCheatsActive(flags)`)

1. After `prepareRun`: nothing — the system applies modifiers.
2. `SpawnSystem` receives `scaleSpawnCurveIntervals(curve, flags.spawnMultiplier)`
   when active (identity otherwise); `this.spawnCurve` keeps the original.
3. `DebugCheatSystem` is constructed and pushed into the `systems` array
   (automatic teardown via the existing `handleShutdown` loop).

## 7. Debug overlay metrics contract

`DebugOverlay` keeps its API (`update(lines)`, F3 toggle) and its read-only
character; it is not dev-gated (status quo, D4). The extension is data the
caller passes:

```ts
// src/gameplay/metrics.ts — pure, no Phaser
export interface DpsMeter {
  record(amount: number, atMs: number): void;       // drops non-finite or negative samples
  windowDps(nowMs: number): number;                 // rolling window; non-finite nowMs -> 0
  readonly totalDamage: number;                     // lifetime sum for the run summary
}
export function createDpsMeter(windowMs?: number): DpsMeter; // default 5000
```

Forgiving-by-design (dev tooling must never kill a run): invalid samples are
dropped, never thrown. Samples are timestamped with `runState.timeMs` at
event time, keeping the meter deterministic under the repo's time-source
rule.

`GameScene` owns one meter, feeds it from an `enemy:damaged` subscription
(unsubscriber joins the existing `unsubscribers` array), and adds lines:
`Projectiles: <projectileGroup.getLength()> Drops: <dropGroup.getLength()>`
and `DPS(5s): <windowDps(runState.timeMs), 1 decimal>`. Hidden overlay = no
rendering work (existing early return); the subscription cost is one array
push per damage event, unconditional in all builds (keeps prod/dev output
identical when the overlay is opened).

## 8. Playtest summary contract (`src/systems/playtestSummary.ts`, new)

```ts
export class PlaytestSummarySystem implements System {
  constructor(options: {
    runState: RunState;
    bus: EventBus;
    dpsMeter: DpsMeter;
    logger?: Pick<Console, 'info' | 'table'>; // defaults to console; injected in tests
  });
  update(dtMs: number): void; // no-op
  destroy(): void;            // unsubscribes; idempotent
}
```

- Subscribes `run:won` and `run:lost`; prints **exactly once per run** (first
  terminal event wins; a `printed` guard, not a WeakSet — one instance exists
  per run).
- Output, local only (no network, no PII):
  1. `logger.info('[playtest] run summary')`;
  2. `logger.table([row])` where `row = { outcome, time, timeMs, level,
     kills, currency, avgDps, upgradesTaken }`: `outcome` from
     `runState.outcome`, `time` formatted `m:ss` by a two-line local helper
     (systems must not import from `ui/`), `timeMs` raw, `avgDps =
     totalDamage / max(1, timeMs / 1000)` rounded to 1 decimal, and
     `upgradesTaken = sum of upgradeStacks values`;
  3. `logger.table(runState.upgradeStacks)` only when at least one card was
     taken (per-id stack counts render directly).
- Constructed in `GameScene` only when `RuntimeConfig.isDev`, after
  `ProgressionSystem`, and pushed into `systems` for automatic teardown. Not
  constructed in production builds (D3).

## 9. Scene integration summary

`GameScene.ts` gains four wiring points and no logic: flag read + gate (§6),
scaled-curve selection for `SpawnSystem` (§6.3), meter construction,
subscription, and two overlay lines (§7), dev-gated summary construction (§8).
Everything else — BootScene, MenuScene, controllers, views, systems — is
untouched. The scene remains a composition root; no constants move into it.

## 10. Single-branch slice plan

All work stays on `agent/epic-11-balancing-and-developer-tooling`. Commit
each slice before beginning the next; every slice keeps lint, the full suite,
and the build green.

| Slice | Outcome | Create / modify | Focused gate |
| --- | --- | --- | --- |
| 1. Curve helpers | `curves.ts` per §4; four reroutes, output-identical | `gameplay/curves.ts` (new), `gameplay/enemyScaling.ts`, `gameplay/meta.ts`, `gameplay/xp.ts`, `gameplay/spawnRegion.ts`; `tests/curves.test.ts` (new), exactness pins in existing scaler test files | focused tests + typecheck; **no behavior change** |
| 2. Aggregate validation | Descriptor table + extracted catalogs per §5.2–5.3; `validateAllData`/`collectGameDataErrors` per §5.4 | `systems/validation.ts`; `tests/validateAllData.test.ts` (new); `tests/validation.test.ts` passes **unmodified** | focused tests + full suite |
| 3. Debug flags and cheats | Flags/parsing/gate, modifiers, curve scaler, `DebugCheatSystem`; GameScene wiring per §6 | `systems/debug.ts`, `scenes/GameScene.ts`; `tests/debugCheats.test.ts` (new) | focused tests + full suite |
| 4. Overlay metrics | `DpsMeter`; GameScene meter + subscription + lines per §7 | `gameplay/metrics.ts` (new), `scenes/GameScene.ts`; `tests/metrics.test.ts` (new) | focused tests + full suite |
| 5. Playtest summary and closeout | `PlaytestSummarySystem` per §8; tuning note; docs status; §16 record | `systems/playtestSummary.ts` (new), `scenes/GameScene.ts`, `docs/balancing/data-driven-balancing.md`, `docs/epics.md`, `docs/architecture.md`, `docs/roadmap.md`, `docs/knowledge-graph.md`, this document; `tests/playtestSummary.test.ts` (new) | full test/lint/build/diff gate + manual matrix |

A later slice may correct an earlier contract defect on the same branch, but
it must not redesign shipped validators or broaden into Epic 10 remainder or
Epic 12 work.

## 11. Test and validation matrix

### Pure and unit tests

| Area | Required evidence |
| --- | --- |
| `lerp` | endpoints, midpoint, `t` outside [0, 1] extrapolates, non-finite inputs throw, overflowed (non-finite) result throws |
| `clamp` | inside/below/above, min > max throws, non-finite throws |
| `growth` | `rate ** step` exactness (e.g. `growth(2, 2, 10) === 2048`), step 0 = base, fractional step, non-finite result throws |
| `linearGrowth` | zero rate = base, negative rate allowed, matches `base * (1 + r * s)` exactly |
| `weightedPick` | delegates to `rng.weighted` (spy), propagates the empty-selection error |
| Scaler exactness | `costOf` table for every shipped meta-upgrade level unchanged; `scaleEnemy` outputs identical to the inline reference formula across a time sweep; `xpToNext` levels 1–10 unchanged |
| `validateAllData` | shipped data returns `[]`; two broken catalogs both report (no abort); `{file, index, field, message}` mapping incl. nested field paths; file-level error → `index: -1, field: ''`; unparseable line → `(unknown)` fallback |
| Collecting phases | cross-refs skipped when a per-file phase is dirty; clean catalogs + dangling `enemyId` wave → attributed cross-ref issue; root failure masks per-file phase; root-phase catalog lines remap to JSON file names (`game-data.enemies` → `enemies.json`) while lines naming no catalog keep the `game-data.` prefix |
| Boot regression | `tests/validation.test.ts` passes unmodified; multiple-bad-files input still throws the weapons error first (order pin) |
| `readDebugFlags` | empty/missing params → defaults; master switch alone → enabled, neutral values; each param parses; invalid/out-of-range/non-numeric → per-field default; never throws |
| `debugCheatsActive` | `enabled && isDev` true; either false → false (both `isDev` branches via the explicit parameter) |
| `debugCheatModifiers` | neutral flags → `[]`; non-neutral → exact modifier set under `DEBUG_CHEAT_SOURCE`; applied then removed via `ModifierStack.countBySource` |
| Cheat effect path | `applyXp` with the XP modifier applied yields the multiplied gain and multiplied `xp:gained` payload |
| `scaleSpawnCurveIntervals` | multiplier <= 1 returns the same reference; scaled intervals are integers >= 1; ids/`maxAlive`/`durationSeconds`/`scaling` untouched; `createSpawnDirector` accepts the scaled shipped curve; faster intervals still satisfy first-due-before-end |
| `DebugCheatSystem` | god refill each update while active only; no refill when run paused/won/lost; `destroy` removes modifiers and is idempotent |
| `DpsMeter` | window sum/window length, pruning of expired samples, non-finite/negative samples dropped, `totalDamage` accumulation, non-finite `nowMs` → 0 |
| `PlaytestSummarySystem` | prints exactly once on the first of `run:won`/`run:lost`; row fields (incl. `avgDps` guard at `timeMs` 0); upgrade table printed only when stacks exist; nothing after `destroy`; injected logger captures all calls |

### Manual playtest matrix (browser, required before §12 sign-off)

| Check | Expected |
| --- | --- |
| `npm run dev`, open F3 mid-run | FPS, enemy/projectile/drop counts, run time/level/kills, rolling DPS all live |
| `?cheats=1&god=1&xp=4&scrap=3&spawn=2` | one `[cheats]` info line; damage numbers don't end the run; XP/scrap visibly multiplied; spawn pressure visibly higher (caps still bind) |
| `?cheats=1` alone | master gate on, all cheats neutral — gameplay indistinguishable from default |
| `?god=1` without `cheats=1` | nothing happens |
| End a dev run (F9 or natural) | one `[playtest] run summary` + tables in the console; Retry prints again exactly once |
| `npm run build && npm run preview`, repeat all cheat URLs | no cheat effect, no summary, no console noise; F3 overlay still works (status quo) |
| Locally break a shipped JSON value, `npm test`, revert | `validateAllData` test fails with the correct file/field attribution |

### Commands

```bash
npm test -- --run \
  tests/curves.test.ts \
  tests/validateAllData.test.ts \
  tests/debugCheats.test.ts \
  tests/metrics.test.ts \
  tests/playtestSummary.test.ts \
  tests/validation.test.ts \
  tests/enemyScaling.test.ts \
  tests/meta.test.ts \
  tests/xp.test.ts \
  tests/spawnRegion.test.ts
npm test
npm run lint
npm run build
git diff --check
```

Adjust focused filenames only if implementation chooses the same contracts
under equivalently named test files. The full gate is mandatory.

## 12. Global acceptance criteria

- [ ] `validateAllData()` returns `[]` for shipped data in CI; a deliberately
      broken fixture returns structured, correctly attributed issues from
      every bad file without aborting; cross-references never run on dirty
      catalogs.
- [ ] `validateGameData` boot behavior is byte-identical (messages, throw
      order); `tests/validation.test.ts` passes unmodified; adding a data
      file is one descriptor entry.
- [ ] `curves.ts` owns the five helpers; `costOf`/`scaleEnemy`/`xpToNext`/
      spawn-region clamping route through them with pinned identical outputs.
- [ ] Cheats are off by default, parse only in development builds, apply as
      `debug:cheats` modifiers / a scaled curve copy / a dev-system health
      refill, and leave zero branches in `engine/`, `gameplay/`, or
      `entities/`.
- [ ] Production build with dev off: no cheat is reachable by any URL, the
      summary never prints, and cheat code is statically gated behind
      `import.meta.env.DEV`.
- [ ] Overlay shows FPS, enemy/projectile/drop counts, run time/level/kills,
      and rolling DPS; it changes nothing it reads.
- [ ] Dev runs end with exactly one `console.table` playtest summary
      containing outcome, time, level, kills, currency, upgrades taken, and
      average DPS. No network, no PII.
- [ ] No new bus events, no payload changes, no new `StatKey`, no save-schema
      change, no shipped data retuning, no new dependencies;
      `engine/`/`gameplay/` stay Phaser-free.
- [ ] Baseline 934 tests / 68 files plus new tests, `npm run lint`,
      `npm run build`, and `git diff --check` are green.
- [ ] Manual matrix (§11) is recorded honestly, including the production
      preview run.

## 13. Reviewer traps

- Do not change any validation message string, the throw site, or the
  first-error order in `validateGameData`; `tests/validation.test.ts` pins
  them. In particular do not extend the catalog remap inside
  `assertGameDataRoot` beyond the `jsonSafetyErrors` lines it already
  covers (frozen boot behavior, §5.3) — the collector applies the same
  remap to the remaining root lines at its own boundary (§5.1/§5.4), and
  root lines naming no catalog keep the `game-data.` prefix by design.
- Do not let `validateAllData` throw, and do not run cross-reference
  assertions when any catalog failed — they require typed rows.
- Do not route `scaleEnemy` through `growth`; its linear formula is the
  shipped balance curve (§2.2).
- Do not add a god-mode, multiplier, or spawn-rate branch to `Player`,
  `xp.ts`, `DropSystem`, `SpawnSystem`, or `spawnDirector` — the modifier,
  curve-copy, and refill seams exist precisely to avoid them.
- Do not add an `armor`-based or invulnerability-stat god mode; `armor` is
  unresolved dead weight today (§2.4) and Epic 11 adds no `StatKey`.
- Do not rebuild or mutate the spawn director mid-run; scaling happens once,
  on a copy, before `SpawnSystem` construction (§2.6).
- Do not persist flags, write `MetaState`, or touch the save path; dev-run
  inflated currency banking is accepted and documented (§6.2) but nothing
  may *target* it.
- Do not read `Date.now()`, `performance.now()`, or `scene.time` for metrics;
  samples are stamped with `runState.timeMs`.
- Do not dev-gate the F3 overlay (status quo, D4) — and do not forget that
  the summary and cheats *are* dev-gated.
- Do not let the playtest summary print twice for one run, print after
  `destroy`, or import formatters from `ui/`.
- Do not retune shipped JSON values in this epic; tuning outputs land as
  separate data diffs informed by these tools.
- Do not implement the Epic 10 remainder here (D1), do not start Epic 12
  pooling, and do not add dependencies.
- Do not open slice branches or slice PRs. This epic is explicitly one branch
  and one delivery PR.

## 14. Implementation-agent handoff

Use this prompt after the architecture commit is present on the remote branch:

> Implement Epic 11 Balancing and Developer Tooling in
> `/Users/jonathanlim/Documents/GitHub/Meowcenary` on the existing branch
> `agent/epic-11-balancing-and-developer-tooling`. The entire epic stays on
> this one branch. Do not create another branch or PR.
>
> Read `docs/knowledge-graph.md`, `docs/epics.md`, and
> `docs/architecture/epic-11-balancing-and-developer-tooling.md` in full
> before editing. The architecture document is authoritative and supersedes
> issue #12 where §2 says the issue is stale (notably: `scaleEnemy` stays
> linear; god mode is a dev-system refill, not a modifier).
>
> Implement the five slices in §10 sequentially. Commit each green slice on
> the same branch. Preserve all existing gameplay, validation, save, and UI
> contracts. In particular: `validateGameData` messages and throw order are
> byte-frozen; cheats apply only through the `debug:cheats` modifier
> namespace, a construction-time curve copy, and the `DebugCheatSystem`
> refill; everything cheat-related is gated behind `import.meta.env.DEV` plus
> the master flag; no new events, no new `StatKey`, no shipped data changes.
>
> Use the exact contracts in §§4–9, the tests in §11, and the reviewer traps
> in §13. If a contract conflicts with current code, stop that slice and
> report the exact file/symbol mismatch rather than inventing a compatibility
> layer.
>
> After every slice run its focused tests and `npm run lint`. Before handoff
> run the full suite, production build, `git diff --check`, and the §11 manual
> matrix (including the production preview run and the break-a-JSON run).
> Report exact counts, commit SHAs, any unrun browser checks, and any
> deviations. Do not mark Epic 11 complete in docs until every §12 criterion
> has evidence.

## 15. Review and hardening handoff

Use this prompt after the implementation commits are present on the same
branch:

> Review and harden Epic 11 on
> `agent/epic-11-balancing-and-developer-tooling`; do not create another
> branch or PR. Diff from the architecture baseline `8985d52` and read
> `docs/architecture/epic-11-balancing-and-developer-tooling.md` in full.
>
> Treat this as an evidence-led architecture conformance review, not a
> redesign. Prioritize: `validateGameData` byte-identical behavior (run the
> unmodified `validation.test.ts`); descriptor/validator drift (every file's
> uniqueness and catalog assertions actually inside its descriptor);
> collector grammar edge cases (nested fields, file-level lines, multi-line
> errors); output identity of the four curve reroutes; cheat reachability in
> a production build (inspect the built bundle for cheat strings);
> modifier cleanup on scene shutdown/restart; director invariants on scaled
> curves; summary exactly-once semantics across win, lose, and Retry.
>
> Run the §11 focused/full gates independently. Add mutation-style regression
> tests for any invariant that can be broken while the suite stays green. You
> may fix confirmed defects only within the Epic 11 files/tests listed in
> §10; preserve correct work and do not broaden into the Epic 10 remainder or
> Epic 12.
>
> For each finding, record the causal code path, user-visible effect, fix,
> and validation. End with exact test/build counts, the reviewed head SHA,
> remaining manual checks, and a clear ready/not-ready verdict against §12.
> Do not mark docs complete if browser or preview-build evidence is missing.

## 16. Final delivery record

At implementation completion, replace this section with:

- the final branch head and delivery PR number;
- slice commit SHAs;
- exact test/file count, lint/typecheck, build, and diff-check results;
- hosted CI results;
- manual matrix evidence (including the production preview and
  break-a-JSON runs);
- any explicitly deferred product limitations;
- issue #12 closure evidence.

Until then, the status remains **implementation-ready architecture**, not
Epic 11 complete.

## 17. Decisions — resolved by the maintainer (2026-08-10)

All four decision points are resolved; the frozen contracts in §§2–9 stand as
written.

- **D1 — Epic 10 remainder: scheduled.** PR #65 merged slices 1–2 only
  (§2.11). The remaining slices (context/scene wiring, `ui:*` emission,
  placeholder assets) are tracked in issue #67 and ship as the **next
  delivery PR immediately after this one**, ahead of Epic 12. Epic 11 does
  not depend on it.
- **D2 — Confirmed.** Cheat toggling is boot-time only (URL params, no
  mid-run switch; §2.7). If mid-run toggling is wanted later, it is a small
  additive extension to `DebugCheatSystem` (modifier reconciliation),
  explicitly not in this epic.
- **D3 — Confirmed.** The playtest summary prints in development builds
  only; preview/production builds stay silent.
- **D4 — Confirmed.** The F3 debug overlay remains reachable in production
  builds (status quo).
