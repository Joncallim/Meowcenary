# Issue #209 — hydrate mounted Loadout art

Pinned immediate baseline main: `5c770c59f78c102465177fef680caf81320eef3e`.
Only draft art handoff #208 was open at slice start. Product semantics, Figma
layout and art authority remain with #193/#197/#198/#199/#175 and the art gates.

## Evidence-led scope and ownership

The prior repeated hydration comparison on the same production source showed
Loadout still paid four full renders / 302 objects constructed on cold entry.
Its three-repeat median hydration CPU was 61.6ms desktop, 200.6ms phone CPU4x
and 256.0ms foldable CPU4x. This motivates removing two Equipment/Gunsmith art
rebuilds, rather than decomposing scenes from source line count. It does not
establish physical-device speed or a gameplay bottleneck.

Only the existing Loadout mount declares static catalog, portrait and assembled
weapon image slots. Known absent bindings reserve transparent built-in Phaser
images at final size and draw order; texture/frame/opacity later change in
place. The Scene retains the single focus, scroll, clipping and resource owner.
No resource callback owns a captured snapshot, command, selection or layout.
Generic panel completion still rebuilds common chrome/backdrop. Equipment and
Gunsmith panels retain their existing update/paint boundaries; this is not a
second UI framework or a broad Menu extraction.

Before in-place hydration, the Scene checks the live committed Loadout mount,
current GameContext, immutable save reference and current character/arena/stage
selection. Changed authoritative state, unsupported display capability or
rebinding failure uses the existing fresh-snapshot full-render recovery.
Unmount, resize and shutdown revoke slots before destroying nodes. Opacity
hides unavailable images because the scroll owner controls visibility. Warm
cached completion makes no change. Actual browser observation is explicit and
test-only; ordinary input/performance polling does not gain an image-tree walk.

## Adversarial resource finding

