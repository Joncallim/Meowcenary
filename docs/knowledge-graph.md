# Meowcenary Knowledge Graph

> Token-optimized repo map. Read this before any implementation work.
> Current state: **Epics 0–15 complete; Epic 16 architecture/art direction merged in PR #82 and runtime implementation is open in PR #83; Epics 17–19 are the remaining Alpha 2 Golden Run work; Epics 20–25 (#85–#90) are the post-Alpha-2 Depth & Progression backlog and must not be implemented before their dedicated architecture passes.** Epic 10 merged in two delivery PRs:
> #65 (slices 1–2: audio data/events + game-scoped `AudioManager`) and #68
> (slices 3–5: `settings:changed` wiring, Boot-owned manager publication,
> scene lifecycle wiring, exactly-one `ui:*` command events, deterministic
> placeholder WAVs, and docs closeout). Epic 11 merged in two delivery PRs:
> #66 (slices 1–2: aggregate validation + shared curve helpers) and #70
> (slices 3–5: dev-only cheat flags, rolling DPS/overlay metrics, local
> playtest summary, tuning guide, and closeout). Epic 12 merged in PR #71:
> generic pooling, projectile/drop reuse, event-driven combat feedback,
> reduced-motion policy, fixed-window `PerfSampler`, F3 diagnostics, and
> FIT-responsive sizing. Epic 13 added the presentation runtime, actor-art
> catalog #11, seven Pixelorama assets, opt-in physics diagnostics, and charger
> clipping. Epic 14 added the weapon acquisition loop: the six-slot
> authoritative rack, capacity-checked admission, no-loss full-rack pickups,
> and the seeded `weapon-rewards` stream. Epic 15 added the immutable rack read
> model, responsive tap/keyboard merge surface, and direct HUD entry. 1311
> tests / 86 files were green at the Epic 15 merge head.

## Stack

```
Phaser 3.90 + TypeScript 5.8 + Vite 7 + Vitest 3.2
Node 22, ES2022, strict, noEmit. Canvas 390×844, browser-first, mobile-friendly.
```

## Directory Map

| Dir | Status | Rules | Contents |
|-----|--------|-------|----------|
| `src/engine/` | ✅ | **No Phaser** (pure, unit-tested) | `config` `eventBus` `rng` `vector` `cadence` `context` `sceneKeys` `system` `pool` `motion` |
| `src/gameplay/` | ✅ | **No Phaser** (pure rules) | `runState` `runStart` `runRequest` `stats` `xp` `targeting` `weapons` `weaponStats` `merge` `upgrades` `levelUpQueue` `projectilePattern` `enemyMovement` `enemyScaling` `spawnDirector` `spawnRegion` `loot` `meta` `characterSelection` `characterContribution` `characterPassives` `arenaSelection` `metrics` `perf` `weaponRack` `weaponRewards` |
| `src/entities/` | ✅ | May use Phaser (display objects) | `Player` `Enemy` `Projectile` `Drop` `actorView` |
| `src/systems/` | ✅ | May use Phaser (coordinators) | `types` `validation` `save` `input` `audio` `debug` `actorArt` `ids` `enemies` `characters` `arenas` `lootTables` `metaUpgrades` `weaponRegistry` `SpawnSystem` `WeaponSystem` `UpgradeSystem` `DropSystem` `ProgressionSystem` `PassiveCoordinator` `HazardSystem` `arenaScenery` `playtestSummary` `feedback` `WeaponRewardSystem` |
| `src/scenes/` | ✅ | Thin coordinators only | `BootScene` `MenuScene` `GameScene` |
| `src/ui/` | ✅ | May use Phaser | `UpgradeChooser` `upgradeChooserController` `upgradeChooserLayout` `characterSelectionController` `arenaSelectionController` `progressionController` `pause` `runSummary` `menus` `settings` `hud` `controls` `inventory` `weaponRackView` `weaponRackLayout` `modal` `layout` `theme` `format` |
| `src/data/` | ✅ | JSON, validated at boot | `weapons` `enemies` `upgrades` `meta-upgrades` `spawn-curves` `characters` `arenas` `loot-tables` `audio-assets` `audio-map` `actor-art` |
| `scripts/` | ✅ | Node 18+ built-ins only, deterministic | `generate-audio-placeholders.mjs` |
| `public/assets/audio/` | ✅ | 14 committed deterministic WAVs (12 SFX + 2 music) | one `.wav` per `audio-assets.json` key |
| `tests/` | ✅ 1311 tests at Epic 15 merge | Vitest; mock Phaser via `vi.mock` | 86 files at Epic 15 merge incl. integration harnesses |
| `docs/` | ✅ | Design + per-epic architecture | `vision.md` `epics.md` `roadmap.md` `architecture/epic-{3..16}-*.md` |

