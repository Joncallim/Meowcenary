# Issue #209 Phase A: pinned performance baseline

Baseline main: **26f46fb5398c7eb769fe1bffa5ed60f80f20eea5**.
Measured observability candidate: **ef8d90cfca226c5595598fb74b3f699d0feb3caa**.
Measured on 1 October 2026. This tranche adds opt-in evidence, not an optimization.
The final evidence commit adds this report, archives, a matched control runner and
assertions checking that input actually caused the measured presentation. Its
runtime implementation is the measured ef8d90c implementation.

## Findings and next slice

1. **Menu reconstruction is the strongest proven owning bottleneck.** Every primary cold
   run preparation caused 62 same-panel rebuilds and 3,410 new display objects:
   the initial modal/progress presentation followed by 60 physical resource
   completion updates. The actual Contract supplement reproduces 66 rebuilds /
   3,630 objects from fresh Home (see separate table). The primary closure contains 65 physical resources, five cached
   and 60 requested (61 HTTP files because an atlas has image and JSON).
   Total measured Menu render CPU was 687–745 ms on desktop, 2,206–2,344 ms on the
   throttled phone, and 2,892–3,180 ms on the throttled foldable. This work shares
   the loader/main thread; it is not an independent network cost. Cached launch
   requested no resources and rebuilt twice. A resource count does not justify
   a full Menu reconstruction for every completed file.
2. **Panel-local mutations also rebuild their full trees.** Equipment selection
   creates/replaces 117 objects; Gunsmith replacement creates/replaces 110.
   Equipment render CPU ranges were 72–85 / 206–258 / 295–324 ms for desktop /
   phone / foldable; Gunsmith replacement ranges were 85–89 / 227–281 / 340–362
   ms. `menu.render` includes lazy model evaluation and Phaser construction.
   This identifies the owning boundary, but does not prove that Text creation
   alone, rather than derivation or other presentation work, owns that cost.
3. **Startup is mixed, with visuals finishing after audio.** The four-weight font
   barrier medians were 11 / 46 / 50 ms. Audio completion medians were 59 / 155 /
   164 ms; visual completion medians were 94 / 262 / 277 ms. Audio finished before
   visuals in all nine cohorts. All 21 audio files total only 181,084 raw bytes;
   changing WAV format is not justified by this baseline alone. Cold Home also
   includes application/Phaser download, parsing and initial presentation;
   those costs have not been isolated into a browser CPU trace.
4. **Combat cadence is slow in this environment, but simulation CPU is not a
   sufficient explanation.** Raw p95 cadence is 33–83 ms while the measured
   PRE_STEP-to-POST_RENDER CPU span p95 is 3–13 ms. Spawning (including enemy
   updates), HUD and weapons are the largest measured heavy-combat owners.
   GPU execution, renderer cost outside the listener span, scheduling and
   machine/browser conditions remain unproven. This does not establish physical
   phone performance or justify a pooling/worker rewrite.

Overall, the evidence is **mixed startup and Menu work**, with repeated Menu
reconstruction the clearest actionable cause. File length is not evidence of
runtime cost. Warm idle Home performs no rebuilds. Audio and font readiness were
not the dominant observed boot barriers and should retain their correctness.

Recommended next tranche is a bounded **Slice B resource/run-preparation
lifecycle** change: separate run-only audio from usable Home using existing
bundles, preserve serialized/deduplicated loading, and prevent resource progress
from reconstructing unrelated Menu presentation. Compare the same scenarios
before claiming an improvement. Then establish surface ownership with parity
before incremental Equipment/Gunsmith updates. Do not begin broad extraction or
combat optimization from this report alone.

PR #206 is merged into the pinned main. At report time the only open PR is draft
#208 (upgrade-art handoff), not competing Menu runtime structure. Recheck this
before any subsequent Menu extraction. #193/#197/#198/#199/#201/#175 retain their
semantics and acceptance authority. #209 remains open: ownership improvements,
resource separation, native-boundary documentation and actual-device acceptance
are later work.

## Environment and method

Linux x64, kernel 7.0.0-31-generic, AMD Ryzen 7 7735HS, 16 logical CPUs, 30.7 GB
reported memory; Node 22.23.2, Chromium 153.0.8010.12 headless, Phaser 3.90.
Local Vite production preview with unthrottled network. GPU backend was not
verified. An early raw-method label says “virtual renderer”; that label is not a
verified hardware finding and is superseded by this qualification.

