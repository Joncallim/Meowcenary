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
  installed lockfile Chromium, serial CI worker and zero retries.
- Explicitly request Mesa llvmpipe software WebGL for the hosted matrix. The
  game continues to use Phaser AUTO, unchanged canvas dimensions, antialiasing,
  stencil, textures, viewport/DPR, input and resource ownership. No FPS cap,
  animation stop, Canvas fallback or application test branch is introduced.
- Unspecified local renderer launches retain browser defaults. Unsupported or
  misspelled explicit requests fail instead of silently selecting another driver.
  The new preflight also checks local WebGL/dimensions/antialias/stencil support;
  the whole local workflow is therefore not claimed to be unchanged.
- Before the matrix, open ordinary visual-build Home and check the **actual
  Phaser canvas**, after its own resource/frame closure. Fail on non-WebGL,
  wrong dimensions, lost antialias/stencil or a requested Mesa fallback.
  Record exact checkout, browser, active renderer, sample count and host CPU/OS
  facts in the CI log and `test-results/browser-renderer.json`. Never record
  environment variables or credentials.

The preflight is a separate browser using the same launch resolver as the
matrix. It is not per-page GPU lifetime/exhaustion telemetry. The strict browser
module check must include `rendererSetup.ts`, outside the ordinary tsconfig's
source/test include. No existing browser module or scoped skip is removed.

The implementation uses Chromium's ANGLE EGL backend with Mesa's documented
software/surfaceless environment. References:
[Chromium headless GPU guidance](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/gpu/using-gpu-hardware-in-headless-chrome.md),
[Mesa environment variables](https://docs.mesa3d.org/envvars.html).

## Release contract

The local probe is not a waiver of either failed hosted run. Require focused
repeated original failures, unchanged goldens/full six-profile matrix, all
ordinary/allocation/runner/content/art/build/resource gates, independent review,
and exact-head hosted CI before merge. Repeat the complete gates on resulting
main before the separate hearth-infra pin-only release. Record final SHAs and
results on the PR rather than claiming success in advance here.

This does not establish browser gameplay acceleration on a physical device,
art fidelity, listening quality, feature completion or human play acceptance.
