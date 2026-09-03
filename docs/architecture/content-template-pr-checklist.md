# Reusable Content PR Checklist

Use this template for every ordinary content-expansion PR after Alpha 3.

```markdown
## Content template

**Template class(es):** character / ability / passive / enemy / boss / weapon / run-upgrade / permanent-upgrade / equipment-set / equipment-piece / gun-part / achievement / stage-chapter / encounter / difficulty / reward / loot-table / arena-world / visual-art / audio / compendium

**Mechanic status:** existing primitive / new primitive

If `new primitive`, explain why an existing registered mechanic cannot express the content and identify the one new reusable implementation being added.

## Stable identities

- Catalog IDs added:
  - `...`
- Logical art IDs added:
  - `...`
- Audio IDs added:
  - `...`

No existing stable ID was renamed solely for naming symmetry.

## Authoritative ownership

- Mechanical truth owner:
- Presentation/copy owner:
- Art owner/reference:
- Persistence owner, if any:

No authoritative fact is duplicated into a second catalog.

## Explicit composition

- Encounter profiles deliberately changed:
- Reward profiles deliberately changed:
- Loot tables deliberately changed:
- Asset/resource bundles deliberately changed:

Confirm that adding the global definition does **not** silently enter untouched deterministic pools.

## Persistence

**Save migration required:** No / Yes

For an ordinary new definition, the expected answer is **No** because persisted state is sparse/stable-ID keyed. If Yes, explain the structural schema change rather than the content count.

## Presentation/art

- Relevant family brief instantiated:
- Closest existing visual/semantic collision:
- Black-silhouette/grayscale distinction checked:
- Reduced-motion/static behavior checked where relevant:
- Editable source path:
- Deterministic builder/import path:
- Logical art binding/resource/bundle refs:

## Generic conformance

- Catalog validation:
- Cross-reference validation:
- Synthetic N+1 gate affected:
- Art/source/export parity gate:
- Deterministic pool regression:

No generic validator/controller test was edited merely to append the new content ID to a hard-coded list.

An explicit release-spec assertion may intentionally change when the shipped product count changes; state that separately.

## Runtime-code diff test

List any source-code files changed outside data/presentation/art/test fixtures.

For ordinary content using existing primitives, expected result is **none** in scenes/controllers/save schema/renderer switches/loader core.

Any such change requires explanation as either:

1. a genuinely new reusable mechanic primitive; or
2. remediation of existing template debt, not content-specific branching.

## Manual proof

- Relevant menu/detail surface:
- Gameplay/run path:
- Controller-only path:
- Touch path:
- Keyboard path:
- 390×844:
- Desktop:
- Crowded combat/readability if relevant:

## Final declaration

- [ ] ordinary N+1 content scales through the existing template
- [ ] no hidden provider/order convention introduced
- [ ] no content-ID branch introduced
- [ ] no per-content save field introduced
- [ ] no implicit old-pool perturbation introduced
- [ ] no new renderer kind solely for semantic ownership
- [ ] no new global Boot preload solely for this content
- [ ] stable IDs and presentation references validate
- [ ] deterministic source/export reproduction passes
```

The architectural definitions behind this checklist live in:

- `content-authoring-templates.md`
- `content-authoring-template-coverage.md`
- `alpha-3-scalability-closeout.md`

The checklist is intentionally boring. That is the desired authoring experience: ordinary content should be a predictable data/assets change, while genuinely new mechanics are explicit reusable engineering work.