Three repetitions each of desktop 1280×720/DPR1/CPU1×, phone 390×844/DPR3/touch/
CPU4× and foldable 1114×720/DPR2/touch/CPU4×: **nine cohorts, 234 checkpoints,
zero recorded browser errors**. Heavy builds/tests were not run concurrently.
CPU throttling is an emulation parameter, not a calibrated Android/iOS device.
Cold contexts have fresh HTTP caches, but share a browser process; process/GPU
warming and local filesystem caching are not eliminated.

The fixture starts with a V4 save, 640 Scrap, 31 T1 Equipment instances and a
Pistol build with a heavy T2 receiver and stored compact T1 receiver. Real
keyboard actions select/equip Recon Helmet, select/fabricate Scavenger Helmet
and replace the receiver. Durable assertions verify the resulting loadout,
32 owned pieces and fitted compact receiver. The fixture and fabrication cost
 imply 540 remaining Scrap, but the archived runner did not assert that balance. Build selection
re-selects the existing Pistol build; it is not a different-family switch.
All **54 native input actions** caused exactly one current render, with matching
POST_RENDER revision. Navigation uses the existing test route seam, including
real controller/render/resource behavior, and excludes navigation input dispatch.

Run launch uses the real prepared Training path with seeds 209001/209002.
Light/heavy fixture seeds are 209101/209102, adding zero/48 ordinary enemies
through the real spawning owner, once per run, and granting explicitly recorded
60-second invulnerability. Heavy density changes during play; 48 is the injected
count, not a sustained enemy-count assertion. Pools and active/allocated counts
are in the raw evidence. Both windows are ten seconds with active status at
checkpoint; this is not maximum-pressure or long-duration soak acceptance.
Pause/resume uses Escape. Result return uses the existing terminal-presentation
fixture and actual keyboard navigation, not a test of durable reward settlement.
Orientation return includes 200 ms in rotated geometry and 200 ms after restore;
its duration is an upper bound including deliberate dwell.

Primary action latency ends at the recorded POST_RENDER showing the settled
Menu revision or active prepared run. Observer/poll/input-release latency is
retained separately as `observedDurationMs`. Warm Home is a 1.5-second idle window,
not a navigation latency. “Settled” uses the existing resource/read-model closure.
Presentation stamps are last-presented facts; read them with active-scene state.
The runner resets telemetry before actions to avoid stale stamps.

Frame distributions use nearest-rank percentiles in bounded 600-sample windows,
with a 16.667 ms budget. The raw browser-loop cadence and Phaser's smoothed
simulation delta are labelled separately. Worst means worst retained sample,
not lifetime maximum. Meaningful owner totals are aggregated once per frame;
per-frame recording neither sorts nor emits events. Detailed snapshots are
explicit diagnostic reads. Owner distributions are not additive percentiles.

CPU spans are listener-to-listener measurements, not exhaustive CPU profiles:
Phaser BaseSoundManager's earlier PRE_STEP callback and later POST_RENDER handlers are
outside the measured frame span; renderer preRender is outside `frame.render`.
GPU completion is not measured. System owner groupings include enemies in
spawning, abilities in player, rewards in drops and defeat presentation in
feedback. Unmapped work is not silently attributed to one owner.

Menu object counts walk nested identity sets before/after an action; they count
net created/destroyed display objects, not temporary objects created and
removed inside the action. Walks are excluded from the recorded render duration
but may perturb scheduling. Snapshot wrapper time excludes lazy Equipment/
Gunsmith getter evaluation; render timing includes their use. Texture count is
Phaser texture-manager keys, including generated Text textures; it is not the
logical-art count or a byte-accurate GPU memory measurement. CDP heap metrics
are archived where available and are not portable native-memory assertions.

## Repeated journey results

Milliseconds, median [minimum–maximum] of three runs. These are characterization
results, not CI thresholds. Full observations are in `summary.json` and the raw
archive. The longer primary keyboard timings include processing that input edge;
matched route controls below are a different measurement and cannot replace them.

