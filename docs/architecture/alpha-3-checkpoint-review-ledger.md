# Alpha 3 Checkpoint Review Ledger

**Purpose:** persistent record of the deliberate “plan → stop → review against the integrated codebase → refine” process for the Alpha 3 recovery/product tranche.

**Implementation baseline:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Planning branch:** `codex/alpha3-art-compendium-planning` / PR #169.

**Current implementation authority:** `alpha-3-final-execution-handoff.md` + `content-authoring-templates-v4.md`. The intermediate implementation blueprint and pre-V4 template documents are historical redirect stubs, not live contracts.

This ledger exists so later implementation agents do not receive a polished final document with no record of which assumptions were challenged. A checkpoint is closed only when its material findings are either incorporated into the plan or explicitly carried as an implementation blocker. External evidence that is unavailable remains **UNVERIFIED**, never inferred green.

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

# Checkpoint 1 — engagement benchmark

## Public product evidence reviewed

Large mobile survivor/roguelite references with strong download/play evidence were reviewed for repeated outcome patterns rather than copied content/expression or monetisation.

## Patterns retained

- immediate one-thumb/low-input comprehension;
- frequent meaningful build decisions;
- visible power snowball;
- readable escalating pressure;
- short return from result → next action;
- character/build variety;
- clear chapter/Contract/boss milestones;
- collectible content that reinforces gameplay identity.

## Explicitly rejected

- energy;
- ad rewards;
- daily obligation/streak pressure;
- paid power;
- loot-box scarcity;
- currency proliferation;
- forced grind walls;
- copied upgrade/evolution/shop systems.

## Codebase cross-check

Existing strengths:

- automatic targeting/fire fits low-input mobile play;
- deterministic four-card upgrade choices already exist;
- scheduled weapon rewards create physical arsenal beats;
- family-scoped upgrades support run identity;
- FIRE/EXPLOSIVE/PIERCING behavior already exists without Part-ID branches;
- Retry/Next Contract seams already exist;
- ProgressionOverview already computes concrete next goals.

Product weaknesses:

- ten RC1 stages reuse the same physical Arena/world bundle too broadly;
- reward profiles dump whole Equipment Sets;
- legacy permanent progression overlaps newer systems;
- menu exposes internal architecture vocabulary;
- no product-level evidence gate catches long boring stretches.

## Plan changes

`docs/gameplay/alpha-3-engagement-benchmark.md` now freezes:

- ≤35s unexplained low-information stretch gate;
- multiple perceptible power moments per successful run;
- build identity by roughly midpoint;
- distinct Contract thesis;
- Contract-first IA;
- fixed legible first-clear rewards and density limits;
- 5–10s Retry/Next action target;
- explicit fun/replayability acceptance in addition to CI.

**Status:** CLOSED — benchmark is product authority.

---

# Checkpoint 2 — whole-codebase architecture reconciliation

## Run composition

Reviewed:

```text
src/gameplay/runRequest.ts
src/gameplay/stage/stageContracts.ts
src/gameplay/stage/stageRuntime.ts
src/gameplay/stage/spawnComposition.ts
src/gameplay/spawnDirector.ts
src/scenes/GameScene.ts
```

Finding: Stage already owns Arena/objective/encounter/difficulty/reward for normal Alpha 3. Arena-vs-Stage confusion is presentation debt, not a reason for another composition engine.

Decision: Contract is the player concept; Arena is location; Golden Run may remain explicit Training compatibility.

## Save/progression

Reviewed:

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

- Compendium has no honest V3 domain;
- legacy permanent upgrades still affect fresh runs;
- retiring only the UI would leave hidden old-save power;
- Well Protected depends on the retiring permanent system;
- active conditions/grants still contain legacy permanent-level primitives;
- physical LocalStorage key is historically `meowcenary.save.v2` despite schema V3.

Decisions:

- one Save V4 migration handles Compendium + permanent retirement/refund + fabrication serials + shadow achievement cleanup;
- refund uses frozen historical migration data, not mutable V4 balance;
- preserve earned Well Protected as historical sparse state, remove active definition, add Warden Down under a new stable ID;
- remove active permanent-level mechanics and run-preparation modifiers;
- do **not** rename the historical physical storage key during schema migration.

