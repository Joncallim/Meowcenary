# Epic 18 — Build Variety and Golden Run Pacing

**Issue:** #77 · **Base:** `main` @ `ec6b51b5` (Epic 17 closeout, PR #104)

> Status: **implementation-ready architecture; runtime not yet implemented.**
> This document is the authoritative implementation contract for Epic 18.
> The architecture PR is intentionally documentation-only. Runtime work lands
> in ordered slices after this contract is reviewed and merged.

## 1. Outcome

Epic 18 turns the current five-minute Junkyard Lot run from a mechanically
complete loop into a replayable build arc. It expands the three-card upgrade
catalog into a deliberately bounded first-pass pool, makes choices readable at
phone scale, adds run-only weapon-family build specialization without creating a
new effect engine, and tunes the existing spawn / XP / loot / weapon-reward
owners against explicit Golden Run targets.

The finished epic has:

- **18** shipped temporary upgrade definitions, including the existing
  `quick-paws`, `extra-scrap`, and `hot-barrel` IDs unchanged;
- **4 choices by default**, with the chooser/layout generic for 1–5 choices;
- authoritative owned/current/max-stack state in the chooser read model;
- one required placeholder icon for every shipped card through the existing
  visual-art manifest and preload path;
- meaningful global and weapon-family-specific build directions;
- only two new weapon-behaviour modifier keys (`pierce`, `spreadDeg`), both
  already authoritative Epic 17 weapon semantics;
- no save-schema change, no persistent Gunsmith state, no achievement state,
  no gamepad-specific rule path, and no card-ID branches in `GameScene`;
- evidence-driven Golden Run tuning using the existing deterministic RNG
  streams and existing spawn / XP / loot / weapon-reward systems;
- a dev-only playtest summary capable of measuring the pacing gates below.

## 2. Repository architecture pass

### Existing boundaries to preserve

- `UpgradeSystem` already owns one active offer/token, queued multi-level
  offers, level-up pause ownership, re-entrant event safety, and stale-command
  rejection. Epic 18 extends its snapshot/read model; it does **not** replace
  this coordinator.
- `offerCards()` already performs deterministic weighted selection without
  replacement inside an offer using the dedicated `upgrades` run RNG stream.
- `applyCard()` is transactional and uses stable per-stack sources
  (`card:<upgrade-id>:<stack>`). Epic 18 keeps one transaction/source per card
  stack even when an upgrade contains several scoped modifiers.
- `ModifierStack` is the authoritative temporary/permanent modifier collector.
  Existing player/economy callers use `resolve()`; weapon stats resolve in
  `weaponStats.ts`.
- Epic 17 established data-driven weapon semantics for `pierce`,
  `projectileCount`, and `spreadDeg`. These are the semantics Epic 18 reuses;
  no burn/explosion/ricochet framework is justified by the first Alpha 2 card
  set.
- `WeaponRewardSystem` owns deterministic scheduled physical weapon rewards on
  its own `weapon-rewards` RNG stream. Reward 0 is already the guaranteed
  starter duplicate at 20–40 seconds. Epic 18 tunes timing only; it does not
  bypass physical pickups or mutate the rack directly.
- `SpawnSystem` / `spawnDirector.ts` own deterministic enemy cadence and caps.
  `spawn-curves.json` currently has one row each for Dust Mite, Junk Rusher,
  and Trash Brute. Epic 18 first tunes those existing owners rather than adding
  a second phase/wave engine.
- `DropSystem` already resolves `pickupRadius`, `xpGain`, and `currencyGain`
  from `ModifierStack`, and preserves full-rack weapon drops in the world.
- `visual-art.json` + `DataVisualArtRegistry` + Boot preload are the single art
  manifest/pipeline. Upgrade icons join that manifest; no ad-hoc card loader is
  added.
- Epic 19 owns the unified logical input/action layer, controller-only journey,
  final UX polish, onboarding, and final run-summary presentation. Epic 18
  leaves a clean chooser navigation/confirm seam but does not pre-implement
  Epic 19.

### Gaps Epic 18 must close

- `upgrades.json` has only three definitions.
- `UpgradeEffect` is currently shared by run cards, meta upgrades, and static
  character passives; widening it directly would leak Epic 18 behaviour/scope
  into unrelated systems.
