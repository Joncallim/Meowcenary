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
threshold, assertion, profile or scoped skip is removed. This new browser check
remains pending until the exact-head focused/full runs execute; no native success
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
