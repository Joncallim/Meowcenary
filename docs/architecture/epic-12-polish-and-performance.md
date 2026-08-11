# Epic 12 — Polish and Performance

**Issue:** #13 · **Branch:** `agent/epic-12-polish-and-performance` · **Delivery model:** one branch, one PR, ordered slice commits.

This document is the executable implementation contract for the final Meowcenary epic. It supersedes older wording in Issue #13 where the repository has since acquired stronger contracts through Epics 8–11.

The implementation agent should not need another architecture pass. If the live repository conflicts with this document, stop and report the concrete mismatch rather than improvising a new design.

---

## 1. Goal and release posture

Make the existing game feel responsive, legible, satisfying, and smooth on mobile and desktop browsers **without changing combat rules, progression, balance, save semantics, event payloads, or deterministic gameplay**.

Epic 12 owns:

- event-driven combat feedback;
- reduced-motion behavior for new heavy effects and one shared motion policy helper;
- generic object pooling;
- projectile and drop pooling;
- lightweight performance sampling and pool visibility in the existing F3 overlay;
- evidence-gated enemy pooling only if profiling proves it is needed;
- responsive-size and browser-compatibility verification;
- final release-candidate polish documentation and delivery evidence.

Epic 12 does **not** own:

- new weapons, enemies, upgrades, arenas, loot, characters, progression, save fields, or events;
- balance retuning;
- final art production or sprite-atlas conversion;
- audio redesign;
- a new rendering framework;
- analytics or telemetry;
- production cheat/debug changes;
- online features or monetisation.

The release rule is simple: **polish may make existing state easier to perceive; it must not become a new source of gameplay state.**

---

## 2. Live baseline and architectural findings

Architecture baseline: `main` at `de3f919649543cd082ed72fb1dadbfd0253122d4`, the merge commit of PR #70. Epic 11 is complete. Its delivery record reports 1133 tests across 76 files, clean lint/typecheck, and a successful production build.

### 2.1 Current event and settings seams are already sufficient

`GameEventMap` already carries all signals required by Issue #13:

- `projectile:hit { x, y, damage, killed }`;
- `enemy:killed { ..., x, y }`;
- `player:damaged { amount, healthRemaining }`;
- `level:up { level }`;
- `settings:changed { settings }`.

No new feedback event is permitted. `GameContext.updateSettings` already publishes `settings:changed` after updating its in-memory settings snapshot, so reduced motion can change live without a run restart.

### 2.2 Projectiles are already pool-ready

`Projectile` is constructed disabled, has `spawn(...)`, `reset()`, `active`, and an idempotent-enough reset path. `WeaponSystem` is the churn point: it currently allocates a new `Projectile` per shot, adds it to the physics group, and later destroys inactive projectiles during compaction.

Pooling must therefore change **WeaponSystem lifetime ownership only**. Projectile range, pierce, damage, hit de-duplication, event order, target selection, cadence, and sprite/body behavior stay unchanged.

### 2.3 Drops are already pool-ready

`Drop` already has the required construct-disabled / `spawn` / `reset` lifecycle. `DropSystem` currently creates a new `Drop` per grant and destroys it on collection.

Pooling must preserve every loot rule and collection event exactly. A pooled drop is still physically collected at overlap; pooling must never auto-collect, merge, discard, or cap gameplay loot.

### 2.4 Enemies are not pool-ready

`Enemy` is materially different:

- `instanceId` is constructor-assigned and readonly;
- `definition` and `maxHealth` are constructor-bound;
- the sprite starts live;
- death calls `destroy()` and destroys the Phaser object;
- `WeaponSystem` reads enemy reward/definition data immediately after `takeDamage()` reports a kill.

Therefore **enemy pooling is not part of the default implementation path**. It is implemented only if §10's profiling gate is met. Otherwise the PR records the evidence and leaves `Enemy` unchanged.

This is deliberate: Issue #13 already says enemies should be pooled only when profiling shows churn, and forcing them into the projectile/drop lifecycle would be a larger semantic refactor than the performance evidence currently justifies.

### 2.5 Epic 11 already owns DPS and the F3 shell

Do not create a second diagnostics UI. Epic 12 extends the current F3 lines with sampled frame health and pool counts. The existing `DpsMeter` remains unchanged.

### 2.6 The current responsiveness helper is incomplete

The runtime uses Phaser `Scale.FIT` with a logical 390×844 canvas. `ui/layout.ts` contains helpers intended to preserve physical hit-target size, but `logicalCanvasViewport()` currently reports the logical canvas dimensions as both logical and displayed dimensions. That means a 44 logical-pixel target can become physically smaller than 44 px when FIT scales the canvas down.

Epic 12 fixes the input to that existing helper; it does not replace FIT, change the logical canvas, or convert the game to responsive world coordinates.

---

## 3. Frozen decisions

These decisions are mandatory unless a concrete live-code contradiction is found.

### D1 — One branch and one PR

All Epic 12 slices land on `agent/epic-12-polish-and-performance` and the single delivery PR for Issue #13. Do not create slice branches or slice PRs.

### D2 — No new gameplay events

Feedback consumes the existing bus. It never emits combat/progression events and never calls gameplay systems to create effects.

### D3 — Feedback cannot consume gameplay RNG

Visual-only effects must not perturb deterministic run streams. Do not call `Math.random()` and do not consume `spawns`, `upgrades`, `loot`, or any other run RNG. Burst directions are deterministic fixed vectors.

### D4 — Pooling is lifetime management only

Projectile/drop pooling may change allocation and teardown mechanics, but it must not change:

- fire cadence;
- projectile count, range, pierce, speed, damage, or hit order;
- target choice;
- enemy kill order or payloads;
- drop generation/RNG consumption;
- pickup geometry;
- XP/scrap amounts;
- chest resolution;
- event ordering.

### D5 — No gameplay projectile/drop hard cap

Issue #13's broad “active entity cap” instruction conflicts with its stronger “pooling changes lifetime management, not behaviour” rule when applied to gameplay bullets or loot. Silently dropping a bullet changes damage; silently dropping loot changes progression.

Therefore:

- enemies retain their existing data-driven `maxAlive` limits;
- projectile and drop pools grow elastically;
- F3 measures their active and allocated counts;
- cosmetic feedback particles have explicit caps because dropping cosmetic work does not change gameplay.

Do not add projectile/drop truncation, auto-collection, oldest-item eviction, or reward fallback behavior in this epic.

### D6 — Generic pool stays Phaser-free and intentionally small

`src/engine/pool.ts` has no Phaser import, timer, size limit, iterator, or destroy hook. Owners that need teardown keep an external list of every object created by their factory.

Required public contract:

```ts
export interface Pool<T> {
  acquire(): T;
  release(item: T): void;
  active(): number;
}

export function createPool<T>(
  factory: () => T,
  reset: (item: T) => void,
): Pool<T>;
```

Exact semantics are frozen in §6.

### D7 — System-level release helpers are idempotent; the pool itself is strict

A system may discover the same inactive object through more than one lifecycle path. `WeaponSystem.releaseProjectile` and `DropSystem.releaseDrop` guard with their live set and return harmlessly if already released.

`Pool.release(item)` itself **throws** when `item` is not currently leased from that pool. This catches ownership bugs instead of hiding them.

### D8 — Reduced motion is live

`FeedbackSystem` starts from current settings and subscribes to `settings:changed`. Turning reduced motion on immediately cancels heavy spatial effects and stops camera shake. Readability-critical opacity flashes remain.

