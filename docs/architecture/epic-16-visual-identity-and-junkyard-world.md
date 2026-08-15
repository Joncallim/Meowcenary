# Epic 16 — Visual Identity and Junkyard World

**Issue:** #75 · **Architecture PR:** #82 · **Base:** Epic 15 merge commit `1da5ed8`

> Status: **implementation-ready architecture and selected art direction; not
> implemented**. PR #82 is the reviewable architecture/art baseline only; its
> merge does not complete or close Issue #75. Runtime delivery remains open
> until the Golden Run passes every automated and visual gate in this document.

## 1. Outcome

Epic 16 turns the current playable prototype into one visually coherent Golden
Run without changing combat, economy, merge, pause, or UI rules.

The finished run has:

- the existing Scrap Tabby, Dust Mite, Junk Rusher, and Trash Brute actor art
  presenting idle, movement, hurt, and defeat clearly;
- tier-readable rack icons and held silhouettes for pistol, SMG, and shotgun;
- family-readable projectiles;
- distinct XP, scrap, chest, and weapon-pickup art;
- a larger, camera-traversable Junkyard Lot with a real floor, boundary,
  non-colliding dressing, and two sparse collidable landmarks; and
- one validated manifest/preload/export pipeline for every runtime visual.

The selected design board and production rules live in
[`../art/epic-16-visual-design.md`](../art/epic-16-visual-design.md). The board
is reference material only; runtime assets must remain inspectable Pixelorama
projects and deterministic exports.

## 2. Repository architecture pass

The pass was made against `main` after PR #81.

### Healthy boundaries to preserve

- `engine/` and `gameplay/` are Phaser-free. Art must not enter either layer
  except as stable string IDs already carried by immutable data/read models.
- `RunState.equipped`, `WeaponDefinition`, merge rules, loot grants, drop
  collection, projectile damage/range/pierce, actor physics bodies, and arena
  collision rectangles are authoritative gameplay state.
- Epic 13 already provides the correct presentation seam: hidden authoritative
  physics shapes, separate `ActorView` nodes, a validated art catalog, boot
  preload, and pooled projectile/drop art nodes.
- Epic 15 already exposes `InventoryWeaponSummary.iconId`; final rack art can
  replace code-drawn glyphs without changing inventory state or commands.
- `ArenaDefinition` already owns world dimensions, spawn regions, obstacles,
  and hazards. Render-only scenery can extend this data without moving arena
  logic into `GameScene`.
- All current art source/export folders and deterministic Pixelorama helpers
  are reusable.

### Gaps Epic 16 must close

- `actor-art.json` describes more than actors but cannot express static images,
  non-square display sizes, required/optional policy, or environment art.
- `BootScene.preload()` assumes every visual is a sprite sheet and does not
  turn a missing required texture into a clear boot failure.
- `WeaponSystem` injects one projectile binding for every weapon family.
- pooled `Drop` instances can display art only for XP and bind that art once at
  construction.
- the weapon rack draws family glyphs in code and has no texture lookup seam.
- the current actor catalog omits the already-exported `hurt` and `defeat`
  clips, while `ActorPose` supports only moving/not-moving.
- `GameScene.buildFloorDressing()` creates generic circles directly and
  `buildArenaScenery()` creates geometric obstacle rectangles. The render data
  is neither authored nor validated as part of the arena.
- Junkyard Lot is exactly 390x844, so the camera never establishes traversal or
  spatial landmarks on the canonical canvas.

None of these gaps justify a second event bus, second weapon registry, new RNG
stream, save migration, gameplay data duplication, or physics rewrite.

## 3. Frozen decisions

### D1 — One visual manifest replaces the misnamed actor-only surface

Rename `src/data/actor-art.json` to `src/data/visual-art.json` and replace the
internal `ActorArt*` names with `VisualArt*` in one commit. Keep all seven
existing IDs unchanged. Do not ship two manifests, a compatibility reader, or
path inference from an ID.