- `ModifierStack` has no weapon-family scope.
- `weaponStats.ts` does not route `pierce` or `spreadDeg` through temporary
  modifiers.
- `UpgradeOfferSnapshot` exposes definitions but not owned/current/max stacks.
- `UpgradeChooser` copy and number shortcuts are hard-coded to three choices.
- `upgradeChooserLayout.ts` clamps the choice count to three.
- upgrade definitions have no presentation metadata or icon reference.
- the dev playtest summary lacks first-merge, offer-repeat, weapon-reward,
  final-rack, and level-cadence evidence needed to tune this epic responsibly.

## 3. Frozen decisions

### D1 — Preserve shipped upgrade identity and save compatibility

The existing IDs `quick-paws`, `extra-scrap`, and `hot-barrel` are shipped
content IDs. Keep their IDs, names, max stacks, rarity, and numeric effects
unchanged in the first Epic 18 catalog revision; only add required presentation
metadata.

All Epic 18 card state remains in `RunState.upgradeStacks` and
`ModifierStack`. There is **no Save V3 / schema migration** and no new
persistent card ownership.

### D2 — Four choices is the Alpha 2 default; the implementation supports 1–5

Production passes an explicit `offerCount: 4` from
`RuntimeConfig.gameplay.upgrades` into `UpgradeSystem`.

`offerCards()` remains generic for any positive count. The chooser/layout must
render 1–5 choices without a `Math.min(3, ...)` clamp. Five is supported for
future tuning, but four is the default because it leaves enough vertical room
at 390×844 for an icon, name/rarity, stack state, and readable description.

Do not build a special anti-repeat/history algorithm in this epic. The 18-card
pool, max-stack eligibility, family eligibility, rarity weighting, and
without-replacement draw are the baseline. Measure cross-offer repetition in
Slice 4; add suppression only through an architecture amendment if evidence
shows it is materially needed.

### D3 — Split legacy/base effects from Epic 18 run-upgrade effects

Do **not** widen the existing `UpgradeEffect` contract used by meta upgrades and
character static passives.

Target types:

```ts
// Existing contract remains the base/permanent/passive shape.
interface UpgradeEffect {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
}

type WeaponBehaviorStatKey = 'pierce' | 'spreadDeg';
type RunUpgradeStatKey = StatKey | WeaponBehaviorStatKey;

interface WeaponFamilyScope {
  readonly kind: 'weapon-family';
  readonly family: string;
}

interface RunUpgradeEffect {
  readonly stat: RunUpgradeStatKey;
  readonly op: 'add' | 'mult';
  readonly value: number;
  readonly scope?: WeaponFamilyScope;
}

interface UpgradePresentation {
  readonly category:
    | 'offense'
    | 'defense'
    | 'mobility'
    | 'utility'
    | 'economy'
    | 'synergy';
  readonly iconArtId: string;
}

interface UpgradeDefinition {
  // existing identity fields unchanged
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly target: 'player' | 'weapon' | 'economy' | 'run';
  readonly description: string;
  readonly maxStacks: number;
  readonly effects: readonly RunUpgradeEffect[];
  readonly presentation: UpgradePresentation;
}
```

This keeps the legacy/permanent/passive surface narrow while allowing Epic 18
run cards to express the two real weapon behaviour values already present in
`WeaponDefinition`.

### D4 — One modifier stack, with an optional weapon-family scope

Extend runtime `Modifier` with the same optional `WeaponFamilyScope` and with a
stat key wide enough to carry `pierce` / `spreadDeg`.

Keep the current `resolve(stat, base)` semantics for **unscoped modifiers only**.
Add a weapon-aware resolver:

```ts
resolveWeapon(stat: RunUpgradeStatKey, base: number, family: string): number
```

`resolveWeapon()` applies, in the existing order:

1. unscoped additive modifiers;
2. matching-family additive modifiers;
3. unscoped multiplicative modifiers;
4. matching-family multiplicative modifiers.

A scoped modifier for another family is ignored. Implement this with ordinary
loops; do not allocate filtered arrays/maps in the per-shot hot path.

`weaponStats.resolveWeaponStats()` uses `resolveWeapon()` for:

