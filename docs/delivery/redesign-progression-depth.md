# #235 progression candidate delivery

Status: implemented and focused-tested; **not accepted**. Related #235. Baseline `a100e053`.

## Implemented

27 active achievements, preserving all ten existing definitions and rewards. New goals cover mastery across the roster, campaign exploration, distinct timed clears, simultaneous engineered families, effective hybrid traits, and upgraded equipment. Four registered derived metrics read existing facts; no save fields or duplicate counters. Workshop actions and milestone rewards share one durable candidate. Unlock permissions, fabrication, and owned-instance rewards now have separate copy.

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

The CLI wrapper could not fetch its package in the network-restricted sandbox; the installed Playwright SDK and already cached Chromium executable provided the actual browser check. Initial preview used local loopback port 4176; final selected-source/lifecycle capture uses static preview port 4178 to avoid HMR triggered by evidence writes.

## Independent review

Read-only adversarial review found four P2 defects in the first candidate: skipped upgrade evaluation, stale simultaneous-loadout progress, blueprint source text omitted, and delayed platform mirror dispatch. All four were fixed; the new tests cover current-progress truth, atomic fourth-T4 upgrade with failed save/retry/reload, and mirror-after-persistence behavior. The copy mismatch between ordinary parts and trait cores was resolved by explicitly naming non-trait parts; distinct effective traits have separate goals using the combat resolver.

## Product-review follow-up

Fresh independent product review rejected full acceptance at `47d54ff`: owned gear suggested prohibited duplicate fabrication, mastery goals dominated the additions, survival speed goals overstated skill, and selected Parts/lifecycle evidence was missing. The first implementation-correctness review's four fixes do not close these product findings.

Follow-up `51366ad` changes owned gear to historical blueprint cost and an explicit no-additional-copy statement, with real fabrication/reload/duplicate-rejection coverage. Timed goals now require non-survival Contracts. The two affected CI fixture suites pass 196 tests; depth/context/equipment suites pass 83. The preservation tests capture the canonical post-reconciliation baseline rather than hardcoding pre-reconciliation currency. Hosted CI at `47d54ff` passed art/content/lint and failed 18 stale expectations now corrected; final exact-head CI remains required.

Selected Parts captures now cover locked, available, owned-and-fitted, and reward-only states. The detail heading was moved beside its source after inspection found keyboard/touch focus hid the title above the artwork. A seeded late-game browser save exercises the actual fourth-T4 upgrade button: cost 200, completion reward 200, one receipt, unchanged currency after reload. This is mutation/persistence evidence, not evidence of a played-through career. Phone and desktop artifacts are `*-part-*-detail.png`, `*-old-owned-equipment-detail.png`, `*-milestone-before-upgrade.png`, `*-milestone-earned.png`, `*-milestone-reloaded.png`, and `*-product-lifecycle.json` under `output/playwright/`.

Eight unreleased per-mercenary tier-5 rows have been removed; roster-wide tier-2/tier-5 and Tabby specialization remain. This leaves 27 active goals before the five approved post-Warden goals are integrated from the contracts dependency. Removed candidate history remains load-safe through the existing historical-achievement behavior. The optional ladder remains pending that dependency. No full product acceptance is claimed.

## Remaining acceptance gates

Fresh independent product-quality review; integrated optional post-Warden Contract playthrough; exact draft-head hosted CI/full closeout; physical phone/controller and reconnect evidence; sustained-play evaluation of speed thresholds and mastery/reward pacing. Browser viewport emulation and correctness tests do not establish that the candidate is fun. No merge or deployment is authorized by this record.
