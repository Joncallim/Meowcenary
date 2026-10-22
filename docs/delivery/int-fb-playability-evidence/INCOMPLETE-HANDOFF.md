# Incomplete playability checkpoint

This is a recovery checkpoint only. It is not accepted for merge or deployment.

Implemented locally: B1 root routing and UI audit repair; manifest-owned
core-junkyard floor/prop presentation; registered live Tabby/Hound/rusher
sprites; padded follow camera; a fixed UI-camera layer and compact objective
strip. The four adjacent PNGs are reviewed initial desktop/phone root and
workshop frames.

Known open issue: the camera zoom (`1.25`) invalidates the existing browser
movement helpers. `integrated-fixture-recovery.pw.ts` has four unscaled
world-to-screen conversions at lines 33, 64, 101-102, and 122. The recent
36-case desktop/phone run therefore failed movement/replay routing; retained
failure context is deliberately not committed under `test-results/`.

Before resuming acceptance: expose/use the actual camera inverse transform
(viewport and zoom), update all four helper paths, rerun the affected joined
route and replay isolation tests, then run ordinary desktop/phone movement,
workshop gesture, resize, takeover, and replay checks. Dynamic UI-camera
registration also needs regression coverage.