```ts
export type VisualArtKind =
  | 'character'
  | 'enemy'
  | 'projectile'
  | 'drop'
  | 'weapon-icon'
  | 'weapon-held'
  | 'world';

export type VisualArtLoad =
  | { readonly type: 'image' }
  | {
      readonly type: 'spritesheet';
      readonly frame: { readonly width: number; readonly height: number };
    };

export interface VisualArtClip {
  readonly start: number;
  readonly end: number;
  readonly frameRate: number;
  readonly repeat: -1 | 0;
}

export interface VisualArtBinding {
  readonly id: string;
  readonly kind: VisualArtKind;
  readonly textureKey: string;
  readonly url: string;
  readonly required: boolean;
  readonly load: VisualArtLoad;
  readonly display: { readonly width: number; readonly height: number };
  readonly clips?: Readonly<Record<string, VisualArtClip>>;
}

export interface VisualArtCatalog {
  readonly bindings: readonly VisualArtBinding[];
}
```

`DataVisualArtRegistry` remains validate-clone-freeze-map. It exposes
`bindingById()` and one frozen `all()` snapshot. Paths and texture keys exist
only in this catalog.

Visual IDs use a kind prefix followed by one or more colon-delimited kebab-case
segments: `/^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)+$/`. The first segment
must equal `kind`, so IDs such as `weapon-icon:pistol:t1` are valid while
wrong-kind, empty-segment, path-like, whitespace, and uppercase IDs fail.

All Golden Run rows have `required: true`. Optional art is allowed only for
future non-Golden content and must have a specified geometric fallback at its
consumer. Required art never silently falls back.

### D2 — Boot owns all loading and required-asset failure

`BootScene.preload()` first constructs a validated `DataVisualArtRegistry`
from the imported JSON and stores that immutable preload plan on the scene. It
must not iterate unvalidated raw bindings before `loadGameData()` runs. It then
iterates the validated catalog:

- `image` rows call `this.load.image()`;
- `spritesheet` rows call `this.load.spritesheet()` with the declared frame;
- a loader error records the failed texture key; and
- `create()` validates that every required texture exists before creating
  animations or starting `MenuScene`.

Register the loader-error listener before enqueueing files and remove it on
loader completion or scene teardown. `create()` still calls aggregate
`loadGameData()` so weapon/arena cross-references are validated before context
creation; catalog-only preload validation does not replace that aggregate gate.

A missing required texture must produce one clear error naming its manifest ID,
texture key, and URL. Do not catch it and continue with geometry.

`ensureVisualAnimations()` creates declared clips only after required textures
pass. It uses the clip's explicit `repeat` value: idle/run/fly loops, hurt and
defeat do not.

The source/export validator reads PNG IHDR bytes and metadata with repository
scripts; do not add an image-processing dependency just to check dimensions.

### D3 — Data names the art; code never guesses paths

Each `WeaponDefinition` gains a required visual reference:

```ts
export interface WeaponArtReference {
  readonly iconId: string;
  readonly heldId: string;
  readonly projectileId: string;
}

export interface WeaponDefinition {
  // existing fields unchanged
  readonly art: WeaponArtReference;
}
```

Every definition row explicitly references its tier icon and held silhouette;
all tiers in one family may share that family's projectile binding. Validation
asserts:

- every reference exists and has the expected kind;
- referenced family/tier icon and held IDs are unique to that definition;
- all definitions in a family share exactly one projectile ID; and
- every Golden Run family has tiers 1, 2, and 3 mapped.

`InventoryController` passes `definition.art.iconId` through its immutable
summary. It does not receive the visual registry or Phaser objects.

### D4 — Rack art replaces glyphs behind the Epic 15 ID seam

`PhaserWeaponRackPanel` receives a read-only texture resolver and draws the
texture named by `InventoryWeaponSummary.iconId`. It sizes the image inside the
existing card geometry; card bounds, state text, 44-physical-pixel targets,
compatibility, preview, and commands do not change.

