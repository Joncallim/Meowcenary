# Epic 19 — Player experience gate

**Status:** PASS — 2026-09-02
**References:** Epic #78; [governing architecture](../architecture/epic-19-player-ux-and-alpha-2-gate.md). The immutable Alpha 2 certification source is `bbe8bc52ff97c1db437aa2fcfdd7ec55838fd08c`; later Alpha 3 work is deliberately outside this historical gate.

This is the compact durable record for the Epic 19 player-experience gate. Historical draft rows below preserve the defects and evidence gaps that drove remediation; they are superseded only by the final source-specific certification record, not by automation alone.

## Final frozen-baseline certification

| Field | Evidence |
| --- | --- |
| Source | `bbe8bc52ff97c1db437aa2fcfdd7ec55838fd08c` |
| Artifact | `https://meowcenary.jo-nas.com/?cert=alpha2-bbe8bc52` (deployment ledger records `certification/alpha2-bbe8bc52 @ bbe8bc5`) |
| Automated gate | Full suite (104 files / 1,780 tests plus allocation and runner stages), shuffled seeds `78001`–`78003`, lint, production build, visual-art validation, and diff check: PASS. |
| Controller-only evidence | Product-owner confirmation: menu through character/arena selection, run movement, upgrade choices, rack/merge, pause/settings, summary, Retry/Menu, disconnect/reconnect, and input-source recovery all pass with no pointer/touch fallback. |
| Real-phone evidence | Product-owner confirmation: uncoached Golden Run; portrait movement, sustained ergonomics and accidental-action checks; Rusher/Brute movement agency; PF1–PF7 and PF-R2–1–6 recheck; and quiet/late-wave observations all pass. Movement-only is accepted; no dash is required. |
| Defect disposition | No P0/P1 or unaccepted P2 finding reported at the final gate. |

The confirming observer was the product owner on 2026-09-02. The issue ledger contains the source-specific confirmation and closure decision; unavailable historical draft-device metadata is not retroactively fabricated.

## PF convergence recheck (draft)

Maintainer draft, 2026-08-24, against candidate `ad5aeb9` (the baseline where these failures were observed). These verified-fail rows identify required final-runtime (`609547d`) rechecks and do not substitute for human device evidence.

| PF | Finding / check | Device, input, symptom | Candidate | Observer/date | Final-candidate recheck | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PF1 | Weapon-rack merge selection | Mac, mouse click-select; rack card selection did not reliably arm/commit Merge | `ad5aeb9` | maintainer / 2026-08-24 | recheck click-select and exactly-one Merge on final SHA | verified-fail → pending |
| PF2 | Mission-skill selection | Mac, mouse click-select; mission upgrade card did not reliably select | `ad5aeb9` | maintainer / 2026-08-24 | recheck click-select and visible choice feedback on final SHA | verified-fail → pending |
| PF3 | Touch coordinate/feedback parity | iPhone 15 Pro Max, iOS Safari touch; tap offset and no visible selection feedback | `ad5aeb9` | maintainer / 2026-08-24 | recheck toolbar/viewport positions and feedback on final SHA | verified-fail → pending |
| PF4 | HUD-strip accidental opens | iPhone 15 Pro Max, touch; lower HUD rack strip opened inventory accidentally | `ad5aeb9` | maintainer / 2026-08-24 | recheck bottom taps and stick drag-release on final SHA | verified-fail → pending |
| PF5 | iOS fullscreen | iPhone 15 Pro Max, iOS Safari; in-tab fullscreen unavailable | `ad5aeb9` | maintainer / 2026-08-24 | recheck safe dynamic viewport and unsupported omission on final SHA | verified-fail → pending |
| PF6 | Pause/health overlap | iPhone 15 Pro Max, touch; top-right pause control overlapped health/HUD information | `ad5aeb9` | maintainer / 2026-08-24 | recheck 44px control and physical gutter on final SHA | verified-fail → pending |
| PF7 | Sprite/UI scale | iPhone 15 Pro Max, iOS Safari; sprites and UI were too small | `ad5aeb9` | maintainer / 2026-08-24 | recheck 1.25× rendering, targets, and pressure windows on final SHA | verified-fail → pending |

### Round-2 maintainer findings (draft)