Epic 8 Slices 1–5 added `src/data/loot-tables.json`, `src/gameplay/loot.ts`,
and `src/systems/lootTables.ts` (Slices 1–2). Slice 3 added `src/entities/Drop.ts`;
Slice 4 rewired the kill-to-loot pipeline, deleting `XpDrop.ts`, enriching
`DropSystem` with event-driven loot resolution, and activating scrap collection.
Slice 5 added the chest collection shell, the headless loot integration harness,
and the F10 dev-only chest-spawn hotkey in `GameScene`.

Epic 12 added `src/engine/pool.ts`, `src/engine/motion.ts`,
`src/gameplay/perf.ts`, and `src/systems/feedback.ts`; pooled `Projectile` via
`WeaponSystem` and `Drop` via `DropSystem`; added deterministic event-driven
combat feedback and reduced-motion gating; extended F3 with sampled frame health
and active/allocated counts; and fed `ScaleManager.displaySize` into
`logicalCanvasViewport`.

Epic 13 added `src/entities/actorView.ts`, `src/systems/actorArt.ts`, and
`src/data/actor-art.json`; Boot preloads seven spritesheets and registers
namespaced animations once, while physics arcs stay authoritative and hidden
only when art is available. Pixelorama 1.2 sources live under `assets-src/`,
deterministic builders/export tooling under `docs/art/scripts/`, and runtime
PNG/JSON sheets under `public/assets/`. F4/`?physicsdebug=1` are development-only
diagnostics; pure charger motion clamps dashes to inset bounds and expanded
obstacle AABBs without tunneling.

Epic 14 added `src/gameplay/weaponRack.ts`, `src/gameplay/weaponRewards.ts`,
and `src/systems/WeaponRewardSystem.ts`; `RunState.equipped` becomes the
six-slot authoritative rack, weapon grants pass definition + capacity checks
before fresh instance creation through the shared `DataWeaponRegistry`,
full-rack pickups stay in-world (no silent loss), and a dedicated seeded
`weapon-rewards` stream (never the `loot` stream) schedules the guaranteed
early duplicate and later T1 pool rewards.

Epic 15 added `src/ui/inventory.ts`, `src/ui/weaponRackView.ts`, and
`src/ui/weaponRackLayout.ts`; it exposes one immutable six-slot read model,
delegates eligibility/mutation to the existing merge rules, opens directly from
the HUD, and rebuilds rack/HUD/control presentation from live FIT metrics. The
temporary code-rendered weapon glyph IDs are the seam Epic 16 replaces with
validated production art.

## Runtime Shape (after Epic 15 baseline)

```
main.ts → Phaser.Game([BootScene, MenuScene, GameScene])
BootScene: preload() loads audio plus actor-art spritesheets
           → loadGameData() → registries
           → register namespaced actor animations
           → createGameContext → registry
           → one AudioManager(this) init(ctx.bus, ctx.settings, ctx.data.audio)
           → registry[AUDIO_MANAGER_REGISTRY_KEY] → start MenuScene
MenuScene.create(): fetch ctx + AudioManager → playMusic('music-menu')
           → first-gesture unlock pair → update(delta) forwards to manager
GameScene.create():
  assembleRunRequest(ctx, menuRng) → { characterId, arenaId, seed }
  arena = ctx.arenas.arenaById(arenaId); curve = arena.spawnCurveId → curve
  prepareRun(...) → runState
  rng streams: createRng(deriveRunSeed(seed, 'spawns' | 'upgrades' | 'loot'
                          | 'weapon-rewards'))
  physics.world/camera bounds = arena.size; player spawns at arena centre
  systems = [ProgressionSystem, PassiveCoordinator, SpawnSystem,
             HazardSystem, FeedbackSystem, WeaponSystem, WeaponRewardSystem,
             DropSystem, UpgradeSystem, (DebugCheatSystem, dev-only),
             HudController, (PlaytestSummarySystem, dev-only)]
GameScene.update(delta): perfSampler → tickRun → victory check
  → systems.forEach(update) → audioManager.update(delta) → HUD/debug
terminal event: ProgressionSystem banks first; dev PlaytestSummarySystem
  prints exactly one local console summary
```

Epic 16 runtime work in PR #83 extends presentation/assets/world data; treat its
branch state as implementation truth until merged. Do not assume PR #83 is on
`main` while it remains open.

