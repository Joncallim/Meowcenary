# INT-FB production validation — 2026-10-22

Candidate source: `d3315c1a51eeb40193484fb7ee7af786ab5f66fb`.

The final focused browser matrix was rerun at clean source
`c0d0a8b620386d9e8048216c093764eaf6136e61` after the responsive runtime
repairs: desktop `1280x720` 17 passed / 2 skipped; phone `390x844` 4 passed /
15 skipped; total 21 passed / 17 skipped / 0 failed. Its raw sanitized report,
exit status, and command are in `validated/matrix/`. The phone project remains
viewport-emulation coverage except for its explicit touch cases; skips are not
touch acceptance.

`npm run build` completed with exit status 0 before the production captures.
The browser matrix used one immutable `VITE_VISUAL_TEST=1` build and exited 0:

- desktop `1280x720`: 16 passed, 2 skipped;
- phone `390x844`: 3 passed, 15 skipped;
- total: 19 passed, 17 skipped, 0 failed.

The sanitized final reporter JSON, exit record, and exact command provenance are
retained in `validated/matrix/final-matrix.json`,
`validated/matrix/final-matrix.exit`, and
`validated/matrix/final-matrix-command.txt`. The original temporary files were
`/tmp/int-fb-final-matrix.json` and `/tmp/int-fb-final-matrix.exit`.
The earlier matrix that ran while a production build rewrote `dist/` is
contaminated evidence and is not used for this result.

`movement/` contains ordinary-production screenshots after keyboard movement
toward the right camera edge and after viewport rotation, at desktop and phone
dimensions. The phone images are viewport-emulation evidence only: their
movement used keyboard input, so they are not a touch-acceptance claim.

Replay/takeover without visual-test setup remains unverified in these captures:
normal replay requires a completed retained receipt, and takeover requires an
ordinary combat down event. No production state was forced to manufacture them.

Fresh-storage ordinary-production captures in `production/final-head/` show
desktop workshop access and phone touchscreen workshop/movement. A manually
driven R01 attempt remains explicitly incomplete (`r01-manual-route-incomplete.png`):
it was still at the visible offer-terminal acceptance step, so this record does
not claim ordinary extraction, squad takeover, or archive replay acceptance.

## Responsive regression — 2026-10-22

The runtime fixture now relayouts both cameras, fixed HUD/action controls, and
open modal roots on Phaser resize, while preserving the live follow target and
workshop state. Listener teardown is scene-owned in production as well as in
the visual-test build.

The targeted visual regression ran from the immutable visual build with system
Chromium at clean source `b0e2785a77b99f8bb2364fa87869d0f8ba6b0098`:

`MEOWCENARY_BROWSER_EXECUTABLE=/usr/bin/chromium npx playwright test browser-tests/integrated-fixture-recovery.pw.ts --project=desktop-1280x720 --project=phone-390x844 --grep 'fixture resize keeps' --reporter=json`

It exited `0`: 2 passed, 0 failed, 0 skipped. It covers desktop
`1280x720 → 720x1280 → 1280x720 → 390x844` and phone
`390x844 → 844x390 portrait guard → 390x844`, asserting header/HUD/action
bounds, live follow centring, stable fixed-UI count, and preserved workshop
state. The desktop narrow leg opens a pending preview first, checks every
modal child and the render-only floor overscan against the camera view, and
proves the action, credits, parts, and materials are unchanged by resize.
New floor tiles are registered world-only when they are added after a resize;
the preview revision is also asserted unchanged so reflow cannot refresh a
stale transaction identity.
Its sanitized reporter JSON, exit status, command, and the separate
production-build exit status are retained beside the inspected captures in
`validated/resize/`.
