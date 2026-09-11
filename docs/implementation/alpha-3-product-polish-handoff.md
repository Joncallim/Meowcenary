# Alpha 3 Product Polish — Codex Handoff

**Planning branch:** `codex/alpha3-product-polish-plan`

**Reviewed live baseline:** PR #177 at `e9576ee1245f67fae48b9a615e47a3d300dc0f86`.

**Authoritative plan:** [`../architecture/alpha-3-product-polish-and-contracts.md`](../architecture/alpha-3-product-polish-and-contracts.md).

Read `AGENTS.md`, the normal repository read-order docs, then the authoritative plan above. Do not redesign the work from this dispatch note.

Execution order:

1. On PR #177's own branch, first resolve its four currently open Codex P2 review threads only: paused ability-FX time, zero-duration burst visibility, orientation input quarantine, and activation-coordinate anchoring. Add regressions, run full gates, and obtain a fresh clean review.
2. Rebase this planning branch onto that corrected #177 head and use it for the next stacked PR. Implement the plan's PR A: graphical/repositioned ability control, deterministic post-upgrade resume grace, illustrated Compendium, and grouped/dedicated-art Equipment UI.
3. After PR A is green and review-clean, create a separate stacked PR for PR B: Contract -> Levels hierarchy and presentation-only future-map placeholders.
4. Deploy exact candidate SHAs as appropriate, but do not claim the physical-phone acceptance rows unless they were actually executed on a phone.

Hard boundaries:

- no Save V5;
- no Stage ID renames;
- no content-ID branches for ability/Equipment/Compendium presentation;
- no fake playable Arena definitions for map placeholders;
- no unrelated whole-menu redesign;
- do not close #87;
- preserve touch/keyboard/controller convergence and 44px physical targets;
- write RED regressions first and keep each PR independently reviewable.

When implementation evidence genuinely contradicts the plan, stop the affected slice, document the contradiction, and resolve the architecture before continuing. Otherwise execute it directly and autonomously through code, tests, review, exact-SHA deployment preparation, and truthful acceptance reporting.