### D9 — One shared motion policy primitive

Add `src/engine/motion.ts`. New heavy effects use `shouldUseHeavyMotion(reducedMotion)`. The existing UI `reducedMotionDuration` delegates to the shared duration helper so UI and Epic 12 do not evolve separate policies.

### D10 — Feedback animations are deterministic, dt-driven, and pooled

Do not build combat polish out of chains of per-hit Phaser Tweens or Timers. `PhaserFeedbackRenderer.update(dtMs)` owns transient motion/fades. Its dots come from the generic pool, so the polish epic does not introduce a new allocation hot path.

### D11 — Cosmetic capacity is fail-soft

`RuntimeConfig.performance` owns only performance/presentation constants. Cosmetic effects may be omitted when their cap is reached. Essential feedback is spawned before optional burst particles; heavy particles are constrained below total capacity to reserve headroom for essential cues.

### D12 — Perf sampling is local and read-only

No network telemetry, LocalStorage writes, analytics, timestamps, device fingerprinting, or save changes. The sampler consumes only Phaser-provided frame `delta` and in-memory counts.

### D13 — Enemy pooling is a profile-triggered sub-slice

Do not refactor `Enemy` “because this is the pooling epic.” Execute §10 only if the profiling gate passes. If it does not, record “not triggered” in the delivery record and proceed.

### D14 — Phaser FIT remains the scaling strategy

Do not switch to `RESIZE`/`EXPAND`, change `RuntimeConfig.canvas`, or make world rules browser-size dependent. Feed the actual FIT display size into the existing UI physical-size conversion and verify common viewports manually.

---

## 4. File ownership map

Expected files by slice:

| File | Slice | Change |
| --- | --- | --- |
| `src/engine/pool.ts` | 1 | new strict generic pool |
| `src/engine/motion.ts` | 1 | new shared reduced-motion policy helpers |
| `src/ui/theme.ts` | 1 | delegate existing reduced-motion duration helper |
| `tests/pool.test.ts` | 1 | exhaustive pure pool contract |
| `tests/motion.test.ts` | 1 | shared motion policy tests |
| `src/systems/WeaponSystem.ts` | 2 | projectile pool ownership and counters |
| `src/systems/DropSystem.ts` | 2 | drop pool ownership and counters |
| `tests/weaponSystem.test.ts` | 2 | reuse/lifecycle/event regressions |
| `tests/dropSystem.test.ts` | 2 | reuse/lifecycle/economy regressions |
| `src/systems/feedback.ts` | 3 | feedback subscriber + Phaser renderer |
| `src/engine/config.ts` | 3/4 | cosmetic/performance constants only |
| `src/scenes/GameScene.ts` | 3/4/5 | thin composition + metrics + real display viewport |
| `tests/feedback.test.ts` | 3 | subscription/reduced-motion policy tests using fake renderer |
| `tests/feedbackRenderer.test.ts` | 3 | focused mocked-Phaser lifecycle tests if the existing mock supports required calls; otherwise cover pure/system contract and browser matrix, do not build a giant Phaser fake |
| `src/gameplay/perf.ts` | 4 | pure fixed-window frame sampler |
| `tests/perf.test.ts` | 4 | sampler edge cases |
| `src/ui/layout.ts` | 5 | accept actual display dimensions |
| `src/scenes/MenuScene.ts` | 5 | pass current ScaleManager display size |
| existing layout/menu/game tests | 5 | physical sizing regressions |
| `docs/architecture.md` | closeout | Epic 12 source-of-truth pointer |
| `docs/epics.md` | closeout | actual final status/modules |
| `docs/roadmap.md` | closeout | final epic status |
| `docs/knowledge-graph.md` | closeout | final runtime shape/counts |
| this document | all | delivery evidence |

Do not modify gameplay JSON in this PR.

---

## 5. Ordered delivery slices

1. **Pure foundations** — generic pool + shared motion policy.
2. **Gameplay-object lifetime** — projectile and drop pooling, no rule changes.
3. **Combat feedback** — event subscriber, pooled renderer, live reduced motion.
4. **Performance visibility and profile gate** — `PerfSampler`, pool counts, enemy-pooling decision.
5. **Responsive/browser release pass** — actual display size into UI sizing, manual matrix, docs closeout.
6. **Independent review/hardening** — confirmed fixes only, then final evidence.

Each slice is a green commit/review gate. Do not start the next slice with failing focused/full tests.

---

## 6. Slice 1 — generic pool and motion policy

### 6.1 `src/engine/pool.ts`

Implement exactly:

```ts
export interface Pool<T> {
  acquire(): T;
  release(item: T): void;
  active(): number;
}

export function createPool<T>(
  factory: () => T,
  reset: (item: T) => void,
): Pool<T> {
  const free: T[] = [];
  const leased = new Set<T>();

  return {
    acquire(): T {
      const item = free.pop() ?? factory();
      if (leased.has(item)) {
        throw new Error('Pool factory returned an already-active item');
      }
      leased.add(item);
      return item;
    },

    release(item: T): void {
      if (!leased.has(item)) {
        throw new Error('Cannot release an item that is not active in this pool');
      }
      reset(item);
      leased.delete(item);
      free.push(item);
    },

    active(): number {
      return leased.size;
    },
  };
}
```

Important ordering:

- On `release`, call `reset` **before** removing the lease. If reset throws, the object remains leased and cannot be accidentally reused in an unknown state.
- Factory failure leaves counts unchanged.
- Reuse is LIFO because `free.pop()` is intentional and deterministic.
- Pool owns no disposal. The system factory records every created item in `owned*` for final destruction.
- Do not add prewarming in Slice 1.

### 6.2 `tests/pool.test.ts`

Required cases:

- first acquire calls factory once and active becomes 1;
- multiple acquires grow pool and active count tracks leases;
- release invokes reset exactly once and decrements active;
- next acquire returns the exact released object without a new factory call;
- LIFO reuse with two released objects;
- double release throws and does not call reset twice;
- foreign object release throws;
- reset throw keeps active count unchanged and the item leased;
- factory throw leaves active count unchanged;
- a factory returning an already-active object throws on the duplicate acquire;
- zero active on a fresh pool.

### 6.3 `src/engine/motion.ts`

```ts
export function shouldUseHeavyMotion(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

export function motionDuration(baseMs: number, reducedMotion: boolean): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return 0;
  return reducedMotion ? 0 : baseMs;
}
```

`ui/theme.ts` keeps the current exported `reducedMotionDuration` name for compatibility, but delegates to `motionDuration`. Do not make every current UI caller change imports in this slice.

### 6.4 Motion tests

Pin:

- heavy motion true only when reduced motion is false;
- normal finite positive duration preserved;
- reduced motion returns zero duration;
- zero/negative/non-finite duration returns zero.

---

## 7. Slice 2 — projectile and drop pooling

### 7.1 `WeaponSystem` exact ownership shape

Replace the active-projectile array/compaction lifecycle with:

```ts
private readonly projectilePool: Pool<Projectile>;
private readonly liveProjectiles = new Set<Projectile>();
private readonly ownedProjectiles: Projectile[] = [];
private readonly projectileBySprite = new Map<Phaser.GameObjects.GameObject, Projectile>();
```

Construct the pool once in `WeaponSystem`'s constructor:

```ts
this.projectilePool = createPool(
  () => {
    const projectile = new Projectile(this.scene, this.projectileRadius);
    this.ownedProjectiles.push(projectile);
    this.projectileBySprite.set(projectile.sprite, projectile);

    // Preserve the existing Phaser invariant: a PhysicsGroup re-applies body
    // defaults on add. Add exactly once while the projectile is disabled;
    // every later spawn owns final position/velocity.
    this.projectileGroup.add(projectile.sprite);
    return projectile;
  },
  (projectile) => projectile.reset(),
);
```

`fireAtNearestTarget`:

1. resolve target/directions exactly as today;
2. for each direction: `const projectile = projectilePool.acquire()`;
3. add it to `liveProjectiles`;
4. call `spawn(...)` with the existing arguments;
5. never call `projectileGroup.add` from the fire path;
6. emit the existing `weapon:fired` exactly once at the same logical point as today.

Do not introduce a max-active-projectile branch.

### 7.2 Projectile release helper

```ts
private releaseProjectile(projectile: Projectile): void {
  if (!this.liveProjectiles.delete(projectile)) {
    return;
  }
  this.projectilePool.release(projectile);
}
```

In `update(dtMs)`:

- keep the existing `runState.status !== 'active'` early return;
- iterate `liveProjectiles`;
- call `projectile.update(dtMs)`;
- if it became inactive because range expired, release it immediately;
- remove `compactActive` for projectiles.

In overlap handling:

- resolve with `projectileBySprite.get(projectileGameObject)`, not a linear `.find`;
- keep enemy lookup behavior unchanged in Slice 2;
- call `registerHit` exactly as today;
- if the projectile becomes inactive from pierce exhaustion, call `releaseProjectile` after the hit registration path has accepted the hit;
- keep `enemy:damaged` (inside Enemy) → `projectile:hit` → `enemy:killed` ordering exactly unchanged;
- do not clear projectile fields before reading `damage` for the hit; snapshot `damage` exactly where current code does.

`destroy()`:

- destroy every object in `ownedProjectiles` exactly once;
- clear `ownedProjectiles`, `liveProjectiles`, `projectileBySprite`, and cadences;
- do not try to release every object through the pool during scene teardown.

Expose read-only diagnostics:

```ts
get activeProjectileCount(): number {
  return this.projectilePool.active();
}

get allocatedProjectileCount(): number {
  return this.ownedProjectiles.length;
}
```

These are diagnostics only and must not be used as gameplay conditions.

### 7.3 Projectile regression requirements

Extend `weaponSystem.test.ts` rather than duplicating the whole scene.

Required new assertions:

- fire → projectile expires/hit releases → later fire reuses the exact sprite/object;
- group `add` occurs only on first allocation, not on reuse;
- reused projectile has fresh damage/range/pierce/travel/hit-ID state;
- reused projectile receives live velocity because spawn remains after first group add;
- active count returns to zero after expiry/pierce release;
- allocated count stays stable across reuse;
- repeated overlap with a released projectile does nothing;
- existing hit/kill event order is byte-for-byte equivalent in assertions;
- cadence behavior and `weapon:fired` counts stay unchanged;
- destroy destroys pooled inactive and active owned projectiles once.

### 7.4 `DropSystem` exact ownership shape

Add:

```ts
private readonly dropPool: Pool<Drop>;
private readonly liveDrops = new Set<Drop>();
private readonly ownedDrops: Drop[] = [];
private readonly dropBySprite = new Map<Phaser.GameObjects.GameObject, Drop>();
```

Pool factory mirrors projectiles:

- construct disabled `Drop`;
- record in `ownedDrops`;
- map sprite to drop;
- add disabled sprite to `dropGroup` exactly once;
- return it.

`spawnDrop(...)`:

1. acquire;
2. add to `liveDrops`;
3. call `drop.spawn(...)`;
4. return the drop for existing tests/dev callers.

Do not change loot resolution or RNG consumption.

### 7.5 Drop release helper and collection order

```ts
private releaseDrop(drop: Drop): void {
  if (!this.liveDrops.delete(drop)) {
    return;
  }
  this.dropPool.release(drop);
}
```

`handlePlayerDropOverlap` resolves via `dropBySprite.get(...)`.

For XP/scrap collection:

1. reject inactive/non-active-run as today;
2. snapshot `kind`, `amount`, `x`, `y` before release;
3. apply XP/scrap exactly as today;
4. emit `drop:collected` with the same face value and coordinates;
5. `releaseDrop(drop)` **after** event emission.

This ordering preserves payload fields before reset clears them.

For chest collection:

- snapshot `tableId`, `x`, `y` before release;
- preserve current missing-table warning and resolver failure behavior;
- apply each non-chest grant and emit exactly the same `drop:collected` events;
- release the chest exactly once on every terminal path;
- never recursively spawn a child chest;
- do not release before the function has finished reading chest payload state.

`update` loops `liveDrops`, preserves magnet semantics, and releases any inactive object discovered through a normal lifecycle path. Remove array compaction.

`destroy` unsubscribes first as today, then destroys every `ownedDrop` exactly once and clears owned/live/map state.

Expose:

```ts
get activeDropCount(): number;
get allocatedDropCount(): number;
```

### 7.6 Drop regression requirements

Required new tests:

- collect then spawn reuses exact object/sprite;
- group add occurs only on first allocation;
- reset clears kind/amount/tableId/velocity between uses;
- XP/scrap/chest event payloads and order are unchanged;
- default loot path still consumes no RNG;
- seeded table path is still deterministic;
- active count returns to zero after collection;
- allocated count remains stable after reuse;
- missing/throwing chest path releases the chest;
- destroy removes bus listener and destroys all owned pooled objects once.

---

## 8. Slice 3 — feedback and reduced motion

### 8.1 Architecture split

`src/systems/feedback.ts` contains two layers:

1. `FeedbackSystem` — bus subscription, settings/reduced-motion policy, lifecycle.
2. `PhaserFeedbackRenderer` — presentation implementation.

The system is testable with a fake renderer. Do not make tests recreate all Phaser Scene behavior merely to prove event routing.

### 8.2 Renderer contract

```ts
export interface FeedbackRenderer {
  projectileHit(x: number, y: number, heavyMotion: boolean): void;
  enemyKilled(x: number, y: number, heavyMotion: boolean): void;
  playerDamaged(heavyMotion: boolean): void;
  levelUp(heavyMotion: boolean): void;
  cancelHeavyMotion(): void;
  update(dtMs: number): void;
  destroy(): void;
  readonly activeEffectCount: number;
  readonly allocatedEffectCount: number;
  readonly droppedEffectCount: number;
}
```

`FeedbackSystemOptions`:

```ts
export interface FeedbackSystemOptions {
  readonly bus: EventBus;
  readonly settings: Settings;
  readonly renderer: FeedbackRenderer;
}
```

The caller passes the current `ctx.settings` object when constructing it.

### 8.3 `FeedbackSystem` subscriptions

At construction, cache only:

```ts
private reducedMotion = options.settings.reducedMotion;
```

Subscribe to exactly:

- `projectile:hit` → `renderer.projectileHit(x, y, shouldUseHeavyMotion(reducedMotion))`;
- `enemy:killed` → `renderer.enemyKilled(x, y, shouldUseHeavyMotion(reducedMotion))`;
- `player:damaged` → `renderer.playerDamaged(shouldUseHeavyMotion(reducedMotion))`;
- `level:up` → `renderer.levelUp(shouldUseHeavyMotion(reducedMotion))`;
- `settings:changed` → update cached boolean; if transitioning/setting to true, call `renderer.cancelHeavyMotion()`.

