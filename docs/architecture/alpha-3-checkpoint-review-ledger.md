# Alpha 3 Checkpoint Review Ledger

**Purpose:** persistent record of the deliberate “plan → stop → review against the integrated codebase → refine” process for the Alpha 3 recovery/product tranche.

**Implementation baseline:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Planning branch:** `codex/alpha3-art-compendium-planning` / PR #169.

This ledger exists so later implementation agents do not receive a polished final document with no record of which assumptions were challenged. A checkpoint is closed only when its material findings are either incorporated into the plan or explicitly carried as an implementation blocker.

---

# Checkpoint 0 — live acceptance reality

## Evidence reviewed

- exact deployed acceptance SHA and build logs;
- Chrome/macOS user playtest notes/screenshots;
- #164/#165/#166;
- current MenuScene/GameScene behavior around pickups, framing and navigation.

## Material findings

1. Runtime freeze around a cyan/green spawned object prevents meaningful acceptance continuation.
2. Characters surface does not scale vertically and has inadequate visual identity.
3. `Progression` is not a comprehensible player concept next to Character/Equipment/Gunsmith.
4. Arena and Stage are presented as peer choices despite Stage already owning Arena in normal run composition.
5. Upgrade-card typography/presentation lacks one visual hierarchy.
6. Player/camera framing feels constrained toward the top.

## Decision

Do not treat these as superficial polish. #164 is a release blocker; #165/#166 are product acceptance failures. Product/menu architecture must reflect Stage-as-composition-root rather than preserving the current menu merely because it is technically wired.

**Status:** CLOSED into #164/#165/#166 and later planning.

---

# Checkpoint 1 — “fun/addictive” benchmark

## Public product evidence reviewed

Large mobile survivor/roguelite references with strong download/play evidence:

- Survivor.io;
- Archero;
- Heroes vs Hordes;
- Vampire Survivors;
- Brotato.

Review focused on repeated product patterns, not copied content/expression or monetisation.

## Common patterns that survived review

- immediate one-thumb/low-input comprehension;
- frequent meaningful build decisions;
- visible power snowball;
- readable escalating pressure;
- short return from result → next action;
- character/build variety;
- clear chapter/stage/boss milestones;
- collectible content that reinforces gameplay identity.

## Explicitly rejected patterns

- energy;
- ad rewards;
- daily obligation/streak pressure;
- paid power;
- loot-box scarcity;
- currency proliferation;
- forced grind walls;
- copied upgrade/evolution/shop systems.

## Codebase cross-check

### Strong existing foundations

- automatic targeting/fire already fits low-input mobile play;
- four-card deterministic upgrade system already produces repeated choices;
- weapon reward cadence already targets first drop at 20–40s and repeats at 30–45s;
- family-scoped upgrades already support run identity;
- Gunsmith traits already provide FIRE/burn, EXPLOSIVE/splash and PIERCING behavior without part-ID branches;
- run summary already has Retry and Next Contract;
- ProgressionOverview already computes concrete next goals.

### Product weaknesses exposed

- ten stages are structurally valid but reuse the same physical arena/bundle and several encounter profiles;
- current reward profiles dump whole four-piece sets, sometimes two whole sets at a boss;
- legacy permanent progression is four generic stat ladders that overlap other systems;
- menu exposes internal architecture vocabulary instead of player goals;
- no product-level evidence gate currently catches long boring stretches.

## Plan changes

Created `docs/gameplay/alpha-3-engagement-benchmark.md`, including:

- ≤35s low-information stretch gate;
- multiple perceptible power moments per successful run;
- build identity by roughly the midpoint;
- distinct stage thesis;
- Contract-first IA;
- reward-density limits;
- 5–10s Retry/Next action target;
- explicit fun/replayability acceptance in addition to CI.

**Status:** CLOSED — benchmark is now product authority.

---

# Checkpoint 2 — consolidated architecture blueprint

## Subsystems reviewed

### Run composition

Files:

```text
src/gameplay/runRequest.ts
src/gameplay/stage/stageContracts.ts
src/gameplay/stage/stageRuntime.ts
src/gameplay/stage/spawnComposition.ts
src/gameplay/spawnDirector.ts
src/scenes/GameScene.ts
```

