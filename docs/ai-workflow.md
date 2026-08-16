# AI Workflow

## Feature Lifecycle

1. **Architecture**
   - Define interfaces and ownership boundaries.
   - Identify state flow and lifecycle.
   - Specify data files, registries, persistence changes, and migrations.
   - Write automated acceptance, player-experience gates, and reviewer traps.
   - Inspect the live repository before freezing contracts; do not architecture from stale issue text alone.

2. **Implementation**
   - Implement only the agreed feature slice.
   - Keep balance/content in validated data where practical.
   - Add focused tests for pure rules, lifecycle, validation, and persistence.
   - Avoid unrelated refactors and content-ID special cases.

3. **Review / Hardening**
   - Check architecture compliance.
   - Check whether scene code stayed thin.
   - Check mobile, controller, desktop, pause, deterministic-RNG, persistence, and lifecycle assumptions relevant to the feature.
   - Check that new content uses registered primitives/data rather than one-off ID branches.
   - Identify balance risks separately from architecture defects.

4. **Playtest**
   - Confirm the mechanic is legible.
   - Confirm it is fun enough to keep.
   - Record evidence honestly; unavailable device/browser rows remain unverified.
   - Record tuning follow-ups separately from architecture defects.

5. **Closeout**
   - Re-run lint, tests, build, and any epic-specific validation command.
   - Sync status/architecture/roadmap/knowledge-graph docs without overwriting newer mainline planning.
   - Record any accepted limitations or deferred P2/P3 findings.
   - Merge only after the delivery record and player-experience gate are actually satisfied.

## Source-Of-Truth Order

For repository work use:

1. current maintainer instruction;
2. current `main` planning/index docs;
3. the most specific merged architecture document for the feature;
4. live implementation/tests;
5. the GitHub issue for product scope where no newer architecture supersedes it.

An open implementation PR may be the implementation truth for its branch, but it does not supersede newer planning already landed on `main`. Before merging a long-lived implementation PR, sync/rebase/merge current `main` and resolve documentation conflicts deliberately rather than taking one side wholesale.

## Alpha 3 Extensibility Contract

Epics 20–26 additionally inherit [`architecture/alpha-3-content-extensibility-contract.md`](architecture/alpha-3-content-extensibility-contract.md).

Default rule:

> Adding another instance of an existing content type should require validated data + assets, not core gameplay-system source changes.

Before an Alpha 3 architecture is marked implementation-ready, it must answer:

- What are the stable IDs and persistence keys?
- Which definitions are data and which genuinely new mechanics are registered code?
- How are cross-catalog references validated?
- How are encounter/difficulty/reward concerns separated where relevant?
- Does it reuse the shared unlock/condition and reward/grant vocabularies?
- Does new global content silently perturb an old seeded content pool?
- Does ordinary content addition require a save-schema migration? If yes, why?
- How are assets resolved without per-content scene edits?
- What generic conformance test automatically validates every definition?
- What **second representative fixture** proves that ordinary new content is data/assets-only?

A new mechanic may add one registered/tested primitive. After that, further content using the mechanic should again be data-only. Do not create a generic ECS, scripting language, behavior-tree platform, visual scripting layer, DLC system, or mod API without evidence from real product use cases.

## Planning / Delivery Rule

Architecture and implementation should usually stay on separate conceptual gates even when they share one delivery PR:

- architecture must freeze product decisions and extension seams before runtime work;
- implementation must not casually redesign the architecture to make one fixture pass;
- review may change architecture when source evidence proves it wrong, but the decision and downstream contract changes must be recorded;
- broad planning documents should describe durable cross-epic boundaries, while per-epic architecture documents own detailed APIs and file-level implementation contracts.

For overlapping long-running PRs, prefer **one planning owner on `main`** and make implementation branches consume/reconcile that planning before merge. Avoid editing the same roadmap/index sections independently on multiple branches without a merge protocol.

## Feature Prompt Template

```text
You are implementing a Meowcenary feature.

Repository: Joncallim/Meowcenary
Feature:
Epic:
Goal:

Read in order:
- README.md
- docs/knowledge-graph.md
- docs/epics.md
- docs/roadmap.md
- docs/architecture.md
- docs/ai-workflow.md
- the most specific relevant docs/architecture/epic-*.md
- docs/architecture/alpha-3-content-extensibility-contract.md if Epic 20–26
- relevant live source and tests

Constraints:
- Phaser 3 + TypeScript + Vite.
- No ads, paid upgrades, account requirements, energy systems, or manipulative pacing.
- Combat remains auto-targeted; no required manual/twin-stick aiming.
- Touch, keyboard, and controller paths converge on shared logical actions where applicable.
- Prefer validated data for content/tuning and registries for genuinely different mechanics.
- Keep scene files as composition/lifecycle glue, not rule owners.
- All gameplay randomness uses named run-scoped RNG streams.
- Persistent changes require explicit migration-safe ownership.
- Do not special-case content IDs in runtime code when a registered primitive/data definition can express the behavior.

Deliver:
- architecture note/work package if missing;
- implementation only within the agreed scope;
- focused tests plus catalog/conformance tests where applicable;
- validation commands and results;
- manual player-experience checklist/evidence;
- for Alpha 3, a data-only second-fixture proof for the extensibility gate.
```
