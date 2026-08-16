# Roadmap

## Current Position

### Complete foundations / MVP systems

- Epics 0–17 are complete.
- Epic 13 merged in PR #79.
- Epic 14 merged in PR #80.
- Epic 15 merged in PR #81.
- Epic 16 merged in PR #83.
- Epic 17 merged in PRs #96–#102.

### Alpha 2 — Golden Run

Alpha 2 finishes **one genuinely good Golden Run** before broad content expansion. It proves combat/build feel, visual identity, touchscreen ergonomics, controller parity, replayability, and a readable player journey.

#### Epic 16 — Visual Identity and Junkyard World (#75)

Complete — architecture/art direction merged in PR #82; runtime merged in PR #83: one
validated 46-binding visual manifest, explicit actor/weapon/pickup art references,
pooled projectile/drop/defeat presentation, authored world data, and a
camera-traversable Junkyard Lot; architecture and delivery record in
[`architecture/epic-16-visual-identity-and-junkyard-world.md`](architecture/epic-16-visual-identity-and-junkyard-world.md).

#### Epic 17 — Combat Feel and Weapon Identity (#76)

Complete — architecture merged in PR #96; runtime merged in PRs #97–#102
across five slices, plus a post-merge orthogonal closeout review. Pistol/SMG/
shotgun tiers and current enemy threats are now perceptually distinct
through code-drawn presentation (muzzle flash, recoil, impact, tier-up pulse,
enemy telegraph/weight cues) and family/tier audio identity, plus the SMG
tier-3 double-tap data change; architecture and delivery record in
[`architecture/epic-17-combat-feel-and-weapon-identity.md`](architecture/epic-17-combat-feel-and-weapon-identity.md).

Additional cross-epic constraint:

- if Epic 17 introduces gameplay-affecting behavioral weapon effects, create a **small reusable combat-effect vocabulary** and one authoritative resolution path;
- do not hard-code family/tier/content IDs in `GameScene`;
- do not create an Epic-17-only effect system that Epic 18 cards or Epic 23 Gunsmith parts later have to replace;
- generalize only effects actually needed by Alpha 2 content—do not implement speculative Gunsmith traits early.

#### Epic 18 — Build Variety and Golden Run Pacing (#77)

Expand the rotating upgrade-card experience and tune the Golden Run:

- ~15–20 meaningful upgrade definitions;
- normally 4–5 visible choices per offer;
- owned/current/max-stack indicators;
- placeholder imagery/icon metadata + resolvable placeholder visuals;
- richer effects/build directions through approved shared effect contracts;
- temporary cards remain separate from persistent Gunsmith progression.

Input boundary with Epic 19:

- the upgrade engine may offer 4–5 cards;
- touch may select a visible card directly;
- keyboard/controller use generic focus/navigation + confirm;
- number keys may remain optional shortcuts, but do **not** make `1`–`5` the ownership model for card selection.

#### Epic 19 — Player UX and Alpha 2 Gate (#78)

Final Alpha 2 player-experience gate:

- auto-fire stays primary across touch, keyboard, and controller;
- compare/validate portrait touch movement and thumb ergonomics;
- movement/positioning must provide enough agency; one simple dash/evade is allowed only if playtesting proves it necessary;
- freeze one platform-neutral logical input/action layer;
- full launch → menu → run → upgrade → rack/merge → settings → summary → Retry/Menu journey must work controller-only;
- validate deadzones, focus navigation, disconnect/reconnect, mixed-input switching, and duplicate-command suppression;
- reserve a future ability action/slot without implementing the full character ability system;
- no required right-stick/manual aiming.

Epic 19 ends only when the Golden Run passes a real player-experience gate on touch and controller, not merely automated tests.

### Mandatory Alpha 2 repository certification — Issue #94

