# Alpha 3 V4 — Final Execution Handoff

**Status:** final planning authority for the next implementation tranche.

**Reviewed implementation baseline:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Planning branch:** `codex/alpha3-art-compendium-planning` / PR #169.

**Live RC1:** remains `f5ea5e2`; this planning document does not advance the deployed acceptance candidate.

## Precedence

This document incorporates the later whole-codebase/product reviews and therefore **supersedes conflicting implementation details** in earlier planning, especially where the older blueprint still reflects:

- per-minute first-clear Scrap;
- Set-owned tier gates on provider pieces;
- static Part/Equipment definition tiers;
- automatic achievement-completion unlock tokens;
- old Mercenary unlock clustering;
- the old Gunsmith “only applies if family exists at run start” behavior.

Domain detail remains authoritative where not superseded:

- `../gameplay/alpha-3-engagement-benchmark.md`
- `../gameplay/alpha-3-benchmark-source-matrix.md`
- `../gameplay/alpha-3-loadout-economy.md`
- `../gameplay/alpha-3-contract-content-matrix.md`
- `../gameplay/alpha-3-run-build-pacing.md`
- `../gameplay/alpha-3-player-flow-and-ui-spec.md`
- `../gameplay/alpha-3-mercenary-identity.md`
- `content-authoring-templates-v4.md`
- `monster-compendium.md`
- `../art/alpha-3-art-production-briefs.md`
- `../art/alpha-3-v4-product-art-delta.md`

The implementation agent is not being asked to redesign this plan. If code evidence contradicts it, stop that slice, document the contradiction and resolve it before proceeding.

---

# 1. Product acceptance definition

The target is not “all Alpha 3 systems exist.” The target is:

> **A small, polished one-hand survivor/roguelite that makes the player want one more Contract because the next attempt promises a different build, visible power, a clear milestone and a short path back into action.**

The external benchmark is outcome-level only. Current mobile evidence includes 50M+ Android-download titles Survivor.io and Archero; 10M+ Heroes vs Hordes and Pickle Pete; and 5M+ Vampire Survivors, Brotato, Magic Survival and 20 Minutes Till Dawn. Meowcenary copies none of their IP/UI/economy; it uses the recurring lessons of immediate controls, frequent meaningful change, visible snowball, distinct hero/build identity, changing pressure, chapter/boss punctuation and fast replay.

No ads, energy, gacha, daily pressure, paid power or forced waiting.

---

# 2. Non-negotiable engineering invariants

1. Stage/Contract is the normal campaign composition root.
2. Arena is physical location, not competing campaign progression.
3. Automatic targeting/firing remains primary.
4. Touch/keyboard/controller use one logical-action model.
5. Existing stable content IDs survive unless explicitly retired as active catalog content while preserving historical save facts.
6. Save mutations are write-first/atomic; failed persistence never publishes optimistic durable state.
7. Ordinary N+1 content uses validated data/assets + existing registered mechanics.
8. No content-ID branches in scene/controller/gameplay code.
9. Explicit pools/composition preserve deterministic ownership.
10. Run RNG streams remain isolated.
11. Gameplay facts have one authority; presentation does not manufacture truth.
12. A green CI run is necessary and insufficient for product PASS.

---

# 3. Execution sequence

Implement as independently reviewed slices:

```text
A  Restore trustworthy playtesting (#164 + #166)
B  Universal enemy damage/death fact
C  Save V4 + progression/achievement truth cleanup
D  Template-clean persistent Loadout + fabrication
E  Logical art / physical resource + loader/tooling architecture
F  Contract-first UI + scalable scrolling + touch extraction + result flow
G  Product content rebalance: Contracts / rewards / Mercenaries / achievements / offers
H  Monster Compendium
I  Full disciplined art-production pass
J  Consolidated acceptance candidate + fun gate
```

After **every** slice:

```text
focused RED→GREEN tests
npm test
npm run lint
npm run build
npm run content:validate   # once supported by that slice
npm run art:validate       # when art/resource contracts are involved
whole-codebase stale-pattern search
cross-system review against this document
```

Do not start the next slice while a material checkpoint answer remains unclear.

---

# 4. Slice A — restore trustworthy playtesting

## 4.1 #164 cyan/green pickup-adjacent freeze

Do not code against the nickname “green lollipop.” Identify the authoritative runtime object first.

Instrumentation/reproduction order:

1. record every live `Drop` at spawn with pooled instance identity, `grant.kind`, weapon definition/table where relevant and logical art binding;
2. record entry into magnet/pickup radius and overlap collection;
3. correlate scheduled `WeaponRewardSystem` issuance index/time/position;
4. capture the last event/stack before the main loop stops;
5. reproduce the specific grant/object path directly in a focused harness where possible.

