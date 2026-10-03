# #195: complete actor framing

Baseline main: `bec29221d8f8886d9bf87ac20503df88d073a78f`.

## Measured owner

The root/canvas fills the intended viewport. At the authored physical top,
body centre Y=14 with radius=14 remains correct, but a 43.4-world-unit sprite
extends to Y=-7.7. The old camera clamps at world Y=0, projecting the sprite
top to -9.625 CSS pixels at zoom 1.25. This remains visible in the HUD-hidden
reference from the preceding HUD tranche. At the bottom, the offset shadow
extends farther than the sprite; the complete union is 43.4×65.1 world units.

`red.json.gz`, two RED PNGs and `browser-red.txt.gz` capture additive test
instrumentation over baseline owning-boundary behavior. Four phone/desktop
edge and resize cases failed. They are precommit diagnostics, not a pristine
production-build screenshot or visual golden. The test is reproducible with
`VITE_VISUAL_TEST=1 npm run build` then
`npx playwright test browser-tests/actor-framing.pw.ts --workers=1`.

## Correction

The run freezes complete sprite+shadow overhang from actual actor display
bounds and body radius. The final presentation envelope uses each measured edge independently
(left/right/top=7.7, bottom=29.4); no HUD dimensions participate. Static
centering uses that envelope midpoint so an asymmetric shadow cannot clip
in an otherwise fitting small arena.
One pure framing resolver and one scene application path establish zoom before
bounds/follow at initial create and resize. Small arenas remain centred.
Physics, arena content, movement limits and art assets retain their semantics.
Existing sprite-only bounds still own HUD intersection, so shadow-only overlap
does not change HUD behavior.

The same rectangle drives the scenery floor. Bitmap dimensions round outward
to integral pixels, covering the exact camera extent. Independent review found
that fractional TileSprite sizes would resize Phaser's backing canvas every
frame; the candidate was repaired before landing and a genuine RED unit test
preserves the integer bound. No generic performance framework was introduced.

## Historical focused evidence and limitations

The precommit GREEN matrix passed 12/12 cases over six established viewports:
eight perimeter poses and live 844×390 resize/restore per profile. Raw facts
include actual camera transform, real Sprite and Arc bounds, physics bounds,
root/canvas, floor bitmap dimensions, DPR and viewport state. Parent and
independent QA inspected top-centre PNGs: the actor is inside the canvas and
foreground HP/status/Pause remain readable. Two representative PNGs are kept.
Final exact-commit validation and supplemental/continuous input evidence will
be recorded separately; precommit evidence is not advertised as exact-head CI.

Large-desktop diagnostic teleporting exposed a test-observer assumption:
0.9-per-render-frame follow convergence took longer under software rendering
(~12–17 FPS) on the orthogonal midpoint axis. Physical edge axes still require
precise clamp convergence; midpoint axes require the complete actor inside the
view. Every final assertion independently checks the Sprite and Arc. No timeout,
containment tolerance, image golden or production follow behavior was changed.

Shadow-union and floor-bitmap RED unit logs are preserved. The browser fixture
places the player and grants temporary protection; it does not establish natural
combat/reward, physical-device, fun, or owner visual-art acceptance. #191,
#167 and #175 remain separate human gates. #194 must consume the final merged
and verified framing prerequisite, not these intermediate captures.

## Historical pinned runtime evidence — superseded

Runtime implementation `d5a72d5053b6f67ff1de43d99c4b4e6493a6b63c` was
rebuilt with matching build metadata. Six supplemental cases passed at
412×915 DPR3, initial desktop844×390 and foldable1114×720 DPR3, each including
all perimeter positions and orientation/resize restoration. The existing
production Pause→Fullscreen→exit test passes while the body remains at the
physical top, checking full actor containment and resolved framing after each.

The reproducible `continuous-input.mjs` uses four fresh DPR3 phone390×844 and
desktop1280×720 contexts, continuously held keyboard or actual CDP joystick
input, diagnostic reads only, and production Pause/Abandon/Retry commands.
Eight initial/Retry centre-to-top walks reached radius=14; every complete
sprite+shadow union and each real layer remained inside the camera at the top.
Physics remained the authored rectangle; pause blocked movement and resume
restored it. Four top PNGs and 36 capture facts are preserved in
`continuous-input.json.gz`; zero page errors. This evidence is emulated, uses
manual Abandon rather than combat-earned defeat/reward, and does not replace
visual-owner, hardware or fun acceptance. The run/build SHA remains d5a72d5,
not the later evidence-only commit.

