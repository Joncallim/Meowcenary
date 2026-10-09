# #196 — ability comprehension, bounded implementation packet

Status: design packet; no implementation performed. Base: main `a100e053ce4e2bc48bc4b8844e7da5010d562096`. Implement independently of the #230 directional decision. Preserve #229's admitted Scavenge batch and pending-clear physics fixes.

## Current code, not old issue assumptions

- `src/gameplay/abilities.ts` owns six mechanical effect kinds and the ready/active/cooling state. Both duration and cooldown decay during active time; do not add duration to the displayed cooldown.
- `DropSystem.collectNearbyConsumables(radius): number` already returns real collected count. `AbilityRuntime.collectNearbyConsumables` and `applyAbilityEffect` still discard it through `void` seams. Adapt those seams; do not reimplement collection.
- `Player.heal()` still needs a truthful applied delta at the owner boundary. Do not infer healing from the requested 40.
- `GameScene.create()` calls `startRun()` immediately at baseline line 721. Existing intro/pause ownership is the correct gate.
- Mechanical area radii are duplicated in effect and presentation. Remove the duplicated gameplay geometry from presentation while retaining separately named `visualRadius` for decorative self auras.
- Eight ability icons already exist. Reuse them. No new icon set, cast redesign or equipment work is required.

## Execution slices

1. Pure explanation/resolution model and tests.
2. Intro brief and shared input/lifecycle gate.
3. HUD snapshot, mechanic-kind FX and actual consequence presentation.
4. Adversarial browser/device and comprehension evidence.

Each slice may be a bounded PR. Do not bundle procedural arenas or actor re-authoring.

## Exact file targets

Modify `src/gameplay/abilities.ts`, `src/entities/Player.ts`, `src/scenes/GameScene.ts`, `src/ui/controls.ts`, `src/systems/abilityPresentation.ts`, `src/systems/resourceLoader.ts`, `src/systems/validation/abilities.ts`, `src/data/abilities.json`, and the typed event definitions owning ability events. Add `src/presentation/abilityEffectPresentation.ts` (pure exhaustive explanation), `src/ui/runStartAbilityBrief.ts` (view only), and focused tests next to existing `tests/gameSceneAbilities.test.ts`, `tests/abilityPresentation.test.ts`, `tests/controls.test.ts`, `tests/scavengePulseCollection.test.ts`. Reuse existing layout/focus/input owners rather than a second menu input controller.

The intro portrait is a new run-resource consumer: add the selected character's existing `presentation.portraitArtId` to normal run closure and required binding validation. Do not assume the Menu warmed the portrait atlas. Load the selected logical portrait; physical atlas co-loading is an honest registry consequence, not permission to preload other families.

Also modify the existing Mercenary-detail owner in `src/scenes/MenuScene.ts` to consume the shared explanation. For truthful damage receipts, the narrow targets include `src/entities/Enemy.ts` and `src/gameplay/enemyDamageResolver.ts`; preserve every existing damage/kill semantic and test the compatibility boundary rather than bypassing the resolver.

## Truth/dataflow

`AbilityDefinition → resolveAbilityEffectPresentation → Mercenary detail / intro brief / activation copy`.

`logical ability command → activateAbility → immutable activation fact → applyAbilityEffect → immutable AbilityResolution → consequence text + bounded mechanic FX`.

Return a discriminated resolution: heal `{requested, applied}`; area `{kind, radius, affectedLiveTargets}`; loot `{radius, collectedCount}`; stat burst `{modifiers, durationMs}`; invulnerability `{durationMs}`. Entity owners perform mutation and report the result. Renderer never recomputes targets, retains entities, counts candidates instead of successful effects, or guesses collected quantity after callbacks.

Every returned variant has explicit `kind` (`heal`, `knockback`, `elemental-burst`, `loot-pulse`, `stat-burst`, `invulnerable`), `abilityId`, monotonic run-local `activationId`, and immutable activation `origin: {x,y}`. `radius` exists only on mechanical area variants. All arrays/objects are frozen snapshots; no live enemy/Drop references.

Exact return seams: `Player.heal(amount): number` returns clamped HP delta; `AbilityRuntime.collectNearbyConsumables(radius): number` forwards the existing DropSystem count; GameScene uses a validated DropSystem owner or returns `0` explicitly, never `undefined`. Successful knockback needs an owner success receipt for a live eligible target. Damage receipt must come from the mutation owner.

