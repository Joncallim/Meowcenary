# Alpha 3 Consolidated Implementation Blueprint

**Status:** frozen planning target for the next Alpha 3 implementation tranche. Planning only; this document does not change the deployed candidate.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Product gate:** [`../gameplay/alpha-3-engagement-benchmark.md`](../gameplay/alpha-3-engagement-benchmark.md).

**Related owners:** #164 runtime freeze, #165 UI/product presentation, #166 framing, #167 art production, #168 Compendium, #170 template/resource scalability.

This blueprint removes architectural ambiguity before Codex implementation. The governing rule is:

> **Change the smallest authoritative boundary that solves the real product problem. Preserve stable IDs, deterministic composition, sparse persistence and registered mechanic primitives. Do not solve “fun” by adding a generic game engine or solve scalability by adding indirection with no current use.**

---

# 1. Frozen invariants

The implementation may not weaken these constraints.

1. Automatic targeting/firing remains primary. No required twin-stick/manual aiming.
2. Touch, keyboard and controller converge on the same logical actions.
3. Stage/Contract remains the normal Alpha 3 run-composition root.
4. Arena remains the physical location, not a competing campaign progression concept.
5. Existing stable gameplay/content IDs are preserved unless this document explicitly retires content with a migration.
6. Existing run RNG streams and untouched deterministic pools remain stable unless a content rebalance intentionally edits them.
7. Persistent mutations remain behind one versioned save boundary.
8. Ordinary N+1 content remains data/assets work for existing mechanics.
9. No content-ID branch is added to `GameScene`, UI controllers or gameplay systems.
10. No ads, energy, paid power, forced waiting, streak pressure or loot-box mechanics.
11. A technically green build can still fail product acceptance.
12. The live acceptance candidate stays untouched until a new consolidated candidate is deliberately cut.

---

# 2. Implementation slices and checkpoint order

Do not land this as one mega-refactor. Each checkpoint must be independently reviewable and leave the branch green.

```text
A. P1 runtime recovery (#164/#166)
   ↓
B. authoritative enemy damage/death boundary
   ↓
C. Save V4 + Compendium domain + legacy Progression retirement
   ↓
D. first-class Equipment Set + modifier-spec cleanup
   ↓
E. logical-art / physical-resource split + scalable loader/tooling
   ↓
F. menu information architecture + scrollable presentation surfaces
   ↓
G. reward/stage-content pacing rebalance
   ↓
H. Monster Compendium implementation
   ↓
I. disciplined whole-game art production
   ↓
J. consolidated automated + manual + fun acceptance candidate
```

Why this order:

- A restores a usable test environment.
- B creates the universal fact #168 needs and prevents future damage-source drift.
- C makes only one save-version transition instead of introducing Compendium V4 and then another Progression-removal migration.
- D removes content-authoring debt before new dedicated equipment assets/rewards are authored.
- E prevents #167 from exhausting the current art/load architecture.
- F gives the art pass stable presentation targets.
- G changes content/reward data against the final progression/menu semantics.
- H then builds the Compendium on stable death, persistence, art and navigation contracts.
- I fills the frozen art slots instead of designing UI around arbitrary finished pictures.

Every slice follows:

```text
RED focused test/evidence
→ implementation
→ focused tests
→ whole-repo tests/lint/build where applicable
→ cross-codebase checkpoint review
→ only then next slice
```

---

# 3. Slice A — acceptance runtime recovery

#164 and #166 remain their own bug owners. Do not bury their fixes inside architecture migrations.

## Required outcome

- cyan/green “lollipop” freeze is identified by authoritative runtime object ID/type, not screenshot nickname;
- freeze is reproducible in an automated/focused harness where feasible;
- fix preserves ordinary weapon pickup, XP/scrap/chest/drop and upgrade behavior;
- camera/player framing no longer makes the character feel pinned near the top unless a deliberate HUD-safe boundary actually requires it;
- exact candidate after fixes gets normal CI and a short Chrome/macOS smoke before larger work begins.

No art/resource redesign is accepted as a substitute for fixing the freeze.

---

# 4. Slice B — universal enemy damage/death boundary

This is a prerequisite for Compendium defeat discovery and also removes a real current gameplay-fact inconsistency.

## 4.1 Current topology

`Enemy.takeDamage()` already owns:

- shield rejection;
- health reduction capped to remaining health;
- `enemy:damaged` emission;
- alive → dead transition;
- split-on-death summon request;
- presentation destruction.