## Contracts (current, frozen)

### GameContext (`src/engine/context.ts`)
```ts
{ bus, menuRng, data, metaUpgrades, saveData, settings,
  characters, selectedCharacterId, selectionRevision, selectCharacter,
  arenas, selectedArenaId, arenaSelectionRevision, selectArena,
  updateSettings, updateMeta, resetProgression }
```
`updateMeta(transform)` sanitizes → persists → revalidates selections. Only
persistence boundary. `menuRng` is boot/menu only.

### GameEventMap (`src/engine/eventBus.ts`)
```
run:start/paused/resumed/won/lost   player:damaged/died
enemy:spawned/damaged/killed        weapon:fired   projectile:hit
xp:gained  level:up  card:offered(offerId+choices)/chosen  weapon:merged
drop:collected(kind xp|scrap)  currency:changed  hazard:triggered
weapon:acquired(definitionId,instanceId,rackCount/rackCapacity,x,y)
weapon:pickup-blocked(definitionId,reason:rack-full,...)
settings:changed(settings)   ui:navigate   ui:confirm   ui:back
```
Epic 8 extended `enemy:killed` with `scrapValue` + optional `lootTableId`.
Epic 10 added `settings:changed` plus the `ui:*` events. Epic 14 added
`weapon:acquired` and `weapon:pickup-blocked`. Rules: systems emit;
audio/UI/debug subscribe; map is additive.

### RunState (`src/gameplay/runState.ts`)
```ts
{ status: 'intro'|'active'|'paused'|'won'|'lost', seed, characterId, arenaId,
  timeMs, level, xp, xpToNext, kills, currency, stats: ModifierStack,
  equipped: WeaponInstance[], upgradeStacks, pauseReason, outcome? }
```
Simulation must not advance unless `status === 'active'`.

### ModifierStack (`src/gameplay/stats.ts`)
`STAT_KEYS` → `StatKey` (12 keys incl. `currencyGain`, `pickupRadius`).
`resolve`: all `add` then all `mult`; throws on non-finite. Higher = better.
Fire interval = `baseFireRateMs / attackSpeed`. Stack authority:
`RunState.upgradeStacks`. Modifier source namespaces include card/meta/character.

### Save (`src/systems/save.ts`)
`SaveDataV2 { version:2, settings, meta: MetaState }`; `MetaState { scrap,
unlocks, permanentUpgrades }`. Linear V1→V2 migration; unknown future versions
fail closed. `GameContext.updateMeta` remains the single runtime mutation
boundary until a later architecture pass deliberately evolves it.

### Weapon / Enemy / Arena essentials
- `WeaponInstance { instanceId, defId, family, tier }` — Phaser-free, serializable; runtime machinery stays in `WeaponSystem`.
- `RunState.equipped` is the **temporary six-slot run rack**, not the future persistent Gunsmith.
- `EnemyDefinition` = current archetype union; stats include `xpValue`, `scrapValue`.
- `ArenaDefinition { id, name, size, spawnCurveId, spawnRegions[], obstacles[], hazards[], unlock }`; `spawnPoint(arena, rng)` pure; `RunState.arenaId` authoritative.
- `SpawnCurveDefinition { id, durationSeconds, scaling{healthPerMinute,damagePerMinute}, waves[] }`.

## Alpha 2 Routing — Do Not Miss

### Epic 18 (#77) — upgrade-card expansion

The old three-card pool is no longer the target. Architecture must account for:

- roughly 15–20 meaningful temporary upgrades;
- normally 4–5 choices per offer drawn from the larger deterministic pool;
- authoritative `owned/currentStacks/maxStacks` (or equivalent) in the chooser/read model;
- placeholder icon/image metadata and a resolvable placeholder visual for every shipped upgrade;
- no blank card imagery while waiting for final art;
- placeholder assets may be produced later by Codex and replaced without changing gameplay IDs or chooser logic;
- cards stay run-scoped and distinct from Epic 22's persistent Gunsmith.

### Epic 19 (#78) — touchscreen combat gate

Do not assume the existing virtual stick is sufficient merely because input works.
Alpha 2 must validate real portrait play:

- auto-fire remains primary; no twin-stick aiming;
- compare anchored versus floating stick behavior if useful;
- judge thumb reach using actual displayed size under FIT;
- prove movement/positioning gives meaningful survival agency;
- if movement-only is materially passive, a single simple dash/evade is the only approved scoped combat-control expansion for Alpha 2;
- leave layout capacity for Epic 23's future character ability.

