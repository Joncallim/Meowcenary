# Epic 8 Slice 5: Chest Shell + Integration Harness + Docs Sign-Off

Status: **implemented and merged via PR #62.** Epic 8 Slice 5 / issue #57.
The closeout audit on 2026-08-05 verified the implementation on `main` and
hardened the malformed-runtime-table boundary before closing Epic 8 / issue #9.

This document is the architecture contract and implementation work package for
the slice. The PR is the delivery vehicle for the complete implementation,
tests, and docs sign-off; it is not a docs-only architecture PR. The contract
refines the Epic 8 overview §4.4 (chest-open resolution), §4.7 (chest
collection), and §6 (slice index) into an exact, bounded coding task. When
this document and issue #57 differ, **this document is authoritative** — the
issue carries two stale statements, listed in §2.1.

## 1. Outcome

Prove the chest/rare-drop shell end-to-end and close Epic 8:

- a collected chest drop resolves its referenced table with the run-scoped
  `'loot'` RNG and grants the resulting xp/scrap **immediately** — no physical
  sub-drops, no new events, one `drop:collected` per grant;
- recursion is impossible by construction (validation forbids chest entries in
  chest-referenced tables) and defended at runtime (nested chest grants are
  filtered, never followed);
- a dev-only `F10` hotkey spawns a chest next to the player for manual
  playtests, gated by `RuntimeConfig.isDev` and absent from production builds;
- a headless integration harness proves kill → table drop → chest → grant
  pipelines against shipped data with deterministic seeds;
- `epics.md`, `roadmap.md`, `knowledge-graph.md`, and the Epic 8 overview
  status lines move to Epic-8-complete.

After this slice, every Epic 8 acceptance criterion in the overview §9 holds.
No shipped enemy references a loot table; the shell is proven by fixtures and
the hotkey, exactly as Epic 7 shipped hazards.

## 2. Baseline evidence

Read these before writing code. The slice is small; everything hard already
exists.

- `src/gameplay/loot.ts` — `resolveLoot(tableId, lookup, rng)` makes **one**
  weighted draw and returns grants, including `{ kind: 'chest', amount: 0,
  tableId }` for chest entries. It throws on a missing or malformed table.
  **Do not modify this file.**
- `src/entities/Drop.ts` — `spawn` already accepts `tableId` and stores it
  only for `kind === 'chest'` ([Drop.ts:46](../../src/entities/Drop.ts)).
  **Do not modify this file.**
- `src/systems/DropSystem.ts` — the file being extended. Its `collect()`
  ([DropSystem.ts:129-162](../../src/systems/DropSystem.ts)) already gates on
  `runState.status === 'active'` and `drop.active`, applies xp via `applyXp`
  and scrap via `currencyGain`, and its chest case holds the Slice 4 interim
  behaviour (destroy, no grant). `spawnDrop` already narrows and forwards
  `grant.tableId` for chest grants
  ([DropSystem.ts:75](../../src/systems/DropSystem.ts)).
- `src/scenes/GameScene.ts` — the dev-hotkey precedent is the
  `RuntimeConfig.isDev`-gated F8/F9/C/M block
  ([GameScene.ts:193-198](../../src/scenes/GameScene.ts)) with matching
  unconditional `off` calls in `handleShutdown`
  ([GameScene.ts:324-327](../../src/scenes/GameScene.ts)) and
  `console.log('[dev] …')` feedback ([GameScene.ts:443](../../src/scenes/GameScene.ts)).
  `dropSystem` is currently a `create()`-local const
  ([GameScene.ts:140-151](../../src/scenes/GameScene.ts)); `upgradeSystem`
  shows the private-field precedent ([GameScene.ts:56](../../src/scenes/GameScene.ts)).
- `src/data/loot-tables.json` — ships `chest-standard` (xp 15 / scrap 10 /
  scrap 40, weights 55/35/10, chest-safe) and `brute-cache` (xp 6 / scrap 5 /
  chest→`chest-standard`, weights 60/30/10). **Do not modify.**
