# INT-FB production validation — 2026-10-22

Candidate source: `d3315c1a51eeb40193484fb7ee7af786ab5f66fb`.

`npm run build` completed with exit status 0 before the production captures.
The browser matrix used one immutable `VITE_VISUAL_TEST=1` build and exited 0:

- desktop `1280x720`: 16 passed, 2 skipped;
- phone `390x844`: 3 passed, 15 skipped;
- total: 19 passed, 17 skipped, 0 failed.

The raw final reporter JSON and exit record remain in the execution environment
at `/tmp/int-fb-final-matrix.json` and `/tmp/int-fb-final-matrix.exit`.
The earlier matrix that ran while a production build rewrote `dist/` is
contaminated evidence and is not used for this result.

`movement/` contains ordinary-production screenshots after keyboard movement
toward the right camera edge and after viewport rotation, at desktop and phone
dimensions. The phone images are viewport-emulation evidence only: their
movement used keyboard input, so they are not a touch-acceptance claim.

Replay/takeover without visual-test setup remains unverified in these captures:
normal replay requires a completed retained receipt, and takeover requires an
ordinary combat down event. No production state was forced to manufacture them.