The screenshot proves the cyan/green object is visually separate from the square weapon pickup; do not assume the weapon path itself is the cause.

Required regression matrix after fix:

```text
XP pickup
Scrap pickup
Chest
ordinary weapon pickup
scheduled duplicate weapon reward
full-rack blocked weapon
magnet radius entry
level-up triggered by pickup
pickup near simultaneous weapon reward
```

No speculative architecture refactor counts as a freeze fix.

## 4.2 #166 camera/player framing

Current production passes `Player.minPlayableY` from `playerHudSafeFloor(...)` and prevents movement into a screen-fixed HUD strip.

**V4 decision:** HUD presentation may not create an invisible gameplay movement wall.

Target:

- normal player world bounds are the actual Arena/obstacle bounds;
- remove production `minPlayableY` clamping and `movingIntoHud` movement suppression;
- HUD remains fixed/legible through layout, backing, spacing and camera presentation;
- player may pass beneath an overlaid HUD exactly as in ordinary top-down mobile games;
- if a future physical world exclusion is required, it must be authored as actual world collision, not presentation-driven hidden physics.

Test:

- player can traverse to the real top Arena bound;
- camera follow/bounds remain correct;
- HUD remains readable;
- no top/bottom “sticky” movement at all target orientations.

## Slice-A exit

A short Chrome/macOS run can proceed through weapon rewards without freezing and the player can traverse the full intended Arena.

---

# 5. Slice B — one universal enemy death fact

Keep `Enemy` as health/shield/death-state owner. Move **post-lethal settlement** out of WeaponSystem-specific code.

## Target boundary

Add one narrow resolver/service, e.g.:

```ts
interface EnemyDamageResolver {
  apply(
    enemy: Enemy,
    amount: number,
    sourcePosition?: Readonly<{ x: number; y: number }>,
  ): { readonly applied: boolean; readonly killed: boolean };
}
```

It snapshots kill payload facts while the Enemy is live, calls `Enemy.takeDamage()` once, then on the one alive→dead transition:

```text
runState.kills += 1
enemy:killed emitted exactly once
```

`Enemy.takeDamage()` keeps:

```text
shield block
health capping
enemy:damaged
split-on-death request
presentation destruction
```

Migrate every lethal source:

```text
direct projectile
explosive splash
burn tick
Heat Vent / elemental-burst
future source using the shared resolver
boss damage
```

`abilities.ts` remains Phaser-free by receiving a `damageEnemy(target, amount)` runtime seam rather than directly owning kill settlement.

Required exact-once tests include overkill/repeated damage after death and shield block.

This is the source used by Stage kill objectives, achievement metrics, DropSystem, defeat presentation and Compendium defeat discovery.

---

# 6. Slice C — Save V4 and one-authority progression facts

Do **one** migration for all new durable V4 state:

- retirement of permanent-stat shop;
- Compendium discovery;
- Part fabrication serials;
- cleanup of legacy shadow achievement truth.

Keep the existing physical LocalStorage key **`meowcenary.save.v2`**. It is historical storage identity; changing it would make migration unable to see existing saves.

## 6.1 Target shapes

```ts
interface ProgressionState {
  readonly scrap: number;
  /** Explicit content entitlements only; not a shadow stage/boss/achievement fact DB. */
  readonly unlocks: readonly string[];
}

interface GunsmithState {
  readonly builds: readonly Build[];
  readonly parts: Readonly<Record<string, PartInstance>>;
  readonly fabricationSerials: Readonly<Record<string, number>>;
  readonly selectedBuildId?: string;
}

type CompendiumDiscoveryStatus = 'encountered' | 'defeated';

interface CompendiumState {
  readonly enemies: Readonly<Record<string, CompendiumDiscoveryStatus>>;
}

interface SaveDataV4 {
  readonly version: 4;
  readonly settings: Settings;
  readonly progression: ProgressionState;
  readonly stages: StageProgressState;
  readonly achievements: AchievementProgressState;
  readonly achievementMetrics: AchievementMetricState;
  readonly characters: CharacterMasteryState;
  readonly selectedCharacterId?: string;
  readonly gunsmith: GunsmithState;
  readonly equipment: EquipmentState;
  readonly equipmentLoadout: EquipmentLoadoutState;
  readonly items: ItemInventoryState;
  readonly bosses: BossProgressState;
  readonly compendium: CompendiumState;
  readonly pendingAchievementReports: readonly string[];
  readonly appliedGrantTransactions: AppliedGrantTransactions;
  readonly grantTransactionFingerprints: GrantTransactionFingerprints;
}
```

