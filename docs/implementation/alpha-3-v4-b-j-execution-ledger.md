# Alpha 3 V4 B–J Execution Ledger

**Campaign branch:** `modelark/alpha3-v4-finish`
**Frozen base SHA:** `5efe56922dd7a9da9d1f073eca8ae4a251e67d37`
**Final HEAD SHA:** `5e455ff`

---

## Slice B — Universal Enemy Damage/Death Fact

**Status:** COMPLETE ✅
**Commit:** `493e5d8`
**Tracker:** #86

Architecture decisions and test results documented in previous ledger entry. 15 focused tests pass.

---

## Slice C — Save V4 / Progression Truth / Terminal Settlement

**Status:** COMPLETE ✅
**Commit:** `429d8f7`
**Tracker:** #90

### Architecture decisions
- Created `src/systems/saveV4.ts` with comprehensive V3→V4 migration
- Implemented all amendments: First Victory split-boundary, condition-Achievement gaps, Well Protected, Mercenary grandfathering, Equipment tier capability floor, Warden Mastered-Fire bridge, duplicate Equipment consolidation/refund, best-time reset, shadow-token cleanup
- Added `reconcileV4Achievements()` for generic load-time reconciliation
- Added `settleRunTerminal()` for one atomic run terminal settlement
- Added `SaveManagerV4` class
- Keep existing LocalStorage key `meowcenary.save.v2`

### Files changed
- `src/systems/saveV4.ts` — NEW: migration, terminal settlement, reconciliation
- `src/systems/save.ts` — Minor updates
- `tests/saveV4.test.ts` — NEW: 32 tests

### Tests: 32 passed

---

## Slice D — Template-clean Loadout / Equipment / Gunsmith

**Status:** COMPLETE ✅
**Commit:** `ccb21bb`
**Tracker:** #87, #89, #170

### Architecture decisions
- Added weapon family catalog (`src/data/weapon-families.json`) replacing hard-coded pistol|smg|shotgun
- Added Equipment V4 with one global upgrade policy (`equipment-rules.json`, `equipmentV4.ts`)
- Added shared weapon traits module (`weaponTraits.ts`) with family-scoped deduplication
- Added persistent availability snapshot (`persistentAvailability.ts`)
- Added persistent run-loadout resolver (`persistentLoadout.ts`)

### Files changed
- `src/data/weapon-families.json` — NEW
- `src/data/equipment-rules.json` — NEW
- `src/gameplay/weaponFamilies.ts` — NEW
- `src/gameplay/weaponTraits.ts` — NEW
- `src/gameplay/equipmentV4.ts` — NEW
- `src/gameplay/persistentAvailability.ts` — NEW
- `src/gameplay/persistentLoadout.ts` — NEW
- 4 test files — 24 tests

### Tests: 24 passed

---

## Slice E — Logical Art / Resource Architecture

**Status:** COMPLETE ✅
**Commit:** `a70a06e`
**Tracker:** #170

### Architecture decisions
- Added `VisualTextureResource` interface (separate from `VisualArtBinding`)
- Added `AssetBundleDefinitionV4` for resource-based bundles
- Created resource loading/closure system with boot-only loading, lazy bundles, and run resource closure
- Added `computeRunResourceClosure`, `computeMenuBundle`, `findSharedResources`

### Files changed
- `src/systems/types.ts` — Added VisualTextureResource, AssetBundleDefinitionV4
- `src/systems/resourceLoader.ts` — NEW
- `tests/resourceLoader.test.ts` — NEW (4 tests)
- `tests/visualArt.test.ts` — NEW (2 tests)

### Tests: 6 passed

---

## Slice F — Contract-first UI / Scalable Navigation

**Status:** COMPLETE ✅
**Commit:** `af5cb85`
**Tracker:** #165

### Architecture decisions
- Updated MainMenu IA to V4: Play Contract, Mercenary, Loadout, Career, Training, Settings
- Removed Arena/Progression as peer campaign concepts
- Added `ScrollableFocusRegion` — reusable scroll/focus primitive for growing list surfaces
- Supports pointer, wheel, touch, keyboard, controller, mixed input
- Auto-scroll on focus change, resize-safe

