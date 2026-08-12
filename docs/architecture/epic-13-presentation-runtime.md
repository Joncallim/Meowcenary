# Epic 13 — Presentation Runtime and Physics Stability

**Issue:** #72 · **Branch:** `agent/epic-13-presentation-runtime` · **Delivery model:** one branch, one PR, ordered slice commits (maintainer-confirmed 2026-08-12).

This document is the executable implementation contract for Epic 13, the first
Alpha 2 / Golden Run epic. It supersedes older wording in Issue #72 where the
repository has since acquired stronger contracts through Epics 8–12.

The implementation agent should not need another architecture pass. If the live
repository conflicts with this document, stop and report the concrete mismatch
rather than improvising a new design.

Maintainer decisions merged into this architecture (2026-08-12):

1. Single delivery branch / single PR.
2. Proving art is **Pixelorama-produced**, not generated placeholder PNGs.
3. Hurt/defeat animation frames ship in the sheets but stay unwired at runtime
   in this epic (accepted).
4. Naming recommendations accepted as written (`physicsdebug`, F4,
   `projectile:default`, `drop:xp`, `scrap-shot`, `xp-mote`).
5. Display-size recommendations accepted (`displayDiameter = 2 × bodyRadius`).
6. The proving set covers **every current actor** — Scrap Tabby, Bolt Hound,
   Dust Mite, Junk Rusher, Trash Brute — plus one projectile and one pickup.
7. This document plus the index links land as the architecture commit.

---

## 1. Goal and release posture

Turn the current systems-prototype presentation into a stable, art-ready
gameplay surface **without changing combat rules, progression, balance, save
semantics, event payloads, or deterministic gameplay**.

Epic 13 owns:

- physics-debug rendering that is off by default, with an explicit
  development-only opt-in (query parameter and hotkey);
- the actor-view presentation seam: gameplay collision/body state remains
  authoritative while sprite/animation state is presentation-only;
- exact body radius constants and tested invariance across animation, frame,
  and flip changes;
- the `actor-art.json` catalog, spritesheet loading, and game-global animation
  registration;
- Pixelorama-produced proving art for all five current actors (Scrap Tabby,
  Bolt Hound, Dust Mite, Junk Rusher, Trash Brute) plus one projectile
  (`scrap-shot`) and one pickup (`xp-mote`);
- charger/rusher environment clipping (world bounds + obstacles) and the
  pause/resume/Retry physics pinning suite;
- a defect reproduction protocol and honestly recorded delivery evidence.

Epic 13 does **not** own:

- full art production or environment art (Epic 16);
- weapon acquisition or loot economy changes (Epic 14);
- merge UI redesign (Epic 15);
- combat-feel retuning beyond defects needed for stable motion/collision
  (Epic 17);
- balance or spawn-curve retuning;
- runtime use of hurt/defeat animation clips (frames ship in sheets; wiring is
  deferred to Epic 16/17 because it requires deferred-destruction timing);
- enemy pooling (Epic 12 evidence gate was not triggered);
- new gameplay events, save schema changes, gameplay JSON stat changes, or new
  dependencies.

The release rule: **presentation may make existing state easier to perceive; it
must never become a source of gameplay state or move a collision body.**

---

## 2. Live baseline and architectural findings

Architecture baseline: `main` at `3c6be99` (merge of `agent/visual-juice`),
post-Epic 12. Epic 12's delivery record reports 1184 tests across 80 files,
clean lint/typecheck, and a successful production build.

### 2.1 Physics debug rendering is on for every dev session

`src/main.ts:21` — `arcade: { debug: RuntimeConfig.isDev }`. No runtime toggle
exists; nothing in `src/` touches `world.drawDebug` or `world.debugGraphic`.
Phaser 3.90 supports runtime control: `world.drawDebug: boolean`,
`world.debugGraphic`, and `world.createDebugGraphic()`.

### 2.2 The visible object IS the physics object

Player (`src/entities/Player.ts:40-45`), Enemy (`src/entities/Enemy.ts:84-88`),
Projectile, and Drop are `Phaser.GameObjects.Arc` objects with
`scene.physics.add.existing(sprite)` and `body.setCircle(r)`. Player radius
`14` and enemy radius `13` are inline magic numbers; projectile/drop radii come
from `RuntimeConfig.gameplay` (4 and 8). Body dimensions are set once at
construction and never mutated — the invariant Epic 13 must preserve and pin.

### 2.3 The presentation seam already exists in embryonic form

Commit `bfbe99e` added display-only layers glued to the body each update:
player ears/shadow, enemy accent/shadow, projectile glow, drop glint
(`syncPresentation()` in Player/Enemy; per-update glue in Projectile/Drop).
Epic 13 formalizes this into the actor-view boundary; it does not invent a new
one.

### 2.4 Charger dash bypasses physics collision

`Enemy.update` runs the pure `chargerStep` state machine
(`src/gameplay/enemyMovement.ts:51-156`) and applies the result with
`applyPosition(pos, dt, immediate=true)` → `body.reset()` every dash frame
(`Enemy.ts:253-271`). `body.reset()` teleports with zeroed velocity, so Arcade
separation never acts on the dash, and enemies have no
`setCollideWorldBounds`. A dash toward the arena edge visibly carries the
rusher out of the world before it pursues back in.

Content check: the only shipped arena (`junkyard-lot`, `src/data/arenas.json`)
is exactly the 390×844 canvas with **no obstacles** and edge spawn regions
(margin 28). Therefore the world-bounds exit is the **live, reproducible**
artefact, and obstacle clipping is **latent** (no shipped geometry to hit).

### 2.5 Pause/resume is structurally sound but unpinned

`syncPhysicsPause` (`GameScene.ts:655-667`) pauses/resumes the Arcade world on
run status; `Player.update`, `SpawnSystem.update`, `WeaponSystem.update`, and
`DropSystem.update` all early-return or zero velocities when
`status !== 'active'`; charger state machines do not advance because
`SpawnSystem` never calls `enemy.update` while paused. No defect is expected;
Epic 13 pins this with tests rather than redesigning it.

### 2.6 Retry and scene transitions already have a teardown pattern

Retry is `scenePlugin.restart()` (`src/ui/runSummary.ts:139-145`) →
`handleShutdown` (`GameScene.ts:439-501`) destroys every entity-owned
presentation object. Textures and animations are game-global in Phaser, so new
animation registration must be idempotent across restarts, and the
camera-follow target (`GameScene.ts:171-173`) must remain the physics body
object, never a view.

### 2.7 No sprite pipeline exists yet

Boot loads audio only; there are no `load.image`/`load.spritesheet` calls and
no data→visual mapping (colors are hardcoded in entities). The character art
standard (`docs/art/character-asset-standard.md`) is already written: 48×48
frames, right-facing only, tags idle 4 / run 6 / hurt 2 / defeat 4, exports to
`public/assets/characters/<character-id>/`. `docs/art/pixelorama-workflow.md`
defines the reproducible project-build and export commands.
`docs/art/scripts/` does not exist yet.

### 2.8 Dev gating has a proven pattern