| Checkpoint | Desktop | Phone 4× | Foldable 4× |
|---|---:|---:|---:|
| cold-usable-home | 1106 [985–1156] | 1728 [1697–1807] | 2043 [2026–2095] |
| home-contract | 57 [55–76] | 131 [130–133] | 206 [202–250] |
| home-mercenary | 468 [464–480] | 616 [595–642] | 896 [886–904] |
| home-career | 9 [8–9] | 31 [30–32] | 38 [36–38] |
| loadout-entry | 1271 [1218–1276] | 1239 [1220–1447] | 1893 [1846–1932] |
| equipment-entry | 45 [42–48] | 135 [128–137] | 236 [183–242] |
| equipment-select | 252 [218–255] | 294 [278–328] | 467 [465–480] |
| equipment-equip | 206 [199–252] | 281 [256–294] | 406 [402–407] |
| equipment-blueprint-select | 198 [196–225] | 236 [219–242] | 367 [361–383] |
| equipment-fabricate | 215 [207–259] | 263 [254–387] | 419 [412–451] |
| gunsmith-entry | 88 [86–102] | 279 [257–318] | 364 [362–374] |
| gunsmith-build-select | 219 [203–255] | 328 [292–428] | 519 [512–602] |
| gunsmith-part-replace | 219 [219–234] | 312 [301–357] | 501 [475–509] |
| warm-equipment-entry | 67 [66–80] | 182 [170–214] | 284 [263–288] |
| warm-gunsmith-entry | 80 [79–87] | 220 [210–237] | 344 [339–352] |
| warm-home-return | 14 [14–16] | 44 [41–46] | 58 [56–62] |
| menu-prepared-game | 1771 [1700–1877] | 3610 [3604–3728] | 5487 [5344–5852] |
| pause | 71 [67–80] | 67 [60–72] | 96 [90–108] |
| resume | 80 [78–86] | 50 [48–61] | 96 [91–108] |
| resize-orientation-return | 688 [663–698] | 572 [557–588] | 673 [670–697] |
| run-result-menu | 236 [233–250] | 201 [200–230] | 351 [331–389] |
| warm-menu-prepared-game | 109 [108–122] | 240 [224–251] | 298 [263–313] |
| warm-run-result-menu | 249 [240–262] | 202 [199–202] | 370 [340–379] |

## Actual Contract launch supplement

Nine additional fresh contexts use the same initial save and real Home **Play
Contract** touch/pointer action, with no panel warmup or injected combat fixture.
All reached an active non-Training GameScene with zero console/page/request/HTTP
errors. Normal Menu RNG produced recorded seed **157550279** in all nine runs;
the runner did not override it. Each run requested 64 of 65 physical resources,
with one cached; initial/progress presentation plus 64 completions caused **66
Menu rebuilds and 3,630 created objects**. The same redundant progress ownership
is therefore reproduced on the actual Contract path.

Milliseconds, median [range] of three runs:

| Profile | Presented usable Contract | Total Menu render CPU range |
|---|---:|---:|
| desktop-1280x720 | 2040 [1988–2108] | 879–938 |
| phone-390x844-dpr3 | 4708 [4604–4732] | 2977–3086 |
| foldable-1114x720-dpr2 | 7151 [7134–7345] | 3978–4173 |

Do not interpret the difference from primary Training timings as isolated
Contract overhead: the primary launches follow Equipment mutations, receiver
replacement and warm panel navigation. Contract also has different encounter
resources, composed stage/objective/difficulty setup and settlement ownership.
This supplement measures launch, not Contract completion or persistent rewards.

## Combat distributions

Per-run percentile medians (ms), sample counts and over-budget counts summed
across three ten-second windows. This does not pool samples into a new
percentile. Individual values, smoothed gameplay frames and owner distributions
remain in the archive.

| Profile/scenario | Samples | p50 | p95 | p99 | Bounded worst median | Over budget |
|---|---:|---:|---:|---:|---:|---:|
| desktop-1280x720/light-combat | 495 | 66.6 | 66.7 | 66.8 | 83.3 | 495/495 (100.0%) |
| desktop-1280x720/heavy-combat | 461 | 66.7 | 83.3 | 83.4 | 83.4 | 461/461 (100.0%) |
| phone-390x844-dpr3/light-combat | 962 | 33.3 | 33.4 | 50.0 | 50.1 | 906/962 (94.2%) |
| phone-390x844-dpr3/heavy-combat | 839 | 33.3 | 50.0 | 50.1 | 66.6 | 831/839 (99.0%) |
| foldable-1114x720-dpr2/light-combat | 450 | 66.7 | 83.4 | 83.4 | 100.0 | 450/450 (100.0%) |
| foldable-1114x720-dpr2/heavy-combat | 407 | 66.7 | 83.4 | 100.1 | 116.7 | 407/407 (100.0%) |

