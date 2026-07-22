# Epic 8 Slice 3: Poolable Drop Entity and Magnet Geometry

Status: **implementation-ready handoff** for Epic 8 Slice 3 / issue #55.
Architecture baseline: `main` at `c3bfbea` after PRs #58, #59, and #52.

This document is the implementation work package for Kimi K3 or DeepSeek.
It refines the Epic 8 overview §4.6 into an exact, bounded coding task. When
this document and older issue text differ, this document is authoritative for
Slice 3.

## 1. Outcome

Add one reusable Phaser entity, `src/entities/Drop.ts`, with:

- the same `active` / `spawn()` / `reset()` lifecycle shape as `Projectile`;
- three presentation kinds: XP, scrap, and chest;
- velocity-based magnet homing inside an inclusive pickup radius;
- no collection, event, loot-resolution, scene, or system responsibilities;
- focused mocked-Phaser unit tests in `tests/drop.test.ts`.

The slice is additive. `XpDrop.ts`, `DropSystem`, `WeaponSystem`, runtime config,
and `GameScene` must remain untouched so every intermediate commit compiles.
Slice 4 performs the runtime entity swap.

## 2. Baseline evidence

The implementation should follow existing repository behavior, not invent a
second entity convention:

- `src/entities/Projectile.ts` is the lifecycle precedent: construct disabled,
  enable on `spawn`, zero velocity and disable on `reset`, expose `x`, `y`, and
  the Arcade body, and keep a class-level `active` flag synchronized with the
  Phaser sprite.
- `src/entities/XpDrop.ts` pins the current drop presentation: circle depth 2,
  XP color `0x7dd3fc`, and an Arcade circle body.
- `src/engine/vector.ts` already provides `distanceSq` and `towards`; use them
  instead of duplicating geometry.
- `tests/weaponSystem.test.ts`, `tests/enemy.test.ts`, and
  `tests/dropSystem.test.ts` establish the local mocked-Phaser style. Extend the
  mock only with methods the new entity calls.
- PR #59 already landed the enriched `enemy:killed` payload and
  `Enemy.scrapValue`. Those seams are irrelevant to this entity and must not be
  revisited here.

Repository-wide Repomix baseline: 159 files, approximately 232,545 tokens;
`Projectile.ts`, `XpDrop.ts`, `vector.ts`, and the three test precedents above
are the only implementation dependencies for this slice.

## 3. Scope and ownership

### Create

- `src/entities/Drop.ts`
- `tests/drop.test.ts`

### Update only for handoff traceability

- this document;
- the Slice 3 link/status in the Epic 8 overview or knowledge graph, if needed.

### Explicitly do not touch

- `src/entities/XpDrop.ts`
- `src/systems/DropSystem.ts`
- `src/systems/WeaponSystem.ts`
- `src/scenes/GameScene.ts`
- `src/engine/config.ts`
- `src/engine/eventBus.ts`
- `src/gameplay/loot.ts`
- `src/data/*.json`
- save/meta state, dependencies, build configuration, or unrelated tests

If implementation appears to require one of those files, stop and report the
contract mismatch instead of broadening the slice.

## 4. Frozen public contract

```ts
import Phaser from 'phaser';
import type { Vec2 } from '../engine/vector';

export type DropKind = 'xp' | 'scrap' | 'chest';

export class Drop {
  readonly sprite: Phaser.GameObjects.Arc;
  active: boolean;
  kind: DropKind;
  amount: number;
  tableId?: string;

  constructor(scene: Phaser.Scene, radius: number);

  get x(): number;
  get y(): number;
  get body(): Phaser.Physics.Arcade.Body;

  spawn(
    x: number,
    y: number,
    kind: DropKind,
    amount: number,
    tableId?: string,
  ): void;

  update(
    dtMs: number,
    playerPos: Vec2,
    pickupRadius: number,
    magnetSpeed: number,
  ): void;

  reset(): void;
  destroy(): void;
}
```

Do not add options objects, factories, interfaces, events, or exports beyond
`DropKind` and `Drop` in this slice.

## 5. State model