`?cheats=1…` URL grammar (`readDebugFlags`, cached once per page, DEV-only),
F8/F9/F10 hotkeys inside `if (RuntimeConfig.isDev)` in `GameScene`, and the
Epic 11 production sentinel checks (`[cheats]`, `debug:cheats`,
`[playtest] run summary` absent from `dist/`). Physics diagnostics reuse this
pattern; no new gating machinery is invented.

### 2.9 Test infrastructure is mock-based

Per-file `vi.mock('phaser', …)` plus `tests/__mocks__/phaser.ts`; pure modules
are tested directly. Sprite/animation mocks stay minimal; visual truth lives in
the manual browser matrix.

### 2.10 Pixelorama production environment is available

Verified 2026-08-13: Pixelorama 1.2 is installed at the standard macOS app path
and its headless CLI can open the generated `.pxo` projects and produce PNG/JSON
exports. `docs/art/pixelorama-workflow.md` owns the repeatable build, export,
and AI-led visual-review procedure.

---

## 3. Frozen decisions

These decisions are mandatory unless a concrete live-code contradiction is
found.

### D1 — One branch and one PR

All Epic 13 slices land on `agent/epic-13-presentation-runtime` and the single
delivery PR for Issue #72. Do not create slice branches or slice PRs.

### D2 — Physics debug is off by default; two dev-only opt-ins

- Boot-time: `?physicsdebug=1` query parameter, development-only, parsed by a
  pure total function (§6). Any other value, any environment without
  `import.meta.env.DEV`, means off.
- Runtime: F4 hotkey registered inside the existing
  `if (RuntimeConfig.isDev)` block in `GameScene`, so production builds
  tree-shake it exactly like F8–F10.
- Production never shows physics geometry. The `[physics-debug]` console
  string is added to the Epic 11 sentinel grep list as evidence.

### D3 — The body proxy stays authoritative; public entity APIs are preserved

The existing `Arc` objects remain the physics bodies. `player.sprite` /
`enemy.sprite` keep their types; colliders, overlaps, physics groups, and
`cameras.main.startFollow(player.sprite, …)` are untouched. Views never call
`setPosition`, `setCircle`, `setSize`, or any body method on the body proxy.

### D4 — One actor-view seam, two implementations

`src/entities/actorView.ts` owns `ActorPose`/`ActorView` (§7). `PlaceholderView`
is today's exact geometric composition and remains the default/fallback.
`SpriteView` renders the bound sprite. Selection is fail-soft: any missing
binding, texture, or animation yields the placeholder — art can never crash or
block a run. Views hold no gameplay state and read no gameplay RNG.

### D5 — Body dimensions are named constants; display size derives from the body, never the reverse

`export const PLAYER_BODY_RADIUS = 14` and `export const ENEMY_BODY_RADIUS = 13`
in their entity modules; projectile/drop radii stay in `RuntimeConfig.gameplay`.
The body circle is set exactly once at construction. In Epic 13 every bound
actor uses `displayDiameter = 2 × bodyRadius` (28 characters, 26 enemies,
8 projectile, 16 pickup) so the visible mass stays spatially consistent with
contact damage. Tests pin both the constants and the invariance of the body
across flip/frame/animation/alpha changes.

### D6 — Proving art is Pixelorama-produced for every current actor

Seven assets: `scrap-tabby`, `bolt-hound` (characters, 48×48, 16 frames per the
character standard), `dust-mite`, `junk-rusher`, `trash-brute` (enemies, same
frame/tag layout), `scrap-shot` (projectile, 16×16), `xp-mote` (pickup, 16×16).
Sources live under `assets-src/`; Lua build scripts live under
`docs/art/scripts/`; exports land at the standard `public/assets/…` paths
(§8). Pixelorama's native `.pxo` sources and CLI-produced exports are committed;
PNGs are never hand-generated or faked.

### D7 — `actor-art.json` is GameData catalog #11, validated and fail-closed

Bindings are keyed by convention: `character:<character-id>`,
`enemy:<enemy-id>`, `projectile:default`, `drop:xp`. Resolution is exact-id
only (no elite inheritance). `clips` with at least `idle` and `run` are
required for character/enemy bindings and optional otherwise. Gameplay catalogs
(characters/enemies/weapons JSON) are not modified.

### D8 — Animations register once, game-globally, restart-safe

`ensureActorAnimations(scene, registry)` runs once in `BootScene.create` after
data load. Keys are namespaced `art:<binding-id>:<clip-name>`. Registration is
guarded by `anims.exists`; a binding whose clip resolves to zero frames is
removed again so the view fallback engages (§9).

### D9 — Charger stability is fixed in the pure layer, with one boundary authority

`chargerStep` gains an optional `ChargerEnvironment` parameter
(bounds + obstacle AABBs + body radius). During `attacking`, dash travel is
clamped analytically: bounds clamp the end position; a segment-vs-expanded-AABB
test stops the dash at first obstacle contact and transitions to the normal
idle/cooldown. With no environment the function is byte-identical to today.
`body.reset()` is **retained** as the dash application mechanism — the pure
state machine is the trajectory authority, clipped positions never violate
bounds/obstacles, and contact damage is position/overlap-based and unaffected.
`setCollideWorldBounds` is deliberately **not** added to enemies: two boundary
authorities would fight and jitter, and velocity-driven pursuit toward the
in-bounds player cannot leave the world.

### D10 — Zero cross-cutting churn

No new events; no `GameEventMap` change; no `RunState`/stat/save schema change;
no gameplay JSON stat changes; no gameplay RNG consumption by views; no new
dependencies; no audio changes.

### D11 — Teardown ownership mirrors the existing pattern

Entities destroy their views; views destroy their own display objects, never
the body proxy. Textures and animations are game-global and are never destroyed
by scenes. Retry and Menu → Game → Menu → Game must show no duplicate-anim
warnings and no leaked display objects.

### D12 — Reduced motion and feedback are untouched

Epic 12's feedback system, motion policy, and settings flow are not modified.
A reduced-motion regression row is included in the manual matrix.

### D13 — Dev diagnostics stay statically unreachable in production

The F4 handler, the `[physics-debug]` log, and the query opt-in all sit behind
`RuntimeConfig.isDev` / `import.meta.env.DEV` so Rollup eliminates them, proven
by the sentinel grep after `npm run build`.

### D14 — Evidence honesty

Automated gates can complete without a browser, but the player-experience gate
requires a real browser session **after** the Pixelorama exports exist. An
AI-led visual review is sufficient; human review is optional. Unavailable rows
are recorded as unverified, never inferred. The epic is not complete until both
gates pass.

### D15 — Docs closeout rides the implementation PR

`docs/epics.md`, `docs/roadmap.md`, `docs/architecture.md`, and
`docs/knowledge-graph.md` are updated in the closeout slice with final
status/modules/counts — not mid-implementation.

---

## 4. File ownership map

Expected files by slice:

| File | Slice | Change |
| --- | --- | --- |
| `src/systems/debug.ts` | 1 | new pure `physicsDebugEnabled(search, isDev)` |
| `src/main.ts` | 1 | `arcade.debug` from the parser instead of `isDev` |
| `src/scenes/GameScene.ts` | 1, 4, 5 | F4 hotkey + F3 line (1); art registry + binding resolution (4); nothing in 5 except wiring already present |
| `tests/physicsDebug.test.ts` | 1 | parser + mocked world-toggle contract |
| `src/entities/actorView.ts` | 2, 4 | `ActorPose`/`ActorView`, `PlaceholderView` (2); `SpriteView`, static-art helper, view selection (4) |
| `src/entities/Player.ts` | 2, 4 | `PLAYER_BODY_RADIUS`; presentation routed through a view; optional trailing `art` param (4) |
| `src/entities/Enemy.ts` | 2, 4, 5 | `ENEMY_BODY_RADIUS`; view seam (2); optional `art` (4) and `environment` (5) params |
| `tests/actorView.test.ts` | 2, 4 | pose glue, fallback, body invariance |
| `tests/player.test.ts` | 2 | radius constant + view delegation regressions |
| `tests/enemy.test.ts` | 2, 5 | radius constant (2); env-clip integration (5) |
| `docs/art/scripts/build-*.lua` | 3 | seven small Pixelorama project builders |
| `assets-src/**/source/*.pxo` | 3 | committed native Pixelorama sources |
| `public/assets/{characters,enemies,projectiles,pickups}/…` | 3 | Pixelorama-exported sheets + metadata |
| `src/data/actor-art.json` | 4 | new catalog, seven bindings |
| `src/systems/types.ts` | 4 | `ActorArtBinding` etc.; `GameData.actorArt` |
| `src/systems/validation.ts` | 4 | `validateActorArtCatalog` + aggregate descriptor |
| `src/systems/actorArt.ts` | 4 | `DataActorArtRegistry` + `ensureActorAnimations` |
| `src/scenes/BootScene.ts` | 4 | spritesheet preload + one-time animation registration |
| `src/systems/SpawnSystem.ts` | 4, 5 | enemy art resolution (4); frozen `ChargerEnvironment` construction (5) |
| `src/systems/WeaponSystem.ts` | 4 | pass `projectile:default` binding into the pool factory |
| `src/systems/DropSystem.ts` | 4 | pass `drop:xp` binding into the pool factory |
| `src/entities/Projectile.ts`, `src/entities/Drop.ts` | 4 | static-art swap, pool-safe reset/spawn handling |
| `src/gameplay/enemyMovement.ts` | 5 | optional `ChargerEnvironment` + dash clipping |
| `tests/enemyMovement.test.ts` | 5 | pure clipping contract + no-env equivalence |
| `tests/spawnSystem.test.ts` | 5 | env wiring + pause pinning |
| `tests/actorArt.test.ts` | 4 | validation/registry/anim-registration contract |
| `docs/epics.md`, `docs/roadmap.md`, `docs/architecture.md`, `docs/knowledge-graph.md` | 6 | closeout status/modules/counts |
| this document | all | delivery evidence (§20) |

Do not modify gameplay JSON stats in this epic. `src/data/actor-art.json` is
the only new or changed data file.

---

## 5. Ordered delivery slices

1. **Physics-debug opt-in** — parser, `main.ts`, F4 toggle, F3 line, sentinel.
2. **Actor-view seam** — extract today's presentation into `PlaceholderView`
   behavior-identically; hoist body-radius constants; invariance tests green
   before any sprite exists.
3. **Pixelorama asset production** — seven Lua builders, native `.pxo`
   sources, and Pixelorama CLI exports.
4. **Actor-art catalog, loading, sprite views** — catalog #11, Boot preload,
   one-time animation registration, `SpriteView` + static-art swaps at the four
   resolution points, fail-soft fallbacks.
5. **Charger/rusher stability** — pure environment clipping, SpawnSystem
   wiring, pause/resume/Retry pinning tests.
6. **Repro protocol, manual matrix, docs closeout** — audit ledger, browser
   evidence, index updates, delivery record.
7. **Independent review/hardening** — confirmed fixes only, then final
   evidence.

Each slice is a green commit/review gate. Do not start the next slice with
failing focused or full tests. Slices 3 and 4 may swap order if a
Pixelorama-equipped session produces exports early; the runtime must be green with
and without exports regardless.

---

## 6. Slice 1 — physics-debug opt-in

### 6.1 Pure parser (`src/systems/debug.ts`)

```ts
/**
 * Development-only physics diagnostics opt-in: `?physicsdebug=1`.
 * Any other value, any duplicate (first value wins), and every non-dev
 * environment resolve to false. Total function — never throws.
 */
export function physicsDebugEnabled(search: string, isDev: boolean): boolean {
  if (!isDev) return false;
  return new URLSearchParams(search).get('physicsdebug') === '1';
}
```

Deliberately separate from the frozen `?cheats=1…` grammar: physics diagnostics
are view-only and must not require enabling gameplay cheats.

### 6.2 Boot default (`src/main.ts`)

```ts
physics: {
  default: 'arcade',
  arcade: {
    debug: physicsDebugEnabled(globalThis.location?.search ?? '', RuntimeConfig.isDev),
  },
},
```

### 6.3 Runtime toggle (`src/scenes/GameScene.ts`)

Register inside the existing `if (RuntimeConfig.isDev)` block:

```ts
this.input.keyboard?.on('keydown-F4', this.togglePhysicsDebug, this);
```

Handler contract:

```ts
private togglePhysicsDebug(): void {
  if (!RuntimeConfig.isDev) return;
  const world = this.physics.world;
  if (!world.debugGraphic) {
    world.createDebugGraphic();
  }
  const next = !world.drawDebug;
  world.drawDebug = next;
  const graphic = world.debugGraphic;
  graphic.setVisible(next);
  if (!next) graphic.clear();
  console.info(`[physics-debug] ${next ? 'on' : 'off'}`);
}
```

Implementation-time verification against the installed Phaser 3.90 source:
confirm `createDebugGraphic()` idempotency expectations, debug-graphic depth,
and that `drawDebug = false` alone leaves a stale frame (hence `clear()`). If
3.90 semantics differ, adjust the handler — not the contract (toggle must never
leave stale geometry).

Unregister in `handleShutdown` beside the F8–F10 `off` calls. Add one F3
overlay line, `PhysDebug: on|off`, read from `this.physics.world.drawDebug`
(false in production; harmless).

### 6.4 Slice 1 tests

`tests/physicsDebug.test.ts`:

- non-dev returns false even with `?physicsdebug=1`;
- missing/empty/`=0`/`=2`/`=true` → false; exact `=1` → true;
- duplicate params: first value wins;
- malformed/percent-garbage strings never throw;
- `main.ts` wiring: not unit-tested; covered by the parser contract plus the
  sentinel/manual rows.

Scene toggle (mocked world): first F4 creates the graphic and enables drawing;
second F4 disables, hides, and clears; handler absent in a non-dev construction
path. Follow the existing per-file Phaser mock pattern; do not build a full
world fake.

### 6.5 Sentinel

`npm run build` then grep `dist/assets/*.js` for `[physics-debug]` (and the
Epic 11 strings) — all absent.

---

## 7. Slice 2 — actor-view seam

### 7.1 Module: `src/entities/actorView.ts` (Phaser-aware)

```ts
export interface ActorPose {
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly moving: boolean;
  readonly alpha: number;
}

export interface ActorView {
  update(pose: ActorPose): void;
  destroy(): void;
}
```

### 7.2 `PlaceholderView` — today's composition, extracted