After Epic 19 is merged and its player-experience gate passes, complete **Alpha 2 Closeout: Full Repository Architecture, Quality, and Maintainability Audit (#94)** against the fully merged `main` branch.

#94 is deliberately broader than an Alpha 3 readiness check. It is a whole-codebase certification and remediation gate covering implementation **and** planning across architecture, coding practice, modularity, cohesion/coupling, reusability/extensibility, TypeScript/API quality, state ownership, persistence, determinism, input, UI/accessibility, gameplay/physics, lifecycle/leaks, performance/memory, error recovery, testing quality, CI/build/configuration, dependencies/security, browser/mobile/native-wrapper portability, asset pipelines, documentation truth, dead code/duplication, naming/IDs, developer/agent ergonomics, and cross-system interactions.

Default rule:

> **Findings with credible downstream implications are fixed here, not merely recorded or deferred.**

A finding is downstream-relevant if it creates credible future cost to correctness, maintainability, modularity, reusability, testability, performance, portability, security, agent/developer quality, debugging, content authoring, or future refactoring—even if it does not directly affect Alpha 3's first slices.

Deferral is exceptional and requires evidence that the finding is genuinely isolated/local, creates no credible downstream cost, and would be disproportionately risky/costly to fix now.

#94 requires multiple independent orthogonal passes, a finding ledger, remediation, full regression/manual/lifecycle validation, and a final independent re-review. It closes only with no unresolved P0/P1 or downstream-relevant P2 findings and an explicit **PASS** verdict that the repository is a trusted baseline for any subsequent development phase.

**Architecture #92 is blocked by #94.** #92 must architect from the remediated/certified Alpha 2 codebase rather than compensate for known debt.

---

## Alpha 3 — Depth & Progression

Alpha 3 expands the certified Alpha 2 combat/build baseline into a stage/progression game.

### Mandatory shared architecture gate — Issue #92

After #94 passes, complete **Architecture: Alpha 3 Shared Foundation Contracts (#92)** before any Epic 20 runtime implementation.

Authoritative shared documents:

- [`architecture/alpha-3-shared-foundation.md`](architecture/alpha-3-shared-foundation.md)
- [`architecture/alpha-3-content-extensibility-contract.md`](architecture/alpha-3-content-extensibility-contract.md)

#92 freezes shared concerns once so Epics 20–26 do not independently invent competing versions of them:

- Stage/Contract as the Alpha 3 content-composition root;
- explicit evolution from current `{ characterId, arenaId, seed }` run requests to stage-oriented resolved run plans;
- Stage/Objective state—not Arena/SpawnCurve duration—as the normal Alpha 3 victory owner;
- Save V3 domain ownership and V2 migration, including preservation of `achievement:first-victory` / Bolt Hound access;
- preservation of existing shipped bare content IDs rather than aesthetic mass-renaming;
- one shared unlock/condition vocabulary;
- one shared durable reward/grant vocabulary;
- catalog/registry/conformance registration patterns;
- modular future Alpha 3 validators while preserving the aggregate descriptor boundary;
- explicit deterministic content pools;
- save-schema version separate from content/catalog/balance version;
- future chapter asset-bundle seam built on the validated manifest approach;
- future `content:validate` command contract, implemented only when enough real Alpha 3 catalogs exist;
- architecture documents kept durable/lean, with large execution evidence kept in PR/checks or concise `docs/delivery/` records.

Default extensibility rule:

> **Adding another instance of an existing content type should require validated data + assets, not core gameplay-system source changes.**

Every Epic 20–26 retains its required **data-only second fixture** proof.

### Epic 20 — Contracts, Objectives, and Stage Progression (#85)

Replace the single endurance-format structure with a stage/contract ladder.

Core direction:

- stage selection becomes the normal Alpha 3 run entry point;
- a stage composes reusable arena + objective + encounter + difficulty + reward + unlock references;
- Arena remains the physical world definition, not the owner of stage encounter/victory/reward semantics;
- Stage/Objective owns success/failure state;
- objective families initially include kill, collect, survive, and elite/target contracts;
- frontier stages become severely hostile around the intended ~3-minute clear window;
- initial chapter cadence targets four normal stages + boss Stage 5;
- stage facts feed Epic 22 rather than maintaining duplicate achievement counters;
- another stage using existing primitives must be data/assets-only.

Epic 20 is blocked by #92, which is blocked by #94.

### Epic 21 — Enemy Roster Expansion and Boss Framework (#86)

Expand toward roughly eight behaviorally distinct archetypes:

1. Grunt / swarm.
2. Runner / flanker.
3. Brute.
4. Shooter / projectile enemy.
5. Charger.
6. Spawner.
7. Shielded enemy.
8. Splitter / disruptor.

Bosses are unique milestone encounters with small readable movesets, not inflated normal enemies. Enemy/boss definitions reference reusable registered behaviors/abilities and explicit encounter pools. New variants/boss compositions using existing primitives must be data/assets-only.

### Epic 22 — Achievements, Mastery, and Platform Sync (#91)

Create one game-owned achievement/mastery system:

- standard, incremental, hidden, and mastery achievements;
- sparse persistent local progress;
- exactly-once completion/rewards;
- in-game gallery/progress read models;
- achievement-triggered unlocks through the shared #92 grant vocabulary;
- optional Game Center / Google Play Games mirrors;
- native services never become progression authority;
- ordinary new achievements using existing metric/condition/grant primitives are data-only.

Epic 21 architecture must expose authoritative combat/boss facts for Epic 22 rather than forcing achievement-specific counters into boss code.

### Epic 23 — Persistent Gunsmith and Weapon-Part Crafting (#87)

Persistent weapon engineering outside combat:

- modular receiver/core, barrel, optic, stock, trigger, magazine, underbarrel/specialist slots;
- persistent part inventory/builds;
- bounded merge/upgrade/trait infusion;
- hybrid behavior such as an incendiary conventional barrel;
- reuse the approved combat-effect semantics established by real Epic 17/18 needs rather than creating a parallel damage/effect model;
- explicit part/reward pools;
- ordinary new parts using existing slot/effect/trait primitives are data/assets-only.

Any weapon-registry immutability/validation inconsistency that remains after Epic 19 belongs in #94 and should be fixed there rather than deliberately carried into #92/Epic 23.

### Epic 24 — Mercenary Roster Expansion (#88)

Expand beyond three characters; initial target ~8:

- distinct base/passive/start identities;
- one simple active ability using Epic 19 logical actions;
- progression/boss/achievement/mastery unlocks;
- data-defined characters referencing registered passive/ability primitives;
- ordinary new characters using existing primitives are data/assets-only.

### Epic 25 — Armour Sets and Equipment Progression (#89)

Persistent Helmet / Armour / Gloves / Boots system:

- target ~8 set families;
- 2-piece + 4-piece bonuses;
- coins improve owned equipment;
- progression/boss/achievement/mastery unlocks higher tiers;
- registered effect/set-bonus primitives;
- ordinary new items/sets are data/assets-only;
- no required drag/touch-only management flow.

### Epic 26 — Meta Progression Rebalance and Depth Integration (#90)

Integrate all persistent systems into one clear economy/progression model:

- give each resource/system one purpose;
- consume the shared #92 condition/grant contracts rather than inventing a second progression grammar;
- simplify/retire redundant legacy permanent-upgrade paths;
- prevent easiest-stage grinding from being dominant;
- ensure boss/milestone rewards are meaningfully stronger than ordinary farming;
- all between-run progression remains controller navigable.

---

## Input / Platform Boundary

```text
Touch ───────┐
Keyboard ────┼─> shared logical actions ─> gameplay/UI commands
Controller ──┘
```

Native iOS/Android wrappers may provide additional device adapters later, but do not fork gameplay rules. Controller players use the same automatic combat model; required right-stick/manual aiming remains out of scope.

## Achievement / Platform Boundary

```text
Gameplay facts
      ↓
Meowcenary Achievement/Mastery State  ← authoritative
      ↓
web/local | Game Center mirror | Google Play Games mirror
```

Platform sync failure never blocks/revokes a local achievement, stage unlock, blueprint, character, or equipment unlock.

## Progression Boundaries

Keep these roles distinct:

- **Upgrade cards:** temporary run build direction.
- **Run rack/merges:** temporary combat escalation.
- **Stages/bosses:** content milestones + authoritative accomplishment facts.
- **Achievements/mastery:** game-owned accomplishment/unlock primitive.
- **Gunsmith:** persistent weapon engineering.
- **Armour/equipment:** persistent loadout/set progression.
- **Mercenaries:** persistent playable identities/passives/abilities.
- **Coins/scrap:** improve appropriate owned content; never universal milestone bypass.

## Milestone History

- Milestone 0 — Foundation.
- Milestone 1 — Playable combat slice.
- Milestone 2 — Weapon/upgrade depth.
- Milestone 3 — Meta progression shell.
- Milestone 4 / Alpha 2 — Golden Run presentation, acquisition/merge UX, combat feel, build variety, touch/controller gate, then full repository certification #94.
- Milestone 5 / Alpha 3 — shared foundation #92, stage ladder, enemy/boss expansion, achievements/mastery, Gunsmith, larger roster, equipment, integrated progression.

## Explicitly Later

- Native iOS/Android packaging/store delivery after input + persistent-state contracts stabilize.
- Online accounts / cloud saves.
- Leaderboards.
- Co-op.
- Cosmetic store / any monetisation.
