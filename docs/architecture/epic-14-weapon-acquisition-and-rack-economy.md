# Epic 14 — Weapon Acquisition and Rack Economy

**Issue:** #73 · **PR:** #80 · **Branch:** `agent/epic-14-weapon-acquisition` · **Base:** `main` at Epic 13 merge `3318865a095f232c9b6c095a6e1ec89e048850d0`

> Architecture status: **READY FOR IMPLEMENTATION**.
>
> This document is the executable implementation contract for Epic 14. A lower-tier implementation agent should not need another architecture pass. If live code conflicts with this document, stop and resolve the conflict in this PR before inventing a new design.

## 1. Outcome and release posture

Epic 14 makes the weapon/merge loop reachable in ordinary Golden Run play without re-owning later presentation work.

A fresh run must:

1. start with exactly one active weapon;
2. receive a visible physical weapon reward in-world;
3. receive a guaranteed duplicate of the starting weapon as the first weapon reward, due deterministically between 20 s and 40 s of active run time;
4. admit collected weapons into a six-slot active rack;
5. allow the existing merge path to turn two matching T1 instances into one fresh T2 instance, freeing one slot;
6. keep every admitted rack weapon active through the existing `WeaponSystem` behavior;
7. never silently destroy a valid seventh weapon when the rack is full; and
8. produce the same weapon-reward schedule and reward-definition sequence for the same run seed.

This PR remains **draft** until implementation, automated gates, and the manual Golden Run acceptance pass are complete. `Closes #73` belongs on the PR, but the issue closes only when the completed PR merges.

## 2. Live baseline verified before architecture freeze

The architecture below is based on the merged Epic 13 repository, not on assumptions from the issue text.

### 2.1 Rack and starting loadout

- `RunState.equipped: WeaponInstance[]` already exists and is the authoritative runtime rack.
- `prepareRun()` copies the character contribution's starting instances into `run.equipped`.
- `Scrap Tabby` currently starts with three weapons (`scrap-pistol-t1`, `can-smg-t1`, `bolt-shotgun-t1`); `Bolt Hound` already starts with one (`can-smg-t1`).
- There is currently no rack-capacity rule at the mutation boundary.

### 2.2 Weapon identity and merge path

- `WeaponDefinition` is immutable catalogue data.
- `WeaponInstance` contains `instanceId`, `defId`, `family`, and `tier`.
- One run-scoped `DataWeaponRegistry` is constructed in `GameScene` and already supplies starting weapons, inventory/merge, and `WeaponSystem`.
- `DataWeaponRegistry.createWeaponInstance()` is the only production path that allocates sequential `weapon-N` instance IDs.
- `mergeResult()` already creates a fresh next-tier instance through the registry; `replaceMergedWeapons()` already replaces exactly two source instances with exactly one result.
- The merge eligibility rules are correct for this epic and are not to be changed.

### 2.3 Weapon activation

`WeaponSystem.update()` re-reads `runState.equipped` every active frame, keys cadence by `instanceId`, prunes removed instance IDs, and creates cadence state for newly appearing valid instances. Therefore acquisition needs only to admit a valid `WeaponInstance` to the rack. **Do not call into `WeaponSystem`, restart it, or create a parallel activation path.**

### 2.4 Loot and world-drop boundary

- `LootEntry` currently supports `xp`, `scrap`, `chest`, and `nothing`.
- `LootGrant` currently supports XP/scrap scalar grants and chest table references.
- `DropSystem` owns enemy-kill loot resolution, physical drop spawning, player overlap, grant application, and chest resolution.
- `Drop` currently decomposes grant state into `kind`, `amount`, and optional `tableId`.
- `drop:collected` intentionally covers XP/scrap collection only; chest collection resolves its child grant(s) and does not emit a chest `drop:collected` event.

Weapon acquisition must extend this boundary rather than bypass it.

### 2.5 RNG isolation

`GameScene` currently derives independent named run streams for `spawns`, `upgrades`, and `loot`. Epic 14 must add a fourth named stream, `weapon-rewards`. It must not consume the existing `loot` stream for scheduled weapon rewards because doing so would perturb established seeded XP/scrap/chest outcomes.

### 2.6 UI and save boundaries

- `InventoryController` already owns manual-pause merge commands.
- `HudController` already renders the rack from `runState.equipped`.
- Save v2 contains meta scrap, unlock IDs, and permanent-upgrade levels; it contains no weapon inventory/unlock collection that Epic 14 needs to extend.
- Epic 14 therefore requires **no save migration** and **no new persistent weapon state**.

## 3. Frozen decisions

These decisions are not implementation suggestions; they are the required design for this PR.