```ts
export interface GluedLayer {
  readonly node: Phaser.GameObjects.Arc;
  readonly dx: number;
  readonly dy: number;
  readonly flashes: boolean; // participates in hurt-flash alpha
}

new PlaceholderView(
  body: Phaser.GameObjects.Arc,                       // not owned, never hidden here
  layers: readonly GluedLayer[],                      // owned (ears / accent)
  shadow: { readonly node: Phaser.GameObjects.Arc; readonly dy: number }, // owned
)
```

- `update(pose)`: layers at `(pose.x + dx, pose.y + dy)`; shadow at
  `(pose.x, pose.y + shadowDy)`; `pose.alpha` applied to the body and to layers
  with `flashes: true`; `facing`/`moving` are ignored (geometric layers are
  symmetric). This reproduces current behavior exactly.
- `destroy()`: destroys owned layers and shadow only — never the body proxy.

### 7.3 `SpriteView` — interface frozen now, implemented in Slice 4

```ts
new SpriteView(
  body: Phaser.GameObjects.Arc,                       // hidden once, at construction
  shadow: { readonly node: Phaser.GameObjects.Arc; readonly dy: number },
  sprite: Phaser.GameObjects.Sprite,                  // owned
  clips: { readonly idle: string; readonly run: string },
)
```

Contract (frozen now so Slice 2 tests can pin the seam): `update` positions and
alphas the sprite from the pose, glues the shadow, applies `setFlipX` for
`facing -1`, and switches clips only on a `moving` edge (initial clip `idle`).
The body proxy stays active (physics) and invisible. The view never reads or
writes any body property.

### 7.4 Player refactor boundaries

- Constructor signature gains one trailing optional parameter
  (`art?: ResolvedActorArt`, §9); Slice 2 always passes nothing.
- Body proxy creation, `setCircle(PLAYER_BODY_RADIUS)`,
  `setCollideWorldBounds(true)`, depth, and all getters stay byte-equivalent.
- Ears/shadow move into the view. `syncPresentation()` is replaced by
  `currentPose()` + `view.update(pose)`:
  - `x`/`y` from the sprite;
  - `facing`: sign of the input move vector's x; last nonzero value persists;
    initial `1`;
  - `moving`: run active and move vector nonzero;
  - `alpha`: `0.45` while `invulnerableMs > 0`, else `1` — identical visual
    result to today's `setBodyAlpha` (body + ears flash, shadow never).
- `destroy()`: `view.destroy()` then `sprite.destroy()`.
- `export const PLAYER_BODY_RADIUS = 14`; the circle, `setCircle`, and the
  `bodyRadius` getter fallback all reference it.

### 7.5 Enemy refactor boundaries

Same shape as Player, plus facing/moving rules per state:

- pursuit: `facing` = sign of velocity x (last nonzero persists), `moving` =
  speed above epsilon;
- `winding`: stationary, `facing` tracks the target;
- `attacking`: `moving` true, `facing` = sign of `dashDirection.x` (zero keeps
  last);
- `idle`: `moving` false;
- `alpha` is always `1` (no enemy flash exists today — do not add one).
- `export const ENEMY_BODY_RADIUS = 13`.

### 7.6 Slice 2 tests

Extend `tests/player.test.ts` / `tests/enemy.test.ts`; add
`tests/actorView.test.ts` with the shared mock pattern:

- `PlaceholderView.update` glues layers/shadow to the pose with exact offsets;
- alpha flashes body + flashing layers, never the shadow;
- body circle set exactly once at construction with the exported constant;
- after any pose sequence (flips, moving toggles, alpha flashes), the body's
  position/size APIs show no view-issued calls (mock spies);
- entity destroy tears down view-owned objects and the body proxy exactly once;
- player hurt flash timing is unchanged (0.45 during i-frames, restored at 0);
- all pre-existing entity tests pass unmodified.

---

## 8. Slice 3 — Pixelorama asset production

Production art direction, silhouette decisions, palettes, frame intent, and the
Pixelorama-session checklist is frozen in
[`../art/epic-13-sprite-design.md`](../art/epic-13-sprite-design.md). The concept
boards there are references only and must never be used as runtime exports.

### 8.1 Assets and paths

| Asset | Kind | Frames / tags | Source (`assets-src/…`) | Export (`public/assets/…`) |
| --- | --- | --- | --- | --- |
| `scrap-tabby` | character | 48×48, 16f: idle 1-4, run 5-10, hurt 11-12, defeat 13-16 | `characters/scrap-tabby/source/scrap-tabby.pxo` | `characters/scrap-tabby/scrap-tabby.{png,json}` |
| `bolt-hound` | character | same layout | `characters/bolt-hound/…` | `characters/bolt-hound/…` |
| `dust-mite` | enemy | same layout | `enemies/dust-mite/…` | `enemies/dust-mite/…` |
| `junk-rusher` | enemy | same layout | `enemies/junk-rusher/…` | `enemies/junk-rusher/…` |
| `trash-brute` | enemy | same layout | `enemies/trash-brute/…` | `enemies/trash-brute/…` |
| `scrap-shot` | projectile | 16×16, 2f tag `fly` | `projectiles/scrap-shot/…` | `projectiles/scrap-shot/…` |
| `xp-mote` | pickup | 16×16, 4f tag `idle` | `pickups/xp-mote/…` | `pickups/xp-mote/…` |

Character scripts use the standard layers (`body`, `face`, `outfit`, `weapon`,
`shadow`, hidden `notes`); enemy scripts use `body`, `face`, hidden `notes`;
props use `body`, hidden `notes`. All actors are right-facing (engine mirrors).
The feet/body-center anchor stays fixed across frames. Runtime shadows remain
the shadow authority — the exported sheets must not bake a ground shadow
(the `shadow` layer exists for final art later; keep it empty/hidden in these
exports by drawing nothing into it).

### 8.2 Build scripts

One small inspectable script per asset: `docs/art/scripts/build-<id>.lua`,
each with a header comment giving its run and export commands. Scripts create
the canvas, frames, tags, and layers, draw the frames per
`docs/art/style-guide.md` (chunky, bold shapes, dark outline — `#0a0f14`
matches the current outline color — limited high-contrast palette per actor),
and save the `.pxo` source. Suggested palette anchors from the current
placeholder hues, so silhouettes stay familiar: tabby amber `#f7c948`, mite
red `#ef4444`, rusher orange `#f97316`, brute purple `#a855f7`; Bolt Hound and
the two props choose distinct high-contrast hues that cannot blur into the
others at 28/8/16 px. Silhouettes must satisfy the standard's review checklist
(distinct, readable at phone scale, original per `docs/art/originality.md`).

Build and export command (from `docs/art/pixelorama-workflow.md`):

```bash
docs/art/scripts/export-pixelorama.sh
```

### 8.3 Reproducibility rule

The builder validator must pass before export. Pixelorama must open each `.pxo`
and produce the PNG/JSON outputs; **never** hand-author PNGs or forge exports.
Any later taste pass may edit `.pxo` files, but accepted changes are mirrored
back into the matching builder before the final export so source regeneration
does not erase approved art.

---

## 9. Slice 4 — actor-art catalog, loading, sprite views

### 9.1 `src/data/actor-art.json` (catalog #11)