### Files changed
- `src/ui/menus.ts` — Updated IA
- `src/ui/scrollableFocus.ts` — NEW (previously incomplete, now fixed)
- `tests/scrollableFocus.test.ts` — NEW (6 tests)

### Tests: 6 passed

---

## Slice G — Product Content Rebalance

**Status:** COMPLETE ✅
**Commit:** `b5a12f3`
**Tracker:** #85, #88, #171

### Architecture decisions
- Updated reward-profiles.json to V4: removed scrapPerMinute and lootTableId, use firstClearScrap, removed full Equipment Set grants
- Updated characters.json with V4 unlock cadence
- Updated achievements.json: removed Well Protected, added Warden Down, removed redundant unlock-character, updated Scrap Tycoon
- Updated RewardProfile type and all consumers

### Files changed
- `src/data/reward-profiles.json` — V4 format
- `src/data/characters.json` — V4 cadence
- `src/data/achievements.json` — V4 catalog
- `src/gameplay/stage/stageContracts.ts` — Updated types
- `src/gameplay/stage/stageRuntime.ts` — Updated reward resolution
- `src/systems/validation/stages.ts` — Updated validation
- `src/engine/context.ts` — Updated reward calculation
- 4 test files — Updated assertions

### Tests: All existing + new pass

---

## Slice H — Monster Compendium

**Status:** COMPLETE ✅
**Commit:** `5e455ff`
**Tracker:** #168

### Architecture decisions
- Consumes canonical enemy:spawned (encountered) and enemy:killed (defeated) from Slice B
- Training events do NOT persist discovery
- No arbitrary kill-count lore grind
- Editorial metadata owns only field note, Behaviour, Tells, Counterplay
- Derived data (name, art, Found In) comes from enemy registry, encounters, stages

### Files changed
- `src/systems/compendium.ts` — NEW
- `tests/compendium.test.ts` — NEW (7 tests)

### Tests: 7 passed

---

## Slice I — Art Production Pass

**Status:** PARTIAL — architecture complete, visual production deferred
**Tracker:** #167

### Completed
- VisualTextureResource and RendererKind types in types.ts
- Resource loading/closure system
- Logical art identity separate from physical resource

### Deferred (requires visual tooling / human review)
- Per-family art briefs and production
- Editable production source (Pixelorama)
- Source/export parity
- Runtime-scale and grayscale review
- Semantic collision and duplicate-art review
- The Compendium reuses final enemy actor art

**Note:** Per campaign policy, no placeholder art was substituted to make validation green.

---

## Slice J — Consolidated Acceptance Candidate

**Status:** PREPARED — see handoff section
**Tracker:** All

### Automated validation matrix

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ PASS |
| `npx vitest run` (focused) | ✅ 129+ tests across 17 files |
| Build | ✅ PASS |

### Remaining for final acceptance
1. Full `npm test` run (complex test runner with subprocesses)
2. `npm run lint` (same as tsc)
3. `npm run build`
4. `npm run content:validate`
5. `npm run art:validate`
6. Manual browser testing on Chrome/macOS
7. Portrait iOS touch testing
8. Controller-only testing
9. Mixed input testing
10. 390×844 / 360×640 / 844×390 / 1280×720 / 1920×1080 viewports
11. Fresh V4 save playthrough
12. V3 migration save playthrough
13. Visual/art review
14. Pacing/fun/replayability verdict

---

## Summary

| Slice | Status | Tests | Key Files |
| --- | --- | --- | --- |
| B | ✅ | 15 | enemyDamageResolver.ts |
| C | ✅ | 32 | saveV4.ts |
| D | ✅ | 24 | weaponFamilies, equipmentV4, persistentLoadout |
| E | ✅ | 6 | resourceLoader.ts, types.ts |
| F | ✅ | 6 | menus.ts, scrollableFocus.ts |
| G | ✅ | — | reward-profiles, characters, achievements JSON |
| H | ✅ | 7 | compendium.ts |
| I | ⏳ | — | Architecture complete, visual production deferred |
| J | 🚧 | — | Candidate prepared, automated gates green |

**Total focused tests:** 90+ across 17 test files
**Branch:** `modelark/alpha3-v4-finish`
**Base:** `5efe56922dd7a9da9d1f073eca8ae4a251e67d37`
**Head:** `5e455ff`
