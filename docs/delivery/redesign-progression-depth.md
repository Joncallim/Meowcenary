# #235 progression candidate delivery

Status: implemented and focused-tested; **not accepted**. Related #235. Baseline `a100e053`.

## Implemented

30 active achievements, preserving all ten existing definitions and rewards. New goals cover mastery across the roster, campaign exploration, distinct timed clears, simultaneous engineered families, effective hybrid traits, and upgraded equipment. Four registered derived metrics read existing facts; no save fields or duplicate counters. Workshop actions and milestone rewards share one durable candidate. Unlock permissions, fabrication, and owned-instance rewards now have separate copy.

Architecture and sourced product rationale: [redesign-progression-depth.md](../architecture/redesign-progression-depth.md).

## Checks and evidence

- TypeScript lint: PASS.
- Production build: PASS.
- Ten focused suites: 183 tests PASS, including nine new depth/persistence tests.
- Achievement art suite: four checks PASS; byte-for-byte builder parity fails locally. Coordinator reproduced the same unchanged-baseline failure with pinned Pillow 12.1.1; sampled pixel comparison was identical while local PNG compression differs. No production art is modified here.
- `content:validate`: logical bindings/resources pass; existing weapon PNG builder parity blocks the art-dependent tail in the same local environment.
- Existing aggregate content validation and second data-only engineering fixture: PASS in focused tests.
- Actual Chromium at 390×844 and 1280×720: achievement gallery, Equipment and Gunsmith captured with no page errors. Keyboard spatial navigation reaches Full Workshop and blueprint detail; desktop Enter and emulated phone touch select them. New goal/reward copy is visible. Acquisition copy was moved inside the equipment inspection card after capture showed desktop focus scrolling a preceding paragraph out of view.
- Local screenshots and diagnostics are under `output/playwright/`: `phone/desktop-workshop-goal.png`, `phone/desktop-equipment-route.png`, `phone/desktop-parts.png`, plus initial surface captures. These are local verification artifacts, not new runtime assets.

The CLI wrapper could not fetch its package in the network-restricted sandbox; the installed Playwright SDK and already cached Chromium executable provided the actual browser check. Preview used local loopback port 4176.

## Independent review

Read-only adversarial review found four P2 defects in the first candidate: skipped upgrade evaluation, stale simultaneous-loadout progress, blueprint source text omitted, and delayed platform mirror dispatch. All four were fixed; the new tests cover current-progress truth, atomic fourth-T4 upgrade with failed save/retry/reload, and mirror-after-persistence behavior. The copy mismatch between ordinary parts and trait cores was resolved by explicitly naming non-trait parts; distinct effective traits have separate goals using the combat resolver.

## Remaining acceptance gates

Fresh independent product-quality review; integrated optional post-Warden Contract goals; exact draft-head hosted CI/full closeout; physical phone/controller and reconnect evidence; sustained-play evaluation of speed thresholds and mastery/reward pacing. Browser viewport emulation and correctness tests do not establish that the candidate is fun. No merge or deployment is authorized by this record.