Finding: Stage already owns Arena/objective/encounter/difficulty/reward for normal Alpha 3. Arena-vs-Stage confusion is presentation debt, not a need for a new composition model.

Decision: make Contract the player concept; keep Arena as location and optional explicit Training compatibility.

### Save/progression

Files:

```text
src/systems/save.ts
src/gameplay/meta.ts
src/gameplay/runStart.ts
src/gameplay/conditionEvaluator.ts
src/gameplay/grantProcessor.ts
src/engine/context.ts
src/systems/ProgressionSystem.ts
src/ui/progressionController.ts
src/ui/progressionOverviewController.ts
src/data/meta-upgrades.json
src/data/achievements.json
```

Findings:

- Compendium has no honest V3 domain.
- legacy permanent upgrades are applied to every fresh run in `prepareRun`.
- retiring the UI alone would leave hidden old-save power.
- `achievement:permanent-reinforced-coat-3` depends on the legacy system and would become impossible.
- progression grant/condition vocabularies still contain legacy permanent-level primitives.
- the localStorage key is historically named **`meowcenary.save.v2`** despite the current V3 schema.

Decisions:

- one V4 migration handles Compendium + retirement/refund of permanent upgrades;
- deterministic refund uses a frozen V3 migration schedule, never current balance data;
- preserve the old Well Protected historical fact when earned, remove it from active V4 catalog, add a new Forge Warden boss achievement under a new stable ID;
- remove active legacy permanent-level condition/grant primitives after migration;
- remove permanent modifiers from run preparation;
- **do not rename the existing storage key during V4**. The storage key is persisted identity, not schema documentation. Changing it would strand V1–V3 data before migration can read it. A key migration would require an explicit dual-read/one-write design and has no product value here.

### Enemy death topology

Files:

```text
src/entities/Enemy.ts
src/systems/WeaponSystem.ts
src/gameplay/abilities.ts
src/scenes/GameScene.ts
src/engine/eventBus.ts
```

Findings:

- Enemy owns health, shield logic, damage event, split and destruction correctly.
- WeaponSystem separately owns kill increment + `enemy:killed`.
- Heat Vent bypasses that settlement path.

Decision: do not rewrite Enemy health. Add one narrow damage resolver that wraps `Enemy.takeDamage`, captures kill facts and performs canonical kill settlement. Weapon/ability callers use it; existing consumers remain on `enemy:killed`.

### Equipment

Files:

```text
src/gameplay/equipment.ts
src/systems/equipment.ts
src/systems/validation/equipment.ts
src/data/equipment.json
src/engine/context.ts
tests/equipment.test.ts
```

Findings:

- set bonus/tier gate ownership is hidden on one arbitrary provider piece;
- validator and synthetic test actively teach that convention;
- effect rows manually duplicate owning `sourceId`.

Decision: first-class `equipment-sets.json`; evolve DataEquipmentRegistry to own set + piece lookups; piece/set/part/ability data use source-free ModifierSpec; runtime derives source identity.

### Visual art / loading / tooling

Files:

```text
src/systems/types.ts
src/systems/visualArt.ts
src/systems/assetBundles.ts
src/scenes/BootScene.ts
src/entities/actorView.ts
src/systems/validation.ts
src/systems/validation/equipment.ts
src/systems/validation/parts.ts
docs/art/scripts/validate-visual-art.mjs
docs/art/scripts/validate-builders.lua
docs/art/scripts/export-pixelorama.sh
src/data/visual-art.json
src/data/asset-bundles.json
```

Findings:

- logical binding and Phaser texture are currently one object;
- unique texture per binding + 256 binding cap is too tight for the planned UI/art catalog;
- Boot eagerly loads almost all non-world art;
- Equipment/Part validators require borrowed `upgrade-icon` art;
- builder validation still has per-ID registrations;
- current export validation derives production source path from runtime URL, which will not survive atlasing.

Decision:

- separate stable logical bindings from physical resources;
- use bounded coarse renderer kinds;
- use deterministic named-frame atlases for static UI families;
- make production source/builder/export provenance explicit at the logical binding/production contract;
- resolve physical resources through bundles and run closure;
- lazy-load heavy surfaces/run assets, cache after load, no Alpha 3 eviction framework;
- make builder verification manifest/family-driven;
- add non-destructive deterministic parity check.

### Menu/UI

Files:

```text
src/ui/menus.ts
src/scenes/MenuScene.ts
src/ui/characterSelectionController.ts
src/ui/stageSelectionController.ts
src/ui/runSummary.ts
src/ui/focusList.ts
src/ui/layout.ts
```

Findings:

- current home exposes Character/Arena/Progression/Gunsmith/Settings/Stage/Equipment as flat peers;
- Characters renders a growing vertical list with no scalable scrolling path;
- current result view already provides useful Next Contract/Retry seams.

Decision:

```text
Play Contract
Mercenary
Loadout → Equipment/Gunsmith
Career → goals/Achievements/Compendium
Training (optional Golden Run)
Settings
```

Add one reusable scroll/focus component rather than a one-off Character fix.

### Stage/reward content

Files:

```text
src/data/stages.json
src/data/encounter-profiles.json
src/data/difficulty-profiles.json
src/data/reward-profiles.json
src/data/arenas.json
src/data/asset-bundles.json
src/gameplay/stage/spawnComposition.ts
```

Findings:

- all ten stages currently use `junkyard-lot` + one world bundle;
- several Forge stages are compositionally recycled Junkyard stages;
- current spawn composition can introduce roster layers over time and should be exploited before inventing a scripting model;
- full-set reward dumps are product plumbing, not acceptable collection pacing.

Decision:

- distinct stage thesis and encounter composition first;
- add a justified Forge/Foundry arena treatment using existing Arena mechanics;
- do not add a general encounter scripting engine unless playtest evidence remains flat after content composition improves;
- cap persistent first-clear reward density and distribute acquisition across stages/achievements/milestones.

## Architecture output

Created `docs/architecture/alpha-3-implementation-blueprint.md`.

## Ambiguities removed

- no second save migration for Compendium vs Progression retirement;
- no hidden legacy stat benefits;
- no reuse of retired achievement ID for a different meaning;
- no provider equipment row;
- no semantic renderer-kind explosion;
- no hand-authored atlas frame numbers as stable identity;
- no new encounter scripting system by default;
- no item-per-texture assumption;
- no storage-key rename during schema migration.

**Status:** CLOSED at planning level; implementation proof remains #170 + feature issues.

---

# Checkpoint 3 — art/content authority reconciliation

**Status:** OPEN.

Required before art production begins:

1. update #167 briefs/matrix from Alpha-3-plumbing catalog to active V4 target;
2. replace Well Protected badge with Warden Down;
3. add full Forge/Foundry world art packet;
4. ensure all new menu surfaces have art slots;
5. re-run exact stable-ID set equality against target catalogs;
6. review every art family against silhouette/originality/readability and atlas/resource constraints.

This checkpoint closes only after an independent review finds no stale current-content identity in the production brief.

---

# Checkpoint 4 — Codex implementation handoff readiness

**Status:** OPEN.

Pass conditions:

- #164 reproduction/fix requirements are explicit;
- implementation blueprint file map and target interfaces are current;
- #170 contains every cross-cutting template/resource gate;
- product/content issue owns engagement changes instead of hiding them in #165/#170;
- latest PR #169 review threads are resolved and a fresh review has evaluated the current head;
- no known architectural decision is left for Codex to invent during implementation;
- remaining unknowns are empirical tuning/playtest questions, not ownership/schema ambiguity.

---

# Future implementation checkpoint template

For every landed slice append:

```text
Checkpoint:
Candidate SHA:
Files changed:
RED evidence:
Focused green evidence:
Whole-suite evidence:
Stable IDs changed intentionally:
Save migration impact:
Deterministic RNG/pool impact:
Input/lifecycle impact:
N+1 authoring impact:
Product/engagement impact:
Manual evidence available/unavailable:
Adversarial findings:
Remediation:
Verdict: PASS / FAIL / UNVERIFIED
```

Never write PASS for an unavailable manual/device condition.
