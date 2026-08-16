# AI Workflow

## Feature Lifecycle

1. **Architecture**
   - Define interfaces and ownership boundaries.
   - Identify state flow and lifecycle.
   - Specify data files, registries, persistence changes, and migrations.
   - Write automated acceptance, player-experience gates, reviewer traps, and compatibility constraints.
   - Inspect the live repository before freezing contracts; do not architect from stale issue text alone.

2. **Implementation**
   - Implement only the agreed feature slice.
   - Keep balance/content in validated data where practical.
   - Add focused tests for pure rules, lifecycle, validation, persistence, and catalog conformance.
   - Avoid unrelated refactors and content-ID special cases.

3. **Review / Hardening**
   - Check architecture compliance.
   - Check whether scene code stayed composition/lifecycle glue rather than becoming a rule owner.
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
   - Record accepted limitations or deferred P2/P3 findings.
   - Merge only after the delivery record and player-experience gate are actually satisfied.

## Source-Of-Truth Order

For repository work use:

1. current maintainer instruction;
2. current `main` planning/index docs;
3. shared cross-cutting architecture contracts;
4. the most specific merged architecture document for the feature;
5. live implementation/tests;
6. the GitHub issue for product scope where no newer architecture supersedes it.

An open implementation PR may be the implementation truth for its branch, but it does not supersede newer planning already landed on `main`. Before merging a long-lived implementation PR, sync current `main` and resolve documentation conflicts deliberately rather than taking one side wholesale.

## Alpha 3 Shared Foundation Gate

No Epic 20 runtime implementation begins until Issue #92 / [`architecture/alpha-3-shared-foundation.md`](architecture/alpha-3-shared-foundation.md) has frozen the shared Alpha 3 contracts.

Epics 20–26 inherit both:

- [`architecture/alpha-3-shared-foundation.md`](architecture/alpha-3-shared-foundation.md)
- [`architecture/alpha-3-content-extensibility-contract.md`](architecture/alpha-3-content-extensibility-contract.md)

The shared foundation owns cross-epic decisions such as:

- Stage/Contract as the Alpha 3 composition root;
- the migration away from Arena/SpawnCurve owning the normal stage's encounter/victory semantics;
- Save V3 domain ownership and V2 migration compatibility;
- stable-ID compatibility policy;
- shared unlock/condition and reward/grant vocabularies;
- catalog/registry/conformance registration rules;
- save-schema version versus content/catalog version;
- deterministic explicit content pools;
- the future asset-bundle seam.

Later Epic architecture documents **reference** these shared rules rather than re-deriving or copying them.

## Alpha 3 Extensibility Rule

Default rule:

> Adding another instance of an existing content type should require validated data + assets, not core gameplay-system source changes.

Before an Alpha 3 architecture is marked implementation-ready, it must answer:

- What are the stable IDs and persistence keys?
- Which definitions are data and which genuinely new mechanics are registered code?
- How are cross-catalog references validated?
- How are encounter/difficulty/reward concerns separated where relevant?
- Does it reuse the shared condition/reward contracts from #92?
- Does new global content silently perturb an old seeded content pool?
- Does ordinary content addition require a save-schema migration? If yes, why?
- How are assets resolved without per-content scene edits?
- What generic conformance test automatically validates every definition?
- What **second representative fixture** proves that ordinary new content is data/assets-only?

A new mechanic may add one registered/tested primitive. After that, further content using the mechanic should again be data-only. Do not create a generic ECS, scripting language, behavior-tree platform, visual scripting layer, DLC system, or mod API without evidence from real product use cases.

## Alpha 2 → Alpha 3 Seam Rules

### Epic 17 / 18 combat effects

If Epic 17 or 18 introduces gameplay-affecting behavioral weapon effects, define a small reusable effect vocabulary and one authoritative resolution path. Do not build an Epic-17-only or card-only effect system that Epic 23 must later replace.

Do not implement speculative Gunsmith mechanics early; only generalize effects that actual Alpha 2 content uses.

### Epic 18 / 19 upgrade input

The upgrade engine may offer 4–5 cards, but keyboard/controller selection should converge on generic focus/navigation + confirm. Do not extend the current `1`/`2`/`3` key shortcut into the core `1`–`5` architecture. Number keys may remain optional shortcuts.

### Scene boundary

Reject new domain rules in `GameScene` when they belong to a stage/objective, achievement, ability, equipment, Gunsmith, or progression owner. The scene wires systems and lifecycle; it does not branch on content IDs.

## Planning vs Delivery Evidence

Future Alpha 3 architecture documents should contain durable design information only:

- decisions and contracts;
- ownership/module maps;
- compatibility/migration rules;
- ordered implementation slices;
- acceptance tests;
- reviewer traps and justified exceptions.

Do not copy multi-page shared contracts into every Epic document. Link the shared files.

Large execution evidence belongs primarily in:

1. the pull-request body/checklist;
2. hosted CI/checks;
3. a concise [`delivery/`](delivery/) record only when durable manual/delivery evidence is useful after merge.

See [`delivery/README.md`](delivery/README.md).

## Planning / Delivery Rule

Architecture and implementation should stay on separate conceptual gates even when they share one delivery PR:

- architecture freezes product decisions and extension seams before runtime work;
- implementation does not casually redesign the architecture to make one fixture pass;
- review may change architecture when source evidence proves it wrong, but the decision and downstream contract changes must be recorded;
- broad planning docs describe durable cross-epic boundaries; per-epic architecture owns only its specific APIs, slices, and exceptions.

For overlapping long-running PRs, prefer **one planning owner on `main`** and make implementation branches consume/reconcile that planning before merge. Avoid independently editing the same roadmap/index sections on several branches without a merge protocol.

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
- docs/architecture/alpha-3-shared-foundation.md if Epic 20–26
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
- Preserve shipped content IDs unless an explicit migration requires otherwise.

Deliver:
- architecture note/work package if missing;
- implementation only within the agreed scope;
- focused tests plus catalog/conformance tests where applicable;
- validation commands and results;
- manual player-experience checklist/evidence;
- for Alpha 3, a data-only second-fixture proof for the extensibility gate.
```
