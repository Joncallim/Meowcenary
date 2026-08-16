# Meowcenary Vision

## One-Line Pitch

A no-ads roguelite where a scrappy animal mercenary auto-fights through short objective-driven contracts, builds absurd weapons from scavenged parts, and unlocks deeper characters, equipment, achievements, and stages through play.

## Player Fantasy

The player is a tiny, overconfident mercenary turning junk into absurd firepower. They should feel clever for building synergies, engineering a weapon that becomes distinctly theirs, mastering characters, and surviving increasingly hostile contracts — not punished for lacking twitch aiming skill.

## Design References

- Gun Hero: approachability, cute combat, merge-driven weapon growth.
- Archero: movement-first combat, simple enemy readability, upgrade choices.
- Vampire Survivors: automatic attacks, escalating enemy pressure, build snowballing.

These references inform the product loop only. Visual identity, naming, UI layout, weapon art, enemy designs, balance values, economy design, characters, bosses, equipment, achievements, and progression must be original.

## Core Product Direction

Meowcenary has three interacting layers:

1. **Combat — seconds:** move, position, evade, read threats, auto-fire, collect.
2. **Contract — minutes:** fulfil a clear objective while pressure escalates, then clear/extract before the stage overwhelms the build.
3. **Progression — hours:** unlock mercenaries, complete achievements/mastery, improve armour/equipment, engineer persistent guns in the Gunsmith, defeat bosses, and advance through increasingly difficult stages.

The Alpha 2 Golden Run exists to prove the combat/build/input loop before the broader stage/progression structure is implemented. Post-Alpha-2 work expands depth without using meta grind to hide weak moment-to-moment play.

## Non-Negotiables

- No ads.
- No paid power upgrades.
- No energy systems or forced waiting.
- No mandatory accounts.
- No skill-shot aiming requirement.
- Automatic targeting/firing remains the primary combat model on touch, keyboard, and controller.
- No required right-stick/twin-stick aiming for controller players.
- No IP copying from reference games.
- Touchscreen play must remain comfortable and readable at portrait phone scale.
- Game-controller support is first-class: the complete player journey must be navigable without touch/mouse fallback.
- Input devices feed a shared logical-action model; device/platform adapters do not create separate gameplay rules.
- Persistent progression must be earned through play, not manipulative retention pressure.
- Meowcenary owns achievement/mastery state. Game Center/Google Play Games are optional mirrors, never progression authorities.
- Alpha 3 content must be deliberately extensible: ordinary new instances of an existing content type should be data/assets work, not gameplay-runtime rewrites.

## Alpha 2 Definition

A successful Alpha 2 delivers one genuinely fun, replayable Golden Run with:

- Smooth movement on keyboard, touch, and game controller.
- Automatic firing at nearby enemies.
- Touch combat that feels active through movement/positioning and, if playtesting proves it necessary, one simple dash/evade.
- A platform-neutral logical input/action layer with safe controller deadzones, focus navigation, disconnect/reconnect, and input-source switching.
- A complete controller-only journey: launch/menu → select/start → combat → upgrade choice → rack/merge → pause/settings → summary → Retry/Menu.
- Clear enemy escalation and readable telegraphs.
- XP pickup and a rotating upgrade-card system with roughly 15–20 meaningful upgrades.
- 4–5 readable choices per level-up offer, with owned/current-stack indicators.
- Placeholder imagery/icons for every upgrade card so the chooser is not text-only before final art.
- At least three weapon families with meaningful identity.
- Normal-play weapon acquisition and a discoverable merge loop.
- Run win/loss states and a readable summary.
- Local persistent progression shell.

Alpha 2 does **not** need the full long-term roster, armour system, achievement/mastery catalog, boss roster, stage ladder, or persistent Gunsmith. Those are the next depth phase once the Golden Run passes its player-experience/input gate.

## Alpha 3 — Depth & Progression Direction

Before any Alpha 3 runtime implementation, **Issue #92 — Alpha 3 Shared Foundation Contracts** must freeze the cross-system architecture in [`architecture/alpha-3-shared-foundation.md`](architecture/alpha-3-shared-foundation.md).

That foundation owns decisions that must be made once rather than independently inside seven later epics: Stage/Contract as the content-composition root, Stage/Objective-owned completion, the stage-oriented resolved-run-plan seam, Save V3 domain ownership and V2 compatibility, existing-ID preservation, shared condition/reward vocabularies, catalog/conformance registration, content-version semantics, deterministic pools, and the future asset-bundle seam.

After that gate, the game expands through seven coordinated epics:

- **Epic 20 — Contracts, Objectives, and Stage Progression (#85):** objective-based stages, escalating ~3-minute frontier pressure, chapter progression, and regular boss milestones.
- **Epic 21 — Enemy Roster Expansion and Boss Framework (#86):** roughly eight behavioral enemy archetypes, ranged/projectile threats, elites where useful, and unique bosses.
- **Epic 22 — Achievements, Mastery, and Platform Sync (#91):** game-owned standard/incremental/hidden/mastery achievements, offline/web persistence, achievement-triggered unlocks, and optional Game Center/Google Play Games mirrors.
- **Epic 23 — Persistent Gunsmith and Weapon-Part Crafting (#87):** persistent guns with modular receiver/barrel/optic/stock/trigger/magazine/underbarrel parts, merging, and bounded trait infusion such as incendiary barrels.
- **Epic 24 — Mercenary Roster Expansion (#88):** more than three playable characters; initial target around eight, each with a distinct passive/start identity and a simple active ability using the shared input-action model.
- **Epic 25 — Armour Sets and Equipment Progression (#89):** Helmet/Armour/Gloves/Boots, roughly eight set families, 2/4-piece bonuses, coin upgrades, and progression/boss/achievement-gated higher tiers.
- **Epic 26 — Meta Progression Rebalance and Depth Integration (#90):** make stages, bosses, achievements/mastery, coins, armour, characters, and Gunsmith rewards form one coherent earned progression system.

All seven Alpha 3 epics are additionally governed by [`architecture/alpha-3-content-extensibility-contract.md`](architecture/alpha-3-content-extensibility-contract.md). Their dedicated architecture passes must preserve stable IDs, typed registries, shared unlock/reward primitives, deterministic explicit content pools, migration-safe sparse persistence, ID-driven assets, and generic conformance tests.

## Achievement Direction

Achievements are part of Meowcenary, not merely store-platform badges.

The game should support:

- standard one-shot achievements;
- incremental goals;
- hidden achievements where appropriate;
- character/build/boss mastery goals;
- achievement-triggered unlocks for selected progression content.

Authority rule:

```text
Meowcenary local achievement/mastery state = source of truth
Game Center / Google Play Games = optional mirrors
```

Web/offline players receive the same in-game achievement and unlock behavior. A platform account, failed sync, or stale platform mirror must never block or revoke an earned progression reward.

## Input Direction

The same gameplay model spans platforms and devices:

```text
Touch ───────┐
Keyboard ────┼─> shared logical actions ─> gameplay/UI
Controller ──┘
```

Controller support means more than left-stick movement. Menus, upgrade choices, weapon merging, settings, achievements, character/equipment/Gunsmith screens, and results must remain controller navigable as those systems arrive.

Native iOS/Android wrappers can later provide additional device/platform adapters without rewriting combat or UI rules.

## Content Extensibility Direction

Meowcenary should grow by **authoring content on top of stable systems**, not by special-casing each new item.

The default rule is:

> Adding another instance of an existing content type should require validated data + assets, not gameplay-system source changes.

Examples:

- another stage using existing objective/encounter/difficulty/reward primitives;
- another enemy variant using an existing registered behavior;
- another boss assembled from existing registered abilities/phases;
- another achievement using existing metrics/conditions/reward grants;
- another Gunsmith part using existing slot/effect/trait primitives;
- another mercenary using existing passive/ability hooks;
- another armour set using existing effect/set-bonus primitives.

New code is appropriate only for a genuinely new mechanic. Once that mechanic is registered and tested, future content using it should again be data-only.

Stable IDs, content packs/chapters, explicit deterministic pools, shared condition/reward vocabularies, save-schema/content-version separation, bundle-aware asset manifests, and catalog-wide conformance tests are the long-term authoring foundation. Avoid turning this into a general-purpose game engine or scripting platform before real use cases require it.

## Progression Boundaries

The major systems must remain distinct:

- **Run upgrade cards:** temporary within-contract build direction.
- **Run weapon rack/merges:** short-term combat escalation inside a run.
- **Achievements/mastery:** persistent game-owned accomplishment/progression primitive with optional platform mirroring.
- **Gunsmith:** persistent weapon engineering between runs.
- **Armour/equipment:** persistent mercenary loadout and set-build progression.
- **Mercenaries:** distinct playable identities, passives, and simple abilities.
- **Stages/bosses:** progression milestones and authoritative accomplishment facts.
- **Coins/scrap:** improve appropriate owned gear/items; currency alone must not bypass every milestone unlock.

## Success Criteria

- A first-time player understands the controls within 10 seconds.
- The first Alpha 2 run becomes meaningfully dangerous quickly and has a clear escalation/climax.
- Upgrade choices create visible build direction rather than repeated generic percentage bumps.
- Touchscreen combat feels active rather than like watching the game play itself.
- Controller play feels intentional rather than like keyboard bindings exposed through a gamepad; the full journey works controller-only.
- Weapon acquisition and the first merge are discoverable without coaching.
- After Alpha 3, a frontier stage tends to overwhelm an underpowered player around the intended ~3-minute clear window, while objectives create different movement/decision patterns.
- Enemy archetypes and bosses are distinguishable by behavior, not just stats.
- Achievements/mastery provide meaningful goals/unlock paths without becoming a checklist grind or platform-account dependency.
- Persistent Gunsmith/armour/character progression gives the player concrete reasons to replay without becoming a grind treadmill.
- New levels, enemies, achievements, parts, characters, and equipment using existing mechanics can be added without core-runtime edits or save-schema churn.
- The player can feel both a run build and a long-term loadout getting stronger without needing a tutorial wall.
