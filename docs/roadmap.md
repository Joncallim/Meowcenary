# Roadmap

## Current Position

### Complete foundations / MVP systems

- Epic 0 / Foundation: complete (#1).
- Epic 1 / Core Gameplay Loop: complete (#2).
- Epic 2 / Weapons and Merge System: complete (#3).
- Epic 3 / Upgrade Cards: complete (#4).
- Epic 4 / Enemy AI and Spawn Director: complete (#5).
- Epic 5 / Meta Progression: complete (#6).
- Epic 6 / Characters: complete (#7).
- Epic 7 / Maps and Arenas: complete (#8).
- Epic 8 / Loot and Economy: complete (#9).
- Epic 9 / UI and UX: complete; merged in PR #64 (#10).
- Epic 10 / Audio: complete; contracts/manager in PR #65 and scene/UI/assets remainder in PR #68 (#11).
- Epic 11 / Balancing and Developer Tooling: complete; PRs #66 and #70 (#12).
- Epic 12 / Polish and Performance: complete; merged in PR #71 (#13).
- Epic 13 / Presentation Runtime and Physics Stability: complete; merged in PR #79 (#72).
- Epic 14 / Weapon Acquisition and Rack Economy: complete; merged in PR #80 (#73).
- Epic 15 / Inventory and Merge Experience: complete; merged in PR #81 (#74).

### Alpha 2 — Golden Run

Alpha 2 deliberately finishes **one genuinely good Golden Run** before broad content expansion. The purpose is to prove the combat/build loop, visual identity, touch experience, controller experience, and replayability rather than hide a weak core behind more content.

- **Epic 16 / Visual Identity and Junkyard World (#75):** architecture/art direction established in PR #82; runtime implementation is currently in open PR #83.
- **Epic 17 / Combat Feel and Weapon Identity (#76):** open; make pistol/SMG/shotgun tiers and existing enemy threats feel distinct and satisfying.
- **Epic 18 / Build Variety and Golden Run Pacing (#77):** open; now also owns the expanded rotating upgrade-card experience:
  - target ~15–20 meaningful upgrade definitions;
  - normally 4–5 visible choices per offer;
  - clear already-owned/current-stack/max-stack indicators;
  - placeholder imagery/icon metadata and resolvable placeholder visuals for every card;
  - temporary card upgrades remain distinct from the future persistent Gunsmith.
- **Epic 19 / Player UX and Alpha 2 Gate (#78):** open; now explicitly validates both portrait touchscreen combat and complete controller-only play:
  - auto-fire remains primary across touch, keyboard, and controller;
  - compare anchored/floating touch movement controls;
  - prove movement/positioning provides sufficient agency;
  - introduce one simple dash/evade only if playtesting shows movement-only is materially passive;
  - freeze a platform-neutral logical input/action layer for movement, UI navigation, confirm/back, pause, inventory, dash, and future ability actions;
  - require the full launch → menu → run → upgrade → merge → settings → summary → Retry/Menu journey to work controller-only with no touch/mouse fallback;
  - validate controller deadzones, focus navigation, disconnect/reconnect, input-source switching, and no double-fire;
  - reserve a future ability action/slot without pulling the full character-ability system into Alpha 2;
  - do **not** introduce required right-stick/manual aiming.

Alpha 2 ends only when the Golden Run passes a real player-experience gate on touch and controller. It is not a release-candidate gate by automated tests alone.

## Alpha 3 — Depth & Progression

Once Epic 19 passes, Meowcenary expands from one proof-of-fun run into a deeper stage/progression game. The phase is intentionally split so each system has one clear responsibility.

### Alpha 3 Content Architecture Contract

All Epics 20–26 are governed by [`architecture/alpha-3-content-extensibility-contract.md`](architecture/alpha-3-content-extensibility-contract.md) in addition to their own future architecture documents.

The contract freezes the long-term authoring rule:

> **Adding another instance of an existing content type should require validated data + assets, not gameplay-system source changes.**

Before any Alpha 3 implementation begins, its dedicated architecture pass must show how it satisfies:

- stable permanent content IDs; no array-index/display-number persistence;
- chapter/content-pack composition;
- typed objective/behavior/effect/condition/reward registries rather than content-ID branches;
- separation of stage composition, encounter composition, difficulty, and rewards;
- one shared unlock/condition vocabulary and one shared reward/grant vocabulary across persistent systems;
- sparse persistence keyed by stable IDs;
- explicit separation of save-schema version from content/catalog/balance version;
- explicit deterministic pools so adding global content cannot silently change old seeded stages/rewards;
- ID-driven asset manifests/bundles that do not require per-content scene preload edits;
- generic catalog-wide conformance tests;
- a required **data-only second fixture** proving the epic can be extended without core-runtime edits.

A genuinely new mechanic may add one registered/tested primitive. Once that primitive exists, additional content using it should again be data-only. Do not prebuild a generic scripting engine, behavior-tree framework, visual scripting system, or DLC/mod platform without evidence.

### Epic 20 — Contracts, Objectives, and Stage Progression (#85)

Replace the single endurance-format structure with a stage/contract ladder.

Core direction:

- clear objectives such as kill X, collect X, survive X, or defeat elites/targets;
- frontier stages should become severely hostile around the intended ~3-minute clear window rather than allowing indefinite kiting;
- completing the objective makes the stage clearable; optional extra-risk greed may continue only if it remains a real risk/reward choice;
- initial chapter cadence targets four normal stages followed by a boss stage;
- stage clears become progression/unlock sources for achievements/mastery, characters, equipment, Gunsmith content, and chapters;
- stage selection and clear/retry/next-stage flow remain controller-, keyboard-, pointer-, and touch-navigable;
- stage composition references reusable arena/objective/encounter/difficulty/reward/unlock definitions;
- adding another stage using existing primitives must be data/assets-only.

### Epic 21 — Enemy Roster Expansion and Boss Framework (#86)

Build a real encounter roster around **behavioral** variety rather than stat reskins.

Initial direction targets roughly eight archetypes:

1. Grunt / swarm.
2. Runner / flanker.
3. Brute.
4. Shooter / projectile enemy.
5. Charger.
6. Spawner.
7. Shielded enemy.
8. Splitter / disruptor.

Bosses are unique milestone encounters with small readable movesets, not giant normal enemies with inflated HP. Boss stages integrate with Epic 20 and emit authoritative facts that Epic 22 can use for achievements/mastery.

Enemy/boss definitions reference reusable registered behaviors/abilities and explicit encounter pools. Adding another variant or boss composition from existing primitives must be data/assets-only.

### Epic 22 — Achievements, Mastery, and Platform Sync (#91)

Create one game-owned achievement/mastery system before the persistent systems that depend on it.

Core direction:

- stable validated Meowcenary achievement IDs;
- standard, incremental, hidden, and mastery achievements;
- persistent authoritative local progress/completion state;
- achievement-triggered unlock hooks;
- in-game achievement/mastery gallery and progress read models;
- web/offline behavior works without any platform account;
- optional adapters mirror eligible progress to Apple Game Center and Google Play Games;
- native platform state is **never** the source of truth for gameplay progression;
- failed/offline platform sync never revokes or blocks a locally earned unlock;
- achievement UI remains fully controller/touch/keyboard navigable;
- achievement definitions reference reusable metric/condition/reward primitives; ordinary new achievements are data-only.

### Epic 23 — Persistent Gunsmith and Weapon-Part Crafting (#87)

Make persistent weapon engineering one of Meowcenary's deepest long-term loops.

The Gunsmith is **outside combat** and centers on a persistent gun with component slots such as:

- receiver/core;
- barrel;
- optic/scope;
- stock;
- trigger;
- magazine;
- underbarrel / grenade launcher / specialist attachment.

A separate part inventory supports upgrading, merging, and bounded trait infusion. Parts should often change behavior rather than only add tiny stats. Example: transferring a fire/flamethrower trait into a conventional barrel can produce an incendiary barrel.

Achievement/mastery-gated blueprints and traits consume Epic 22's local authoritative state. The Gunsmith is deliberately separate from temporary run cards and the short-term six-slot run rack. Part/trait definitions use reusable slot/effect/trait primitives and explicit reward pools so ordinary new parts are data/assets-only.

### Epic 24 — Mercenary Roster Expansion (#88)

Expand beyond the initial small cast to **more than three playable characters**, with an initial target of roughly eight.

Each character should have a clear identity through:

- base stats;
- passive;
- starting weapon/build tendency;
- one simple active ability using Epic 19's shared logical input action layer.

Later characters are primarily unlocked through stages, bosses, Epic 22 achievements/mastery, or mastery goals rather than simply bought with enough currency. Character selection and abilities remain first-class controller, keyboard, and touch interactions. Characters reference reusable passive/ability/unlock primitives; ordinary new characters are data/assets-only.

### Epic 25 — Armour Sets and Equipment Progression (#89)

Add a persistent equipment layer with four initial slots:

- Helmet.
- Armour.
- Gloves.
- Boots.

Initial direction targets roughly eight set families (e.g. Commando, Scavenger, Demolition, Pyro, Juggernaut, Recon, Technician, Medic) with 2-piece and 4-piece bonuses.

Progression rule:

- **Coins improve owned equipment.**
- **Gameplay accomplishment unlocks higher-tier equipment access.**

Higher tiers should come from stage/chapter progress, bosses, Epic 22 achievements/mastery rather than currency alone. Equipment management must be fully usable controller-only with no required drag/touch gesture. Equipment/set definitions reference reusable effect/set-bonus/unlock primitives; ordinary new sets are data/assets-only.

### Epic 26 — Meta Progression Rebalance and Depth Integration (#90)

Integrate the new persistent systems so they feel like one game rather than several feature menus.

This epic defines the final responsibility of:

- run XP / temporary upgrade cards;
- coins/scrap;
- stage progression;
- bosses;
- game-owned achievements/mastery;
- optional native achievement mirrors;
- Gunsmith parts/traits;
- armour/equipment;
- mercenary unlocks.

It should simplify or retire legacy permanent-upgrade paths that no longer have a unique role and prevent the easiest-stage grind from becoming the dominant progression strategy.

Epic 26 also freezes or adopts the shared Alpha 3 condition/unlock and reward/grant vocabularies so cross-system progression paths are data-driven rather than bespoke mutations.

## Input / Platform Boundary

Meowcenary's gameplay and UI should consume **logical actions**, not platform-specific buttons or touch widgets.

Target relationship:

```text
Touch ───────┐
Keyboard ────┼─> shared logical actions ─> gameplay/UI commands
Controller ──┘
```

Core actions include movement vector, confirm, back, pause, inventory, navigation, optional dash, and future character ability. Native iOS/Android packaging may supply additional input adapters later, but it must not fork gameplay rules.

Controller players use the same automatic combat model as touch players. Right-stick/manual aiming is not required.

## Achievement / Platform Boundary

```text
Gameplay facts
      ↓
Meowcenary Achievement/Mastery State  ← authoritative
      ↓
┌──────────────┬────────────────┬──────────────────┐
│ Web / local  │ Apple mirror   │ Google Play     │
│              │ Game Center    │ Games mirror    │
└──────────────┴────────────────┴──────────────────┘
```

Platform achievement services are optional mirrors. A platform sync failure must never block a local achievement, stage unlock, Gunsmith blueprint, character, or armour unlock.

## Product Loop After Alpha 3

### Combat loop — seconds

Move → position/evade → auto-fire → read/prioritize threats → collect.

### Contract loop — minutes

Enter stage → fulfil objective → survive escalating pressure → clear/extract → collect rewards.

### Progression loop — hours

Advance stages → defeat bosses → complete achievements/mastery → unlock mercenaries/gear/parts → upgrade armour → engineer persistent guns → return to harder contracts.

## Progression Boundaries

Keep these systems distinct:

- **Upgrade cards:** temporary within-contract build direction.
- **Run weapon rack/merging:** temporary combat escalation during a run.
- **Achievements/mastery:** persistent game-owned accomplishment/progression primitive, with optional native platform mirroring.
- **Gunsmith:** persistent weapon engineering between runs.
- **Armour/equipment:** persistent mercenary loadout/set progression.
- **Mercenaries:** distinct playable identities/passives/abilities.
- **Stages/bosses:** content milestones and authoritative accomplishment facts.
- **Coins/scrap:** improve appropriate owned gear/items; currency alone must not bypass every milestone gate.

## Milestone History

### Milestone 0: Foundation

- Vite, Phaser, TypeScript scaffold.
- Scene shell.
- Data loading.
- Repository standards.
- Issue backlog.

### Milestone 1: Playable Combat Slice

- Player movement.
- Auto targeting and auto firing.
- Enemy spawning.
- Damage and death.
- XP drops.
- Level-up choice screen.

### Milestone 2: Weapon and Upgrade Depth

- Weapon framework.
- Projectile variants.
- Merge rules.
- Upgrade-card generation.
- Weapon synergies.
- Run summary.

### Milestone 3: Meta Progression

- Local save system.
- Persistent currency.
- Permanent-upgrade shell.
- Character unlock shell.
- Weapon unlock shell.

### Milestone 4: Content / Golden Run Expansion

- Multiple enemy behaviors.
- Arena/world identity.
- Weapon acquisition and merge UX.
- Combat feel.
- Build variety and pacing.
- Touch + controller Alpha 2 player-experience gate.

### Milestone 5: Depth & Progression

- Cross-cutting Alpha 3 content-extensibility architecture contract.
- Contract/stage ladder.
- Expanded enemy roster and bosses.
- Achievements/mastery + optional platform mirroring.
- Persistent Gunsmith.
- Expanded mercenary roster.
- Armour/equipment sets.
- Integrated meta progression.
- Data-only extension gates and generic content-conformance tests for all Alpha 3 systems.

## Explicitly Later

- Native iOS/Android packaging/store delivery after the shared input and persistent-state contracts are stable.
- Online accounts.
- Cloud saves.
- Leaderboards.
- Co-op.
- Cosmetic store.
- Any monetisation.