Code-rendered pistol/SMG/shotgun glyphs may remain only as the explicit
optional-art fallback helper used by tests or future optional content. They are
not used for required Golden Run definitions.

Tier readability is proven by silhouette while Epic 15's `T1`/`T2`/`T3` text
remains the accessible redundant cue. Do not replace state text with icons.

### D5 — Held art is recent-shot presentation, never weapon state

Six rack weapons can fire independently, so Epic 16 does not invent an
"equipped primary" rule. One `HeldWeaponView` follows the player and displays
the most recently fired weapon for a short presentation window. If multiple
weapons fire in one update, existing rack iteration order deterministically
selects the last presentation; damage and projectile order remain unchanged.

`WeaponSystem` already knows the firing definition and direction. After it
spawns the projectile(s), it calls a presentation-only interface:

```ts
export interface WeaponShotPresenter {
  show(bindingId: string, x: number, y: number, direction: Vec2): void;
  update(x: number, y: number, dtMs: number): void;
  reset(): void;
  destroy(): void;
}
```

The view mirrors vertically for left-facing shots, rotates around a fixed grip
origin, and expires after a data-independent presentation constant. It owns no
cadence, target, damage, tier, or rack mutation. No new event is required.

### D6 — Projectile pools are keyed by visual binding

One projectile object cannot swap a construction-time sprite without either
allocating per shot or retaining hidden cross-family nodes. `WeaponSystem`
therefore owns `Map<projectileArtId, Pool<Projectile>>`.

Each pool constructs `Projectile` with one required projectile binding and adds
its physics body to the shared `projectileGroup` exactly once before first
spawn. Pool counts exposed to diagnostics are summed. Fire ordering, cadence,
directions, damage, range, pierce, collision, event order, and seeded behavior
remain unchanged. Only normal `Pool.acquire()` growth may construct a new
pooled projectile; firing code must not directly construct a texture, sprite,
animation, projectile, or pool.

`WeaponSystem` records the owning pool for every created projectile in a
`Map<Projectile, Pool<Projectile>>`. Reset/release looks up that exact owner;
it must not infer a pool from the current rack or the most recently fired
weapon, either of which can change before a projectile expires.

Acquire starts the declared `fly` clip from its first frame. Reset stops the
clip, restores frame zero, clears rotation/alpha/visibility/active state, and
then returns the projectile to its recorded owner pool.

### D7 — One pooled drop can switch among prebuilt visual kinds

`Drop` receives a frozen binding map at construction and creates at most one
inactive art sprite for each required drop kind: XP, scrap, chest, and weapon.
`spawn()` activates exactly one sprite based on `LootGrant.kind`; `reset()`
hides and deactivates all of them, stops each clip at frame zero, and clears the
existing payload/block state. Each spawn starts the selected `idle` clip from
its first frame; hidden alternatives do not continue animating.

This preserves one physical body and the existing no-loss full-rack contract.
The weapon crate remains visible and stationary while blocked. The system does
not create a new pending-reward model or emit `drop:collected` for weapons.

Four sprites per pooled drop is a bounded Golden Run cost. If profiling later
shows this is material, separate pools may be considered in a different PR;
Epic 16 must not weaken pooling or add per-spawn allocations speculatively.

### D8 — Actor art changes pose, never physics

The existing 48x48 Epic 13 sheets remain the first-pass Golden Run actor art.
Do not redraw them merely because Epic 16 is an art epic. Audit them at runtime
size; revise only a concrete failed visual gate.

Add their existing hurt/defeat frame ranges to the visual catalog. Locomotion
continues to use `ActorPose` position/facing/moving data. One-shot presentation
is explicit on the view:

```ts
export interface ActorView {
  update(pose: ActorPose): void;
  playOneShot(clip: 'hurt' | 'defeat'): void;
  destroy(): void;
}
```