- `tests/dropSystem.test.ts` — the mock-Phaser harness (`MockGameObject`,
  `MockBody`, captured overlap callback, `createSystem`). Extend it in place;
  its interim chest test at line 483 pins Slice 4 behaviour that this slice
  deliberately changes (§7.1).
- `tests/arenaBrowserIntegration.test.ts` — the integration-harness style:
  real `loadGameData()`, real registries, real bus, minimal local Phaser
  mocks, no scene boot.
- `src/engine/rng.ts` — `deriveRunSeed(seed, 'loot')` + `createRng` are the
  determinism primitive the harness pins (§6.2 seeds are pre-computed against
  this implementation).

### 2.1 Corrections to issue #57

| Issue #57 says | Reality on `main` | Action |
| --- | --- | --- |
| Manual playtest "magnet pickup feels right at `magnetSpeed 300`" | `magnetSpeed` shipped at **450** ([config.ts:15](../../src/engine/config.ts)). 300 sits below the ~367 max-attainable-`moveSpeed` ceiling and was explicitly rejected in the Slice 4 architecture §6 — at 300 a fully built fast player tows an uncollectable drop forever. | Playtest at the shipped **450**. The issue's number is stale. |
| "Extend `tests/dropSystem.test.ts` — chest collect path" | The interim chest test ([dropSystem.test.ts:483](../../tests/dropSystem.test.ts), "destroys a chest drop without granting or emitting drop:collected") pins the Slice 4 interim behaviour this slice replaces. | **Rewrite** that test to the new behaviour; extend with the new cases in §7.2. Do not leave both behaviours pinned. |

Everything else in the issue matches this document.

## 3. Scope and ownership

### Modify

- `src/systems/DropSystem.ts` — chest collection + two extracted helpers (§4)
- `src/scenes/GameScene.ts` — `dropSystem` private field + F10 dev hotkey (§5)
- `tests/dropSystem.test.ts` — rewrite interim chest test, add chest cases (§7)
- `docs/epics.md`, `docs/roadmap.md`, `docs/knowledge-graph.md`,
  `docs/architecture/epic-8-loot-and-economy.md` — Epic 8 completion
  sign-off (§8)

### Create

- `tests/lootIntegration.test.ts` — headless integration harness (§6)

### Explicitly do not touch

- `src/gameplay/loot.ts`, `src/entities/Drop.ts`, `src/systems/lootTables.ts`,
  `src/systems/validation.ts`, `src/engine/eventBus.ts`, `src/engine/config.ts`
- `src/data/*.json` — in particular, **do not attach `lootTableId` to any
  shipped enemy** (overview §10; that is Epic 11 balancing)
- `src/systems/WeaponSystem.ts` — it stays drop-free
- save/meta state, dependencies, build config

If implementation appears to require one of those, stop and report the
contract mismatch rather than broadening the slice.

## 4. DropSystem chest-collection contract

The whole `DropSystem` change is inside collection. Grant arithmetic must not
be duplicated: extract the two existing inline cases into private helpers,
then let both direct drops and chest contents flow through them.

```ts
private collect(drop: Drop): void {
  if (this.runState.status !== 'active' || !drop.active) {
    return;
  }

  const { kind, amount } = drop;
  switch (kind) {
    case 'xp':
      this.applyXpGrant(amount);
      break;
    case 'scrap':
      this.applyScrapGrant(amount);
      break;
    case 'chest':
      this.collectChest(drop);
      return; // the chest itself never emits drop:collected
  }

  this.ctx.bus.emit('drop:collected', { kind, amount, x: drop.x, y: drop.y });
  drop.destroy();
}

private applyXpGrant(amount: number): void {
  applyXp(this.runState, amount, this.ctx.bus);
}

private applyScrapGrant(amount: number): void {
  const gained = amount * this.runState.stats.resolve('currencyGain', 1);
  if (Number.isFinite(gained) && gained > 0) {
    this.runState.currency += gained;
    this.ctx.bus.emit('currency:changed', { runTotal: this.runState.currency });
  }
}

private collectChest(drop: Drop): void {
  const { tableId } = drop;
  if (tableId !== undefined) {
    let grants: readonly LootGrant[];
    try {
      grants = resolveLoot(tableId, this.lootTables, this.rng);
    } catch {
      grants = []; // fail soft — strictness belongs to validation
    }
    for (const grant of grants) {
      if (grant.kind === 'chest') {
        continue; // defensive: validation guarantees chest-safe targets
      }
      if (grant.kind === 'xp') {
        this.applyXpGrant(grant.amount);
      } else {
        this.applyScrapGrant(grant.amount);
      }
      this.ctx.bus.emit('drop:collected', {
        kind: grant.kind,
        amount: grant.amount,
        x: drop.x,
        y: drop.y,
      });
    }
  }
  drop.destroy();
}
```