- `damage`;
- `attackSpeed`;
- `projectileSpeed`;
- `range`;
- `projectileCount`;
- `pierce`;
- `spreadDeg`.

Post-resolution safety remains explicit:

- `projectileCount = max(1, floor(value))`;
- `pierce = max(0, floor(value))`;
- `spreadDeg = max(0, finiteValue)`;
- existing attack-speed lower-bound protection remains;
- all resolved values must remain finite.

No weapon ID/tier branches are allowed.

### D5 — Only authoritative, currently-used stats may appear on cards

Run-upgrade validation accepts only stats with a live authoritative consumer in
Alpha 2:

```text
moveSpeed, maxHealth,
damage, attackSpeed, projectileSpeed, projectileCount, range,
pickupRadius, xpGain, currencyGain,
pierce, spreadDeg
```

Do **not** ship `armor`, `critChance`, recovery, low-health triggers,
explosions, burn, ricochet, or other speculative cards merely because a field
or idea exists. `armor` and `critChance` currently have no authoritative combat
consumer. A card using them would be misleading data, not build depth.

Scoped effects are valid only for weapon-applicable stats and only when the
upgrade targets `weapon`. Every scoped effect in one upgrade must reference the
same family. The family must exist in `weapons.json`.

### D6 — Family-card offer eligibility is derived from the effect scope

Do not introduce an Epic 18-specific condition language.

An upgrade with no scope is eligible when it is below `maxStacks`.
An upgrade containing `scope: {kind:'weapon-family', family:F}` is additionally
eligible only when `RunState.equipped` contains at least one weapon whose
`family === F`.

Derive this from the definition itself. Do not add a parallel
`requiresWeaponFamily` field.

An already-generated offer is immutable. If the rack changes later, the offer
is still valid; a scoped modifier can safely remain latent when no matching
weapon is present.

### D7 — The system owns stack truth; UI receives an immutable card read model

Replace raw-definition-only chooser snapshots with a read model assembled by
`UpgradeSystem` from the active offer + `RunState.upgradeStacks`:

```ts
interface UpgradeCardReadModel {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly target: UpgradeDefinition['target'];
  readonly description: string;
  readonly category: UpgradePresentation['category'];
  readonly iconArtId: string;
  readonly family?: string;
  readonly owned: boolean;
  readonly currentStacks: number;
  readonly maxStacks: number;
  readonly nextStack: number;
}

interface UpgradeOfferSnapshot {
  readonly offerId: number;
  readonly choices: readonly UpgradeCardReadModel[];
}
```

`currentStacks` is read through the same safe stack logic used for eligibility.
UI never reads `RunState`, recomputes max-stack eligibility, or parses effects.

Keep the existing `card:offered` event payload (`offerId` + ordered choice IDs)
and `card:chosen` event. Do not add a second presentation event. The chooser
continues to match the event IDs against the authoritative snapshot before
rendering and sends `chooseCard(offerId, upgradeId)` through the existing token
path.

Descriptions are per-stack player-facing copy, so `current/max → next/max` plus
the description explains the incremental choice without exposing raw modifier
objects to Phaser.

### D8 — Upgrade icons use the existing visual-art manifest

Add `upgrade-icon` to `VisualArtKind` / validation.

Every shipped upgrade has:

```text
presentation.iconArtId = upgrade-icon:<upgrade-id>
```

and one matching **required** `visual-art.json` image binding. Placeholder
exports are simple readable motifs at phone scale and use the existing
deterministic asset-source/builder/export validation pipeline. Suggested export
size is 48×48 with a 36–40 logical-pixel display size inside the card.

Boot preload remains generic because it already loads every manifest binding.
`UpgradeChooser` receives a `VisualArtLookup`; it never constructs paths from
upgrade IDs and never loads textures ad hoc.

Final art replaces the placeholder export behind the same art ID / texture key;
no gameplay definition ID or chooser command changes.

### D9 — Epic 18 leaves a narrow navigation/confirm seam for Epic 19

The chooser interaction remains:

```text
Touch/pointer -> direct visible-card select -> authoritative token command
Keyboard      -> focus previous/next + confirm -> same command
Number keys   -> optional 1–5 shortcut -> same command
Epic 19       -> logical nav/confirm actions -> same focus/confirm seam
```

