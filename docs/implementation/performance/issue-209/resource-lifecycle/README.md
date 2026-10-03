# Issue #209 — Slice B resource lifecycle and run preparation

Fresh control: **34e922e2db04108f52e17d4ec6a59702fddfa19c** (current main before this slice). Measured candidate: **3994d81ac4fcbad97a4173aa0aa1b0f9b5bcc72d**. Later report-only commits preserve this runtime. This is a follow-up to [Phase A](../README.md), not a replacement for its historical baseline.

## Findings and scope

1. **Run preparation was repeatedly destroying/rebuilding Menu for texture progress.** All nine fresh actual Contract launches went from 66 rebuilds / 3,630 created objects to one rebuild / 55 created objects. Prepared Training went from 62 / 3,410 to one / 55. The same required visual closure remains; progress now updates its existing text object. This is the largest proven improvement.
2. **Run-only audio was unnecessarily in Home boot.** Manifest-owned lifecycle now requests four menu files instead of 21; 112,108 raw bytes move to optional run preparation. This reduces cold ownership, but cold Home latency is essentially unchanged in these trials. Audio was not proven to dominate boot.
3. **Equipment/Gunsmith ordinary actions still reconstruct their surfaces.** This slice deliberately leaves their semantics and ownership alone. Some candidate Gunsmith timings are higher; three trials do not establish their cause. No across-the-board responsiveness or combat improvement is claimed. These flows remain targets for measured surface extraction/incremental updates.

## Method and limitations

Linux x64 7.0.0-31-generic, Ryzen 7 7735HS, 16 logical CPUs, Node 22.23.2, Chromium 153.0.8010.12, local Vite preview with unthrottled network. GPU backend unverified. Desktop 1280×720/DPR1/CPU1; touch phone 390×844/DPR3/CPU4; touch foldable 1114×720/DPR2/CPU4. These are emulations, not physical devices.

Three independent fresh-context repetitions per profile and side; 26 checkpoints each (234 per side). Existing route seam navigates to real controllers/render/load paths; representative Equipment/Gunsmith actions use keyboard and assert persisted results. Training seeds 209001/209002 and light/heavy fixtures 209101/209102 retain normal systems, 48 injected heavy enemies, and 60-second fixture invulnerability. Separate nine-per-side actual Contract launches use real touch/pointer, no panel warmup, and the same Phase-A save fixture. Recorded Contract seed is [157550279].

Latency ends at recorded usable POST_RENDER; raw archives also retain polling/input-release observed duration. Combat nearest-rank distributions use bounded 600-frame windows and 16.667ms budget. The table uses medians of per-run percentiles, not pooled percentiles. Main-suite heavy windows are 10 seconds on desktop/phone; matched foldable windows are five seconds. This is a bounded workload, not a maximum-pressure soak or genuine playtest. Opt-in object walks/polling may perturb scheduling. No wall-clock timing becomes a CI threshold.

**Failed trials remain evidence.** Both initial ten-second sequences exited 1 in their first foldable heavy trial after six complete desktop/phone cohorts. The candidate failure artifact proves normal level-up pause (level 2, XP 0/7), not an audio/resource failure. Old main diagnostics lack pause reason, so the corresponding old failure cause is not established. The existing active-state assertion remains intact. Fresh five-second foldable trials characterize active combat before the chooser; all three per side pass. An additional successful ten-second control follow-up is archived for context but is not substituted into the matched comparison. No failed or paused window is presented as a completed active measurement.

## Repeated latency evidence

Milliseconds: median [minimum–maximum], three trials in each cell. Each pair is control → candidate.