| PF | Finding / check | Device, input, symptom | Candidate | Observer/date | Final-candidate recheck | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PF-R2-1 | Full-bleed screen shell | iPhone 15 Pro Max / iOS Safari (versions unrecorded) / touch; screen not edge-to-edge: 59px notch, 34px home, ≈21px side strips / shrunken FIT | `2bbb777` | maintainer / 2026-08-25 | candidate=unverified; observer/date=unverified; outcome=unverified; status=pending | verified-fail → pending |
| PF-R2-2 | Health / XP bar alignment | iPhone 15 Pro Max / iOS Safari (versions unrecorded) / touch; XP bar visibly longer than health bar | `2bbb777` | maintainer / 2026-08-25 | candidate=unverified; observer/date=unverified; outcome=unverified; status=pending | verified-fail → pending |
| PF-R2-3 | Pause affordance glyph | iPhone 15 Pro Max / iOS Safari (versions unrecorded) / touch; pause affordance renders as an unlabeled square | `2bbb777` | maintainer / 2026-08-25 | candidate=unverified; observer/date=unverified; outcome=unverified; status=pending | verified-fail → pending |
| PF-R2-4 | HUD stats clearance | iPhone 15 Pro Max / iOS Safari (versions unrecorded) / touch; Kills text overlaps the health bar | `2bbb777` | maintainer / 2026-08-25 | candidate=unverified; observer/date=unverified; outcome=unverified; status=pending | verified-fail → pending |
| PF-R2-5 | Render scale perception | iPhone 15 Pro Max / iOS Safari (versions unrecorded) / touch; sprites/UI still read too small despite 1.25 zoom | `2bbb777` | maintainer / 2026-08-25 | candidate=unverified; observer/date=unverified; outcome=unverified; status=pending | verified-fail → pending |
| PF-R2-6 | Rarity label / card edge | iPhone 15 Pro Max / iOS Safari (versions unrecorded) / touch; `Common — Defensive` clips; chooser/rack edges do not consistently communicate rarity | `2bbb777` | maintainer / 2026-08-25 | candidate=unverified; observer/date=unverified; outcome=unverified; status=pending | verified-fail → pending |

**PF-R2-1 and PF-R2-5 share the `#game-root` inset root cause and one implementation fix, but retain separate human acceptance rows.**

## Automated validation

Eight separate rows (one per gate). Each test row records the exact candidate commit, observer/date, exit/pass, ordinary files/tests, stage-2 `9 passed`, and stage-3 fixed `6 + 3` all enforced. All rows pin the FINAL TESTED runtime parent `609547d` (not the `ad5aeb9` baseline) and are re-verified at the tests-only verification descendant `e488de5` (runtime byte-identical) with its real numbers: 103 ordinary files / 1718 tests (+1 over the parent: the rack card-composition order test), stage-2 allocation 9/9, stage-3 fixed 6 + 3, normal plus BOTH shuffled reruns. Automated rows have no human observer — the Observer column is the run's provenance.

| # | Commit | Observer/date | Check | Status | Outcome | Notes | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | normal full `npm test` | verified | pass | Exit 0; ordinary 103 files / 1718 tests; stage-2 allocation 9 passed; stage-3 fixed 6 + 3 enforced. | — |
| 2 | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | shuffled full seed `190501` | verified | pass | `--sequence.shuffle --sequence.seed 190501`; exit 0; seed printed; ordinary 103 files / 1718 tests; stage-2 allocation 9 passed; stage-3 fixed 6 + 3 enforced. | — |
| 3 | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | shuffled full seed `190502` | verified | pass | `--sequence.shuffle --sequence.seed 190502`; exit 0; seed printed; ordinary 103 files / 1718 tests; stage-2 allocation 9 passed; stage-3 fixed 6 + 3 enforced. | — |
| 4 | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | `npm run lint` | verified | pass | `tsc --noEmit` exit 0. | — |
| 5 | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | `npm run build` | verified | pass | `tsc --noEmit && vite build` exit 0. | — |
| 6 | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | `npm run art:validate` | verified | pass | Node + Lua visual-art builder contracts all PASS, exit 0. | — |
| 7 | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | `git diff --check` | verified | pass | Exit 0; checked the tests-only verification descendant before this documentation-only revision. | — |
| 8 | `609547d` | unassigned / 2026-08-25 | independent orthogonal review | pending | not dispatched | Read-only full-footprint review artifact required. | Independent reviewer not assigned. |

