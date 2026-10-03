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
bounds and body radius. A symmetric presentation envelope uses the maximum
extent per axis (current X=7.7, Y=29.4); no HUD dimensions participate.
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

## Evidence and limitations

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

## Pinned runtime acceptance

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
