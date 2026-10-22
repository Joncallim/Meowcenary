# INT-FB production validation — 2026-10-22

Candidate source: `d3315c1a51eeb40193484fb7ee7af786ab5f66fb`.

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

## Responsive regression — 2026-10-22

The runtime fixture now relayouts both cameras, fixed HUD/action controls, and
open modal roots on Phaser resize, while preserving the live follow target and
workshop state. Listener teardown is scene-owned in production as well as in
the visual-test build.

The targeted visual regression ran from the immutable visual build with system
Chromium:

`MEOWCENARY_BROWSER_EXECUTABLE=/usr/bin/chromium npx playwright test browser-tests/integrated-fixture-recovery.pw.ts --project=desktop-1280x720 --project=phone-390x844 --grep 'fixture resize keeps' --reporter=json`

It exited `0`: 2 passed, 0 failed, 0 skipped. It covers desktop
`1280x720 → 720x1280 → 1280x720` and phone
`390x844 → 844x390 portrait guard → 390x844`, asserting header/HUD/action
bounds, live follow centring, stable fixed-UI count, and preserved open
workshop state. Its sanitized reporter JSON, exit status, command, and the
separate production-build exit status are retained beside the inspected
captures in `validated/resize/`.
