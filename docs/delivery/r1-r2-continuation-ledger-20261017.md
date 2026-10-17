# R1/R2 Continuation Ledger — 2026-10-17

This is a dated engineering-progress record, not a product-acceptance or issue-closure verdict.

## Reconciled heads

| Scope | Branch | HEAD | State |
| --- | --- | --- | --- |
| R1 Loadout/Equipment/Gunsmith | `r1-equipment-gunsmith-review` | `c6b4939e989cf1f5613cbc9fd72b8e704699f667` | source clean; preserved browser diagnostics and test artifacts remain untracked |
| R2 Ability lifecycle | `r2-issue-241-ability-lifecycle` | `447525ec8832ab96f4eb1404c5c3c674fccd87ff` | source clean; `test-results/` remains pre-existing/untracked |
| hosted PR #261 | remote PR head | `3b854bac7437ad9aef60394d03c1caa597e5c7c8` | older than the local R1 fixes; no push or merge performed |

The R1 branch contains the saved layout work plus the gamepad/keyboard tuple-allocation fix (`c6b4939`), browser page-ownership verification (`7a574a9`), and Gunsmith prefix anchor fix (`2764475`). The R2 branch contains the saved handed-controls and terminal-presentation work through `6b9c7c9`, plus the composed sustained-terminal regression test in `ef2d2ed`. No Blender work was touched.

## R1 allocation and gamepad evidence

- Pinned CI runtime: Node `22.23.3`; `tests/zeroAllocation.test.ts` passed `9/9` on both unchanged base `6e4cdf8` and R1 `c6b4939`.
- Repeated cloud runtime diagnostic: Node `24.19.0` exposed a runtime-dependent discrepancy (unchanged base failed all five repeated probes, including idle/gamepad; `c6b4939` reduced this to two passing and three residual one-Scavenge gamepad probes). The base comparison is useful evidence but does not distinguish source allocation from runtime probe-floor behavior; direct profiling or repeatable reproduction on the relevant runtime is still required before calling this resolved. The supported Node-22 gate is clean after the tuple-allocation fix.
- `tests/epic19GamepadLifecycleSoak.test.ts`: unchanged base and `c6b4939` both passed `2/2` on Node 22.23.3, including 128 menu and 128 mid-run disconnect/reconnect cycles.
- Logs: `/tmp/r1-base-zeroAllocation-node22-20261017.log`, `/tmp/r1-c6-zeroAllocation-node22-20261017.log`, `/tmp/r1-base-gamepad-soak-node22-20261017.log`, `/tmp/r1-c6-gamepad-soak-node22-20261017.log`.

## R1 browser evidence

System Chromium `154.0.8037.57`, SwiftShader WebGL, real Phaser canvas, antialias/stencil enabled, serial worker:

- `responsive.pw.ts` compact phone-landscape quarantine: `6/6` passed; all six projects reported the expected `390x844` drawing buffer after portrait restoration.
- `loadout-layout-completion.pw.ts` targeted touch/controller/DPR3 cases: `18/18` passed across all six projects.
- The canonical fine-pointer compact screenshot failed identically twice on `c6b4939`: `6,896` differing pixels (`0.03` ratio) at the first `compact-home.png` golden. Unchanged base `6e4cdf8` reproduced the same `6,896`-pixel failure, proving it is not caused by the c6 source change. Actual and expected visuals were inspected; the mismatch is a stable golden/renderer-era difference, while viewport geometry and canvas authority are valid.
- Base also produced the known secondary afterEach failure because its explicitly owned page was not registered. R1 `7a574a9` closes that diagnostic ownership gap; it does not justify replacing the visual golden.
- Diagnostics: `/tmp/r1-c6-browser-fine-pointer-20261017.log`, `/tmp/r1-base-browser-fine-pointer-20261017.log`, `/tmp/r1-c6-browser-viewport-touch-20261017.log`, `/tmp/r1-c6-browser-loadout-touch-20261017.log`; inspected actual/diff PNGs remain under the R1 `test-results/` directory.

Visual-owner review and canonical golden disposition remain open. No snapshot/golden replacement was performed.

## R2 composed lifecycle evidence

On `ef2d2ed`, Node `22.23.3`, serial focused command:

```text
node node_modules/vitest/vitest.mjs run tests/abilityPresentation.test.ts tests/gameSceneAbilities.test.ts tests/menuScene.test.ts --maxWorkers=1 --minWorkers=1 --reporter=dot
```

Result: `3` files, `282` tests passed. The new `GameScene` composition test starts the real sustained `shield-flicker` presentation, emits terminal ownership, delivers late `ability:resolved`/`ability:ended` receipts, refreshes the real presentation system, and proves no FX or banner resurrection. Existing composed `run:won`/`run:lost` interruption tests remain green.

This is still an automated bounded checkpoint. Production FX approval/resource closure, real eight-ability combat, physical phone input, reduced-motion/device acceptance, visual owner review, hosted CI, merge, deployment, and issue closure remain unverified/on hold.

## Exact-head validation

- R2 `447525e`: lint and production build passed on Node `22.23.3`; full suite reached `4,138` passing tests and `2` failures, both art-importer checks blocked by the cloud environment's unpinned Pillow version instead of the repository-required `12.1.1`.
- R1 `c6b4939`: lint and production build passed on Node `22.23.3`; full suite reached `4,122` passing tests and the same `2` Pillow-gated art failures.

## Holds and next work

- Preserve no-merge, no-deploy, no-issue-closure, no-golden-replacement, and no-fabricated human/device acceptance holds.
- Keep R2 as the active roadmap outcome. Next bounded work is selected-ability production resource closure and eight-ability composed browser/real-gameplay coverage, followed by the required independent visual/device gates.