## Post-Alpha-2 Forward Product Graph

These nodes are **planning truth**, not implemented runtime contracts. Dedicated
architecture documents must freeze exact types/modules before coding.

```text
Epic 19 Alpha 2 Gate
        |
        v
Epic 20 Contracts/Stages (#85)
        |
        +------> stage completion / chapter progression / boss-stage cadence
        |
        v
Epic 21 Enemy Roster + Bosses (#86)
        |
        +------> behavioral enemy composition + projectile threats + unique bosses

Epic 20/21 rewards/unlocks ──────────────────────────────┐
                                                         v
Epic 22 Persistent Gunsmith (#87)                 Epic 23 Mercenaries (#88)
  receiver/barrel/optic/stock/...                   >3 characters; ~8 target
  persistent parts/builds                           passives + simple ability
  merge/upgrade/trait infusion                            |
        |                                                  v
        |                                           Epic 24 Armour (#89)
        |                                             Helmet/Armour/Gloves/Boots
        |                                             ~8 sets, 2/4 bonuses
        |                                             coin upgrades + milestone tiers
        └──────────────────────┬───────────────────────────┘
                               v
                 Epic 25 Progression Integration (#90)
                   clear resource/unlock responsibilities
                   simplify redundant legacy meta systems
```

### Epic 20 — Contracts / Stages

- objective types: kill / collect / survive / elite-target first;
- frontier pressure should become severe around the intended ~3-minute clear window;
- objective completion enables stage clear/extraction;
- initial chapter target: four normal stages + boss Stage 5;
- stage completion is persistent progression, but stage gameplay rules remain pure/testable.

### Epic 21 — Enemy roster / bosses

Initial behavior target: Grunt, Runner, Brute, Shooter, Charger, Spawner,
Shielded, Splitter/Disruptor. Preserve current enemies where they fit. At least
one ranged/projectile archetype is required. Bosses are unique stateful
encounters, not HP-scaled normal enemies.

### Epic 22 — persistent Gunsmith

- crafting/part merging is outside active combat;
- persistent selected gun with receiver/core, barrel, optic, stock, trigger,
  magazine, underbarrel/specialist slots;
- separate part inventory;
- pure/bounded merge, upgrade, and trait-infusion rules;
- components should often change behavior;
- representative hybrid: conventional barrel + fire/flamethrower trait →
  incendiary barrel;
- no arbitrary unbounded recipe graph;
- persistent guns/parts are separate from `RunState.equipped`.

### Epic 23 — expanded mercenaries

- more than three; initial target ~8;
- each has clear base/passive/start identity;
- one simple registered active ability where the Epic 19 control model supports it;
- later unlocks primarily via stage/boss/achievement/mastery, not currency alone.

### Epic 24 — armour/equipment

- slots: Helmet, Armour, Gloves, Boots;
- target ~8 set families;
- 2-piece and 4-piece set bonuses;
- coins upgrade gear already owned;
- higher-tier access is gated by progression/bosses/achievements/mastery;
- armour is separate from character identity, Gunsmith, and run cards.

### Epic 25 — integration

Explicitly assign one purpose to each persistent layer and simplify any legacy
system that becomes redundant. The easiest-stage grind must not become the
optimal progression strategy.

## Progression-Layer Boundary

```text
RUN-SCOPED
  XP -> upgrade cards -> temporary build direction
  weapon pickup -> six-slot rack -> temporary run merges

PERSISTENT
  contracts/stages/bosses/achievements -> milestone unlocks
  Gunsmith -> persistent gun/parts/traits
  armour -> persistent set/loadout progression
  mercenaries -> persistent playable identities/passive/ability
  coins/scrap -> improve appropriate owned items, NOT universal milestone bypass
```

Do not let temporary cards become permanent Gunsmith parts. Do not let Gunsmith
parts become armour. Do not let coins bypass every stage/boss/achievement gate.
If two systems do the same job, simplify one during Epic 25.

## How to Iterate (recipes)

**New data catalog**:
1. `src/data/x.json` + types in `src/systems/types.ts` + `GameData` field.
2. `validateXCatalog` in `validation.ts` (+ root/caps/unique IDs); cross-catalog refs only in `validateGameData`.
3. `DataXRegistry`: constructor revalidates, `structuredClone`+`deepFreeze`, lookup + frozen snapshot.
4. Focused validation/immutability tests.

**New pure gameplay rule**:
1. File in `src/gameplay/`, zero Phaser, `dtMs` as argument where time-based.
2. Randomness → named run-scoped stream; never `Math.random()`, never `menuRng`.
3. Stats/effects via approved contracts; feedback via bus.

