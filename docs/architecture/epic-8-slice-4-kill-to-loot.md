# Epic 8 Slice 4: Kill-to-Loot Pipeline

Status: **implementation delivered for review in PR #61**. Epic 8 Slice 4 /
issue #56. Implementation baseline: `main` at `c4ec822`, after PRs #58
(Slice 1), #59 (Slice 2), #60 (Slice 3), and #51 (Epic 7), plus this
architecture handoff.

This document is the architecture contract and implementation work package for
the slice. PR #61 is the delivery vehicle for the complete implementation,
tests, and architecture sign-off; it is not a docs-only architecture PR. The
contract refines the Epic 8 overview §4.5, §4.7, and §4.8 into an exact,
bounded coding task. When this document and issue #56 differ, **this document
is authoritative** — issue #56 was written against the pre-#59 baseline and
three of its statements are now stale. §2.1 lists every divergence.

## 1. Outcome

Move kill-to-loot fully onto the event bus:

- `WeaponSystem` stops creating drops and only emits `enemy:killed`;
- `DropSystem` subscribes to `enemy:killed`, resolves grants through the pure
  `resolveKillLoot`, and spawns one `Drop` per grant at the kill point;
- collection applies `xpGain` to xp and `currencyGain` to scrap, filling
  `RunState.currency` mid-run and emitting `currency:changed`;
- `XpDrop.ts`, `XpDropFactory`, and `gameplay.xpDrop` are deleted;
- one dev-grade HUD line shows scrap.

After this slice the scrap economy is live end-to-end. Epic 5's banking picks up
`RunState.currency` unchanged — this slice writes no `MetaState`.

Chest **collection** stays out of scope (Slice 5) even though chest *grants* are
representable. §7.3 pins the required interim behaviour.

## 2. Baseline evidence

Read these before writing code. The slice is mostly deletion and rewiring; the
hard parts already exist.

- `src/gameplay/loot.ts` (Slice 2) is complete and correct: `resolveKillLoot`
  already fails soft to `defaultLoot` on a missing/throwing table, and
  `defaultLoot` already consumes no RNG. **Do not modify this file.**
- `src/entities/Drop.ts` (Slice 3) is complete: `spawn`/`update`/`reset`/
  `destroy`, three kind colours, velocity-only homing, and a double `active`
  guard. **Do not modify this file.** Its `update()` already no-ops for
  `pickupRadius <= 0`, which is where the negative-clamp behaviour now lives.
- `src/systems/lootTables.ts` (Slice 1) provides `DataLootTableRegistry` and the
  `LootTableLookup` interface `resolveKillLoot` consumes.
- `src/systems/DropSystem.ts` is the file being reworked. Its `compactActive`
  helper and `arcadeGameObject` coercion are reusable as-is.
- `src/gameplay/xp.ts` `applyXp(runState, amount, bus)` already applies `xpGain`,
  emits `xp:gained`/`level:up`, and returns levels gained. Scrap has no
  equivalent helper and does not need one — §7.2 keeps the arithmetic inline.
- `src/systems/ProgressionSystem.ts` → `computeRunReward` → `sanitizeScrap`
  floors `RunState.currency` at bank time. Mid-run currency stays unrounded.
- `tests/dropSystem.test.ts` and `tests/weaponSystem.test.ts` establish the
  mocked-Phaser style. Extend the mock only with methods new code calls.

### 2.1 Corrections to issue #56

Three items in the issue's "Creates / modifies" list are stale or wrong. The
hand-off must follow this document, not the issue.

| Issue #56 says | Reality on `main` | Action |
| --- | --- | --- |
| `src/engine/eventBus.ts` — `enemy:killed` gains `scrapValue` and `lootTableId` | Already landed in PR #59. [`eventBus.ts:11`](../../src/engine/eventBus.ts) already declares both fields. | **No eventBus change in this slice.** Epic 8's event budget is already spent. |
| `src/entities/Enemy.ts` — add `scrapValue` and `lootTableId` getters | `scrapValue` already exists ([`Enemy.ts:75`](../../src/entities/Enemy.ts)). `lootTableId` does not, but `WeaponSystem` already reads `enemy.definition.lootTableId` directly and works. | Adding the `lootTableId` getter is **optional cleanup**, not required. If added, use it at the one call site; do not leave both spellings. |
| `gameplay.drop = { radius: 8, magnetSpeed: 300 }` | **300 is too slow and would ship a live bug.** See §6. | Use `magnetSpeed: 450`, per overview §4.8. |