| State | Class fields | Sprite | Body |
| --- | --- | --- | --- |
| Constructed/reset | `active=false`, `kind='xp'`, `amount=0`, no `tableId` | position may remain; inactive, invisible, depth 2 | circle radius restored, velocity `(0,0)`, disabled |
| Spawned | exact call values; `tableId` retained only for `chest` | positioned, kind color, active, visible | circle radius restored, velocity `(0,0)`, enabled |
| Homing | payload unchanged | active/visible | velocity points at player with magnitude `magnetSpeed` |
| Holding | payload unchanged | active/visible | velocity `(0,0)` |
| Destroyed | `active=false` | destroyed | Phaser owns final teardown |

The class-level `active` field is authoritative for reuse and must remain in
sync with `sprite.active` during class-owned transitions.

### Spawn reinitialization

Every `spawn` call must overwrite all reusable state:

1. set `active`, `kind`, and `amount` from the call;
2. set `tableId` to the supplied value only when `kind === 'chest'`;
3. clear `tableId` for XP and scrap, including after a prior chest spawn;
4. set position and fill color;
5. reactivate and show the sprite;
6. enable the body, restore its circle radius, and zero velocity.

Do not clamp, floor, or otherwise reinterpret `amount`; loot validation and the
typed grant pipeline own value legality. A chest without a `tableId` remains
representable in this low-level entity; Slice 5 owns defensive chest handling.

## 6. Presentation contract

Use these exact fill colors:

| Kind | Color |
| --- | --- |
| `xp` | `0x7dd3fc` |
| `scrap` | `0xfbbf24` |
| `chest` | `0xf472b6` |

The sprite is a circle at depth 2. Keep the color map private to the module.
Do not add labels, outlines, tweens, animation, particles, textures, or audio.
Those belong to later UI/polish epics.

## 7. Magnet algorithm

`Drop.update` controls Arcade velocity only. Phaser physics integrates the
position; the entity must never mutate `sprite.x` or `sprite.y` in `update`.
`dtMs` is a simulation-validity gate and is not multiplied into velocity.

Use this decision sequence:

1. If the drop is inactive, return without mutation.
2. If `dtMs` is non-finite or `dtMs <= 0`, return without mutation. This exact
   no-op matches the issue contract and the `Projectile.update` convention.
3. If player coordinates, `pickupRadius`, or `magnetSpeed` are non-finite, set
   velocity to `(0,0)` and return. Never write `NaN`/infinite velocity to
   Arcade physics.
4. If `pickupRadius <= 0` or `magnetSpeed <= 0`, set velocity to `(0,0)` and
   return. A negative radius must not become positive by squaring it.
5. Compute squared distance with `distanceSq(this, playerPos)`.
6. If squared distance is greater than `pickupRadius * pickupRadius`, set
   velocity to `(0,0)` and return.
7. Otherwise compute `towards(this, playerPos)` and set velocity to the unit
   direction multiplied by `magnetSpeed`.

The boundary is inclusive: exactly `distanceSq === pickupRadius²` homes.
When the drop and player share a position, `towards` returns `(0,0)`, so the
drop safely holds still.

## 8. Phaser ordering and future integration

The constructor must:

1. create the inactive/invisible circle;
2. add Arcade physics;
3. set the circle body radius;
4. disable the body.

`spawn` must set body velocity after body enable/circle restoration. Slice 4's
future `DropSystem.spawnDrop` must add `drop.sprite` to the Physics Group before
calling `drop.spawn(...)`, because Phaser group insertion can reapply body
defaults. This is the same ordering already pinned for projectiles. Slice 3
does not create or modify the group.

Drops deliberately receive no obstacle collider, world-bounds collision, drag,
bounce, gravity, or direct overlap callback.

## 9. Reset and destroy semantics

`reset()` is reusable cleanup and must always be safe to call:

- `active = false`;
- `kind = 'xp'`;
- `amount = 0`;
- `tableId = undefined`;
- velocity `(0,0)`;
- body disabled;
- sprite inactive and invisible.

Do not early-return before clearing payload fields. Idempotent repeated resets
are expected.

`destroy()` is final cleanup:

- set class-level `active = false`;
- call `sprite.destroy()`;
- do not add pooling, group removal, event emission, or a reset-before-destroy
  protocol.

## 10. Test architecture

Create `tests/drop.test.ts` with one module-level Phaser mock and direct entity
tests. The mock should record only observable state used by assertions:

- sprite: `x`, `y`, `active`, `visible`, `fillColor`, `depth`, `destroyed`;
- chainable `setDepth`, `setActive`, `setVisible`, `setPosition`,
  `setFillStyle`;