`WeaponSystem.applyProjectileDamage()` separately owns:

- `runState.kills += 1`;
- canonical `enemy:killed` emission.

`elemental-burst` bypasses the latter by calling `Enemy.takeDamage()` directly.

Do **not** move health ownership out of `Enemy`; only centralize post-damage kill settlement.

## 4.2 Target API

Add a narrow Phaser-aware/system-layer service, e.g.:

```ts
export interface EnemyDamageResult {
  readonly applied: boolean;
  readonly killed: boolean;
}

export interface EnemyDamageResolver {
  apply(
    enemy: Enemy,
    amount: number,
    sourcePosition?: Readonly<{ x: number; y: number }>,
  ): EnemyDamageResult;
}
```

Implementation responsibilities:

1. fail soft on inactive/dead/invalid damage via `Enemy.takeDamage` semantics;
2. snapshot death payload facts **before** the call if destruction makes later reads unsafe:
   - instanceId;
   - enemyId;
   - xpValue;
   - scrapValue;
   - optional lootTableId;
   - x/y;
3. call `enemy.takeDamage(amount, sourcePosition)` exactly once;
4. if it returns lethal:
   - increment `runState.kills` exactly once;
   - emit the existing canonical `enemy:killed` payload exactly once;
5. return `killed` to source-specific presentation code.

Do not move `projectile:hit` into this service. Projectile metadata belongs to WeaponSystem. Do not move split-on-death out of Enemy; it is part of the enemy’s own death behavior.

## 4.3 Call-site migration

- direct projectile → resolver;
- explosive splash → resolver;
- burn tick → resolver;
- Heat Vent / `elemental-burst` → injected resolver callback;
- any future lethal hazard/status against enemies → resolver.

Keep `abilities.ts` Phaser/EventBus-free by changing its runtime seam conceptually to:

```ts
readonly enemies: Iterable<AbilityTarget>;
damageEnemy(enemy: AbilityTarget, amount: number): void;
```

`applyAreaEffect()` calls `runtime.damageEnemy(...)`; `GameScene` supplies the adapter backed by the shared resolver.

## 4.4 Required tests

Exactly one `enemy:killed` and one kill increment for:

- direct projectile lethal hit;
- explosive splash lethal hit;
- burn lethal tick;
- Heat Vent lethal hit;
- boss lethal hit;
- overkill;
- repeated damage after death;
- a synthetic future source invoking the resolver.

Shield-blocked damage must not increment kills or emit `enemy:killed`.

Stage objective, achievement metrics, defeat presentation and later Compendium tests must continue consuming **the existing `enemy:killed` event**, proving consumers do not need source-specific changes.

---

# 5. Slice C — one Save V4 migration

Do one save-version change for both Compendium discovery and retirement of the confusing legacy permanent-upgrade shop.

## 5.1 Why V4

Save V3 has no honest Compendium domain. It also carries `progression.permanentUpgrades`, which powers the top-level “Progression” shop the acceptance test found semantically redundant.

Two separate migrations would add risk without product value.

## 5.2 Target V4 shape

Retain all current durable domains except the legacy permanent-upgrade map and add Compendium:

```ts
export interface ProgressionState {
  readonly scrap: number;
  readonly unlocks: readonly string[];
}

export type CompendiumDiscoveryStatus = 'encountered' | 'defeated';

export interface CompendiumState {
  readonly enemies: Readonly<Record<string, CompendiumDiscoveryStatus>>;
}

export interface SaveDataV4 {
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
  readonly equipmentLoadout?: EquipmentLoadoutState;
  readonly items: ItemInventoryState;
  readonly bosses: BossProgressState;
  readonly compendium: CompendiumState;
  readonly pendingAchievementReports: readonly string[];
  readonly appliedGrantTransactions: AppliedGrantTransactions;
  readonly grantTransactionFingerprints: GrantTransactionFingerprints;
}
```

Keep explicit legacy V1/V2/V3 interfaces in migration code. Do not redefine old schemas in place.

## 5.3 V3 legacy permanent-upgrade refund

V4 removes the permanent-stat shop. Old players must not lose spent value and old players must not keep unobtainable hidden power.

Use a **frozen migration refund table derived from the shipped V3 cost curve**, not the current live catalog at migration time. Otherwise a later balance edit would change history.

Cumulative refund by saved level:

| V3 upgrade | L0 | L1 | L2 | L3 | L4 | L5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `reinforced-vest` | 0 | 10 | 26 | 52 | 93 | 159 |
| `quick-paws-training` | 0 | 15 | 39 | 77 | 138 | 236 |
| `sharpened-ammo` | 0 | 20 | 54 | 112 | 210 | 377 |
| `magnetic-whiskers` | 0 | 10 | 25 | 48 | 82 | 133 |

Migration:

```text
V4 scrap = min(MAX_SAFE_INTEGER, V3 scrap + sum(refund(saved known levels)))
```

Clamp known levels to the shipped V3 max 5. Unknown/stale permanent-upgrade IDs are invalid legacy data and do not create invented refund value.

Tests must pin all four schedules so later balance work cannot mutate migration history.

## 5.4 Legacy Well Protected achievement

Current `achievement:permanent-reinforced-coat-3` depends on `reinforced-vest >= 3` and would become impossible after retirement.

Migration handling:

1. if V3 `reinforced-vest >= 3`, preserve/mark the old achievement completion fact before dropping the map;
2. preserve an already-completed old record;
3. remove the old definition from the **active V4 achievement catalog** so new players do not see an impossible legacy goal;
4. do not reuse that stable ID for a different achievement;
5. add a new current achievement for the second boss milestone using the existing `boss-defeated` condition, e.g. `achievement:boss-forge` / **Warden Down**. This keeps the active catalog at ten without inventing a new equipment-condition primitive solely to preserve a number.

The old saved achievement fact may remain in sparse save history; active registry/read models simply do not advertise retired content.

Update #167 badge production from Well Protected to Warden Down.

## 5.5 Retire legacy primitives from active V4 contracts

Once all shipped V4 data no longer uses them:

- remove `permanent-level` from the active `ProgressionCondition` union/validator/evaluator;
- remove `permanent-upgrade-level` from active `ProgressionGrant` validation/application;
- remove `MetaUpgradeRegistry` from Boot/GameContext/run preparation;
- delete the purchase-only `ProgressionController` path;
- keep `meta.ts` only for still-valid generic reward/unlock helpers or rename/split it in a small mechanical follow-up if useful.

Do not retain a hidden permanent-stat application in `prepareRun`; that would make migrated old saves stronger than new saves for an unobtainable reason.

## 5.6 Compendium migration

Initialize:

```ts
compendium: { enemies: {} }
```

Then conservatively backfill any V3 boss with `bosses[id].defeated === true` to `defeated`. Do not fabricate ordinary enemy encounters from achievements, stage membership or total kill counts.

Adding Enemy N+1 later requires no save-version change.

## 5.7 V4 regression suite

- V1 → V4;
- V2 → V4 including first-victory compatibility;
- V3 → V4 with no permanent levels;
- every legacy refund level 0–5;
- combined/max refund and safe-integer cap;
- legacy Well Protected preservation;
- boss Compendium backfill;
- unknown ordinary enemy remains unseen;
- V4 round-trip;
- unsupported future version behavior;
- malformed/hostile sparse maps sanitize without granting value.

---

# 6. Slice D — first-class Equipment Set ownership

## 6.1 New catalog

Add `src/data/equipment-sets.json`.

```ts
export interface EquipmentSetDefinition {
  readonly id: string; // set:<slug>
  readonly name: string;
  readonly presentation: {
    readonly emblemArtId: string;
  };
  readonly setBonuses: Readonly<{
    2: readonly ModifierSpec[];
    4: readonly ModifierSpec[];
  }>;
  readonly upgradeUnlocks?: Readonly<Partial<Record<2 | 3 | 4, ProgressionCondition>>>;
}
```

Every current set moves its `setBonuses` / `upgradeUnlocks` from the arbitrary provider piece to one set row. Stable equipment/set IDs do not change.

## 6.2 Definition-time modifier specs

Add a reusable definition-only type in `gameplay/stats.ts`:

```ts
export type ModifierSpec = Omit<Modifier, 'sourceId'>;
```

Use a narrower validator vocabulary per domain rather than allowing every stat everywhere.

Migrate:

- `EquipmentDefinition.effects: ModifierSpec[]`;
- `EquipmentSetDefinition.setBonuses: ModifierSpec[]`;
- `PartDefinition.effects: ModifierSpec[]`;
- `AbilityEffect.stat-burst.modifiers: ModifierSpec[]`.

Do **not** change run-upgrade cards to this type merely for uniformity: their existing `RunUpgradeEffect` intentionally has a narrower validated contract and runtime stack-derived source identity.