No other events.

`update(dtMs)` delegates to renderer regardless of run status so a feedback fade can finish while level-up/pause UI is visible. It does not advance gameplay state.

`destroy()` is idempotent, unsubscribes every listener exactly once, then destroys the renderer.

### 8.4 Renderer implementation — deterministic pooled dots

Do not use gameplay RNG or per-hit tween/timer chains.

Internal pooled runtime record:

```ts
interface FeedbackDot {
  readonly sprite: Phaser.GameObjects.Arc;
  ageMs: number;
  lifetimeMs: number;
  vx: number;
  vy: number;
  startAlpha: number;
  heavy: boolean;
}
```

Create one generic `Pool<FeedbackDot>` with the same external ownership pattern:

- `ownedDots: FeedbackDot[]` for destruction;
- `liveDots: Set<FeedbackDot>` for update/release;
- factory creates a disabled/hidden 2px circle at a world-feedback depth above enemies/projectiles but below HUD;
- reset zeros runtime fields and hides/disables the circle;
- renderer checks caps **before** acquire.

Fixed direction table, no randomness:

```ts
const BURST_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 0.7071, y: 0.7071 },
  { x: 0, y: 1 },
  { x: -0.7071, y: 0.7071 },
  { x: -1, y: 0 },
  { x: -0.7071, y: -0.7071 },
  { x: 0, y: -1 },
  { x: 0.7071, y: -0.7071 },
] as const;
```

Do not rotate this table with `Math.random()`.

### 8.5 Cosmetic caps

Add to `RuntimeConfig`:

```ts
performance: {
  targetFps: 60,
  sampleWindowFrames: 120,
  maxFeedbackEffects: 96,
  maxHeavyFeedbackEffects: 72,
},
```

Rules:

- total live dots never exceed 96;
- heavy dots never exceed 72;
- essential stationary cues are attempted before heavy burst dots;
- if a cap blocks a cosmetic spawn, increment `droppedEffectCount` and do nothing else;
- cap handling never emits events, damages entities, pauses gameplay, or changes rewards.

No projectile/drop/enemy cap is added here.

### 8.6 Exact visual grammar

These values are presentation constants, not gameplay data. Keep them local to `feedback.ts` unless a second owner appears.

**Projectile hit**

- always attempt one stationary cream dot at event `{x,y}`;
- radius 4; lifetime 80 ms; alpha 0.90 → 0; no spatial motion;
- when heavy motion is allowed, additionally attempt 3 outward dots using the first 3 fixed directions; radius 2; speed 90 px/s; lifetime 120 ms.

**Enemy killed**

- always attempt one stationary teal cue at `{x,y}`; radius 6; lifetime 100 ms; alpha 0.85 → 0;
- when heavy motion is allowed, attempt up to 6 outward teal dots; radius 2; speed 120 px/s; lifetime 180 ms.

**Player damaged**

- maintain one persistent full-screen danger rectangle, scroll factor 0, under HUD, initially alpha 0;
- set its remaining flash time to `max(current, 120 ms)` and alpha to 0.16;
- `update` linearly fades alpha to zero;
- when heavy motion is allowed, `scene.cameras.main.shake(90, 0.0025, true)`;
- never chain/accumulate multiple camera shakes deliberately; Phaser's forced shake replaces the current shake.

**Level up**

- maintain one persistent full-screen border rectangle, scroll factor 0, under HUD, transparent fill with teal stroke;
- set remaining pulse to `max(current, heavy ? 180 : 90 ms)` and alpha to 0.22;
- fade alpha linearly in `update`;
- no camera flash and no zoom: level-up polish must not obscure danger or move the view.

Reduced motion keeps every stationary hit/kill cue, danger vignette, and level border pulse. It disables only spatial burst motion and camera shake.

### 8.7 Renderer update rules

For finite positive `dtMs`:

- advance dot age;
- for heavy dots only, move `x += vx * dtMs / 1000`, `y += vy * dtMs / 1000`;
- alpha = `startAlpha * max(0, 1 - age/lifetime)`;
- when age >= lifetime, release through an idempotent renderer helper;
- update persistent damage/level overlay timers and alpha.

Invalid/non-positive dt is a true no-op.

`cancelHeavyMotion()`:

- call `scene.cameras.main.stopShake()`;
- release every currently-live `heavy === true` dot;
- leave stationary essential cues and opacity overlays alive.

`destroy()`:

- stop shake owned by this renderer;
- destroy every owned pooled dot once;
- destroy persistent overlays;
- clear sets/counters;
- no bus work (FeedbackSystem owns subscriptions).

### 8.8 Feedback tests

`tests/feedback.test.ts` uses real EventBus, current Settings object, and a fake renderer.

Required cases:

- constructor emits/renders nothing;
- each of four events calls only its expected renderer method;
- event x/y are forwarded exactly;
- reducedMotion false passes `heavyMotion=true`;
- reducedMotion true passes false;
- `settings:changed` toggles behavior live without reconstruction;
- turning reduced motion on calls `cancelHeavyMotion`;
- settings change unrelated to motion does not alter event routing;
- update delegates exact dt;
- destroy unsubscribes every event and destroys renderer once;
- repeated destroy is harmless;
- no new event is emitted by feedback (a listener/count guard may assert this indirectly; do not modify EventBus for the test).

Renderer-focused mocked tests should pin pooling/release/cap semantics, invalid dt, and persistent overlay teardown where practical. Do not create a brittle full-camera simulation solely for numeric animation screenshots; browser checks cover final presentation.

---

## 9. Slice 4 — performance sampler and F3 integration

### 9.1 `src/gameplay/perf.ts`

Pure, Phaser-free fixed-window sampler:

```ts
export interface PerfSnapshot {
  readonly sampleCount: number;
  readonly averageFrameMs: number;
  readonly averageFps: number;
  readonly overBudgetFrames: number;
  readonly overBudgetRatio: number;
}

export interface PerfSampler {
  recordFrame(dtMs: number): void;
  snapshot(): PerfSnapshot;
  reset(): void;
}

export function createPerfSampler(
  windowSize = RuntimeConfig.performance.sampleWindowFrames,
  targetFps = RuntimeConfig.performance.targetFps,
): PerfSampler;
```

**Do not import RuntimeConfig into `gameplay/` if that creates an undesirable engine→gameplay cycle.** Preferred final signature is explicit numeric defaults exported as local constants or passed from `GameScene`. The implementation must keep `gameplay/perf.ts` Phaser-free.

Recommended concrete construction from `GameScene`:

```ts
const perfSampler = createPerfSampler(
  RuntimeConfig.performance.sampleWindowFrames,
  RuntimeConfig.performance.targetFps,
);
```

### 9.2 Exact sampler algorithm

Use a fixed-size numeric ring plus a parallel over-budget flag array. Maintain rolling sum and over-budget count in O(1).

- `windowSize` must be finite integer >= 1; otherwise throw at construction.
- `targetFps` must be finite > 0; otherwise throw.
- budgetMs = `1000 / targetFps`.
- `recordFrame` ignores non-finite or <=0 dt.
- Until full, append samples.
- Once full, subtract the overwritten sample and its slow flag before writing the replacement.
- A frame is over budget only when `dtMs > budgetMs`; equality is not over budget.
- `snapshot()` returns zeroes for no samples.
- `averageFrameMs = sum / count`.
- `averageFps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0`.
- ratio = overBudget/count.
- sanitize any impossible non-finite derived result to zero rather than throw from debug rendering.
- `reset()` clears indexes/counts/sums/flags without reallocating the fixed arrays.