Add `resolveLoot` to the existing `../gameplay/loot` import. No other imports
change.

Pinned details, each of which is a reviewer trap:

- **The chest drop itself emits no `drop:collected`.** The payload union
  stays `'xp' | 'scrap'` (overview §4.7); chest contents surface as per-grant
  xp/scrap events at the chest's `x`/`y`. Do not widen the union, and do not
  invent a `chest:opened` event — Epic 8's event budget is spent.
- **Per-grant `drop:collected` carries the face value**, exactly like direct
  drops. `currencyGain`/`xpGain` apply inside the helpers only; adjusted
  totals surface on `currency:changed` / `xp:gained`.
- **One draw per chest open, on the shared `'loot'` stream.** `resolveLoot`
  consumes exactly one `rng.next()`. Kill draws and chest-open draws
  interleave on `this.rng` in temporal order — that is what makes "identical
  seeds + kill order ⇒ identical drops including chest opens" hold. Do not
  create a second stream and do not re-seed.
- **Fail soft, never crash a live run.** A missing/malformed table makes
  `resolveLootFromTable` throw; catch it and grant nothing. Validation is the
  primary integrity gate; the runtime resolver also rejects invalid weights,
  RNG draws, kinds, and grant amounts before a grant can be applied or emitted.
  The soft boundary leaves a targeted `console.warn` diagnostic.
- **A missing `tableId` on a chest drop grants nothing** (destroy, no
  events). `spawnDrop` always sets it for chest grants from resolution; the
  guard covers hand-built drops.
- **Nested chest grants are skipped, never followed.** Validation makes them
  unreachable with shipped data; the `continue` defends against malformed
  runtime lookups. Recursion is impossible by construction and stays so.
- **The chest may legitimately grant nothing** — a `'nothing'` chest-table
  entry resolves to `[]`. That is content, not an error.
- **The drop is `destroy()`ed after collection**, matching Slice 4.
  `Drop.reset()` stays reserved for Epic 12's pool.
- Read `drop.x`/`drop.y` for the per-grant events **before** `destroy()` —
  the loop above already does; keep that ordering.

Nothing else in `DropSystem` changes: construction, subscription, `spawnDrop`
narrowing, `update`, magnet handling, and `destroy` all stay as Slice 4
shipped them.

## 5. GameScene: `dropSystem` field + F10 dev hotkey

### 5.1 Promote `dropSystem` to a private field

The hotkey needs the system after `create()` returns. Follow the
`upgradeSystem` precedent:

- Declare `private dropSystem?: DropSystem;` beside
  [GameScene.ts:56](../../src/scenes/GameScene.ts).
- In `create()`, assign `this.dropSystem = new DropSystem({ … })` (options
  unchanged) and put `this.dropSystem` in the `this.systems` array where the
  local `dropSystem` sits today ([GameScene.ts:186](../../src/scenes/GameScene.ts)).
- In `handleShutdown`, set `this.dropSystem = undefined;` with the other
  field clears, after the `systems.forEach(destroy)` pass.

### 5.2 F10 handler

Register inside the existing `RuntimeConfig.isDev` block, after `keydown-M`:

```ts
this.input.keyboard?.on('keydown-F10', this.spawnChestDev, this);
```

