# Meowcenary Knowledge Graph

> Token-optimized repo map. Read this before implementation work.
> Current state: **Epics 0–18 are complete; Epic 19 Slices 1–4 are merged and Slice 5 is closing the gate. The frozen contract and evidence record are authoritative; D10 and lived late-wave evidence remain open. After Epic 19, Issue #94 performs repository certification/remediation. Alpha 3 architecture #92 remains blocked by #94.**

## Read Order

1. This file.
2. `docs/epics.md`.
3. `docs/roadmap.md`.
4. `docs/architecture.md`.
5. Most specific epic architecture document.
6. Post-Epic-19 closeout: Issue #94.
7. For Alpha 3 after #94 passes: `docs/architecture/alpha-3-shared-foundation.md` + `alpha-3-content-extensibility-contract.md`.
8. Live source + tests.

Open implementation branches are branch implementation truth only; they do not supersede newer planning already landed on `main`.

## Stack

```text
Phaser 3.90 + TypeScript 5.8 + Vite 7 + Vitest 3.2
Node 22, ES2022, strict, noEmit. Canvas 390×844, browser-first, mobile-friendly.
```

## Current Structural Strengths

- `engine/` + `gameplay/`: Phaser-free pure/testable rules.
- `scenes/`: composition/lifecycle owners; must not become content-ID rule engines.
- descriptor-driven aggregate validation with cross-reference ordering guarantees.
- immutable validated registries for characters/arenas/loot and similar data domains.
- named run-scoped RNG streams; never `Math.random()` for gameplay.
- versioned save migration + one persistent mutation boundary.
- six-slot run rack + deterministic weapon reward stream.
- the Phaser-free logical core, one InputController adapter boundary, focus journey, and touch configuration are implemented; unresolved real-device rows are evidence gaps, not architecture gaps.
- one fail-closed visual-art manifest (`src/data/visual-art.json`, `src/systems/visualArt.ts`) drives every actor/weapon/pickup/world sprite; pooled presentation (`src/entities/heldWeaponView.ts`, `src/systems/defeatPresentation.ts`, `src/systems/arenaScenery.ts`) stays physics-free and cannot change combat/collision behavior.

## Known Current Gaps / Transition Risks

### Input

```text
src/engine/logicalInput.ts -> pure held/edge/coalescing/repeat/movement ownership
src/systems/input.ts       -> Phaser keyboard/pointer/gamepad adapters + lifecycle
scenes/views               -> context routing and command owners; no device branches
```
The frozen contract is [`architecture/epic-19-player-ux-and-alpha-2-gate.md`](architecture/epic-19-player-ux-and-alpha-2-gate.md); gate truth is [`delivery/epic-19-player-experience-gate.md`](delivery/epic-19-player-experience-gate.md).

### Stage ownership

Current Alpha 2 relationship:

```text
Arena -> spawnCurveId -> waves + duration -> GameScene duration victory
```

This is **not** the Alpha 3 normal stage architecture.

Alpha 3 target:

```text
Stage/Contract
  -> Arena
  -> Objective
  -> Encounter Profile
  -> Difficulty Profile
  -> Reward Profile
  -> optional Boss/Special Encounter
```

Stage/Objective owns success/failure. Arena describes the physical world.

### Persistence

Current Save V2 meta state is intentionally small: scrap + unlocks + permanent-upgrade levels. Do not append stage/achievement/Gunsmith/character/equipment state one field at a time. Issue #92 freezes Save V3 domain ownership and V2 migration only **after #94 certifies/remediates the final Alpha 2 baseline**.

Preserve existing shipped content IDs; do not mass-rename `scrap-tabby`, `junkyard-lot`, weapon IDs, etc. for namespace aesthetics.

### Weapon registry

If the weapon registry's static-definition immutability/validation still differs materially from validated immutable registries after Epic 19, #94 treats that as repository debt and fixes it before #92. Do not knowingly carry the inconsistency into persistent Gunsmith planning.

## Alpha 2 Routing

### Epic 17 (#76) — combat feel / shared effect seam

Runtime complete in PRs #96–#102; architecture and delivery records define the shipped presentation/audio identity and data changes.

- pistol/SMG/shotgun must be distinguishable by feel;
- new gameplay-affecting behavioral effects use a small reusable effect vocabulary;
- no family/tier/content-ID branches in `GameScene`;
- Epic 18 may reuse approved effects;
- Epic 23 later composes the same effect semantics;
- do not implement speculative Gunsmith traits early.