Keep explicit V1/V2/V3 historical types and migrations. Do not mutate the meaning of a historical schema interface.

## 6.2 V3 permanent-upgrade refund

Use the already frozen historical cumulative refund table. Do not calculate from mutable V4 content.

```text
reinforced-vest:        0,10,26,52,93,159
quick-paws-training:    0,15,39,77,138,236
sharpened-ammo:         0,20,54,112,210,377
magnetic-whiskers:      0,10,25,48,82,133
```

Clamp legacy level 0–5 and safe-integer Scrap.

Then remove `permanentUpgrades`; no hidden permanent modifiers survive in run preparation.

## 6.3 Historical achievement-token promotion

Current V3 can contain an achievement twice:

```text
save.achievements[id]
progression.unlocks includes achievement:<id>
```

That is compatibility history, not V4 architecture.

Freeze a migration-only list/map of **known V3 achievement IDs**. For each known `achievement:*` token in V3 unlocks:

- if no achievement completion exists, create `{ completed: true }` (no invented timestamp);
- preserve richer existing achievement progress;
- after promotion, remove `achievement:*` tokens from the V4 entitlement bag.

Do not derive this migration from the mutable future active V4 catalog alone; retired historical IDs such as Well Protected must remain interpretable.

## 6.4 Boss historical repair

Preserve current `bosses` facts.

For known historical boss-achievement evidence where old compatibility could have had the completion/token but lost the boss-domain fact, permit a **migration-only** repair mapping such as:

```text
achievement:boss-crusher -> boss-crusher defeated
```

Do not keep achievement→boss inference in the active V4 evaluator.

## 6.5 Well Protected

If V3 Reinforced Vest level ≥3, or the old achievement is already completed, preserve:

```text
achievement:permanent-reinforced-coat-3 completed
```

It is historical sparse save state only. Remove it from the active V4 catalog.

## 6.6 Achievement completion becomes one fact

Current evaluator automatically adds an `achievement-completed` ProgressionGrant, duplicating the completed record into `progression.unlocks`.

V4 removes that active grant type.

Evolve result shape conceptually to:

```ts
interface AchievementCompletion {
  readonly achievementId: string;
  readonly progress: AchievementProgress;
  readonly grants: readonly ProgressionGrant[]; // explicit definition rewards only
}

interface AchievementEvaluationResult {
  readonly state: AchievementProgressState;
  readonly updates: readonly AchievementUpdate[];
  readonly completions: readonly AchievementCompletion[];
}
```

A completion with no explicit reward needs no grant receipt: the achievement state itself is the durable exactly-once fact.

For reward-bearing completions, GameContext applies **one source-owned reward receipt per achievement**:

```text
<achievementId>:completion
```

with only that achievement’s explicit reward grants.

When several achievements complete in one evaluation:

1. build all candidate completion states/reward transactions deterministically;
2. apply every reward transaction to one candidate Save V4 snapshot;
3. persist once;
4. publish once.

No first-completed achievement owns the reward payload of sibling completions.

If persistence fails, current save remains unchanged; reevaluation deterministically reproduces the same completion group.

## 6.7 Active condition truth

After migration:

```text
stage-cleared          -> save.stages only
boss-defeated          -> save.bosses only
achievement-completed  -> save.achievements only
mastery-reached        -> save.characters only
owns-content           -> explicit progression.unlocks entitlement only
```

Remove legacy achievement/boss fallback reads from `progression.unlocks`.

The starter stage uses `always` in Slice G rather than `unlock-count: 0`.

## 6.8 Run Scrap / First Victory

`ProgressionSystem` remains the run-Scrap banking boundary but stops inventing `achievement:first-victory` in the entitlement bag.

Run result banking becomes essentially:

```text
run.currency -> progression.scrap
```

for both wins and losses as today.

First Victory is completed only through the game-owned Achievement system on the existing win metric/fact.

## 6.9 Scrap Tycoon correctness

Current run-Scrap achievement metric is updated only on wins even though ProgressionSystem banks run Scrap on losses too.

V4:

- after terminal run-Scrap banking, increment `metric:scrap-banked` on both win and loss by the actual banked run Scrap;
- keep the First Victory/win metric only on wins;
- change Scrap Tycoon copy if needed to state precisely that it tracks Scrap brought home from Contract combat/collection, not first-clear/achievement bonus Scrap.

Do not create a second “total lifetime currency from every source” subsystem merely for one hidden achievement.

## 6.10 Compendium migration

Initialize sparse `{ enemies: {} }`, then backfill authoritative defeated bosses to `defeated`.