Important current trap: `EnemyDamageResolver.applied` presently infers success from `enemy.active && state !== dead` after any nonlethal return; `Enemy.takeDamage()` returns false for both shield blocks and nonlethal success. Do not blindly count this field. Introduce one authoritative damage-result method on Enemy returning `{applied, killed}` and have the existing boolean `takeDamage` compatibility wrapper delegate to it; the universal resolver uses the receipt and remains the only kill-settlement owner. Keep the current AoE call's no-source shield semantics. The immutable visual origin is presentation data and MUST NOT be newly passed as a damage source, which would change shield behavior. If the implementation chooses a different API shape, it must provide the same single-mutation receipt and compatibility tests.

For area effects, narrow the effect loop to currently live eligible targets through an existing owner predicate/return fact. Preserve universal damage/kill settlement exactly once. Do not count a dead body or failed mutation as a hit. Coincident enemy/player positions need defined zero-distance knockback behavior consistent with existing mechanics; changing balance is not part of this packet.

## Mechanically derived copy snapshot

| Ability | Main sentence | Cooldown |
|---|---|---|
| Scrap Burst | Knock back enemies within 90 range. | 9s |
| Giga Chomp | Restore up to 40 HP. | 18s |
| Adrenaline | Move 40% faster for 2.5s. | 10s |
| Shield Flicker | Become invulnerable for 1.2s. | 15s |
| Heat Vent | Deal 90 damage to enemies within 110 range. | 11s |
| Scavenge Pulse | Collect nearby Scrap and XP within 160 range. | 8s |
| Precision Mark | Gain 30% damage and +1 pierce for 4s. | 14s |
| Overclock | Gain 50% fire rate and 25% movement speed for 3.5s. | 12s |

These are baseline expected snapshots, not new authored numeric copy. Derive percentages from mult values and labels from stat semantics. Preserve tradeoffs if future modifiers introduce them. Exhaustive effect handling must fail compile/test/validation for an unsupported new effect shape. Display HP gained as 0 at full HP, never +40. Scavenge consequence is collected count, not currency amount.

## Layout specification

Use existing ThemeColor/ThemeFont (Nunito family, body ≥14, labels ≥16, heading ≥22). Text in cream, secondary labels muted, teal primary action, cream focus outline. No double badge around the existing ability symbol.

- 390×844 / 360×640: safe-area inset 16; one centered card width `min(viewportWidth−32, 420)`. Top identity row: 64 portrait + Mercenary name; ability icon 48 alongside ability name; effect sentence wraps ≤3 short lines; cooldown/duration chips; input glyph and “Use ability”; full-width 48-high Start footer, Back/return affordance outside the destructive-action domain. Card content scrolls only if font/accessibility expansion exceeds usable height; Start remains reachable without accidental gameplay pointer capture.
- Landscape 844×390: card maximum width 640, two columns (identity/ability icon left, copy/actions right), max height usable viewport−24. Do not scale text below minimum to fit.
- Desktop 1280×720 / 1920×1080: centered 560-wide card, same content hierarchy; no oversized tutorial modal. Back and Start keyboard focus visible.
- Brief background dims frozen arena; no enemies/spawn clocks moving behind it. Player already exists only if needed for layout/resource validation, but simulation remains intro and controls are inert.
- Activation banner: one bounded transient slot below top HUD, maximum two text lines, no button/focus. Show name + concise mechanic; consequence replaces detail when resolved. Do not queue an unbounded history.
- Ability control always retains its canonical ability icon. Ready adds a complete outline + small ready glyph; sustained-active adds a distinct duration band + persistent state symbol; cooling adds recessed progress fill + seconds without replacing the icon. Shape/progress differentiate states even grayscale. Active and cooldown are separate fields from the state snapshot, never independent timers.

Important semantic distinction: `durationMs` on a one-shot knockback/Heat Vent/loot-pulse is currently an internal transient phase, not damage/collection continuing for that duration. The pure UI snapshot resolver maps those one-shot effects directly to visible cooling state after resolution, using authoritative cooldownRemainingMs, even while the internal AbilityState phase briefly remains active. Only `stat-burst` and `invulnerable` show sustained-active duration. Do not change mechanical ability timing or claim Heat Vent deals damage for 0.8s. Include tests for this mapping and the unchanged concurrent cooldown decay. The layout's sustained-state example must be explicitly Shield Flicker or another sustained effect, never an unlabeled duration under Heat Vent.

