# R0 Linux browser renderer — 14 October 2026

Owning outcome: R0 release integration, following PR #258/#259. This is test
infrastructure work, with no change to shipping gameplay, resources, art,
persistence or input. It does not close #165, #201 or a product/device gate.

## Reproduced release blocker

Main `01837ba9eecbd97d1e901a1751045831c482b160` passed all local gates,
including 764 browser passes / 64 existing scoped skips. Its exact hosted run
[38416009977](https://github.com/Joncallim/Meowcenary/actions/runs/38416009977)
failed 18 original 30-second desktop-1920 deadlines (746 passed / 64 skipped).
These occurred at different input, transition and capture boundaries. Cleanup
errors after the deadline do not establish a gameplay input defect. Incomplete
journeys remain unverified by that run.

The runtime/test-identical `a8e70237500467bb3de12bd4acc16f978e493cbb`
was used for controlled local renderer probes. On two distinct physical CPU
cores (Linux affinity `0,2`), the original unmodified Junkyard touch terminal
Replay → neutral warm Home test exhausted 30 seconds with default SwiftShader
(36.18 seconds including failure cleanup). With Mesa llvmpipe through ANGLE
EGL, it passed in 10.7 seconds (11.18 including runner startup/cleanup). All
physical admission, held/released edge, trusted event, neutral, Replay identity,
resource-cache, capture and save assertions were retained.

Existing PerfSampler checkpoint data showed raw frame p50 of 383.4 ms while
Phaser CPU p50 was 0.5 ms and render-command submission p50 was 0.3 ms. That
supports investigating presentation/scheduling cost; it does not measure GPU
completion or prove the hosted hardware cause. A separate attempted wrapper
on the frozen diagnostic seam did not take effect and supplies no timing proof.
Worker-count tuning, new Chromium headless mode and direct-CDP diagnostic
capture probes did not repair the deadline and were not adopted.

The initial actual-size paired prepared screenshots retained dimensions and
composition, but were not pixel-identical. This observation does not approve
baseline replacement. The unchanged goldens, thresholds and complete matrix
are mandatory for the candidate. Timing is evidence, not a new flaky CI gate.

## Smallest infrastructure boundary

- Keep the Linux image at Ubuntu 24.04 (the failed run's current image family),
  installed lockfile Chromium, serial CI worker and zero retries. Explicitly
  install both the EGL dispatcher (`libegl1`) and Mesa EGL/DRI drivers. The
  first candidate correctly rejected hosted SwiftShader fallback before any
  matrix test; installing the driver alone did not supply its dispatcher.
- Explicitly request Mesa llvmpipe software WebGL for runtime/input/lifecycle
  modules. All three committed-image modules retain browser default. The
  game continues to use Phaser AUTO, unchanged canvas dimensions, antialiasing,
  stencil, textures, viewport/DPR, input and resource ownership. No FPS cap,
  animation stop, Canvas fallback or application test branch is introduced.
- Unspecified local renderer launches retain browser defaults. Unsupported or
  misspelled explicit requests fail instead of silently selecting another driver.
  The new preflight also checks local WebGL/dimensions/antialias/stencil support;
  the whole local workflow is therefore not claimed to be unchanged.
- Before the matrix, probe both labeled roles in separate browsers. Open
  ordinary visual-build Home and check the **actual
  Phaser canvas**, after its own resource/frame closure. Fail on non-WebGL,
  wrong dimensions, lost antialias/stencil or a requested Mesa fallback.
  Record exact checkout, browser, active renderer, sample count and host CPU/OS
  facts in the CI log and `test-results/browser-renderer.json`. Never record
  environment variables or credentials.

The runtime preflight is not per-page GPU lifetime/exhaustion telemetry. Each
executed visual-authority fixture additionally checks its actual Phaser driver
before teardown, including after failed comparisons. The strict browser module
check includes both `rendererSetup.ts` and `visualAuthority.ts`, outside the
ordinary tsconfig. No existing module or scoped skip is removed.

The implementation uses Chromium's ANGLE EGL backend with Mesa's documented
software/surfaceless environment. References:
[Chromium headless GPU guidance](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md),
[Mesa environment variables](https://docs.mesa3d.org/envvars.html).

## Preserve committed pixel authority

The full `33d814f2671855079a8b135873f796ec2193c107` Mesa run disproved
pixel equivalence at the existing limit: phone-390 Home differed by 340 pixels
and the assembled Gunsmith by 779, each over the original 128-pixel allowance.
Expected/actual/difference images were inspected. Composition was unchanged;
edge rasterisation differences do not authorise new golden images or thresholds.
That run was stopped and remains RED/incomplete, not release evidence.

`responsive.pw.ts`, `ui-audit-capture.pw.ts` and `visual-fidelity.pw.ts` are the
complete inventory of modules containing committed-image assertions. Their
**whole modules**, including non-image assertions, explicitly replace runtime
launch options with browser defaults. There is no exception chosen by failed
case, retry or image. The separate default preflight requires original Linux
SwiftShader when Mesa is requested. Every executed fixture logs and attaches
actual driver/viewport/WebGL/antialias/stencil facts and asserts agreement with
that default identity. All original image assertions remain authoritative.

The other modules retain explicit Mesa. The earlier 18 hosted deadline failures
were outside these three image modules; this motivates the boundary but does
not prove the new complete matrix will pass. Renderer identity is not a substitute
for pixel comparison. Both labeled preflights, real image-fixture checks and
all 828 original cases across six profiles remain release requirements.

## Real Menu input receipts

The faster renderer exposed assertion failures in seven Menu test
modules and the visual-fidelity launch helper. Their synthetic key-up could precede the Menu input owner's sample:
a physical `isDown` flag had been treated as evidence that the logical edge
was consumed. The unchanged current-mount hydration test reproduced RED
(expected armour focus, observed helmet) and passed GREEN after the correction.

The shared test-only helper now holds each physical key through the existing
real `POST_STEP` receipt, asserts Menu is active, and observes neutral through
another owner frame after key-up. An inactive Menu cannot certify neutrality.
It never steps/wakes simulation, clears quarantine, injects logical actions or
waits for deliberately blocked artwork. Equipment, Gunsmith replacement, Loadout hydration, overlapping panel
load, performance navigation and local Equipment/Gunsmith mutations retain their semantic selection, held-state, resource,
preview, durable-save, screenshot and lifecycle assertions. The local mutation journeys additionally reproduced RED on two distinct
physical cores after resize: Gunsmith removal never committed and Equipment
retained the old helmet. The owner-frame correction retains their original
explicit held/released and durable mutation assertions. Focus is read after
receipt, so it is not claimed to belong to that same completed frame.
The visual-fidelity helper also replaces fixed 60/120-ms holds with the
existing real owner-frame receipts, allowing the legitimate Menu-to-Game
transition. Its original run/readiness/decision assertions remain mandatory.
No production input code changes; no deadline, retry, threshold, golden or scoped-skip change.

The complete dual-renderer author run at `7d769302ecf83b0f4a7154f9cc34be27a2e7f2ca`
([38456258964](https://github.com/Joncallim/Meowcenary/actions/runs/38456258964))
passed all prior gates and image comparisons, but remained RED: 763 browser
passes / 64 existing skips / one desktop-1280 Gunsmith warm-return failure.
After failed-save cancellation and Back, the physical click left Loadout open.
An observation-only single-core reproduction retained that same state assertion:
Menu was active and neutral before the click, but Phaser delivered only scene
down/up, never button down. The scene scroll gesture was cleaned up normally;
pre-existing quarantine and cancellation of an admitted button are not supported
causes. Heavier hit-list/geometry observations passed, so they do not prove a
specific hit-test or pending-registration mechanism in the failed execution.

Phaser defers newly interactive objects until input pre-update; a published
`interactive` flag and panel name alone do not certify that completed boundary.
The Loadout layout journey now requires the existing active-Menu, neutral owner
frame receipt before reading bounds and issuing each physical gesture. It does
not force registration, inject a command, retry a failed click, or change the
original cancellation/save/re-entry assertions. Focused constrained repeats and
both complete local and hosted gates remain required. Temporary observation
hooks are excluded from the committed source and release artifact.

## Release contract

The local probe is not a waiver of either failed hosted run. Require focused
repeated original failures, unchanged goldens/full six-profile matrix, all
ordinary/allocation/runner/content/art/build/resource gates, independent review,
and exact-head hosted CI before merge. Repeat the complete gates on resulting
main before the separate hearth-infra pin-only release. Record final SHAs and
results on the PR rather than claiming success in advance here.

This does not establish browser gameplay acceleration on a physical device,
art fidelity, listening quality, feature completion or human play acceptance.