Measured frame CPU p95 medians for light/heavy: desktop 2.6/3.3 ms, phone
8.4/10.3 ms, foldable 10.7/13.4 ms. Foldable heavy owner p95 medians: spawning
3.3 ms, HUD 1.8 ms, weapons 1.0 ms, input 0.8 ms, player 0.4 ms; remaining
owners at most 0.1 ms. This is meaningful attribution without proving the source
of the much larger raw cadence gaps.

## Object/resource and production-build baseline

Stable Home has 52 objects and 23 textures before other panels, 33 textures after
warm panel navigation, and 93 after run return; the second return also has 93.
These are cached-resource supersets, not evidence of a texture leak. Loadout
entry rebuilds five times; cold Home three; idle warm Home zero. Both combat
runs have 92 texture keys. Detailed object/pool counts are archived at each
checkpoint; no textures were evicted in this tranche.

| Production output | Baseline raw / gzip9 / Brotli11 bytes | Observability candidate raw / gzip9 / Brotli11 bytes |
|---|---:|---:|
| Application JS | 792,987 / 178,679 / 145,656 | 796,386 / 179,545 / 146,326 |
| Phaser chunk | 1,208,050 / 330,419 / 264,694 | unchanged |
| CSS | 1,273 / 587 / 458 | unchanged |

Application raw output grows 3,399 bytes (0.43%); this is diagnostic capability,
not a package-size optimization. The ordinary production bundle contains no
performance global, visual-test global or fixture API. Opt-in profiling requires
both a development/test build and `?perf-test=1`; it cannot be activated in the
ordinary deployed game by a query string. Existing cheap PerfSampler behavior
is preserved for ordinary gameplay.

The baseline build has 226 files, 10,411,457 total raw bytes, 8,485,657 summed
per-file gzip9 bytes and 8,377,044 summed Brotli11 bytes. Compressed figures are
**offline estimates, not actual hosted transfer encoding**. Resource timing
transfer/encoded/decoded sizes from the local preview are archived separately.
Baseline manifests bind 619 logical art IDs to 96 physical visual resource IDs
and 112 distinct HTTP asset URLs; candidate counts and asset bytes are unchanged.

Boot queues six physical visual resources (ten HTTP files, 931,073 raw bytes)
plus 19 SFX and two music files (181,084 raw bytes). Thus 27 Phaser physical load
entries/31 asset files precede Menu; four Nunito readiness requests share a
39,152-byte WOFF2 font file. The WAV audit is 8 kHz mono 16-bit PCM, 11.26 seconds
in total. Preserve audio unlock, silent failure and one game-scoped owner.
Per-weight font timers start after creating the four requests; the whole barrier
is the authoritative startup wait. `baseline-resources.json` includes each
panel/run bundle closure and hashes, and the inventory runner calculates raw and
compressed sizes per physical file. Relevant gameplay data is bundled into
application JS, not measured as separate runtime JSON requests.

The inventory was captured from the baseline production output while source was
4d0419690e95bd6c979d74c10c28a10a1102af67 (sampler/test-only precursor).
Its build metadata is the pinned baseline. Manifests, assets and loader/Boot/Menu
source were reconciled as unchanged from baseline at that inventory step. Both
source and build SHA are retained rather than disguising the difference.

## Instrumentation control and limitations

An additional **18 contexts / three matched ON–OFF pairs per profile** use the
same instrumented build, fixture, warmed routes and readiness observer, with
counterbalanced order. These observed upper-bound route latencies include the
same observer for both groups and are not first-presented action timings.
Median OFF/ON milliseconds for Equipment and Gunsmith: desktop 43.4/47.6 and
85.9/88.1; phone 128.3/135.7 and 212.9/209.7; foldable 217.3/206.8 and
396.5/342.3. Repeated ranges generally overlap. This small control does not prove
zero instrumentation overhead or a speed improvement. CPU throttling, high DPR,
browser process warming and scheduling remain limitations. Actual physical
Android/iOS, controller performance timing, GPU tracing, fullscreen performance,
background audio and long-duration memory pressure are not characterized here.
Existing correctness coverage for input/lifecycle/persistence remains required.