## 6.3 Runtime source derivation

- equipment piece modifier source = owned equipment `instanceId`;
- set bonus = `${setId}:2` / `${setId}:4`;
- Gun Part modifier source = owned part `instanceId`;
- ability stat burst = ability definition ID (all modifiers from that activation are removed together when the active phase expires).

No author manually repeats those IDs in JSON.

## 6.4 Registry shape

Evolve `DataEquipmentRegistry` rather than creating parallel scene-owned maps:

```ts
class DataEquipmentRegistry {
  equipmentById(id): ...
  setById(id): ...
  all(): readonly EquipmentDefinition[]
  allSets(): readonly EquipmentSetDefinition[]
  asMap(): ReadonlyMap<...>
  setsAsMap(): ReadonlyMap<...>
}
```

Constructor consumes/validates both `equipment` and `equipmentSets`.

Pure equipment functions accept the piece/set lookups explicitly. No `find()` scan for a provider remains.

## 6.5 Cross-catalog validation

Validate:

- unique set IDs;
- exactly four supported slot pieces per complete advertised Alpha 3 set;
- every piece `setId` resolves;
- every set emblem resolves to generic icon-compatible art;
- every piece icon resolves;
- 2/4 bonuses non-empty and valid;
- unlock references resolve;
- no set-owned fields are accepted on pieces;
- no authored `sourceId` accepted in piece/set/part/ability modifier specs.

## 6.6 N+1 proof

Synthetic Set 9:

```text
1 set row
+ 4 piece rows
+ art refs
```

must activate 2/4 bonuses, evaluate tier gates and appear in read models with no runtime/controller/validator-core source edit.

---

# 7. Slice E — scalable visual resources without semantic renderer proliferation

This replaces the current one-logical-binding = one-physical-texture assumption before #167 adds the large presentation catalog.

## 7.1 Separate physical and logical identity

Target conceptual types:

```ts
export type VisualRenderKind =
  | 'animated-actor'
  | 'sprite'
  | 'icon'
  | 'portrait'
  | 'weapon-held'
  | 'world'
  | 'ui-chrome';

export type VisualResourceLoad =
  | { readonly type: 'image'; readonly url: string }
  | {
      readonly type: 'spritesheet';
      readonly url: string;
      readonly frame: { readonly width: number; readonly height: number };
    }
  | {
      readonly type: 'atlas';
      readonly imageUrl: string;
      readonly dataUrl: string;
    };

export interface VisualTextureResource {
  readonly id: string;          // resource:<slug>
  readonly textureKey: string;  // Phaser cache identity
  readonly sampling: 'nearest' | 'linear';
  readonly load: VisualResourceLoad;
}

export interface VisualArtBinding {
  readonly id: string;          // semantic stable art ID
  readonly kind: VisualRenderKind;
  readonly resourceId: string;
  readonly frameKey?: string;   // named atlas frame for static atlas art
  readonly display: { readonly width: number; readonly height: number };
  readonly clips?: Readonly<Record<string, VisualArtClip>>;
  readonly production?: {
    readonly sourcePath: string;
    readonly builderPath: string;
    readonly exportPath: string;
  };
}

export interface VisualArtCatalog {
  readonly resources: readonly VisualTextureResource[];
  readonly bindings: readonly VisualArtBinding[];
}
```

Existing logical IDs remain stable. Migrate the current 77 bindings 1:1 first, then pack static production families into atlases.

## 7.2 Atlas rule

Use deterministic **named-frame atlases** for large static UI families. Do not make frame number part of semantic identity.

Examples:

```text
resource:ui-upgrades
resource:ui-abilities
resource:ui-passives
resource:ui-equipment
resource:ui-gunsmith
resource:ui-achievements
resource:ui-common
resource:ui-stage
```

Packer:

- stable sort by logical art ID;
- deterministic fixed padding;
- bounded atlas dimensions;
- emits PNG + atlas JSON with frame keys equal to logical IDs or another deterministic stable key;
- rebuild is byte/metadata reproducible;
- changing packing does not change content/save IDs.

Animated characters/enemies remain individual spritesheet resources unless profiling later demonstrates a reason to atlas them.

## 7.3 Renderer compatibility

Validation checks renderer capability, not semantic owner.

Examples:

- Equipment/Part/Achievement/Ability/Passive presentation → `icon`;
- character portrait → `portrait`;
- character/enemy runtime sheet → `animated-actor`;
- pickups/projectiles may use `sprite` with image or spritesheet clips;
- world → `world`.