Remove it in `handleShutdown` with the other dev keys (unconditional `off`,
matching F8/F9/C/M). The handler, placed after `cycleArenaDev`:

```ts
private spawnChestDev(): void {
  if (
    !RuntimeConfig.isDev ||
    !this.runState ||
    this.runState.status !== 'active' ||
    !this.player ||
    !this.dropSystem
  ) {
    return;
  }

  const x = this.player.x + 48;
  const y = this.player.y;
  this.dropSystem.spawnDrop(x, y, { kind: 'chest', amount: 0, tableId: 'chest-standard' });
  console.log(`[dev] Chest spawned at (${Math.round(x)}, ${Math.round(y)}) — walk over it to open.`);
}
```

Pinned details:

- **Spawn the chest-safe `chest-standard` table directly.** The hotkey
  exercises Slice 5's collection path through the production `spawnDrop`
  seam — the same seam tests use — with no new `DropSystem` API and no loot
  resolution on the spawn side. `brute-cache` stays fixture-only content.
- **Gate on `status === 'active'`**, like `forceWinRun`/`forceLoseRun`, so
  the key cannot spawn into a paused/ended/tearing-down run.
- **48 px to the player's right** is a fixed dev convenience, not tuning —
  drops ignore obstacles and world bounds, so no placement rules apply. Do
  not add it to `RuntimeConfig`.
- F10 collides with no existing binding (P, ESC, R, F8, F9, C, M are taken).
  On macOS it may need `fn`; it is a dev-only affordance, and the
  `console.log` confirms the spawn.
- The key exists only under `import.meta.env.DEV`; production builds never
  register it. No other `GameScene` behaviour changes.

## 6. Integration harness — `tests/lootIntegration.test.ts` (new)

### 6.1 Style and fixture

Mirror `arenaBrowserIntegration.test.ts`: real `loadGameData()`, real
`DataLootTableRegistry`, real `createEventBus()`, real `createRunState`, and a
**minimal local** Phaser mock surface copied from `dropSystem.test.ts`
(`MockGameObject`/`MockArc`/`MockBody`, captured overlap callback, group
`add`). Keep the harness self-contained — do **not** extract a shared mock
module from `dropSystem.test.ts`; local mocks are the established repo style.

The system under test is `DropSystem` alone, driven through the bus — the
same boundary Slice 4 established (`WeaponSystem`'s emission is already
covered by `weaponSystem.test.ts`). Kill fixtures carry the table reference
explicitly:

```ts
const BRUTE_KILL = {
  instanceId: 1,
  enemyId: 'trash-brute',
  xpValue: 8,
  scrapValue: 5,
  lootTableId: 'brute-cache',
  x: 120,
  y: 240,
} as const;
```

`xpValue`/`scrapValue` are the fail-soft fallback values; they are never
consumed on the table path. `runState.status = 'active'`; no modifiers, so
`xpGain`/`currencyGain` resolve to 1 and grants land at face value. Each test
builds its RNG as `createRng(deriveRunSeed(seed, 'loot'))` — the real named
stream, never a constant stub (Slice 4 §2.2.3).

### 6.2 Pre-computed deterministic seeds

These were computed against the shipped `deriveRunSeed(seed, 'loot')` +
mulberry32 implementation and the shipped table weights. Draw 1 is consumed
by the kill resolution on `brute-cache` (xp 60 / scrap 30 / chest 10); draw 2
by the chest open on `chest-standard` (xp 55 / scrap 10 / scrap 40):

| Run seed | Draw 1 (`brute-cache`) | Draw 2 (`chest-standard`) | Pipeline result |
| --- | --- | --- | --- |
| 7 | 0.9379 → chest | 0.0147 → xp 15 | kill → chest drop → +15 xp |
| 12 | 0.9539 → chest | 0.6658 → scrap 10 | kill → chest drop → +10 scrap |
| 79 | 0.9212 → chest | 0.9914 → scrap 40 | kill → chest drop → +40 scrap |
| 2 | 0.0833 → xp 6 (no chest) | — | control: table-kill spawns a plain xp drop |

