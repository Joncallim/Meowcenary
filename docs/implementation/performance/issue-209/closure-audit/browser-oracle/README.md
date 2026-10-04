# Shared-art regression synchronization follow-up

PR #222 merged at `f847cb0e3d6119d8449d642c171237b422373f96`, with an exact tree match to its locally/hosted-green report head. A complete post-merge local rerun passed all gates (2,892 ordinary tests, nine allocations, nine runner probes, full validators/build, 175 browser passes / 59 scoped skips).

[Exact-main hosted run 37219277801](https://github.com/Joncallim/Meowcenary/actions/runs/37219277801) passed its earlier gates but finished with **174 passed / 59 scoped skips / one failure**: the new shared-art regression on desktop 1920×1080. Its post-release `expect.poll` observed the combined settled flag as false during the incidental five-second polling window. It did not observe an excessive attempt in that window. The uploaded screenshot shows usable Equipment with the intended failed-chrome fallback; no golden comparison failed. The original inline diagnostic attachment did not preserve pending-owner facts in the uploaded artifact, so the exact hosted cause is **not proven**.

## Reconciliation and controlled evidence

- An ordinary sixfold CPU-throttled reproduction of the old oracle passed three repetitions. CPU throttling alone did not reproduce the hosted failure.
- A temporary fixture additionally holds the Commando Equipment image for seven seconds (within the existing whole-test deadline). The old five-second oracle fails with exactly three Figma requests, zero page errors, generic `panelArtLoading=false` / `panelArtInFlight=false`, `equipmentArtLoading=true`, and one pending menu texture task. This demonstrates a false negative while a separate owner is legitimately still loading; it is not evidence that the real hosted owner was identical.
- Under that same temporary fixture, the joined oracle passes in 19.3 seconds, including all original retry/save/usability checks. Throttling and delay code are removed from the shipping test.
- The joined oracle run against original main `1f30c3785951ca30cfe86138622cd95f5c2dfb16` still fails immediately on the original duplication defect: expected three requests, received four at the assertion; the failure attachment later records five. This verifies the improved synchronization does not hide the original RED.
- The shipping joined test passes all six canonical profiles (30.0 seconds combined). Complete final-head local/hosted validation and post-merge results are recorded on the follow-up PR and #209.

Logs/diagnostics are compressed here and indexed by `manifest.json` with raw/archive SHA256 hashes. The filenames ending `constrained-red` refer to an attempted reproduction that passed, not a falsely claimed RED. Preserve that limitation.

## Minimal correction

After releasing the held shared atlas, race the **existing** `waitForMenuPresentation()` protocol against a route-handler signal for request four. The protocol joins `menuTextureLoadSnapshot().pending`, waits a frame and rechecks generation plus the full resource/publication closure. The duplicate signal retains immediate RED failure even if the old runtime would otherwise keep loading.

Every functional postcondition remains: exactly three failed-phase HTTP requests (one physical attempt plus Phaser's two retries), complete settled Equipment, usable controls, exactly one later successful retry (four requests total), unchanged save and no page errors. Path-based JSON diagnostics now survive failure artifact upload; any diagnostic read failure affects only attachment collection, never functional assertions.

This replaces the incidental five-second boolean polling budget with synchronization to the resource owner. **No timeout constants, 30-second whole-test deadline, retries, test scope, image thresholds, goldens or assertions are increased/relaxed.** A stranded queue still fails the unchanged whole-test deadline or the existing join's diagnostic error. There is no production correction and no new performance improvement claim. Runtime/build inputs remain identical to measured commit `039534f1bba205d67938f987d2bd085d01c8f263`.

Independent read-only review checked race cleanup, original RED sensitivity, timeout interpretation and preserved assertions. It found no additional material #209 production defect. #201 and all product/visual/native boundaries remain unchanged.

To repeat the controlled case, use a current visual-test build and temporarily add a `test.beforeEach` CDP `Emulation.setCPUThrottlingRate` of six plus a route for `**/assets/equipment/commando/commando-equipment-atlas.png` that continues after seven seconds. Compare the previous oracle from `f847cb0` with the joined oracle, keeping the same global/project deadlines and fixture. Remove both temporary additions afterward. For original-runtime RED, serve a clean worktree at `1f30c37` and copy only the current regression into `browser-tests/panel-drain.pw.ts`; no production file is changed.