The issue also lists "enriched `enemy:killed` emission" as `WeaponSystem` work.
That emission already exists at [`WeaponSystem.ts:199-205`](../../src/systems/WeaponSystem.ts).
The only `WeaponSystem` work in this slice is **deletion** (§5.2).

### 2.2 PR #61 implementation-audit amendments

The architecture pass over the implementation pins three details that a
follow-up agent must preserve:

1. **Physics Group insertion precedes `Drop.spawn`.**
   `Phaser.Physics.Arcade.Group.add` reapplies body defaults, including
   enablement and velocity. Follow the repository's `Projectile` precedent:
   construct → retain → add to the group → spawn. `spawn` must own the final
   position, body shape, enablement, and velocity.
2. **The kill handler is typed from `GameEventMap`.**
   Use `GameEventListener<'enemy:killed'>` instead of duplicating the payload
   shape inside `DropSystem`; future event-contract drift must fail at compile
   time.
3. **Determinism coverage uses the real named RNG stream.**
   The table-path system test creates two RNGs from the same
   `deriveRunSeed(seed, 'loot')`, feeds the same ordered kills, and compares the
   collected grant sequence. A constant RNG stub does not prove the
   seed-and-order contract.

## 3. Scope and ownership

### Modify

- `src/systems/DropSystem.ts` — full rework (§7)
- `src/systems/WeaponSystem.ts` — deletion only (§5.2)
- `src/engine/config.ts` — `gameplay.xpDrop` → `gameplay.drop` (§6)
- `src/scenes/GameScene.ts` — rewiring + one HUD line (§8)
- `src/entities/Enemy.ts` — optional `lootTableId` getter (§2.1)

### Delete

- `src/entities/XpDrop.ts` — entire file

### Tests

- `tests/dropSystem.test.ts` — rewrite (§9)
- `tests/weaponSystem.test.ts` — drop the factory harness field and its two
  assertions (§9.2)

### Explicitly do not touch

- `src/gameplay/loot.ts`, `src/entities/Drop.ts`, `src/systems/lootTables.ts`
- `src/engine/eventBus.ts` (§2.1)
- `src/data/*.json` — in particular, **do not attach `lootTableId` to any
  shipped enemy** (overview §10; that is Epic 11 balancing)
- `src/systems/validation.ts`, `src/gameplay/xp.ts`, `src/gameplay/meta.ts`,
  `src/systems/ProgressionSystem.ts`
- save/meta state, `src/gameplay/stats.ts`, dependencies, build config

If implementation appears to require one of those, stop and report the contract
mismatch rather than broadening the slice.

## 4. Behavioural change this slice ships

The starter run changes in exactly two visible ways. Both are intended.

1. **Every kill now drops scrap in addition to XP.** All three shipped enemies
   have `scrapValue > 0` (`dust-mite` 1, `junk-rusher` 2, `trash-brute` 5), so
   `defaultLoot` returns two grants per kill and `RunState.currency` fills
   during the run for the first time.
2. **Collection becomes physics-overlap-only.** Today `DropSystem.update()`
   collects any drop inside the resolved `pickupRadius`
   ([`DropSystem.ts:43-47`](../../src/systems/DropSystem.ts)) *and* the overlap
   callback re-checks that radius. After this slice, `pickupRadius` controls the
   **magnet only**; collection fires on body contact.

