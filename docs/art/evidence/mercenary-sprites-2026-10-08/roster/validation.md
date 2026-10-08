# Full-roster animation evidence — 2026-10-08

## Scope and outcome

All eight Mercenaries already had directly authored native 48×48 editable PXO,
lossless raster/build source, runtime export and 16 tagged frames. This packet
fills the common review/provenance and **complete runtime clip playback** gap;
it does not re-author the other seven sheets or confer visual acceptance.

Baseline main: `2865e28f46b046b743283b8c1bcf7fc7ef2936a3`.
Runtime fixture: `00bf2de9bbc6e2c61d4a5a4a55a3c55cceb0fde2` (unmerged #227).
Source revision: `f4fbfa2f3e8ee7e2cdb4d49704c7701b0cb34e2d`.
Boar uses the unbound proposed V3 request override. The other seven use the
fixture's exact PNGs, including #227's Lynx final-frame border correction.
Main does not contain that correction. No runtime bindings, gameplay, source
art, screenshot goldens, save semantics or production resources changed here.

## Method and machine evidence

Node 22.23.2, Playwright Chromium, existing visual-test production build on a
local preview server. Six emulated profiles: 360×640; 390×844/DPR3;
768×1024; 1114×720/DPR2; 1280×720; 1920×1080.

The actual GameScene player SpriteView and registered Phaser AnimationState
are driven with deterministic 20ms ticks and separately with real RAF deltas.
The game loop, scene and Arcade world remain paused; only the actor animation
and renderer advance. Every tick checks unchanged sprite/body position,
physical radius and 43.4-world-pixel frame width. Equipment is empty, ability
VFX absent and the existing held-weapon node is fixture-hidden.

- 8 actors × 6 profiles × 2 fresh-context playback modes = **96 passing contexts**.
- **384 passing clip checks**, **768 frame crops**, **16 full-viewport videos**,
  **0 browser errors**, one exact PNG fulfillment per context.
- Idle: frames 0–3 at 6fps; run: 4–9 at 10fps. Each observes an actual repeat
  returning to its first frame, with continued playback.
- Hurt: frames 10–11 at 12fps; one completion returns through SpriteView to idle.
- Defeat: frames 12–15 at 8fps; one completion holds frame 15, including after a
  run request and a further 300ms animation clock advance.
- Gallery: all 48 actor/profile selections in both modes at each of six page
  sizes; every frame URL decodes, all four clip sections appear, recorded video
  links resolve where available, no page error or document horizontal overflow.

`manifest.json` retains registered clips, source hashes, frame events, lifecycle
end facts, viewport/camera facts and per-context results. `source-inventory.json`
records references, builders/raster masters, editable PXOs, exports and hashes.
`capture-record.mjs.txt` preserves the exact external capture harness, which
expects the recorded local checkouts and compiled fixture/server; it is not a
portable CI test. `build-roster-preview.py` reproducibly composes the captured
phone crops without resizing/editing source pixels. GIF timing is rounded to
10ms; its loop resets after defeat solely for review. The game holds defeat.

## Local validation and limits

Lint/typecheck, 2,949 ordinary tests across 195 files, nine allocation gates,
nine runner probes, content validation, complete art/source/export validation,
production build/resource identity checks and diff whitespace checks passed
with identical runtime/test inputs to source revision f4fbfa2. Gallery checks
and animation captures exercise this packet specifically. This is **not** a
new full-game Playwright acceptance matrix or hosted-CI result.

#227 hosted CI remains red: its latest complete attempt reports 367 passed,
64 existing scoped skips and one desktop warm-return default-budget failure.
This packet does not bypass that failure or justify merging/deploying #227.
No production deployment occurred.

Emulated frozen-arena art evidence does not establish physical-device rendering,
live combat, input acceptance, accessibility, performance or owner approval.
Boar's owner approval covers the large identity direction only; native V3
sprite/animation approval remains outstanding. #191/#175 remain open.

## Independent visual review and unresolved art acceptance

All sixteen actual phone frame crops per actor were inspected by the integrator
and an independent reviewer. Boar V3 has a clear lowered final defeat rest;
Lynx also has a distinct low ending. Tabby, Hound and Cougar remain largely
upright/alert through defeat. Weasel, Raptor and Ram likewise have weak final
pose separation from their alert silhouettes. These are concrete visual-review
concerns, **not failures of frame sequence, repeat or completion**.

Run and hurt motion is subtle across the roster at actual scale, including Boar.
The desired personality/readability and stronger defeat/body-motion treatment
remain #175/#191 product/visual acceptance work. No candidate is declared
canonical or ship-approved because these automated checks pass. Tabby/Hound's
recorded direction board is distinguished from the verified canonical Figma
nodes used by Lynx and the five Alpha 3 roster actors.

Independent machine QA checked all 96 distinct actor/profile/mode rows, all
384 registered/event sequences and end behaviors, all 768 ordered 96×96 frame
crops, all 16 referenced recordings with no orphan video, and all 40 native
source-chain hashes. Three RAF run rows emitted an extra update after repeat;
the full six-frame order and exactly one repeat/no completion remained correct.
An independent visual pass supplied the unresolved art observations above.