No ordinary encounter/kill history is fabricated from total kills or stage membership.

## 6.11 Fabrication serial migration

Initialize `gunsmith.fabricationSerials = {}`.

Pre-V4 could not create the new fabricated owned-ID series, so no serial inference is required.

## Slice-C stale-pattern search

No active V4 path may remain for:

```text
permanentUpgrades
DataMetaUpgradeRegistry
ProgressionController purchase path
FIRST_VICTORY_UNLOCK_ID
permanent-level condition
permanent-upgrade-level grant
automatic achievement-completed grant
achievement/boss condition fallback to progression.unlocks
```

Migration-only historical constants are allowed and clearly named as such.

---

# 7. Slice D — template-clean persistent Loadout

Use `content-authoring-templates-v4.md` as the schema authority.

## 7.1 First-class Equipment Sets

Add `equipment-sets.json` and a single global equipment-upgrade policy.

Set owns:

```text
id
name
description
unlock
pieceFabricationCost
emblem
2/4 threshold definitions
```

Piece owns:

```text
id
name
setId
slot
icon
ModifierSpec[]
```

Remove provider-piece scans completely.

## 7.2 Definition modifier cleanup

Introduce shared source-free `ModifierSpec` and one tier scaler:

```text
add  => value × tier
mult => 1 + (value - 1) × tier
```

Use it for Equipment and Parts. Ability stat-burst uses source-free specs but no owned-tier scaling.

This fixes the current Gunsmith bug where e.g. `1.12 ×` at owned tier 2 becomes `2.24 ×`; target is `1.24 ×`.

Remove static `tier` from EquipmentDefinition and PartDefinition.

## 7.3 Shared weapon traits

Move FIRE/EXPLOSIVE/PIERCING behavior ownership out of a Gunsmith-specific file into a shared pure gameplay module.

Equipment Set thresholds and Gunsmith Parts may both contribute these traits.

Deduplicate each trait once per family.

## 7.4 Persistent run-loadout resolver

Move current persistent Equipment/Gunsmith composition out of ad hoc `GameScene` logic into one pure owner, conceptually:

```ts
interface PersistentRunLoadoutContribution {
  readonly modifiers: readonly Modifier[];
  readonly projectileEffectsByFamily: ReadonlyMap<string, readonly ProjectileEffect[]>;
}

resolvePersistentRunLoadout(...): PersistentRunLoadoutContribution
```

Inputs are validated registries + Save V4 loadout + weapon-family catalog.

Rules:

### Equipment

- ordinary piece/set stat modifiers apply from equipped owned instances;
- active Equipment weapon traits apply to **every weapon family in the data catalog**, including a family acquired later in the run.

### Gunsmith

- selected build’s fitted-part modifiers are installed with its family scope **even if that family is absent from the starting rack**;
- if the family is acquired later, the scoped engineering automatically becomes active;
- selected Gunsmith trait effects are family-specific;
- if Equipment already supplies the same trait globally, do not duplicate it for that family.

### Product decision

The selected Gunsmith build does **not** inject a second weapon into the run. The Mercenary’s starting weapon remains character identity.

UI communicates:

```text
Engineered SMG — active from start
```

or

```text
Engineered SMG — activates when an SMG is acquired
```

This turns character/Gunsmith matching into a deliberate build choice rather than hidden no-op behavior.

## 7.5 One availability resolver

Add one pure shared availability owner used by:

- Equipment;
- Gunsmith;
- Home/Loadout/Career;
- post-run newly available reveal.

Conceptual snapshot:

```ts
interface PersistentAvailabilitySnapshot {
  readonly selectableCharacterIds: readonly string[];
  readonly fabricableEquipmentSetIds: readonly string[];
  readonly fabricablePartIds: readonly string[];
  readonly maxEquipmentTier: 1 | 2 | 3 | 4;
}
```

It evaluates existing `ProgressionCondition` facts. UI does not reimplement conditions independently.

Provide a pure diff:

```text
before -> after = newly available characters / Sets / Parts / tier capability
```

For Contract preview, a pure helper may project the selected stage/boss completion fact to derive direct blueprint/capability headlines without persisting anything.

## 7.6 Equipment fabrication

One owned copy per definition.

Authoritative UI command supplies only `equipmentId`.

Context recomputes:

```text
definition exists
Set unlock true
not already owned
enough Scrap
cost
owned ID
```

Deterministic owned ID:

```text
owned:equipment-commando-helmet
```

Candidate save spends Scrap + creates T1 instance, persists once, publishes once.

## 7.7 Part fabrication

Part definition optional positive `fabricationCost`.

