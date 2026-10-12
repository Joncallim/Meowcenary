# #235 progression candidate delivery

Status: reconciled candidate; **not merged, deployed or product-accepted**.
Implementation authority remains main
`4f79d6210c3b028b995d67a5cc6e35318b17b2ee`. The candidate is stacked on the
Contracts recovery `5b6622b9d9708bc512e158e03b3f6d70d743023e` (#240).

## Resulting behavior

There are 27 active achievements, including the five optional post-Warden
ladder/finale goals. All ten original definitions, stable IDs, conditions,
targets and rewards remain unchanged. Campaign Surveyor requires the ten
campaign Contracts; the optional finale requires the four optional Contracts.
Neither completion is substituted for the other.

Goals also cover roster mastery, distinct timed non-survival clears,
simultaneously engineered families, effective hybrid traits and upgraded
Equipment. Four registered metrics derive facts from canonical state without
new save fields or counters. Unfinished workshop goals show current progress;
completed goals remain terminal. Workshop mutations, completion receipts and
explicit rewards use one durable candidate and publish after successful save.
Platform reporting retains #228's obsolete-context acknowledgement protection.

Acquisition copy distinguishes unlock/blueprint permission, fabrication and
owned-instance rewards. Owned Equipment describes historical blueprint cost
and explicitly rejects fabrication of an additional copy. Existing acquisition,
preview and persistence semantics remain authoritative under #197/#193.

Architecture and product rationale:
[redesign-progression-depth.md](../architecture/redesign-progression-depth.md).

## Ancestry reconciliation and RED/GREEN evidence

The old PR head `aa0bdcd664ded0ca94124432f07a319a53e38f55` was based on an
older Contracts candidate. Its actual common ancestor with its advancing PR
base was `28843128ba3e08f441a05f2c69a3ec3034cf3fe0`, rather than the displayed
base tip `47dec8e4d8e7e066ffe35c71fcead74fac1511da`. Comparing against that
tip included reverse changes to Arena-family types and validation that were
not Progression work.

Recovery replays only the four Progression commits (`1dc791b`, `6907691`,
`3e89fa1`, `aa0bdcd`) onto the repaired Contracts base. It retains the intended
18-file scope and excludes obsolete Contracts/Arena ancestors. Shared types,
stage definitions, encounter data, save schema and scenes are not replaced.

The eight originally failing unit files were run at the old head: **10 failed,
354 passed**. The same eight files pass **389 tests** on the reconciled head.
Four failures came from older owning-boundary fixes absent at the old head;
six came from stale catalog/frontier/ordering assumptions superseded by the
ten-campaign/four-optional contract. The repaired Contracts base already has
the authoritative assertions, including explicit catalog coverage, separate
completion, optional timing and preserved negative validation cases. Recovery
does not remove assertions or change balance to make these tests pass.

The separate product review reproduced a wording defect: Forge Champion said
“every Forge chapter Contract” despite requiring only its five campaign clears.
A RED regression earns it with optional Forge missions uncleared and checks
that the player-facing description matches that boundary. The one-line copy
correction makes it GREEN; conditions, rewards and the original ten definitions
are unchanged. It is a candidate product-copy defect, not a new #201 runtime
invariant violation.

Additional focused domain/persistence/controller suites pass 183 tests,
including the existing #229 Scavenge Pulse transaction. A further five-file
run passes 91 tests covering the new copy regression, #228 acknowledgement
protection and retained achievement/Scavenge boundaries. Full exact-head closeout and hosted CI results
are recorded in the PR/issue comments; focused counts alone are not acceptance.

Reproducible external logs for the 12 October recovery are under
`/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/`:
`pr236-original-red.log`, `pr236-reconciled-focused.log`,
`pr236-domain-focused.log`, `pr236-forge-copy-red.log` and
`pr236-forge-copy-and-retained-boundaries-green.log`. This is an agent-workspace
artifact location, not a portable runtime asset or an owner playtest record.

## Independent review and evidence limits

A fresh read-only Astra domain/save review at
`52cbdd94c77daab985d3204741c074bf0da5a39b` found no concrete production
blocker: the original ten definitions are identical, campaign/optional goals
are separate, workshop receipts and rewards share one commit, and #228 is
preserved. A separate Astra product review found the Forge description defect
above and otherwise passed its bounded code inspection. Read-only follow-up
confirmed the correction and regression, returning PASS. The full candidate
gates remain independent checks.

Earlier candidate reviews found and corrected skipped upgrade evaluation,
stale simultaneous-loadout progress, omitted blueprint sources, delayed
mirror dispatch and misleading duplicate-fabrication copy. Earlier browser
captures of goal/Parts/Equipment copy and fourth-T4 upgrade/reload are historical
evidence of those corrections. They do not establish current exact-head
viewport behavior, integrated optional-Contract pacing or sustained enjoyment.
Earlier local PNG-compression tooling failures are also historical; the
current pinned art-tooling gate must be run afresh.

## Remaining acceptance gates

Require the full ordinary suite, allocation/runner probes, lint, content and
complete art/source/export validation, production/resource/diagnostic checks,
six-profile browser matrix and exact draft-head hosted CI. Require independent
review confirmation, integrated optional post-Warden playthrough, physical
phone/controller/reconnect evidence, and sustained-play evaluation of speed
thresholds, roster repetition, optional rewards and T4 cost pacing. Correctness
tests and browser emulation do not establish that the career is fun. Main and
production remain unchanged; no merge or deployment is authorized by this record.