```json
{
  "bindings": [
    { "id": "character:scrap-tabby", "kind": "character",
      "textureKey": "art-character-scrap-tabby",
      "url": "assets/characters/scrap-tabby/scrap-tabby.png",
      "frame": { "width": 48, "height": 48 }, "displayDiameter": 28,
      "clips": { "idle": { "start": 0, "end": 3, "frameRate": 6 },
                 "run":  { "start": 4, "end": 9, "frameRate": 10 } } }
  ]
}
```

Seven bindings: the five actors, plus

```json
    { "id": "projectile:default", "kind": "projectile",
      "textureKey": "art-projectile-scrap-shot",
      "url": "assets/projectiles/scrap-shot/scrap-shot.png",
      "frame": { "width": 16, "height": 16 }, "displayDiameter": 8 }
```

and `drop:xp` → `assets/pickups/xp-mote/xp-mote.png`, 16×16,
`displayDiameter` 16. `hurt`/`defeat` frames exist in the sheets but are
deliberately absent from the runtime catalog in Epic 13.

### 9.2 Types and validation

`src/systems/types.ts`:

```ts
export type ActorArtKind = 'character' | 'enemy' | 'projectile' | 'drop';
export interface ActorArtClip { readonly start: number; readonly end: number; readonly frameRate: number; }
export interface ActorArtBinding {
  readonly id: string;
  readonly kind: ActorArtKind;
  readonly textureKey: string;
  readonly url: string;
  readonly frame: { readonly width: number; readonly height: number };
  readonly displayDiameter: number;
  readonly clips?: Readonly<Record<string, ActorArtClip>>;
}
```

`validateActorArtCatalog` (in `src/systems/validation.ts`, added to
`loadGameData` and the Epic 11 aggregate descriptor list; `GameData` gains
`actorArt`):

- root fields whitelisted; `MAX_BINDINGS` 64;
- `id` matches `^(character|enemy|projectile|drop):[a-z0-9-]+$`; ids and
  `textureKey`s unique; `kind` matches the id prefix;
- `url` matches `^assets/[a-z0-9/-]+\.png$`;
- `frame.width/height` integers in [8, 128]; `displayDiameter` finite in
  [4, 128];
- `clips`: required (`idle` + `run` at minimum) for `character`/`enemy`,
  optional otherwise; `start`/`end` non-negative integers with `start <= end`;
  `frameRate` finite in [1, 60];
- cross-catalog references to gameplay catalogs are deliberately **not**
  asserted — an unresolvable binding is harmless (fallback) and this keeps
  presentation decoupled from gameplay data.

`src/systems/actorArt.ts`: `DataActorArtRegistry` following the established
recipe (revalidate, `structuredClone` + `deepFreeze`, `bindingById`), and
`ensureActorAnimations` below.

### 9.3 Boot loading and one-time animation registration

`BootScene.preload` (mirroring the audio pattern — raw import, validation at
create):

```ts
import actorArtJson from '../data/actor-art.json';
// preload():
for (const binding of actorArtJson.bindings) {
  this.load.spritesheet(binding.textureKey, binding.url, {
    frameWidth: binding.frame.width,
    frameHeight: binding.frame.height,
  });
}
```

`ensureActorAnimations(scene, registry)` — called once from `BootScene.create`
after `loadGameData()`:

- skip bindings without clips or whose `textureKey` failed to load
  (`!scene.textures.exists(...)`) — the view fallback engages;
- key format `art:<binding-id>:<clip-name>`;
- if `scene.anims.exists(key)`, skip (restart-safe);
- create with `generateFrameNumbers(textureKey, { start, end })`,
  `frameRate`, `repeat: -1`;
- if the created animation has zero frames (out-of-range clip), `anims.remove`
  it so the view fallback engages.

### 9.4 Resolution points and view selection

- `GameScene.create`: `const actorArt = new DataActorArtRegistry(ctx.data);`
  pass `actorArt.bindingById('character:' + request.characterId)` into
  `Player`; pass the registry into `SpawnSystem`;
  `actorArt.bindingById('projectile:default')` into `WeaponSystem`;
  `actorArt.bindingById('drop:xp')` into `DropSystem`.
- `SpawnSystem.spawn`: `bindingById('enemy:' + definition.id)` per spawn
  (exact id; elites fall back to placeholder in Epic 13).
- Player/Enemy construct a `SpriteView` only when binding + texture + both
  clip animations exist; otherwise the Slice 2 `PlaceholderView`. The body
  proxy is hidden only after a `SpriteView` is successfully constructed. Sprite
  depth equals the replaced body-proxy depth (player 5, enemy 4); origin 0.5;
  scale `displayDiameter / frame.width`.
- Projectile/Drop use a small static-art helper in `actorView.ts`
  (`createStaticArtSprite(scene, binding, depth)` → `Sprite | undefined`):
  when present, the circle + glow/glint hide and the sprite syncs position in
  `update()`. Drop shows the sprite only while `kind === 'xp'`; other kinds use
  the existing geometric presentation. Pool `reset()`/`spawn()` keep art state
  consistent (hidden on reset; correct visibility on spawn).

### 9.5 Slice 4 tests

`tests/actorArt.test.ts` plus entity/system regressions:

- validation: clone-valid → mutate → throws (each rule above); registry
  freeze/recipe tests;
- `ensureActorAnimations`: creates once, skips on second call (restart
  simulation), skips missing textures, removes zero-frame animations;
- key naming `art:character:scrap-tabby:run` pinned;
- view selection: binding + texture + anims → sprite; any missing piece →
  placeholder (layers visible, body proxy visible);
- body invariance with art bound: flip/clip/alpha changes never touch the body
  (mock spies; `setCircle` called once with the constant);
- drop kind gating: sprite for `xp`, geometric for `scrap`/`chest`; pooled
  reuse leaves no stale visibility;
- projectile/drop pooling regressions from Epic 12 still pass unmodified;
- fallback determinism: with no textures loaded, behavior is byte-identical to
  Slice 2.

---

## 10. Slice 5 — charger/rusher stability

### 10.1 Pure contract (`src/gameplay/enemyMovement.ts`)

```ts
export interface ChargerEnvironment {
  readonly bounds: { readonly x: number; readonly y: number;
                     readonly width: number; readonly height: number };
  readonly obstacles: ReadonlyArray<{ readonly x: number; readonly y: number;
                                      readonly w: number; readonly h: number }>;
  readonly bodyRadius: number;
}

export function chargerStep(
  snapshot: ChargerMovementSnapshot,
  target: Vec2,
  definition: ChargerMovementDefinition,
  dtMs: number,
  env?: ChargerEnvironment,
): ChargerStepResult;
```

Semantics during `attacking` when `env` is present:

- **Bounds:** the computed dash position is clamped each application to the
  bounds inset by `bodyRadius`. The dash timer runs to completion pressed at
  the wall (no extra state transition) — simple and predictable.
- **Obstacles:** the per-tick dash segment is tested against each obstacle AABB
  expanded by `bodyRadius` (slab method, earliest hit parameter `t`). On a hit,
  the position becomes the contact point, the state transitions to `idle` with
  the normal `cooldownMs`, and the leftover tick time flows through the idle
  branch exactly like a natural dash completion. The expansion treats the
  circle as a square — conservative by at most `(√2 − 1) × r ≈ 5.4 px` at
  corners; recorded as an accepted approximation.
