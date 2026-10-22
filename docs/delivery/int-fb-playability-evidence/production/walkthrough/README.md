# Ordinary-input instrumented-build walkthrough

Runtime source for the retained fixed-layout replay captures: local candidate
`46170269c953f0fe63080701345cabfcb674f865`. Earlier R01 route captures were
made on the then-current candidate noted in their history; they remain
ordinary-input instrumented-build evidence, not seam-absent production proof.

The run used `chromium.launchPersistentContext` with the disposable retained
profile `/tmp/meowcenary-r01-walkthrough-profile`. It used normal browser mouse
holds and keyboard interactions only. Read-only calls to the existing
`VITE_VISUAL_TEST=1` diagnostic exposed actor position and Phaser's camera
inverse samples; these recalculated each pointer contact after camera movement.
No diagnostic method changed mission, combat, wallet, storage, or input state.
No production debug global/control was added: the existing visual seam remains
guarded by `VITE_VISUAL_TEST=1`.

`r01-storage-before-replay.json` and `r01-storage-after-replay.json` are the
actual retained Playwright storage-state snapshots. They compare byte-for-byte
identically (`cmp` exit 0), supporting the claim that entering, moving in, and
leaving replay did not change the settled live save. The persistent browser
profile is retained at `/tmp/meowcenary-r01-walkthrough-profile` and was not
edited.

The original walkthrough was driven from an ephemeral local Playwright script;
no standalone raw action-log or script file was retained at the time. This
record does not reconstruct one retrospectively. The fixed-layout screenshots
are `replay-fixed-4617026-desktop-1280x720.png`,
`replay-fixed-4617026-narrow-390x844.png`, and
`replay-fixed-4617026-return-1280x720.png`.

R01 progressed from accepted to active, recorded both markers and collection,
cleared the finite group, and settled extraction. The archive replay then
opened through History, moved its archived actor, and exited. The reloaded
settled live ledger retained credits 4000, materials `100/20/18`, its receipt,
and paid event ID.

Ordinary squad takeover is not claimed here: it requires a natural Tabby KO
while Hound survives, which does not occur in the cleared R01 run. Existing
takeover regression setup remains explicitly synthetic-precondition coverage.