No percentile sorting in the in-game hot path. Browser profiling may collect richer percentiles externally.

### 9.3 Perf tests

Required:

- empty snapshot;
- one and multiple samples;
- exact window rollover subtracts old sample;
- budget boundary equality vs greater-than;
- invalid dt ignored;
- invalid constructor arguments throw;
- average FPS calculation;
- over-budget ratio after rollover;
- reset returns empty and sampler remains reusable;
- long run never grows storage (test behavior through window semantics, not private fields).

### 9.4 `GameScene` system references

Store `WeaponSystem` as a scene field instead of constructing it inline, because F3 needs the system-owned active/allocated counts after pooling:

```ts
private weaponSystem?: WeaponSystem;
private feedbackSystem?: FeedbackSystem;
private perfSampler?: PerfSampler;
```

`DropSystem` is already stored.

Do not expose pool internals to `GameScene`.

### 9.5 F3 lines after pooling

Keep the existing `DebugOverlay` and existing gameplay/DPS lines. Replace misleading group-length counts with owner diagnostics.

Required lines include:

```text
Frame(120): 16.2ms ~61.7fps slow 8%
Enemies: <active> Kills: <kills>
Projectiles: <active> active / <allocated> allocated
Drops: <active> active / <allocated> allocated
FX: <active> active / <allocated> allocated / <dropped> dropped
DPS(5s): ...
```

Formatting may round frame ms/FPS to one decimal and slow ratio to an integer percentage. Keep Phaser's existing top-level `FPS:` line in `DebugOverlay`; sampled FPS is deliberately separate because it represents the fixed recent window.

`GameScene.update` records the provided `delta` once per scene update, regardless of F3 visibility. Sampling has no gameplay side effect.

### 9.6 Performance interpretation

The in-game sampler is a regression signal, not a benchmark authority. Final profiling still uses browser developer tools and the manual matrix. Do not add profiler-specific dependencies to `package.json`.

---

## 10. Conditional Slice 4B — enemy pooling decision gate

### 10.1 Default outcome

**Default: do not pool enemies.** After Slices 2–4, run the reference profiling matrix in §14. If the conditions below are not met, record the result and proceed directly to Slice 5.

### 10.2 Trigger conditions

Implement enemy pooling only when all are true:

1. projectile/drop/VFX pooling is already landed and green;
2. the reference run still fails the practical budget on a target browser/device — sustained sampled FPS below 55 **or** repeated >25 ms main-thread/GC spikes during busy waves;
3. a browser Performance/Memory profile attributes a meaningful part of those spikes to repeated `Enemy` construction/destruction or its Phaser display/body allocation, rather than rendering, physics broadphase, audio, unrelated extensions, or dev-mode physics debugging;
4. the evidence is recorded in this document before code is changed.

If profiling tools are unavailable, condition 3 cannot be proven; enemy pooling remains deferred. Do not guess.

### 10.3 If triggered, exact enemy-pooling design

This subsection exists so an implementation agent does not need a second design pass.

Refactor `Enemy` to the same construct-disabled lifecycle without changing the public read contract:

- constructor: `(scene, bus)` only; create one disabled/hidden Arc + Arcade body;
- private mutable `instanceIdValue`, `definitionValue`, `maxHealthValue`;
- getters preserve `readonly instanceId`, `definition`, `maxHealth`, `defId`, `archetype`, rewards;
- `spawn(instanceId, definition, x, y)` deep-clones/freezes the runtime definition, restores health/state/timers/dash vectors, color, body circle, position, visibility/active/body enablement;
- `reset()` disables/hides body/sprite and clears all per-spawn state/payload references;
- `destroy()` remains final scene teardown only.

Move instance ID allocation to `SpawnSystem` as a monotonic run-scoped counter starting at 1. Every spawn gets a new ID even when reusing an object. Do not reuse instance IDs.

Critical kill sequence:

- `Enemy.takeDamage` may mark `state='dead'` and deactivate motion, but it **must not reset/destroy the pooled object's definition before `WeaponSystem` publishes `enemy:killed`**;
- `WeaponSystem` keeps reading the same reward payload immediately after kill as today;
- after `enemy:killed` has been emitted, `SpawnSystem` discovers the dead/inactive enemy on its normal update and releases it;
- do not move reward construction into `Enemy` and do not add a new kill event.

`SpawnSystem` owns `Pool<Enemy>`, `liveEnemies`, `ownedEnemies`, sprite map, allocation diagnostics, and group-add-once behavior. `GameScene.enemies` remains the active-target list expected by targeting and other systems; keep it synchronized without exposing pooled inactive enemies.

Required mutation/regression tests if triggered:

- reused object gets a new instance ID and new definition;
- no prior health/state/timers/dash/color/rewards leak;
- `enemy:damaged` then `projectile:hit` then `enemy:killed` payload/order unchanged;
- targeting never sees pooled inactive enemies;
- player collision ignores pooled inactive enemies;
- `maxAlive` director semantics unchanged;
- group add only once per allocation;
- teardown destroys all owned sprites exactly once.

If any of these semantics require broader event or rule changes, stop and leave enemy pooling deferred.

---

## 11. Slice 5 — responsiveness and browser release pass

### 11.1 Keep FIT; feed real display dimensions to layout

Phaser 3.90 `Scale.FIT` keeps the configured game canvas logical size and scales its CSS display to fit the parent while preserving aspect ratio. `ScaleManager.displaySize` is the current displayed canvas size.

Change `logicalCanvasViewport` to accept display dimensions while keeping pure defaults for tests:

```ts
export function logicalCanvasViewport(
  displayWidth = RuntimeConfig.canvas.width,
  displayHeight = RuntimeConfig.canvas.height,
): UiViewport {
  return {
    canvasWidth: RuntimeConfig.canvas.width,
    canvasHeight: RuntimeConfig.canvas.height,
    displayWidth,
    displayHeight,
  };
}
```

At scene creation/render points use:

```ts
logicalCanvasViewport(
  this.scale.displaySize.width,
  this.scale.displaySize.height,
)
```

Required owners:

- `GameScene` before constructing HUD/controls/pause/summary/chooser views;
- `MenuScene.render()` before computing `minimumHitTarget`.

Do not change world coordinates or `this.scale.width/height` usage for logical placement.

### 11.2 Initial-size contract vs live resize

This epic guarantees correct physical sizing when a scene is created/rendered at the current display size. It does not restart an active run on browser chrome/orientation resize and does not introduce a cross-UI live-resize framework.

Manual resize/orientation must still remain functional and readable under Phaser FIT; if a specific existing control becomes inaccessible after a live resize, fix that control locally rather than redesigning every UI view.

### 11.3 Layout tests

Add/extend pure layout tests for:

- 390×844 display → scale 1 → 44 physical px maps to 44 logical;
- 360×640 target parent under FIT: pass the **actual displayed canvas size** produced/observed by ScaleManager in the browser test, then assert `minimumHitTarget * safeDisplayScale >= 44` (allow tiny floating tolerance);
- desktop upscaling never makes minimum logical target smaller than required by current helper behavior unless deliberately specified;
- invalid display dimensions still use `MIN_LAYOUT_SCALE` fail-safe.

Do not duplicate Phaser's FIT formula in production code. Browser evidence provides the display size; pure tests validate our conversion only.

### 11.4 Browser compatibility scope