The consequence of (2) must be understood before implementing: **a player who
physically walks onto a drop collects it even when the resolved `pickupRadius`
is 0 or negative.** That is correct — the radius is the magnet's reach, not a
collection permission — and it matches overview §9 ("collection happens on
physics overlap only"). It does invalidate the assumption pinned by today's
`dropSystem.test.ts`, which is why §9.1 rewrites that test as a magnet test
rather than deleting it.

No other run-visible behaviour changes. Loot tables stay unreferenced by shipped
enemies, so the RNG-consuming table path is exercised only by fixtures.

## 5. WeaponSystem: deletion only

### 5.1 Keep exactly as-is

The kill block at [`WeaponSystem.ts:199-205`](../../src/systems/WeaponSystem.ts)
already emits the full enriched payload:

```ts
this.ctx.bus.emit('enemy:killed', {
  instanceId: …, enemyId: …, xpValue: …,
  scrapValue: enemy.scrapValue,
  ...(enemy.definition.lootTableId ? { lootTableId: enemy.definition.lootTableId } : {}),
  x: hitX, y: hitY,
});
```

Do not reorder it, do not move `kills += 1`, and do not change the conditional
spread (overview §10). The spread is deliberate: it keeps `lootTableId` absent
rather than `undefined`, which matters for exact-payload test assertions.

### 5.2 Delete

| Location | Delete |
| --- | --- |
| line 8 | `import type { XpDrop } from '../entities/XpDrop';` |
| line 15 | `export type XpDropFactory = …` |
| line 35 | the `private readonly createXpDrop: XpDropFactory,` constructor parameter |
| line 208 | `this.createXpDrop(hitX, hitY, enemy.xpValue);` |

After this, `WeaponSystem` must import no drop type and contain no drop code.
The constructor keeps every other parameter in its current order — removing one
positional parameter is the whole signature change, and `GameScene` is its only
production caller.

## 6. Runtime config, and the magnet-speed ceiling

```ts
// src/engine/config.ts
gameplay: {
  player: { … },
  projectile: { radius: 4 },
  drop: { radius: 8, magnetSpeed: 450 },   // replaces xpDrop
},
```

`gameplay.xpDrop` is deleted in this slice, not deprecated.

**`magnetSpeed` must exceed the maximum attainable player `moveSpeed`.** Once
collection depends on physical overlap (§4), a drop that homes slower than the
player can be outrun indefinitely — the player tows an uncollectable drop
forever. The ceiling, recomputed against current data:

| Factor | Source | Value |
| --- | --- | --- |
| `bolt-hound` base `moveSpeed` | `characters.json:24` | 205 |
| `quick-tail` passive | `characters.json:32` | ×1.05 |
| `Quick Paws Training`, maxLevel 5 | `meta-upgrades.json:16` | ×1.03⁵ |
| move-speed card, maxStacks 5 | `upgrades.json:9` | ×1.08⁵ |

`ModifierStack.resolve` ([`stats.ts:53-70`](../../src/gameplay/stats.ts)) applies
all `add` modifiers, then all `mult` modifiers multiplicatively, so these
compose: `205 × 1.05 × 1.03⁵ × 1.08⁵ ≈ 366.6`.

`450` clears that with ~23% headroom. **Do not use the `300` from issue #56** —
it sits below the ceiling and ships the bug described above. Re-check this
number whenever base `moveSpeed`, the passive, or either stack limit changes.

## 7. DropSystem contract

```ts
export interface DropSystemOptions {
  readonly scene: Phaser.Scene;
  readonly ctx: GameContext;
  readonly runState: RunState;
  readonly player: Player;
  readonly dropGroup: Phaser.Physics.Arcade.Group;
  readonly lootTables: LootTableLookup;
  readonly rng: Pick<Rng, 'next'>;
  readonly dropRadius: number;
  readonly magnetSpeed: number;
  readonly basePickupRadius: number;
}

export class DropSystem implements System {
  constructor(options: DropSystemOptions);
  spawnDrop(x: number, y: number, grant: LootGrant): Drop;
  update(dtMs: number): void;
  destroy(): void;
}
```

The positional constructor becomes an options object — nine parameters is past
the point where positional order is safe, and `HazardSystem`/`UpgradeSystem`
already establish the options-object precedent in this codebase.

`update` gains a `dtMs` parameter it does not have today; it must forward it to
`Drop.update`. `System.update(dtMs)` already passes it.

### 7.1 Construction and subscription

1. Register the player × `dropGroup` overlap exactly as today (same
   `arcadeGameObject` coercion, same bound-callback pattern).
2. Subscribe to `enemy:killed`. Keep the handler reference so `destroy()` can
   unsubscribe — a leaked subscription across a scene restart would double every
   drop, and `GameScene.restartRun` makes that reachable.

On the event:

```ts
const grants = resolveKillLoot(payload, this.lootTables, this.rng);
for (const grant of grants) this.spawnDrop(payload.x, payload.y, grant);
```

`payload` satisfies `LootSourceInfo` structurally (`xpValue`, `scrapValue`,
optional `lootTableId`) — pass it directly, do not rebuild it.

The subscription fires synchronously inside `WeaponSystem`'s emit. Ordering
relative to `PassiveCoordinator`'s listener does not matter; the side effects are
independent.

**Gate on run status.** Ignore the event unless `runState.status === 'active'`,
so a kill resolved during teardown cannot spawn orphan drops.

### 7.2 spawnDrop

```ts
spawnDrop(x: number, y: number, grant: LootGrant): Drop {
  const drop = new Drop(this.scene, this.dropRadius);
  this.drops.push(drop);
  this.dropGroup.add(drop.sprite);
  drop.spawn(x, y, grant.kind, grant.amount, grant.kind === 'chest' ? grant.tableId : undefined);
  return drop;
}
```

`LootGrant`'s discriminated union makes `grant.tableId` reachable only on the
chest branch — narrow on `grant.kind`, do not cast. `Drop.spawn` already ignores
`tableId` for non-chest kinds, so the narrowing is belt-and-braces, and
`DropKind` is deliberately a structural duplicate of `LootGrant['kind']`
(Slice 3 §4): this call site is the compile-time check that they have not
diverged. If it fails to compile, fix the divergence — do not add a cast.

Construct, retain, and add to the Physics Group before `spawn`. Phaser reapplies
group body defaults on insertion, so `spawn` must run last and own the final
body state. This mirrors `WeaponSystem`'s projectile ordering and keeps the pool
swap in Epic 12 localized to this method.

### 7.3 update

```ts
update(dtMs: number): void {
  if (this.runState.status !== 'active') return;
  const pickupRadius = Math.max(0, this.runState.stats.resolve('pickupRadius', this.basePickupRadius));
  const playerPos = { x: this.player.x, y: this.player.y };
  for (const drop of this.drops) drop.update(dtMs, playerPos, pickupRadius, this.magnetSpeed);
  compactActive(this.drops);
}
```

- Resolve `pickupRadius` **once per tick**, not once per drop — it is the same
  value for every drop and `resolve` walks the whole modifier list.
- The `Math.max(0, …)` clamp is required and is what the rewritten negative-
  clamp test pins (§9.1).
- `update` must **not** collect. Collection is the overlap callback's job alone.

### 7.4 Collection

The overlap callback, after the existing `arcadeGameObject` coercion and the
`this.drops.find(…)` lookup:

```
if (runState.status !== 'active' || !drop.active) return;
switch (drop.kind):
  'xp'    → applyXp(runState, drop.amount, bus)
  'scrap' → gained = drop.amount * stats.resolve('currencyGain', 1)
            if (Number.isFinite(gained) && gained > 0) {
              runState.currency += gained;
              bus.emit('currency:changed', { runTotal: runState.currency });
            }
  'chest' → no grant application this slice (§7.5)
emit 'drop:collected' { kind, amount: drop.amount, x: drop.x, y: drop.y }
drop.destroy()
```

Pinned details, each of which is a reviewer trap:

- **`drop:collected` carries the face value**, not the multiplier-adjusted
  amount. Adjusted XP surfaces on `xp:gained`; adjusted scrap surfaces on
  `currency:changed`. Emit it regardless of whether the multiplier guard passed.
- **`currency:changed.runTotal` is the post-add total**, not the delta.
- **Do not floor or round `runState.currency`.** `sanitizeScrap` owns flooring
  at bank time (overview §10).
- **Do not apply `currencyGain` inside `resolveLoot`.** Grants are face values;
  multipliers apply only here.
- The drop is `destroy()`ed after collection, matching today's behaviour.
  `Drop.reset()` exists for Epic 12's pool and is deliberately unused here.

### 7.5 Chest grants in this slice

Chest collection is Slice 5. But a chest grant is *representable* the moment
`spawnDrop` accepts a `LootGrant`, and `brute-cache` (the only table with a
chest entry) is reachable from any fixture that sets `lootTableId`.

Required interim behaviour: a collected chest emits **no** `drop:collected` and
grants nothing, then destroys like any other drop. Do not silently treat it as
scrap, and do not add `'chest'` to the `drop:collected` payload union — that
union stays `'xp' | 'scrap'` because Slice 5 maps chest contents onto xp/scrap
grants rather than reporting the chest itself.

No shipped enemy references a table, so this path is unreachable in the shipped
run. It must still be explicit rather than a fall-through.

### 7.6 destroy

Unsubscribe the `enemy:killed` handler first, then destroy all drops and clear
the array (today's behaviour). Unsubscribing after teardown would leave a window
where a late event spawns drops into a dead scene.

## 8. GameScene wiring

```ts
const lootRng = createRng(deriveRunSeed(this.runState.seed, 'loot'));
const lootTables = new DataLootTableRegistry(ctx.data);

const dropSystem = new DropSystem({
  scene: this, ctx, runState: this.runState, player: this.player,
  dropGroup: this.dropGroup, lootTables, rng: lootRng,
  dropRadius: RuntimeConfig.gameplay.drop.radius,
  magnetSpeed: RuntimeConfig.gameplay.drop.magnetSpeed,
  basePickupRadius: RuntimeConfig.gameplay.player.pickupRadius,
});
```

- Add `lootRng` beside the existing `spawnRng`/`upgradeRng` derivations at
  [`GameScene.ts:104-105`](../../src/scenes/GameScene.ts). The `'loot'` stream
  name is fixed — it is what makes loot reproducible per seed.
- Drop `dropSystem.createXpDrop.bind(dropSystem)` from the `WeaponSystem`
  construction at line 178.
- `DropSystem` keeps its current position in the `this.systems` array (after
  `WeaponSystem`). Ordering is not load-bearing — the subscription is
  synchronous — but leaving it put keeps the diff honest.
- HUD: add `` `Scrap: ${Math.floor(runState.currency)}` `` to the `updateHud`
  array, after the `Kills:` line. Dev-grade legibility only; Epic 9 owns real
  UI. `Math.floor` is display-only and must not write back to `runState`.

`this.dropGroup` teardown at line 350 is unchanged.

## 9. Test architecture

### 9.1 tests/dropSystem.test.ts — rewrite

The existing single test ("clamps a negative resolved pickup radius instead of
squaring it positive") pins a behaviour that §4 deliberately changes: it asserts
a drop inside a *negative* radius is not collected by `update()`. Under
overlap-only collection that assertion no longer describes the system.

**Preserve its intent, not its mechanism.** The clamp still matters — it is what
stops `pickupRadius = -20` from being squared into a 400-unit magnet. Rewrite it
to assert that `Drop.update` receives a clamped `0` (spy on the drop, or assert
zero velocity), rather than asserting non-collection.

Required coverage:

| Case | Assert |
| --- | --- |
| Default-path kill | One xp + one scrap drop, both `amount > 0`, both at `(payload.x, payload.y)` |
| Table-path kill | Deterministic grants for a fixed seed; identical seed + kill order ⇒ identical drops |
| Default path consumes no RNG | An `rng.next` spy is never called |
| Missing `lootTableId` table | Falls back to default grants; does not throw |
| xp collection | `applyXp` path — `xpGain` applied, `xp:gained` emitted |
| scrap collection | `currency += amount × currencyGain`; `currency:changed` carries post-add total |
| `drop:collected` face value | Emitted with unadjusted `amount` under a non-1 multiplier |
| Non-finite / ≤0 `currencyGain` result | No currency write, no `currency:changed`, but `drop:collected` still emitted |
| Magnet radius from stats | Resolved radius forwarded to `Drop.update` |
| Negative radius clamp | Clamped to `0` (rewritten test above) |
| Paused run | `update` no-ops; `enemy:killed` spawns nothing |
| `destroy()` | Unsubscribes — a later `enemy:killed` spawns no drops |
| Chest grant collection | No `drop:collected`, no currency/xp change, drop destroyed (§7.5) |

### 9.2 tests/weaponSystem.test.ts — trim

Remove the `createXpDrop` harness field (line 91), both `vi.fn()` bindings
(lines 192, 202, 213), and the two assertions at lines 303 and 336. The test at
line 269 ("applies hit, kill, and XP-drop side effects once per projectile/enemy
pair") loses its drop assertion — keep the test and its `enemy:killed`
assertions, and rename it to drop "XP-drop" from the title.

The exact-payload assertions at lines 138-142 already include `scrapValue` and
must keep passing unchanged.

### 9.3 No changes needed

`tests/passiveCoordinator.test.ts` already emits `scrapValue` on its
`enemy:killed` payloads (landed in #59). Issue #56's "mechanical `scrapValue`
additions" item is stale — verify, then leave it alone.

## 10. Acceptance checklist

- [ ] A kill emits exactly one `enemy:killed`; default-path kills spawn one xp
      and one scrap drop at the kill point.
- [ ] Table-path drops are deterministic per seed and kill order; the default
      path consumes no RNG.
- [ ] Scrap collection increments `RunState.currency` by the `currencyGain`-
      adjusted amount and emits `currency:changed` with the post-add total.
- [ ] XP collection flows through `applyXp`; `drop:collected` carries face
      values.
- [ ] `pickupRadius` drives the magnet only; collection is overlap-only; the
      negative clamp holds.
- [ ] `WeaponSystem` contains no drop code and imports no drop type.
- [ ] `XpDrop.ts`, `XpDropFactory`, `createXpDrop`, and `gameplay.xpDrop` are
      all gone — `grep -r "XpDrop\|xpDrop" src/ tests/` returns nothing.
- [ ] `magnetSpeed` is 450 (§6), not 300.
- [ ] No `eventBus.ts` change; no new events; no `MetaState` writes; no
      `Math.random()`; no shipped enemy gains a `lootTableId`.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`
      all green.

## 11. Reviewer traps

- Do not leave `createXpDrop`/`XpDropFactory` anywhere — grep before opening the
  PR.
- Do not add fields to `enemy:killed`, and do not invent `loot:resolved` or
  `scrap:gained`; `drop:collected` and `currency:changed` cover feedback.
- Do not use `Math.random()` or `ctx.menuRng` for loot — only the run-scoped
  `'loot'` stream, and only on the table path.
- Do not let `resolveKillLoot` throw on a missing table; it already fails soft
  and that file is out of scope.
- Do not apply `currencyGain`/`xpGain` inside loot resolution.
- Do not floor or round `RunState.currency` mid-run.
- Do not collect inside `update()` — that is the change this slice makes.
- Do not re-add a pickup-radius gate to the overlap callback.
- Do not give drops colliders or world-bounds behaviour; they home over
  obstacles.
- Do not attach `lootTableId` to a shipped enemy (Epic 11 owns that).
- Do not implement chest collection (Slice 5) — but do handle the chest kind
  explicitly per §7.5.
- Do not modify `Drop.ts` or `loot.ts`; if you think you must, the contract has
  drifted and that is a stop-and-report.

## 12. Implementation and delivery handoff

Use this prompt for a lower-tier agent continuing or validating PR #61:

> Complete Epic 8 Slice 4 (kill-to-loot pipeline) on
> `agent/epic-8-slice-4-kill-to-loot`, the head branch of PR #61. Keep all
> implementation, tests, and architecture corrections in that PR; do not open
> a separate architecture-only PR.
>
> `docs/architecture/epic-8-slice-4-kill-to-loot.md` is authoritative and
> supersedes issue #56 wherever they differ — §2.1 lists the three stale items,
> including a magnet-speed value in the issue that would ship a live bug.
>
> Read §2 and inspect the current PR diff before writing code:
> `gameplay/loot.ts`, `entities/Drop.ts`, and `systems/lootTables.ts` are
> already complete and must not be modified. The enriched `enemy:killed`
> payload already ships. This slice is a rework of `DropSystem`, a deletion
> pass on `WeaponSystem`, a config swap, scene wiring, focused tests, and
> documentation status updates.
>
> §4 describes the one intentional behaviour change (collection becomes
> overlap-only) and why today's `dropSystem.test.ts` must be rewritten rather
> than deleted. Preserve the Physics Group ordering and event-derived handler
> typing in §2.2. §9 lists required coverage. §10 is the acceptance gate; §11
> is the reviewer-trap list.
>
> Before handing back, run the focused DropSystem/WeaponSystem tests, the full
> Vitest suite, `npx tsc --noEmit`, `npm run build`, `git diff --check`, and
> the stale-seam grep from §10. Report exact counts and the tested commit.