Authoritative UI command supplies only `partId`.

Next owned ID comes from persisted per-definition serial:

```text
owned:part-barrel-standard:3
```

Candidate save atomically:

```text
spends Scrap
creates tier-1 Part
increments fabricationSerials[partId]
```

Failed storage leaves all three facts unchanged.

Consuming/merging/infusing Parts never decrements the serial.

## 7.8 Mastered Fire

Current RC1 incorrectly unlocks Mastered Fire Trait Core from First Victory and gives it no mechanical distinction.

V4 target:

- reward-only / Forge-Warden-gated visibility;
- no fabrication cost;
- no First Victory condition;
- same registered FIRE behavior;
- modest definition-owned modifier so “Mastered” has a real difference;
- do not create another FIRE mechanic ID.

## Slice-D stale-pattern search

Reject active occurrences of:

```text
setBonuses on equipment pieces
upgradeUnlocks on equipment pieces
static equipment definition tier
static part definition tier
static equipment/part/ability sourceId duplication
provider-piece find/scan
value * tier for multiplicative Part modifiers
Gunsmith family effects gated on family being present at run start
```

---

# 8. Slice E — logical art / physical resources / loading

Implement the already-reviewed resource architecture before bulk #167 art.

## 8.1 Separate concepts

```text
VisualTextureResource = physical Phaser texture/atlas load
VisualArtBinding      = stable semantic logical art
```

Large static UI families use deterministic named-frame atlases; actors/world assets may remain dedicated resources.

Existing logical IDs survive.

## 8.2 Renderer vocabulary

Renderer kinds describe rendering capability, not content owner:

```text
animated-actor
sprite
icon
portrait
weapon-held
world
ui-chrome
```

Equipment/Part/Achievement/Ability/Passive do not each add a renderer switch case.

## 8.3 Bundle/loading

Boot only boot/home-critical resources.

Lazy menu bundles for heavy surfaces.

Run resource closure derives from:

```text
selected Mercenary
encounter enemies + boss + recursive summon/split children
run-core UI/pickups/projectiles
explicit weapon/run pools
selected world bundle
```

Loaded content is never automatically gameplay-eligible.

## 8.4 Tooling

- manifest/resource-driven builder validation;
- deterministic atlas pack;
- source/builder/export parity gate;
- duplicate/orphan checks;
- synthetic 500 logical-icon proof with bounded physical resources;
- no current-ID table edits for Character 9 / Enemy 11 / Icon N+1.

## Slice-E stale-pattern search

Reject:

```text
MAX_VISUAL_ART_BINDINGS = 256 as semantic/physical shared ceiling
one unique texture key required per logical static icon
Equipment/Part validator requires upgrade-icon
Boot preloads every non-world binding
per-ID builder contract list for ordinary existing renderer families
```

---

# 9. Slice F — player flow, scalable UI and mobile extraction

Use `alpha-3-player-flow-and-ui-spec.md` exactly.

## 9.1 Top-level IA

```text
Play Contract
Mercenary
Loadout -> Equipment / Gunsmith
Career -> Next Goals / Achievements / Compendium
Training (optional legacy Golden Run)
Settings
```

No player-facing peer `Arena` or vague `Progression` button.

## 9.2 Shared scrolling

One scroll/focus region handles growing lists. Preserve existing `FocusNavigator` and logical input.

Required pointer/touch rules:

- wheel/trackpad;
- touch drag threshold;
- drag release cannot click a row;
- focus movement ensures target is fully visible;
- resize retains semantic focus;
- fixed Back/primary navigation remains reachable.

## 9.3 Touch extraction — P1

Current StageRuntime reaches `objective-complete` and requires `confirm`, but touch ControlsView currently exposes only movement, Ability and Pause.

Add a context-sensitive **Extract** control when `stageRuntime.pendingClear` exists.

Rules:

- it invokes the same logical `confirm` command path as keyboard/controller;
- it is not a separate touch-only completion rule;
- minimum 44px physical target;
- positioned through current viewport/safe-area helpers;
- hidden outside the extraction state;
- setting visibility occurs before GameScene’s pending-clear early return;
- double tap / mixed-input cannot commit twice; existing transaction idempotency remains the durable backstop.

Keyboard/controller retain ordinary Confirm.

Test portrait touch end-to-end through Contract completion.

## 9.4 Exact result presentation

Current RunSummary uses the entire historical `progression.unlocks` array as `unlockedIds`. Retire that presentation.

### Structured stage commit result

Evolve the stage persistence call from boolean-only to a small result:

```ts
type StageCommitResult =
  | { readonly ok: false }
  | {
      readonly ok: true;
      readonly firstClear: boolean;
      readonly bestTimeImproved: boolean;
    };
```