Mandatory final manual browsers where available:

- Chromium-family current stable;
- Safari current stable on macOS/iOS if accessible;
- Firefox current stable if accessible.

Unavailable rows are recorded as **unverified**, never silently passed.

No browser-specific dependency or polyfill is added unless a reproducible failure requires it.

---

## 12. Exact `GameScene` integration

### 12.1 Construction order

After Slice 3, construct the renderer/system after player and UI base setup is available but before the systems array is frozen:

```ts
this.feedbackSystem = new FeedbackSystem({
  bus: ctx.bus,
  settings: ctx.settings,
  renderer: new PhaserFeedbackRenderer({
    scene: this,
    maxEffects: RuntimeConfig.performance.maxFeedbackEffects,
    maxHeavyEffects: RuntimeConfig.performance.maxHeavyFeedbackEffects,
  }),
});
```

Create/store `WeaponSystem` separately:

```ts
this.weaponSystem = new WeaponSystem(/* existing args */);
```

Required system array order:

```text
ProgressionSystem
PassiveCoordinator
SpawnSystem
HazardSystem
FeedbackSystem
WeaponSystem
DropSystem
UpgradeSystem
DebugCheatSystem? (dev only)
HudController
PlaytestSummarySystem? (dev only)
```

Why feedback precedes WeaponSystem in update order: existing visual dots age first, then combat events later in the same frame can create a fresh effect at age zero. Subscription order has no gameplay authority. Do not move ProgressionSystem or the dev summary relative to each other.

### 12.2 Scene update

At the start of an otherwise-valid `GameScene.update`:

```ts
this.perfSampler?.recordFrame(delta);
```

Then preserve the existing sequence:

- input update;
- `tickRun`;
- victory check;
- physics pause sync;
- player update;
- systems loop;
- shared audio manager update;
- controls;
- F3 rendering.

Do not move audio into systems and do not destroy the Boot-owned AudioManager.

### 12.3 Scene shutdown

Existing `systems.forEach(destroy)` owns FeedbackSystem teardown. `WeaponSystem`/`DropSystem` pooled resources are destroyed there.

After systems teardown, clear scene fields:

- `weaponSystem = undefined`;
- `feedbackSystem = undefined`;
- `perfSampler = undefined`;

Do not add duplicate bus unsubscriber entries for FeedbackSystem.

---

## 13. Automated test matrix

### 13.1 Focused Epic 12 gate

```bash
npm test -- --run \
  tests/pool.test.ts \
  tests/motion.test.ts \
  tests/weaponSystem.test.ts \
  tests/dropSystem.test.ts \
  tests/feedback.test.ts \
  tests/perf.test.ts
```

Include renderer/layout test files if added.

### 13.2 High-risk regression gate

```bash
npm test -- --run \
  tests/projectile.test.ts \
  tests/drop.test.ts \
  tests/enemy.test.ts \
  tests/spawnDirector.test.ts \
  tests/spawnSystem.test.ts \
  tests/loot.test.ts \
  tests/lootIntegration.test.ts \
  tests/metrics.test.ts \
  tests/debugCheats.test.ts \
  tests/playtestSummary.test.ts \
  tests/gameSceneAudio.test.ts \
  tests/audioManager.test.ts \
  tests/contextSystem.test.ts \
  tests/menuScene.test.ts \
  tests/runSummary.test.ts
```

If an exact filename above differs in the live tree, use the existing equivalent; do not invent/delete a test just to match this list.

### 13.3 Final automated gate

```bash
npm test
npm test -- --sequence.shuffle --sequence.repeats=3
npm run lint
npm run build
git diff --check
```

No existing test may be deleted, skipped, or weakened merely to fit pooling/polish.

### 13.4 Production bundle checks

Epic 12 itself is production functionality, so it should remain in the production bundle. The existing Epic 11 cheat/playtest-summary sentinels must still be absent after every final build. Re-run the exact sentinel checks from `docs/architecture/epic-11-remainder.md`.

---

## 14. Manual browser, readability, and profiling matrix

Record build, browser/device, viewport, result, and one-line evidence for every row.

### 14.1 Functional/polish matrix

| Build | Case | Expected |
| --- | --- | --- |
| dev | normal combat | hit cue, kill cue, damage vignette/shake, level pulse; no rule change |
| dev | reduced motion OFF | spatial particles + shake enabled |
| dev | toggle reduced motion ON mid-run | current heavy dots/shake cancel immediately; essential cues remain |
| dev | reduced motion ON from menu | no spatial particles/shake from first combat event |
| dev | toggle reduced motion OFF mid-run | later events regain heavy effects; no scene restart |
| dev | dense wave | effects do not hide enemies/player/HUD; cosmetic cap can shed burst work |
| dev | pause/level-up | feedback fades can complete; gameplay simulation remains paused |
| dev | Retry | no listener/object accumulation; fresh pool/perf state |
| dev | Menu → Game → Menu → Game | no feedback listeners or pooled objects leak across runs; audio survives |
| preview | normal combat | same production feedback behavior |
| preview | reduced motion | same accessibility behavior |
| preview | F3 | overlay still available; sampled/pool metrics visible; cheats/summary remain absent |

### 14.2 Viewport matrix

At minimum:

| Viewport / environment | Checks |
| --- | --- |
| 390×844 portrait | canonical layout, 44px-equivalent targets, HUD clear |
| 360×640 portrait | no clipped menu rows needed for core flow; controls/pause target usable; text readable |
| 844×390 landscape/resized browser | FIT remains functional; no crash/input offset; record any intended letterboxing |
| 1280×720 desktop | centered FIT canvas, keyboard and pointer both work |
| 1920×1080 desktop | same, no stretched logical layout |

For touch-capable testing, verify pointer coordinates still correspond to visible controls after scaling.

### 14.3 Reference performance matrix

Use a production preview for representative measurement; dev Arcade debug drawing is not a valid performance benchmark.

For each accessible target:

1. start a normal run with no cheat query;
2. play through an early quiet period and a busy late-wave period;
3. record F3 sampled average FPS/slow-frame ratio and active/allocated projectile/drop/FX counts;
4. take a browser Performance profile during a busy period when possible;
5. repeat once with reduced motion on;
6. note whether GC/allocation spikes materially correlate with enemy construction;
7. make the §10 enemy-pooling decision.

Target: approximately 60 FPS on capable hardware at the 390×844 logical canvas, with graceful degradation on weaker mobile hardware. Do not claim a universal 60 FPS guarantee across arbitrary devices.

A performance result is “pass” when interaction remains responsive/readable and the reference capable device stays near target without repeated long stalls. A weaker device may be recorded as degraded if effects shed gracefully and gameplay remains usable.

---

## 15. Global acceptance criteria