Remove validators that require Equipment/Part art to be `upgrade-icon`.

Do not add `equipment-icon`, `achievement-icon`, `passive-icon`, etc. to a renderer switch.

## 7.4 Resource bundles

Keep logical grouping explicit and load physical resources through resolved bundles.

Recommended bundle semantics:

```text
bundle:boot-core
bundle:menu-home
bundle:menu-mercenary
bundle:menu-loadout
bundle:menu-career
bundle:run-core
bundle:run-weapons
bundle:<stage-world>
```

StageDefinition retains its world `assetBundleId`.

A run-resource resolver additionally computes the **closure** of:

- selected character actor;
- selected encounter enemy actors;
- boss actor;
- recursively referenced summon/split child actors;
- run-core pickups/projectiles/HUD;
- weapon runtime art that the explicit run loot/reward pool may produce;
- selected stage world bundle.

No asset becomes eligible gameplay content merely because it is loaded.

## 7.5 Loading policy

### Boot

Load only boot/home-critical resources.

### Menu

On opening a heavy surface, `MenuScene` asks a single Phaser-aware `VisualResourceLoader`/manager to ensure that surface bundle. While loading:

- target panel is not partially interactive;
- show a minimal existing-core Loading state;
- input is either ignored or Back safely cancels the pending navigation;
- failed **required** resource surfaces a recoverable error rather than rendering incorrect fallback art as final content.

Once loaded, resources stay cached for the session. Do not add unloading/eviction in Alpha 3 without measured memory evidence.

### Run

`GameScene.preload()` (or a thin pre-run loading scene if Phaser lifecycle tests prove preload cannot safely own it) loads the resolved run resource closure before `create()` materializes gameplay.

Do not assemble two different run seeds in preload/create. If resource resolution needs the exact composed request, create it once in `init()` and retain it for `create()`; otherwise use the same pure selection resolver for both.

## 7.6 Builder/source validation

Replace per-ID contract registration in `validate-builders.lua` with renderer-family/manifest-driven discovery.

A new Character 9 or Enemy 11 should require:

```text
data + logical art binding + production metadata + source/builder/export
```

not a validator-core row append.

Keep reusable family contracts:

- 48×48 actor / idle-run-hurt-defeat baseline;
- boss actor allowed 64/96 only when binding metadata explicitly declares that reviewed contract;
- static icon;
- static portrait;
- projectile/pickup animation;
- world tile/prop.

## 7.7 Deterministic parity

Add a non-destructive temporary rebuild gate:

```text
builder/import → temp native/export
compare approved source/export normalized pixels + metadata
```

Mismatch reports exact logical ID/resource/path.

For selected generated source, preserving the raw generated sheet as provenance and deterministically importing it is acceptable. The accepted Pixelorama source/export remains subject to readability/originality/anchor review; do not require ceremonial hand-redrawing.

## 7.8 Scale proof

Synthetic 500 logical static icons across a bounded number of atlas resources must validate without:

- hitting the old 256 logical cap;
- creating 500 Phaser textures;
- adding renderer kinds;
- editing Boot lists.

Keep sensible defensive bounds on logical bindings, resources, atlas dimensions/frame counts and file sizes.

---

# 8. Slice F — product information architecture and scalable UI surfaces

#165 is not just a skinning exercise. The player-facing information architecture changes.

## 8.1 Top-level model

```text
HOME
├─ Play Contract
├─ Mercenary
├─ Loadout
│  ├─ Equipment
│  └─ Gunsmith
├─ Career
│  ├─ next goals / mastery overview
│  ├─ Achievements
│  └─ Compendium
├─ Training             # optional explicit Golden Run compatibility
└─ Settings
```

User-visible **Arena** disappears as a peer of Contract. The selected location appears on the contract card/detail. The existing arena controller may remain behind explicit Training compatibility if Golden Run is retained.

User-visible generic **Progression** disappears. Its purchase screen is retired in V4; next-goal overview becomes Career/Home information.

## 8.2 Home

Primary CTA:

```text
PLAY CONTRACT
<next stage name>
<objective summary> · <location> · <headline reward>
```

Secondary current-build strip:

```text
<mercenary portrait/name> | <selected persistent gun> | <active equipment set summary>
```

Then Loadout/Career/Training/Settings.

First-time player does not need to visit another screen before Play Contract.

## 8.3 Contract selection

Each card uses:

- stage name;
- chapter/location art;
- objective icon + plain-language objective;
- representative threat silhouettes/Compendium-known names where spoiler-safe;
- headline first-clear reward;
- cleared/best-time/locked state;
- boss marker when applicable.

No raw IDs or generic “difficulty:chapter-1-medium” strings.

## 8.4 Scrollable content component

Do not solve Characters only and leave the same defect waiting in Compendium/Equipment.

Create one reusable scroll/focus presentation primitive for vertically growing content surfaces. It must support:

- wheel/trackpad scrolling;
- touch drag/inertia kept conservative;
- controller/keyboard focus navigation;
- focused item automatically scrolled into view;
- pointer/touch item activation;
- viewport resize preserving/clamping scroll/focus;
- no focusable off-screen hit targets;
- nested card height from real rendered content;
- 390×844 and 360×640 minimum targets.

Use it for Mercenary/Characters first and then Compendium/long Career lists where appropriate. Equipment/Gunsmith may use grid/paged layouts if their interaction benefits, but share the same focus/visibility rules.

## 8.5 Mercenary screen

A character is a visual identity, not a text record.

Each selected/detail card shows:

- portrait/actor art;
- name + short role line;
- active ability icon/name/description;
- passive icon/name/description;
- starting weapon icon;
- concise stat differences;
- unlock requirement if locked;
- mastery if relevant.

Roster scrolling is mandatory.

## 8.6 Upgrade chooser

Normalize typography through shared card layout; names do not change size based on string or card category unless the **same** deterministic overflow rule applies to every card.

Card hierarchy:

```text
icon
name
short effect / trade-off
stack + rarity/family state
```

Pixel-art icons from #167 replace placeholder-looking current symbols.

## 8.7 Between-run actions

Win summary priority:

1. reward reveal / newly unlocked choice;
2. **Next Contract**;
3. Adjust Loadout;
4. Replay;
5. Home.

Loss:

1. concise run/build/cause summary;
2. Retry;
3. Adjust Loadout;
4. Home.

Existing `Next Contract` support is reused. Do not route Next Contract through multiple menu clicks.

---

# 9. Slice G — reward and stage-content rebalance

This is a product-content pass over the existing deterministic architecture, not a new economy engine.

## 9.1 Remove full-set reward dumps

Current reward profiles use full four-piece sets as plumbing proof. Replace that before product acceptance.

Hard presentation/content caps for the first pass:

- ordinary first-clear stage: at most **2 persistent owned-instance grants**, ideally one headline item plus currency/normal loot;
- boss first-clear: one **headline capability/content reward** plus at most **2 supporting persistent item grants**;
- do not grant two complete four-piece sets at once;
- do not require the summary to display eight unrelated new inventory rows.

A set should normally become a 2-piece choice first and a 4-piece payoff later.

Every advertised current equipment piece must have a documented acquisition source across stages/achievements/mastery/reward content, but it need not all be dumped into the ten stage profiles.

Update conformance tests from “every set is entirely granted by one stage reward” to:

> every release-obtainable equipment definition has at least one valid deterministic acquisition source, and no source violates the reward-density cap.

Do not add random persistent equipment drops merely to solve distribution unless playtesting proves a need.

## 9.2 Achievement catalog correction

Active V4 catalog:

- remove retired Well Protected;
- add Warden Down using existing `boss-defeated: boss-forge`;
- retain exact game-owned achievement authority;
- use achievement rewards as one legitimate way to distribute selected equipment/parts without inventory dumps.

The art matrix/brief follows the active V4 catalog, not stale Alpha 3 plumbing.

## 9.3 Stage distinctness

Every stage receives an explicit design sentence:

```text
“This contract is about ______, so the player must ______.”
```

Reject two stages whose sentences are functionally interchangeable.

Current reusable objective primitives remain kill / collect / survive / defeat.

Do not add new objective types until the existing four have been made genuinely distinct through encounter/location composition.

## 9.4 Encounter cadence

The current composer can introduce enemy layers over time from encounter roster ordering. Use that deliberately before adding a new encounter scripting system.

For a 120-second stage, prefer enough distinct/meaningful layers that the composition changes roughly every 20–30 seconds. A two-enemy profile that produces a ~60-second unchanged roster needs either:

- another meaningful layer;
- a different composition/profile;
- objective/location pressure that creates a real beat;
- or evidence-backed extension of encounter pacing.

Only add an authored encounter-beat schema if real playtests still show flatness after content-level composition is improved. Do **not** prebuild a general encounter scripting language.