Refactor the chooser facade/view so focus movement and `confirmFocused()` are
callable independently of the raw keyboard event handler. Do not define the
repository-wide `GameAction` type, gamepad mappings, active-input-source state,
or controller lifecycle here; those belong to Epic 19.

The player-facing instruction must not enumerate `1, 2, or 3`. Use neutral copy
such as `Choose an upgrade` / `Tap a card or use navigation + confirm`.

Focus state is presentation-only. Touching a card may move visible focus to that
card, but eligibility and selection ownership remain entirely in
`UpgradeSystem`.

### D10 — Pacing is tuned through existing owners before adding machinery

Epic 18 may tune:

- `spawn-curves.json`: `spawnEveryMs`, `maxAlive`, and scaling;
- enemy `xpValue` / `scrapValue` only when playtest evidence requires it;
- `xp.ts` curve constants only when level cadence is globally wrong;
- `RuntimeConfig.gameplay.weaponRewards` timing;
- loot-table weights/amounts where reward tempo requires it.

Do **not** add a stage/objective system, a second spawn director, a phase script,
or per-minute content-ID branches to create a climax. The current Rusher start
at ~60s and Brute start at ~150s remain the intended structural beats.

If existing curve/cap/scaling knobs cannot produce a strong final minute
without breaking the first four minutes, record the evidence and amend this
architecture before adding a new temporal encounter primitive.

### D11 — Tuning changes require measured local evidence

Extend the existing dev-only `PlaytestSummarySystem` (or a small Phaser-free
collector owned by it) to record, at minimum:

- level-up timestamps;
- offered upgrade IDs per `offerId`;
- chosen upgrade IDs / final stack counts;
- consecutive-offer overlap rate;
- first `weapon:merged` time and total merges;
- weapon acquisition timestamps/count;
- `weapon:pickup-blocked` count;
- final rack definition/family/tier distribution;
- existing outcome/time/level/kills/currency/average DPS.

Use existing bus events and `runState.timeMs`; no new gameplay event is required.
The instrumentation is development-only, local console/report output, with no
networking, analytics SDK, save field, or production player dependency.

Create `docs/tuning/epic-18-golden-run.md` during the tuning slice and record
seed, outcome, relevant metrics, tuning change, and result for each accepted
balance change.

### D12 — Epic 18 does not take Epic 19's final-summary or controller scope

Do not expand the player-facing terminal summary, onboarding, menu polish,
gamepad support, or unified action layer in this epic. Epic 18 only ensures the
run state/read models contain enough build information for Epic 19 to present
later.

## 4. First-pass catalog — exactly 18 cards

The three existing rows retain their current gameplay values. New rows use the
initial values below; Slice 4 may adjust **numbers** only when the tuning record
shows why. IDs and semantic roles stay stable unless architecture is amended.

| ID | Category / rarity / max | Target | Per-stack effect | Family eligibility |
| --- | --- | --- | --- | --- |
| `quick-paws` | mobility / common / 5 | player | `moveSpeed ×1.08` | — |
| `extra-scrap` | economy / common / 3 | economy | `currencyGain ×1.25` | — |
| `hot-barrel` | offense / uncommon / 4 | weapon | `attackSpeed ×1.12` | — |
| `scrap-magnet` | utility / common / 4 | player | `pickupRadius ×1.25` | — |
| `reinforced-coat` | defense / common / 4 | player | `maxHealth ×1.12` | — |
| `fast-learner` | utility / common / 3 | run | `xpGain ×1.15` | — |
| `heavy-rounds` | offense / uncommon / 3 | weapon | `damage ×1.20`, `attackSpeed ×0.94` | — |
| `long-barrel` | offense / uncommon / 3 | weapon | `range ×1.15`, `projectileSpeed ×1.12` | — |
| `split-shot` | offense / rare / 2 | weapon | `projectileCount +1`, `spreadDeg +4` | — |
| `punch-through` | offense / rare / 2 | weapon | `pierce +1` | — |
| `glass-cannon` | synergy / epic / 2 | run | `damage ×1.30`, `maxHealth ×0.90` | — |
| `run-and-gun` | synergy / uncommon / 3 | run | `moveSpeed ×1.06`, `attackSpeed ×1.06` | — |
| `pistol-deadeye` | synergy / uncommon / 3 | weapon | pistol `damage ×1.22`, `range ×1.12` | pistol |
| `pistol-needle-rounds` | synergy / rare / 2 | weapon | pistol `pierce +1`, `damage ×0.92` | pistol |
| `smg-overclock` | synergy / uncommon / 2 | weapon | SMG `attackSpeed ×1.15`, `damage ×0.95` | smg |
| `smg-spray` | synergy / rare / 2 | weapon | SMG `projectileCount +1`, `spreadDeg +5`, `attackSpeed ×0.95` | smg |
| `shotgun-buckshot` | synergy / rare / 2 | weapon | shotgun `projectileCount +1`, `spreadDeg +4` | shotgun |
| `shotgun-breacher` | synergy / uncommon / 3 | weapon | shotgun `damage ×1.25`, `range ×0.88` | shotgun |

