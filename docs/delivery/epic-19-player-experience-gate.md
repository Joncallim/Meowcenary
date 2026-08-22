# Epic 19 — Player experience gate

**Status:** IN PROGRESS
**References:** Epic #78; [governing architecture](../architecture/epic-19-player-ux-and-alpha-2-gate.md); Slice 4 PR/commit: pending review.

This is the compact durable record for the Epic 19 player-experience gate. Rows without a real observer, device, and candidate commit remain `unverified`; automated results do not substitute for human evidence.

## Automated validation

| Commit | Observer/date | Check | Status | Outcome | Notes | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- |
| pending | implementer / pending | `npm test` | unverified | unverified | Includes allocation and runner-regression stages when run. | Candidate commit not yet recorded. |
| pending | implementer / pending | `npm run lint`, `npm run build`, `npm run art:validate`, `git diff --check` | unverified | unverified | No raw logs retained here. | Candidate commit not yet recorded. |

## Device matrix

| Device ID | Required row | Hardware | OS/version | Browser/version | Input | Availability | Status | Commit | Notes | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| desktop-keyboard-chrome | desktop keyboard+mouse Chrome | unverified | unverified | unverified | keyboard+mouse | not recorded | unverified | pending | Hardware/session not recorded. | Hardware/session not recorded. |
| desktop-gamepad-chrome | desktop standard-layout gamepad Chrome | unverified | unverified | unverified | standard-layout gamepad | not recorded | unverified | pending | Hardware/session not recorded. | Hardware/session not recorded. |
| android-chrome-touch | Android Chrome touch | unverified | unverified | unverified | touch | not recorded | unverified | pending | Hardware/session not recorded. | Hardware/session not recorded. |
| ios-safari-touch | iOS Safari touch | unverified | unverified | unverified | touch | not recorded | unverified | pending | Hardware/session not recorded. | Hardware/session not recorded. |

## Journey evidence (J1–J7)

| Evidence ID | J row | Device ID | Seed (if run) | Commit | Observer/date | Status | Outcome | Notes | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| J1-controller | J1 — controller-only launch → menu → character → arena → Start, pointer-free | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real controller journey recorded. | Hardware and observer unavailable. |
| J2-controller | J2 — full run movement/auto-fire/level-up/pause/rack merge/back, controller-only | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real controller journey recorded. | Hardware and observer unavailable. |
| J3-settings | J3 — settings mute/volume/reduced-motion live effect plus reload persistence | desktop-keyboard-chrome | unverified | pending | unverified | unverified | unverified | No manual settings row recorded. | Observer unavailable. |
| J4-terminal | J4 — lose→Retry and win→Main Menu, controller-only | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No terminal journey recorded. | Hardware and observer unavailable. |
| J5-touch | J5 — touch parity of J1–J4 via direct selection | android-chrome-touch | unverified | pending | unverified | unverified | unverified | No real touch journey recorded. | Touch hardware unavailable. |
| J6-reconnect | J6 — controller disconnect/reconnect mid-run and in menus with held-state clear, no phantom confirm, focus continuity, and no scene restart | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real soak recorded. | Controller unavailable. |
| J7-mixed | J7 — rapid mixed-input soak; Enter + bottom face exactly one card choice | desktop-gamepad-chrome | unverified | pending | unverified | unverified | unverified | No real mixed-input soak recorded. | Controller and observer unavailable. |

## Touch ergonomics

| Evidence ID | Device ID | Mode | 390x844 | Seed | Character/arena | Commit | Observer/date | Status | Outcome/time | First comfortable movement (s) | Accidental pause taps | Re-anchor incidents | Death window | Sustained minutes | Comfort note | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-floating-android | android-chrome-touch | floating-touch | unverified | unverified | unverified | pending | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | Touch hardware and human session unavailable. |
| T-anchored-optional | android-chrome-touch | anchored-touch | unverified | unverified | unverified | pending | unverified | unverified | unverified | unverified | unverified | unverified | unverified | unverified | Optional diagnostic only if floating has a material issue. | No floating evidence and no touch hardware. |

## Movement agency

| Evidence ID | Device ID | Target family | Seed | Character/arena | Commit | Observer/date | Status | Outcome/time | Rusher [60s,150s): reached + damage/death + telegraph/space + positioning tried + judgment | Brute [150s,300s]: reached + damage/death + telegraph/space + positioning tried + judgment | Build/rack context | Confounders | Unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MA-floating-1 | android-chrome-touch | floating-touch | unverified | unverified | pending | unverified | unverified | unverified | unverified | unverified | unverified | unverified | No scored human run. |
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
| P-alloc | desktop-keyboard-chrome | pending | implementer / pending | §6 zero-allocation and runner regressions | `npm test` | unverified | unverified | Candidate commit/gate result not recorded. | Record exact candidate result after validation. |
| P-late-wave | unverified | pending | unverified | 4:30–5:00 Golden Run frame posture | real run with input polling | unverified | unverified | Deferred to Slice 5; no human browser run. | Do not infer frame pacing from allocation tests. |

## §10 experience matrix

| Evidence ID | §10 row | Device ID | Commit | Observer/date | Status | Outcome | Notes / unverified reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| X1-controller-journey | X1 — controller-only whole journey | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No real controller run. |
| X2-focus | X2 — visible focus across rerender, resize, device switch | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No device/manual observation. |
| X3-single-command | X3 — one input, one destructive/selection effect | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No mixed-input soak evidence. |
| X4-hints | X4 — hints follow last real device | desktop-keyboard-chrome | pending | unverified | unverified | unverified | No manual observation. |
| X5-one-handed | X5 — one-handed phone comfort/reach | android-chrome-touch | pending | unverified | unverified | unverified | No touch hardware evidence. |
| X6-agency | X6 — movement agency | android-chrome-touch | pending | unverified | unverified | unverified | D10 remains PENDING. |
| X7-audio | X7 — audio unlock/deferred silence | desktop-gamepad-chrome | pending | unverified | unverified | unverified | No browser/device observation. |

## Accepted limitations and final decision

- Floating remains the production default. Anchored is config-only diagnostic; its frozen activation circle is clipped off-canvas and overlaps lower HUD/modal targets, so any diagnostic incident must be recorded rather than silently masked.
- Seed identity is terminal observation only; Slice 4 does not select or replay seeds.
- **Final decision: NOT READY.** Slice 4 must not claim the Epic 19 gate closed while device evidence and the D10 maintainer decision remain unverified/PENDING.