### Epic 18 (#77) — upgrade-card expansion — complete in PR #106

- ~15–20 meaningful temporary upgrades;
- normally 4–5 visible choices;
- authoritative owned/current/max-stack state;
- placeholder visual for every card;
- richer behavior/build choices via approved shared effect contracts;
- cards remain run-scoped and separate from persistent Gunsmith progression.

### Epic 18/19 chooser input seam

The engine may offer 4–5 cards. Do not make `1`–`5` the primary selection architecture.

```text
Touch -> direct card selection
Keyboard/Gamepad -> focus navigation + confirm
Optional number keys -> shortcut only
```

All routes reach the same authoritative chooser command/token validation.

### Epic 19 (#78) — touch + controller gate — Slices 1–4 merged; Slice 5/evidence pending

```text
Touch ───────┐
Keyboard ────┼─> logical action layer -> gameplay/UI commands
Controller ──┘
```

Requirements:

- auto-fire remains primary;
- no required twin-stick/right-stick aiming;
- floating touch is production; anchored remains config-only diagnostic and
  unverified unless a material floating issue requires it (not an open
  production choice);
- one simple dash/evade only if movement-only fails the experience gate;
- full controller-only menu -> run -> upgrades -> rack/merge -> settings -> summary -> Retry/Menu;
- deadzones, focus, disconnect/reconnect, active-input switching, duplicate suppression;
- reserve `ability` for Epic 24.

## Mandatory Post-Alpha-2 Repository Certification — #94

After Epic 19 is merged and its player-experience gate passes, **stop feature/Alpha 3 architecture work** and execute Issue #94 against current `main`.

#94 is a complete multi-axis repository audit **and remediation gate**, not a findings report.

Review scope includes, at minimum:

- architecture/domain ownership;
- coding best practices and TypeScript/API quality;
- modularity, cohesion, coupling, file/function structure;
- reusability/extensibility and abstraction quality;
- data/catalog/registry/validation design;
- persistence/migrations/data integrity;
- determinism/RNG/time/event ordering;
- state machines/reentrancy/idempotency;
- input parity and controller/touch architecture;
- UI/read models/accessibility/responsiveness;
- gameplay/physics systemic correctness;
- lifecycle/cleanup/leaks;
- performance/memory/allocation/pooling;
- error handling/failure recovery;
- test architecture and adversarial coverage;
- build/CI/configuration/dependencies/security;
- browser/mobile/future native-wrapper portability;
- visual/audio asset pipeline;
- dead code/legacy scaffolding/duplication;
- documentation/planning truth;
- naming/ID/semantic consistency;
- developer/AI-agent ergonomics;
- final cross-axis interaction review.

### Non-deferral rule

> **Anything with credible downstream implications is fixed in #94, even if it does not directly affect Alpha 3's first slices.**

Downstream implications include future cost to correctness, architecture, maintainability, modularity, reuse, tests, determinism, performance, portability, security, developer/agent quality, debugging, content authoring, or refactoring.

P0/P1 findings must be fixed. Downstream-relevant P2 findings also default to **must fix**. Deferral is permitted only for genuinely isolated/local issues with explicit evidence that they create no credible downstream cost and that fixing them now would be disproportionate.

#94 requires remediation plus a second independent orthogonal pass. It closes only with an explicit **PASS** verdict and no unresolved P0/P1 or downstream-relevant P2 findings.

The output of #94 is the certified Alpha 2 baseline that #92 must consume.

## Alpha 3 Mandatory Foundation — #92

#92 is blocked by #94. Do not begin its implementation-ready architecture pass until #94 closes PASS.

#92 owns shared cross-epic contracts:

- Stage/ResolvedRunPlan boundary + Alpha 2 compatibility;
- Stage/Objective victory ownership;
- Save V3 domain envelope + V2 migration;
- existing-ID compatibility;
- shared condition evaluator;
- shared reward/grant application;
- catalog/registry/conformance registration pattern;
- content version vs save schema version;
- explicit deterministic pools;
- future asset-bundle seam;
- future `content:validate` command contract;
- architecture vs delivery-evidence split.

Also inherit `alpha-3-content-extensibility-contract.md`:

> Existing-mechanic content additions are data/assets-only and each Epic proves this with a second representative fixture.