**New Phaser system**:
1. `implements System`; unsubscribe in `destroy()`.
2. Wire in `GameScene` as coordinator only.
3. Respect active/pause state.

**New persistent system (Alpha 3)**:
1. Dedicated static definition + serializable owned-instance/state contract.
2. Explicit migration plan before adding fields to persistent state.
3. Pure transactional commands for equip/craft/upgrade/unlock.
4. UI consumes immutable read models and issues commands; it never mutates saves directly.
5. Prove the system has a unique progression role before shipping it.

## Test Patterns

- Pure modules: direct unit tests with seeded `createRng`.
- Phaser-touching classes: `vi.mock('phaser', ...)` with mock objects/groups.
- Registries: validate-then-freeze; mutation attempts fail.
- Validation: clone valid data → break one field → assert useful failure.
- Integration: headless harnesses where possible.
- Persistence: fresh + old-version fixtures for every schema bump.
- **Run before committing:** `npm run lint && npm run test && npm run build`.

## Cross-Cutting Rules

1. No Phaser in `engine/`/`gameplay/`.
2. Scenes stay thin.
3. Tuning in validated data + `RuntimeConfig` where appropriate.
4. Feedback via EventBus only.
5. All gameplay randomness via seeded run-scoped streams.
6. All stat/effect changes via approved shared contracts.
7. Save migrations are linear; never mutate schema shape informally.
8. No ads/paid power/energy/manipulative pacing.
9. Touchscreen readability/ergonomics are acceptance criteria, not an afterthought.
10. New persistent systems must have distinct progression responsibilities.

## Epic Pipeline

| Epic | Status | Notes |
|------|--------|-------|
| 0–4 | ✅ | Foundation, core loop, weapons/merge, cards, enemies/spawns |
| 5 | ✅ | Meta progression, SaveDataV2, banking |
| 6 | ✅ | Characters, `RunRequest`, reactive passives |
| 7 | ✅ | Arenas: data/selection/`spawnPoint`/world bounds/obstacles/hazards (PR #51) |
| 8 | ✅ | Event-driven loot/economy/chest shell (PRs #58–62) |
| 9 | ✅ | Menu, HUD, settings, controls, pause/inventory, chooser, summary (PR #64) |
| 10 | ✅ | Audio manager + wiring/placeholders (PRs #65/#68) |
| 11 | ✅ | Aggregate validation, curves, dev cheats/metrics/summary (PRs #66/#70) |
| 12 | ✅ | Pooling, feedback, reduced motion, performance/FIT (PR #71) |
| 13 | ✅ | Presentation seam, actor art, physics stability (PR #79) |
| 14 | ✅ | Six-slot rack, weapon acquisition, no-loss full rack, `weapon-rewards` (PR #80) |
| 15 | ✅ | Rack/merge UX, preview, direct HUD entry, responsive controls (PR #81) |
| 16 | 🟡 | Architecture/art direction PR #82 merged; runtime PR #83 open |
| 17 | ⏳ | Combat feel + weapon identity (#76) |
| 18 | ⏳ | Build variety/pacing + expanded card pool/stack indicators/placeholders (#77) |
| 19 | ⏳ | Alpha 2 player UX + touchscreen combat gate (#78) |
| 20 | 🧭 | Alpha 3 contracts/objectives/stages (#85) |
| 21 | 🧭 | Alpha 3 enemy roster + bosses (#86) |
| 22 | 🧭 | Alpha 3 persistent Gunsmith (#87) |
| 23 | 🧭 | Alpha 3 mercenary roster expansion (#88) |
| 24 | 🧭 | Alpha 3 armour/equipment sets (#89) |
| 25 | 🧭 | Alpha 3 progression integration/rebalance (#90) |

`🧭` means product scope exists but implementation must wait for a dedicated
architecture pass and the upstream phase gate.

## First Steps for Any Agent

1. This file.
2. `docs/epics.md` shared contracts/sequencing.
3. `docs/roadmap.md` current phase gate.
4. The epic's `docs/architecture/epic-N-*.md` if it exists; for sliced epics,
   prefer the most specific work package.
5. `src/engine/eventBus.ts`, `src/systems/types.ts`, `src/engine/context.ts`.
6. Target file + its tests.
7. `npm run test` baseline → implement → `lint && test && build`.

For Epics 20–25, stop after steps 1–3 unless a dedicated architecture document
has been created. The GitHub issue is product scope, not an implementation spec.