### D1 — One branch, one PR, ordered gates

All Epic 14 implementation remains on `agent/epic-14-weapon-acquisition` in PR #80. Do not split slices into child PRs. Implement gates in §10 in order so intermediate changes remain reviewable.

### D2 — Six slots are a gameplay invariant at admission, not a new container type

Keep `RunState.equipped` as `WeaponInstance[]`. Add:

```ts
export const WEAPON_RACK_CAPACITY = 6;
```

in new `src/gameplay/weaponRack.ts` and enforce it at every Epic 14 acquisition mutation boundary. Do not introduce `WeaponRack`, six nullable slots, a second inventory array, or save-schema state.

Merging from six to five remains valid because the existing merge command replaces 2 → 1. Starting loadouts and weapon grants must never cause rack length to exceed six.

### D3 — Current playable characters start with one T1 weapon

Change only the shipped starting data needed for the loop:

- `scrap-tabby` → `startingWeaponIds: ["scrap-pistol-t1"]`
- `bolt-hound` remains `startingWeaponIds: ["can-smg-t1"]`

Keep `startingWeaponIds` as an array; do not replace it with a singular schema field. Generic character validation should continue to permit future character designs, but shipped-data tests must pin **exactly one** starting weapon for each current playable character and ensure that weapon resolves to merge tier 1 and fits the six-slot rack.

### D4 — Weapon grants carry only a stable definition ID

Turn `LootEntry` into a true discriminated union while preserving existing XP/scrap/chest/nothing data shapes. Add a weapon entry whose identity is explicit:

```ts
export type LootEntry =
  | { readonly kind: 'xp' | 'scrap'; readonly amount: number; readonly weight: number }
  | { readonly kind: 'chest'; readonly amount: 0; readonly weight: number; readonly tableId: string }
  | { readonly kind: 'weapon'; readonly weight: number; readonly definitionId: string }
  | { readonly kind: 'nothing'; readonly amount: 0; readonly weight: number };
```

`LootKind` becomes `'xp' | 'scrap' | 'chest' | 'weapon' | 'nothing'`.

Extend `LootGrant` as:

```ts
export type LootGrant =
  | { readonly kind: 'xp' | 'scrap'; readonly amount: number }
  | { readonly kind: 'chest'; readonly amount: 0; readonly tableId: string }
  | { readonly kind: 'weapon'; readonly definitionId: string };
```

Never encode a definition ID in `amount`, `tableId`, family, tier, or display name. Never place a `WeaponInstance` in data or in a loot table.

### D5 — Admission checks before instance allocation

Add new `src/gameplay/weaponRack.ts` with two layers:

```ts
export type WeaponAdmissionDecision =
  | { readonly status: 'can-add'; readonly definition: WeaponDefinition }
  | { readonly status: 'rack-full' }
  | { readonly status: 'invalid-definition'; readonly definitionId: string };

export type WeaponAdmissionResult =
  | { readonly status: 'added'; readonly weapon: WeaponInstance; readonly rackCount: number }
  | { readonly status: 'rack-full'; readonly rackCount: number }
  | { readonly status: 'invalid-definition'; readonly definitionId: string; readonly rackCount: number };

export function evaluateWeaponAdmission(
  rack: readonly WeaponInstance[],
  definitionId: string,
  registry: Pick<WeaponRegistry, 'weaponById'>,
): WeaponAdmissionDecision;

export function grantWeaponToRack(
  runState: RunState,
  definitionId: string,
  registry: Pick<WeaponRegistry, 'weaponById' | 'createWeaponInstance'>,
): WeaponAdmissionResult;
```

Required algorithm for `grantWeaponToRack()`:

1. call `evaluateWeaponAdmission()`;
2. if invalid, return `invalid-definition` without mutation and without allocating an instance ID;
3. if `runState.equipped.length >= WEAPON_RACK_CAPACITY`, return `rack-full` without mutation and without allocating an instance ID;
4. only after both checks succeed, call `registry.createWeaponInstance(definition)` exactly once;
5. assign `runState.equipped = [...runState.equipped, weapon]` exactly once;
6. return `added` with the created instance and new rack count.

This ordering is important: a rejected seventh pickup must not burn a `weapon-N` ID.

### D6 — Keep one run-scoped registry

Pass the **same** `weaponRegistry` already constructed in `GameScene` into `DropSystem`. Do not construct another `DataWeaponRegistry` in `DropSystem`, `WeaponRewardSystem`, a view, or a gameplay helper. Starting weapons, acquisitions, and merge results must share one monotonically increasing instance-ID allocator for the run.

### D7 — Physical `Drop` stores the grant union directly