## Evidence and reproduction

- `summary.json`: every journey, repeated ranges, object/texture/render counts,
  frame distributions and archive checksums.
- `baseline-raw.json.gz`: complete nine-cohort evidence, events, owners, seeds,
  save assertions, resource timings and CDP metrics; deterministic gzip metadata.
- `controls-raw.json.gz`: complete matched diagnostic ON/OFF observations.
- `contracts-raw.json.gz`: nine real Contract launches and recorded normal seeds.
- `candidate-resources.json.gz`: measured ordinary candidate build inventory.
- `baseline-resources.json`: production asset/bundle/audio/font inventory.
- `phone-home-mixed-input.png` and `foldable-heavy-combat.png`: direct browser
  diagnostic captures. These are evidence, **not approved visual authority or
  screenshot goldens**. All 18 original captures were inspected. The phone Home
  keyboard hint truncates at the right edge in all three phone cohorts; this
  existing P2 presentation finding belongs to #165/#201, not a Phase A redesign.

From this branch with locked dependencies and supported Node:

```sh
VITE_VISUAL_TEST=1 npm run build
npx vite preview --host 127.0.0.1 --port 4261 --strictPort
# In another terminal, in the same repository worktree:
node scripts/performance-baseline.mjs --url http://127.0.0.1:4261 --repeats 3 --window-ms 10000 --out /tmp/meow209-repeat
node scripts/performance-controls.mjs --url http://127.0.0.1:4261 --baseline /tmp/meow209-repeat/results.json --out /tmp/meow209-controls-repeat
node scripts/performance-contract-baseline.mjs --url http://127.0.0.1:4261 --baseline /tmp/meow209-repeat/results.json --out /tmp/meow209-contracts-repeat
```

The served `build-meta.json` SHA must match source HEAD, or an explicit
`--expected-sha` when deliberately measuring a previously pinned build. The
archives retain measured ef8d90c; running a later evidence-only commit produces
that commit's metadata even when runtime source is identical. Do not relabel old
results. For build inventories, build ordinary production in a checkout of the
pinned baseline first, then run `node scripts/performance-inventory.mjs --dist
/absolute/path/to/dist --out /tmp/resources.json`. The tool retains source SHA
and served-build SHA separately. Decode raw archives with `gzip -dc`.

No single-run wall-clock CI limits are introduced. New regressions assert bounded
sampling, owner/reset semantics, save-preserving reads, production opt-in gates,
resource ownership and stale lazy-load/navigation/resize behavior. Existing
art/source/export, allocation, resource and persistence assertions stay intact.

## Validation and remaining acceptance

At measured ef8d90c: lint/typecheck, 181 ordinary unit files / 2,799 tests,
all nine allocation tests, all nine test-runner selection probes, content
validation, complete art/source/export validation, production build and diff
checks passed. The probe runs select each self-audit explicitly; other rows
skipped inside each probe are not missing audit coverage.

The full six-project local browser matrix passed: **79 passed, 59 existing
scoped skips, zero failures** (138 cases), including all 12 new probe/race cases.
Exact-head hosted CI is recorded in the PR/issue after the final evidence commit
and must not be inferred from local results. A first local browser attempt ran zero tests because its temporary
configuration resolved preview from `/tmp`; the fix sets the repository working
directory explicitly, retaining the existing 60-second readiness limit.
No golden refresh, image threshold change, timeout increase or assertion removal
is part of this tranche.

Phase A establishes evidence; it does not satisfy #209's final performance or
architecture acceptance. No Menu surfaces were extracted, no save/domain rules
were moved, no native platform adapter was invented, no procedural maps or
visible Equipment feature were implemented. Future Android/iOS still needs
explicit persistence durability migration, lifecycle/background audio, existing
achievement-mirror integration, safe areas/status/navigation bars, orientation,
fullscreen, optional haptics, offline packaging and store decisions. Capacitor
is not installed. Product/device visual and responsiveness acceptance remains
human work after measured improvements land.

## Follow-up resource slice

[Slice B: fresh-main comparison, audio lifecycle and run preparation](resource-lifecycle/README.md) records the subsequent measured improvement and remaining surface/native work. This historical Phase-A baseline remains unchanged.