Replay of an already-receipted stage reports `firstClear: false`, so UI never claims the pending first-clear grant was awarded again.

### Run-start availability baseline

At run creation capture one `PersistentAvailabilitySnapshot`.

At terminal presentation, after pending persistence resolves, compare to final durable availability.

This automatically catches characters/Sets/Parts/tier capability unlocked by stage, boss or achievement facts during the run.

### Summary data

Show:

```text
run result
run Scrap banked
first-clear fixed Scrap only if actually first clear
actual source-owned persistent grants only if actually granted
achievements completed this run
new availability diff
```

No historical entitlement dump.

## 9.5 Fast actions

Win default action: **Next Contract**.

When selected and available:

- advance stage selection;
- start the next gameplay loading/run path directly;
- do not require Home → Contract → Start again.

Loss default: Retry.

`Adjust Loadout` opens Menu directly at Loadout via transient scene-init destination, not a persistent save field.

## 9.6 Fixed typography

One title hierarchy across upgrade cards and menus. Long names wrap; they do not shrink independently.

## Slice-F stale-pattern search

Reject final player-facing remnants of:

```text
Home buttons Arena / Progression / Stage as competing peers
Character list with no scroll
Achievements “two per page” pagination workaround
per-screen bespoke growing-list pagination where shared scroll applies
variable upgrade-name font sizing
raw stable IDs in normal player copy
```

---

# 10. Slice G — game-content/product pass

This is where architecture turns into the fun target.

## 10.1 RewardProfile V4 simplification

The whole-codebase review found two stale/misleading fields/behaviors:

- `lootTableId` is resolved in RewardProfile but never consumed at stage clear;
- `scrapPerMinute` rewards slower first-clear objective completion and duplicates time-sensitive transaction formula logic.

V4 RewardProfile becomes:

```ts
interface RewardProfile {
  readonly id: string;
  readonly firstClearScrap: number;
  readonly grants?: readonly ProgressionGrant[];
}
```

First-clear reward is fixed.

Why:

- no incentive to delay a kill/collect objective merely to cross a minute boundary;
- best time and reward point in the same direction;
- Contract card can state an exact reward;
- context and StageRuntime no longer duplicate the per-minute formula;
- repeat-run economy remains ordinary run Scrap/loot.

Use the existing matrix’s **base values** as the initial fixed candidate:

```text
J1       35
J2       45
J3       60
J4       75
Crusher 130
F1       90
F2      105
F3      120
F4      140
Warden  180
```

Tune from playtest, not aesthetic numeric progression.

## 10.2 First-clear persistent grants

Initial target:

```text
J1       Standard Barrel T1
J2       Red-Dot Optic T1
J3       Heavy Receiver T1
J4       Hair Trigger T1
Crusher  Fire Trait Core T1
F1       none
F2       none
F3       none
F4       Grenade Launcher T1
Warden   Mastered Fire Trait Core
```

No full Equipment Set grant.

Availability/fabrication creates the rest of the collection decisions.

## 10.3 Contracts

Apply the reviewed ten-Contract matrix and Forge Foundry Arena.

Keep current objective primitives; use ordered encounter composition to create ~20–30s pressure changes where appropriate.

Stable `stage:junkyard-06` remains the Forge Warden ID.

Junkyard/Forge must play and look distinct.

## 10.4 Mercenary content

Apply the frozen unlock cadence:

```text
Scrap Tabby    always
Bolt Hound     First Victory
Volt Lynx      25 kills
Piston Ram     Scrap Tabby mastery tier 2
Rattle Raptor  clear Junkyard 4
Brass Boar     Scrap Crusher
Scrap Weasel   100 kills
Ember Cougar   clear Forge 1
```

Rattle Raptor starts Scrap Pistol T1 instead of Can SMG T1.

No new character engine primitive.

## 10.5 Active V4 achievements

Retire Well Protected from active catalog; preserve history in migration.

Add:

```text
achievement:boss-forge — Warden Down
condition: boss-defeated boss-forge
```

Clean redundant current rewards:

- Junkyard Veteran does not need `unlock-character` for Scrap Weasel; the Character condition consumes the achievement fact directly;
- Crusher Down does not unlock/grant Commando Helmet after Commando is an early fabricable Set;
- Warden Down does not duplicate the Mastered Fire Core already owned by Warden first-clear.

Achievement currency rewards may remain where useful.

Make Scrap Tycoon copy precise about the run-Scrap metric it actually tracks.

## 10.6 Upgrade offers

Implement the reviewed four-slot pure policy using the existing upgrade RNG stream:

```text
A  eligible equipped-family identity card where possible
B  support alternative (defense/mobility/utility/economy) where possible
C  weighted wildcard
D  weighted wildcard
```

Fallback cleanly when a partition is empty. No card-ID logic, reroll currency or pity state.

## 10.7 PlaytestSummary

Extend existing local dev-only summary; do not build analytics infrastructure.

Add:

```text
stageId
offer timestamps / choices / chosen timestamps
first seen enemy/archetype timestamps
boss phase timestamps
objective completion time
first weapon acquired
first merge
longest meaningful build-decision gap
```

Keep local/no network/no PII.

## Slice-G stale-pattern search

Reject:

```text
scrapPerMinute
RewardProfile lootTableId
full Equipment Set stage grants
Mastered Fire unlock from First Victory
Well Protected active definition
kill100 redundant unlock-character reward
Crusher duplicate Commando instance reward
old clustered Mercenary conditions
all Forge stages using junkyard-lot / bundle:core-junkyard
```

---

# 11. Slice H — Monster Compendium

Implement after B/C/E/F.

Frozen facts:

```text
enemy:spawned -> encountered
enemy:killed  -> defeated
defeated implies encountered
```

Tracker persists sparse monotonic state.

If storage fails, retain only the highest pending status per enemy and retry through the system lifecycle/terminal persistence path; repeated events remain idempotent.

Read model derives:

```text
name
actor art
mechanic/threat summary
Found In from encounters→stages
boss phases/actions
```

Editorial file owns only field note / Behaviour / Tells / Counterplay presentation copy.

No second enemy database and no kill-count lore grind.

Use shared Career scroll surface and resource bundle.

---

# 12. Slice I — disciplined whole-game art production

Only begin bulk production after E/F/G schema/presentation targets are stable.

Use the existing discipline:

```text
brief
→ multiple concepts where needed
→ silhouette/collision review
→ selection
→ Pixelorama native source
→ deterministic builder/import
→ runtime export/atlas
→ automated validation
→ grayscale/actual-size review
→ live viewport review
```

Apply V4 delta:

- Warden Down, not Well Protected;
- full Forge world packet;
- Contract/Mercenary/Loadout/Career/Compendium/Training navigation;
- dedicated Equipment/Part/Ability/Passive/Achievement art;
- generic icon renderer;
- logical ID → resource/atlas mapping;
- no clone/placeholder leakage.

The Compendium reuses final enemy actor art by default.

---

# 13. Slice J — consolidated acceptance candidate

Only cut a new candidate after all slices needed for a coherent playtest are integrated and whole-repo review is clean.

## Automated exact-SHA

```text
CI
content validation
art validation
migration suite
N+1 synthetic suite
500-logical-art scale test
builder parity
shuffled test repeat ≥2
build
```

## Runtime/device

```text
Chrome/macOS full journey
real portrait iOS touch
controller-only
mixed input + disconnect/reconnect
390×844
360×640
844×390
1280×720
1920×1080
lifecycle/soak/performance
fresh V4 save
V3 migration save
legacy Golden Run/Training regression
```

## Product/fun

Per Contract:

- one distinct design thesis;
- no unexplained >35s low-information stretch;
- multiple perceptible power moments;
- build describable by midpoint;
- objective changes movement/priority;
- boss feels like climax;
- result/reward creates clear next choice;
- Retry/Next path fast.

Overall:

- no top-level concept has an unclear job;
- Mercenaries feel different with names/art hidden;
- Equipment Sets have different theses;
- Gunsmith traits visibly matter;
- no persistent reward dump;
- no P0/P1;
- meaningful P2 fixed before PASS;
- independent human verdict says **fun/replayable now**.

If automated correctness is green but playtest says boring, verdict remains **NOT READY**.

---

# 14. Exact implementation ownership map

Expected primary files; nearby test/helper changes are allowed when ownership remains coherent.

## A

```text
src/entities/Drop.ts
src/systems/DropSystem.ts
src/systems/WeaponRewardSystem.ts
src/entities/Player.ts
src/scenes/GameScene.ts
src/ui/hud* / layout helpers as required
focused pickup/player/camera tests
```

## B

```text
src/entities/Enemy.ts
new src/systems/EnemyDamageResolver.ts (name may vary)
src/systems/WeaponSystem.ts
src/gameplay/abilities.ts
src/scenes/GameScene.ts
tests/enemyDamage*.test.ts
```

## C