- body: `enable`, `radius`, velocity `{x,y}`, `setCircle`, `setVelocity`;
- `scene.add.circle` and `scene.physics.add.existing`.

Required test matrix:

1. **Constructed disabled:** inactive/invisible, depth 2, body disabled, circle
   radius set, zero-value payload.
2. **Kind presentation:** parameterized XP/scrap/chest spawns use exact colors.
3. **Spawn reuse:** chest → reset → scrap (or direct respawn) updates position,
   kind, amount, visibility/body state, clears `tableId`, and clears old
   velocity.
4. **Reset idempotence:** repeated reset leaves a complete disabled zero state.
5. **Destroy:** class inactive and sprite destroyed.
6. **Inside-radius homing:** `(0,0)` toward `(3,4)` at speed 100 yields velocity
   `(60,80)`.
7. **Inclusive boundary:** distance exactly equal to radius still homes.
8. **Outside-radius hold:** a prior non-zero velocity becomes `(0,0)`.
9. **Zero/negative radius:** never homes and never squares negative into range.
10. **Zero/negative magnet speed:** holds still.
11. **Coincident position:** produces finite zero velocity.
12. **Inactive update:** no mutation.
13. **Invalid `dtMs`:** `0`, negative, `NaN`, and infinities are true no-ops.
14. **Invalid geometry/speed:** non-finite player coordinates, radius, or speed
    zero velocity rather than contaminating the body.

Prefer exact assertions for lifecycle state and `toBeCloseTo` only for
normalized velocity components. Do not assert private implementation details.

## 11. Acceptance checklist

- [ ] Only `src/entities/Drop.ts` and `tests/drop.test.ts` implement the slice.
- [ ] `Drop` has no imports from scenes, systems, config, event bus, loot, save,
      or meta modules.
- [ ] Spawn/reset reuse cannot leak `tableId`, amount, color, visibility, body
      enablement, or velocity from a previous use.
- [ ] Homing is inclusive at the radius boundary and never activates for a
      non-positive radius.
- [ ] Invalid inputs cannot write non-finite Arcade velocity.
- [ ] Collection remains entirely outside the entity.
- [ ] `XpDrop.ts` and the current runtime pipeline remain unchanged.
- [ ] `npm run lint` passes.
- [ ] `npm run test` passes in full, not only `drop.test.ts`.
- [ ] `npm run build` passes.
- [ ] `git diff --check` passes.

## 12. Reviewer traps

- Do not collect merely because a drop is inside `pickupRadius`; the radius
  starts homing, while physics overlap performs collection in Slice 4.
- Do not move the sprite manually; set body velocity.
- Do not use `Math.random`, `menuRng`, or any RNG in the entity.
- Do not read `ModifierStack` or `RuntimeConfig` here; resolved scalar values
  arrive as method arguments.
- Do not leave the old `tableId` when a chest instance is reused as XP/scrap.
- Do not let an out-of-range drop coast on its previous velocity.
- Do not add pooling storage; this slice makes the entity pool-ready only.
- Do not delete `XpDrop.ts` early.
- Do not modify Slice 4 seams that already landed in PR #59.

## 13. Kimi K3 / DeepSeek execution prompt

```text
Implement Epic 8 Slice 3 in Joncallim/Meowcenary.

Starting branch: codex/epic-8-slice-3-architecture
Base: main at c3bfbea or later fast-forward containing PRs #58, #59, and #52.
Issue: #55.

Read in order:
1. docs/knowledge-graph.md
2. docs/architecture/epic-8-loot-and-economy.md §4.6
3. docs/architecture/epic-8-slice-3-drop.md (authoritative work package)
4. src/entities/Projectile.ts
5. src/entities/XpDrop.ts
6. src/engine/vector.ts
7. tests/weaponSystem.test.ts and tests/dropSystem.test.ts for mock style

Implement only:
- src/entities/Drop.ts
- tests/drop.test.ts

Do not integrate the entity. Do not touch XpDrop, DropSystem, WeaponSystem,
GameScene, config, events, loot resolution, data, save/meta, or dependencies.

Run:
npm run lint
npm run test
npm run build
git diff --check

Commit the implementation to the starting branch and update the existing draft
PR. Report the commit SHA, exact test count, and any architecture mismatch.
```
