# Reusable V4 Content PR Checklist

Use this template for every ordinary content-expansion PR after the Alpha 3 V4 cleanup boundary.

**Authority:** `alpha-3-final-execution-handoff.md` and `content-authoring-templates-v4.md` supersede conflicting older planning details. The legacy permanent/meta-upgrade catalog is migration history, **not** an ordinary V4 content template.

```markdown
## Content template

**Template class(es):** character / ability / passive / enemy / boss / weapon / run-upgrade / equipment-set / equipment-piece / gun-part / achievement / stage-contract / encounter / difficulty / reward / loot-table / arena-world / visual-art / audio / compendium

**Mechanic status:** existing primitive / new primitive

If `new primitive`, explain why an existing registered mechanic cannot express the content and identify the one new reusable implementation being added. Later content using that primitive must return to the data/assets-only path.

## Stable identities

- Catalog IDs added:
  - `...`
- Logical art IDs added:
  - `...`
- Physical art resources added/repacked:
  - `...`
- Audio IDs added:
  - `...`

No existing stable content/logical-art ID was renamed solely for naming symmetry or atlas packing.

## Authoritative ownership

- Mechanical truth owner:
- Unlock/availability truth owner:
- Presentation/copy owner:
- Logical art owner/reference:
- Persistence owner, if any:

Confirm:

- no authoritative fact is duplicated into a second catalog;
- Equipment Set facts live on the Set, not a provider piece;
- Equipment tier access uses the one shared V4 Equipment upgrade policy, not per-Set duplicated gates;
- achievement/stage/boss/mastery facts are read from their authoritative save domains rather than shadow unlock tokens.

## Definition versus owned-instance state

For persistent Equipment/Parts confirm:

- [ ] no static Equipment definition `tier`
- [ ] no static Part definition `tier`
- [ ] no definition-authored owner `sourceId`
- [ ] owned instance carries mutable engineering/equipment tier
- [ ] modifier source identity is derived at runtime
- [ ] multiplicative tier scaling uses `1 + (value - 1) × tier`

## Unlock / acquisition route

- Character condition:
- Equipment Set condition + piece fabrication cost:
- Part condition + fabrication cost **or** deterministic reward source:
- Achievement condition/metric:
- Stage/Contract unlock:

Confirm the release definition is actually obtainable and does not depend on itself or a circular/unsatisfiable chain.

## Explicit composition

- Encounter profiles deliberately changed:
- Reward profiles deliberately changed:
- Loot tables deliberately changed:
- Asset/resource bundles deliberately changed:
- Weapon/Part reward pools deliberately changed:

Confirm that adding the global definition does **not** silently enter untouched deterministic pools.

## Persistence

**Save migration required:** No / Yes

For an ordinary new definition, the expected answer is **No** because player state is sparse/stable-ID keyed. If Yes, explain the structural schema change rather than the content count.

Do not rename the historical physical LocalStorage key merely because the active save schema version changes.

## Presentation / art resources

- Relevant family brief instantiated:
- Closest gameplay/semantic collision:
- Closest visual collision:
- Black-silhouette/grayscale distinction checked:
- Reduced-motion/static behavior checked where relevant:
- Logical art ID(s):
- Renderer kind(s):
- Physical resource / atlas frame mapping:
- Bundle membership:
- Editable source path:
- Deterministic builder/import path:
- Runtime export/atlas path:

Confirm:

- semantic ownership did not create a new renderer kind;
- static icons may share a physical atlas/resource without changing logical IDs;
- this content did not add a one-off global Boot preload;
- required source/builder/export provenance remains machine-verifiable.

## Generic conformance

- Catalog validation:
- Cross-reference validation:
- Acquisition-coverage validation:
- Synthetic N+1/scale gate affected:
- Art/source/export parity gate:
- Deterministic pool regression:
- Large-list/read-model test where applicable:

No generic validator/controller/builder test was edited merely to append the new content ID to a hard-coded list.

An explicit release-spec assertion may intentionally change when the shipped product count changes; state that separately.

## Runtime-code diff test

List source-code files changed outside data/presentation/art/test fixtures.

For ordinary content using existing primitives, expected result is **none** in:

- scenes/controller routing;
- save schema;
- renderer switches;
- loader core;
- validator-core ID enumerations;
- content-ID gameplay branches.

Any such change requires explanation as either:

1. a genuinely new reusable mechanic primitive; or
2. remediation of existing template debt, not content-specific branching.

## Product / manual proof

- Plain-language content thesis:
- Relevant menu/detail surface:
- Gameplay/run path:
- Controller-only path:
- Touch path:
- Keyboard path:
- 390×844:
- 360×640 where applicable:
- Desktop:
- Crowded combat/readability if relevant:
- Reward/unlock presentation if persistent:

## Final declaration

- [ ] ordinary N+1 content scales through the V4 template
- [ ] no hidden provider/order convention introduced
- [ ] no content-ID branch introduced
- [ ] no per-content save field introduced
- [ ] no static instance state leaked into catalog definitions
- [ ] no duplicated authoritative unlock/progression fact introduced
- [ ] no implicit old-pool perturbation introduced
- [ ] no new renderer kind solely for semantic ownership
- [ ] no new global Boot preload solely for this content
- [ ] stable logical IDs survive physical resource/atlas packing
- [ ] acquisition route is satisfiable
- [ ] deterministic source/export reproduction passes
- [ ] generic N+1/scale proof remains green
```

Read these documents in order when the checklist needs interpretation:

1. `alpha-3-final-execution-handoff.md`
2. `content-authoring-templates-v4.md`
3. `alpha-3-test-transition-plan.md`
4. `alpha-3-scalability-closeout.md`
5. `content-authoring-template-coverage.md` for historical/supporting-catalog audit detail

The checklist is intentionally boring. That is the target: ordinary content should be a predictable data/assets/presentation change; new mechanics should be the exceptional, explicit engineering work.