```text
src/systems/save.ts
src/gameplay/achievementSystem.ts
src/gameplay/conditionEvaluator.ts
src/gameplay/conditionValidation.ts
src/gameplay/grantProcessor.ts
src/gameplay/meta.ts / replacement narrow progression helper
src/gameplay/runStart.ts
src/systems/ProgressionSystem.ts
src/engine/context.ts
src/scenes/BootScene.ts
src/scenes/GameScene.ts
src/data/meta-upgrades.json retired from active GameData
migration + progression/achievement integration tests
```

## D

```text
src/data/equipment-sets.json
src/data/equipment-rules.json (or equivalent single owner)
src/data/equipment.json
src/data/gun-parts.json
src/gameplay/stats.ts
src/gameplay/equipment.ts
src/gameplay/gunsmith.ts
new src/gameplay/weaponBehaviorTraits.ts
new src/gameplay/persistentAvailability.ts
new/pure persistent run-loadout resolver
src/systems/types.ts
src/systems/equipment.ts
src/systems/parts.ts
src/systems/validation*.ts
src/engine/context.ts
src/ui/equipmentController.ts
src/ui/gunsmithController.ts
src/scenes/GameScene.ts
```

## E

```text
src/data/visual-art.json
src/data/asset-bundles.json
src/systems/types.ts
src/systems/visualArt.ts
src/systems/assetBundles.ts
src/systems/validation.ts + domain validators
src/scenes/BootScene.ts
src/scenes/MenuScene.ts
src/scenes/GameScene.ts
art validation/build/parity/atlas tooling
```

## F

```text
src/ui/menus.ts
src/scenes/MenuScene.ts
new shared scroll/focus region
src/ui/stageSelectionController.ts
src/ui/characterSelectionController.ts
src/ui/equipmentController.ts
src/ui/gunsmithController.ts
src/ui/achievementsController.ts
new Compendium routing shell as needed
src/ui/runSummary.ts
src/ui/controls.ts
src/scenes/GameScene.ts
```

## G

```text
src/data/stages.json
src/data/encounter-profiles.json
src/data/difficulty-profiles.json
src/data/reward-profiles.json
src/data/arenas.json
src/data/asset-bundles.json
src/data/characters.json
src/data/achievements.json
src/data/gun-parts.json
src/gameplay/stage/*
src/gameplay/upgrades.ts
src/systems/UpgradeSystem.ts
src/systems/playtestSummary.ts
conformance/tuning tests
```

## H

```text
Compendium editorial data
Compendium registry/read model/tracker
Save V4 context methods
Career/Menu view integration
Compendium tests
```

## I

```text
assets-src/**
public/assets/**
visual-art/resources/bundles
art builders/tooling outputs
art review records
```

---

# 15. Mandatory synthetic proofs

Before claiming scalable completion:

```text
Character 20
Equipment Set 12 + 48 pieces
Part 50
Enemy 50 + Compendium 50
Contract 25
Achievement 40
500 logical static art IDs with bounded resource count
new builder asset using existing renderer family
```

These tests may use synthetic data and placeholder test resources. They do not imply shipping that much Alpha 3 content.

---

# 16. Whole-codebase checkpoint review

After each slice, answer with evidence:

1. Did this create a second source of truth?
2. Did a legacy compatibility path accidentally remain active as normal V4 behavior?
3. Did scene code gain gameplay rules instead of delegating to a pure/system owner?
4. Did an N+1 content path acquire another core-code edit?
5. Did persistence become optimistic or partial?
6. Did deterministic RNG/pool ownership change unintentionally?
7. Did touch/controller/keyboard semantics diverge?
8. Did an error path become silent/dishonest?
9. Did a new abstraction solve a concrete current problem?
10. Can the player explain the feature in ordinary language?
11. Does it make the game more fun/readable, or merely more architecturally elegant?
12. Does it remain viable on 360×640 / 390×844?
13. Did a reward/economy change create a dominant boring farm?
14. Does the repository template now tell the next agent how to add N+1 without this chat?

Any material “unclear” is a failed checkpoint.

---

# 17. Handoff instruction to implementation agent

The implementation agent receives the repository and this planning branch, then proceeds slice-by-slice.

It should be told:

> Implement the frozen Alpha 3 V4 plan. Do not redesign it opportunistically. Begin with the specified RED evidence for the active slice. After focused GREEN, run whole-repository validation and explicitly review the integrated codebase against the checkpoint questions and stale-pattern list before starting the next slice. Preserve stable IDs, deterministic pools, atomic persistence and the data/assets N+1 rule. If implementation evidence contradicts a frozen contract, stop and document the contradiction rather than silently inventing a third design. Product PASS requires real play to be fun and replayable, not only green tests.

That is the intended handoff boundary: product/architecture decisions are made; implementation remains evidence-driven.