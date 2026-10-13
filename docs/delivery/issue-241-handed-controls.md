# #241: captured Ability-card side at the existing ControlsView boundary

Baseline: held pure/control foundation #243 at
`ff5b414fecb5f8224dfcf2b120e49893e7070923`; main/public production remain
`4f79d6210c3b028b995d67a5cc6e35318b17b2ee`.

`ControlsViewOptions.abilityButtonSide` is an optional readonly Left/Right scalar.
Construction captures it once, defaulting to the approved pure Left preference;
resize and extraction transitions reuse it. The accepted layout resolver owns
the actual 120×60 CSS-pixel rectangle and asymmetric safe-edge/two-inset formula.
The card moves without reflection: icon/text order, foreground state glyphs and
active/cooldown bands, compensated root and child scrollFactor=0 remain. Pause
stays top-right and Extract stays centered. Existing pointer command, floating
movement, neutral quarantine, gameplay state and persistence are unchanged.

This intentionally moves an unspecified card to Left under #241 authority.
It is a bounded view slice, not an accessible persisted Right setting. Settings
and GameScene's next-run scalar wiring await Contracts/Arena reconciliation;
there is no hot-swap subscription or new pause/input state. The accepted Save
preference remains a separate candidate. No runtime Ability/art/resource changes
are included and the all-eight source candidate stays separate/unapproved.

## Focused evidence

Before implementation: 79 actual Controls tests collected; 15 missing-Left
geometry/default checks failed, 64 existing checks passed. These are RED feature
acceptance, not a #201 input defect. Final focused actual-view/input coverage:
161 tests in three files (81 Controls, 11 extraction, 69 input). Independent
read-only review reran all 161 on Node 22.23.2 and confirmed exact source/test
hashes. Existing Right tests explicitly construct Right; their assertions remain.

Additional tests cover seven viewport sizes, plain/zoomed modes, asymmetric
insets, physical card edges, unmirrored icon/copy order, captured caller state,
ready/active/cooling and reduced motion through resize, both two-finger orders
and releases, pinned movement, stale old Ability and Extract callbacks, and
idempotent destruction. Mocked currentlyOver/scale emitters are adapter evidence,
not actual nested hit testing, listener growth measurement or device ergonomics.

The existing native phone acceptance previously used a fixed right-hand tap and
pixel clip. It now samples the actual card bounds, asserts Left and exact physical
size, taps the current center, requires exactly one authoritative activation, and
retains the original before/after pixel inequality. No timeout, screenshot
threshold, assertion, profile or scoped skip is removed. This new browser check is included in the exact-head matrix; no native success
is inferred from unit results.

## Remaining acceptance

Complete local ordinary/allocation/runner/content/art/production/resource/strict
module and six-profile browser gates plus exact-head hosted CI remain mandatory
at the committed head. Runtime screenshots/captures need individual inspection.
Full keyboard/controller logical-command lifecycle and real multi-touch on both
persisted sides belong to integrated Settings/GameScene acceptance. Portrait
phone landscape remains guarded, not newly playable. Physical phones/controllers,
asymmetric notches, real browser hit testing and comfort remain unverified.

No merge, deployment or issue closure is authorised. #241 and related product,
art, device and #201 ledger gates remain open.

## Individually inspected default-side screenshot correction

The original fixed-art-reference journeys reproduced eight mismatches after the
mandated default changed from Right to Left. The original assertions, budgets,
thresholds, profiles and actor crops remain. Each expected/actual/diff pair was
visually inspected and independently measured before its baseline changed.

| Baseline | Original matcher difference | Exact changed card pixels | Raw changes outside the two card bounds |
| --- | ---: | ---: | ---: |
| Gameplay, phone 390×844 | 13,665 | 15,120 | 0 |
| Gameplay, foldable 1114×720 | 13,782 | 15,120 | 0 |
| Gameplay, desktop 1280×720 | 13,718 | 15,120 | 0 |
| Ability effect, phone 390×844 | 13,698 | 15,120 | 52 timer pixels, retained from the old baseline |
| Ability effect, foldable 1114×720 | 13,782 | 15,120 | 0 |
| Ability effect, desktop 1280×720 | 13,718 | 15,120 | 0 |
| Boss gameplay, desktop 1280×720 | 13,718 | 15,120 | 0 |
| Forge gameplay, desktop 1280×720 | 12,368 | 15,120 | 0 |

The only permitted correction is the old/new card paint rectangle, including its
one-pixel stroke: `[23,635,145,697)` at Left and `[width−145,635,width−23,697)`
at Right for the 720-high captures; phone uses y `[759,821)`. The actual hit area
remains 120×60. Translucent card compositing against the different floor pixels
was checked separately; translated foreground samples and bounded quantisation
residuals are consistent with the unchanged card. None of the world, actor,
ability geometry, banner, HUD or pause pixels outside these rectangles changed
in seven raw pairs.

The raw phone effect capture instead froze at `0:00` versus the old `0:01`.
Its 52 non-card changes are confined to `[319,14,326,22)`. That incidental time
was not adopted: only the two actual card rectangles were copied into the old
expected image, retaining every original pixel outside them. The unchanged
screenshot matcher continues to check the entire image with its original
incidental-timing allowance. This is a scoped baseline correction, not a mask,
threshold relaxation, bulk refresh, new runtime art authority or device approval.
All Mercenary/ordinary/boss/Forge actor-crop baselines remain byte-unchanged.

Raw RED artifacts, original golden bytes, per-image hashes, primary checks and
four independent read-only pixel reports are retained in the programme evidence
under `issue-burn-2026-10-12/pr257-*` and
`ability241-controls-*-pixel-independent-review.*`. Exact-head full validation
must still pass after this correction; the earlier 98d0122 local 3,445 ordinary,
nine allocation and nine runner passes do not certify the new committed head.

After the scoped corrections, the unchanged original three fixed-art journeys
(phone, foldable, desktop) and two desktop boss/Forge journeys passed: five
passed, four existing profile-conditional skips, zero failures, zero retries or
flaky cases. Their centered ordinary/boss/Forge actor assertions now executed
and passed with unchanged crop goldens. This focused result is not the full
six-profile matrix or a device/owner verdict.


## Shared observer follow-up

The old `98d0122c3fb2e10009173a8c6076609a8b7d9391` hosted run
`38330273391` was RED: **573 passed /64 existing scoped skips /23 failed**.
Five first-blocking HUD screenshot mismatches were inspected as described
above; the other eighteen were desktop observer/admission cases, also present
on the source-only FX candidate. The eight scoped golden corrections alone
were not claimed to fix those eighteen cases.

A separate nine-file observer commit is now ported from the FX candidate's
`3c34aef87b1c4607a508ab4ab85b98e48a3d547b`, without its art or
source-delivery document. All nine hashes match the independently reviewed
observer slice; runtime, source-art and all goldens remain byte-identical to
the individually inspected `441481c04c5fdba2e3be9458688ffb81f8a241bd`
checkpoint. Physical commands, actual owner cancellation/release, admission,
assertions, budgets, retries, skips and thresholds are unchanged.

The observer-contract comparison fails 36 of the same 137 cases on inherited
helpers and passes all 137 on corrected owners. The full focused observer
selection passes 185, independently repeated. Original nineteen desktop
journeys pass on the source-only FX candidate; this is related evidence,
not a Controls-specific browser or latency-improvement claim. Complete
local and hosted gates are required at this Controls follow-up's exact head.
The earlier 441481c full-local gates and physical phone-emulation activation
capture remain historical evidence, not a substitute for new-head validation.
No art, device, gameplay-comprehension or production acceptance is implied.
