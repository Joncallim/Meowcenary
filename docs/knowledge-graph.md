# Meowcenary Knowledge Graph

> Token-optimized repo map. Read this before any implementation work.
> Current state: **Epics 0–15 complete; Epic 15 merged in PR #81; Epic 16 architecture and art direction are in progress**. Epic 10 merged in two delivery PRs:
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
| `tests/` | ✅ 1311 tests | Vitest; mock Phaser via `vi.mock` | 86 files incl. integration harnesses |
| `docs/` | ✅ | Design + per-epic architecture | `epics.md` `roadmap.md` `architecture/epic-{3..16}-*.md` |

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

## Runtime Shape (after Epic 15)

```
main.ts → Phaser.Game([BootScene, MenuScene, GameScene])
BootScene: preload() loads audio plus seven actor-art spritesheets (best-effort)
           → loadGameData() (11 catalogs, fail-closed) → registries
           → register namespaced actor animations once
           (characters, arenas, metaUpgrades) → createGameContext → registry
           → one AudioManager(this) init(ctx.bus, ctx.settings, ctx.data.audio)
           → registry[AUDIO_MANAGER_REGISTRY_KEY] → start MenuScene
MenuScene.create(): fetch ctx + AudioManager → playMusic('music-menu')
           → first-gesture unlock pair (POINTER_DOWN once + keydown once,
           cross-removed) → update(delta) forwards to the manager
GameScene.create():
  assembleRunRequest(ctx, menuRng) → { characterId, arenaId, seed }
  arena = ctx.arenas.arenaById(arenaId); curve = arena.spawnCurveId → curve
  prepareRun({ state, basePlayer, meta, metaUpgrades, character }) → runState
  rng streams: createRng(deriveRunSeed(seed, 'spawns' | 'upgrades' | 'loot'
                          | 'weapon-rewards'))
  physics.world/camera bounds = arena.size; player spawns at arena centre
  dpsMeter = createDpsMeter(); subscribes enemy:damaged (stamped with
  runState.timeMs, effective damage only) — dev and production
  systems = [ProgressionSystem, PassiveCoordinator, SpawnSystem,
             HazardSystem, FeedbackSystem, WeaponSystem, WeaponRewardSystem,
             DropSystem, UpgradeSystem, (DebugCheatSystem, dev-only),
             HudController, (PlaytestSummarySystem, dev-only)]
  perfSampler = createPerfSampler(windowFrames, targetFps) — records delta
  (dev-only cheats: ?cheats=1&god=1&xp=4&scrap=3&spawn=2 — cached URL flags,
  direct import.meta.env.DEV gates, directorCurve = copied faster-cadence
  curve for SpawnSystem only, XP/scrap via ModifierStack 'debug:cheats')
  (AudioManager is NOT in systems — Boot owns it; scenes only cache the
  registry reference and clear it in handleShutdown, never destroy it)
  audio wiring right before startRun: playMusic('music-run') + unlock pair
GameScene.update(delta): perfSampler.recordFrame(delta) → tickRun
  → maybeEndRunForVictory (curve.durationSeconds) → systems.forEach(update)
  → audioManager.update(delta) → HUD/debug
  (F3 lines incl. sampled frame ms/FPS/slow%, enemy/kill counts,
   projectile/drop/FX active/allocated counts, and DPS(5s))
terminal event: ProgressionSystem banks first; dev PlaytestSummarySystem
  prints exactly one local console summary (row + optional upgrade table)
```

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

### GameEventMap (26 events, `src/engine/eventBus.ts`)
```
run:start/paused/resumed/won/lost   player:damaged/died
enemy:spawned/damaged/killed        weapon:fired   projectile:hit
xp:gained  level:up  card:offered(offerId+choices)/chosen  weapon:merged
drop:collected(kind xp|scrap)  currency:changed  hazard:triggered
weapon:acquired(definitionId,instanceId,rackCount/rackCapacity,x,y)
weapon:pickup-blocked(definitionId,reason:rack-full,...)
settings:changed(settings)   ui:navigate   ui:confirm   ui:back
```
Epic 8 Slice 2 extended `enemy:killed` with `scrapValue` + optional `lootTableId`
(no new events). Epic 10 added `settings:changed` plus the `ui:*` events.
Epic 14 added `weapon:acquired` and `weapon:pickup-blocked` (rack acquisition
signals; weapons never emit `drop:collected`). `settings:changed` is
emitted only by `GameContext.updateSettings` on settings-identity change;
`ui:*` are emitted only from MenuScene, GameScene, PhaserPauseView, and
PhaserRunSummaryView dispatch points (controllers and `ui/modal.ts` stay
headless). Rules: systems emit; audio/UI/debug subscribe; map is additive.