`SpriteView` keeps transform/facing/alpha synchronized while a one-shot owns the
clip. Priority is `defeat > hurt > run > idle`; an animation-complete callback
returns hurt to the latest locomotion clip and leaves defeat on its final
frame. `PlaceholderView.playOneShot()` is a no-op. Every accepted player-damage
path invokes hurt; lethal contact or environmental damage invokes defeat before
the existing lost-run path, and the player body remains governed by existing
run-state/physics code.

Enemy death needs a different seam. Today `Enemy.takeDamage()` destroys the
enemy and its view synchronously before `WeaponSystem` emits `enemy:killed`, so
delaying that destroy to show art would change active counts, overlap, reward,
and compaction timing. Do not do that. Add a presentation-only
`DefeatPresentationSystem` that subscribes to the existing `enemy:killed`
event, resolves `enemy:<enemyId>`, and acquires a display-only corpse sprite
from a binding-keyed pool at the event coordinates. It plays `defeat` once and
releases on animation completion, with a declared clip-duration timeout as the
defensive fallback. The corpse has no physics body and never appears in the
enemy array or active-enemy diagnostics.

No animation completion controls health, invulnerability, death, rewards,
pooling of gameplay entities, movement, run state, or event timing.

`SpriteView` and `DefeatPresentationSystem` remove animation listeners on
destroy/reset. Body diameter, offset, position, velocity, visibility authority,
overlap, and world-bound behavior stay exactly as Epic 13 defines them.

### D9 — Arena render data is separate from collision data

Extend `ArenaDefinition` with a visual-only object and give obstacles stable
IDs:

```ts
export interface ObstacleDefinition {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ArenaDecorationDefinition {
  readonly id: string;
  readonly artId: string;
  readonly x: number;
  readonly y: number;
  readonly flipX?: boolean;
  readonly layer: 'ground' | 'low';
}

export interface ArenaObstacleSkinDefinition {
  readonly obstacleId: string;
  readonly artId: string;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

export interface ArenaVisualDefinition {
  readonly floorArtIds: readonly string[];
  readonly boundary: {
    readonly straightArtId: string;
    readonly cornerArtId: string;
    readonly patchArtId: string;
  };
  readonly decorations: readonly ArenaDecorationDefinition[];
  readonly obstacleSkins: readonly ArenaObstacleSkinDefinition[];
}
```

Decorations never receive physics bodies. Obstacle skins reference an existing
collision rectangle; they do not define, resize, or offset that rectangle.
Their art may overhang only where the result cannot imply a blocked lane.

Validation rejects duplicate decoration/obstacle IDs, out-of-bounds anchors,
unknown/wrong-kind art IDs, unknown or repeated obstacle-skin references, and
missing skins for required Golden Run obstacles.

The floor is filled on the fixed 32px grid. Variant selection uses only tile
coordinates and the ordered `floorArtIds` array; it does not consume an RNG.
The boundary uses corner art at corners, straight art along each edge, and a
fixed coordinate rule for sparse patch frames. Rotation is restricted to
quarter turns, so the inner wall edge stays visually honest.

### D10 — Junkyard Lot becomes a camera-traversable authored world

Set Junkyard Lot to **768x1344**: a 24x42 grid of 32px tiles, roughly two
canonical canvas widths and 1.6 canonical heights. This is large enough to
establish travel and landmarks but small enough for a focused first arena.

Keep the player start at the center and reserve a collider-free 192x256 start
plaza. Increase the edge spawn-region margin to 48px so 13px-radius enemies do
not overlap the inward face of 32px boundary art. Use two collidable landmarks
outside that plaza and outside edge spawn lanes. All other authored props are
non-colliding.

Existing world-bound, camera-follow, spawn-region, weapon-reward clamp, HUD,
pause, and FIT behavior already read `arena.size`; tests must prove those seams
continue to do so. Do not add camera zoom, minimap, procedural world generation,
or a second arena.