Do not re-derive these inline in the test; use the seeds as constants with a
comment citing this table. If the shipped weights ever change, the seeds must
be recomputed — that is intentional coupling to shipped data.

### 6.3 Required cases

| Case | Seed | Assert |
| --- | --- | --- |
| Full pipeline, xp grant | 7 | Emit `enemy:killed` (BRUTE_KILL) → exactly one drop spawns, kind `chest`, at `(120, 240)`. Collect via the captured overlap callback → `xp:gained` fired once with `amount: 15`; `drop:collected` fired once with `{ kind: 'xp', amount: 15, x: 120, y: 240 }`; no event carries `kind: 'chest'`; drop destroyed. |
| Full pipeline, scrap grant | 12 | Same flow → `runState.currency === 10`; `currency:changed` fired once with `{ runTotal: 10 }`; `drop:collected` `{ kind: 'scrap', amount: 10 }`. |
| Full pipeline, high scrap grant | 79 | Same flow → `runState.currency === 40`; `{ runTotal: 40 }`. |
| Table kill, non-chest control | 2 | Kill spawns one `xp` drop, `amount === 6`, at the kill point; no chest involved. |
| Determinism, full loop | 7 | Two independent harness instances, same seed, same event order (kill → collect) → identical spawned-grant sequences, identical `drop:collected` sequences, identical final `runState.currency`/`level`. |
| Nested-chest defence | any | Rigged `LootTableLookup` whose chest target contains a `chest` entry → collect → no grants applied, no recursive spawn, no `drop:collected`, drop destroyed. (Shipped validation forbids this; the harness pins the runtime guard.) |
| Missing chest table | any | Rigged lookup returning `undefined` → collect does not throw, grants nothing, emits nothing, destroys the drop. |

Assertion guidance:

- For the xp case, assert on the **`xp:gained` payload** (`amount: 15`,
  `total: 15`), not raw `runState.xp` — a fresh run state's `xpToNext` is 5,
  so +15 xp legitimately fires `level:up` and drains `xp` (see
  [xp.ts:22-32](../../src/gameplay/xp.ts)). Alternatively set
  `runState.xpToNext = 1000` before collecting to isolate the grant. Either
  is acceptable; do not assert `level === 1`.
- For scrap cases, assert the post-add **total** on `currency:changed`, and
  that `runState.currency` is the unrounded face value (no flooring mid-run).
- Drive collection through the captured overlap callback with the spawned
  sprite, after setting it `active = true` — the established
  `dropSystem.test.ts` pattern.

## 7. `tests/dropSystem.test.ts` changes

### 7.1 Rewrite the interim chest test