Notes:

- `reinforced-coat` increases maximum health but does **not** heal current
  health; its copy must not imply an instant heal.
- `glass-cannon` is deliberately a real trade-off. `Player.update()` already
  clamps current health to current max health after max-health changes.
- family cards become eligible only after the relevant family is in the rack.
- all scoped effects in a family card use the same family scope object.
- do not add a fourth weapon family or future Gunsmith trait to fill the pool.

## 5. Validation and catalog contracts

Keep `upgrades.json` inside the existing `CATALOG_DESCRIPTORS` registration;
Epic 18 does **not** add another catalog.

Validation changes:

1. add required `presentation` to `UPGRADE_FIELDS`;
2. validate category enum + non-empty `iconArtId`;
3. use a run-upgrade effect validator that accepts `scope` and the explicitly
   allowed Epic 18 stat set;
4. keep meta-upgrade and character-passive effect validation on the legacy
   unscoped `UpgradeEffect` contract and existing `STAT_KEYS`;
5. reject scoped player/economy-only stats;
6. reject more than one distinct scoped family in one upgrade;
7. cross-reference scoped family names against `weapons.json` families;
8. cross-reference `presentation.iconArtId` against exactly one
   `visual-art.json` binding of kind `upgrade-icon`;
9. require all shipped upgrade-icon bindings used by the catalog to be
   `required: true`;
10. preserve descriptor order and existing error message/order guarantees for
    previously valid/invalid data paths.

The aggregate validation phase remains: root -> per-file rows -> catalog-level
assertions -> cross references. Do not use Epic 18 as an excuse to rewrite
`validation.ts`.

## 6. Golden Run tuning targets

These are calibration targets, not promises that one tiny manual sample proves
statistical significance. Record enough repeated seeded runs to justify changes.

| Window / metric | Target |
| --- | --- |
| 0:00 | Scrap Tabby + Scrap Pistol I; immediate readable combat |
| First level-up | usually ~15–30s |
| First duplicate weapon | existing guaranteed/pity path at 20–40s |
| First merge | normally achievable by ~45–60s without cheats |
| Rusher pressure | still begins around 60s |
| Second weapon family | usually acquired by ~75–120s |
| Brute pressure | still begins around 150s |
| Upgrade selections | roughly 8–12 choices in a successful 300s run; tune from evidence |
| Weapon rewards | usually 4–6 issued/collected over a successful run, including the guaranteed duplicate |
| Full-rack frustration | blocked pickup is exceptional, not the dominant reward state; repeated long-lived blocks are a tuning failure |
| Final rack | typically 3–5 occupied slots after merges, at least one T2+ path explored; T3 is exciting rather than guaranteed |
| Build diversity | successful runs normally finish with >=5 distinct chosen upgrade IDs and a describable build direction |
| Offer readability | 4 cards remain readable and quickly selectable at 390×844; 5-card support stays functional |
| 4:30–5:00 | densest/most threatening minute while remaining readable/performance-safe |
| 5:00 | build feels materially stronger than 0:00 and another seed/build is attractive |

If 8–12 upgrade choices makes the final minute too interruption-heavy, tune XP
cadence before reducing chooser clarity. Level-up pauses must remain short,
legible decisions rather than constant modal churn.

## 7. File ownership map for runtime implementation

Expected files (exact additions may vary only when nearby code proves a better
home):