Overlapping logical IDs for a failed physical atlas were re-enqueued by the
Equipment/Gunsmith pending drains. The same atlas could be attempted twice in
one closure (six HTTP attempts including Phaser's existing two retries), even
though the second request arrived before the first failed. Two owner-boundary
regressions are RED on the pinned baseline. The correction must retain one
attempt per physical resource in a drain, preserve genuinely new pending
closures and successful partial art, and permit a later explicit navigation
or selection to retry unavailable resources. This bounded optional-resource
work is not evidence of save loss or a new P0/P1.

## Acceptance and measurement

Retained RED evidence proves the old Loadout shell replacement and real-browser
full rebuilds, and duplicated failed physical requests for both owners. Current
acceptance covers retained control identities/callbacks, exact atlas frames,
geometry, mask/scroll/focus, current-save fallback, A→Home→A plus resize, shutdown,
actual Phaser image/frame/opacity/layer order, partial failure and later retry.
Cached-only queued art after an authoritative save change is also RED on main;
its regression requires one fresh-snapshot repaint and a later T2 art retry.

A complete matched comparison uses the unchanged performance-baseline runner,
identical catalog/save/seed fixtures, three fresh repeats on desktop1280×720,
phone390×844/DPR3/CPU4x and foldable1114×720/DPR2/CPU4x, with three-second light
and heavy combat windows. Timings are descriptive, not new CI thresholds.
A first baseline process terminated with exit143 after five completed cohorts;
its incomplete raw capture is retained externally and excluded. The complete
rerun finished nine cohorts / 243 checkpoints with no browser errors. Cause is not
established. Only completed controls/candidates can enter the comparison.

Full lint/typecheck, ordinary tests, allocation/runner probes, content and all
art/source/export validation, ordinary build/resources, diff checks, the full
six-profile browser matrix, independent exact-head review and hosted CI remain
required before merge. No timeout, retry, screenshot threshold, golden,
assertion or scoped skip is changed. #209/#201 and human visual/device/product
acceptance remain open.

The first cached-only RED attempt exhausted V8 while formatting the identity
failure against a circular fake Scene. It is excluded as assertion evidence.
The exact identity condition now reports a bounded boolean; the repeated
baseline repro reaches the expected RED assertion. No heap limit or production
behavior was changed for this test-formatting correction.

## Completed comparison and plain-English findings

Immediate control main: `5c770c59f78c102465177fef680caf81320eef3e`.
Measured implementation: `2ede5cad7a3c24b351c3446aa5ee101b5d1de760`.
Both completed with nine cohorts / 243 checkpoints / zero browser errors.
The [comparison](comparison.md) retains every action, all repeats, warm Home,
light/heavy frame counts/p50/p95/p99/worst/over-budget ratios, environment and
limitations. The raw gzip files preserve resource-load, snapshot, construction,
owner-attribution, font and input observations. Later capture/report commits
change tests/evidence only, so source/catalog/art/runner bytes remain pinned.

The strongest causal result is unnecessary Loadout art work. In every repeat,
four full renders become two full renders plus two zero-churn art updates.
Created objects fall 302→155, destroyed objects 271→124; final objects/textures
stay 83/47. Median total hydration owner CPU falls 67.9→21.9ms desktop,
212.9→70.3ms phone CPU4x and 270.9→82.0ms foldable CPU4x. This includes the
remaining generic chrome/backdrop repaint and excludes eligibility guard
outside owner spans; end-to-end latency includes that guard.

Cold Loadout presented latency medians move 1258.8→1233.1ms desktop,
1268.1→1153.3ms phone and 1865.7→1746.2ms foldable. Resource loading and frame
scheduling still dominate total entry latency. This is a measured reduction in
construction work, not a claim that the whole game is now three times faster.

Boot/common Home, Equipment/Gunsmith interactions and gameplay owners are
controls. Cold Home medians 974.8→1002.5ms, 1560.9→1675.3ms and
1954.5→1955.7ms vary in this baseline-first local experiment, without an
ownership/resource change there. Light/heavy p50 is unchanged across profiles;
tails vary with sparse samples. This slice establishes neither a combat
improvement nor a simulation bottleneck. Rendering/compositor, software host
cadence and real-device GPU performance still need distinct evidence.

The perceived slowdown is mixed: previously established boot closure work and
menu construction were real costs; this tranche addresses the demonstrated
Loadout portion. Scene line count and speculative pooling remain insufficient
reasons to restructure gameplay. The next #209 decision should inspect the
remaining generic panel repaint/shared chrome cost against measured benefit,
and obtain real-device cadence evidence before any combat optimization. No
new extraction or optimization is started in this tranche.

Ordinary production estimates are separate from diagnostic timing builds.
Raw / gzip9 / Brotli11 bytes:

| Item | Main control | Measured candidate |
|---|---|---|
| Application JS | 817355 / 184546 / 150623 | 820645 / 185426 / 151311 |
| Phaser chunk | 1208050 / 330419 / 264694 | 1208050 / 330419 / 264694 |
| CSS | 1273 / 587 / 458 | 1273 / 587 / 458 |

The implementation adds 3290 raw / 880 gzip / 688 Brotli bytes to application
JS. Boot remains six visual physical resources (ten URLs) plus four Menu
audio files. The 17 run-only audio files remain outside Home. Logical art is
619 bindings / 96 physical resources / 112 visual URLs; 226 production files.
Art/data/font/audio payloads are unchanged. Four-weight font readiness is
preserved. Inventory gzip files retain full bundle/lazy/run/audio accounting.

Reproduce the comparison from this directory:

```sh
python3 summarize.py --baseline baseline-raw.json.gz --candidate candidate-raw.json.gz --baseline-sha 5c770c59f78c102465177fef680caf81320eef3e --candidate-sha 2ede5cad7a3c24b351c3446aa5ee101b5d1de760 --out comparison.md
```

The unchanged runner is `scripts/performance-baseline.mjs`: use each pinned
runtime's visual-test build on its own preview port, `--expected-sha`, three
repeats and `--window-ms 3000`, with no competing build/test processes. Captures
remain candidate browser evidence; no golden or visual authority is replaced.
#209 and #201 stay open; physical-device, Figma/owner visual and integrated
product/fun gates still require their owners. Android/iOS packaging remains
future work under the existing mobile integration document.
