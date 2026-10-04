# Issue #209 bounded closure audit

Starting implementation truth: **1f30c3785951ca30cfe86138622cd95f5c2dfb16** (merged/deployed #221). Candidate runtime: **039534f1bba205d67938f987d2bd085d01c8f263**, in [PR #222](https://github.com/Joncallim/Meowcenary/pull/222). Later commits in this tranche contain evidence/documentation only. Exact final-head local/hosted results are published on that PR and [issue #209](https://github.com/Joncallim/Meowcenary/issues/209); the recorded runtime and production resource hashes allow that equivalence to be verified.

This is a closure audit and one reproduced loader correction. It preserves Phaser, TypeScript, browser runtime, gameplay/RNG/save semantics, content/art authority and the #218 future native inventory. It introduces no additional surface extraction, native framework, Capacitor, Android/iOS package or product redesign. Draft #208 is unchanged.

The [line-by-line acceptance matrix](acceptance-matrix.md) covers all 19 performance criteria, all 11 architecture criteria, the Definition of Done, and all 22 adversarial cases. [Matched comparison](comparison.md), [build/resource comparison](build-comparison.md) and [supplementary variance check](variance.md) contain every requested journey, boot/font/audio measurements, object/resource counts, and light/heavy distributions including sample counts, p50/p95/p99, bounded worst and over-budget ratio. The original Phase A report and raw archives are retained unchanged in [the parent evidence directory](../README.md).

## Reproduced machine defect and minimal correction

Overlapping Loadout → Equipment navigation can share the optional `resource:figma-menu-chrome` atlas. On starting main, a queued logical alias reattempts its failed physical closure; terminal repaint releases the generic owner before declaring its own closure. A later successful Equipment-art publication can reopen the same failed shared atlas again. The real browser failed the existing 3-HTTP-attempt expectation (one physical attempt plus Phaser's two internal retries), observing 5 requests before the bounded oracle stopped. This is a resource lifecycle defect, not evidence that a large scene is intrinsically slow.

The generic owner now:

- marks physical resources attempted before entering the existing serialized loader;
- retains ownership through publication and drains genuinely new resources revealed by repaint;
- shares attempts across overlapping lazy-owner publications, clearing them for a later idle declaration and scene create/shutdown;
- suppresses its own cached declarations using mount/panel/revision and immutable context/save/selection identities;
- republishes a fresh controller snapshot when those identities change, including when a subsequent resource fails;
- retains generation guards, partial-success recovery and an explicit later retry.

The attempt bound is transient. Successful cached resources remain usable and a later idle navigation can retry optional failures. No durable save boundary, persistence acknowledgement, art binding, timeout, image threshold, golden or established assertion changed.

Unit RED covers queued aliases and ownership through partial-success repaint. Independent review added reentrant unique-resource success/failure coverage; failure exposed stale immutable-save recovery and was repaired inside the same publication boundary. A real browser holds then fails the optional Figma image, navigates using the shared focus/scroll owner and real touch/pointer input, asserts exactly three attempts, usable Equipment, later fourth successful request, no page errors and unchanged save. All six profiles pass the focused regression.

An initial exploratory Home/Career route used boot-required Navigation art and could not reach Home; it was rejected and is not acceptance evidence. Early green attempts also exposed an existing cached-repaint regression and a short-phone button clipped by its fixed footer; the former was fixed, and the browser harness now focuses/scrolls the router through real keyboard input before touch. We preserve valid RED and final GREEN logs and do not relabel the discarded hypotheses as production defects.

## Hosted browser-oracle follow-up

The first merged-main run failed the new regression's incidental five-second poll. The [bounded test-only follow-up](browser-oracle/README.md) joins the existing scene-owned closure, preserves fail-fast duplicate detection and all postconditions, and retains the unchanged whole-test deadline. It adds no runtime changes. Final follow-up/main local and hosted results are recorded on the PR and issue.

## Measurement method and limits

The pristine original main is **26f46fb5398c7eb769fe1bffa5ed60f80f20eea5**. Its Phase A opt-in observation implementation is **ef8d90cfca226c5595598fb74b3f699d0feb3caa**. The latter is the served measurement baseline, not a claim that the pristine commit contained instrumentation. Ordinary bundle/boot counts use the archived exact-pristine production inventory. Both sides of the new matched capture use the same current `scripts/performance-baseline.mjs` and `scripts/performance-contract-baseline.mjs`, with explicit expected served SHA checks.

Environment: Linux x64, kernel 7.0.0-31-generic, AMD Ryzen 7 7735HS, 16 logical CPUs, 30.7 GB reported RAM, Node 22.23.2, Chromium 153.0.8010.12 headless, Phaser 3.90. Local production Vite previews, unthrottled network, GPU backend unverified. Profiles are desktop 1280×720/DPR1/CPU1×, phone 390×844/DPR3/touch/CPU4×, and foldable 1114×720/DPR2/touch/CPU4×. CPU emulation is not a calibrated handset.

Three counterbalanced baseline/candidate pairs per profile run serially: 18 independent cold browser contexts, nine cohorts per side, 27 actions per cohort (243 actions per side), and zero recorded browser errors. One CPU-heavy browser at a time; no local full suites/builds compete with the timed cohorts. Context HTTP caches start cold; browser processes and operating-system/GPU/filesystem caches are not equivalent to physical cold-device restart. The supplementary actual Contract capture is three fresh launches per profile/side, performed after the primary pairs; it is not separately counterbalanced.

The common immutable V4 fixture has 640 Scrap, 31 Equipment instances, and configured Pistol/SMG builds with fitted Parts. Training/run seeds are 209001/209002; combat fixture seeds 209101/209102. The heavy fixture requests 48 enemies and gives 60 seconds of invulnerability; the active window is three seconds. Actual counts/status are recorded. This window does not prove maximum simultaneous pressure across every dynamic pool, a five-minute combat soak, or ordinary progression settlement. No timing-sensitive CI threshold is introduced.

Panel entry uses the existing test-build routing seam and real controller/render/loader owners. Action latency uses real keyboard focus/Enter and ends at recorded POST_RENDER; observed input-release/poll latency is separately retained. Actual Contract launch additionally uses real touch/pointer without panel warmup, records its ordinary generated run seed, and measures prepared active GameScene. Warm Home is a fixed 1.5-second idle sampling window, not a 1.5-second navigation latency. Light/heavy frame quantiles are per-cohort nearest-rank values; the table reports the median of those quantiles, sample/count sums and maximum observed frame, not invented pooled percentiles.

Raw Phaser loop cadence and smoothed simulation delta are reported separately. Headless scheduling, rendering/GPU costs outside measured spans and diagnostic overhead limit any FPS conclusion. Bounded worst is the maximum seen in these windows, not an asserted universal upper bound. Timing near the clock resolution is not a precise microbenchmark. Three repeats characterize ranges; they do not establish statistical equivalence for every action or certify subjective responsiveness.

Compared with the archived initial capture, the current runner exercises actual Pistol → SMG → Pistol rather than an already-selected build. It applies that same strengthened fixture to both served revisions. Old and new action timings are not stitched together. #211–#213 also changed actor/camera/HUD presentation between the original and final runtime, so overall frame changes cannot all be credited to #209. The closure patch itself changes failed-load publication behavior; no normal-path timing gain is claimed for that fix.

## Findings and disposition

Repeated actual Contract launch improves from 2,113.6 → 849.1 ms desktop, 4,555.8 → 1,100.7 ms throttled phone and 7,022.9 → 1,480.1 ms throttled foldable (medians). Full launch rebuild count is exactly 66 → 1 in all nine fresh launches per side. Desktop Equipment selection is 231.9 → 185.0 ms and Gunsmith occupied replacement 221.9 → 138.0 ms; corresponding created/destroyed counts are 117/95 → 41/19 and 110/110 → 86/86. Loadout cold entry drops five full rebuilds to two plus two mounted zero-churn hydrations. Equipment equip/fabricate and blueprint selection still reconstruct their broader inventory/status tree; changed row membership/actions/equipped Set presentation invalidate the retained-prefix fast path. Their counts/timings are reported, not presented as optimized selection.

Cold Home improves modestly (desktop 1,090.2 → 1,049.8 ms); warm Home stays 52 objects/23 textures and zero action churn. Boot entries fall 27 → 10 and Home audio 21 → 4 while total packaged audio remains unchanged. Application JS is 28,522 raw/7,004 gzip bytes larger than original main; Phaser/CSS remain identical. No claim that every action is faster: warm Home return is about2 ms slower on desktop, some equip/result samples are slower, and frame CPU/p99 tails are mixed. Supplementary phone repeats return light raw p95 to approximately 33.4 ms on both sides, characterizing the primary 49.9 ms candidate tail without discarding it. There is no persistent #209-owned combat regression reproduced; universal/device responsiveness remains unproven.

The measured owning bottleneck was Menu reconstruction during run-resource completion, followed by full Equipment/Gunsmith mutation trees. The merged incremental owners remove proven churn. Boot remains mixed: only Menu audio is required, visual loading can finish later, and font readiness remains correct. A smaller audio closure is useful without claiming audio was the dominant startup bottleneck. There is no profile-based justification for an additional audio codec, code-splitting, pooling/worker framework or broad scene extraction.

Three complex surfaces have explicit mount/dispose ownership; shared navigation, focus, scroll, resource queue and lifecycle remain in MenuScene. Remaining static panels still render there. Shared chrome/backdrop hydration can require a bounded tree rebuild because previously missing frames/nine-slices/sprite membership change; it is not asserted to be zero reconstruction or universal mounted hydration. Equipment selection and Gunsmith build/part changes retain unrelated shell objects. This is the stop-condition-sized ownership result, not a claim that all panels were extracted.

Real-device/browser play acceptance remains required: record the device/browser/build, cold and warm Home, Equipment selection/equip/fabrication, Gunsmith build/replacement, Contract launch, light/heavy play, pause/resume, background/return and orientation/resize. Compare practical responsiveness and note any failure/slow area honestly. Emulated browser profiles and smoke tests cannot provide that verdict. Product/art gates on #193/#197/#198/#199/#175/#165 remain with their owning issues.

The [#218 future integration inventory](../../../../architecture/issue-209-future-mobile-integration.md) already records asynchronous native durability, suspend/resume/context recreation, background audio/focus, safe areas/system bars, orientation/fullscreen, achievement mirrors, optional haptics and offline/store packaging. Those are explicit later integration decisions. It correctly records the known #201 stale-context achievement acknowledgement risk; this tranche leaves it untouched. It must be repaired before an actual native lifecycle consumer can recreate contexts.

Recommend **KEEP #209 OPEN until its actual-device check is supplied**; treat this as the bounded machine closure candidate after exact-head gates. Do not add architecture merely to extract the remaining static panels. Once device acceptance is recorded, recommend closure within these stated limits. Next bounded engineering tranche: the already reproduced #201 delayed achievement acknowledgement from an old GameContext overwriting a newer context's durable state, before any Android/iOS shell work.

## Reproduction and acceptance evidence

Raw compressed JSON/logs are indexed by [evidence-manifest.json](evidence-manifest.json) with raw and archive SHA256 hashes. `summarize.py` accepts either the capture directory or these gzip archives:

```bash
python3 docs/implementation/performance/issue-209/closure-audit/summarize.py \
  docs/implementation/performance/issue-209/closure-audit /tmp/meow209-summary
```

For a full repeat, create clean worktrees at EF8 and 039534f, use repository-pinned Node 22 dependencies, and run the portable supervisor (reserved preview ports 4269/4270):

```bash
python3 docs/implementation/performance/issue-209/closure-audit/capture.py \
  --baseline-repo /absolute/path/to/ef8-worktree \
  --candidate-repo /absolute/path/to/039534f-worktree \
  --out /tmp/meow209-repeat
```

The supervisor asserts both source/build identities, runs ordinary candidate inventory before diagnostic builds, counterbalances the repeated cohorts, retains raw results, verifies action counts/errors, and closes only its own previews. The supplementary variance capture uses the same runner and 27-action sequence, repeated for phone only. No wall-clock threshold or CI mechanism is changed.

Validation ownership: the exact runtime commit has green [hosted CI 37215039542](https://github.com/Joncallim/Meowcenary/actions/runs/37215039542). The final report commit additionally requires the complete local suite, ordinary diagnostics/resource identity smoke, full supported browser matrix, diff checks and exact-head hosted CI. Those final identities/results live in PR #222 checks and the issue closeout comment so adding a test-result note does not create an endless new-head validation cycle. An independent orthogonal review found no further material defect in the final runtime patch. Related product/visual issues and the conditional #201 risk remain open.