```text
src/systems/types.ts
  RunUpgradeEffect, UpgradePresentation, UpgradeDefinition extension

src/gameplay/stats.ts
  weapon-behaviour stat key + optional Modifier scope + resolveWeapon()

src/gameplay/upgrades.ts
  scope validation at apply boundary, family-aware eligibility, existing offer/apply semantics

src/gameplay/weaponStats.ts
  weapon-aware resolution for global + matching-family effects

src/systems/UpgradeSystem.ts
  authoritative UpgradeCardReadModel snapshots; deep-freeze/clone new nested fields

src/ui/upgradeChooserController.ts
  consume read models; 1–5 optional numeric shortcut; token flow unchanged

src/ui/UpgradeChooser.ts
  icon + category/family/stack presentation; generic focus/confirm seam

src/ui/upgradeChooserLayout.ts
  responsive 1–5-card layout; default production count is not encoded here

src/engine/config.ts
  gameplay.upgrades.offerCount = 4; later evidence-backed pacing values

src/data/upgrades.json
  18-card catalog above

src/data/visual-art.json
  required upgrade-icon bindings

assets-src/ + docs/art/scripts/ + public/assets/
  deterministic placeholder icon source/build/export chain

src/systems/validation.ts
  presentation/scope/stat/cross-reference validation without descriptor rewrite

src/systems/playtestSummary.ts (or a small pure helper used by it)
  dev-only Epic 18 pacing evidence

src/data/spawn-curves.json / enemies.json / loot-tables.json
src/gameplay/xp.ts / src/engine/config.ts
  tune only where the recorded playtest slice justifies a value change

docs/tuning/epic-18-golden-run.md
  evidence log created during tuning, not in the architecture PR
```

`GameScene` may wire `offerCount`, inject `VisualArtLookup`, and expose the
existing run owners. It must not gain upgrade-ID/family/pacing rule branches.

## 8. Ordered runtime slices

### Slice 1 — Core run-upgrade contracts and scoped resolution

- split `RunUpgradeEffect` from legacy `UpgradeEffect`;
- add optional weapon-family modifier scope;
- add `pierce` / `spreadDeg` as run-upgrade weapon behaviour keys without
  widening meta/passive data;
- add `resolveWeapon()` and update `weaponStats.ts`;
- add family-derived offer eligibility;
- preserve transactional `applyCard()` and stable source IDs.

Gate:

- all pre-Epic-18 upgrade/meta/passive tests still pass;
- unscoped modifiers produce byte-for-byte-equivalent resolved results;
- scoped modifiers affect only the matching family;
- global + scoped add/mult ordering is pinned;
- pierce/projectileCount floors and spread non-negativity are pinned;
- no `GameScene` content branching.

### Slice 2 — Catalog, validation, and placeholder icon pipeline

- add presentation metadata contract;
- ship the exact 18-card first-pass catalog;
- add `upgrade-icon` art kind and one required binding per card;
- generate deterministic placeholder assets through the existing art pipeline;
- add family/icon cross-reference validation.

Gate:

- all 18 IDs unique and valid;
- the three existing definitions retain their old gameplay values;
- every icon resolves to one required `upgrade-icon` binding;
- malformed category/icon/scope/family/stat cases fail in the owning validator;
- `npm run art:validate` passes.

### Slice 3 — Four-choice chooser and authoritative stack presentation

- explicit production offer count 4;
- immutable `UpgradeCardReadModel` snapshot;
- chooser displays icon, name, rarity, category/family cue, and
  `current/max -> next/max` stack state;
- layout supports 1–5 cards at portrait/landscape/desktop;
- neutral instruction copy;
- touch direct-select, keyboard focus+confirm, optional 1–5 shortcuts all reach
  the same `offerId` command;
- expose focus/confirm entry points Epic 19 can drive later.

Gate:

- stale token / double-submit / re-entrant listener tests remain green;
- maxed cards excluded;
- family cards enter the eligible pool only when that family is equipped;
- no choice-count constant of 3 remains in command/layout/instruction logic;
- 390×844 physical text/touch targets remain readable;
- resize/rebuild retains the offer token and stack read model safely.

### Slice 4 — Instrumentation and Golden Run tuning