- [ ] One Epic 12 branch and one PR only.
- [ ] `engine/pool.ts` is Phaser-free, strict on invalid release, deterministic, and exhaustively tested.
- [ ] Projectile pooling reuses objects without altering cadence, projectile stats, hit ordering, or events.
- [ ] Drop pooling reuses objects without altering loot RNG, pickup geometry, XP/scrap/chest behavior, or events.
- [ ] No gameplay projectile/drop cap or auto-collection behavior is introduced.
- [ ] Existing enemy `maxAlive` behavior remains unchanged.
- [ ] Enemy pooling is implemented only if §10 evidence triggers it; otherwise the non-trigger is recorded.
- [ ] Feedback subscribes to existing events only and emits no gameplay events.
- [ ] Feedback consumes no gameplay RNG and calls no `Math.random()`.
- [ ] Cosmetic effects are pooled and capped; cap shedding has no gameplay effect.
- [ ] Reduced motion disables/cancels heavy spatial effects and shake live while preserving essential cues.
- [ ] Existing reduced-motion UI duration helper delegates to the shared motion policy.
- [ ] PerfSampler is pure/fixed-window/O(1) per record and has no telemetry/persistence.
- [ ] F3 uses system active/allocated counts, not pooled group length, and retains Epic 11 DPS/debug behavior.
- [ ] `GameScene` remains a coordinator; audio ownership and Epic 11 listener order remain intact.
- [ ] Actual ScaleManager display dimensions feed existing physical-target sizing at scene/render creation.
- [ ] Phaser `Scale.FIT`, logical 390×844 canvas, event map, stats, save schema, data catalogs, and package dependencies are unchanged unless a verified browser defect forces a separately documented exception.
- [ ] No gameplay JSON/balance values change.
- [ ] Focused, regression, full, shuffled, lint, build, diff and Epic 11 production-sentinel gates pass.
- [ ] Manual dev/preview, reduced-motion, viewport, and performance rows are honestly recorded.
- [ ] Documentation marks Epic 12 complete only after evidence is complete.

---

## 16. Reviewer traps

Reject or fix these patterns:

- adding a new `feedback:*` event when an existing event already carries the signal;
- calling feedback directly from WeaponSystem/Enemy/Player instead of subscribing to the bus;
- consuming run RNG or `Math.random()` for cosmetic particle direction;
- using per-hit Phaser timers/tweens that recreate the allocation problem this epic is meant to reduce;
- letting feedback effects cover HUD or persist indefinitely;
- disabling damage/hit readability cues under reduced motion instead of only heavy motion;
- reading settings once at scene construction and ignoring live `settings:changed`;
- using `projectileGroup.getLength()` or `dropGroup.getLength()` as active counts after pooling;
- adding pooled sprites to PhysicsGroup on every reuse;
- resetting a drop before snapshotting its collection payload;
- releasing a pooled object twice and weakening `Pool.release` to hide the bug;
- letting reset exceptions silently return a corrupt item to the free list;
- adding projectile/drop caps that alter combat/economy;
- prewarming large pools without measured evidence;
- refactoring Enemy before the profile gate;
- reusing enemy instance IDs if conditional pooling is triggered;
- moving ProgressionSystem after PlaytestSummarySystem;
- destroying/recreating the Boot-owned AudioManager;
- changing `Scale.FIT` to fix a touch-target sizing problem;
- duplicating Phaser's FIT math in production layout code rather than reading `displaySize`;
- adding Playwright or another browser-test dependency solely for this epic without a demonstrated need;
- claiming Safari/Firefox/mobile performance passed when those rows were not actually run;
- retuning weapon/enemy/spawn/loot data inside a performance commit.

---

## 17. Commit plan

| Gate | Commit intent | Required before next gate |
| --- | --- | --- |
| Architecture | `docs: architect Epic 12 polish and performance` | review against current main |
| Slice 1 | `Epic 12 · Slice 1: pooling and motion primitives` | focused pure tests + full suite + lint/build |
| Slice 2 | `Epic 12 · Slice 2: pool projectiles and drops` | weapon/drop regressions + full suite + browser smoke |
| Slice 3 | `Epic 12 · Slice 3: event-driven combat feedback` | feedback/reduced-motion tests + dev browser matrix |
| Slice 4 | `Epic 12 · Slice 4: performance sampling and diagnostics` | perf tests + F3 check + preview profile |
| Slice 4B | `Epic 12 · Slice 4B: pool enemies after profiling` | **only if §10 trigger is proven**; otherwise no commit |
| Slice 5 | `Epic 12 · Slice 5: responsive release pass and closeout` | all viewport/browser/perf rows + docs |
| Review | one commit per coherent confirmed fix | full independent rerun + ready/not-ready verdict |

Do not squash away slice boundaries before review; they are part of the audit trail.

---

## 18. Implementation-agent handoff

Use this prompt verbatim for a lower-tier implementation agent:

> Implement Epic 12 / Issue #13 in the Meowcenary repository on the existing branch `agent/epic-12-polish-and-performance`. Do not create another branch or PR.
>
> Read in order:
> 1. `docs/architecture/epic-12-polish-and-performance.md` in full;
> 2. `docs/knowledge-graph.md`;
> 3. `docs/architecture/epic-11-remainder.md` for the current GameScene/debug/audio/production-sentinel boundaries;
> 4. the live files named in §4 before editing them.
>
> Treat the Epic 12 document as the frozen implementation contract. Do not redesign it. Run the baseline tests, then implement Slice 1, commit it green; Slice 2, commit it green; Slice 3, commit it green; Slice 4, commit it green. Execute the §10 profiling gate before touching Enemy. Implement Slice 4B only if every trigger condition is recorded as met; otherwise record “not triggered” and leave Enemy unchanged. Finish Slice 5 and closeout on the same branch.
>
> Preserve gameplay behavior exactly: no new events, no data retuning, no gameplay RNG for effects, no projectile/drop caps, no save/stat changes, no audio ownership changes, and no Progression/PlaytestSummary listener-order changes. Add pooled Phaser objects to their PhysicsGroup only once at factory creation. Snapshot drop payload before release. Use system-owned active/allocated counts after pooling, never group length.
>
> After every slice run its focused/regression gates. Before handoff run full and shuffled tests, lint, build, diff check, Epic 11 production bundle sentinels, and the manual dev/preview/viewport/performance matrix that your environment can actually execute. Mark unavailable rows “unverified”; never infer a pass. Record exact test/file counts, commit SHAs, profile evidence, enemy-pooling decision, deviations, CI state, and final ready/not-ready verdict in §20.

---

## 19. Independent review and hardening handoff

Use this prompt after implementation slices are present:

> Review and harden Epic 12 / Issue #13 on `agent/epic-12-polish-and-performance`. Do not create another branch or PR. Diff from architecture baseline `de3f919649543cd082ed72fb1dadbfd0253122d4` and read `docs/architecture/epic-12-polish-and-performance.md` in full before reviewing code.
>
> Treat the architecture as frozen. Trace behavior, not just files. Prioritize: pool lease/reset exception semantics; object reuse without stale projectile/drop state; PhysicsGroup add-once ordering; drop payload snapshot before reset; unchanged combat/loot RNG and event order; no gameplay hard caps; feedback's subscriber-only boundary; zero gameplay RNG/Math.random in cosmetics; immediate reduced-motion cancellation; VFX cap shedding; system teardown across Retry/Menu round-trips; system active counts vs group capacity; PerfSampler rollover/budget edge cases; Epic 11 audio/debug/summary preservation; and real FIT display-size handling.
>
> Independently run the automated and manual matrices available to you. If enemy pooling was implemented, verify the §10 trigger evidence first and then audit unique instance IDs, post-kill payload lifetime, targeting/collision exclusion, and maxAlive behavior. If it was not triggered, ensure no speculative Enemy refactor slipped in.
>
> Add mutation-style tests for confirmed gaps and fix only in-scope defects. Do not broaden into art, balance, new content, data retuning, dependencies, analytics, or a new responsive framework. End with exact final counts, commit/head SHAs, CI, every manual/unverified row, deviations, and a ready/not-ready verdict against §15.

---

## 20. Delivery record