## 9.5 Forge chapter location identity

The Forge chapter currently reuses `junkyard-lot` and the same world bundle. Product acceptance now provides a real reason for a second visual/location treatment.

Preferred first-pass target:

- add a Forge/Foundry arena definition using the existing Arena mechanics;
- reuse compatible physical-space primitives where sensible but give it deliberate Forge floor/boundary/landmark/hazard art;
- at least one readable heat/industrial spatial pressure element using existing registered hazard mechanics;
- all Forge chapter stages reference the Forge arena/world bundle;
- no new Arena architecture.

This supersedes the earlier art-planning caution against inventing a second location merely to create more art: the location is now justified by chapter/gameplay distinctness.

## 9.6 Build-offer quality

Keep the existing 4-card offer and current family eligibility rule.

Before inventing new card mechanics, improve offer composition with a small deterministic policy around the existing pool:

- when at least one eligible equipped-family card exists, an offer should normally contain at least one;
- preserve at least one eligible non-family/general alternative where available;
- avoid four semantically near-identical offense stat choices;
- leave one weighted wildcard opportunity where pool size permits;
- keep seeded determinism by using the same upgrade RNG stream and a deterministic selection algorithm.

Define the policy as pure code with synthetic pools and seeded tests. Never inspect content IDs to construct an offer.

## 9.7 Fun evidence

For each stage record the engagement evidence defined in the product benchmark. The content pass is not complete based on JSON inspection alone.

---

# 10. Slice H — Compendium implementation

Implement `monster-compendium.md` after B/C/E/F.

Key frozen integration points:

- metadata keyed to existing enemy ID;
- name/mechanics/stages/art derived;
- encounter discovery = existing `enemy:spawned`;
- defeat discovery = universal `enemy:killed` after Slice B;
- sparse V4 Compendium state;
- no kill-count grind tiers;
- final enemy sprites reused, not duplicate monster portrait canon;
- Career navigation + shared scroll/focus component;
- unknown/new Enemy N+1 starts unseen without migration.

Compendium content review remains factual against the implementation SHA.

---

# 11. Slice I — art production integration

Use the reviewed #167 briefs **after updating them for the V4/product decisions in this blueprint**.

Required corrections before production:

1. replace retired Well Protected achievement badge with Warden Down;
2. add Forge/Foundry world packet because Chapter 2 now has a justified visual location identity;
3. bind Equipment/Gunsmith/Ability/Passive/Achievement presentation to the new generic icon contract;
4. produce Home/Contract/Loadout/Career/Compendium presentation against the final IA;
5. preserve exact stable current content IDs for every content-bound piece;
6. use logical-art/physical-resource manifests from Slice E;
7. run stable-ID set equality against active V4 catalogs.

The disciplined brief → concept → silhouette → Pixelorama → deterministic builder/import → export → validator → real-scale review process remains mandatory.

---

# 12. File-level implementation map

This is the expected impact map. Codex may discover a nearby test/helper that must also change; it may not silently move ownership to an unrelated layer.

## Save/progression

```text
src/systems/save.ts
src/gameplay/meta.ts
src/gameplay/runStart.ts
src/gameplay/conditionEvaluator.ts
src/gameplay/conditionValidation.ts
src/gameplay/grantProcessor.ts
src/engine/context.ts
src/scenes/BootScene.ts
src/ui/progressionController.ts            # retire/remove
src/ui/progressionOverviewController.ts    # evolve to Career overview or retain internal name
src/data/meta-upgrades.json                # retire from active V4 GameData
src/data/achievements.json                 # retired old achievement + Warden Down
```

## Death boundary

```text
src/entities/Enemy.ts                      # health owner retained; minimal/no semantic move
src/systems/EnemyDamageResolver.ts         # new narrow owner (name may vary)
src/systems/WeaponSystem.ts
src/gameplay/abilities.ts
src/scenes/GameScene.ts
src/engine/eventBus.ts                     # event payload stays compatible
```

## Equipment

```text
src/data/equipment-sets.json               # new
src/data/equipment.json
src/gameplay/stats.ts
src/gameplay/equipment.ts
src/gameplay/gunsmith.ts
src/gameplay/abilities.ts
src/systems/types.ts
src/systems/equipment.ts
src/systems/validation.ts
src/systems/validation/equipment.ts
src/systems/validation/parts.ts
src/systems/validation/abilities.ts
src/engine/context.ts
src/ui/equipmentController.ts
```

