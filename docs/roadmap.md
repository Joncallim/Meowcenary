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

Alpha 2 deliberately finishes **one genuinely good Golden Run** before broad content expansion. The purpose is to prove the combat/build loop, visual identity, touch experience, and replayability rather than hide a weak core behind more content.

- **Epic 16 / Visual Identity and Junkyard World (#75):** architecture/art direction established in PR #82; runtime implementation is currently in open PR #83.
- **Epic 17 / Combat Feel and Weapon Identity (#76):** open; make pistol/SMG/shotgun tiers and existing enemy threats feel distinct and satisfying.
- **Epic 18 / Build Variety and Golden Run Pacing (#77):** open; now also owns the expanded rotating upgrade-card experience:
  - target ~15–20 meaningful upgrade definitions;
  - normally 4–5 visible choices per offer;
  - clear already-owned/current-stack/max-stack indicators;
  - placeholder imagery/icon metadata and resolvable placeholder visuals for every card;
  - temporary card upgrades remain distinct from the future persistent Gunsmith.
- **Epic 19 / Player UX and Alpha 2 Gate (#78):** open; now explicitly validates the portrait touchscreen combat loop:
  - auto-fire remains primary;
  - compare anchored/floating movement controls;
  - prove movement/positioning provides sufficient agency;
  - introduce one simple dash/evade only if playtesting shows movement-only is materially passive;
  - reserve a future right-thumb ability slot without pulling the full character-ability system into Alpha 2.

Alpha 2 ends only when the Golden Run passes a real player-experience gate. It is not a release-candidate gate by automated tests alone.

## Alpha 3 — Depth & Progression

Once Epic 19 passes, Meowcenary expands from one proof-of-fun run into a deeper stage/progression game. The new phase is intentionally split so each system has a clear purpose.

### Epic 20 — Contracts, Objectives, and Stage Progression (#85)

Replace the single endurance-format structure with a stage/contract ladder.

Core direction:

- clear objectives such as kill X, collect X, survive X, or defeat elites/targets;
- frontier stages should become severely hostile around the intended ~3-minute clear window rather than allowing indefinite kiting;
- completing the objective makes the stage clearable; optional extra-risk greed may continue only if it remains a real risk/reward choice;
- initial chapter cadence targets four normal stages followed by a boss stage;
- stage clears become progression/unlock sources for later characters, equipment, Gunsmith content, and chapters.

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

Bosses are unique milestone encounters with small readable movesets, not giant normal enemies with inflated HP. Boss stages integrate with Epic 20 and award meaningful progression unlocks.

### Epic 22 — Persistent Gunsmith and Weapon-Part Crafting (#87)

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

The Gunsmith is deliberately separate from temporary run cards and the short-term six-slot run rack.

### Epic 23 — Mercenary Roster Expansion (#88)

Expand beyond the initial small cast to **more than three playable characters**, with an initial target of roughly eight.

Each character should have a clear identity through:

- base stats;
- passive;
- starting weapon/build tendency;
- one simple active ability / active-ability slot that consumes Epic 19's touch-control direction.

Later characters are primarily unlocked through stages, bosses, achievements, or mastery rather than simply bought with enough currency.

### Epic 24 — Armour Sets and Equipment Progression (#89)

Add a persistent equipment layer with four initial slots:

- Helmet.
- Armour.
- Gloves.
- Boots.

Initial direction targets roughly eight set families (e.g. Commando, Scavenger, Demolition, Pyro, Juggernaut, Recon, Technician, Medic) with 2-piece and 4-piece bonuses.

Progression rule:

- **Coins improve owned equipment.**
- **Gameplay accomplishment unlocks higher-tier equipment access.**

Higher tiers should come from stage/chapter progress, bosses, achievements, or mastery rather than currency alone.

### Epic 25 — Meta Progression Rebalance and Depth Integration (#90)

Integrate the new persistent systems so they feel like one game rather than several feature menus.

This epic defines the final responsibility of:

- run XP / temporary upgrade cards;
- coins/scrap;
- stage progression;
- bosses;
- achievements/mastery;
- Gunsmith parts/traits;
- armour/equipment;
- mercenary unlocks.

It should simplify or retire legacy permanent-upgrade paths that no longer have a unique role and prevent the easiest-stage grind from becoming the dominant progression strategy.

## Product Loop After Alpha 3

### Combat loop — seconds

Move → position/evade → auto-fire → read/prioritize threats → collect.

### Contract loop — minutes

Enter stage → fulfil objective → survive escalating pressure → clear/extract → collect rewards.

### Progression loop — hours

Advance stages → defeat bosses → unlock mercenaries/gear/parts → upgrade armour → engineer persistent guns → return to harder contracts.

## Progression Boundaries

Keep these systems distinct:

- **Upgrade cards:** temporary within-contract build direction.
- **Run weapon rack/merging:** temporary combat escalation during a run.
- **Gunsmith:** persistent weapon engineering between runs.
- **Armour/equipment:** persistent mercenary loadout/set progression.
- **Mercenaries:** distinct playable identities/passives/abilities.
- **Stages/bosses/achievements:** milestone progression and unlock gates.
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
- Alpha 2 player-experience gate.

### Milestone 5: Depth & Progression

- Contract/stage ladder.
- Expanded enemy roster and bosses.
- Persistent Gunsmith.
- Expanded mercenary roster.
- Armour/equipment sets.
- Integrated meta progression.

## Explicitly Later

- Online accounts.
- Cloud saves.
- Leaderboards.
- Co-op.
- Cosmetic store.
- Any monetisation.