- extend dev-only playtest metrics;
- create `docs/tuning/epic-18-golden-run.md`;
- run repeated seeded Golden Runs;
- tune existing weapon-reward, XP, loot, and spawn-curve values against §6;
- make one change at a time where practical and record before/after evidence.

Gate:

- no new RNG stream unless a genuinely new random subsystem appears;
- no spawn-phase engine unless this architecture is explicitly amended;
- current first guaranteed duplicate remains 20–40s unless evidence shows a
  product-level reason to change the frozen Epic 14 teaching beat;
- tuning records explain every accepted balance change.

### Slice 5 — Golden Run closeout and independent re-review

- full player-experience matrix against issue #77;
- fresh/repeated seeds exercising different build paths;
- portrait + desktop chooser/rack/combat smoke;
- reduced-motion regression;
- late-wave performance/readability pass;
- independent orthogonal review across upgrade ownership, modifier scope,
  determinism, UI, lifecycle, validation, and pacing;
- fix material findings before declaring the epic complete.

Gate:

- full suite green;
- at least two independently shuffled full-suite reruns green;
- lint/build/art validation/diff check clean;
- no known player-facing gate from issue #77 is represented only by an
  unverified assumption.

## 9. Automated acceptance matrix

### Upgrade rules

- 18 definitions validate; IDs are stable/unique.
- Existing three definitions retain gameplay values.
- Offer generation is deterministic and without replacement within an offer.
- Default offer count is exactly 4; helpers/layout support 1–5.
- Maxed cards are never offered.
- Family-scoped cards require a currently equipped matching family.
- A second card can reuse the same family scope/stat primitive with data only.
- Applying multi-effect/scoped cards is transactional and rollback-safe.

### Modifier / combat integration

- unscoped modifier behavior remains unchanged.
- scoped effects never alter another family.
- global and matching-family effects compose in deterministic add-then-mult
  order.
- `pierce` uses the existing projectile hit semantics; no parallel pierce
  implementation exists.
- `spreadDeg` and `projectileCount` continue through the existing projectile
  direction path; no card-ID special cases exist.
- worst-case shipped stack combinations remain finite and performance-safe.

### Read model / chooser

- read model reports owned/current/max/next correctly.
- UI cannot mutate or infer stack truth.
- `card:offered` order must match the authoritative snapshot exactly.
- stale offer IDs, duplicate submits, key repeat, pointer double-fire, and
  re-entrant listeners cannot choose twice.
- resize keeps the current offer/read model or fails/retries cleanly.
- number-key shortcuts accept only visible 1–5 indices and remain optional.

### Assets / validation

- every shipped card has one required `upgrade-icon` binding.
- missing/wrong-kind icon references fail before gameplay.
- placeholder source/export chains pass the existing deterministic art checks.
- Boot uses the ordinary manifest preload path with no Epic 18 special case.

### Pacing / determinism

- seeded spawn, loot, upgrade, and weapon-reward streams remain independent.
- tuning changes do not introduce `Math.random()` or presentation RNG into
  gameplay.
- coarse deltas/pause do not advance weapon rewards or run-time pacing.
- representative seeded regression fixtures pin the intended Epic 18 baseline
  without snapshotting every frame.

## 10. Player-experience matrix

At 390×844 and desktop, across repeated fresh Golden Runs:

- choices no longer look like the same three cards cycling forever;
- four choices are readable quickly without opening another details panel;
- every card has a recognizable placeholder icon;
- owned/current/max stacks are obvious without relying only on color;
- family cards appear after the player actually owns that family and create a
  clear reason to lean into it;
- two runs with the same character can produce visibly different weapon/build
  outcomes;
- the first merge is reliably learnable early, while later merges require real
  reward/build decisions;
- the Rusher and Brute beats materially change movement pressure;
- the final minute is denser/more dangerous and the completed build is visibly
  stronger than the opening minute;
- full-rack blocked pickups are understandable and not the dominant experience;
- the player can explain what their build was trying to do and has a plausible
  different build to try next.

Epic 18 is not complete merely because the 18 cards exist. It completes when
the five-minute run demonstrates meaningful build experimentation and pacing.

## 11. Reviewer traps