Replace `GameScene.buildFloorDressing()` with the authored `ArenaWorldView`.
Decoration placement comes only from validated arena data. It consumes no run
RNG, menu RNG, `Math.random()`, or new seed stream.

### D11 — Depths and teardown are named contracts

Add named world/presentation depth constants instead of scattered new numbers:

| Band | Depth | Contents |
| --- | ---: | --- |
| floor | -4 | tiled floor |
| ground | -3 | stains and tiny debris decals |
| low scenery | -2 | clearly non-solid dressing |
| collidable/high scenery | 1 | landmark and obstacle skins |
| drop body/art | 2/3 | existing physical pickups and highlights |
| projectile | 3 | existing projectile art |
| enemy | 4 | existing enemy view |
| player/held weapon | 5/6 | existing player and held silhouette |
| effects | existing feedback constants | Epic 12/17 authority |
| HUD/modals | existing theme constants | Epic 9/15 authority |

`ArenaWorldView.destroy()` destroys every tile sprite/image and the existing
static obstacle group once. Retry, Menu, and shutdown leave no live visual
nodes, animation listeners, physics bodies, or loader listeners.

### D12 — Source assets remain reproducible and reviewable

Each new production asset has:

- an editable `.pxo` source under `assets-src/<category>/<id>/source/`;
- an optional preview under `assets-src/<category>/<id>/preview/`;
- a deterministic `docs/art/scripts/build-<id>.lua` builder using the existing
  shared library;
- an exported PNG and metadata under `public/assets/<category>/<id>/`; and
- exactly one visual-manifest row.

The generated concept board stays under `docs/art/concepts/epic-16/`. No part
of it may be copied, cropped, tiled, or loaded at runtime.

## 4. Stable Golden Run IDs

The exact IDs are frozen so UI, data, builders, and runtime cannot drift.

### Existing actors

- `character:scrap-tabby`
- `character:bolt-hound`
- `enemy:dust-mite`
- `enemy:junk-rusher`
- `enemy:trash-brute`

### Weapons and projectiles

- `weapon-icon:{pistol|smg|shotgun}:t{1|2|3}`
- `weapon-held:{pistol|smg|shotgun}:t{1|2|3}`
- `projectile:{pistol|smg|shotgun}`

### Pickups

- `drop:xp`
- `drop:scrap`
- `drop:chest`
- `drop:weapon`

### Junkyard Lot

- `world:junkyard-floor:{base|patch-a|patch-b}`
- `world:junkyard-boundary:{straight|corner|patch}`
- `world:prop:{tyre-pile|crate|engine-block|scrap-heap|oil-stain|warning-sign}`
- `world:landmark:{hanging-press|barrel-power-stack}`

IDs are manifest identities, not path templates. Consumers always resolve them
through `DataVisualArtRegistry`.

## 5. File ownership

| File/area | Responsibility |
| --- | --- |
| `src/data/visual-art.json` | one visual load/display/clip manifest |
| `src/data/weapons.json` | explicit icon/held/projectile references |
| `src/data/arenas.json` | larger bounds, authored render data, collision data |
| `src/systems/types.ts` | visual, weapon-art, and arena-visual contracts |
| `src/systems/validation.ts` | shape, reference, completeness, and bounds validation |
| `src/systems/visualArt.ts` | immutable registry and animation creation |
| `src/scenes/BootScene.ts` | preload and required-texture gate |
| `src/entities/actorView.ts` | clip-aware sprite presentation only |
| `src/systems/defeatPresentation.ts` | pooled, physics-free enemy defeat clips from `enemy:killed` |
| `src/entities/Projectile.ts` | one binding per pooled projectile |
| `src/entities/Drop.ts` | prebuilt kind-art nodes on one pooled body |
| `src/systems/WeaponSystem.ts` | binding-keyed projectile pools and shot presentation call |
| `src/systems/DropSystem.ts` | inject four required drop bindings |
| `src/systems/arenaScenery.ts` | authored `ArenaWorldView` and static obstacle group |
| `src/ui/weaponRackView.ts` | resolved texture rendering inside unchanged Epic 15 cards |
| `docs/art/scripts/` | deterministic source builders and export validation |
| `assets-src/`, `public/assets/` | editable sources and shipped exports |

