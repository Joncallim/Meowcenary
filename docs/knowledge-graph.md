# Meowcenary Knowledge Graph

> Token-optimized repo map. Read this before any implementation work.
> Current state: **Epics 0–7 complete; Epic 8 Slices 1–2 merged** (PRs #58–59).
> Slice 3 is next; see `docs/architecture/epic-8-loot-and-economy.md`.
> 632 tests / 53 files green.

## Stack

```
Phaser 3.90 + TypeScript 5.8 + Vite 7 + Vitest 3.2
Node 22, ES2022, strict, noEmit. Canvas 390×844, browser-first, mobile-friendly.
```

## Directory Map

| Dir | Status | Rules | Contents |
|-----|--------|-------|----------|
| `src/engine/` | ✅ | **No Phaser** (pure, unit-tested) | `config` `eventBus` `rng` `vector` `cadence` `context` `sceneKeys` `system` |
| `src/gameplay/` | ✅ | **No Phaser** (pure rules) | `runState` `runStart` `runRequest` `stats` `xp` `targeting` `weapons` `weaponStats` `merge` `upgrades` `levelUpQueue` `projectilePattern` `enemyMovement` `enemyScaling` `spawnDirector` `spawnRegion` `loot` `meta` `characterSelection` `characterContribution` `characterPassives` `arenaSelection` |
| `src/entities/` | ✅ | May use Phaser (display objects) | `Player` `Enemy` `Projectile` `XpDrop` |
| `src/systems/` | ✅ | May use Phaser (coordinators) | `types` `validation` `save` `input` `audio` `debug` `ids` `enemies` `characters` `arenas` `lootTables` `metaUpgrades` `weaponRegistry` `SpawnSystem` `WeaponSystem` `UpgradeSystem` `DropSystem` `ProgressionSystem` `PassiveCoordinator` `HazardSystem` `arenaScenery` |
| `src/scenes/` | ✅ | Thin coordinators only | `BootScene` `GameScene` |
| `src/ui/` | ✅ | May use Phaser | `UpgradeChooser` `upgradeChooserController` `upgradeChooserLayout` `characterSelectionController` `arenaSelectionController` `progressionController` |
| `src/data/` | ✅ | JSON, validated at boot | `weapons` `enemies` `upgrades` `meta-upgrades` `spawn-curves` `characters` `arenas` `loot-tables` |
| `tests/` | ✅ 632 tests | Vitest; mock Phaser via `vi.mock` | 53 files incl. integration harnesses |
| `docs/` | ✅ | Design + per-epic architecture | `epics.md` `roadmap.md` `architecture/epic-{3..8}-*.md` |

Epic 8 Slices 1–2 added `src/data/loot-tables.json`, `src/gameplay/loot.ts`,
and `src/systems/lootTables.ts`. Slice 3 adds `src/entities/Drop.ts`; Slice 4
then replaces `XpDrop.ts` in the runtime pipeline.

## Runtime Shape (after Epic 8 Slice 2)

```
main.ts → Phaser.Game([BootScene, GameScene])
BootScene: loadGameData() (8 catalogs, fail-closed) → registries
           (characters, arenas, metaUpgrades) → createGameContext → registry
GameScene.create():
  assembleRunRequest(ctx, menuRng) → { characterId, arenaId, seed }
  arena = ctx.arenas.arenaById(arenaId); curve = arena.spawnCurveId → curve
  prepareRun({ state, basePlayer, meta, metaUpgrades, character }) → runState
  rng streams: createRng(deriveRunSeed(seed, 'spawns' | 'upgrades'))
  physics.world/camera bounds = arena.size; player spawns at arena centre
  systems = [ProgressionSystem, PassiveCoordinator, SpawnSystem,
             HazardSystem, WeaponSystem, DropSystem, UpgradeSystem, AudioManager]
GameScene.update(delta): tickRun → maybeEndRunForVictory (curve.durationSeconds)
  → systems.forEach(update) → HUD/debug
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

### GameEventMap (21 events, `src/engine/eventBus.ts`)
```
run:start/paused/resumed/won/lost   player:damaged/died
enemy:spawned/damaged/killed        weapon:fired   projectile:hit
xp:gained  level:up  card:offered(offerId+choices)/chosen  weapon:merged
drop:collected(kind xp|scrap)  currency:changed  hazard:triggered
```
Epic 8 Slice 2 extended `enemy:killed` with `scrapValue` + optional `lootTableId`
(no new events). Rules: systems emit; audio/UI/debug subscribe; map is additive.

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

1. No Phaser in `engine/`/`gameplay/`. 2. Scenes stay thin. 3. Tuning in `src/data/*.json` + `RuntimeConfig`. 4. Feedback via EventBus only. 5. All randomness via seeded run-scoped streams. 6. All stat changes via `ModifierStack`. 7. Save migrations are linear; never mutate shape in place. 8. No ads/paid power/energy/manipulative pacing. 9. Small PRs per slice.

## Epic Pipeline

| Epic | Status | Notes |
|------|--------|-------|
| 0–4 | ✅ | Foundation, core loop, weapons/merge, cards, enemies/spawns |
| 5 | ✅ | Meta progression, SaveDataV2, banking (`computeRunReward`/`bankReward`) |
| 6 | ✅ | Characters, `RunRequest`, reactive passives |
| 7 | ✅ | Arenas: data/selection/`spawnPoint`/world bounds/obstacles/hazards (PR #51) |
| 8 | 🚧 Slices 1–2 complete | Loot data + pure resolver merged; Slice 3 poolable magnet `Drop` is next |
| 9–12 | Open | UI/UX, audio, balancing/tools, polish/perf (pooling `Drop`+`Projectile`) |

## First Steps for Any Agent

1. This file. 2. `docs/epics.md` (shared contracts). 3. The epic's
`docs/architecture/epic-N-*.md` if it exists; for Epic 8 Slice 3, use
`docs/architecture/epic-8-slice-3-drop.md`. 4. `src/engine/eventBus.ts`,
`src/systems/types.ts`, `src/engine/context.ts`. 5. Target file + its test.
6. `npm run test` baseline → implement → `lint && test && build`.