| Journey | Desktop | Phone | Foldable |
|---|---:|---:|---:|
| cold-usable-home | 1010 [996–1061] → 1003 [961–1040] | 1669 [1623–1836] → 1612 [1574–1637] | 1976 [1973–2051] → 1988 [1982–1989] |
| home-contract | 55 [53–58] → 53 [51–54] | 133 [129–137] → 136 [127–187] | 211 [204–223] → 228 [194–243] |
| home-mercenary | 453 [445–485] → 465 [460–482] | 595 [591–645] → 594 [592–754] | 903 [868–910] → 923 [908–992] |
| home-career | 9 [9–9] → 9 [8–9] | 31 [30–33] → 33 [31–42] | 37 [35–40] → 38 [36–44] |
| loadout-entry | 1362 [1208–1401] → 1316 [1296–1384] | 1269 [1193–1278] → 1225 [1224–1328] | 1834 [1810–1857] → 1884 [1850–1888] |
| equipment-entry | 45 [44–47] → 44 [43–46] | 139 [134–141] → 139 [133–140] | 239 [215–240] → 208 [201–215] |
| equipment-select | 245 [211–268] → 221 [215–234] | 304 [290–314] → 283 [278–316] | 436 [419–458] → 430 [428–430] |
| equipment-equip | 208 [196–231] → 210 [198–236] | 258 [248–261] → 254 [254–303] | 396 [392–442] → 412 [386–434] |
| equipment-blueprint-select | 205 [198–219] → 210 [203–211] | 205 [200–228] → 214 [199–215] | 356 [343–357] → 359 [352–363] |
| equipment-fabricate | 212 [209–212] → 220 [218–222] | 257 [247–302] → 264 [261–268] | 420 [402–452] → 422 [412–447] |
| gunsmith-entry | 106 [84–112] → 98 [91–99] | 259 [248–260] → 300 [250–302] | 355 [343–374] → 393 [362–414] |
| gunsmith-build-select | 212 [203–216] → 222 [214–224] | 294 [291–343] → 295 [295–308] | 488 [469–502] → 503 [468–508] |
| gunsmith-part-replace | 214 [211–218] → 218 [217–239] | 294 [289–298] → 296 [289–302] | 494 [472–502] → 519 [511–522] |
| warm-equipment-entry | 63 [60–63] → 65 [64–66] | 190 [169–198] → 182 [177–204] | 256 [252–263] → 252 [245–261] |
| warm-gunsmith-entry | 80 [78–82] → 86 [82–108] | 216 [207–225] → 220 [209–266] | 340 [334–345] → 344 [331–388] |
| warm-home-return | 14 [13–14] → 15 [15–19] | 41 [40–43] → 43 [41–48] | 58 [56–79] → 57 [55–57] |
| menu-prepared-game | 1757 [1662–1760] → 827 [795–838] | 3721 [3557–3862] → 976 [933–1029] | 5491 [5448–5590] → 1284 [1198–1303] |
| pause | 70 [69–75] → 68 [65–70] | 59 [58–62] → 59 [58–60] | 96 [94–101] → 94 [90–100] |
| resume | 82 [73–89] → 82 [81–86] | 51 [50–64] → 51 [50–52] | 88 [86–89] → 94 [91–119] |
| resize-orientation-return | 669 [500–698] → 685 [655–702] | 593 [579–601] → 594 [582–608] | 712 [664–728] → 721 [677–726] |
| run-result-menu | 240 [237–265] → 238 [228–244] | 214 [203–218] → 205 [199–222] | 323 [311–365] → 319 [314–330] |
| warm-menu-prepared-game | 116 [112–129] → 101 [100–103] | 249 [224–260] → 195 [181–195] | 284 [264–310] → 271 [237–277] |
| warm-run-result-menu | 243 [242–251] → 248 [245–268] | 200 [198–226] → 206 [198–219] | 326 [324–344] → 341 [334–366] |
| Actual fresh Contract | 1930 [1892–1966] → 841 [834–873] | 4518 [4372–4977] → 1053 [1032–1097] | 6732 [6645–7048] → 1516 [1449–1571] |

Warm idle Home is a 1.5-second observation, not an action-latency benchmark: it performs zero rebuilds. Stable Home has 52 display objects / 23 textures on both sides; warm panel-return Home has 52 / 33 and post-run Home 52 / 93. These counts include transient text textures and therefore differ by surface. Equipment selection still creates 117 objects and Gunsmith replacement 110 in a complete rebuild. Full owner distributions, resource counts, heap/pool facts and state snapshots remain in raw archives.

## Combat cadence

Values are control → candidate. Counts are summed across three windows; all percentages refer to the 16.667ms cadence budget, not measured system CPU duration. Headless cadence substantially exceeds measured owner CPU spans, so these results do not prove a gameplay bottleneck. No gameplay optimization was performed.

| Profile/scenario | Samples | p50 ms | p95 ms | p99 ms | Median bounded worst ms | Over budget count/ratio |
|---|---:|---:|---:|---:|---:|---:|
| desktop-1280x720/light-combat | 487 → 483 | 66.6 → 66.6 | 66.7 → 66.8 | 66.8 → 83.4 | 83.3 → 83.4 | 487/487 (100.0%) → 483/483 (100.0%) |
| desktop-1280x720/heavy-combat | 459 → 445 | 66.7 → 66.7 | 83.3 → 83.4 | 83.4 → 83.4 | 83.4 → 83.4 | 459/459 (100.0%) → 445/445 (100.0%) |
| phone-390x844-dpr3/light-combat | 925 → 942 | 33.3 → 33.3 | 49.9 → 33.4 | 50.0 → 50.0 | 50.1 → 50.1 | 885/925 (95.7%) → 899/942 (95.4%) |
| phone-390x844-dpr3/heavy-combat | 836 → 834 | 33.3 → 33.3 | 50.0 → 50.0 | 50.1 → 50.1 | 66.7 → 66.8 | 824/836 (98.6%) → 825/834 (98.9%) |
| foldable-1114x720-dpr2/light-combat | 231 → 233 | 66.7 → 66.7 | 83.3 → 83.3 | 100.0 → 83.4 | 100.0 → 83.4 | 231/231 (100.0%) → 233/233 (100.0%) |
| foldable-1114x720-dpr2/heavy-combat | 216 → 214 | 66.7 → 66.7 | 83.4 → 83.4 | 116.7 → 100.0 | 116.7 → 100.0 | 216/216 (100.0%) → 214/214 (100.0%) |