## Device matrix

| Device ID | Required row | Hardware | OS/version | Browser/version | Input | Availability | Status | Commit | Notes | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop-keyboard-chrome | desktop keyboard+mouse Chrome | unverified | unverified | unverified | keyboard+mouse | not recorded | unverified | pending | Hardware/session not recorded. | Hardware/session not recorded. |
| desktop-gamepad-chrome | desktop standard-layout gamepad Chrome | unverified | unverified | unverified | standard-layout gamepad | not recorded | unverified | pending | Hardware/session not recorded. | Hardware/session not recorded. |
| pixel-8-android-chrome | Android Chrome touch | Pixel 8 | unrecorded | unrecorded | touch | not recorded | unverified | unverified | Hardware named; session and versions not recorded. | No maintainer playtest/session recorded. |
| iphone-15-pro-max-ios-safari | iOS Safari phone touch | iPhone 15 Pro Max | unrecorded | unrecorded | touch | not recorded | unverified | unverified | Hardware named; session and versions not recorded. | No maintainer playtest/session recorded. |
| ipad-pro-m1-ios-safari | iOS Safari tablet touch | iPad Pro M1 | unrecorded | unrecorded | touch | not recorded | unverified | unverified | Supplemental hardware named; session and versions not recorded. | No maintainer playtest/session recorded. |

## Journey evidence (J1–J7)

| Evidence ID | J row | Device ID | Seed (if run) | Commit | Observer/date | Status | Outcome | Notes | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J1-controller | J1 — controller-only launch → menu → character → arena → Start, pointer-free | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real controller journey recorded. | Hardware and observer unavailable. |
| J2-controller | J2 — full run movement/auto-fire/level-up/pause/rack merge/back, controller-only | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real controller journey recorded. | Hardware and observer unavailable. |
| J3-settings | J3 — settings mute/volume/reduced-motion live effect plus reload persistence | desktop-keyboard-chrome | unverified | pending | unverified | unverified | unverified | No manual settings row recorded. | Observer unavailable. |
| J4-terminal | J4 — lose→Retry and win→Main Menu, controller-only | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No terminal journey recorded. | Hardware and observer unavailable. |
| J5-pixel-8 | J5 — touch parity of J1–J4 via direct selection | pixel-8-android-chrome | unverified | unverified | unverified | unverified | unverified | No real touch journey recorded. | Maintainer session unavailable. |
| J5-iphone-15pm | J5 — touch parity of J1–J4 via direct selection | iphone-15-pro-max-ios-safari | unverified | unverified | unverified | unverified | unverified | No real touch journey recorded. | Maintainer session unavailable. |
| J5-ipad-m1 | J5 — supplemental touch parity and resize | ipad-pro-m1-ios-safari | unverified | unverified | unverified | unverified | unverified | No real touch journey recorded. | Maintainer session unavailable. |
| J6-reconnect | J6 — controller disconnect/reconnect mid-run and in menus with held-state clear, no phantom confirm, focus continuity, and no scene restart | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real soak recorded. | Controller unavailable. |
| J7-mixed | J7 — rapid mixed-input soak; Enter + bottom face exactly one card choice | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real mixed-input soak recorded. | Controller and observer unavailable. |

## Touch ergonomics

| Evidence ID | Device ID | Mode | 390x844 | Seed | Character/arena | Commit | Observer/date | Status | Outcome/time | First comfortable movement (s) | Accidental pause taps | Re-anchor incidents | Death window | Sustained minutes | Comfort note | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-floating-pixel8 | pixel-8-android-chrome | floating-touch | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | Touch hardware and human session unavailable. |
| T-floating-iphone15pm | iphone-15-pro-max-ios-safari | floating-touch | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | Touch hardware and human session unavailable. |
| T-floating-ipad-m1 | ipad-pro-m1-ios-safari | floating-touch | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | Tablet supplemental; human session unavailable. |
| T-anchored-optional | pixel-8-android-chrome | anchored-touch | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | Optional diagnostic only if floating has a material issue. | No floating evidence and no touch hardware. |

## Movement agency