Reproduce with an isolated visual-build preview and MEOW_REPO, MEOW_BASE_URL,
MEOW_EXPECTED_SHA, MEOW_BROWSER_HANDOFF=1 and MEOW_OUTPUT set explicitly.
The script refuses mismatched source/build commits. No positioning or
invulnerability fixture is used for continuous input.

## Integrated failure reconciliation and final correction

The historical symmetric candidate `6075b5d7ecfb25d9831891bcca17a362e17f37a5`
passed focused geometry, but full local and hosted CI failed **8 / 107 passed /
59 existing skips**. Do not treat earlier narrow GREEN evidence as acceptance.
`integrated-symmetric-red.txt.gz` preserves the full result. A separate clean
baseline main bec2922 build passed the phone art-reference and HUD comparisons;
`baseline-comparison-green.txt.gz` rejects the stale-baseline hypothesis.

Two failures were real runtime integration problems: symmetric shadow padding
added 27.125 unnecessary CSS pixels above the actor, lowering it into HUD text.
Separate measured edge padding repairs the camera envelope; static centering
uses its actual midpoint. The full Pause atlas icon also contains opaque paint
outside its foreground bars. With the complete actor now visible at top-right,
that combined paint retains only 0.388 actor contrast. ControlsView registers
the icon with the existing overlap owner, then displays the already established
two-bar foreground at the icon's size while overlapping. Normal icon artwork,
44px input target, callback ownership and the other foreground HUD signals
remain. RED unit and real browser evidence precede the fix: unchanged 0.6
contrast bound now measures 0.739 top-right, 0.696 top-left and 0.861 top-centre
on both phone profiles. Resize/disposal and pointer callback are covered.

Six failures concerned dedicated posed art references: padding altered their
right-edge camera clamp by 9.625 CSS pixels and the overscan bitmap composition.
The fixed references already pause/pose actors and override follow. An explicit
visual-build-only `useAuthoredArenaArtReference()` preserves the original
camera/floor rectangle for those paused art comparisons. Their labels now state
that limited contract. All six art comparisons pass with **every original
golden and pixel threshold unchanged**. This is not runtime-camera approval:
actor-framing, responsive, fullscreen, continuous-input and world-readability
checks never call this seam and continue exercising production geometry.
No art asset or authority state is changed or promoted.

The final source and new pinned runtime evidence require full closeout and
exact-head hosted CI before merging. Historical source/build SHA d5a72d5
captures above remain inspectable provenance, not acceptance of this correction.


Independent review also caught two candidate lifecycle gaps before merge:
extraction rebuilt the original Pause path without the overlap foreground,
and an initially broad art-reference freeze paused a live scene without its
matching resume. Combat/extraction now share one foreground builder; the RED
extraction transition test covers resize, return to combat and disposal.
Art normalization is synchronous, rejects a live scene and requires an
explicit already-paused actor/backdrop reference. Generic screenshot freezing
retains its previous input behavior. The full visual file passes 11 cases with
5 pre-existing skips, including production Pause→Weapon Rack. Hosted unit
checks also rejected changing fallback Pause-bar depth; its original depth
is preserved while the atlas overlap foreground alone uses the higher layer.
The 69 HUD/Controls unit cases pass without altering their assertions.


## Final runtime framing checkpoint

Runtime source/build `1e5e9051fc8c8291e2fca206abbd25c9abae3ac8` passes all
36 perimeter/readability/lifecycle cases across the six established profiles,
plus six supplemental 412×915 DPR3, 844×390 and foldable DPR3 cases. Every real
Sprite and Arc is contained at all eight physical perimeter positions. Floor
coverage, integer backing size, unchanged Arcade geometry, orientation return
and live-scene art-normalization rejection are asserted. Raw JSON and logs are
stored with their runtime SHA.

A strict fullscreen oracle initially failed by about 1e-13 world units: it
re-derived frozen run overhang from a translated live pose and grouped the
floating-point midpoint calculation differently. The test now derives its
expected padding from the initial actor snapshot, matching the run's frozen
ownership, and preserves exact equality and all containment assertions. The
corrected top/resize and production Pause→Fullscreen→exit pair passes. This
browser-only correction does not alter the measured runtime implementation.

Independent CSS-scale visual inspection confirms the full actor and readable
HUD signals. The top-corner actor intersects HUD copy and Pause foreground;
#195 permits world overlay, and physics/camera must not gain a HUD exclusion
boundary. HP, level, objective and Pause bars remain legible. Corner crowding
is an explicit #175 human readability limitation, not claimed visual approval.
The unchanged contrast threshold is 0.6; both phones measure 0.861 top-centre,
0.696 top-left and 0.739 top-right. Independent exact-source review found no
remaining concrete blocker. Full release gates and exact-head hosted CI remain
required before merge.
