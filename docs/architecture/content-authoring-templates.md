# Alpha 3 Content Authoring Templates — Historical Redirect

**Status:** superseded by the V4 authoring contract. **Do not use this file as the current content template.**

Current authority:

1. [`content-authoring-templates-v4.md`](./content-authoring-templates-v4.md) — canonical ordinary-content/N+1 schema and authoring rules.
2. [`alpha-3-final-execution-handoff.md`](./alpha-3-final-execution-handoff.md) — final implementation sequencing and cross-system ownership.
3. [`content-template-pr-checklist.md`](./content-template-pr-checklist.md) — reusable V4 content PR gate.
4. [`alpha-3-test-transition-plan.md`](./alpha-3-test-transition-plan.md) — which RC1 contracts are preserved versus deliberately replaced.

The pre-V4 template was created during the extensibility audit and correctly identified important debt, but later review changed material target contracts. V4 now explicitly owns, among other things:

- first-class Equipment Set definitions plus **one global Equipment tier policy**;
- no static Equipment/Part definition tier;
- source-free definition modifiers and runtime-derived source identity;
- generic availability/fabrication/acquisition coverage;
- retirement of permanent/meta-upgrades as an ordinary content domain;
- stable logical art IDs separated from physical resources/atlases;
- coarse renderer kinds and lazy resource bundles;
- exact stable-ID coverage and large N+1 scale proofs.

The derivation is preserved in [`alpha-3-checkpoint-review-ledger.md`](./alpha-3-checkpoint-review-ledger.md) and Git history. The obsolete template text is intentionally removed from the live docs to prevent future agents from treating two different schemas as canonical.