### RunState (`src/gameplay/runState.ts`)
```ts
{ status: 'intro'|'active'|'paused'|'won'|'lost', seed, characterId, arenaId,
  timeMs, level, xp, xpToNext, kills, currency, stats: ModifierStack,
  equipped: WeaponInstance[], upgradeStacks, pauseReason, outcome? }
```
Helpers: `createRunState/startRun/pauseRun/resumeRun/tickRun/endRun/canRestartRun`.
Simulation must not advance unless `status === 'active'`.

### ModifierStack (`src/gameplay/stats.ts`)
`STAT_KEYS` const array → `StatKey` (12 keys incl. `currencyGain`, `pickupRadius`).
`resolve`: all `add` then all `mult`; throws on non-finite. Higher = better.
Fire interval = `baseFireRateMs / attackSpeed`. Stack authority: `RunState.upgradeStacks`.
Modifier source namespaces: `card:<id>:<stack>`, `meta:<id>:<level>`, `character:<id>`.

### Save (`src/systems/save.ts`)
`SaveDataV2 { version:2, settings, meta: MetaState }`; `MetaState { scrap, unlocks, permanentUpgrades }`.
Linear V1→V2 migration; unknown future versions fail closed. Unlock namespaces:
`character:<id>`, `arena:<id>`, `achievement:<id>` (`isUnlockId`).

### Weapon / Enemy / Arena essentials
- `WeaponInstance { instanceId, defId, family, tier }` — Phaser-free, serializable; runtime machinery stays in `WeaponSystem`.
- `EnemyDefinition` = union over archetypes (`chaser|charger|tank` spawnable; `ranged|boss` direct; `elite` = `{ baseEnemyId }`, resolved ×`ELITE_MULTIPLIERS`). Stats incl. `xpValue`, `scrapValue`.
- `ArenaDefinition { id, name, size, spawnCurveId, spawnRegions[], obstacles[], hazards[], unlock }`; `spawnPoint(arena, rng)` pure; `RunState.arenaId` authoritative everywhere.
- `SpawnCurveDefinition { id, durationSeconds, scaling{healthPerMinute,damagePerMinute}, waves[] }`.

## How to Iterate (recipes)

**New data catalog** (Epic 8 loot tables followed exactly this):
1. `src/data/x.json` + types in `src/systems/types.ts` + `GameData` field.
2. `validateXCatalog` in `validation.ts` (+`ROOT_FIELDS`, `MAX_*` caps, `assertUniqueIds`);
   cross-catalog refs via `assert*References` **only in `validateGameData`**.
3. `DataXRegistry` in `src/systems/x.ts`: constructor revalidates, `structuredClone`+`deepFreeze`, `byId` map, frozen snapshot.
4. Tests: clone-valid→mutate→assert-throws; registry freeze tests.

**New pure gameplay rule**:
1. File in `src/gameplay/`, zero Phaser, `dtMs` as argument.
2. Randomness → `createRng(deriveRunSeed(seed, '<stream>'))` created once in GameScene; never `Math.random()`, never `menuRng`.
3. Stats via `ModifierStack`; feedback via `bus.emit`.

**New Phaser system**:
1. `implements System` (`update(dtMs)`, `destroy()`); unsubscribe bus listeners in `destroy()`.
2. Wire in `GameScene.create()` systems array; teardown is automatic via `handleShutdown`.
3. Respect `runState.status !== 'active'` early-return.

**New event**: append to `GameEventMap`; emit from systems; never add when an
existing event covers it (Epic 8 adds none — it extends one payload).