Refactor `Drop` so its authoritative payload is a `LootGrant`, not a set of loosely coupled `kind`/`amount`/`tableId` fields.

Required surface:

```ts
spawn(x: number, y: number, grant: LootGrant): void;
get grant(): LootGrant | undefined;
get pickupBlocked(): boolean;
setPickupBlocked(blocked: boolean): void;
```

`spawn()` stores a shallow copy of the immutable grant and selects presentation from `grant.kind`. `reset()` clears the grant and blocked state. `setPickupBlocked(true)` zeroes velocity; `update()` must not magnetize a blocked drop.

Weapon drops use the existing physical body/pool/overlap boundary and a distinct placeholder geometric color only. Do **not** add weapon sprite assets, actor-art catalogue rows, animations, or final pickup art here; that remains Epic 16.

### D8 — `DropSystem` is the only rack-mutation caller for world pickups

Extend `DropSystem.collect()` with a `weapon` branch. The sequence is:

**Added**

1. call `grantWeaponToRack()`;
2. emit `weapon:acquired` after successful rack assignment;
3. release the physical drop;
4. do **not** emit `drop:collected` for the weapon.

**Rack full**

1. do not change `runState.equipped`;
2. do not allocate a weapon instance;
3. do not release/deactivate/hide the drop;
4. mark that drop `pickupBlocked = true` so repeated overlap callbacks do not spam;
5. emit one `weapon:pickup-blocked` event for that blocking episode;
6. leave the reward visibly in the world.

On each active `DropSystem.update()`, if a blocked weapon drop exists and `runState.equipped.length < WEAPON_RACK_CAPACITY`, clear its blocked flag. It may then magnetize and be collected normally. This is how a player can pause, merge two existing weapons, resume, and then collect the previously blocked reward.

**Invalid definition**

1. do not change the rack;
2. `console.warn` with the definition ID;
3. release the invalid drop so corrupted data cannot create a permanent poison object;
4. emit no acquisition event.

This invalid-data fail-soft behavior is separate from the full-rack path; valid rewards are never silently destroyed because of capacity.

### D9 — Chests may resolve weapon grants, but physical acquisition remains mandatory

When `collectChest()` resolves a child `weapon` grant, do **not** admit it directly. Spawn a new weapon drop at the chest's world `(x, y)`, then finish releasing the chest. This preserves the issue's physical-pickup requirement for every weapon-grant source and future-proofs loot tables without changing current `chest-standard` semantics.

Existing XP/scrap/chest event order and calculations must remain byte-for-byte equivalent in behavior:

- XP: apply XP → emit existing XP/level events as today → emit `drop:collected` → release.
- Scrap: apply currency multiplier → emit `currency:changed` when applicable → emit `drop:collected` → release.
- Chest: resolve child table using its caller-provided RNG → apply/spawn child grant(s) → release chest; chest itself still does not emit `drop:collected`.

### D10 — Scheduled weapon rewards use a dedicated run stream and a dedicated table

Add the named stream in `GameScene`:

```ts
const weaponRewardRng = createRng(deriveRunSeed(this.runState.seed, 'weapon-rewards'));
```

Never use `ctx.menuRng`, `Math.random()`, the `spawns` stream, the `upgrades` stream, or the existing `loot` stream for Epic 14 reward timing or definition selection.

Add this table to `src/data/loot-tables.json`:

```json
{
  "id": "weapon-world",
  "entries": [
    { "kind": "weapon", "definitionId": "scrap-pistol-t1", "weight": 1 },
    { "kind": "weapon", "definitionId": "can-smg-t1", "weight": 1 },
    { "kind": "weapon", "definitionId": "bolt-shotgun-t1", "weight": 1 }
  ]
}
```

The table contains only T1 weapon definitions in Epic 14. Do not add T2/T3 direct drops; tiers above T1 are earned through merging.

Generic loot validation must cross-reference every `weapon.definitionId` against `weapons.json`. Shipped-data tests additionally pin `weapon-world` to valid T1 definitions.

### D11 — First duplicate is guaranteed; later rewards are seeded and repeatable

Add gameplay tuning under `RuntimeConfig.gameplay.weaponRewards`:

```ts
{
  firstMinMs: 20_000,
  firstMaxMs: 40_000,
  repeatMinMs: 30_000,
  repeatMaxMs: 45_000,
  spawnOffset: 64,
}
```

Epic 18 may rebalance these values later. Epic 14 freezes them only to make the functional loop testable now.

Add `src/gameplay/weaponRewards.ts` containing pure/reusable reward rules. It owns:

- `WEAPON_REWARD_TABLE_ID = 'weapon-world'`;
- range validation helpers for timing configuration;
- first-reward selection: return `{ kind: 'weapon', definitionId: startingDefinitionId }` without a weighted-table draw;
- later-reward selection: call existing `resolveLoot(WEAPON_REWARD_TABLE_ID, lootTables, rng)` and accept exactly one `weapon` grant;
- deterministic schedule helpers that use only `rng.int(...)`/`rng.next()` from the provided weapon-reward stream.

Add `src/systems/WeaponRewardSystem.ts`. At construction it snapshots the one starting weapon definition ID from the prepared rack and computes:

```text
nextRewardAtMs = rng.int(firstMinMs, firstMaxMs)
rewardIndex = 0
```

On active update, when `runState.timeMs >= nextRewardAtMs`:

1. reward 0 is always the snapshotted starting definition ID;
2. reward 1+ resolves from `weapon-world` with the same dedicated RNG;
3. spawn a physical weapon drop via the injected `spawnDrop(x, y, grant)` callback;
4. increment `rewardIndex`;
5. advance from the **previous deadline**, not from the current frame time:
   `nextRewardAtMs += rng.int(repeatMinMs, repeatMaxMs)`.

Use a `while (runState.timeMs >= nextRewardAtMs)` loop so a coarse test delta cannot change how many rewards are due. Guard malformed config/table results with a warning and advance the schedule rather than retrying every frame.

Because active run time does not advance while paused, pauses do not consume reward schedule time.

### D12 — World placement is deterministic without consuming reward RNG

Weapon placement must not consume extra RNG draws, because presentation/position changes must not perturb the reward-definition sequence.

`WeaponRewardSystem` uses a deterministic four-position cycle based on `rewardIndex` around the player's current position:

```text
0: (+spawnOffset, 0)
1: (0, +spawnOffset)
2: (-spawnOffset, 0)
3: (0, -spawnOffset)
```

Clamp the point inside arena bounds by at least the existing drop radius. If the clamped candidate lies inside an obstacle expanded by the drop radius, try the remaining cycle positions in order; if all four are invalid, fall back to the player's current bounded position and log a warning. The current Golden Run arena should normally take the first candidate.