| Evidence ID | Device ID | Target family | Seed | Character/arena | Commit | Observer/date | Status | Outcome/time | Rusher [60s,150s): reached + damage/death + telegraph/space + positioning tried + judgment | Brute [150s,300s]: reached + damage/death + telegraph/space + positioning tried + judgment | Build/rack context | Confounders | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MA-floating-pixel8-1 | pixel-8-android-chrome | floating-touch | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | No scored human run. |
| MA-controller-1 | desktop-gamepad-chrome | controller | unverified | unverified | pending | unverified | unverified | unverified | unverified | unverified | unverified | unverified | No scored human run. |

### D10 maintainer decision
- Decision: NO_DASH observation, gate pending.
- Maintainer:
- Date: 2026-08-24
- Device: iPhone 15 Pro Max (iOS/Safari versions unrecorded)
- Candidate commit: `ad5aeb9`
- Evidence row IDs: PF1–PF7 draft only; no final-candidate human-device run.
- Pressure-window observations: marathon crossed both Rusher and Brute windows; no repeated unavoidable-damage/death pattern observed.
- Judgment: NO_DASH lean only — **CONFOUNDER:** threat was low, so absence of deaths does not prove agency; balance follow-up is tracked.
- Reproducibility/evidence status: unverified — seed was unrecorded.
- Follow-up: re-run on the final SHA with device/version provenance and a recorded seed; no dash implementation is authorized.

## Performance

| Evidence ID | Device ID | Commit | Observer/date | Check | Method | Status | Observed outcome | Unverified reason | Decision/follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-alloc | desktop-keyboard-chrome | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | §6 zero-allocation and runner regressions | `npm test` | verified | pass | Stage-2 allocation 9/9 + stage-3 fixed 6 + 3 at the tests-only verification descendant (runtime byte-identical to the final tested candidate). Automated proxy only — not lived FPS. | — |
| P-late-wave | unverified | pending | unverified | 4:30–5:00 Golden Run frame posture | real run with input polling | unverified | unverified | Deferred to Slice 5; no human browser run. | Do not infer frame pacing from allocation tests. |

## §10 experience matrix

| Evidence ID | §10 row | Device ID | Commit | Observer/date | Status | Outcome | Notes / unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X1-controller-journey | X1 — controller-only whole journey | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No real controller run. |
| X2-focus | X2 — visible focus across rerender, resize, device switch | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No device/manual observation. |
| X3-single-command (automated soak) | X3 — one input, one destructive/selection effect | desktop-gamepad-chrome | `e488de5` (verification descendant of `609547d`) | automated / 2026-08-25 | verified | pass | Mixed-input + pointer-funnel regressions green at the tests-only verification descendant (runtime byte-identical to the final tested candidate; normal + both shuffled reruns). | Automated evidence only — no human observer. |
| X3-single-command (maintainer) | X3 — one input, one destructive/selection effect | desktop-gamepad-chrome | `609547d` | maintainer / 2026-08-25 | unverified | unverified | No real-device observation is available; the automated soak does not verify the absent keyboard+controller device session. | Maintainer playtest session unavailable. |
| X4-hints | X4 — hints follow last real device | desktop-keyboard-chrome | pending | unverified | unverified | unverified | No manual observation. |
| X5-one-handed | X5 — one-handed phone comfort/reach | pixel-8-android-chrome | unverified | unverified | unverified | unverified | No touch hardware evidence. |
| X6-agency | X6 — movement agency | pixel-8-android-chrome | unverified | unverified | unverified | unverified | D10 remains PENDING. |
| X7-audio | X7 — audio unlock/deferred silence | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No browser/device observation. |

## Historical limitations and final decision

- Floating remains the production default. Anchored is config-only diagnostic; its frozen activation circle is clipped off-canvas and overlaps lower HUD/modal targets, so any diagnostic incident must be recorded rather than silently masked.
- Seed identity is terminal observation only; automated fixture seeds never consume gameplay RNG.
- Historical decision: **NOT READY.** The rows above accurately describe the pre-certification gaps and must remain readable as audit history.
- Final decision: **PASS.** The frozen-baseline automated gate and product-owner physical controller/phone evidence in the final certification section supersede those gaps. #78 closed on 2026-09-02.