Production files intentionally outside the change:

- merge, rack capacity, reward admission, loot resolution, save, progression,
  balance, spawn cadence, enemy movement, hitboxes, feedback rules, and audio;
- Epic 15 rack/pause layout and command ownership; and
- Epic 17's combat feedback and mechanical tier identity.

## 6. Implementation slices and commit gates

After PR #82 merges, create one runtime branch from that merged architecture
baseline and keep all five slices in one draft delivery PR for Issue #75. Every
slice begins from a green previous slice and is independently reviewable.

### Slice 1 — Manifest and validation migration

Rename the catalog/registry, add the generalized load/display/required schema,
preserve the seven current bindings, update Boot loading, and add file/texture
failure tests. No new art consumers yet.

Gate: full tests, lint, build, catalog mutation tests, missing-required failure,
and proof that every current actor/projectile/drop still renders.

### Slice 2 — Weapon visual production and rack/held wiring

Build nine icons, nine held silhouettes, and three projectile sheets. Add
weapon data references, rack textures, held view, and binding-keyed projectile
pools.

Gate: definition-reference validation, no per-shot allocation, pool reset/count
tests, unchanged projectile physics/event order, 390x844 rack review, and
grayscale family/tier comparison.

### Slice 3 — Pickup production and pooled switching

Build scrap, chest, and weapon art; retain/audit XP; prebuild four art nodes per
drop and activate by grant kind.

Gate: all grant kinds, chest recursion, blocked weapon drop, reset/reacquire,
teardown, active/allocated metrics, and dense-combat phone readability.

### Slice 4 — Authored Junkyard Lot

Build floor/boundary/prop/landmark sources, extend arena validation/data, enlarge
the arena, and replace geometric/random dressing with `ArenaWorldView`.

Gate: bounds/spawn/clamp tests, decorations have no bodies, obstacle skins match
existing bodies, camera travel, retry teardown, and portrait/desktop screenshots.

### Slice 5 — Actor state adoption and Golden Run closeout

Expose hurt/defeat clips, adopt one-shot hurt priority, add the pooled
physics-free enemy defeat presenter without delaying entity destruction,
audit/revise existing actors only where evidence fails, then update status and
delivery records.

Gate: hurt/defeat/reset and kill-order tests, proof that enemy destruction and
`enemy:killed` ordering are unchanged, hitbox snapshots unchanged, full and
shuffled suites, lint, build, art validation, browser playtest matrix, and an
independent review against this document.

Do not start the next slice while the previous gate is red. Do not squash away
the slice boundaries before review.

## 7. Automated acceptance

### Catalog and assets

- JSON safety, unknown fields, caps, unique IDs, keys, and URLs remain strict.
- Every required Golden Run ID in section 4 exists exactly once.
- Static vs spritesheet load shapes are mutually exclusive and dimension-safe.
- Clip ranges fit the exported frame count and repeat is explicit.
- Every runtime data reference resolves to the expected visual kind.
- Every manifest URL exists under `public/`; every PNG matches its declared
  source/frame dimensions.
- Missing required textures stop boot with an identifying error.

### Runtime invariants

- actor, projectile, drop, obstacle, and world physics shapes are unchanged by
  display size, origin, frame, rotation, or animation;
- projectile cadence/order/damage/range/pierce and collision/event order match
  the pre-Epic-16 baseline;
- every pooled object creates display nodes only at construction, resets all
  visual state, and rejoins its physics group at most once;
- each expired projectile returns to its construction-time art pool even if
  the rack changes while it is live;
- enemy defeat art is physics-free and does not delay enemy destruction,
  rewards, active counts, or compaction;