The test at line 483 ("destroys a chest drop without granting or emitting
drop:collected") pins Slice 4's interim contract, which this slice replaces.
Rewrite it to the new contract: a chest drop whose stubbed lookup grants xp
applies the grant and emits `drop:collected` with `kind: 'xp'` — and never
emits `kind: 'chest'`.

### 7.2 New unit cases

| Case | Assert |
| --- | --- |
| Chest → xp grant | `applyXp` path — `xp:gained` emitted; `drop:collected` `{ kind: 'xp', amount, x: chest.x, y: chest.y }` at face value |
| Chest → scrap grant | `currency += amount × currencyGain`; `currency:changed` carries the post-add total |
| Chest under non-1 `currencyGain` | Multiplier applies to chest-granted scrap exactly as to direct scrap; `drop:collected` still face value |
| Chest consumes one draw | An `rng.next` spy is called exactly once per chest open |
| Nested chest grant | Rigged lookup returning a `chest` grant from the chest open → filtered, no recursion, no events, drop destroyed |
| Missing chest table | Lookup returns `undefined` → no throw, no grants, no events, drop destroyed |
| Chest drop without `tableId` | No grants, no events, drop destroyed |
| `'nothing'` chest outcome | Rigged lookup granting `[]` → no events, drop destroyed |
| No chest-kind event | Across all chest cases, `drop:collected` is never emitted with `kind: 'chest'` |
| Non-active run | Chest collection in `paused`/`won`/`lost` grants nothing (the existing `collect` gate) |

All Slice 4 cases stay intact.

## 8. Docs sign-off (Epic 8 completion — delivered)

Part of this slice per issue #57. The following edits were delivered in PR
#62; the list is retained as the completion record.

- `docs/epics.md`
  - Epic Order table, Epic 8 row (line 297): Status → **Complete**; text →
    "Slices 1–5 merged in PRs #58–61 and #62; event-driven kill-to-loot, live
    scrap economy, fixture-proven chest shell; architecture in
    [`architecture/epic-8-loot-and-economy.md`](architecture/epic-8-loot-and-economy.md)."
  - Suggested Build Sequence, item 7 (lines 338–340): → "Epic 8 is complete
    (Slices 1–5, PRs #58–61 and #62). Then implement Epics 9 and 10 as their
    dependencies become available."
- `docs/roadmap.md`
  - Current Position: add "Epic 8 / Loot and Economy: complete (#9)." to the
    list; replace the "Epic 8 is underway … under review in PR #61" sentence
    (lines 15–16) with "Epic 8 completed across five slices (PRs #58–61 and
    #62); Epic 9 (UI and UX) is next."
  - Replace the stale "The current `main` branch contains … PR #61 rewires …"
    paragraph (lines 29–32) with a sentence stating `main` now holds the
    complete Epic 8: event-driven kill-to-loot, live scrap economy, and the
    fixture/hotkey-proven chest shell.
- `docs/knowledge-graph.md`
  - Header (lines 4–5): → "Current state: **Epics 0–8 complete** (Epic 8 via
    PRs #58–61 and #62). Epic 9 is next …" Update the test-count line at
    delivery.
  - Slice-summary paragraph (lines 29–32): add one sentence — Slice 5 added
    chest collection (immediate xp/scrap grants), the dev-only F10 chest
    hotkey, and the loot integration harness.
  - Runtime Shape heading (line 34): "(after Epic 8 Slice 4)" → "(after Epic 8)".
  - Epic Pipeline table, row 8 (line 146): → `| 8 | ✅ | Loot & economy:
    event-driven kill-to-loot, scrap economy, chest shell (PRs #58–61, #62) |`
- `docs/architecture/epic-8-loot-and-economy.md`
  - Status header (lines 3–9): → "Epic 8 complete: all five slices merged
    (PRs #58–61 and #62)." Keep the supersession note.
  - §6 slice table: Slice 4 row → "— **merged #61**" (stale today); Slice 5
    row → append "— **merged #62**".
  - Post-table paragraph (lines 465–472): rewrite to final state — Slices 1–5
    are merged; the shipped run has guaranteed xp+scrap drops with
    overlap-only collection; the chest shell is proven by fixtures and the
    F10 dev hotkey with no shipped content exercising it.
  - Do not touch the frozen contracts (§4) or reviewer traps (§10) beyond
    these status edits.
- `docs/architecture.md`: no change required — it indexes the Epic 8
  overview, which stays the epic's source of truth.
- This document's Status line: → "implemented and merged via #62" at
  delivery.

## 9. Acceptance checklist

- [x] A collected chest resolves its table with the `'loot'` stream and
      grants xp/scrap immediately; one `drop:collected` per grant, kinds
      `'xp' | 'scrap'` only, face values, at the chest's position.
- [x] Chest grants apply `xpGain`/`currencyGain` exactly like direct drops;
      `currency:changed` carries the post-add total; no mid-run rounding.
- [x] Recursion is impossible and defended: nested chest grants filtered,
      missing table/tableId fail soft, no throw, drop always destroyed.
- [x] One `rng.next()` per chest open on the shared stream; identical seeds +
      kill/collect order ⇒ identical drops and grants (harness-proven).
- [x] F10 spawns a `chest-standard` chest next to the player in `npm run
      dev`; it is unregistered in production builds; no new `DropSystem` API.
- [x] `tests/lootIntegration.test.ts` green with the §6.2 seeds; interim
      chest test rewritten; all Slice 4 tests intact.
- [x] No new events, no `GameEventMap` change, no `MetaState` writes, no
      `Math.random()`, no shipped enemy gains a `lootTableId`, no data/config
      changes.
- [x] `docs/epics.md`, `docs/roadmap.md`, `docs/knowledge-graph.md`, and the
      Epic 8 overview reflect Epic 8 completion.
- [x] `npm test`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`
      all green.
- [ ] Manual playtest (dev build): drops visible on the 390×844 canvas,
      magnet pickup feels right at the shipped `magnetSpeed` **450** (§2.1),
      the HUD scrap counter increments, F10 chest opens grant loot.

## 10. Reviewer traps

- Do not emit `drop:collected` with `kind: 'chest'`, and do not widen the
  payload union or add a `chest:opened`/`loot:resolved` event.
- Do not spawn physical sub-drops from a chest open — the grant is immediate.
- Do not follow a nested chest grant — filter it; recursion defence lives at
  collection, validation owns the guarantee.
- Do not let a chest open throw on a missing table — fail soft; never crash a
  live run. Emit a targeted warning so stale or corrupted runtime data is not
  silent.
- Do not create a second RNG stream for chests and do not re-seed; chest
  opens draw from the shared `'loot'` stream in event order.
- Do not apply `currencyGain`/`xpGain` inside `resolveLoot`, and do not floor
  `RunState.currency` mid-run.
- Do not attach `lootTableId` to a shipped enemy (Epic 11 owns that); the
  hotkey spawns `chest-standard` directly and needs no data change.
- Keep `Drop.ts`, `lootTables.ts`, `validation.ts`, `eventBus.ts`, and
  `config.ts` outside chest-collection fixes unless a new contract requires
  them. `loot.ts` owns the shared runtime grant-validation boundary.
- Reuse `tests/__mocks__/phaser.ts` for DropSystem and loot-integration tests;
  load its side-effectful mock before modules that resolve Phaser.
- Do not register F10 outside the `RuntimeConfig.isDev` block, and do not
  forget the `handleShutdown` removal — a leaked binding double-spawns after
  `restartRun`.
- Do not use the issue's `magnetSpeed 300` anywhere (§2.1).
- Do not leave the Slice 4 interim chest test in place — rewrite it (§7.1).

## 11. Historical implementation and delivery handoff

The prompt below records the original PR #62 handoff. The implementation is
already merged; do not re-run it as a new work package.

> Complete Epic 8 Slice 5 (chest shell + integration harness + docs
> sign-off) on `agent/epic-8-slice-5-chest-shell`, the head branch of this
> PR. Keep all implementation, tests, and docs sign-off in this PR.
>
> `docs/architecture/epic-8-slice-5-chest-shell.md` is authoritative and
> supersedes issue #57 wherever they differ — §2.1 lists the two stale items,
> including a `magnetSpeed 300` reference that would mis-tune the playtest.
>
> Read §2 and inspect the baseline before writing code: `gameplay/loot.ts`,
> `entities/Drop.ts`, `systems/lootTables.ts`, and `loot-tables.json` are
> complete and must not be modified. The slice is: one `DropSystem.collect`
> extension with two extracted grant helpers (§4 — use the sketched code
> verbatim unless the compiler objects), a `dropSystem` field promotion plus
> F10 dev hotkey in `GameScene` (§5), one new integration harness with the
> pre-computed seeds in §6.2, a rewritten interim chest test plus new cases
> in §7, and the four-file docs sign-off in §8 with this PR's number.
>
> §9 is the acceptance gate; §10 is the reviewer-trap list. Before handing
> back, run the focused DropSystem/loot-integration tests, the full Vitest
> suite, `npx tsc --noEmit`, `npm run build`, `git diff --check`, and grep
> `src/ tests/` for `kind: 'chest'` event emissions (there must be none).
> Report exact test counts and the tested commit, and update
> `docs/knowledge-graph.md`'s count line to match.
