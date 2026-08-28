# Meowcenary Agent Guide

## Purpose

Meowcenary is a browser-first, mobile-friendly Phaser 3 roguelite. TypeScript
gameplay is the product source of truth; balance and content should remain
data-driven, while human playtesting decides whether a mechanic is fun.

## Read First

1. `README.md`
2. `docs/knowledge-graph.md`, `docs/epics.md`, and `docs/roadmap.md`
3. `docs/architecture.md` and `docs/ai-workflow.md`
4. The most specific relevant file under `docs/architecture/`
5. The affected source and tests

Current maintainer instructions and newer merged planning override stale issue
text. Epics 20-26 also inherit the Alpha 3 shared-foundation and content-
extensibility contracts named in `docs/ai-workflow.md`.

## Non-Negotiable Invariants

- Keep scenes thin: they compose objects and lifecycle; systems own rules.
- Combat remains auto-targeted. Do not make manual or twin-stick aiming required.
- Touch, keyboard, and controller inputs converge on shared logical actions.
- Put tuning and ordinary content in validated data under `src/data/` where
  practical. New content must not accumulate runtime branches on content IDs.
- Use registered, tested primitives for genuinely new mechanics.
- Route gameplay randomness through named, run-scoped RNG streams.
- Preserve stable content and persistence IDs unless an explicit migration
  changes them. Persistent mutations stay behind the versioned save boundary.
- Preserve pause, lifecycle, and deterministic replay assumptions.
- Do not add ads, paid progression, energy systems, accounts, or manipulative
  pacing.

## Repository Map

- `src/data`: gameplay definitions and tuning.
- `src/engine`: framework-agnostic primitives such as RNG, logical input,
  events, cadence, cooldowns, and pooling; it must not import Phaser.
- `src/gameplay`: pure run and progression rules; it must not import Phaser.
- `src/systems`: Phaser-aware coordinators, registries, validation, and saves.
- `src/entities`: player, enemies, projectiles, and drops.
- `src/scenes`: Phaser composition and lifecycle only.
- `src/platform`: browser and device adapters.
- `src/ui`: HUD and menus.
- `assets-src`, `public/assets`, `docs/art`: art sources, runtime assets, and
  validation rules.
- `tests`: unit, lifecycle, persistence, and conformance coverage.

## Focused Routing And Ownership

- Architecture or cross-system work: one architecture/domain owner defines the
  state flow, interfaces, persistence impact, and acceptance gates first.
- Gameplay implementation: one implementer owns the affected system plus focused
  tests; a separate reviewer checks determinism and scene boundaries.
- UI/input work: use a UI/input implementer and independently verify keyboard,
  controller, touch, focus, pause, and narrow-screen behavior as applicable.
- Content or balance work: use a data/content owner; keep subjective tuning
  findings separate from correctness defects.
- Art-pipeline work: use an asset owner and run the art validator.
- Give each file one writer. Review and playtest passes are read-only unless
  explicitly assigned fixes.

## Validation

Run the narrowest relevant checks, then the full closeout gate for substantive
changes:

```bash
npm run lint
npm run test
npm run build
```

For visual-art or asset-manifest changes also run:

```bash
npm run art:validate
```

Add feature-specific tests for pure rules, lifecycle, validation, persistence,
catalog conformance, and deterministic RNG. Record manual playtest/device rows
honestly; unavailable environments remain unverified.

## Risk Triggers

Require an independent adversarial review for save migrations, stable IDs,
randomness, input/pause behavior, platform adapters, storage, or large scene
changes. Treat performance pooling, asset registries, and cross-epic shared
contracts as cross-cutting work. Never merge a planning conflict by blindly
taking one side; reconcile against current `main` and record the decision.