- blocked weapon drops remain present and collectible after a merge frees room;
- rack state/selection/preview/merge behavior and 44px targets are unchanged;
- decorations create zero physics bodies and consume zero RNG;
- obstacle skins resolve one-to-one with authoritative collision rectangles;
- camera, spawn, world bounds, and reward clamps use the enlarged arena size;
- Retry/Menu/shutdown leave no old view nodes, animations, listeners, or bodies.

### Repository gates

- focused tests for every slice;
- full suite;
- at least three shuffled full-suite runs after final integration;
- lint;
- production build;
- `git diff --check`;
- production-bundle checks keep Epic 11 debug/cheat sentinels absent; and
- deterministic art builder/export validation.

## 8. Player-experience matrix

Verify a normal Golden Run at 390x844 and on desktop. Use reduced motion both
off and on where animation/feedback could interact.

| Proof | Pass condition |
| --- | --- |
| Paused run screenshot | Immediately reads as a finished junkyard action game, not geometric Phaser primitives. |
| Actor silhouettes | Scrap Tabby, Dust Mite, Junk Rusher, and Trash Brute remain distinguishable in a dense encounter and in grayscale. |
| Actor anchors | Idle/run/hurt/defeat do not slide or visibly detach from collision. |
| Weapon rack | All three families and adjacent tiers are distinguishable without relying only on color or tiny text. |
| Held weapon | Recent-shot family/tier is readable and follows/mirrors without changing aim or firing. |
| Projectiles | Pistol, SMG, and shotgun reads remain distinct without hiding targets or hit locations. |
| Pickups | XP, scrap, chest, and weapon crate are instantly distinct; a blocked crate clearly remains in the world. |
| World traversal | Camera movement reveals at least two recognizable landmarks while the center start plaza remains clear. |
| Collision honesty | Decorative clutter never blocks; both collidable landmarks look solid exactly where their bodies are. |
| Teardown | Retry and Menu round-trips do not duplicate scenery, animations, or art nodes. |

Record screenshots and any manual-only rows in the delivery section before
marking the runtime delivery PR ready.

## 9. Reviewer traps

Reviewers should actively reject:

- a parallel art manifest/registry or any ID-to-path string concatenation;
- required Golden Run art silently falling back after a loader failure;
- Phaser imports in `engine/` or `gameplay/`;
- weapon family/tier duplicated in the UI rather than referenced from data;
- direct per-shot/per-drop texture or sprite allocation outside normal pool
  growth;
- pooled nodes that retain the previous family/kind, rotation, animation,
  alpha, visibility, or active state;
- animation completion changing gameplay health/death/pool timing;
- retaining a dead enemy gameplay entity merely to finish its defeat clip;
- art dimensions, origins, or overhang resizing/offsetting physics bodies;
- decorative props with physics bodies or invisible colliders;
- random world dressing, especially `Math.random()` or a run RNG stream;
- tier differentiation that works only through color, labels, or fine detail;
- world enlargement without revalidating spawn, reward clamp, camera, and
  center-start semantics;
- generated concept pixels shipped as runtime assets; and
- closing Issue #75 before the complete Golden Run experience matrix passes.

## 10. Current delivery record

- [x] Issue #75 and post-Epic-15 repository state reviewed.
- [x] architecture boundaries and current presentation consumers traced.
- [x] one-manifest migration, data references, pooling, physics, world, and
  teardown contracts frozen.
- [x] original Epic 16 visual identity board generated and planted.
- [x] production sizes, silhouettes, tier language, composition, and
  originality rules recorded.
- [x] architecture baseline marked ready in PR #82 after exact-source and
  artifact review.
- [ ] runtime manifest migration and required-asset gate.
- [ ] production Pixelorama sources/exports.
- [ ] weapon, projectile, pickup, actor-state, and world wiring.
- [ ] automated, browser, and independent-review gates.
- [ ] runtime delivery review, approval, and merge.
