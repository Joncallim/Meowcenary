# Epic 19 — Player experience gate

**Status:** IN PROGRESS
**References:** Epic #78; [governing architecture](../architecture/epic-19-player-ux-and-alpha-2-gate.md); Slice 4 merged commit: `b316a6a`; Slice 5 candidate commit: `cc767f1` (PR #112; tests/docs-only hardening commits on top carry no runtime-affecting diff — see row 7).

This is the compact durable record for the Epic 19 player-experience gate. Rows without a real observer, device, and candidate commit remain `unverified`; automated results do not substitute for human evidence.

## Automated validation

Eight separate rows (one per gate). Each test row records the exact candidate commit, observer/date, exit/pass, ordinary files/tests, stage-2 `9 passed`, and stage-3 fixed `6 + 3` all enforced.

| # | Commit | Observer/date | Check | Status | Outcome | Notes | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `cc767f1` | Codex / 2026-08-22 | normal full `npm test` | verified | pass | Exit 0; ordinary 99 files / 1635 tests; stage-2 allocation 9 passed; stage-3 fixed 6 + 3 enforced. 1635 = 1618 baseline + 16 planned soak tests + the §4.1/§3.1-2 scheduled-vs-control draw-posture test added to the existing controller journey (Sol finding 1). | — |
| 2 | `cc767f1` | Codex / 2026-08-22 | shuffled full seed `190501` | verified | pass | `--sequence.shuffle --sequence.seed 190501`; exit 0; seed printed; ordinary 99 files / 1635 tests; stage-2 allocation 9 passed; stage-3 fixed 6 + 3 enforced. | — |
| 3 | `cc767f1` | Codex / 2026-08-22 | shuffled full seed `190502` | verified | pass | `--sequence.shuffle --sequence.seed 190502`; exit 0; seed printed; ordinary 99 files / 1635 tests; stage-2 allocation 9 passed; stage-3 fixed 6 + 3 enforced. | — |
| 4 | `cc767f1` | Codex / 2026-08-22 | `npm run lint` | verified | pass | `tsc --noEmit` exit 0. | — |
| 5 | `cc767f1` | Codex / 2026-08-22 | `npm run build` | verified | pass | `tsc --noEmit && vite build` exit 0. | — |
| 6 | `cc767f1` | Codex / 2026-08-22 | `npm run art:validate` | verified | pass | Node + Lua visual-art builder contracts all PASS, exit 0. | — |
| 7 | `cc767f1` | Codex / 2026-08-22 | `git diff --check` | verified | pass | Clean working tree; no blank-line-at-EOF or whitespace errors. Tests/docs-only hardening commits on top of `cc767f1` carry no runtime-affecting diff, proven by `git diff --exit-code b316a6a -- src package.json vite.config.ts tsconfig.json` (empty across the whole Slice 5 branch). | — |
| 8 | `cc767f1` | unassigned / 2026-08-22 | independent orthogonal review | pending | not dispatched | Read-only full-footprint review artifact required. | Independent reviewer not assigned. |

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
- Decision: PENDING
- Maintainer: unverified
- Date: unverified
- Candidate commit: pending
- Evidence row IDs: unverified
- Per-device numerator/denominator: unverified
- Judgment: PENDING — no human movement-agency evidence has been recorded.
- Pressure-window observations: unverified — Rusher and Brute exposures not recorded.
- Follow-up: maintainer playtest required; no dash implementation is authorized.

## Performance

| Evidence ID | Device ID | Commit | Observer/date | Check | Method | Status | Observed outcome | Unverified reason | Decision/follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-alloc | desktop-keyboard-chrome | `cc767f1` | Codex / 2026-08-22 | §6 zero-allocation and runner regressions | `npm test` (rows 1–3) | verified | pass | Normal + seeds 190501/190502 all exit 0; zero-allocation gate 9/9 with zero baselines/canaries; 18,000-poll deterministic proxy and sampler regressions pass (rows 1–3). Automated proxy only — not lived FPS. | — |
| P-late-wave | unverified | pending | unverified | 4:30–5:00 Golden Run frame posture | real run with input polling | unverified | unverified | Deferred to Slice 5; no human browser run. | Do not infer frame pacing from allocation tests. |

## §10 experience matrix

| Evidence ID | §10 row | Device ID | Commit | Observer/date | Status | Outcome | Notes / unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X1-controller-journey | X1 — controller-only whole journey | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No real controller run. |
| X2-focus | X2 — visible focus across rerender, resize, device switch | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No device/manual observation. |
| X3-single-command | X3 — one input, one destructive/selection effect | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No mixed-input soak evidence. |
| X4-hints | X4 — hints follow last real device | desktop-keyboard-chrome | pending | unverified | unverified | unverified | No manual observation. |
| X5-one-handed | X5 — one-handed phone comfort/reach | pixel-8-android-chrome | unverified | unverified | unverified | unverified | No touch hardware evidence. |
| X6-agency | X6 — movement agency | pixel-8-android-chrome | unverified | unverified | unverified | unverified | D10 remains PENDING. |
| X7-audio | X7 — audio unlock/deferred silence | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No browser/device observation. |

## Accepted limitations and final decision

- Floating remains the production default. Anchored is config-only diagnostic; its frozen activation circle is clipped off-canvas and overlaps lower HUD/modal targets, so any diagnostic incident must be recorded rather than silently masked.
- Seed identity is terminal observation only; automated fixture seeds never consume gameplay RNG.
- **Final decision: NOT READY.** Slice 5 automated evidence is not a human/device substitute; D10 is PENDING and P-late-wave is unverified.