## Intro lifecycle and failure contracts

`create frozen intro → mount brief → Confirm → quarantine current pointer/key until neutral → destroy brief → startRun exactly once`.

Highest-priority intro branch in `routeAction`: Confirm and touch Start call the same guarded `beginRunFromBrief`; Back revokes the launch and returns to Menu without win/loss, run settlement or progression writes. Ability, pause, inventory and gameplay actions are inert. Repeated Confirm, held key, controller repeat and double touch cannot start twice or immediately fire/move. A scene generation/owner token revokes delayed callback publication after Back, restart, shutdown or a newer launch.

Resize reflows the same brief without restarting the run or resetting focus unnecessarily. Orientation blocking remains owned by the existing gate. Missing required icon/presentation definition fails through the existing launch error/retry surface, not a primitive fallback or partially started combat. Retry repeats normal preparation; it cannot invoke an obsolete brief callback.

Pause, upgrade chooser, extraction, pending clear and terminal states freeze authoritative ability time and therefore persistent cues. Resume reads the state snapshot. Shutdown removes banner, FX, listeners and view references. Do not let FX completion mutate ability phase.

## Artwork and FX design

Reuse exact `ability-icon:<ability-name>` bindings. World cues are reusable vector/pixel-style primitives driven by mechanical facts; asset generation is unnecessary and would duplicate existing icons.

- Knockback: thin actual-radius broken ring + at most 8 short outward chevrons; no full-screen flash. The enemies' real impulse is the consequence.
- Heat burst: actual-radius ring + at most 12 ember ticks; damage remains immediate.
- Loot pulse: actual-radius inward brackets + at most 8 pull spokes, then “Collected N”; no per-drop entity retention. It may complete through the #229 upgrade pause only through the existing admitted batch.
- Heal: one brief plus/repair glyph and actual `+N HP`; at full HP show “HP full” / `+0 HP` consistently, not false gain.
- Shield: persistent closed hex/arc form until authoritative invulnerability expiration; reduced motion holds the shape static.
- Speed: at most 4 recycled trail marks while active; reduced motion uses a fixed wing/arrow state badge.
- Overclock and precision: persistent distinct gear/reticle state glyphs with the same modifier chips as the explanation resolver. Never copy ability ID branches into the renderer.

Budgets are caps, not targets: one banner, one persistent state group, at most 16 transient primitives total for the player ability, zero per-frame allocation after construction, no texture loads on activation. New reusable primitive kinds must be registered/validated exhaustively.

## Deterministic regression matrix

1. Eight baseline explanation snapshots, zero-duration heal, partial/full HP, invalid stat/effect shapes.
2. AoE ring radius equals effect radius after changing only the authoritative fixture; presentation cannot override it.
   Assert the outermost mechanic boundary never exceeds or undershoots the actual radius. Current FX expands beyond 1.0 and reduced motion shrinks rings; replace that misleading behavior with a fixed true boundary plus optional interior animation.
3. N successful heal/loot/area results map to exact labels; Scavenge can trigger multiple level-ups while reporting actual consumed count and preserving pool lifetime serials.
4. Intro advances no run clock, enemy spawn, physics, cooldown or save. All three input modes invoke one start command; repeat/double Confirm and dismissal edge cannot leak.
5. Back/shutdown/retry/resize while intro do not settle a run, retain listeners or resurrect a view.
6. Active/cooling state at exact boundary and large delta; pause/chooser/pending-clear/extraction/terminal freeze; resume preserves remaining values.
   One-shot effects never display misleading ongoing-damage/collection duration; their visible cooling state uses the still-authoritative cooldown value without changing the internal state machine.
7. FX ends at authoritative expiry, not animation completion; reduced motion retains state/radius/consequence; no entity references retained.
8. Missing icon/unsupported presentation fails at preparation, exact selected ability resource closure remains bounded.
9. Current damage, death, lethal settlement and #229 Scavenge tests remain green; zero per-frame FX allocation.

Final evidence: novice can state what their ability affects and what happened from brief + one activation; actual phone/touch, keyboard/controller and crowded arena captures. Automated snapshots alone do not satisfy human comprehension.