## Visual resources

```text
src/data/visual-art.json                   # evolved logical+resource model
src/data/asset-bundles.json                # expanded logical bundles
src/systems/types.ts
src/systems/visualArt.ts
src/systems/assetBundles.ts
src/systems/validation.ts
src/scenes/BootScene.ts
src/scenes/MenuScene.ts
src/scenes/GameScene.ts
docs/art/scripts/validate-visual-art.mjs
docs/art/scripts/validate-builders.lua
docs/art/scripts/export-pixelorama.sh
new deterministic atlas/parity tooling
assets-src/**
public/assets/**
```

## Product UI/content

```text
src/ui/menus.ts
src/scenes/MenuScene.ts
src/ui/stageSelectionController.ts
src/ui/characterSelectionController.ts
src/ui/equipmentController.ts
src/ui/gunsmithController.ts
src/ui/achievementsController.ts
src/ui/runSummary.ts
new shared scroll/focus view helper
new Compendium controller/view
src/data/stages.json
src/data/encounter-profiles.json
src/data/difficulty-profiles.json           # only if tuning requires
src/data/reward-profiles.json
src/data/arenas.json
src/data/asset-bundles.json
```

---

# 13. Tests to add/change

## Do not scatter magic release counts

Keep one deliberate release-content assertion per catalog where useful. Generic read-model/controller tests compare with their fixture/registry.

## New/updated suites

```text
tests/enemyDamageResolver.test.ts
  exact-once lethal source matrix

tests/saveV4.test.ts (or save.test.ts focused section)
  all migrations/refunds/Compendium backfill

tests/equipment.test.ts
  first-class synthetic Set 9

tests/validateAllData.test.ts
  equipment-set descriptor + visual resource cross-refs

tests/visualArt.test.ts
  logical/resource/renderer compatibility + atlas frame refs

tests/visualResourceLoading.test.ts
  boot/menu/run bundle closure + dedupe/failure semantics

tests/artScalability.test.ts
  synthetic 500 logical icon bindings / bounded resources

tests/builderParity integration script tests

tests/menu / character / focus tests
  scrolling + target visibility + IA routes

tests/upgrade offer policy
  coherent family/general/wildcard behavior + determinism

tests/reward-profile conformance
  acquisition coverage + persistent-grant density caps

tests/compendium*.test.ts
  read model/discovery/migration/new Enemy N+1
```

Existing ordinary full suite, lint, build, art validation and content validation remain required.

---

# 14. Checkpoint review questions

After every implementation slice, explicitly answer all of these against the current integrated tree:

1. Did this create a second source of truth?
2. Did any existing stable ID or deterministic pool change unintentionally?
3. Did any ordinary N+1 content path gain a source-code edit requirement?
4. Did persistence become optimistic or non-atomic?
5. Did scene code gain gameplay rules?
6. Did an input mode gain different gameplay semantics?
7. Did error/failure recovery become less honest?
8. Did a new abstraction solve at least one current concrete use case?
9. Does the change improve or preserve the engagement benchmark rather than merely architecture cleanliness?
10. Can the user explain the affected feature without internal terminology?
11. Does the UI remain viable at 390×844 and 360×640?
12. Are tests proving a generic contract or merely today’s fixture count?
13. Did a content/reward change make the easiest grind route dominant?
14. Can the next agent add N+1 by following the repository template rather than this chat?

A checkpoint does not pass while a material answer is “unclear.”

---

# 15. New consolidated candidate gate

Only cut a new acceptance SHA after slices required for the next coherent product test are integrated and exact-SHA CI is green.

The acceptance candidate must then prove:

## Correctness

- ordinary CI;
- content/art validators;
- shuffled repeat tests;
- migration tests;
- exact candidate deployment evidence.

## Runtime/device

- Chrome/macOS end-to-end;
- real portrait iOS touch;
- controller-only;
- mixed input/disconnect;
- target viewport matrix;
- lifecycle/soak/performance.

## Product/fun

- no confirmed freeze/blocker;
- clear Contract-first entry;
- no ambiguous Progression/Arena peer concepts;
- character/menu art and scrolling pass;
- stage distinctness + pressure cadence;
- build identity/power moments;
- reward clarity;
- boss climax;
- fast Retry/Next flow;
- at least one independent playtest verdict that the current build is **fun and replayable now**, not “will be fun when more content is added.”

If correctness passes and fun fails, Alpha 3 remains **NOT READY**.