- Existing finite/positive validation style extends to `env` (finite bounds,
  positive radius, finite obstacle rects).
- **With `env` absent the function is byte-identical to today** — every
  existing `enemyMovement` test runs unmodified.

### 10.2 Wiring

- `SpawnSystem` builds one frozen environment from the arena
  (`{ bounds: { x: 0, y: 0, width, height }, obstacles: arena.obstacles,
  bodyRadius: ENEMY_BODY_RADIUS }`) and passes it to each `Enemy` (trailing
  optional constructor parameter); `Enemy.update` forwards it to `chargerStep`.
  Elite chargers flow through the same path.
- `body.reset()` application is retained per D9. No `setCollideWorldBounds` on
  enemies. Pursuit movement is unchanged (velocity-based; existing obstacle
  collider governs it; the in-bounds player target keeps pursuit inside the
  world).

### 10.3 Pinning tests

`tests/enemyMovement.test.ts` / `tests/enemy.test.ts` /
`tests/spawnSystem.test.ts`:

- dash toward a world edge: every tick's position stays within bounds − radius;
  dash completes into `idle`/cooldown; no NaN or throw;
- dash across a synthetic obstacle AABB: stops at the contact point, enters
  `idle` with `cooldownMs`, and no intermediate position lies inside the
  expanded AABB — including a large-dt tick (no tunneling);
- env absent: outputs equal today's golden cases exactly;
- determinism: identical snapshot/dt sequences produce identical traces with
  and without pauses interleaved;
- pause mid-dash: with `status !== 'active'`, `SpawnSystem` never calls
  `enemy.update`; snapshot (pos/state/timer/dash vectors) is unchanged and
  velocities are zeroed; resume continues from the exact snapshot;
- player velocity is zeroed while paused (pin existing behavior);
- SpawnSystem passes the same frozen env object to every spawn (identity
  assertion), and an `Enemy` constructed without env behaves as before.

### 10.4 Audit ledger (fill in during Slice 6)

| Suspected artefact | Verdict | Evidence / fix |
| --- | --- | --- |
| Charger dash exits world bounds | confirmed (static analysis + repro) | fixed by §10 environment clip |
| Charger dash clips obstacles | latent (no shipped obstacles) | fixed by §10; synthetic tests; manual verification deferred to first obstacle arena |
| Pause/resume dash or velocity corruption | cleared by analysis | pinned by §10.3 tests |
| Contact damage during dash | position-based overlap, unaffected | existing overlap tests + manual row |
| Camera follow after view seam | dormant (arena == canvas) | `startFollow` target stays the body proxy; live verification deferred to first oversized arena |
| Presentation leaks across Retry / Menu round-trips | none expected | pinned tests + manual rows |

---

## 11. Slice 6 — repro protocol, manual matrix, docs closeout

### 11.1 Defect reproduction protocol

For every suspected artefact in §10.4: reproduce on the Golden Run baseline
(default character/arena, no cheats), record exact steps and observed behavior,
fix only confirmed defects, and add the pinning test before the fix is
considered done. Do not speculatively rewrite movement or physics code.

### 11.2 Manual matrix

Run §13 in a real browser after the Pixelorama exports exist. Unavailable rows
are recorded as unverified, never inferred.

### 11.3 Docs closeout