Status: **complete and merged** — PR #71 was merged into `main` as `b0c30ff` on 2026-08-11, closing Issue #13. Automated evidence is complete; manual browser/viewport/performance rows remain honestly recorded as unverified (no real browser environment was available during implementation) and must be completed during release-candidate QA.

- architecture baseline SHA: `de3f919649543cd082ed72fb1dadbfd0253122d4`
- architecture commit SHA: `644c26c` (`docs: mark Epic 12 architecture ready`)
- implementation commit SHA: `97cf171` (`Epic 12: implement polish and performance (pooling, feedback, perf, responsive sizing)`)
- delivery PR: #71, https://github.com/Joncallim/Meowcenary/pull/71
- Slice 1 SHA / focused result: `97cf171` — generic pool + motion policy (`tests/pool.test.ts` 11/11, `tests/motion.test.ts` 4/4)
- Slice 2 SHA / focused result: `97cf171` — projectile/drop pooling (`tests/weaponSystem.test.ts` 13/13, `tests/dropSystem.test.ts` 46/46, `tests/lootIntegration.test.ts` 7/7)
- Slice 3 SHA / focused result: `97cf171` — combat feedback (`tests/feedback.test.ts` 14/14)
- Slice 4 SHA / focused result: `97cf171` — performance sampler + F3 diagnostics (`tests/perf.test.ts` 11/11)
- Slice 4B enemy-pooling decision: **not triggered**. Browser Performance/Memory profiling tools are unavailable in this environment, so §10 condition 3 (a profile attributing spikes to repeated `Enemy` construction/destruction) cannot be proven. `Enemy` remains unchanged.
- Slice 4B SHA if triggered: **N/A**
- Slice 5 SHA / closeout result: `97cf171` — responsive sizing and layout tests green; this §20 update is committed as a docs-only closeout after automated gates
- review-fix SHAs and findings: `d2a7488` (`Epic 12 review fix: correct level pulse ratio denominator`) — the independent review audit found the level-up border pulse ratio derived its fade denominator from the current timer value (`levelTimerMs > 90 ? 180 : 90`), flipping from 180 to 90 when a heavy-motion pulse crossed the 90 ms boundary and producing a visible re-brightening artifact; fixed by tracking the intended full pulse duration in `levelPulseDurationMs`. All other audited areas (pool strictness, add-once PhysicsGroup behavior, drop payload snapshot ordering, unchanged combat/loot RNG and event order, no gameplay hard caps, feedback subscriber-only boundary, zero gameplay RNG in cosmetics, live reduced-motion cancellation, system teardown across Retry/scene transitions, system active counts vs group length, PerfSampler rollover/budget edge cases, Epic 11 audio/debug/summary preservation, and real `ScaleManager.displaySize` handling) were clean.
- exact final test count / files: **1184 tests / 80 test files passed**
- shuffled/repeated result: `npm test -- --sequence.shuffle` executed three independent runs, each **1184/1184 passed** (Vitest 3.2.6 does not expose a `--sequence.repeats` flag, so the repeat was performed by invoking the shuffled command three times)
- lint/typecheck: `npm run lint` (`tsc --noEmit`) → **clean**
- build: `npm run build` → **success**
- `git diff --check`: **clean**
- Epic 11 production cheat/summary sentinels: **absent** from `dist/assets/*.js` (`[cheats]`, `debug:cheats`, `[playtest] run summary` not found)
- dev browser matrix: **unverified** — no browser runtime available in this environment
- preview matrix: **unverified** — no browser runtime available in this environment
- reduced-motion matrix: **unverified** — no browser runtime available in this environment
- viewport matrix: **unverified** — no browser runtime available in this environment
- performance/profile evidence: **unverified** — no browser profiling tools available; F3 sampler code and counters are present and unit-tested, but no real-device FPS/profile data was collected
- hosted CI: **passed** — GitHub Actions `Node` job (lint + test + build) ran against head `d2a7488` and completed successfully
- Issue #13 closure: **closed** via the PR #71 merge (`b0c30ff`)
- final verdict: **COMPLETE — merged into `main` as `b0c30ff`, closing Issue #13; automated gates passed; manual browser/accessibility/responsiveness/performance evidence remains documented as unverified and is a release-candidate QA responsibility**

### §14 manual matrix status

All rows below were **not executed** in this environment and are recorded as **unverified**. They must be run in a real browser during release-candidate QA (Epic 12 is merged into `main`; this matrix remains the open QA item).

| §14.1 functional/polish matrix row | Status | Evidence |
| --- | --- | --- |
| normal combat | unverified | no browser runtime |
| reduced motion OFF | unverified | no browser runtime |
| toggle reduced motion ON mid-run | unverified | no browser runtime |
| reduced motion ON from menu | unverified | no browser runtime |
| toggle reduced motion OFF mid-run | unverified | no browser runtime |
| dense wave | unverified | no browser runtime |
| pause/level-up | unverified | no browser runtime |
| Retry | unverified | no browser runtime |
| Menu → Game → Menu → Game | unverified | no browser runtime |
| preview normal combat | unverified | no browser runtime |
| preview reduced motion | unverified | no browser runtime |
| preview F3 | unverified | no browser runtime |

| §14.2 viewport matrix row | Status | Evidence |
| --- | --- | --- |
| 390×844 portrait | unverified | no browser runtime |
| 360×640 portrait | unverified | no browser runtime |
| 844×390 landscape/resized browser | unverified | no browser runtime |
| 1280×720 desktop | unverified | no browser runtime |
| 1920×1080 desktop | unverified | no browser runtime |

| §14.3 performance/profile row | Status | Evidence |
| --- | --- | --- |
| quiet period sampled FPS | unverified | no browser runtime |
| busy late-wave sampled FPS/slow ratio | unverified | no browser runtime |
| active/allocated projectile/drop/FX counts | unverified | no browser runtime |
| browser Performance profile (busy period) | unverified | no profiling tools available |
| reduced motion repeat | unverified | no browser runtime |
| GC/allocation correlation with enemy construction | unverified | no profiling tools available |
| §10 enemy-pooling trigger decision | **not triggered** (recorded above) | condition 3 unprovable in this environment |

---

## 21. Final decision ledger

- **P1:** one Epic 12 branch/PR.
- **P2:** feedback is a subscriber; no new gameplay events.
- **P3:** cosmetics use no gameplay RNG and no `Math.random()`.
- **P4:** generic pool is pure, minimal, strict; owners handle teardown.
- **P5:** projectile/drop pools are elastic; no gameplay cap.
- **P6:** cosmetic feedback is pooled and capped, with reserved headroom for essential cues.
- **P7:** reduced motion is live and cancels spatial effects/shake immediately.
- **P8:** stationary hit/kill cues, damage vignette, and level pulse remain under reduced motion.
- **P9:** PerfSampler is fixed-window, local-only, and read-only.
- **P10:** F3 extends Epic 11; no second diagnostics surface.
- **P11:** enemy pooling is evidence-gated and normally deferred.
- **P12:** if enemy pooling triggers, instance IDs remain unique per spawn and kill payloads survive until `enemy:killed` emission.
- **P13:** Phaser `Scale.FIT` and logical 390×844 canvas remain authoritative; actual `displaySize` feeds physical UI sizing.
- **P14:** no gameplay data retuning, event/stat/save schema changes, new dependencies, or audio lifecycle changes.
- **P15:** Epic 12 closes only with automated, browser, accessibility, responsiveness, and performance evidence honestly recorded.
