# #195 world/UI readability follow-up

Current-main baseline: `a08d05ee4ec25498984765e6e67abad423043813`.

Captured world/camera/root/canvas facts expose the authored world top without
a DOM offset or HUD-derived physics wall. One proven occlusion owner is
screen-fixed paint; the separate actor-display crop remains open below.
A 0.42 rectangle and 0.48 filled nine-slice compound;
opaque meter paint and corner controls can additionally cover the actor.
The existing `alpha < 1` browser assertion passes this failure.

## Reproduction before implementation

The new visual-build-only `captureArenaReadability()` captures four identical
pose/alpha/world/transform frames: actor present/absent, UI present/absent. It
measures the RGB contrast contributed by the actor rather than counting merely
finite screen coordinates. Camera scroll starts identically for each capture,
because manual Phaser rendering also advances camera follow. UI visibility,
actor visibility, scroll and pre-existing loop/animation pause state are restored.
The diagnostic does not run in ordinary production. It uses the existing
deterministic first-animation-frame fixture; the original animation playhead is
not restored. This is a diagnostic capture, not a normal live-play screenshot.

`red.json` records two failures on phone 390×844 and desktop 1280×720. Actor
contrast retained under UI at top-centre was **26.3%** in both. Phone top-left
retained **25.6%**, and top-right retained **16.7%**. The latter exposes the Pause
owner which a HUD-plate-only fix misses. Bottom-right retained 91.7% on phone;
bottom-left and desktop bottom corners retained approximately 100% in this pose.
Those passing points are retained as controls, not falsely reported as failures.

The new 60% regression bound requires a majority of reference actor contrast to
survive UI paint. It is not a subjective visual-approval threshold. CSS-scale
inspection and ordinary continuous input must separately establish recognition.
The placement helper grants 60-second invulnerability and deliberately renders
actor alpha 0.45. Reference and actual keep that alpha identical; these captures
must not be described as normal untinted play. HUD/Controls/Player/actor-view
owners were byte-identical to baseline during RED; their hashes and the source
qualification are archived rather than assigning old results to a later SHA.

## Visual authority

Figma file `LHpXaKqFKksfF2uismDws5`, Gameplay UI page `50:2`, Portrait HUD v2
`50:8` and Desktop HUD v2 `50:221` were read using design context and screenshots.
They define ordinary layout/chrome. The correction should preserve those normal
states and only address overlap with the actual presented actor; this evidence
does not promote a candidate actor, asset, layout or golden to approved authority.
Existing #191/#167/#175 and product-owning acceptance gates remain separate.

## Candidate and validation

The candidate compares cached screen-fixed paint bounds against the actual
displayed actor bounds. Only overlapping backing/meter paint is attenuated;
normal chrome, world geometry, player physics and pointer hit targets keep
their existing owners. The initial all-paint treatment passed the contrast
oracle but was rejected by independent image review: HP copy and Pause signals
became faint at the corners. Foreground signals must remain readable, and the
same unchanged contrast bound must still pass.

An additional P1 was reproduced at the scene lifetime boundary. On current
main, GameScene discards its HudController without destroying it: twelve bus
subscriptions and the PhaserHudView resize listener survive. Resizing in Menu
then repaints the inactive GameScene, so the next run has **four HUD plates
instead of two**. Both phone and desktop browser regressions were RED when
only the missing shutdown call was restored to its pre-fix condition. The fix
disposes the existing owner before discarding it; no new lifecycle framework
is involved. The unit regression exercises four visits and bus unsubscribe;
the browser regression exercises the real view, two Menu round trips, warm
launch, resize and unchanged durable storage during resize. Its terminal
content is a fixture, not evidence of natural combat/reward acceptance.

## Candidate evidence

