# Contracts domain foundation on main 4f79d621

## Boundary and provenance

Package A extracts only the Contracts domain foundation from immutable
`47dec8e4d8e7e066ffe35c71fcead74fac1511da`, relative to
`a100e053ce4e2bc48bc4b8844e7da5010d562096`, onto accepted main
`4f79d6210c3b028b995d67a5cc6e35318b17b2ee`. The coordinator approved this
bounded extraction after an independent architecture review. This is not a
whole-branch reconciliation or a complete Contracts UI delivery.

Exactly eight production paths change: four Stage/encounter/difficulty/reward
catalogs, Stage contracts and completion projection, the Stage validator, and
Stage-only joins/imports in aggregate validation. Original catalog formatting
is retained where possible. Parsed originals and their order are unchanged,
except the approved openingDialogue additions for Scrap Crusher and Forge
Warden. The appended optional ladder remains:

1. Nest Breaker: 8 ranged kills, 145 Scrap.
2. Crossfire Salvage: 32 Scrap collections, 150 Scrap.
3. Shatterline: 70 kills, 160 Scrap.
4. Pressure Test: survive 120 seconds, 170 Scrap.

The four first-clear rewards total 625 Scrap and have no item grants. Their
prerequisites form one chain after historical `stage:junkyard-06`. No stable
ID, original payout, roster order, static arena, hazard DPS, replay policy,
save schema, ability, audio, input, resource loader or scene code changes.
Content-version publication remains coordinator-owned after combined work.

## Ownership and validation composition

`campaignRole` is optional; omission means main campaign. One pure frozen
completion projection counts current catalog IDs and completed saved facts,
ignores retired IDs, and keeps Campaign 10/10 separate from Optional 0/4.
The optional opening is cloned and deeply frozen into the resolved plan.

Row validation checks role enum, dialogue object/allowed fields, content-ID
shape and one or two trimmed plain lines, at most 100 Unicode code points
per line and 160 total. C0/C1 controls, DEL, U+2028/U+2029 and angle-bracket
markup are forbidden. Missing opening remains valid, including for bosses.

The inherited extraction performed speaker/objective/boss identity checks
at the row phase, masking established missing-boss and unknown-defeat-target
diagnostics. Package A moves those identity joins after the existing defeat
reference and boss/encounter checks, then requires a boss and required logical
enemy actor art. Earlier ordinary actor/resource validation remains intact.

Separately, immutable main's collecting validator omitted most Stage joins:
an unknown defeat target, a mismatched boss identity or an unknown reward
could throw at boot while yielding no collecting issue. Package A mirrors
the boot-ordered Stage joins as independent collecting assertions. The
opening-dependent join runs only after valid defeat/boss identity. Existing
independent chapter-art and asset-bundle failures remain simultaneously
visible; a dedicated regression caught and corrected their initial grouping.
Other existing domain assertions still collect independently. This is a Stage-only
parity correction, not a general validator refactor.

## Verification at source freeze

Unmodified main passed lint, the complete repository test runner (3,040
ordinary tests, nine isolated allocation tests and all nine subprocess
canaries), build and content validation. Its original ten resolved plans and
spawn compositions were captured before edits; the versioned fixture records
the immutable source commit and all four original parsed catalogs.

Before implementation, targeted opening/parity tests failed against main.
After implementation, all 338 focused cases across 12 files pass and lint
passes. Coverage includes original-ten equality and deterministic composition,
all-row conformance, explicit optional rewards, old-ten completion, final
ladder order/no-wrap, data-only extension, registry/plan freeze, malformed and
absent dialogue, required actor art and throwing/collecting diagnostic parity.
The old sharedFoundationContracts and validation diagnostic assertions remain
unchanged. Focused results are not a complete aggregate pass.

The first broader aggregate run exposes three expectations in the unchanged
Menu/progression-overview consumer tests: ten-row progress, Warden as terminal
after clearing every catalog row, and chapter reward monotonicity spanning
optional trials. The reward-only assertion was subsequently corrected to
preserve main-campaign monotonicity and the exact optional rewards. The two
remaining UI consumer expectations belong to Package B. They are kept
unchanged rather than blessing a temporary 14-stage campaign. Exact
gate logs and statuses are recorded separately from this frozen source packet.

## Remaining acceptance boundary

Campaign/optional presentation consumers and the single run intro/lifecycle
are Package B; progression integration is Package C. Browser/device/human
playability and combined-source gates remain outstanding. Independent review,
an external full-source checkpoint and a verified clean restore are required
before Package B. Nothing here authorizes merge, push, PR or publication.