- **Do not rename** `quick-paws`, `extra-scrap`, or `hot-barrel`.
- **Do not** make `UpgradeEffect` for meta/passive content understand
  weapon-family scope or Epic 18-only behaviour keys.
- **Do not** ship armor/crit/recovery/conditional cards without an authoritative
  gameplay consumer.
- **Do not** create a generic effect scripting engine. `pierce`, count, and
  spread already have authoritative semantics.
- **Do not** branch on upgrade IDs/family IDs in `GameScene`, `WeaponSystem`, or
  Phaser views.
- **Do not** add a separate family eligibility field when scope already states
  the family requirement.
- **Do not** make number keys the chooser architecture; they are shortcuts.
- **Do not** pull gamepad mappings/unified `GameAction` into Epic 18.
- **Do not** add a custom asset loader for cards; use `visual-art.json`.
- **Do not** add save fields for temporary cards.
- **Do not** implement persistent Gunsmith parts/traits here.
- **Do not** add a new spawn phase system simply to make 4:30–5:00 harder.
- **Do not** tune several economy/spawn/XP knobs simultaneously without a
  recorded reason; otherwise the result cannot be attributed or reproduced.
- **Do not** claim the player-experience gate from automated tests alone.

## 12. Pre-commit orthogonal architecture review

This architecture was reviewed against independent axes **before the first
commit on the architecture branch**. The review changed the design in the
following material ways:

| Axis | Finding | Correction incorporated above |
| --- | --- | --- |
| Compatibility / IDs | An early draft renamed `extra-scrap`. Shipped IDs are stable contracts. | Preserve all three existing IDs and first-pass gameplay values. |
| Gameplay truth | The issue suggests armour/crit/recovery directions, but live Alpha 2 has no authoritative armor/crit/recovery consumer. | Exclude those cards; only allow live stats plus `pierce`/`spreadDeg`. |
| Type ownership | Widening shared `UpgradeEffect` would leak run-only scope/behaviour into meta upgrades and character passives. | Add a separate `RunUpgradeEffect`; legacy effects remain narrow. |
| UI / input | Five default cards risks phone readability and a 2D-grid/nav design would prematurely own Epic 19 input semantics. | Default to four, support 1–5, keep a simple focus/confirm seam. |
| Determinism | Anti-repeat logic would add hidden offer history and alter RNG consumption before evidence exists. | Keep weighted without-replacement baseline; measure cross-offer overlap first. |
| Spawn architecture | A bespoke final-minute phase system would duplicate future Stage/Encounter ownership and current spawn director. | Tune existing cadence/caps/scaling first; architecture amendment required for new temporal primitives. |
| Performance | Naive family filtering in every stat resolution could allocate in the weapon hot path. | `resolveWeapon()` uses inline scope checks and existing loops, no filtered allocations. |
| Persistence / Alpha 3 | A new eligibility/unlock grammar could conflict with #92's future shared condition vocabulary. | Family eligibility is derived only from current run scope; no durable condition syntax. |
| Epic boundaries | Final build summary/controller integration would overlap Epic 19. | Keep only dev tuning evidence + chooser seam; final UX/controller stays Epic 19. |
| Gunsmith boundary | Treating scoped run modifiers as the persistent part contract would over-commit Epic 23. | Scoped modifier state is explicitly run-only; Epic 23 may reuse semantics, not ownership. |

No unresolved material architecture finding remained after those corrections.

## 13. Implementation-agent handoff

Implementation agents should work one slice at a time from current `main` after
this architecture PR merges.

For every slice:

1. re-read this document plus the immediately-owned source/tests;
2. do not redesign frozen decisions unless live evidence contradicts them;
3. implement the smallest coherent slice;
4. add focused negative/adversarial regression tests, not only happy paths;
5. run focused tests, then full tests, lint, build, relevant art validation, and
   `git diff --check`;
6. review the diff specifically for `GameScene` rule leakage, ID branches,
   duplicated stack/eligibility truth, RNG coupling, and listener/lifecycle
   regressions;
7. record tuning evidence only in the tuning slice, never as unexplained magic
   constants in architecture prose.

A lower-tier implementation agent should not need to decide card IDs, effect
scope semantics, default choice count, icon ownership, family eligibility,
input ownership, or pacing-system ownership; those decisions are frozen here.