Runtime source: `95ec2d0f05db945001faa528915cb5582a4883d2` (PR #211).
On the same phone/desktop fixtures, `green.json` records 89.2% retained actor
contrast at top-centre. Phone top-left is 81.6% and top-right 75.1%, while
foreground HP/status text and Pause/Ability signals retain authored opacity.
Desktop top corners retain about 91.5%. The unchanged 60% regression passes.
The rejected all-paint candidate is not the accepted treatment or a golden.

`hud-lifecycle-red.txt.gz` and `hud-lifecycle-unit-red.txt.gz` preserve the actual
owning-boundary failures. The browser RED has candidate presentation code but
only the missing GameScene HUD cleanup call removed to match main's shutdown
condition; it is not falsely labelled an exact full-main build. Both original
RED phone/desktop cases observe four plates, and both candidate cases observe
two after repeated transitions.

Ordinary continuous-input evidence is separately archived in
`continuous-input.json.gz`: fresh saves, 390×844 and 1280×720, keyboard and CDP
touch, DPR 3. Four contexts, eight continuous centre-to-top traversals including
Retry, and 36 CSS-scale captures completed without page errors. No placement,
invulnerability, forced defeat or four-render capture fixture is used. Pause
blocks movement; resume moves away from the boundary; the actual Abandon and
Retry commands exercise terminal transitions. This does not establish natural
combat defeat, reward acceptance, hardware/device acceptance or a #171 verdict.
Four original representative PNGs are committed; independent inspection found
the untinted actor recognizable and the HP/level/Pause signals readable.

Reproduce the full automated matrix with the repository's unchanged
`npm run test:browser`. For the supplemental continuous-input journey, build
with `VITE_VISUAL_TEST=1`, serve that build, and run `continuous-input.mjs`
with explicit `MEOW_REPO`, `MEOW_BASE_URL`, `MEOW_EXPECTED_SHA`, `MEOW_OUTPUT`
and `MEOW_BROWSER_HANDOFF=1`. It asserts source/build identity before launch.
The supplemental runs use ordinary run seeds; they are inspected journeys,
not a new wall-clock CI gate. Inspect the images before changing their raw
`PNGInspection: pending` status into a visual conclusion.

## Remaining acceptance

The normal actor's upper portion still extends outside the canvas at the exact
physical top edge. It is also cropped in the HUD-hidden reference. This PR does
not repair that separate presentation/framing question or claim a complete
uncropped silhouette. #195 remains open, cross-referenced to #175, pending
measured actor-display bounds and a correction at the proven owner. No arbitrary
HUD-derived movement wall or camera offset is justified by the HUD result.

Local lint, 183 files / 2,810 core tests, all nine allocation checks and all nine
test-runner probes pass on the runtime candidate, as do content and complete
art/source/export validation and production build. The ordinary bundle contains
neither a test global nor the new capture diagnostic. Exact-head source review
is clean. Full browser and hosted closeout are pending; #201 remains open.

The first full 150-case browser run at `95ec2d0` finished **90 passed / 59
existing skips / one failure**. The new foldable preparation predicate compared
rounded `camera.worldView` with a fractional clamp target: observed x=-61,
expected x=-61.5, an exact 0.5 difference that cannot satisfy `< 0.5`.
`foldable-camera-rounding.json` archives the failing state. Phaser 3.90's
Camera.preRender rounds the worldView descriptor even with roundPixels=false;
render scroll remains fractional. The corrected preparation check compares
actual scroll with viewport/zoom-derived clamping at the same tolerance, then
asserts the integer descriptor exactly. No runtime, time budget, contrast bound,
golden or image threshold changes. The focused foldable pair passes; the full
matrix must be rerun before merge.

The corrected `24c3465` full local matrix finished **91 passed / 59 existing
skips / zero failures**. Hosted runs exposed a separate test-harness assumption:
the new tests held Enter while polling scene activation with the default
five-second assertion window. The `95ec2d0` hosted run had four such desktop
launch failures plus the foldable descriptor failure above; `24c3465` had two
desktop launch failures (**89 passed / 59 existing skips**). All four original
desktop failure screenshots were inspected: GameScene was fully constructed
at capture, with its intro and time zero. This supports a preparation-observation
race under load, not a proven gameplay launch failure. No golden was changed.

The visual-only observer now watches the owning serialized resource queue and
real scene handoff within the unchanged test budget, rather than imposing a
synthetic five-second launch performance gate. It observes each distinct promise
once and checks lifecycle/failure/generation independently on frame boundaries;
it does not wait indefinitely on a loader promise orphaned by scene shutdown.
Two conformance cases hold a real run asset: one requires the observer to stay
pending until resource completion and real GameScene activation; the other
stops the preparing Menu through Phaser, requires cancellation before releasing
the asset, and rejects late scene resurrection or page errors. This test-only
shutdown seam is absent from ordinary production. The old promise-blocking
observer is separately demonstrated RED at the unchanged 30-second budget;
the corrected eight-case foldable/desktop run passes. Full exact-head local and
hosted validation is still required before merge. The diagnostic correction
does not change runtime Menu, resource-loading, input or gameplay semantics.

At `73451d1`, the entire local closeout is green, including **103 browser passes /
59 unchanged scoped skips**. Hosted run `36851319183` finished **101 passed /
59 unchanged scoped skips / two failures**: both large-desktop cases exhausted
their original 30-second whole-test budget. Resource handoff and cancellation
conformance passed on all projects. The contrast case produced all ten PNGs
and its five-point facts before expiry; every ratio passes (0.892–1.000).
The lifecycle case reached the second Summary's focused Main Menu action.
Both failure captures were inspected. No evidence of a failed contrast bound,
HUD plate-count assertion or resource handoff is inferred from that timeout.

The capture previously encoded four complete PNGs but returned only two.
Avoiding the two actor-absent exports retains all four renders, all four full
pixel arrays, exact energy calculations and both original inspectable images.
An export-count regression requires exactly the two returned artifacts and is
RED when the unused exports are restored. The lifecycle input driver now
observes one real Phaser POST_STEP after each key-down/key-up, instead of two
generic animation frames each. Phaser 3.90 emits POST_STEP after scene update,
so the action and release have actually been sampled by their logical owner.
The observer removes its completion/destroy listeners, cancels on game destroy,
and never wakes or steps the game. Neutral samples after launch and Summary
transition remain; resize keeps separate render-frame waits. Both Menu round
trips, three launches, storage checks and all assertions remain. Test budgets,
thresholds, screenshots and game runtime owners are unchanged. The corrected
phone/1920×1080 eight-case run passes; full exact-head validation is pending.
These are bounded diagnostic-work reductions, not a measured game-runtime
performance improvement claim.

The supplemental corrected checks also pass six cases: 412×915 at DPR 3,
844×390 fine-pointer desktop, and 1114×720 foldable at DPR 3. Raw contrast and
root/canvas/camera/world facts are in `supplemental-green.json`. Compact
coarse-pointer phone landscape continues to use the established orientation
quarantine/return path; it is not falsely reported as live portrait gameplay.
No physical Android/iOS device or real browser-chrome inset verification is
claimed by desktop emulation.