`spawnOffset = 64` deliberately exceeds the current default pickup radius (including Scrap Tabby's +15 passive) so the first reward is visible before magnet collection under normal conditions.

### D13 — Full rack means “leave it in the world”, not auto-merge or replacement

Epic 14 does not add weapon discard, replacement, auto-merge, overflow storage, or a seventh pending inventory slot. A full rack produces an explicit blocked world reward. The player may:

- leave it;
- pause and merge a valid pair to free a slot; then
- resume and collect it.

The existing HUD must be minimally updated to display capacity as `Weapons n/6: ...`, so the functional limit is visible. Do not redesign the rack or merge surface; Epic 15 owns that work.

### D14 — Add only two acquisition events

Extend `GameEventMap` and `GAME_EVENT_KEYS` with:

```ts
'weapon:acquired': {
  definitionId: string;
  instanceId: string;
  rackCount: number;
  rackCapacity: number;
  x: number;
  y: number;
};

'weapon:pickup-blocked': {
  definitionId: string;
  reason: 'rack-full';
  rackCount: number;
  rackCapacity: number;
  x: number;
  y: number;
};
```

No other event is needed. Do not broaden `drop:collected` to weapon grants in this epic. Do not add audio-map rows or feedback effects; later feedback work can subscribe to the new acquisition signals.

### D15 — No persistence, dependency, art, merge-rule, or final-UI changes

Epic 14 must not change:

- save version or `MetaState`;
- `package.json` dependencies;
- `src/gameplay/merge.ts` production logic;
- `src/systems/WeaponSystem.ts` production logic;
- Epic 13 actor-view/physics ownership;
- final rack/merge interaction design (Epic 15);
- production weapon/drop sprite art (Epic 16);
- combat/merge feel and audiovisual feedback (Epic 17);
- final economy/pacing balance (Epic 18).

## 4. Exact file ownership

### New production files

| Path | Responsibility |
|---|---|
| `src/gameplay/weaponRack.ts` | rack capacity, pure admission decision, atomic grant command |
| `src/gameplay/weaponRewards.ts` | reward table ID, timing validation/helpers, guaranteed-first and later reward resolution |
| `src/systems/WeaponRewardSystem.ts` | run-time scheduling and physical weapon-drop spawn requests |

### Existing production files to modify

| Path | Required change |
|---|---|
| `src/systems/types.ts` | discriminated `LootEntry`, `weapon` kind/definition ID |
| `src/gameplay/loot.ts` | `weapon` `LootGrant`; entry-to-grant handling without amount overloading |
| `src/entities/Drop.ts` | store `LootGrant`; weapon placeholder presentation; blocked-pickup state |
| `src/systems/DropSystem.ts` | shared weapon registry; weapon admission; full-rack persistence; chest weapon respawn |
| `src/systems/validation.ts` | per-kind weapon entry validation and weapon-definition cross-reference |
| `src/engine/eventBus.ts` | `weapon:acquired`, `weapon:pickup-blocked` |
| `src/engine/config.ts` | temporary Epic 14 reward timing/offset tuning |
| `src/scenes/GameScene.ts` | dedicated RNG, shared-registry/drop wiring, `WeaponRewardSystem` construction/order |
| `src/ui/hud.ts` | display `n/6`; mark dirty on acquisition/merge as required |
| `src/data/characters.json` | Scrap Tabby one-weapon start |
| `src/data/loot-tables.json` | add validated `weapon-world` T1 table |
| `docs/architecture.md` | index this architecture |
| `docs/roadmap.md` | mark Epic 14 architecture PR/work package |

### Production files explicitly not to modify unless a discovered live-code contradiction is documented first

- `src/gameplay/runState.ts`
- `src/gameplay/runStart.ts`
- `src/gameplay/characterContribution.ts`
- `src/gameplay/merge.ts`
- `src/systems/weaponRegistry.ts`
- `src/systems/WeaponSystem.ts`
- `src/ui/inventory.ts`
- `src/ui/pause.ts`
- save/migration files
- actor-art data/assets

If implementation appears to require one of these files, first prove why the frozen contract cannot be satisfied without it and record the architecture delta in this document before changing code.

## 5. Validation contract

`validation.ts` currently validates loot entry fields and cross-references enemy → loot-table IDs. Epic 14 adds the following without weakening current strictness.

### 5.1 Per-kind field rules

Do not use one permissive field set that lets irrelevant properties leak across variants. Validate allowed/required fields by `kind`:

- `xp` / `scrap`: `kind`, `amount`, `weight`; positive integer `amount`.
- `chest`: `kind`, `amount`, `weight`, `tableId`; `amount === 0`; nonempty table ID.
- `nothing`: `kind`, `amount`, `weight`; `amount === 0`.
- `weapon`: `kind`, `definitionId`, `weight`; nonempty content ID; **no `amount` and no `tableId`**.

All weights retain the existing finite nonnegative and positive-total rules.

### 5.2 Cross-reference weapon grants

Add `assertLootWeaponReferences(lootTables, weapons)` to the cross-reference assertion phase used by `validateAllData`. Every weapon loot entry must resolve to one `WeaponDefinition`; an unknown ID is a data validation error before run creation.

Runtime invalid-ID handling in `DropSystem` remains necessary for tests, stale/corrupt runtime inputs, and defense in depth.

### 5.3 Shipped reward-table pins

Tests for the checked-in `weapon-world` table must assert:

- it exists exactly once;
- every entry is `kind: 'weapon'`;
- all three current T1 definitions appear;
- no T2/T3 definition appears;
- all weights are positive;
- seeded weighted resolution returns only valid T1 definition IDs.

Do not make “all future T1 definitions must appear” a generic validator rule; that is a content/pacing decision, not a schema invariant.

## 6. Event and ordering invariants

These invariants are release blockers.

1. `weapon:acquired` is emitted **after** `runState.equipped` contains the fresh instance and **before** the collected drop is returned to the pool.
2. `weapon:pickup-blocked` is emitted at most once per drop per blocked episode.
3. A blocked drop may emit another blocked event only after it was unblocked because rack capacity became available and then encountered a full rack again.
4. Weapon rewards never emit `drop:collected`.
5. Existing XP/scrap/chest event order is unchanged.
6. Scheduled weapon-reward RNG draws never change the existing loot RNG sequence.
7. `WeaponSystem` observes newly admitted/merged rack contents on its normal next update; no acquisition code pokes its cadence map.
8. A failed/blocked admission cannot consume a registry instance ID.

## 7. System construction and update order

`GameScene.create()` must retain one `DataWeaponRegistry` and one `DataLootTableRegistry` per run.

Construct streams together:

```ts
const spawnRng = createRng(deriveRunSeed(seed, 'spawns'));
const upgradeRng = createRng(deriveRunSeed(seed, 'upgrades'));
const lootRng = createRng(deriveRunSeed(seed, 'loot'));
const weaponRewardRng = createRng(deriveRunSeed(seed, 'weapon-rewards'));
```

Pass `weaponRegistry` into `DropSystem` and construct `WeaponRewardSystem` after `DropSystem`, injecting a narrow callback:

```ts
spawnDrop: (x, y, grant) => this.dropSystem!.spawnDrop(x, y, grant)
```

Do not let `WeaponRewardSystem` own Phaser drop objects or the physics group.

Place `WeaponRewardSystem` in `this.systems` immediately before `DropSystem`. A reward spawned on that update then enters the ordinary drop update/physics lifecycle; it cannot mutate the rack directly.

## 8. Test matrix

Every row below is required. Prefer focused unit tests before integration tests.

### 8.1 `tests/weaponRack.test.ts` — new

- empty/partial rack + valid definition → `added`;
- fifth → sixth weapon succeeds;
- six → seventh returns `rack-full` and rack remains exactly six;
- registry `createWeaponInstance` is not called on `rack-full`;
- unknown definition returns `invalid-definition` and does not mutate/allocate;
- successful grant creates exactly one fresh instance with definition-derived family/tier;
- two successful same-definition grants have distinct instance IDs;
- input rack order is preserved and new instance appends at the end.

### 8.2 `tests/weaponRewards.test.ts` — new

- first deadline always lies in inclusive `[20_000, 40_000]`;
- same run seed → same first deadline, subsequent deadlines, and later reward definition sequence;
- different seeds can produce different later outcomes without affecting validity;
- reward index 0 always returns the starting definition ID and does not draw from `weapon-world`;
- reward index 1+ returns only T1 weapon grants from `weapon-world`;
- next deadline advances from prior deadline, not current frame time;
- coarse time jump processes all due rewards deterministically;
- pause/no active update does not alter schedule;
- malformed/missing reward table fails soft once per due reward and advances rather than retry-spamming.

### 8.3 Existing `tests/loot.test.ts`

Add weapon coverage while retaining all old cases:

- weapon entry resolves to `{ kind: 'weapon', definitionId }`;
- definition ID is never represented in `amount`;
- XP/scrap/chest/nothing behavior is unchanged;
- weighted boundary and invalid RNG tests remain green.

### 8.4 Existing `tests/dropSystem.test.ts`

Add:

- collecting a weapon drop admits exactly one instance and releases the drop;
- acquisition event payload matches the fresh instance and rack count;
- full rack leaves valid weapon drop active/visible and does not allocate;
- repeated overlap while blocked does not spam events;
- after a merge/free-slot condition, update unblocks the drop and a subsequent overlap admits it;
- invalid definition warns, releases, and does not mutate rack;
- chest → weapon child resolution spawns a physical weapon drop instead of directly mutating rack;
- XP/scrap/chest regression cases preserve prior event ordering.

### 8.5 Existing `tests/weaponSystem.test.ts`

Do **not** alter production `WeaponSystem`; prove its existing behavior is sufficient:

- all six valid rack instances can each maintain cadence/fire;
- appending a valid acquired instance after system construction causes that instance to fire on normal update;
- merging/removing two and adding the fresh result prunes source cadences and creates result cadence through existing logic.

### 8.6 Existing inventory/merge tests

Add an integration case:

- start at six with one mergeable pair;
- manual-pause merge produces five;
- resume/admission can then add a valid weapon back to six;
- merge still creates a fresh next-tier instance and emits exactly one `weapon:merged`.

### 8.7 Validation/data tests

Cover:

- weapon entry required/unknown/extra fields;
- invalid or missing `definitionId` rejected;
- cross-reference to missing weapon rejected by `validateAllData`;
- current characters each start with exactly one valid T1 weapon;
- `weapon-world` table pins from §5.3;
- existing malformed loot/chest tests remain green.

### 8.8 Event/HUD tests

- `GAME_EVENT_KEYS` stays exhaustive with both new events;
- HUD render key updates after `weapon:acquired` and `weapon:merged`;
- HUD weapon label reports `0/6` through `6/6` correctly without calculating gameplay eligibility.

## 9. Manual Golden Run acceptance

Run on a fresh save with normal gameplay, not test-only direct calls.

1. Select Scrap Tabby. Confirm the run starts with only `Scrap Pistol I` and HUD shows `Weapons 1/6`.
2. Play normally. Between 20 s and 40 s active run time, a distinct physical weapon drop must appear near (not directly under) the player.
3. Collect it. Confirm the rack contains two separate `Scrap Pistol I` instances and both participate in firing.
4. Pause → Inventory. Confirm the two pistols are mergeable through the existing UI. Merge them. Confirm the rack becomes one fresh `Scrap Pistol II` instance and HUD becomes `1/6`.
5. Continue. Later scheduled rewards must introduce T1 rewards from the pistol/SMG/shotgun pool and remain physical pickups.
6. Reach six rack weapons. Confirm all six are active and HUD reads `6/6`.
7. Encounter a seventh valid weapon. Walking over it must **not** make it disappear. It must remain visible and stationary/blocked while the rack is full.
8. If a mergeable pair exists, pause and merge it. Resume. Confirm the blocked world reward becomes collectible and the rack never exceeds six.
9. Confirm normal XP orbs, scrap, chests, leveling, pausing, and merge behavior still work.
10. Repeat with the same run seed in a deterministic test/debug harness and verify the weapon-reward deadlines and definition sequence match.

## 10. Ordered implementation gates

### Gate A — Types, loot contract, validation, shipped data

Implement D4 and the validation/data portions of D10 first. Add/adjust loot and validation tests. No rack mutation or scene wiring yet.

**Exit:** all existing loot tests plus new weapon-entry/data-validation tests pass.

### Gate B — Rack admission core

Add `weaponRack.ts` and its focused tests. Do not touch Phaser code until admission behavior is fully pinned.

**Exit:** capacity, invalid-ID, unique-instance, and no-ID-burn tests pass.

### Gate C — World drop and collection path

Refactor `Drop` payload storage and extend `DropSystem` with shared registry, weapon collection, blocked full-rack behavior, and chest weapon respawn.

**Exit:** drop-system tests prove added/full/invalid/chest paths and old grant event order.

### Gate D — Deterministic reward director

Add `weaponRewards.ts`, `WeaponRewardSystem.ts`, config values, dedicated run RNG, deterministic placement, and scene wiring.

**Exit:** reward schedule/seed tests pass; existing loot-seed tests are unchanged.

### Gate E — Start loadout and minimal capacity presentation

Apply Scrap Tabby's one-weapon data change and HUD `n/6` display/dirty subscriptions. Do not redesign inventory/pause.

**Exit:** run-start/data/HUD tests pass and first manual Golden Run loop is reachable.

### Gate F — Integration, regression, and delivery evidence

Run the entire suite, shuffled suite, type/lint, production build, diff hygiene, and manual acceptance. Record results in §13.

## 11. Reviewer traps / automatic rejection conditions

Reject the implementation if any of the following appear:

- `Math.random()` in Epic 14 gameplay paths;
- scheduled weapon rewards consume `lootRng` or `menuRng`;
- a second `DataWeaponRegistry` is constructed during a run;
- `createWeaponInstance()` runs before rack capacity/definition validation;
- any normal acquisition path directly pushes from a Phaser view or UI class;
- `WeaponRewardSystem` directly mutates `runState.equipped`;
- weapon pickup calls into `WeaponSystem` internals;
- full-rack collection releases/hides/replaces the valid seventh reward;
- automatic merging or automatic replacement/discard is introduced;
- a weapon grant stores family/tier/display name instead of only `definitionId`;
- weapon acquisition is emitted as `drop:collected` instead of the dedicated event;
- a chest directly injects a weapon into the rack without a physical world drop;
- merge eligibility/result logic changes without a separately documented defect;
- save version/meta schema changes;
- weapon/drop art asset work is added;
- final inventory/rack UX is redesigned in this epic;
- existing XP/scrap/chest seeded behavior changes because of weapon-reward RNG draws.

## 12. Required automated gates

Run from the repository root on the completed branch:

```bash
npm test
npx vitest run --sequence.shuffle --sequence.seed=14073
npm run lint
npm run build
git diff --check origin/main...HEAD
```

Additionally review:

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/gameplay/merge.ts src/systems/WeaponSystem.ts src/systems/save.ts package.json
```

The second command should show no production changes in those frozen files. If it does, the PR must explain and architecture must be updated before merge.

## 13. Delivery record

Implementation agent must update this section before requesting final review.

- [x] Gate A complete — loot/data contract
- [x] Gate B complete — rack admission core
- [x] Gate C complete — world pickup/full-rack path
- [x] Gate D complete — deterministic reward director
- [x] Gate E complete — one-weapon starts + HUD capacity
- [x] `npm test`
- [x] shuffled Vitest suite (seed `14073`)
- [x] `npm run lint`
- [x] `npm run build`
- [x] `git diff --check origin/main...HEAD`
- [x] frozen-file diff reviewed
- [ ] manual Golden Run acceptance §9 — interactive browser pass pending reviewer/local execution (see notes below)
- [x] PR remains within Epic 14 scope

### Recorded results (implementation agent, 2026-08-13)

Automated gates (run from the repository root on the delivery branch):

- `npm test` → 85 files / 1288 tests passed.
- `npx vitest run --sequence.shuffle --sequence.seed=14073` → 85 files / 1288 tests passed.
- `npm run lint` (`tsc --noEmit`) → clean.
- `npm run build` (`tsc --noEmit && vite build`) → clean, bundle built.
- `git diff --check origin/main...HEAD` → clean (plus a manual trailing-whitespace scan of the five new files).
- `git diff origin/main...HEAD -- src/gameplay/merge.ts src/systems/WeaponSystem.ts src/systems/save.ts package.json` → no production changes in those frozen files; the same holds for `runState.ts`, `runStart.ts`, `characterContribution.ts`, `weaponRegistry.ts`, `inventory.ts`, and `pause.ts`.

Reviewer-trap scans on the new/modified gameplay paths:

- No `Math.random()` in `weaponRack.ts`, `weaponRewards.ts`, `WeaponRewardSystem.ts`, `DropSystem.ts`, `Drop.ts`, `GameScene.ts`, or `hud.ts`.
- `GameScene` derives exactly one `weapon-rewards` stream and passes it only to `WeaponRewardSystem`; `lootRng` still feeds only `DropSystem`.
- Exactly one `DataWeaponRegistry` per run is constructed in `GameScene`; `DropSystem` and `WeaponRewardSystem` receive it (never construct one).
- `createWeaponInstance` runs only inside `grantWeaponToRack` after definition + capacity checks (no ID burn on rejection).
- `WeaponRewardSystem` never touches `runState.equipped`; it only requests world drops through the injected `spawnDrop` callback.
- Full-rack pickups are blocked in place (not released/hidden/replaced); no auto-merge or discard exists.
- Weapon grants carry only `definitionId`; weapons never emit `drop:collected`; chests respawn weapon grants as physical drops.
- No save version/schema, dependency, actor-art, or final-UI changes.

Delivery delta (frozen-file discovery, none required): no frozen file needed a change; all contracts were satisfied with the file set listed in §4.

Manual Golden Run acceptance (§9): the interactive browser pass must be
executed on a fresh save with normal gameplay — steps 1–10 (one-weapon Scrap
Tabby start, 20–40 s physical first reward, duplicate collection,
pause→Inventory merge to `Scrap Pistol II`, later T1 pool rewards, six-slot
rack, seventh-weapon no-loss blocking, merge-then-collect unblock,
XP/scrap/chest regression, and seeded schedule reproduction). The implementation
agent executed the deterministic/harness portions (schedule deadlines,
definition sequences, full-rack blocking, and unblock after merge) as automated
tests in `tests/weaponRewards.test.ts` and `tests/dropSystem.test.ts`, but the
interactive pass itself requires a browser session on a fresh save and remains
for the reviewer/local execution before the PR leaves draft: run `npm run dev`,
start a run with Scrap Tabby, and walk through §9 steps 1–10.

Deviations from the contract: none intentional. All automated gates and the reviewer-trap scan above are satisfied; §5–§8 test matrices are covered by the committed suites.

## 14. Lower-tier implementation prompt

Use this prompt verbatim or preserve every constraint when handing the PR to an implementation agent:

> Implement Epic 14 / Issue #73 on the existing branch `agent/epic-14-weapon-acquisition` and PR #80. Read `docs/architecture/epic-14-weapon-acquisition-and-rack-economy.md` completely before editing. Treat every Frozen Decision, file-ownership rule, gate, test requirement, reviewer trap, and non-goal as binding. Work Gates A→F in order. Do not redesign architecture. Do not use `Math.random`, do not reuse the `loot` RNG stream for weapon rewards, do not create a second weapon registry, do not allocate an instance before admission succeeds, do not change merge or WeaponSystem production logic, and never silently consume a full-rack weapon pickup. Keep the PR draft until all automated gates and the manual Golden Run pass are recorded in the delivery record.

## 15. Architecture-review prompt

For the final architecture/reviewer pass:

> Review PR #80 orthogonally against Issue #73 and `docs/architecture/epic-14-weapon-acquisition-and-rack-economy.md`. Check ownership boundaries, determinism/RNG isolation, instance identity, six-slot capacity, full-rack no-loss behavior, physical pickup integrity, event ordering, validation, merge invariants, system update order, regression risk to XP/scrap/chest behavior, UI scope leakage into Epic 15, presentation leakage into Epics 16/17, save/dependency drift, tests, and manual Golden Run evidence. Treat any silent seventh-weapon loss, RNG coupling, premature instance allocation, second registry, direct `WeaponSystem` activation, direct chest-to-rack weapon grant, or undocumented frozen-file change as merge-blocking.
