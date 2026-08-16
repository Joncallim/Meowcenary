# Meowcenary Knowledge Graph

> Token-optimized repo map. Read this before any implementation work.
> Current state: **Epics 0–15 complete; Epic 16 architecture/art direction merged in PR #82 and runtime implementation is open in PR #83; Epics 17–19 are the remaining Alpha 2 Golden Run work; Epics 20–26 are the post-Alpha-2 Depth & Progression backlog and must not be implemented before their dedicated architecture passes.**
>
> Important new routing: Epic 19 freezes the shared touch/keyboard/controller logical-action model and requires a full controller-only Alpha 2 journey. Epic 22 (#91) owns authoritative achievements/mastery and optional Game Center / Google Play Games mirroring. The former Gunsmith/mercenary/armour/integration epics are renumbered to 23–26.

## Stack

```text
Phaser 3.90 + TypeScript 5.8 + Vite 7 + Vitest 3.2
Node 22, ES2022, strict, noEmit. Canvas 390×844, browser-first, mobile-friendly.
```

## Directory Map

| Dir | Status | Rules | Contents |
|-----|--------|-------|----------|
| `src/engine/` | ✅ | **No Phaser** | config, events, RNG, vectors, cadence, context, pooling, motion |
| `src/gameplay/` | ✅ | **No Phaser; pure rules** | run state, stats, XP, targeting, weapons, merge, upgrades, enemy/spawn/loot/meta, rack/rewards |
| `src/entities/` | ✅ | Phaser allowed | Player, Enemy, Projectile, Drop, actor view |
| `src/systems/` | ✅ | Phaser-aware coordinators | validation/save/input/audio/debug/registries/game systems |
| `src/scenes/` | ✅ | Thin coordinators only | BootScene, MenuScene, GameScene |
| `src/ui/` | ✅ | Phaser allowed | chooser, selection, progression, pause, summary, HUD, controls, rack/inventory, settings |
| `src/data/` | ✅ | Validated JSON | weapons, enemies, upgrades, meta-upgrades, spawn curves, characters, arenas, loot, audio, actor art |
| `tests/` | ✅ | Vitest | unit + mocked-Phaser + integration harnesses |
| `docs/` | ✅ | Planning/architecture truth | vision, epics, roadmap, architecture docs |

## Current Runtime Baseline

Epics 13–15 established:

- stable physics/presentation separation;
- actor-art catalog + Pixelorama asset pipeline;
- six-slot run weapon rack;
- deterministic `weapon-rewards` RNG stream;
- no-loss full-rack pickup behavior;
- immutable rack read model and mobile-first merge UX.

Epic 16 runtime work in PR #83 extends production visuals/world presentation. Treat PR #83 branch state as implementation truth until merged; do not assume it is on `main`.

## Frozen Current Contracts

### GameContext

```ts
{ bus, menuRng, data, metaUpgrades, saveData, settings,
  characters, selectedCharacterId, selectionRevision, selectCharacter,
  arenas, selectedArenaId, arenaSelectionRevision, selectArena,
  updateSettings, updateMeta, resetProgression }
```

`updateMeta` remains the current persistent mutation boundary until a later architecture pass evolves it.

### GameEventMap

Current event families:

```text
run:*   player:*   enemy:*   weapon:*   projectile:hit
xp:gained   level:up   card:offered/chosen
drop:collected   currency:changed   hazard:triggered
settings:changed   ui:navigate/confirm/back
```

Use existing authoritative domain facts before inventing new events.

### RunState

```ts
{ status, seed, characterId, arenaId, timeMs, level, xp, xpToNext,
  kills, currency, stats, equipped: WeaponInstance[], upgradeStacks,
  pauseReason, outcome? }
```

Simulation advances only while active. `equipped` is the **temporary six-slot run rack**, not persistent Gunsmith state.

### Randomness

All gameplay randomness uses named run-scoped RNG streams. Never use `Math.random()` or `menuRng` for gameplay.

### Saves

Current save schema is V2. All new persistent state requires an explicit linear migration; do not add ad-hoc LocalStorage keys.

## Alpha 2 Routing — Do Not Miss

### Epic 18 (#77) — upgrade-card expansion

The old three-card pool is no longer the target:

- ~15–20 meaningful temporary upgrades;
- normally 4–5 choices per offer;
- authoritative owned/current/max-stack read-model state;
- placeholder icon/image metadata + resolvable placeholder visual for every card;
- placeholder assets may later be produced/replaced by Codex without changing gameplay IDs;
- cards remain run-scoped and separate from Epic 23 Gunsmith progression.

### Epic 19 (#78) — touch + controller gate

Alpha 2 must freeze **one shared logical input/action model**.

```text
Touch ───────┐
Keyboard ────┼─> logical action layer ─> gameplay/UI commands
Controller ──┘
```

Requirements:

- auto-fire remains primary across all devices;
- no required twin-stick/right-stick aiming;
- compare anchored/floating touch movement where useful;
- validate movement-only vs one simple dash/evade based on playtest evidence;
- controller covers menu, selection, gameplay, upgrade chooser, rack/merge, pause/settings, summary, Retry/Menu;
- controller-only journey requires no mouse/touch/hidden cursor fallback;
- deadzone/normalization, focus navigation, disconnect/reconnect, input-source switching, and no-double-fire are architecture/test concerns;
- reserve a logical `ability` action and UI capacity for Epic 24.

If any core Alpha 2 journey cannot be completed controller-only, that is a P1 blocker.

## Alpha 3 Forward Product Graph

These are planning contracts, not implementation specs.

```text
Epic 19 Alpha 2 Input/UX Gate
        |
        v
Epic 20 Contracts/Stages (#85)
        |
        v
Epic 21 Enemy Roster + Bosses (#86)
        |
        +---------- authoritative stage/combat/boss facts ----------┐
                                                                     v
                                                  Epic 22 Achievements/Mastery (#91)
                                                    local state = authority
                                                    web/offline always works
                                                    Game Center/Google Play mirrors
                                                            |
                      ┌─────────────────────────────────────┼──────────────────────────┐
                      v                                     v                          v
        Epic 23 Persistent Gunsmith (#87)      Epic 24 Mercenaries (#88)   Epic 25 Armour (#89)
          parts/builds/traits                    >3; ~8 target               4 slots / ~8 sets
          achievement blueprints                 mastery/abilities           milestone tiers
                      └─────────────────────────────────────┬──────────────────────────┘
                                                            v
                                          Epic 26 Progression Integration (#90)
```

### Epic 20 — Contracts / Stages

- kill / collect / survive / elite-target objectives first;
- frontier pressure severe around intended ~3-minute clear window;
- objective completion enables clear/extraction;
- initial chapter target: four normal stages + boss Stage 5;
- stage facts feed Epic 22; Epic 20 does not maintain achievement counters;
- stage UI works through shared logical actions/controller navigation.

### Epic 21 — Enemy roster / bosses

Target initial behavior set: Grunt, Runner, Brute, Shooter, Charger, Spawner,
Shielded, Splitter/Disruptor. At least one ranged/projectile archetype. Bosses
are unique authoritative stateful encounters, not HP-scaled normal enemies.
Combat/boss facts feed Epic 22.

### Epic 22 — achievements / mastery / platform sync

**Authority boundary:**

```text
Gameplay/progression facts
       ↓
Meowcenary achievement state  ← SOURCE OF TRUTH
       ↓
local/web | Game Center mirror | Google Play Games mirror
```

- stable Meowcenary IDs;
- standard, incremental, hidden, mastery types;
- persistent offline/web progress;
- exactly-once completion/rewards;
- in-game gallery/progress surface;
- platform adapters are best-effort/idempotent;
- platform sync failure never blocks/revokes local achievements or unlocks;
- downstream systems reference Epic 22 IDs/state, not platform services;
- controller/touch/keyboard navigation parity.

### Epic 23 — persistent Gunsmith

- crafting/part merging outside active combat;
- persistent gun with receiver/core, barrel, optic, stock, trigger, magazine, underbarrel/specialist slots;
- separate part inventory;
- bounded pure merge/upgrade/trait infusion;
- representative hybrid: conventional barrel + fire/flamethrower trait → incendiary barrel;
- achievement-gated blueprints/traits use Epic 22 local state;
- persistent guns/parts remain separate from `RunState.equipped`.

### Epic 24 — expanded mercenaries

- more than three; target ~8;
- distinct base/passive/start identity;
- one simple active ability consuming Epic 19 logical actions;
- touch/keyboard/controller parity;
- stage/boss/Epic-22 achievement/mastery unlocks, not currency alone.

### Epic 25 — armour/equipment

- Helmet, Armour, Gloves, Boots;
- target ~8 set families;
- 2-piece + 4-piece bonuses;
- coins upgrade owned gear;
- higher tiers gated by stage/boss/Epic-22 achievement/mastery;
- controller-only management; no required drag/touch interaction.

### Epic 26 — integration

Assign one purpose to each persistent layer, simplify redundant legacy systems,
and prevent easiest-stage grind. Consume local Epic 22 state for unlocks; native
achievement mirrors never become progression prerequisites. All between-run
progression surfaces remain controller navigable.

## Progression-Layer Boundary

```text
RUN-SCOPED
  XP -> upgrade cards -> temporary build direction
  weapon pickup -> six-slot rack -> temporary run merges

PERSISTENT
  contracts/stages/bosses -> authoritative milestones/facts
  achievements/mastery -> game-owned progress + unlock primitive
  Gunsmith -> persistent gun/parts/traits
  armour -> persistent set/loadout progression
  mercenaries -> persistent identities/passive/ability
  coins/scrap -> improve appropriate owned items, NOT universal milestone bypass

OPTIONAL PLATFORM MIRRORS
  Game Center / Google Play Games <- achievements only; never gameplay authority
```

## How to Iterate

**New data catalog**
1. JSON + types + `GameData` field.
2. Strict validator + cross-catalog refs in aggregate validation.
3. Immutable registry where appropriate.
4. Focused validation/immutability tests.

**New pure gameplay rule**
1. `src/gameplay/`, zero Phaser.
2. Named RNG stream if random.
3. Shared stat/effect/event contracts.

**New Phaser system**
1. Implements lifecycle + unsubscribe cleanup.
2. Scene wires; scene does not own rules.
3. Respect pause/active state.

**New input adapter**
1. Convert device state → logical movement/actions only.
2. Pure/testable deadzone/edge/debounce behavior where possible.
3. No gameplay mutation inside the adapter.
4. Handle disconnect/reconnect and clear stale held state.

**New persistent system**
1. Static definitions + serializable persistent state.
2. Explicit migration first.
3. Pure transactional commands.
4. UI consumes immutable read models.
5. Prove unique progression role.

**New platform adapter**
1. Local game state is authoritative.
2. Platform SDK/service behind interface.
3. Idempotent/retryable report/reconcile.
4. Failure never blocks gameplay/progression.

## Test Patterns

- Pure modules: direct unit tests with seeded RNG.
- Phaser-touching classes: mocked Phaser.
- Input: deadzones, edge-trigger buttons, focus movement, disconnect/reconnect, mixed-device duplicate suppression.
- Registries: validate then freeze.
- Persistence: fresh + old-version migration fixtures.
- Achievements: monotonic incremental progress, exactly-once completion/reward, sync failure/retry/reconcile.
- Controller QA: complete menu→run→upgrade→merge→settings→summary→Retry/Menu journey without pointer/touch.
- Run before committing: `npm run lint && npm run test && npm run build`.

## Cross-Cutting Rules

1. No Phaser in `engine/`/`gameplay/`.
2. Scenes stay thin.
3. Tuning in validated data where practical.
4. Feedback via EventBus.
5. Gameplay randomness via seeded run-scoped streams.
6. Stat/effect changes via approved contracts.
7. Save migrations are linear.
8. No ads/paid power/energy/manipulative pacing.
9. Touch readability/ergonomics and controller navigation are acceptance criteria.
10. Device/platform adapters do not own gameplay truth.
11. Local Meowcenary achievement/mastery state is authoritative.
12. Persistent systems require distinct progression roles.

## Epic Pipeline

| Epic | Status | Notes |
|------|--------|-------|
| 0–15 | ✅ | Foundation through rack/merge UX complete |
| 16 | 🟡 | Architecture/art PR #82 merged; runtime PR #83 open |
| 17 | ⏳ | Combat feel + weapon identity (#76) |
| 18 | ⏳ | Build variety + expanded cards/stack indicators/placeholders (#77) |
| 19 | ⏳ | Alpha 2 UX + touch + controller-only action/input gate (#78) |
| 20 | 🧭 | Contracts/objectives/stages (#85) |
| 21 | 🧭 | Enemy roster + bosses (#86) |
| 22 | 🧭 | Achievements/mastery/platform sync (#91) |
| 23 | 🧭 | Persistent Gunsmith (#87) |
| 24 | 🧭 | Mercenary roster expansion (#88) |
| 25 | 🧭 | Armour/equipment sets (#89) |
| 26 | 🧭 | Progression integration/rebalance (#90) |

`🧭` means product scope exists but implementation waits for a dedicated architecture pass and upstream phase gate.

## First Steps for Any Agent

1. This file.
2. `docs/epics.md` shared contracts/sequencing.
3. `docs/roadmap.md` current phase gate.
4. The epic's dedicated architecture document if it exists.
5. Core event/types/context + target files/tests.
6. Baseline tests → implement → lint/test/build.

For Epics 20–26, stop after steps 1–3 unless a dedicated architecture document has been created. The GitHub issue is product scope, not an implementation spec.