## Alpha 3 Product Graph

```text
Epic 19 Alpha 2 Gate
        |
        v
#94 Full Repository Certification + Remediation
        |
        v
#92 Shared Alpha 3 Foundation
        |
        v
Epic 20 Contracts/Stages (#85)
        |
        v
Epic 21 Enemy Roster + Bosses (#86)
        |
        +---- authoritative stage/combat/boss facts ----+
                                                         v
                                      Epic 22 Achievements/Mastery (#91)
                                              |
                 +----------------------------+----------------------------+
                 v                            v                            v
      Epic 23 Gunsmith (#87)       Epic 24 Mercenaries (#88)    Epic 25 Armour (#89)
                 +----------------------------+----------------------------+
                                              v
                             Epic 26 Progression Integration (#90)
```

### Epic 20

- stage is normal run entry/composition root;
- objective state owns success/failure;
- reusable arena/objective/encounter/difficulty/reward profiles;
- frontier pressure ~3-minute intended clear window;
- four normal stages + boss Stage 5 initial cadence;
- new stage with existing primitives = data/assets only.

### Epic 21

Target behaviors: Grunt, Runner, Brute, Shooter, Charger, Spawner, Shielded, Splitter/Disruptor. Bosses compose registered abilities/phases. Explicit encounter pools prevent new global content from perturbing old seeds.

### Epic 22

Game-owned standard/incremental/hidden/mastery achievements. Local state authoritative; Game Center/Google Play mirrors only. Reuse #92 conditions/grants. Combat/stage systems emit authoritative facts; they do not maintain achievement counters.

### Epic 23

Persistent gun/parts/traits, crafting outside combat, bounded infusion, explicit part pools. Reuse approved combat-effect semantics from real Epic 17/18 work. #94 removes any material Alpha 2 weapon-registry/definition debt before persistent build state depends on it.

### Epic 24

>3 mercenaries, target ~8. Distinct base/passive/start identity + one simple active ability through Epic 19 logical actions. Data definitions reference registered passive/ability primitives.

### Epic 25

Helmet/Armour/Gloves/Boots, target ~8 set families, 2/4 bonuses, coin upgrades, milestone-tier unlocks, no touch-only management flow.

### Epic 26

One clear responsibility per persistent layer; shared #92 condition/grant grammar; simplify redundant legacy meta upgrades; prevent easiest-stage grind.

## Progression Boundaries

```text
RUN-SCOPED
  XP -> upgrade cards -> temporary build
  weapon pickups -> six-slot rack -> temporary merges

PERSISTENT
  stages/bosses -> milestone facts/content progress
  achievements/mastery -> game-owned accomplishment/unlock primitive
  Gunsmith -> persistent weapon engineering
  equipment -> persistent loadout/set progression
  mercenaries -> persistent playable identities
  coins/scrap -> appropriate owned-item improvement, NOT universal gate bypass

OPTIONAL MIRRORS
  Game Center / Google Play Games <- achievements only; never progression authority
```

## Content / Catalog Recipe

For a new extensible domain:

1. static JSON/data definition;
2. focused strict validator;
3. register in aggregate catalog descriptor boundary;
4. cross-reference validation;
5. immutable lookup registry if runtime lookup is needed;
6. registered code only for genuinely new mechanics;
7. generic catalog-wide conformance tests;
8. data-only second fixture.

New Alpha 3 validators may move into focused modules; preserve the current aggregate registration/error-order contract.

## Persistent-System Recipe

1. Static definitions separate from serializable owned/progress state.
2. Shared Save V3 domain ownership first.
3. Pure transactional commands/grants.
4. UI consumes immutable read models.
5. Unknown stale IDs fail soft.
6. Ordinary new content does not trigger schema migrations.
7. Local game state stays authoritative over platform mirrors.

## Documentation Rule

Permanent architecture docs link shared contracts instead of copying them. Keep large CI/browser/manual execution evidence in the PR/checks or concise `docs/delivery/` records.

## First Steps for Any Agent

1. This file.
2. `docs/epics.md`.
3. `docs/roadmap.md`.
4. Shared/epic architecture docs.
5. Live source + tests.
6. Baseline validation -> implement -> lint/test/build/content-specific gates.

After Epic 19: stop and execute #94 before #92. For Epics 20–26: stop before runtime work unless #94 passed, #92 is complete, and the Epic has a dedicated architecture document.