## Enemy death topology

Reviewed:

```text
src/entities/Enemy.ts
src/systems/WeaponSystem.ts
src/gameplay/abilities.ts
src/scenes/GameScene.ts
src/engine/eventBus.ts
```

Finding: Enemy owns health/death, but WeaponSystem separately owns run-kill increment + `enemy:killed`, while Heat Vent may bypass that settlement.

Decision: one narrow universal damage/death resolver wraps Enemy damage and owns canonical post-lethal settlement. Existing consumers remain on the single `enemy:killed` fact.

## Equipment / Gunsmith

Reviewed:

```text
src/gameplay/equipment.ts
src/gameplay/gunsmith.ts
src/systems/equipment.ts
src/systems/validation/equipment.ts
src/systems/validation/parts.ts
src/data/equipment.json
src/data/gun-parts.json
tests/equipment.test.ts
tests/gunsmith.test.ts
```

Findings:

- Set bonus/tier ownership is hidden on one arbitrary provider piece;
- validators/tests actively teach that provider convention;
- Equipment/Part definitions carry static tier despite owned instances also having tier;
- definition modifiers duplicate owner `sourceId`;
- multiplicative Part tier scaling can incorrectly multiply the whole multiplier.

V4 decisions:

- first-class Equipment Set catalog;
- **one global Equipment tier policy**, not per-Set copied gates;
- plain piece rows;
- no static Equipment/Part definition tier;
- source-free `ModifierSpec` definitions;
- runtime-derived source identity;
- shared tier scaling: `add = value × tier`, `mult = 1 + (value - 1) × tier`;
- shared FIRE/EXPLOSIVE/PIERCING gameplay traits;
- generic Set/Part availability/fabrication/acquisition coverage.

## Visual art / loading / tooling

Reviewed:

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

- logical binding and Phaser texture are currently coupled;
- one texture per binding + 256-binding ceiling is too tight for planned presentation scale;
- Boot eagerly loads almost all non-world art;
- Equipment/Part validators require borrowed `upgrade-icon` semantics;
- builder validation contains current-ID registrations;
- source-path inference from runtime URL will not survive atlasing.

V4 decisions:

- stable logical bindings separate from physical resources;
- coarse bounded renderer kinds;
- deterministic named-frame atlases for static UI families;
- explicit production provenance independent of runtime packing;
- bundle/run-closure resource loading;
- lazy heavy surfaces, simple cache, no Alpha 3 eviction framework;
- manifest/family-driven builder verification;
- non-destructive deterministic source/builder/export parity;
- synthetic 500-logical-art proof with bounded resources.

## Menu/UI

Reviewed current menu/focus/result/layout code.

Decision:

```text
Play Contract
Mercenary
Loadout -> Equipment/Gunsmith
Career -> Next Goals/Achievements/Compendium
Training (optional Golden Run)
Settings
```

One reusable scroll/focus component replaces per-screen fixed-list/pagination assumptions.

## Contract/reward content

Reviewed current stages/encounters/difficulty/rewards/arenas/bundles.

Findings:

- all ten RC1 stages over-reuse Junkyard location/art;
- Forge stages recycle too much Junkyard composition;
- current spawn composer can already create ordered pressure layers;
- full-Set reward dumps are implementation proof, not acceptable product pacing;
- RC1 `scrapPerMinute` rewards taking longer and RewardProfile `lootTableId` is dead clear-time plumbing.

V4 decisions:

- distinct Contract theses/content composition first;
- real Forge/Foundry Arena through existing Arena architecture;
- no generic encounter scripting engine by default;
- RewardProfile becomes fixed `firstClearScrap` + optional explicit grants;
- world loot remains its existing authoritative runtime system;
- persistent collection opens through availability/fabrication + limited headline rewards.

## Output authority

The intermediate `alpha-3-implementation-blueprint.md` was useful during this checkpoint but is now retired to a historical redirect. Final output is:

- `alpha-3-final-execution-handoff.md`;
- `content-authoring-templates-v4.md`;
- `alpha-3-test-transition-plan.md`;
- domain V4 specs and #170/#171.

**Status:** CLOSED at planning level; implementation proof remains #170 + feature issues.

---

# Checkpoint 3 — art/content authority reconciliation

## Internal reconciliation completed

- #167 now consumes the V4 resource/source policy and target catalog rather than RC1-only assumptions;
- V4 art delta retires Well Protected/meta-upgrade production and adds Warden Down;
- full 16-asset Forge/Foundry world packet + chapter/location presentation is specified;
- final Contract/Mercenary/Loadout/Career/Compendium/Training navigation families are owned;
- exact RC1 stable-ID baseline was corrected after the earlier independent P1 review;
- active V4 stable-ID differences are explicit rather than inferred from count;
- generated selected-source policy is reconciled with existing deterministic import tooling;
- logical-art/resource/atlas/bundle constraints are part of production authority;
- final logical-ID namespace sweep caught one V4 example using `part-icon:*` instead of the canonical `gun-part-icon:*`; the Contract matrix was corrected before closeout;
- `ui-nav:*` remains deliberately V4-art-delta-owned rather than being mechanically normalized to the older RC1 `nav-icon:*` recommendation;
- RC1 matrix is explicitly historical, not a second V4 production authority.

## Independent-review requirement

The original PR review on the early draft was genuinely useful and found the catalog-identity defects above, but it reviewed old commit `076fee8`. Those threads are resolved.

Multiple fresh `@codex review` requests were made after those fixes, including after the final internal consistency passes. The GitHub Codex bot explicitly rejected those re-review attempts because the account had **reached its Codex code-review usage limit**. This is a quota blocker, not a review result.

An explicit reviewer request for `chatgpt-codex-connector` also returned GitHub 422 because the App is not a repository collaborator.

Therefore no fresh independent PASS is claimed. When review quota becomes available, the review must evaluate the then-current exact planning head; any material finding must be fixed and re-reviewed on the resulting SHA.

**Status:** **UNVERIFIED EXTERNALLY — CODEX REVIEW QUOTA BLOCKED**. Internal reconciliation is complete; external certification is unavailable through the configured integration at present.

---

# Checkpoint 4 — implementation handoff readiness

## Conditions already satisfied internally

- #164 reproduction/fix requirements are explicit;
- #166 hidden HUD movement clamp remediation is frozen;
- final execution handoff file map and target interfaces are current;
- intermediate blueprint/template docs are redirect stubs rather than competing authorities;
- #170 owns all cross-cutting template/resource/N+1 gates;
- #171 owns product/content/engagement rather than hiding it inside UI/tooling work;
- active #85/#86/#87/#88/#89/#90/#165/#166/#167/#168/#170/#171 trackers are reconciled to V4 ownership;
- old closed #91 remains historical implementation record; active Achievement V4 changes are owned by #90/#171/final handoff;
- all known architecture decisions are frozen; remaining product unknowns are empirical tuning/playtest questions;
- RC1 runtime/tooling debt is explicitly **not** called template-clean before #170 synthetic scale proofs pass.

## External gate still missing

A fresh independent PR review must evaluate the final current planning head, not the old early-draft review. The configured Codex GitHub review path cannot currently supply that evidence because its review quota is exhausted.

Until review capacity returns or an equivalent independent reviewer is available, implementation handoff is internally ready but not independently certified.

**Status:** **UNVERIFIED EXTERNALLY — REVIEW QUOTA BLOCKED**.

---

# Final planning verdict

```text
Product/architecture reconciliation:  PASS internally
N+1 authoring contract:               PASS internally
RC1 runtime/tooling scalability:       NOT YET PASS — implementation owner #170
Fresh independent final-head review:   UNVERIFIED — Codex review quota blocked
Alpha 3 release acceptance:            NOT PASS — #164/#165/#166 + implementation/manual/fun gates remain
```

This distinction is intentional. Planning quality must not be confused with implemented proof, and missing independent/manual evidence must not be colored green.

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