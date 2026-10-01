# #195 world/UI readability follow-up

Current-main baseline: `a08d05ee4ec25498984765e6e67abad423043813`.

Geometry was already correct: authored physics/world boundaries, camera zoom,
subpixel follow and root/canvas containment expose the top. The remaining owner
is screen-fixed paint. A 0.42 rectangle and 0.48 filled nine-slice compound;
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

Full candidate validation and ordinary continuous-input inspection are pending.
Do not close #195 from this interim record.
