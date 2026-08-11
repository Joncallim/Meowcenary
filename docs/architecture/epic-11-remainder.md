# Epic 11 Remainder — Issue #69 Architecture and Implementation Handoff

Status: **implementation-ready architecture** for Issue #69. This is the
architecture work package for the single delivery branch
`agent/epic-11-remainder`. All implementation, review fixes, evidence, and
documentation closeout for Epic 11 slices 3–5 must be appended to that branch
and its one delivery PR.

Architecture baseline: `main` at
`025a20832e04b2a7ba069768bd26c13264784ac7` (Epic 10 completed in PR #68;
1040 tests / 73 files reported green in that delivery record).

Issue scope: [#69](https://github.com/Joncallim/Meowcenary/issues/69).

## Authority

- [`epic-11-balancing-and-developer-tooling.md`](epic-11-balancing-and-developer-tooling.md)
  remains authoritative for Epic 11's overall outcome, the delivered curve and
  aggregate-validation contracts, and the maintainer decisions recorded there.
- This document is the executable source of truth for **remaining slices 3–5**
  and supersedes the older document's §§6–17 wherever wording differs.
- PR #66 is the delivered source of truth for slices 1–2. Do not reimplement,
  rename, or opportunistically refactor those contracts.
- The live repository at the baseline above wins over stale line numbers and
  old sequencing notes. In particular, Epic 10 is now complete and its
  `GameScene` audio lifecycle must be preserved exactly.
- Issue #69 describes the required outcomes. This document freezes the
  implementation choices so the implementation agent does not need to perform
  another design pass.

## 1. Outcome

Complete Epic 11 without changing normal-player balance or production
progression:

1. Development-only URL flags enable god-mode refill, XP/scrap multipliers,
   and faster spawn cadence through existing seams.
2. F3 shows projectile/drop counts and deterministic rolling DPS in addition
   to the existing run information.
3. Development runs print one local, structured playtest summary when the run
   first reaches `won` or `lost`.
4. The tuning guide explains exactly which data files to edit and how to use
   the new tools.
5. The full automated, browser, preview-build, and bundle-inspection evidence
   is recorded before Epic 11 is marked complete.

The implementation is intentionally mechanical. Follow the symbols, order,
tests, and commit gates below. Do not perform a fresh architecture pass during
implementation.

## 2. Live repository findings and frozen corrections

### 2.1 Slices 1–2 are complete; several status lines are not

PR #66 delivered:

- `src/gameplay/curves.ts` and behavior-identical reroutes;
- descriptor-driven, two-phase aggregate validation;
- `validateAllData()` / `collectGameDataErrors()`;
- structured `ValidationIssue` mapping;
- the effective-damage meaning of `enemy:damaged.amount`;
- focused regression tests.

At the architecture baseline, `docs/epics.md`, `docs/roadmap.md`, and
`docs/knowledge-graph.md` overstate PR #66 as the whole Epic 11. This
architecture commit corrects the roadmap and adds the remainder pointers;
completion claims that remain in `docs/epics.md` or `docs/knowledge-graph.md`
are stale until Slice 5 replaces them with final delivery evidence.

### 2.2 Epic 10 is complete and shares the composition root

PR #68 added the Boot-owned, game-scoped `AudioManager`, scene music selection,
first-gesture unlock listeners, `ui:*` command events, and deterministic audio
assets. Current `GameScene` invariants that must survive every slice:

- `audioManager` remains a non-owning scene cache;
- `audioManager.update(delta)` remains immediately after the systems update
  block and before presentation updates;
- shutdown removes unlock listeners and clears the field, but never destroys
  the manager;
- `handlePauseKey` remains the accepted-command `ui:confirm` / `ui:back`
  dispatch point;
- F8/F9/F10 remain development-only.

No Epic 11 edit may reorder, fold, or “simplify” those seams.

### 2.3 `debug.ts` currently owns only the F3 overlay

`src/systems/debug.ts` contains `DebugOverlay` and imports Phaser. Slice 3 adds
the flags, pure helpers, and `DebugCheatSystem` to the same module so the
repository keeps one debug ownership surface. Tests for the pure exports must
mock Phaser with the same minimal Vitest style used by
`tests/gameSceneAudio.test.ts`; do not move the contracts merely to avoid that
mock.

### 2.4 Production gating must occur at the call site

`RuntimeConfig.isDev` is backed by `import.meta.env.DEV`, but a call that is
made unconditionally and merely returns neutral flags is weaker than the
required production reachability guarantee.

Frozen rule:

- `getDebugFlags`, `DebugCheatSystem`, and `PlaytestSummarySystem` are reached
  from branches whose condition contains **direct**
  `import.meta.env.DEV`;
- the build is inspected for sentinel strings after Vite/Rollup tree-shaking;
- production preview URLs cannot activate cheats or the summary.

`RuntimeConfig.isDev` may remain the existing gate for F8/F9/F10. New cheat
and summary construction uses direct `import.meta.env.DEV`.

### 2.5 XP and scrap already have exact modifier seams

`applyXp` resolves `xpGain`; `DropSystem.applyScrapGrant` resolves
`currencyGain`. Slice 3 adds `mult` modifiers under one source ID and changes
neither module. Resulting `xp:gained`, `level:up`, `currency:changed`, and
run-summary values remain truthful automatically.

### 2.6 Spawn cadence is fixed when `SpawnSystem` is constructed

`createSpawnDirector` snapshots the supplied curve and builds cadences from
`spawnEveryMs`. Faster spawning therefore uses a non-mutating curve copy made
before `SpawnSystem` construction. The original curve remains authoritative
for HUD/victory duration and stays in `this.spawnCurve`.

Only `spawnEveryMs` changes. `maxAlive`, wave start times, duration, scaling,
IDs, and ordering remain untouched. Pressure will still saturate at existing
`maxAlive` caps; that is accepted and documented.

### 2.7 God mode is a refill, not invulnerability

`armor` is not resolved by `Player`; adding a new stat or damage branch would
violate the epic boundary. `DebugCheatSystem` refills the public
`player.health` to `player.maxHealth` once per active update.

Accepted limitation: a single lethal hit can still end the run before the
refill system updates. Do not modify `Player.takeDamage`,
`takeEnvironmentalDamage`, `endRun`, or collision handlers to remove this
edge.

### 2.8 Effective damage is already the DPS event contract

`Enemy.takeDamage` now emits the health actually removed, capped at remaining
health. Slice 4 subscribes to that existing event and adds no event or payload
change. Keep the comments and regression coverage in `eventBus.ts`,
`Enemy.ts`, `enemy.test.ts`, and `weaponSystem.test.ts`.

### 2.9 The run clock is the only metrics clock

Damage samples are stamped with `runState.timeMs`. Do not use `Date.now()`,
`performance.now()`, Phaser scene time, `_time`, or audio-manager time.
`runState.timeMs` pauses with the run, so the rolling DPS window also pauses
rather than decaying while a chooser/pause panel is open.

### 2.10 System/listener order is observable

`ProgressionSystem` subscribes to terminal events in its constructor and must
remain constructed before `PlaytestSummarySystem`. This preserves the current
“bank first, then observe/print” listener order.

Within the update array, `DebugCheatSystem` belongs after damage-producing
gameplay systems and before `HudController`, so a non-lethal hit is refilled
before the HUD reads health that frame. `PlaytestSummarySystem.update` is a
no-op and may sit last.

### 2.11 Do not fake the whole Phaser composition root in tests

`GameScene.create` is intentionally broad. Pure contracts receive direct unit
tests; scene placement is pinned by focused typed-seam tests where practical,
source review, and the mandatory browser matrix. Do not construct a brittle
parallel fake of every registry, physics group, UI view, and system only to
assert one constructor line.

### 2.12 No balance values change in this issue

The tools make tuning easier; Issue #69 does not perform the tuning. No
`src/data/*.json`, XP constants, enemy curves, weapon values, upgrade effects,
or economy values change. Future playtest-informed tuning lands as separate,
small data diffs.

## 3. Scope and non-goals

### In scope

- `src/systems/debug.ts`
- `src/gameplay/metrics.ts` (new)
- `src/systems/playtestSummary.ts` (new)
- `src/scenes/GameScene.ts`
- `tests/debugCheats.test.ts` (new)
- `tests/metrics.test.ts` (new)
- `tests/playtestSummary.test.ts` (new)
- focused scene-seam coverage only when it does not duplicate `GameScene.create`
- `docs/balancing/data-driven-balancing.md`
- Epic 11 status, architecture, roadmap, and delivery-record documentation

### Explicitly out of scope

- changes to slices 1–2 implementation or their public contracts;
- validation-message, validation-order, descriptor, or curve-formula changes;
- new events, event payload fields, `StatKey`s, save fields, migrations, or
  storage keys;
- branches in `Player`, `xp.ts`, `DropSystem`, `SpawnSystem`, or
  `spawnDirector` for cheats;
- mid-run cheat toggles or a cheat UI;
- production analytics, network calls, telemetry, PII, or persisted flags;
- hiding/removing the production-reachable F3 overlay;
- balance retuning;
- audio/UI lifecycle changes;
- Epic 12 pooling, feedback, animation, or performance work;
- new dependencies or package scripts.

## 4. Branch protocol and pre-implementation gate

All work remains on `agent/epic-11-remainder` and one delivery PR.

Before Slice 3 implementation:

1. Confirm the branch contains this architecture commit and is based on
   `025a20832e04b2a7ba069768bd26c13264784ac7` or a clean fast-forward of later
   `main`.
2. If `main` advanced, merge or rebase only before implementation, record the
   new baseline in §16, and re-audit the named seams. Do not force-push a
   shared implementation branch.
3. Run:
   ```bash
   npm ci
   npm test
   npm run lint
   npm run build
   git diff --check
   ```
4. Record exact baseline test/file counts.
5. Confirm:
   - `src/systems/debug.ts` still contains only `DebugOverlay`;
   - `src/gameplay/metrics.ts` and
     `src/systems/playtestSummary.ts` do not exist;
   - `GameScene` still has the audio field/helpers/update call and F8/F9/F10;
   - `GameScene.systems` is destroyed in `handleShutdown`;
   - `enemy:damaged.amount` still means effective damage;
   - `xpGain` and `currencyGain` are still resolved at the existing seams;
   - `createSpawnDirector` still snapshots its curve at construction;
   - slices 1–2 focused tests are green.

If a named seam is materially absent, stop that slice and report the exact
file/symbol mismatch. Do not invent an adapter or redesign the epic.

## 5. Final ownership and runtime flow

```text
GameScene.create
  original arena spawn curve
    -> direct DEV gate
      -> cached URL flags
      -> optional copied faster-cadence curve
  prepareRun
    -> Player
    -> ProgressionSystem subscribes first
    -> optional DebugCheatSystem applies xp/scrap modifiers
    -> SpawnSystem receives original or copied curve
    -> gameplay systems
    -> optional DebugCheatSystem update before HUD
    -> HudController
    -> optional PlaytestSummarySystem subscribes after ProgressionSystem
  DpsMeter
    -> enemy:damaged subscription stamped with runState.timeMs
  startRun

GameScene.update
  tickRun
  -> victory/pause sync
  -> player
  -> systems
  -> audioManager
  -> controls
  -> F3 lines incl. group counts and DpsMeter.windowDps

first terminal event
  ProgressionSystem banks
  -> existing player-facing summary listeners
  -> DEV PlaytestSummarySystem prints once

GameScene.shutdown
  remove scene bus subscriptions (incl. DpsMeter)
  -> destroy scene systems (removes debug modifiers + summary listeners)
  -> destroy player/UI/overlay
  -> clear DpsMeter and scene fields
  -> retain Boot-owned AudioManager
```

Ownership table:

| Owner | Owns | Must not own |
| --- | --- | --- |
| `systems/debug.ts` | F3 view, URL flag parsing/cache, cheat modifiers, curve-copy helper, refill system | player damage rules, persistence, tuning |
| `gameplay/metrics.ts` | pure rolling DPS state and lifetime damage total | event subscription, Phaser, rendering |
| `systems/playtestSummary.ts` | terminal subscriptions and local console snapshot | player-facing run summary, persistence, analytics |
| `scenes/GameScene.ts` | composition, event wiring, system order, overlay strings | formulas or duplicated gameplay rules |
| `docs/balancing/...` | tuning workflow and field map | recommended balance changes in this issue |

## 6. Slice 3 — debug flags and cheats

### 6.1 Public contracts in `src/systems/debug.ts`

Append these exports without changing `DebugOverlay`'s API or F3 behavior:

```ts
export interface DebugFlags {
  readonly enabled: boolean;
  readonly godMode: boolean;
  readonly xpMultiplier: number;
  readonly scrapMultiplier: number;
  readonly spawnMultiplier: number;
}

export const DEFAULT_DEBUG_FLAGS: DebugFlags;

export function readDebugFlags(search: string): DebugFlags;
export function getDebugFlags(): DebugFlags;
export function debugCheatsActive(
  flags: DebugFlags,
  isDev?: boolean,
): boolean;

export const DEBUG_CHEAT_SOURCE = 'debug:cheats';

export function debugCheatModifiers(
  flags: DebugFlags,
): Modifier[];

export function scaleSpawnCurveIntervals(
  curve: Readonly<SpawnCurveDefinition>,
  multiplier: number,
): SpawnCurveDefinition;

export interface DebugCheatSystemOptions {
  readonly runState: RunState;
  readonly player: Player;
  readonly flags: DebugFlags;
  readonly logger?: Pick<Console, 'info'>;
}

export class DebugCheatSystem implements System {
  constructor(options: DebugCheatSystemOptions);
  update(dtMs: number): void;
  destroy(): void;
}
```

Required imports are limited to Phaser, `RuntimeConfig` only if still needed by
`DebugOverlay` (it currently is not), `System`, `Modifier`, `RunState`,
`Player`, and `SpawnCurveDefinition`. Do not import save/context/audio/UI
modules.

### 6.2 Immutable defaults and parser grammar

`DEFAULT_DEBUG_FLAGS` is one frozen object:

```ts
Object.freeze({
  enabled: false,
  godMode: false,
  xpMultiplier: 1,
  scrapMultiplier: 1,
  spawnMultiplier: 1,
});
```

Development URL schema:

```text
?cheats=1&god=1&xp=4&scrap=3&spawn=2
```

Frozen parsing rules:

1. Construct `new URLSearchParams(search)`.
2. `cheats` is enabled only when the first value is exactly `"1"`.
3. When `cheats !== "1"`, return `DEFAULT_DEBUG_FLAGS` immediately. Other
   parameters are inert and are not preserved in the returned object.
4. `godMode` is true only when `god === "1"`.
5. `xp` and `scrap` accept finite numeric values in inclusive range
   `[0.1, 100]`.
6. `spawn` accepts finite numeric values in inclusive range `[1, 20]`.
7. Missing, empty, non-numeric, infinite, or out-of-range numeric values fall
   back only that field to `1`.
8. Use `Number(raw)`, not `parseFloat`; partial values such as `"2x"` are
   invalid.
9. Unknown parameters are ignored. Duplicate parameters use
   `URLSearchParams.get` semantics (first value).
10. Return a new frozen object when enabled.
11. `readDebugFlags` never throws for a string input.

No aliases (`true`, `yes`, `on`), comma-separated forms, localStorage values,
or hash parameters are supported.

### 6.3 Session cache and production inertness

Module state:

```ts
let cachedDebugFlags: DebugFlags | undefined;
```

`getDebugFlags()`:

```ts
if (!import.meta.env.DEV) {
  return DEFAULT_DEBUG_FLAGS;
}
cachedDebugFlags ??= readDebugFlags(globalThis.location?.search ?? '');
return cachedDebugFlags;
```

The function reads the location at most once per loaded page in development
and never reads it in production. Do not export a cache-reset production API.
Tests that need a fresh cache use `vi.resetModules()` plus `vi.stubGlobal`.

`debugCheatsActive(flags, isDev = import.meta.env.DEV)` returns exactly
`isDev && flags.enabled`. The explicit argument exists only to test both
branches. It does not inspect whether individual values are neutral.

### 6.4 Modifier generation

`debugCheatModifiers(flags)` is pure:

- return `[]` when `flags.enabled` is false;
- add an XP modifier only when `xpMultiplier !== 1`:
  ```ts
  {
    stat: 'xpGain',
    op: 'mult',
    value: flags.xpMultiplier,
    sourceId: DEBUG_CHEAT_SOURCE,
  }
  ```
- add a scrap modifier only when `scrapMultiplier !== 1`, with
  `stat: 'currencyGain'`;
- preserve XP then scrap ordering;
- return fresh modifier objects on each call;
- do not generate god/spawn modifiers;
- do not add or remove anything from a `ModifierStack` here.

The parser guarantees positive finite values. Direct malformed fixtures are
allowed to reach `ModifierStack.add` and retain its existing finite-value
guard; do not duplicate the stats validator.

### 6.5 Spawn-curve copy

`scaleSpawnCurveIntervals(curve, multiplier)` is pure and non-mutating:

```ts
if (!Number.isFinite(multiplier) || multiplier <= 1) {
  return curve as SpawnCurveDefinition;
}

return {
  ...curve,
  waves: curve.waves.map((wave) => ({
    ...wave,
    spawnEveryMs: Math.max(
      1,
      Math.round(wave.spawnEveryMs / multiplier),
    ),
  })),
};
```

Contract details:

- invalid/non-finite multipliers fail neutral by returning the **same**
  reference;
- `multiplier <= 1` returns the same reference;
- `multiplier > 1` returns a new curve and a new object for every wave;
- `scaling` remains the original reference and is not altered;
- every interval is an integer at least 1;
- all other values and wave order are byte-equivalent;
- the input remains unchanged even when deeply frozen;
- the helper does not call validation or `createSpawnDirector`;
- focused tests prove the returned shipped curve is still accepted by
  `createSpawnDirector`.

The cast on the identity path is type-level only; there is no mutation. Do not
`structuredClone` the entire curve or alter max-alive caps.

### 6.6 `DebugCheatSystem`

Constructor sequence:

1. Save the supplied references and default `logger` to `console`.
2. Call `debugCheatModifiers(flags)`.
3. Add each returned modifier to `runState.stats`.
4. Emit exactly one info line when the system is constructed:
   ```text
   [cheats] god=<on|off> xp=<n>x scrap=<n>x spawn=<n>x
   ```
   Use the actual flag values, including neutral `1x`.
5. Do not subscribe to the event bus and do not touch the save/context.

`update(_dtMs)`:

```ts
if (this.flags.godMode && this.runState.status === 'active') {
  this.player.health = this.player.maxHealth;
}
```

`destroy()`:

- returns immediately after the first call;
- marks the system destroyed before cleanup;
- calls `runState.stats.remove(DEBUG_CHEAT_SOURCE)` once;
- logs nothing;
- does not mutate the player, curve, or flags.

The system is constructed only when the master flag is enabled in a
development build. A neutral `?cheats=1` therefore produces the single
diagnostic line but changes no gameplay values.

### 6.7 Exact `GameScene` integration

Add imports from `systems/debug` for:

- existing `DebugOverlay`;
- `DebugCheatSystem`;
- `debugCheatsActive`;
- `getDebugFlags`;
- `scaleSpawnCurveIntervals`;
- type `DebugFlags` only if TypeScript needs an annotation.

Do not create scene fields for flags or the cheat system; locals plus
`systems` ownership are sufficient.

Immediately after resolving the original `curve` and assigning
`this.spawnCurve = curve`, add:

```ts
const debugFlags = import.meta.env.DEV ? getDebugFlags() : undefined;
const cheatsActive =
  debugFlags !== undefined && debugCheatsActive(debugFlags, true);
const directorCurve =
  cheatsActive
    ? scaleSpawnCurveIntervals(curve, debugFlags.spawnMultiplier)
    : curve;
```

Rules:

- the condition must contain direct `import.meta.env.DEV`;
- pass literal `true` to the helper after the direct gate; do not perform a
  second environment read;
- `this.spawnCurve`, HUD duration, and victory duration keep `curve`;
- only `SpawnSystem` receives `directorCurve`;
- do not read flags elsewhere in the scene.

After `Player` exists and after constructing `ProgressionSystem`, construct
the optional system:

```ts
const debugCheatSystem =
  cheatsActive
    ? new DebugCheatSystem({
        runState: this.runState,
        player: this.player,
        flags: debugFlags,
      })
    : undefined;
```

TypeScript knows `debugFlags` is defined when `cheatsActive` is true only if
the expression is structured clearly. If narrowing is lost, use an explicit
nested `if`; do not use `debugFlags!`.

Build the systems list in this order:

```text
ProgressionSystem
PassiveCoordinator
SpawnSystem(..., directorCurve)
HazardSystem
WeaponSystem
DropSystem
UpgradeSystem
DebugCheatSystem (only when present)
HudController
PlaytestSummarySystem (Slice 5, only when present)
```

Use conditional array spreads or push in the exact positions. Do not append
`DebugCheatSystem` after `HudController`.

No Slice 3 shutdown code is added outside the existing systems loop:
`DebugCheatSystem.destroy()` performs modifier cleanup automatically.

### 6.8 Slice 3 automated evidence

Create `tests/debugCheats.test.ts`. Mock Phaser before importing
`systems/debug.ts`; the mock needs only the shape required to evaluate the
module because no `DebugOverlay` is constructed in these tests.

Required cases:

**Parser**

- empty query returns `DEFAULT_DEBUG_FLAGS` by identity;
- `god=1&xp=4` without `cheats=1` returns defaults by identity;
- master switch alone returns a frozen enabled/neutral object;
- full valid query parses exact values;
- exact inclusive boundaries parse (`0.1`, `100`, `1`, `20`);
- each missing/empty/`NaN`/`Infinity`/partial/out-of-range field independently
  falls back to `1`;
- `cheats=true` remains disabled;
- unknown parameters do nothing;
- returned enabled flags cannot be mutated.

**Cache/gate**

- a fresh module reads a stubbed location once and returns the same cached
  object on repeated calls;
- explicit `debugCheatsActive(flags, true/false)` covers both environment
  branches;
- disabled flags are false even when `isDev` is true.

**Modifiers/effects**

- disabled and enabled-neutral flags produce no modifiers;
- XP-only, scrap-only, and both produce exact ordered objects/source IDs;
- applying generated modifiers changes `applyXp` and
  `currencyGain` resolution as expected;
- removal by `DEBUG_CHEAT_SOURCE` restores neutral resolution;
- modifier inputs are not mutated.

**Spawn scaling**

- non-finite and `<= 1` return the original reference;
- `> 1` returns copied curve/waves with exact rounded intervals;
- interval floor is 1;
- all non-interval values/references remain unchanged;
- frozen input is not mutated;
- `createSpawnDirector` accepts the scaled shipped curve.

**System**

- constructor adds the exact modifiers and emits one exact diagnostic;
- god refill occurs only for `active`;
- paused/won/lost/intro states do not refill;
- non-god flags do not refill;
- destroy removes all debug-source modifiers;
- repeated destroy is harmless and does not remove unrelated modifiers.

Do not weaken existing XP, drop, stats, spawn-director, or player tests.

### 6.9 Slice 3 manual and production evidence

Development browser:

| URL/check | Expected |
| --- | --- |
| no query | no cheat line; normal values |
| `?god=1&xp=4` | no effect |
| `?cheats=1` | one neutral cheat line; normal gameplay |
| `?cheats=1&god=1&xp=4&scrap=3&spawn=2` | one exact line; non-lethal damage refills; XP/scrap multiplied; faster cadence, caps unchanged |
| Retry | same cached flags; no duplicate modifiers from prior scene |
| return Menu → new run | old modifiers removed; one new system/line |

Production proof after `npm run build`:

```bash
if grep -R -F \
  -e '[cheats]' \
  -e 'debug:cheats' \
  dist/assets/*.js; then
  echo 'Production bundle retained cheat sentinels'
  exit 1
fi
```

Then run `npm run preview` and open every cheat URL above. No cheat effect or
cheat diagnostic is permitted. F3 remains available.

## 7. Slice 4 — rolling DPS and overlay metrics

### 7.1 New pure module `src/gameplay/metrics.ts`

No Phaser, browser globals, event bus, or scene imports.

```ts
export interface DpsMeter {
  record(amount: number, atMs: number): void;
  windowDps(nowMs: number): number;
  readonly totalDamage: number;
}

export function createDpsMeter(windowMs?: number): DpsMeter;
```

Default window: `5000` ms.

Factory guard:

- `windowMs` must be finite and `> 0`;
- invalid configuration throws
  `Error('DPS window must be a positive finite number')`;
- fractional positive windows are allowed, though production uses 5000.

### 7.2 Sample and time semantics

Internal sample:

```ts
interface DamageSample {
  readonly amount: number;
  readonly atMs: number;
}
```

Track one `latestMs` value shared by records and queries. It begins at `0`
and advances only on valid, non-decreasing calls.

`record(amount, atMs)` is fail-soft:

- drop when either input is non-finite;
- drop when `amount < 0` or `atMs < 0`;
- drop when `atMs < latestMs`;
- otherwise set `latestMs = atMs` and prune against `atMs` before addition;
- zero damage advances/prunes the clock but need not allocate a sample;
- before accepting positive damage, ensure both lifetime and post-prune
  rolling additions remain finite; drop the damage if either sum would
  overflow;
- otherwise append, add to rolling damage, and add to lifetime damage.

Production timestamps are naturally non-decreasing because they come from
`runState.timeMs`. The drop behavior prevents a malformed developer event from
crashing or corrupting a run.

`windowDps(nowMs)`:

- return `0` for non-finite or negative time;
- return `0` when `nowMs < latestMs`; do not mutate stored state;
- otherwise set `latestMs = nowMs`;
- define the active interval as `[nowMs - windowMs, nowMs]`;
- prune samples with `atMs < nowMs - windowMs`; a sample exactly on the lower
  boundary remains included;
- return `rollingDamage / (windowMs / 1000)`;
- return `0` rather than `-0`;
- never change `totalDamage`.

Use an array plus a head index, not `Array.shift()` per sample. Compact only
when the discarded prefix is materially large, for example when
`head >= 256 && head * 2 >= samples.length`. Compaction must not change
results. This keeps the implementation simple and avoids O(n) shifting during
high-fire-rate runs.

`totalDamage` is a getter over the accepted lifetime sum. It never decreases
when the rolling window prunes.

### 7.3 Exact `GameScene` ownership

Add:

```ts
private dpsMeter?: DpsMeter;
```

After assigning `this.runState = prepared.run`, create one local and store it:

```ts
const dpsMeter = createDpsMeter();
this.dpsMeter = dpsMeter;
```

Register the subscription after the meter exists and before `startRun`:

```ts
const runStateForMetrics = this.runState;
this.unsubscribers.push(
  ctx.bus.on('enemy:damaged', ({ amount }) => {
    dpsMeter.record(amount, runStateForMetrics.timeMs);
  }),
);
```

Capture the run-state local. Do not call `getContext` or
`requireRunState()` inside the damage listener.

The listener exists in development and production because the F3 overlay
remains production-reachable. It has no side effect beyond the meter.

### 7.4 Overlay strings

Keep every current line unless it is explicitly consolidated below. Add
exactly:

```ts
`Projectiles: ${this.projectileGroup?.getLength() ?? 0} Drops: ${this.dropGroup?.getLength() ?? 0}`,
`DPS(5s): ${(this.dpsMeter?.windowDps(runState.timeMs) ?? 0).toFixed(1)}`,
```

Place the count line immediately after the existing enemies/kills line and
the DPS line immediately after the count line.

Do not:

- count projectiles/drops by traversing scene children;
- use `countActive`, future pooling assumptions, or custom counters;
- change the existing FPS calculation inside `DebugOverlay`;
- add an event for counts;
- modify entities or groups to support the overlay;
- gate the overlay or meter behind development mode.

### 7.5 Shutdown

The existing `unsubscribers` loop removes the damage listener before scene
fields are cleared. After destroying systems and before or alongside the other
run-scoped field resets, add:

```ts
this.dpsMeter = undefined;
```

No `destroy()` method is needed on the pure meter.

### 7.6 `tests/metrics.test.ts`

Required cases:

- default 5-second denominator;
- custom positive window;
- factory rejects zero, negative, `NaN`, and infinities;
- one sample, several samples, and samples at the same timestamp;
- exact lower-boundary inclusion;
- just-expired sample pruning;
- lifetime total survives pruning;
- invalid/negative amount and timestamp are dropped;
- zero amount leaves results unchanged;
- out-of-order samples, including records backdated behind a later query, are dropped;
- backwards/non-finite `nowMs` returns zero without losing valid samples;
- overflow-causing addition is dropped and totals remain finite;
- repeated queries at the same time are stable;
- compaction path produces the same result as the mathematical reference.

The test should compare against explicit arithmetic, not duplicate the
implementation's head-index algorithm.

### 7.7 Slice 4 integration evidence

Automated pure tests prove the formula. The browser matrix proves scene wiring:

1. Open a run and F3.
2. Confirm projectile count rises/falls as projectiles are created/destroyed.
3. Spawn/collect drops and confirm drop count changes.
4. Hit an enemy for a known period; DPS becomes non-zero.
5. Pause for longer than five wall-clock seconds; DPS does not decay because
   run time is paused.
6. Resume and stop dealing damage; DPS reaches zero after five seconds of
   **run** time.
7. Overkill a low-health enemy; total/rolling DPS reflects only removed
   health.
8. Retry; counts and meter start at zero with no old samples.

## 8. Slice 5 — local playtest summary and closeout

### 8.1 New `src/systems/playtestSummary.ts`

No Phaser imports.

```ts
export interface PlaytestSummarySystemOptions {
  readonly runState: RunState;
  readonly bus: EventBus;
  readonly dpsMeter: DpsMeter;
  readonly logger?: Pick<Console, 'info' | 'table'>;
}

export interface PlaytestSummaryRow {
  readonly outcome: RunOutcome;
  readonly time: string;
  readonly timeMs: number;
  readonly level: number;
  readonly kills: number;
  readonly currency: number;
  readonly avgDps: number;
  readonly upgradesTaken: number;
}

export class PlaytestSummarySystem implements System {
  constructor(options: PlaytestSummarySystemOptions);
  update(dtMs: number): void;
  destroy(): void;
}
```

`PlaytestSummaryRow` is exported only to make the logger payload explicit and
testable. Do not reuse the player-facing `RunSummarySource` or import from
`ui/runSummary.ts`.

### 8.2 Construction and subscriptions

Constructor:

1. Save references and default `logger` to `console`.
2. Subscribe to `run:won` with `() => this.print('won')`.
3. Subscribe to `run:lost` with `() => this.print('lost')`.
4. Store both unsubscriber functions.
5. Do not print at construction and do not subscribe to any other event.

The terminal event key supplies the `outcome`. The remaining row fields are
read synchronously from `runState` when the first terminal event arrives. Do
not mix duplicated values from the event payload with state values.

### 8.3 Exactly-once print path

Private state:

```ts
private printed = false;
private destroyed = false;
```

`print(outcome)`:

1. Return when destroyed or already printed.
2. Set `printed = true` **before** invoking either logger method.
3. Snapshot and calculate the row.
4. `logger.info('[playtest] run summary')`.
5. `logger.table([row])`.
6. If `Object.keys(runState.upgradeStacks).length > 0`, then
   `logger.table(runState.upgradeStacks)`.
7. No other logging.

Setting the guard first preserves exactly-once behavior even if an injected
logger throws; the event bus already contains listener-error isolation.

### 8.4 Exact formatting/calculation

Local helper; no `ui/` import:

```ts
function formatTime(timeMs: number): string {
  const safeMs = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
```

Row:

```ts
const safeTimeMs =
  Number.isFinite(runState.timeMs) ? Math.max(0, runState.timeMs) : 0;
const elapsedSeconds = Math.max(1, safeTimeMs / 1000);
const rawAverage = dpsMeter.totalDamage / elapsedSeconds;
const avgDps =
  Number.isFinite(rawAverage)
    ? Math.round(rawAverage * 10) / 10
    : 0;
const upgradesTaken = Object.values(runState.upgradeStacks)
  .reduce((sum, count) => sum + count, 0);

const row: PlaytestSummaryRow = Object.freeze({
  outcome,
  time: formatTime(safeTimeMs),
  timeMs: safeTimeMs,
  level: runState.level,
  kills: runState.kills,
  currency: runState.currency,
  avgDps,
  upgradesTaken,
});
```

Do not round currency, level, kills, or timeMs. Do not include seed,
character ID, arena ID, settings, save data, timestamps, device data, or any
identifier outside the local run.

`update(_dtMs)` is a no-op.

`destroy()` is idempotent: set destroyed first, invoke both unsubscribers once,
and retain no active listener. It does not print a missing summary.

### 8.5 Exact `GameScene` construction

Construct `ProgressionSystem` first as today. The DpsMeter already exists from
Slice 4.

Then:

```ts
const playtestSummarySystem =
  import.meta.env.DEV
    ? new PlaytestSummarySystem({
        runState: this.runState,
        bus: ctx.bus,
        dpsMeter,
      })
    : undefined;
```

The condition must directly contain `import.meta.env.DEV`. Do not use only
`RuntimeConfig.isDev`, a URL flag, or the F3 visibility.

Place the optional summary system last in `systems`, after `HudController`.
The constructor subscription order—not update order—is the important
Progression-before-summary invariant.

Existing shutdown destroys it through the systems loop. Do not add a second
unsubscriber to `GameScene`.

### 8.6 `tests/playtestSummary.test.ts`

Use real `createEventBus`, a real `RunState`, a real/fake `DpsMeter` matching
the interface, and an injected logger.

Required cases:

- constructor prints nothing;
- `run:won` prints info then one-row table exactly once;
- `run:lost` reports `lost`;
- first of won/lost wins and later terminal events do nothing;
- exact row fields and `m:ss` formatting under one minute, over one minute,
  and at zero;
- average DPS uses lifetime damage and one-second denominator guard;
- average is rounded to one decimal;
- upgrade counts sum across IDs;
- upgrade table is omitted for empty stacks;
- upgrade table is emitted after the row table when non-empty;
- snapshot uses current run-state values at event time;
- `update` does nothing;
- destroy before terminal events prevents output;
- destroy after output prevents further output;
- repeated destroy is harmless;
- a throwing logger still leaves the instance printed/guarded (invoke through
  a direct typed seam or rely on the bus error isolation without asserting
  unrelated `console.error` text).

Do not assert browser-specific console formatting; assert call order and exact
arguments.

### 8.7 Production proof

After the final production build, the sentinel must be absent:

```bash
if grep -R -F \
  -e '[playtest] run summary' \
  dist/assets/*.js; then
  echo 'Production bundle retained playtest-summary code'
  exit 1
fi
```

Production preview must remain silent on natural win/loss and F8/F9 are already
unavailable there.

### 8.8 Tuning guide closeout

Expand `docs/balancing/data-driven-balancing.md` with these exact sections:

1. **Common tuning targets** — table:
   - weapon feel → `src/data/weapons.json`;
   - enemy durability/reward → `src/data/enemies.json`;
   - wave pressure/scaling → `src/data/spawn-curves.json`;
   - cards → `src/data/upgrades.json`;
   - character starting profile/passive data →
     `src/data/characters.json`;
   - run loot → `src/data/loot-tables.json`;
   - permanent costs/effects → `src/data/meta-upgrades.json`;
   - arena geometry/hazards → `src/data/arenas.json`.
2. **Units and direction** — call out `*Ms`, `*Second`, and “higher
   `fireRateMs`/`spawnEveryMs` means slower”; mention multiplier stat direction
   is already normalized by `ModifierStack`.
3. **Safe tuning loop**:
   - write one hypothesis;
   - change one related data family;
   - run focused validation/full tests;
   - use a fixed seed when comparing;
   - use development cheat URLs only to accelerate observation;
   - inspect F3 and the terminal console summary;
   - record result;
   - commit tuning separately from tooling/architecture.
4. **Interpreting metrics** — rolling DPS is effective enemy health removed
   over five run-time seconds; average DPS is lifetime effective damage over
   run time; spawn caps can hide cadence increases; currency/XP cheats make
   economy outcomes non-comparable to normal runs.
5. **Guardrails** — no engine-code hidden multipliers, no multi-system tuning
   bundles, no production flags, no data change without green
   `validateAllData`.

Do not add recommended values or perform a balance change.

### 8.9 Documentation state transitions

Only after every automated/manual/preview criterion passes:

- mark Epic 11 complete in the original architecture document;
- replace stale “PR #66 completed the whole epic” wording with:
  - PR #66 delivered slices 1–2;
  - the Issue #69 delivery PR delivered slices 3–5;
- update `docs/architecture.md` to identify this remainder document as the
  implementation/delivery record;
- update `docs/epics.md`, `docs/roadmap.md`, and
  `docs/knowledge-graph.md` to the actual final module list, test/file count,
  PR numbers, and branch/head;
- correct `knowledge-graph.md`'s pre-remainder test count;
- replace §16 below with final evidence;
- close Issue #69 through the delivery PR.

Do not mark Epic 12 as current until the Epic 11 delivery PR is actually
ready to merge.

## 9. Ordered slice and commit plan

No slice branch and no additional PR.

| Slice | Commit intent | Files | Required gate before next slice |
| --- | --- | --- | --- |
| Architecture | `docs: architect Epic 11 remainder` | this file + architecture/status pointers | review doc against live main |
| 3 | `Epic 11 · Slice 3: development-only debug cheats` | `debug.ts`, `GameScene.ts`, `debugCheats.test.ts` | focused tests, slices 1–2 regressions, lint, build, bundle grep |
| 4 | `Epic 11 · Slice 4: rolling DPS and overlay metrics` | `metrics.ts`, `GameScene.ts`, `metrics.test.ts` | focused tests, full suite, lint, build |
| 5 | `Epic 11 · Slice 5: playtest summary and tuning closeout` | `playtestSummary.ts`, `GameScene.ts`, `playtestSummary.test.ts`, balancing/status docs, this record | all gates + browser/preview matrix |
| Review | one commit per coherent confirmed fix | only in-scope files/tests/docs | independent full rerun and ready verdict |

Each slice starts from a green previous slice. Do not squash away the slice
boundaries before review; they are the review gates and evidence trail.

## 10. Full automated matrix

Focused remainder command:

```bash
npm test -- --run \
  tests/debugCheats.test.ts \
  tests/metrics.test.ts \
  tests/playtestSummary.test.ts
```

Mandatory slices 1–2 regressions:

```bash
npm test -- --run \
  tests/curves.test.ts \
  tests/validateAllData.test.ts \
  tests/validation.test.ts \
  tests/enemyScaling.test.ts \
  tests/meta.test.ts \
  tests/xp.test.ts \
  tests/spawnRegion.test.ts \
  tests/enemy.test.ts \
  tests/weaponSystem.test.ts
```

Existing shared-composition regressions:

```bash
npm test -- --run \
  tests/gameSceneAudio.test.ts \
  tests/audioManager.test.ts \
  tests/contextSystem.test.ts \
  tests/bootScene.test.ts \
  tests/menuScene.test.ts \
  tests/progressionSystem.test.ts \
  tests/runSummary.test.ts
```

Final gate:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Also run test-order hardening because PR #68 found order-sensitive mock risks:

```bash
npm test -- --sequence.shuffle --sequence.repeats=3
```

No existing test may be deleted, skipped, relaxed, or changed merely to fit
the implementation. A pre-existing test changes only when its fixture must
reflect the already-frozen effective-damage contract, and the reason must be
recorded.

## 11. Manual browser and preview matrix

Record pass/fail plus brief evidence for every row.

| Build | Check | Expected |
| --- | --- | --- |
| dev | no query, play normally | no cheat log/effect; existing audio/UI/run flow intact |
| dev | full cheat query | one diagnostic; non-lethal refill; multiplied XP/scrap; faster cadence |
| dev | `god=1` without master | no effect |
| dev | invalid/out-of-range query values | affected fields neutral; no crash |
| dev | F3 during combat | FPS, current run lines, enemy/projectile/drop counts, rolling DPS |
| dev | pause >5 wall seconds | DPS window frozen until run time resumes |
| dev | natural/forced win | one local summary and optional upgrade table |
| dev | natural/forced loss | one local summary and optional upgrade table |
| dev | Retry | fresh meter and one new summary only; no modifier/listener accumulation |
| dev | Menu → Game → Menu → Game | shared audio survives; developer systems remain run-scoped |
| preview | every cheat URL | no cheat effect/log |
| preview | win/loss | no playtest summary |
| preview | F3 | overlay remains available (status quo) |
| preview | audio/menu/pause/summary commands | PR #68 behavior unchanged |
| data check | break one shipped JSON field, run tests, revert | aggregate validation identifies correct file/field |
| clean check | after revert | working tree clean except intended delivery changes |

The break-a-JSON check must be reverted before any commit and must not appear
in the PR diff.

## 12. Global acceptance criteria

- [ ] Slices 1–2 remain behavior-identical and all their focused tests pass.
- [ ] Flags are cached once, off by default, master-gated, and unreachable in
      production.
- [ ] XP/scrap cheats use only `ModifierStack` under `debug:cheats`.
- [ ] Spawn acceleration uses only a non-mutating construction-time curve copy.
- [ ] God mode uses only the scene-scoped refill system; lethal-hit limitation
      is retained/documented.
- [ ] Debug modifiers/listeners are removed on shutdown and do not accumulate
      across Retry or scene transitions.
- [ ] The production bundle contains neither cheat nor playtest-summary
      sentinels.
- [ ] DpsMeter is pure, deterministic, finite, monotonic-clock-safe, and based
      only on effective damage/run time.
- [ ] F3 shows projectile/drop counts and `DPS(5s)` without changing gameplay.
- [ ] The local summary prints exactly once per run in development only, with
      exact row fields and no network/PII.
- [ ] Progression banking remains earlier in listener order than the local
      summary.
- [ ] Audio manager ownership, UI command events, F8/F9/F10 behavior, and all
      existing production flow remain intact.
- [ ] No data value, event shape, stat key, save schema, dependency, or package
      script changes.
- [ ] Tuning guidance is actionable but contains no tuning diff.
- [ ] Focused/full/shuffled tests, lint, build, diff check, browser matrix,
      preview matrix, and hosted CI are recorded honestly.
- [ ] Issue #69 and documentation are closed only after evidence is complete.

## 13. Reviewer traps

- Do not rework curves or validation because this PR touches “balancing.”
- Do not call `getDebugFlags()` unconditionally in production code.
- Do not rely solely on `RuntimeConfig.isDev` for new cheat/summary
  construction; preserve direct `import.meta.env.DEV` branches.
- Do not move the F3 overlay behind a dev gate.
- Do not add cheat branches to gameplay/entity/system implementations.
- Do not use `armor`, an invulnerability stat, or damage interception for god
  mode.
- Do not mutate the original spawn curve or change `maxAlive`.
- Do not rebuild the spawn director when flags change; flags do not change
  mid-run.
- Do not persist flags or suppress banking from cheated development runs.
  Inflated dev currency can bank into a dev save; this is accepted.
- Do not use wall/Phaser/audio time for damage samples.
- Do not count raw projectile-hit damage; use `enemy:damaged.amount`.
- Do not count overkill beyond effective removed health.
- Do not use `Array.shift()` in the high-frequency meter path.
- Do not let invalid metrics data throw from an event listener.
- Do not construct the summary before `ProgressionSystem`.
- Do not print from both terminal listeners without one shared guard.
- Do not set the guard after logging.
- Do not import player-facing UI formatters into the developer system.
- Do not destroy or recreate the Boot-owned `AudioManager`.
- Do not make a second `GameScene.create` implementation inside tests.
- Do not mark docs complete before preview/browser evidence.
- Do not start Epic 12 or retune data in this PR.
- Do not create slice branches, slice PRs, or new dependencies.

## 14. Implementation-agent handoff

Use this prompt verbatim after the architecture commit is on the branch:

> Implement Issue #69, the Epic 11 remainder, in the Meowcenary repository on
> the existing branch `agent/epic-11-remainder`. Do not create another branch
> or PR.
>
> Read, in order:
> 1. `docs/architecture/epic-11-remainder.md` in full;
> 2. `docs/knowledge-graph.md`, noting that any line claiming PR #66 completed
>    all of Epic 11 is stale until Slice 5 corrects it;
> 3. `docs/epics.md`;
> 4. `docs/architecture/epic-11-balancing-and-developer-tooling.md` only for
>    the already-delivered slices 1–2 and maintainer decisions.
>
> Run the §4 baseline gate. Then implement Slice 3, commit it green; implement
> Slice 4, commit it green; implement Slice 5, commit it green. Follow the
> exact exported contracts, parser grammar, system order, GameScene insertion
> points, tests, and reviewer traps in §§6–13. Do not redesign any seam.
>
> Preserve PR #68's audio/UI lifecycle exactly. Do not modify gameplay modules
> for cheats, mutate the original spawn curve, add events/stats/save fields,
> dev-gate F3, persist flags, retune data, or begin Epic 12.
>
> After every slice run its focused and regression gates. Before handoff run
> the full, shuffled, lint, build, bundle-sentinel, diff, browser, preview, and
> break-a-JSON checks. Record exact counts, commit SHAs, hosted CI, every
> unrun manual row, and deviations in §16. A browser check not run is
> “unverified,” never “passed.” Do not mark Epic 11 complete until every
> acceptance item has evidence.

## 15. Review and hardening handoff

Use this prompt after all three implementation commits are on the same branch:

> Review and harden Issue #69 on `agent/epic-11-remainder`. Do not create a
> branch or PR. Diff from architecture baseline
> `025a20832e04b2a7ba069768bd26c13264784ac7` (or the later baseline explicitly
> recorded in §16) and read `docs/architecture/epic-11-remainder.md` in full.
>
> Treat the document as the frozen contract. Review causal paths, not only
> file names. Prioritize direct production dead-code gates and bundle
> sentinels; source-ID cleanup across Retry; original-vs-director curve
> identity; effective-damage and run-clock semantics; DpsMeter boundary,
> out-of-order, overflow, and compaction cases; Progression-before-summary
> listener order; exactly-once behavior when loggers fail; and preservation of
> PR #68 audio/UI lifecycle.
>
> Independently run §§10–11. Add focused mutation-style tests for confirmed
> gaps, but do not broaden the architecture or weaken existing tests. Fix only
> in-scope defects. For every finding, record severity, causal path, effect,
> fix, and evidence.
>
> End with exact final counts, commit/head SHAs, CI state, all manual/preview
> rows, deviations, and a ready/not-ready verdict against §12. Do not mark
> documentation complete when any mandatory evidence is missing.

## 16. Delivery record

Status: **not yet delivered**.

Replace this section at completion with all fields below:

- architecture baseline SHA;
- implementation baseline SHA (if `main` advanced);
- architecture commit SHA;
- Slice 3 commit SHA and focused/full counts;
- Slice 4 commit SHA and focused/full counts;
- Slice 5 commit SHA and focused/full counts;
- review-fix commit SHAs;
- final branch head SHA;
- delivery PR number and URL;
- exact final test count and test-file count;
- shuffled/repeated test result;
- lint/typecheck result;
- production build result;
- `git diff --check` result;
- cheat and summary bundle-sentinel results;
- hosted CI run/check result;
- every §11 browser/preview/data-check row;
- explicitly deferred limitations;
- Issue #69 closure result;
- final documentation status.

Until every mandatory item is recorded, Epic 11 is **partially delivered:
slices 1–2 complete, slices 3–5 pending**.

## 17. Frozen decision ledger

- **R1 — Branch/PR:** one branch `agent/epic-11-remainder`, one delivery PR.
- **R2 — Toggle timing:** URL flags are parsed once per page; no mid-run
  toggle.
- **R3 — Production:** cheats and local summary are direct-DEV-gated and
  bundle-inspected; F3 remains available.
- **R4 — God mode:** active-update health refill; a lethal single hit may
  still end the run.
- **R5 — Spawn cheat:** cadence-only copy before director construction;
  max-alive caps unchanged.
- **R6 — Economy:** XP/scrap modifiers use existing stats; cheated development
  currency may bank into the developer's local save.
- **R7 — DPS:** effective damage, five-second run-time window, fixed-window
  denominator, lifetime total for average.
- **R8 — Summary:** development only, first terminal event wins, progression
  subscribes first, local console only.
- **R9 — Tests:** pure modules receive exhaustive tests; no duplicate full
  GameScene composition fake.
- **R10 — Tuning:** guidance only; no balance values change in Issue #69.
