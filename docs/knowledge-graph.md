# Meowcenary Knowledge Graph

> Token-optimized repo map. Read this before implementation work.
> Current state: **Epics 0–15 complete; Epic 16 architecture/art direction merged in PR #82 and runtime PR #83 is open but must sync current `main` before merge; Epics 17–19 are the remaining Alpha 2 Golden Run work. Alpha 3 runtime is gated by Issue #92, then Epics 20–26.**

## Read Order

1. This file.
2. `docs/epics.md`.
3. `docs/roadmap.md`.
4. `docs/architecture.md`.
5. Most specific epic architecture document.
6. For Alpha 3: `docs/architecture/alpha-3-shared-foundation.md` + `alpha-3-content-extensibility-contract.md`.
7. Live source + tests.

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
- controller/touch work deliberately centralized into Epic 19 rather than scattered device branches.

## Known Current Gaps / Transition Risks

### PR #83

Epic 16 runtime work is complete on its branch but the PR is currently non-mergeable after newer `main` planning changes. Sync `main`, preserve newer shared planning, retain Epic-16-specific delivery updates, rerun the full Epic 16 gate, then merge before Epic 17 implementation.

### Input

Current live input is keyboard + pointer/touch. UI keyboard handling is still distributed across views/scenes. Epic 19 must freeze one shared logical action layer; do not bolt gamepad branches onto every view.

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

Current Save V2 meta state is intentionally small: scrap + unlocks + permanent-upgrade levels. Do not append stage/achievement/Gunsmith/character/equipment state one field at a time. Issue #92 freezes Save V3 domain ownership and V2 migration first.

Preserve existing shipped content IDs; do not mass-rename `scrap-tabby`, `junkyard-lot`, weapon IDs, etc. for namespace aesthetics.

### Weapon registry

Before persistent Gunsmith work, reconcile the weapon registry's static-definition immutability/validation with the validated immutable-registry convention used by characters/arenas/loot. Do not create a generic registry framework unless later domains prove enough repetition.

## Alpha 2 Routing

### Epic 17 (#76) — combat feel / shared effect seam

- pistol/SMG/shotgun must be distinguishable by feel;
- new gameplay-affecting behavioral effects use a small reusable effect vocabulary;
- no family/tier/content-ID branches in `GameScene`;
- Epic 18 may reuse approved effects;
- Epic 23 later composes the same effect semantics;
- do not implement speculative Gunsmith traits early.

### Epic 18 (#77) — upgrade-card expansion

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

### Epic 19 (#78) — touch + controller gate

```text
Touch ───────┐
Keyboard ────┼─> logical action layer -> gameplay/UI commands
Controller ──┘
```

Requirements:

- auto-fire remains primary;
- no required twin-stick/right-stick aiming;
- validate anchored/floating touch movement and sustained ergonomics;
- one simple dash/evade only if movement-only fails the experience gate;
- full controller-only menu -> run -> upgrades -> rack/merge -> settings -> summary -> Retry/Menu;
- deadzones, focus, disconnect/reconnect, active-input switching, duplicate suppression;
- reserve `ability` for Epic 24.

## Alpha 3 Mandatory Foundation — #92

No Epic 20 runtime implementation before `docs/architecture/alpha-3-shared-foundation.md` is reviewed/frozen.

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

Persistent gun/parts/traits, crafting outside combat, bounded infusion, explicit part pools. Reuse approved combat-effect semantics from real Epic 17/18 work. Reconcile weapon registry immutability before persistent build state depends on it.

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

Permanent Alpha 3 architecture docs link shared contracts instead of copying them. Keep large CI/browser/manual execution evidence in the PR/checks or concise `docs/delivery/` records.

## First Steps for Any Agent

1. This file.
2. `docs/epics.md`.
3. `docs/roadmap.md`.
4. Shared/epic architecture docs.
5. Live source + tests.
6. Baseline validation -> implement -> lint/test/build/content-specific gates.

For Epics 20–26: stop before runtime work unless #92 is complete and the Epic has a dedicated architecture document.