**Kill-reward changes**: Epic 8 owns this — `enemy:killed` payload →
`DropSystem` → `src/gameplay/loot.ts`. Never write `MetaState` (Epic 5 banks).

## Test Patterns

- Pure modules: direct unit tests with seeded `createRng`.
- Phaser-touching classes: `vi.mock('phaser', ...)` with Mock arcs/bodies/groups (see `dropSystem.test.ts`, `enemy.test.ts`); overlap callbacks captured and invoked manually.
- Registries: validate-then-freeze; mutation attempts fail.
- Validation: `structuredClone(valid)` → break one field → `expect(...).toThrow(/field/)`.
- Integration: headless harnesses (`arenaBrowserIntegration.test.ts` model).
- **Run before committing:** `npm run lint && npm run test && npm run build`.

## Cross-Cutting Rules

1. No Phaser in `engine/`/`gameplay/`. 2. Scenes stay thin. 3. Tuning in `src/data/*.json` + `RuntimeConfig`. 4. Feedback via EventBus only. 5. All randomness via seeded run-scoped streams. 6. All stat changes via `ModifierStack`. 7. Save migrations are linear; never mutate shape in place. 8. No ads/paid power/energy/manipulative pacing. 9. Use reviewable slices; Epics 9, 10, and 11 are the explicit single-branch/single-delivery-PR exceptions defined by their architecture documents.

## Epic Pipeline

| Epic | Status | Notes |
|------|--------|-------|
| 0–4 | ✅ | Foundation, core loop, weapons/merge, cards, enemies/spawns |
| 5 | ✅ | Meta progression, SaveDataV2, banking (`computeRunReward`/`bankReward`) |
| 6 | ✅ | Characters, `RunRequest`, reactive passives |
| 7 | ✅ | Arenas: data/selection/`spawnPoint`/world bounds/obstacles/hazards (PR #51) |
| 8 | ✅ | Slices 1–5 merged; event-driven kill-to-loot pipeline, chest shell, integration harness (PRs #58–62) |
| 9 | ✅ | Merged (PR #64): menu, HUD, settings, controls, pause/inventory, chooser, summary |
| 10 | ✅ | Merged: #65 (slices 1–2, data/events + `AudioManager`) + #68 (slices 3–5, wiring/`ui:*`/placeholders); see `epic-10-audio.md` + `epic-10-audio-remainder.md` |
| 11 | ✅ | Merged: #66 (slices 1–2, aggregate validation + curve helpers) + #70 (slices 3–5, dev cheats + metrics + playtest summary); see `epic-11-balancing-and-developer-tooling.md` + `epic-11-remainder.md` |
| 12 | ✅ | Merged: PR #71 (polish + performance: pooling, feedback, reduced motion, perf sampler, responsive sizing); see `epic-12-polish-and-performance.md` |
| 13 | ✅ | Merged: PR #79 (actor-view seam, catalog #11, seven Pixelorama assets, opt-in physics debug, deterministic charger clipping); see `epic-13-presentation-runtime.md` |
| 14 | ✅ | Merged: PR #80 (six-slot rack, one-T1-weapon starts, capacity-checked admission, no-loss full-rack pickups, seeded `weapon-rewards` stream, guaranteed early duplicate, `n/6` HUD capacity); see `epic-14-weapon-acquisition-and-rack-economy.md` |
| 15 | ✅ | Merged: PR #81 (immutable rack read model, exact merge preview, direct HUD entry, responsive 2x3/3x2 rack, tap and repeat-safe keyboard controls); see `epic-15-inventory-and-merge-experience.md` |
| 16 | 🟡 | Architecture and selected art direction on `codex/epic-16-visual-identity`; runtime implementation pending; see `epic-16-visual-identity-and-junkyard-world.md` |

## First Steps for Any Agent

1. This file. 2. `docs/epics.md` (shared contracts). 3. The epic's
`docs/architecture/epic-N-*.md` if it exists — for a sliced epic, prefer the
most specific `epic-N-slice-M-*.md` work package over the epic overview when
both exist. 4. `src/engine/eventBus.ts`,
`src/systems/types.ts`, `src/engine/context.ts`. 5. Target file + its test.
6. `npm run test` baseline → implement → `lint && test && build`.
