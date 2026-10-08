# Issue #201 — Scavenge Pulse collection transaction

Starting main: `c2a2809641e3ec6f2a5df16916c890e7e6d55cea`.
Owner: [the reproduced #201 finding](https://github.com/Joncallim/Meowcenary/issues/201#issuecomment-6063623748).
Product dependency: [#196 ability comprehension](https://github.com/Joncallim/Meowcenary/issues/196).

## RED and consequence

Use the real DropSystem, RunState, EventBus and UpgradeSystem with XP sufficient
for a level-up followed by Scrap inside the ability radius. The synchronous
`level:up` event opens the chooser and pauses the run. The old pulse then skips
the Scrap but increments its returned count anyway. Later XP can be skipped too.
The remaining drops are recoverable after the chooser; this is not evidence of
unrecoverable save loss or a production P0/P1 incident. Its incorrect count is
currently ignored by GameScene, but must be repaired before #196 displays it.

The unchanged 23-case regression file ran against exact starting main with only
that test added: **12 RED / 11 passing controls**. It uses the actual chooser
queue and pause owner, with only the Phaser/Arcade shell mocked. Raw results are
in [baseline-red.txt](baseline-red.txt). Candidate focused result: **167 passing
tests across five files**, including all 23 regressions, in
[candidate-focused.txt](candidate-focused.txt). Node: **22.23.2**.

## Smallest owning boundary

The active-entry pulse captures its center and eligible XP/Scrap spawn lifetimes
before callbacks. It consumes only those matching, unblocked lifetimes, retires
each pulse pickup before reward/event callbacks, and counts actual consumption.
Newborn or reused drops are not chased. The existing spawn serial already used
by pending-clear settlement supplies the lifetime identity.

A synchronous `withActivatedXpPulse` grants XP through the already-started
pulse's level-up pause. Its capability is revoked in `finally`; ordinary
`applyXp` remains active-only. Real level events and chooser queues are retained,
with no temporary resume or deferred/suppressed level notification. Manual and
terminal states stop continuation. Existing XP math and stat scaling are reused.

Only pulse consumables change release timing. Ordinary overlaps, chest/weapon
admission, global pending-clear settlement, save schema, tuning, RNG ownership
and presentation remain on their existing paths. Independent QA checked those
boundaries and found no material defect or scope leakage.

## Objective completion during the chooser

Adversarial integration of the repaired pulse found a related scene-owned gap:
XP opens a level-up chooser; later Scrap completes a collect objective while
paused. The direct card command used by touch/number-key confirmation resumes
the run before the next scene update has captured `pendingClear`. The old
physics resolver checked pending clear but not the already-completed objective,
so it resumed Arcade in that window. Damage is already guarded; ordinary loot
overlap was not, and could award a retained chest before frozen settlement.

The regression uses real DropSystem, UpgradeSystem, chooser controller, event
bus and StageRuntime with the GameScene update harness. It fails on the prior
candidate at the premature physics-resume assertion. The smallest correction
keeps physics paused for `objective-complete` until normal scene capture. The
same test then proves pending-clear capture, frozen chest settlement without
another chooser, unchanged completion time, and successful extraction. This
is an automated boundary reproduction; actual device incidence is unverified.
Against `bb74d855d892b9f0eea7017fe5fa1ba4aafea4b6`, the scene test file
reported **1 RED / 17 passing controls**, recorded in
[physics-boundary-red.txt](physics-boundary-red.txt). The final focused run
reported **191 passing tests across seven files**, including the incomplete
objective's ordinary-resume control, in
[candidate-final-focused.txt](candidate-final-focused.txt).

## Regression coverage and remaining acceptance

Coverage includes multiple queued levels, scaled XP and face-value facts, honest
counts, active-only entry, manual/terminal interruption, retained-capability
revocation after normal/exception exits, radius/center admission, blocked/full
rack exclusions, callback destruction/reentry, pooled lifetime reuse, objective
completion and unchanged global clear settlement. Reentrant pool cases are
adversarial transaction controls, not a claim of an observed production incident.

Full exact-head repository/browser/hosted validation is reported on the PR and
issue after completion; the focused result does not substitute for it. #201
remains open. This supplies #196's collection-truth prerequisite; it does not
implement the ability brief, HUD, outcome presentation or human comprehension
gates. Sprite polish and draft #208 remain deferred/untouched.