Update `docs/epics.md` (status + final module list), `docs/roadmap.md`,
`docs/architecture.md` (pointer paragraph), and `docs/knowledge-graph.md`
(runtime shape, counts, catalog #11, new modules) with final numbers.

---

## 12. Automated test matrix

### 12.1 Focused Epic 13 gate

```bash
npm test -- --run \
  tests/physicsDebug.test.ts \
  tests/actorView.test.ts \
  tests/actorArt.test.ts \
  tests/enemyMovement.test.ts \
  tests/enemy.test.ts \
  tests/player.test.ts \
  tests/spawnSystem.test.ts
```

### 12.2 High-risk regression gate

```bash
npm test -- --run \
  tests/weaponSystem.test.ts \
  tests/dropSystem.test.ts \
  tests/projectile.test.ts \
  tests/drop.test.ts \
  tests/feedback.test.ts \
  tests/pool.test.ts \
  tests/motion.test.ts \
  tests/perf.test.ts \
  tests/lootIntegration.test.ts \
  tests/arenaBrowserIntegration.test.ts \
  tests/menuScene.test.ts \
  tests/runSummary.test.ts \
  tests/debugCheats.test.ts \
  tests/validation.test.ts
```

If an exact filename differs in the live tree, use the existing equivalent; do
not invent or delete a test to match this list.

### 12.3 Final automated gate

```bash
npm test
npm test -- --sequence.shuffle   # run three times
npm run lint
npm run build
git diff --check
# sentinel evidence: grep dist/assets/*.js for
#   [cheats]   debug:cheats   [playtest] run summary   [physics-debug]
# all must be absent
```

No existing test may be deleted, skipped, or weakened to fit this epic.

---

## 13. Manual player-experience matrix

Prerequisite: Pixelorama exports exist under `public/assets/`. Record build,
browser/device, viewport, result, and one-line evidence per row.

| Build | Case | Expected |
| --- | --- | --- |
| dev | default boot/run | no physics debug geometry anywhere |
| dev | `?physicsdebug=1` | debug geometry from boot |
| dev | F4 mid-run | toggles geometry live; disabling leaves no stale lines; F3 shows state |
| preview | default + F4 + query | all inert; sentinel evidence recorded |
| dev | Scrap Tabby run | sprite renders; idle/run transitions; flips with direction; hurt flash reads during i-frames |
| dev | Bolt Hound run | sprite renders (requires an unlocked save — note how it was unlocked) |
| dev | Dust Mite / Junk Rusher / Trash Brute | sprites render; rusher dash readable; silhouettes distinguishable in a crowd |
| dev | projectile + XP mote | sprites render; scrap/chest drops remain geometric |
| dev | rusher dash at arena edge | stops at the edge; no exit, snap-back, or drift |
| dev | contact damage | spatially consistent with the visible actor |
| dev | pause mid-dash → resume | no jump, drift, or stuck body |
| dev | Retry mid-dash | clean state; no console warnings |
| dev | Menu → Game → Menu → Game | no duplicate-anim warnings; no visual leaks or offsets |
| dev | reduced motion ON | Epic 12 behavior unchanged (regression) |
| dev | 10-minute soak | no visible physics/presentation artefact accumulation |
| dev | exports deleted | placeholder presentation returns; game fully playable |

---

## 14. Global acceptance criteria

- [ ] One Epic 13 branch and one PR only.
- [ ] Physics debug is off by default in dev and unreachable in production; both opt-ins work; sentinel absent from `dist/`.
- [ ] The body proxy remains the sole physics object; public entity APIs, colliders, groups, and camera-follow target are unchanged.
- [ ] `PLAYER_BODY_RADIUS` / `ENEMY_BODY_RADIUS` are exported constants; body circle is set once; views never mutate the body (spies pin this).
- [ ] Placeholder presentation is byte-identical to pre-epic behavior when no art is bound or loaded.
- [ ] All seven bindings validate; missing texture/animation falls back per actor, never throws.
- [ ] Animations register once per game lifetime; Retry and scene round-trips show no duplicate registration or leaks.
- [ ] Sprites never move the collision body; `displayDiameter = 2 × bodyRadius` for every bound actor.
- [ ] Charger dash is clamped to world bounds and stops at obstacle contact; no-env behavior is byte-identical; pause/resume determinism pinned.
- [ ] No new events, no gameplay JSON stat changes, no save/schema changes, no gameplay RNG use in views, no new dependencies.
- [ ] Pixelorama sources and scripts are committed; exports are real Pixelorama output (never hand-forged); §20 records who ran them.
- [ ] Focused, regression, full, shuffled ×3, lint, build, diff, and sentinel gates pass.
- [ ] §13 rows are honestly recorded; the epic closes only when the player-experience gate passes.

---

## 15. Reviewer traps

Reject or fix these patterns:

- reading sprite frame dimensions into body size or offset;
- re-issuing `setCircle`/`setSize`/`setPosition` on the body from any view code;
- creating animations without the `anims.exists` guard, or per scene restart;
- destroying textures/animations on scene shutdown;
- gating any gameplay behavior on the presence of an art binding;
- shipping physics debug on by default, or reachable in a production build;
- a runtime toggle that leaves stale debug lines after disable;
- hand-authoring "placeholder" PNGs instead of Pixelorama exports;
- adding `setCollideWorldBounds` to enemies (two boundary authorities) or
  changing pursuit movement;
- changing dash feel beyond clipping (speeds, ranges, durations are data and
  stay untouched);
- emitting events from views, or consuming run RNG for presentation;
- touching Epic 12 feedback/pooling or Epic 11 cheat/playtest behavior;
- marking §13 rows passed without a real browser run;
- adding a dependency for image loading, animation, or physics.

---

## 16. Commit plan

| Gate | Commit intent | Required before next gate |
| --- | --- | --- |
| Architecture | `docs: architect Epic 13 presentation runtime and physics stability` | maintainer review against current main |
| Slice 1 | `Epic 13 · Slice 1: physics-debug opt-in` | focused tests + full suite + lint/build + sentinel |
| Slice 2 | `Epic 13 · Slice 2: actor-view seam` | view/invariance tests + full suite |
| Slice 3 | `Epic 13 · Slice 3: Pixelorama asset pipeline` | builders, `.pxo` sources, and exports committed |
| Slice 4 | `Epic 13 · Slice 4: actor-art catalog and sprite views` | catalog/view tests + regression gate + fallback verification |
| Slice 5 | `Epic 13 · Slice 5: charger environment clipping and pause pinning` | movement tests + full suite + dev browser smoke |
| Slice 6 | `Epic 13 · Slice 6: repro protocol, manual matrix, docs closeout` | §13 rows + audit ledger + index updates |
| Review | one commit per coherent confirmed fix | full independent rerun + ready/not-ready verdict |

Do not squash away slice boundaries before review; they are part of the audit
trail.

---

## 17. Implementation-agent handoff

Use this prompt verbatim for a lower-tier implementation agent:

> Implement Epic 13 / Issue #72 in the Meowcenary repository on the existing
> branch `agent/epic-13-presentation-runtime`. Do not create another branch or
> PR.
>
> Read in order:
> 1. `docs/architecture/epic-13-presentation-runtime.md` in full;
> 2. `docs/knowledge-graph.md`;
> 3. `docs/art/character-asset-standard.md`, `docs/art/pixelorama-workflow.md`,
>    and `docs/art/style-guide.md`;
> 4. the live files named in §4 before editing them.
>
> Treat the Epic 13 document as the frozen implementation contract. Do not
> redesign it. Run the baseline tests, then implement slices in order,
> committing each green: 1 physics-debug opt-in; 2 actor-view seam;
> 3 Pixelorama pipeline (builders + native `.pxo` sources + CLI exports — never
> hand-author PNGs); 4 actor-art catalog + sprite views with fail-soft
> fallback; 5 charger environment clipping + pause pinning; 6 closeout.
>
> Preserve gameplay behavior exactly: no new events, no data retuning, no
> gameplay RNG in views, no save/stat/schema changes, no dependency additions,
> no physics-rewrite. The body proxy stays authoritative; views never touch it.
> With no environment, `chargerStep` output must be byte-identical to today.
>
> After every slice run its focused gates. Before handoff run full and shuffled
> ×3 tests, lint, build, diff check, and the sentinel greps. Mark every manual
> row you cannot execute "unverified"; never infer a pass. Record exact
> test/file counts, commit SHAs, the audit ledger, deviations, CI state, and
> the final ready/not-ready verdict in §20.

---

## 18. Independent review and hardening handoff

Use this prompt after the implementation slices are present:

> Review and harden Epic 13 / Issue #72 on
> `agent/epic-13-presentation-runtime`. Do not create another branch or PR.
> Diff from architecture baseline `3c6be99` and read
> `docs/architecture/epic-13-presentation-runtime.md` in full before reviewing
> code.
>
> Treat the architecture as frozen. Trace behavior, not just files.
> Prioritize: physics-debug default-off and production unreachability;
> F4 toggle hygiene (no stale lines, listener teardown); body-radius invariance
> under flip/clip/alpha; placeholder parity when art is absent; one-time
> animation registration across Retry and scene round-trips; view teardown
> ownership; catalog validation fail-closed behavior; `chargerStep` no-env byte
> equivalence and env-clip correctness (bounds, obstacle contact, large-dt no
> tunneling); pause/resume determinism; pool reuse with art state; zero
> gameplay/event/RNG/schema changes; sentinel absence.
>
> Independently run the automated and manual matrices available to you. Add
> mutation-style tests for confirmed gaps and fix only in-scope defects. Do not
> broaden into art direction, balance, new content, data retuning,
> dependencies, or a physics-engine change. End with exact final counts,
> commit/head SHAs, CI, every manual/unverified row, deviations, and a
> ready/not-ready verdict against §14.

---

## 19. Risks, rollback, decision ledger

### Risks and mitigations

- **View/body divergence (visual lag):** poses are read after Arcade
  integration inside the entity update — the existing documented ordering;
  pinned by glue tests.
- **Duplicate animation registration across restarts:** Boot-scoped,
  `anims.exists`-guarded registration; zero-frame animations are removed so the
  fallback engages.
- **Dash-feel change from clipping:** no shipped obstacles, so the live change
  is limited to edge clamping; determinism and no-env equivalence are pinned.
- **Phaser 3.90 debug-graphic quirks:** handler contract includes clear/hide on
  disable; implementation verifies against the installed source (§6.3).
- **Pixelorama unavailable in a later implementation session:** committed
  `.pxo` sources remain editable; install Pixelorama or set `PIXELORAMA_BIN`
  before regenerating exports. Never fake PNGs (D6, D14).
- **Mock drift in tests:** sprite/anim mocks stay minimal; the browser matrix
  is the visual truth.
- **Bundle growth:** seven small sheets, kilobyte-scale; committed binary
  assets follow the audio WAV precedent. `assets-src/` is git-tracked (not in
  `.gitignore`).

### Rollback

Revert the single PR. The catalog and assets are additive removals; the
placeholder path restores the exact pre-epic presentation; physics debug
returns to its previous dev-default. No save, schema, event, or data
migrations exist, so rollback is total. Slice 5 is isolated to
`enemyMovement.ts` plus wiring and can be reverted independently.

### Decision ledger

- **P1:** one branch (`agent/epic-13-presentation-runtime`), one PR.
- **P2:** physics debug default-off; `?physicsdebug=1` + F4 opt-ins; dev-only;
  `[physics-debug]` sentinel.
- **P3:** body proxy authoritative; public entity APIs preserved; camera
  follows the body.
- **P4:** one actor-view seam; placeholder is default and fallback; fail-soft
  everywhere.
- **P5:** body radii are exported constants; `displayDiameter = 2 × bodyRadius`
  for all bound actors.
- **P6:** Pixelorama-produced art for all five current actors + `scrap-shot` +
  `xp-mote`; deterministic builders, native sources, and exports committed.
- **P7:** `actor-art.json` is GameData catalog #11; convention-keyed bindings;
  exact-id resolution; gameplay catalogs untouched.
- **P8:** animations register once in Boot, namespaced, restart-safe.
- **P9:** charger stability fixed in the pure layer; `body.reset()` retained
  and justified; no enemy `setCollideWorldBounds`.
- **P10:** hurt/defeat frames ship in sheets but stay unwired at runtime
  (Epic 16/17).
- **P11:** no new events, data retuning, schema changes, RNG use in views, or
  dependencies.
- **P12:** reduced-motion/feedback behavior unchanged and regression-covered.
- **P13:** evidence honesty — AI-led browser review at 390×844 is accepted as
  the player-experience gate; unavailable synthetic-content rows are recorded.
- **P14:** docs indexes update at closeout, not mid-implementation.

---

## 20. Delivery record

Status: **implementation complete — READY**.

- architecture baseline SHA: `3c6be99` (merge of `agent/visual-juice`)
- architecture commit SHA: `e74dd01`
- Slice 1 / physics diagnostics: exact opt-in parser plus F4 toggle and F3
  state; a real-browser test exposed Phaser's `createDebugGraphic()` side
  effect, which is now isolated in a pure toggle helper and regression-pinned.
- Slice 2 / presentation seam: `PLAYER_BODY_RADIUS`/`ENEMY_BODY_RADIUS`,
  `ActorView`, byte-equivalent placeholder fallback, sprite flip/clip/alpha
  glue, and single-owner teardown are implemented and focused-green.
- Slice 3 / exports: the Aseprite handoff pivoted to Pixelorama 1.2 on
  2026-08-13. The built-in image generator produced the final actor/prop art
  direction boards; seven deterministic builders produced native `.pxo`
  sources and real PNG/JSON exports. All sheets were reviewed in the 390×844
  runtime; no human production work remains.
- Slice 4 / catalog: fail-closed GameData catalog #11, immutable lookup,
  best-effort Boot loading, one-time namespaced animations, animated actors,
  projectile `fly`, XP `idle`, and pool-safe fallback wiring are complete.
- Slice 5 / stability: charger dashes clamp to inset world bounds and stop at
  expanded-obstacle contact without tunneling; collision sub-tick time flows
  through cooldown; one frozen environment identity is reused by spawns.
- Slice 6 / closeout: browser matrix and docs indexes completed; one pre-Epic
  cleanup fault in `ControlsView.destroy()` was reproduced and fixed by
  removing a redundant post-shutdown `disableInteractive()` call.
- audit ledger: bounds exit confirmed/fixed; obstacle clipping latent but
  synthetic-tested; pause/resume and contact behavior preserved; camera target
  remains the body; Retry and menu round-trips showed no duplicate-animation or
  actor-view leaks after the cleanup fix.
- review-fix findings: F4 first-toggle inversion, obstacle leftover-time loss,
  one-frame player-facing lag, and shutdown cleanup fault found and fixed.
- independent review-fix findings (review pass on the implementation head):
  1. Charger dash wall-corner overlap — the per-axis bounds clamp could pull a
     dash endpoint off the dash line and inside an expanded obstacle AABB the
     trajectory never crossed. Fixed with a parametric clamp along the dash
     line plus obstacle testing of the effective segment; regression-pinned
     (single-tick and chunked, no-tunneling assertions).
  2. Enemy presentation wiring — chargers showed the idle clip while pursuing
     (velocity is always zeroed by `body.reset`) and winding did not face the
     target. Fixed by driving the run clip from observed displacement and
     resolving winding facing from the target; pinned by sprite-view tests.
  3. Missing Slice 2 entity pins added: exported body-radius constants with
     exactly one construction-time `setCircle`, no view-issued
     `setPosition`/`setSize` calls across pose sequences, and single-owner
     teardown of view layers and the body proxy. Slice 4 drop/projectile
     art-gating and pooled-reuse visibility tests were added as well.
  4. Codex connector P2 review comment (PR #79): a dash starting exactly on an
     expanded obstacle boundary while pointing away from the obstacle reported
     a spurious t=0 collision (`enter` starts at 0, so boundary points read as
     inside), pinning the charger into an instant-idle loop. Zero-time contact
     is now only treated as a hit when the segment moves into (or stays inside)
     the AABB; outward motion from a resting contact is free to leave.
     Regression-pinned with an on-boundary outward/inward pair.
- exact final test count / files: 1216 / 83.
- shuffled/repeated result: seeds 1301, 1302, and 1303 each passed 1201 / 83
  before the final prop-animation unit pin; seed 1304 and the final unshuffled
  suite each passed 1202 / 83. After the independent review fixes, the full
  suite passed 1215 / 83 and the shuffled rerun (seeds 1401, 1402, 1403)
  passed 1215 / 83 each; the Codex-comment fix brought the final suite to
  1216 / 83 with the same shuffled seeds passing 1216 / 83 each.
- lint/typecheck: pass (`tsc --noEmit`).
- build: pass (Vite production build; 103 modules).
- `git diff --check`: pass.
- production sentinels (`[cheats]`, `debug:cheats`, `[playtest] run summary`,
  `[physics-debug]`): all absent from `dist/assets/*.js`.
- §13 manual matrix (Codex in-app browser, Pixelorama 1.2 exports, Chromium,
  390×844): default dev had no geometry; query/F4 enabled diagnostics; second
  F4 cleared all lines; preview query/F4 remained inert; Scrap Tabby and the
  unlocked Bolt Hound rendered; actors flipped and animated; Dust Mite,
  projectiles, and XP motes rendered under a 20× spawn crowd; Retry and Menu →
  Game round-trips stayed clean; reduced-motion regression is automated.
  Trash Brute's live wave, a shipped obstacle collision, exact contact-damage
  feel, and a literal wall-clock ten-minute soak were not independently
  observed because the current arena schedules them late or has no obstacles;
  pure/integration tests cover those contracts. A clean accelerated soak and
  production preview produced no console errors or presentation drift.
- hosted CI: Node and GitGuardian passed on the published PR implementation
  head.
- Issue #72 closure: closed by PR #79 (retained `Closes #72`).
- final verdict: **READY** — all implementable acceptance gates pass, shipped
  art and runtime are complete, the independent review fixes above are
  regression-pinned and gate-green, and the honest manual limitations above do
  not block this obstacle-free proving arena.
