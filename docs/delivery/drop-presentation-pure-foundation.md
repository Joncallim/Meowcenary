# #200 drop presentation and pooled view foundation

This bounded recovery was authored from protected main `4f79d62` and is now
stacked on Contracts #240 `5b6622b`. Reconciliation retained the newer
GameScene `ownSystem` lifecycle boundary and changed only DropSystem options. It adds a pure,
immutable grant-to-presentation resolver and integrates one reusable authored
sprite into the existing Drop pool. GameScene passes its existing shared
visual-art registry to that owner. Loot grants, data, RNG, pool machinery,
physics and collection rules, resource loading, and assets remain unchanged.
Browser and final native-art acceptance remain pending.

## Authority and recovered work

The resolver core and catalog tests are recovered from local heads `934c864`
and `d9bd69f`, where the two resolver/test files are identical. The old worktrees
and branches are preserved. Those heads contain a much broader runtime/art
bundle and divergent merge ancestry, so that bundle is not imported here.

The later [reviewed #200 packet in PR #231](https://github.com/Joncallim/Meowcenary/blob/789b2647eb9466895d90b336abaa2cec04d20e84/docs/art/design-handoff-2026-10-09/200-PHYSICAL-PICKUPS.md)
requires deterministic errors for unknown weapon definitions, resolution before
pool lifetime publication, one reusable art sprite, and an aspect-preserving
weapon fit within 20×20. It also permits the code slice to retain current
validated art while native production art remains separately gated.

## Pure boundary

`resolveDropPresentation(grant, { weaponRegistry, visualArt })` requires both
registries and returns detached, deeply frozen logical art, resolved binding,
display dimensions, and exact weapon definition/family/tier identity when
applicable. Weapon lookup uses `definitionId` and the definition's canonical
`art.iconId`, never a name-derived art ID or generic weapon token. Missing,
optional, wrong-kind, mismatched, or unresolved required bindings fail.

XP, Scrap, and Chest retain current canonical `drop:*` bindings, resources,
clips and 16×16, 18×18, and 20×20 displays. Weapons reuse current exact tier
icons, fit within 20×20, preserve aspect ratio, and never enlarge smaller art.
No state or glint fields are added: existing Drop owns blocked state, and that
state must decorate rather than replace identity. The resolver does not create
weapon instances, admit loot, inspect reward amounts, or consume randomness.

## Pooled view and failure boundary

The main baseline precreated up to four sprites per Drop, keyed by grant kind.
Its `tests/drop.test.ts` explicitly asserted that four-node behavior and already
provides observable mock texture/frame/animation/visibility state. The old
candidate's one-node reuse test is a useful recovery starting point, but its
24px sizing, mutable resolver, and incomplete transform reset were reconciled
with the newer packet. The recovered view now has one constructor-owned sprite
per authored Drop,
plus the existing physics circle and bounded glint. The focused tests cover
complete reset and actual pooled reuse, without asserting browser acceptance.

The optional `DropSystemOptions.visualArt` accepts the existing shared visual
registry. With it configured, `spawnDrop` resolves exact presentation and checks
real texture/frame and idle animation frame identity, timing and repeat before
acquiring a Drop. It calls `Drop.spawn(x, y, grant, presentation)` and only then
publishes liveDrops membership and a new spawn serial. An injected view-swap or
activation failure resets/releases the acquisition and rethrows the original
error. Failed spawns do not advance generation; #229 Scavenge spawn-generation
settlement is unchanged. Absence of visualArt preserves isolated primitive or
legacy binding harnesses. GameScene passes visualArt to select the production
path, replacing its generic per-kind weapon binding.

If backend cleanup itself fails, the existing pool cannot finish release. Both
original and cleanup errors are retained in AggregateError; no live lifetime
is published. The tests explicitly record that the acquisition remains leased
in this exceptional case. This work does not change the shared pool contract
or claim successful rollback against a persistently broken presentation backend.

Focused tests exercise the same physical pooled object through Pistol T1 →
reset → Shotgun T3
→ blocked → unblocked → reset → Scrap, then XP and Chest. Assert exact art,
texture, frame, animation, dimensions, alpha, tint, flip, rotation, origin,
marker and grant lifetime at each step. Reset must stop animation, clear the
prior identity and marker, restore transforms, hide/deactivate art, zero velocity
and disable the unchanged physics circle. Blocking retains the Shotgun icon;
unblocking restores ordinary treatment. Spawn/update must allocate no sprites,
and magnet movement must keep the art centered on the existing body. Readiness failures before acquisition,
view-swap/activation failure retry,
rack-full block/unblock reuse, and existing Scavenge lifetime regressions pass
in the focused suite. Tests also directly check unchanged spawn generations
and absent publication after failed view swaps.

## Resource closure and remaining delivery gates

`resolveRunPhysicalResources` already includes every registered weapon's icon,
held and projectile art because any definition can appear as loot. Reusing
`art.iconId` needs no new weapon resources. This foundation changes no
closure. Real browser evidence must still prove every grant's resolved resource
is present before spawning. The legacy `drop:weapon` resource remains in current
closure; removing its unused live dependency is a separately reviewed cleanup,
not a prerequisite for exact icon identity.

No new XP/Scrap/Chest resources are required while existing bindings are retained.
Future accepted native exports should replace pixels through existing source,
export, logical binding and resource identities, keeping frame/clip contracts
unless explicitly migrated. A future dedicated weapon drop-art field would
require generic definition-driven closure; this foundation does not add one.

Native artwork, editable-source/export parity, art validation, actual-size
Junkyard/Forge and grayscale readability, phone/desktop browser evidence, and
product-owner visual approval remain separate delivery gates. The oversized
generated candidate atlas is not promoted as accepted native production art.

## Real pooled browser proof contract

A visual-test-build-only, synchronous Training fixture drives the actual
DropSystem pool and returns scalar snapshots. It retains no entity references,
listeners or delayed callbacks. A six-profile browser regression uses ordinary
prepared-run resources and the shared physical intro confirmation before
Pistol T1 → reset → Shotgun T3 → blocked → unblocked → reset → Scrap, then
XP, Chest and a final static Pistol. It asserts unchanged configured physics
radius, one reusable Sprite, exact registered textures/frames, stopped versus
playing animation, reset transforms/markers, allocation bounds and unchanged
save. It captures actual viewport artifacts without adding screenshot goldens.
The focused test passes all six profiles (39.2 seconds); this is not native-art
approval. All 36 actual viewport/state captures were independently checked.
The coordinator inspected full viewport samples and the complete contact sheet.
Current XP/Scrap/Chest pixels remain legacy validated art, pending re-authoring.
Both authored-biome resource closures are separately checked against all
registered grant presentations. Production exclusion must also cover the new
fixture method. Exact-head full gates, hosted matrix and device/visual review
remain required; focused tests alone do not close #200.

Independent review reproduced a test-helper defect using installed Phaser: the
existing visual freeze normalized stopped `currentAnim` metadata and could
overwrite a reset/reused static texture. A real phone browser RED now asserts
post-freeze state and fails on Scrap → reset (`art-drop-scrap` rather than
`__DEFAULT`). The helper now rewinds only playing animations. Global animation
pause preserves `isPlaying`, so current running-animation normalization remains.
This is diagnostic evidence repair, not a production gameplay defect. The
blocked pose uses actual capacity-checked run-rack grants so normal next-frame
unblocking cannot conceal the presentation state. No durable loadout changes.

Independent core and corrected fixture review: PASS. Focused mechanics/pool/resource
suites pass 182 tests in five files; ordinary TypeScript passes. Exact final-head
full repository and hosted matrix results are recorded in issue/PR evidence.