## Resource/build ownership

| Boundary | Result |
|---|---|
| boot/core visuals | Same six physical resources / ten files, 931,073 raw bytes; logical art remains separate from resources |
| menu-common audio | Three UI SFX + menu music; four files / 68,976 raw bytes |
| panel-specific visuals | Existing data-driven lazy closures, physical dedup, serialized loader and generation guards preserved |
| run-common audio | Sixteen combat/weapon/result SFX + run music; 17 files / 112,108 raw bytes; awaited optional closure before GameScene |
| run/content visuals | Same authored run closure; no global preload or content-ID switch added |

Failed optional audio permits silent gameplay and retries only the missing key on a later launch. Phaser default two retries are tested through all three failing requests. NoAudio/cache paths, shutdown/destroy, resize during load and late completions are covered. `resource.audio.requested` records uncached manifest attempts, not HTTP wire count; NoAudio may skip queueing. Browser tests independently inspect HTTP requests. One game-scoped AudioManager, autoplay/unlock behavior and scene transitions remain unchanged.

Total WAV package remains 181,084 bytes; format conversion is unjustified here. Four-weight Nunito readiness is retained. Physical visuals 96, logical art 619, distinct visual URLs 112 and dist files 226 remain unchanged. Inventories include every font, data/atlas, panel and run resource plus raw/gzip/Brotli estimates. Compression is offline zlib estimation, not an assertion about CDN transfer.

| Ordinary build bytes | Control raw / gzip / Brotli | Candidate raw / gzip / Brotli |
|---|---:|---:|
| Application JS | 800,931 / 180,811 / 147,358 | 803,580 / 181,436 / 147,887 |
| Phaser | 1,208,050 / 330,419 / 264,694 | Same |
| CSS | 1,273 / 587 / 458 | Same |

Application JS grows 2,649 raw bytes; this is not a bundle-size optimization. Measurement builds opt into diagnostics; these size inventories are ordinary production builds with diagnostic seams absent.

## Reproduction and acceptance evidence

At each pinned runtime, install the locked dependencies, build `VITE_VISUAL_TEST=1 npm run build`, and run `npm run preview -- --host 127.0.0.1 --port <port>`. Keep other heavy suites idle. Run:

```sh
node scripts/performance-baseline.mjs --url http://127.0.0.1:<port> --out <output> --repeats 3
node scripts/performance-baseline.mjs --url http://127.0.0.1:<port> --out <fold-output> --repeats 3 --profile foldable-1114x720-dpr2 --window-ms 5000
node scripts/performance-contract-baseline.mjs --url http://127.0.0.1:<port> --out <contract-output> --baseline <decompressed-Phase-A-baseline-raw.json> --expected-sha <runtime-sha>
```

The first command retains the reported foldable ten-second failure. The control runtime uses the same diagnostic runner (with expected-SHA/provenance/failure-retention updates) copied untracked from candidate; served game sources remain exact main. Historical `baselineSHA` metadata in the reused Phase-A runner names the original Phase-A baseline; this comparison uses `measurementSHA`/`sourceHEAD` as specified above.

Archives use deterministic gzip. `summary.json` contains repeated values and frame statistics. Initial/short/follow-up/Contract raw files preserve successful and failed trials separately. `candidate-failed-heavy.png` shows the normal upgrade chooser. `progress/` has all six original loading-panel captures, independently inspected for bounds/readability; capture build e41a561154afeb5cff3008bf5a0231f64c8b6c87 differs from measured 3994d81 only in the retry fixture. These are technical evidence, not approved art authority.

RED evidence (`red.log.gz`): old Boot queues 21 instead of four; cached launch rebuilds twice instead of once. Focused gates pass 312 tests across seven files; the new real-browser resource tests pass all 12 cases across six established profiles. Final exact-head full local/hosted results and deployed SHA are recorded on the implementation PR and #209 after the report commit. No goldens, thresholds, timeouts, assertions or skips were weakened.

## Remaining work and recommended next slice

#209 stays open. Next: recheck main/open PRs, then Slice C extracts explicit Menu surface ownership with behavior parity; Slice D targets the still-measured Equipment/Gunsmith rebuilds. No active structural Menu PR was found; #208 is an independent draft art handoff and remains untouched. Combat optimization is unsupported by these measurements. Narrow native seams/documentation and actual-device responsiveness remain future work, including explicit native persistence migration, suspend/resume/background audio, existing achievements as mirrors, safe areas/status/navigation bars, orientation/fullscreen, optional haptics, offline packaging and stores. No Capacitor/framework/mobile-app work is included. #193/#197/#198/#199/#201/#175 and all human art/play gates retain their authority. No new P0/P1 game defect was established by the normal level-up measurement pause.
