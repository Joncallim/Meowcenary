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
  already authoritative weapon semantics;
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
- Existing weapon data already has authoritative semantics for `pierce`,
  `projectileCount`, and `spreadDeg`; Epic 17 explicitly reused those facts for
  weapon identity. Epic 18 extends the one weapon-stat resolution path rather
  than creating card-only combat behavior.
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
- `offerCards()` currently receives only stack state, so family eligibility has
  no narrow authoritative rack input.
- `UpgradeOfferSnapshot` exposes definitions but not owned/current/max stacks,
  and it is re-created on every getter call rather than frozen once per offer.
- `UpgradeChooser` copy and number shortcuts are hard-coded to three choices.
- `upgradeChooserLayout.ts` clamps the choice count to three.
- upgrade definitions have no presentation metadata or icon reference.
- `WeaponRewardSystem` snapshots pickup separation at construction. A maxed
  `scrap-magnet` raises the live pickup radius above the current 64px cardinal
  reward offset, so scheduled rewards can otherwise spawn inside the new
  collection radius and auto-collect instead of remaining physical pickups.
- the dev playtest summary lacks first-merge, offer-repeat, scheduled-reward,
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

### D2 — Four choices is the Alpha 2 default; the presentation boundary is 1–5

Production passes an explicit `offerCount: 4` from
`RuntimeConfig.gameplay.upgrades` into `UpgradeSystem`.

Keep `offerCards()` itself generic for any positive count and keep its existing
three-card fallback for direct/helper callers. Production must not rely on that
fallback. This preserves the current pure-helper contract while moving Alpha 2
product behavior to explicit runtime configuration.

`UpgradeSystem`, however, is the presentation-facing boundary. When
`offerCount` is supplied, require a safe integer in **1..5** and fail fast on
0, fractions, `NaN`, or values above 5 rather than silently clamping/flooring.
An omitted `offerCount` retains the current three-card compatibility behavior.
This prevents an authoritative six-card offer from being created when the
chooser is intentionally only specified for five visible choices.

The chooser/layout must render 1–5 choices without a `Math.min(3, ...)` clamp.
Five is supported for future tuning, but four is the default because it leaves
enough vertical room at 390×844 for an icon, name/rarity, stack state, and
readable description.

Do not build a special anti-repeat/history algorithm in this epic. The 18-card
pool, max-stack eligibility, family eligibility, rarity weighting, and
without-replacement draw are the baseline. Measure cross-offer repetition in
Slice 4; add suppression only through an architecture amendment if evidence
shows it is materially needed.

### D3 — Split legacy/base effects from Epic 18 run-upgrade effects

Do **not** widen the existing `UpgradeEffect` contract used by meta upgrades and
character static passives.

Keep `STAT_KEYS` as the legacy/base stat vocabulary. Add domain-specific,
runtime-backed allowlists in `gameplay/stats.ts` and derive their TypeScript
unions from the arrays so validation and type ownership cannot drift:

```ts
// Existing contract remains the base/permanent/passive shape.
interface UpgradeEffect {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
}

export const WEAPON_BEHAVIOR_STAT_KEYS = ['pierce', 'spreadDeg'] as const;
export type WeaponBehaviorStatKey = (typeof WEAPON_BEHAVIOR_STAT_KEYS)[number];

// Runtime Modifier must still carry legacy StatKey values such as armor/crit
// for existing meta/passive callers, even though run cards may not ship them.
export type ModifierStatKey = StatKey | WeaponBehaviorStatKey;

export const WEAPON_MODIFIER_STAT_KEYS = [
  'damage',
  'attackSpeed',
  'projectileSpeed',
  'projectileCount',
  'range',
  'pierce',
  'spreadDeg',
] as const satisfies readonly ModifierStatKey[];
export type WeaponModifierStatKey = (typeof WEAPON_MODIFIER_STAT_KEYS)[number];

export const RUN_UPGRADE_STAT_KEYS = [
  'moveSpeed',
  'maxHealth',
  ...WEAPON_MODIFIER_STAT_KEYS,
  'pickupRadius',
  'xpGain',
  'currencyGain',
] as const satisfies readonly ModifierStatKey[];
export type RunUpgradeStatKey = (typeof RUN_UPGRADE_STAT_KEYS)[number];

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

`RunUpgradeStatKey` is deliberately **not** `StatKey | WeaponBehaviorStatKey`:
that broad union would make dormant `armor` / `critChance` values compile as
valid run-card data even though the validator later rejects them. The narrowed
union is the type-level version of the live Alpha 2 contract.

Do not create a TypeScript union for weapon-family names. `family` remains the
catalog string used by `WeaponDefinition`/`WeaponInstance`; cross-reference
validation derives the set from the validated `weapons.json` rows. In
particular, `DEFAULT_WEAPON_FAMILIES` remains the starter-family invariant, not
the authority for every family that future data may contain.

### D4 — One modifier stack; preserve existing two-pass resolution semantics

Extend runtime `Modifier` with the optional `WeaponFamilyScope` and change its
stat field to `ModifierStatKey`. `ModifierStack.add()` must defensively copy the
nested scope (when present) rather than retaining a caller-owned mutable object.
Do not build a second stack for family effects.

Keep the current `resolve(stat: StatKey, base)` semantics for **unscoped
modifiers only**. Add a weapon-aware resolver whose type cannot accept player or
economy-only run stats:

```ts
resolveWeapon(stat: WeaponModifierStatKey, base: number, family: string): number
```

`resolveWeapon()` preserves the current algorithm rather than inventing a new
four-tier ordering:

1. one additive pass through modifier insertion order, applying an entry when
   `entry.stat === stat` and its scope is absent or matches `family`;
2. one multiplicative pass through modifier insertion order with the same
   scope predicate.

A scoped modifier for another family is ignored. This gives the exact existing
add-then-multiply behavior for unscoped data, preserves insertion ordering
within each operation, and only adds a scope predicate. Implement it with
ordinary loops; do not allocate filtered arrays/maps in the per-shot hot path.

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
- non-finite effective values fail closed through the existing weapon validity
  checks rather than propagating into cadence/projectile math.

No weapon ID/tier branches are allowed.

### D5 — Only authoritative, currently-used stats may appear on cards

Run-upgrade validation uses `RUN_UPGRADE_STAT_KEYS` and accepts only stats with
a live authoritative consumer in Alpha 2:

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

Run-card effect validation is fail-closed:

- `mult` values must be finite and **> 0**; sub-1 trade-off multipliers are
  intentionally valid;
- `add` values must be finite;
- repeated application through `maxStacks` must remain finite (`value *
  maxStacks` for add, `value ** maxStacks` for mult);
- malformed/unknown scope fields fail at the run-upgrade validator and at the
  direct `applyCard()` structural boundary;
- direct `applyCard()` does not re-run catalog/art cross-references.

Scoped effects are valid only for `WEAPON_MODIFIER_STAT_KEYS` and only when the
upgrade targets `weapon`. Every scoped effect in one upgrade must reference the
same family. The family must exist in the **validated weapon catalog**. Do not
validate scope against `DEFAULT_WEAPON_FAMILIES`.

### D6 — Family-card eligibility is pure, offer-time state derived from scope

Do not introduce an Epic 18-specific condition language or pass the whole
`RunState` into the pure offer helper.

Freeze the minimum offer context:

```ts
interface UpgradeOfferContext {
  readonly stacks: Readonly<Record<string, number>>;
  readonly equipped: readonly WeaponInstance[];
}

function offerCards(
  definitions: readonly UpgradeDefinition[],
  context: UpgradeOfferContext,
  rng: Rng,
  count?: number,
): UpgradeDefinition[];
```

An upgrade with no scope is eligible when it is below `maxStacks`. An upgrade
containing `scope: {kind:'weapon-family', family:F}` is additionally eligible
only when `context.equipped.some((weapon) => weapon.family === F)` at offer
generation time.

`UpgradeSystem` passes `runState.upgradeStacks` and `runState.equipped` directly
as read-only context. Do not cache a family set across offers, and do not add a
parallel `requiresWeaponFamily` field.

An already-generated offer is immutable. If the rack changes later, the offer
is still valid; a scoped modifier can safely remain latent when no matching
weapon is present. For that reason `applyCard()` validates scope structure but
**must not re-check current family ownership** after the authoritative offer has
already been created.

RNG isolation means **consumption isolation**, not state blindness. `offerCards`
consumes only the `upgrades` stream, but its eligible pool may legitimately
change when the authoritative rack changes due to loot/weapon-reward outcomes.
Tests must compare RNG independence with equal stack/rack state, not require
identical offers across intentionally different rack states.

### D7 — Freeze one authoritative card read model when an offer becomes active

The chooser does not consume raw upgrade definitions. `UpgradeSystem` builds a
read model once, at active-offer creation, from the selected canonical
definitions + safe `RunState.upgradeStacks` reads:

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

`currentStacks` is read through the same safe stack logic used for eligibility;
`owned === currentStacks > 0`; an offered card always has
`nextStack === currentStacks + 1 <= maxStacks`. `family` is derived from the
single validated scope family, never copied from parallel metadata.

The active offer stores both:

- the canonical definitions needed by `chooseCard()` / `applyCard()`; and
- one runtime-frozen `UpgradeOfferSnapshot` built before `card:offered` emits.

`currentOfferSnapshot` returns that stored snapshot (or a defensive immutable
copy of that same snapshot); it does **not** recompute stack state on each getter
call. Derive the `card:offered.choices` ordered ID list from the stored snapshot
so the event and snapshot cannot diverge under a synchronous/re-entrant
listener.

Keep the existing `currentOffer` defensive-definition getter as a compatibility
and test/diagnostic surface for this epic; it is no longer the chooser's source
of truth. Its clone path must include new nested `effects[].scope` and
`presentation` data.

Canonical definition capture must also copy/freeze `presentation`, each effect,
and each nested effect scope. A caller mutating the definitions object supplied
to `UpgradeSystem` after construction must not be able to retarget a family,
change an icon/category, or alter an active/applied modifier.

Keep the existing `card:offered` event payload (`offerId` + ordered choice IDs)
and `card:chosen` event. Do not add a second presentation event. The chooser
continues to match event IDs against the authoritative snapshot before
rendering and sends `chooseCard(offerId, upgradeId)` through the existing token
path.

Descriptions are per-stack player-facing copy, so `current/max -> next/max` plus
the description explains the incremental choice without exposing raw modifier
objects to Phaser.

### D8 — Upgrade icons use the existing visual-art manifest and stable identity

Add `upgrade-icon` to `VisualArtKind` / validation.

For every shipped upgrade, validation requires the exact identity relation:

```text
presentation.iconArtId === upgrade-icon:<upgrade-id>
```

and exactly one matching **required** `visual-art.json` image binding of kind
`upgrade-icon`. An upgrade may not point at another card's otherwise-valid icon;
this preserves stable replacement IDs and a one-card/one-icon contract.

Placeholder exports are simple readable motifs at phone scale and use the
existing deterministic asset-source/builder/export validation pipeline.
Suggested export size is 48×48 with a 36–40 logical-pixel display size inside
the card.

Boot preload remains generic because it already loads every manifest binding.
`UpgradeChooser` receives a `VisualArtLookup`; it never constructs paths from
upgrade IDs and never loads textures ad hoc.

Final art replaces the placeholder export behind the same art ID / texture key;
no gameplay definition ID or chooser command changes.

### D9 — Epic 18 leaves a narrow, public navigation/confirm seam for Epic 19

The chooser interaction remains:

```text
Touch/pointer -> direct visible-card select -> authoritative token command
Keyboard      -> focus previous/next + confirm -> same command
Number keys   -> optional 1–5 shortcut -> same command
Epic 19       -> logical nav/confirm actions -> same public focus/confirm seam
```

Expose the seam on the `UpgradeChooser` facade rather than requiring Epic 19 to
reach into a Phaser view implementation. The exact public operations are:

```ts
focusPrevious(): void;
focusNext(): void;
confirmFocused(): boolean;
```

The raw keyboard handler calls those same operations. `confirmFocused()` routes
through the same controller/token command and returns whether submission was
accepted. Do not define the repository-wide `GameAction` type, gamepad
mappings, active-input-source state, or controller lifecycle here; those belong
to Epic 19.

The player-facing instruction must not enumerate `1, 2, or 3`. Use neutral copy
such as `Choose an upgrade` / `Tap a card or use navigation + confirm`.

Focus state is presentation-only. Touching a card may move visible focus to that
card, but eligibility and selection ownership remain entirely in
`UpgradeSystem`.

Layout content priority is frozen so 4/5-card modes do not solve fit problems by
hiding authoritative information:

1. icon + name;
2. current/max -> next/max stack state;
3. rarity plus category/family cue;
4. description.

Use a compact **left icon + right text** card composition so imagery does not
consume a separate vertical band. Four-card 390×844 mode must keep a readable
description. Five-card mode may reduce the description to one wrapped line, but
must not hide icon/name/stack state or create a card smaller than a practical
touch target. One through three choices may use additional whitespace; do not
encode the default count in the layout helper.

### D10 — Pacing uses existing owners; pickup-radius rewards track live run state

Epic 18 may tune:

- `spawn-curves.json`: `spawnEveryMs`, `maxAlive`, and scaling;
- enemy `xpValue` / `scrapValue` only when playtest evidence requires it;
- `xp.ts` curve constants only when level cadence is globally wrong;
- `RuntimeConfig.gameplay.weaponRewards` timing;
- loot-table weights/amounts where reward tempo requires it.

Do **not** add a stage/objective system, a second spawn director, a phase script,
or per-minute content-ID branches to create a climax. The current Rusher start
at ~60s and Brute start at ~150s remain the intended structural beats.

The new `scrap-magnet` card creates one required integration change in the
existing weapon-reward owner. `DropSystem` resolves live `pickupRadius` every
update, while `WeaponRewardSystem` currently snapshots its minimum player
separation at construction. Replace that snapshot with the base pickup-radius
input and resolve the **current** effective pickup radius when each scheduled
reward is placed:

```text
minSeparation = max(
  runState.stats.resolve('pickupRadius', basePickupRadius),
  PLAYER_BODY_RADIUS + dropRadius
)
```

This calculation is placement-only and consumes no RNG. Reward deadline and
reward-definition draws remain exactly on the `weapon-rewards` stream. With the
shipped max four stacks of `scrap-magnet`, the current 64px cardinal candidate
may be rejected and the existing deterministic diagonal/fallback search may be
used; the reward must still enter the ordinary physical drop path.

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
- **scheduled weapon rewards successfully issued**;
- final rack definition/family/tier distribution;
- existing outcome/time/level/kills/currency/average DPS.

Do not infer scheduled issuance from `weapon:acquired`: ordinary loot can also
acquire weapons, and an issued physical reward may remain uncollected. Keep
`WeaponRewardSystem`'s gameplay event surface unchanged; expose a narrow
read-only `issuedCount` diagnostic (incremented only after `spawnDrop` is
called successfully) and inject that source into the dev-only playtest summary.
No gameplay event, analytics SDK, save field, networking, or production-player
dependency is added solely for telemetry.

Use existing bus events and `runState.timeMs` for the remaining measurements.
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
2. add `RUN_UPGRADE_EFFECT_FIELDS = {stat, op, value, scope}` and a strict
   `{kind, family}` scope-field set; leave legacy `UPGRADE_EFFECT_FIELDS`
   unchanged for meta/passive data;
3. validate category enum and require
   `presentation.iconArtId === "upgrade-icon:" + upgrade.id`;
4. make `checkUpgrade()` call the run-upgrade effect validator using
   `RUN_UPGRADE_STAT_KEYS`; keep `checkMetaUpgrade()` and character-static
   passive validation on the legacy unscoped `UpgradeEffect` + `STAT_KEYS`;
5. enforce the D5 value/aggregate rules, reject scoped non-weapon stats, reject
   scope on a non-`weapon` target, and reject more than one distinct scoped
   family in one upgrade;
6. extend `VISUAL_ART_KINDS` with `upgrade-icon`;
7. cross-reference scoped family names against the set derived from validated
   `weapons` rows, not `DEFAULT_WEAPON_FAMILIES`;
8. cross-reference `presentation.iconArtId` against exactly one
   `visual-art.json` binding of kind `upgrade-icon` and require that binding to
   be `required: true`;
9. preserve descriptor order and existing error message/order guarantees for
   previously valid/invalid data paths.

The aggregate validation phase remains:

```text
root -> per-file rows -> catalog-level assertions -> cross references
```

Existing cross-reference first-error order is already a compatibility surface.
Append the two new assertions **after** the current
`assertArenaVisualReferences(...)` call in both `validateGameData()` and
`collectGameDataErrors()`:

```ts
assertUpgradeWeaponFamilyReferences(upgrades, weapons);
assertUpgradeArtReferences(upgrades, visualArt);
```

Do not insert them ahead of existing spawn/character/loot/audio/art assertions;
otherwise a multi-error input that already has a frozen first failure can start
throwing a different error merely because Epic 18 exists. `collectGameDataErrors`
must pull the validated `upgrades` catalog into its cross-reference phase and
use the same appended order as boot.

Do not use Epic 18 as an excuse to rewrite `validation.ts` or bypass the
descriptor-derived root/collector machinery.

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
| Scheduled weapon rewards | usually 4–6 successfully issued over a successful run, including the guaranteed duplicate; acquisitions/blocks are reported separately |
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
src/gameplay/stats.ts
  ModifierStatKey / run-card and weapon-stat allowlists
  optional Modifier scope + allocation-free resolveWeapon()

src/systems/types.ts
  RunUpgradeEffect, UpgradePresentation, UpgradeDefinition extension

src/gameplay/upgrades.ts
  UpgradeOfferContext, family-aware eligibility, structural scope validation
  existing transactional offer/apply semantics and stable source IDs

src/gameplay/weaponStats.ts
  weapon-aware resolution for global + matching-family effects

src/systems/UpgradeSystem.ts
  1..5 presentation-boundary validation
  one frozen UpgradeCardReadModel snapshot per active offer
  compatibility currentOffer defensive clone; deep clone/freeze nested scope/presentation

src/ui/upgradeChooserController.ts
  consume read models; 1–5 optional numeric shortcut; token flow unchanged

src/ui/UpgradeChooser.ts
  icon + category/family/stack presentation
  public focusPrevious/focusNext/confirmFocused facade seam

src/ui/upgradeChooserLayout.ts
  responsive 1–5-card layout and content-priority fields
  default production count is not encoded here

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
  new cross-references appended after existing cross-reference order

src/systems/WeaponRewardSystem.ts
  resolve live pickup radius at each placement; read-only issuedCount diagnostic

src/systems/playtestSummary.ts (or a small pure helper used by it)
  dev-only Epic 18 pacing evidence; optional narrow WeaponReward diagnostics source

src/data/spawn-curves.json / enemies.json / loot-tables.json
src/gameplay/xp.ts / src/engine/config.ts
  tune only where the recorded playtest slice justifies a value change

docs/tuning/epic-18-golden-run.md
  evidence log created during tuning, not in the architecture PR
```

`GameScene` may wire `offerCount`, inject `VisualArtLookup`, and pass the narrow
dev-only weapon-reward diagnostic source to `PlaytestSummarySystem`. It must not
gain upgrade-ID/family/pacing rule branches.

## 8. Ordered runtime slices

### Slice 1 — Core run-upgrade contracts and scoped resolution

- split `RunUpgradeEffect` from legacy `UpgradeEffect`;
- add narrowed run/weapon modifier stat allowlists derived from runtime arrays;
- add optional weapon-family modifier scope;
- add `pierce` / `spreadDeg` as run-upgrade weapon behaviour keys without
  widening meta/passive data;
- add `resolveWeapon()` with the existing two-pass insertion-order semantics and
  update `weaponStats.ts`;
- add minimum `UpgradeOfferContext` and family-derived offer eligibility;
- preserve transactional `applyCard()` and stable source IDs;
- make scheduled reward placement resolve the live pickup radius so
  `scrap-magnet` cannot invalidate the physical-pickup separation contract.

Gate:

- all pre-Epic-18 upgrade/meta/passive tests still pass;
- direct/helper `offerCards()` retains its legacy three-card fallback while
  production can explicitly request four;
- unscoped `resolveWeapon()` produces the same result as existing `resolve()`
  for every weapon-applicable `StatKey` under equivalent modifiers;
- scoped modifiers affect only the matching family;
- global + scoped modifiers preserve additive-pass then multiplicative-pass
  insertion order;
- `resolveWeapon()` cannot accept move/max-health/economy keys at its typed API;
- family eligibility is derived from the current rack for each offer and is not
  cached across offers;
- direct `applyCard()` remains rollback-safe and does not re-check family
  ownership after an offer is authoritative;
- max `scrap-magnet` placement remains outside the live collection radius
  without consuming an extra reward RNG draw;
- no `GameScene` content branching.

### Slice 2 — Catalog, validation, and placeholder icon pipeline

- add presentation metadata contract;
- ship the exact 18-card first-pass catalog;
- add `upgrade-icon` art kind and one required binding per card;
- generate deterministic placeholder assets through the existing art pipeline;
- add family/icon cross-reference validation at the appended ordering defined
  in §5.

Gate:

- all 18 IDs unique and valid;
- the three existing definitions retain their old gameplay values;
- every `iconArtId` is exactly `upgrade-icon:<upgrade-id>` and resolves to one
  required `upgrade-icon` binding;
- malformed category/icon/scope/family/stat/value cases fail in the owning
  validator;
- legacy meta/passive validation still rejects scope and behavior-only keys;
- existing validation first-error fixtures keep their prior first error;
- `npm run art:validate` passes.

### Slice 3 — Four-choice chooser and authoritative stack presentation

- add `RuntimeConfig.gameplay.upgrades.offerCount = 4` and pass it explicitly;
- validate supplied `UpgradeSystem.offerCount` as a safe integer 1..5;
- freeze one `UpgradeCardReadModel` snapshot when each offer becomes active;
- keep the existing defensive `currentOffer` compatibility getter but remove
  raw definitions from chooser ownership;
- chooser displays icon, name, rarity, category/family cue, and
  `current/max -> next/max` stack state;
- layout supports 1–5 cards at portrait/landscape/desktop with §D9 content
  priority;
- neutral instruction copy;
- touch direct-select, keyboard focus+confirm, optional 1–5 shortcuts all reach
  the same `offerId` command;
- expose public facade focus/confirm entry points Epic 19 can drive later.

Gate:

- stale token / double-submit / re-entrant listener tests remain green;
- maxed cards excluded;
- family cards enter the eligible pool only when that family is equipped at
  offer creation;
- supplied `offerCount` outside 1..5 fails before an unrenderable offer exists;
- no choice-count constant of 3 remains in command/layout/instruction logic
  except the intentional helper/facade compatibility fallback documented in
  D2;
- `card:offered` IDs are derived from and exactly match the stored snapshot;
- mutating caller-owned definitions/scope/presentation after construction cannot
  alter an active offer or applied modifier;
- 390×844 physical text/touch targets remain readable;
- resize/rebuild retains the same offer token and frozen stack read model safely.

### Slice 4 — Instrumentation and Golden Run tuning

- extend dev-only playtest metrics, including scheduled `issuedCount` distinct
  from acquisitions;
- create `docs/tuning/epic-18-golden-run.md`;
- run repeated seeded Golden Runs;
- tune existing weapon-reward, XP, loot, and spawn-curve values against §6;
- make one change at a time where practical and record before/after evidence;
- calculate the maximum shipped attack-rate/projectile fan-out after accepted
  card-number tuning and include it in the performance review.

Gate:

- no new RNG stream unless a genuinely new random subsystem appears;
- no spawn-phase engine unless this architecture is explicitly amended;
- current first guaranteed duplicate remains 20–40s unless evidence shows a
  product-level reason to change the frozen Epic 14 teaching beat;
- scheduled issued/acquired/blocked metrics are not conflated;
- tuning records explain every accepted balance change.

### Slice 5 — Golden Run closeout and independent re-review

- full player-experience matrix against issue #77;
- fresh/repeated seeds exercising different build paths;
- portrait + desktop chooser/rack/combat smoke;
- reduced-motion regression;
- late-wave performance/readability pass, including a deliberately extreme
  valid rack + maximum applicable card-stack stress case;
- independent orthogonal review across upgrade ownership, modifier scope,
  determinism, UI, lifecycle, validation, weapon-reward placement, and pacing;
- fix material findings before declaring the epic complete.

Gate:

- full suite green;
- at least two independently shuffled full-suite reruns green;
- lint/build/art validation/diff check clean;
- the extreme valid build does not create non-finite stats, an unbounded
  projectile-allocation failure, or a sustained late-wave performance collapse;
- no known player-facing gate from issue #77 is represented only by an
  unverified assumption.

## 9. Automated acceptance matrix

### Upgrade rules

- 18 definitions validate; IDs are stable/unique.
- Existing three definitions retain gameplay values.
- Offer generation is deterministic and without replacement within an offer.
- Production offer count is exactly 4; `UpgradeSystem` accepts only supplied
  safe integers 1..5; the pure helper's legacy omitted-count fallback stays 3.
- Maxed cards are never offered.
- Family-scoped cards require a currently equipped matching family at offer
  creation.
- Offer eligibility receives only stacks + equipped rack state, not whole
  `RunState` or cached family history.
- A second card can reuse the same family scope/stat primitive with data only.
- Applying multi-effect/scoped cards is transactional and rollback-safe.
- A valid already-active family offer remains selectable if the rack later
  stops containing that family; the resulting modifier is latent until a
  matching family is present.

### Modifier / combat integration

- legacy `resolve()` ignores scoped modifiers and otherwise remains unchanged.
- `resolveWeapon()` is typed only for weapon-applicable keys.
- unscoped `resolveWeapon()` behavior is equivalent to existing `resolve()` for
  the same weapon stat/modifier sequence.
- scoped effects never alter another family.
- global and matching-family effects compose in deterministic two-pass,
  insertion-order add-then-multiply semantics.
- caller mutation of an input scope object cannot retarget a stored modifier.
- `pierce` uses the existing projectile hit semantics; no parallel pierce
  implementation exists.
- `spreadDeg` and `projectileCount` continue through the existing projectile
  direction path; no card-ID special cases exist.
- max shipped stacks keep aggregate modifiers and effective weapon values
  finite; extreme valid fan-out is covered by closeout performance evidence.

### Read model / chooser

- read model reports owned/current/max/next correctly.
- one immutable snapshot is created per active offer and is not recomputed from
  mutable stack state on getter access.
- UI cannot mutate or infer stack truth and never parses effects.
- `card:offered` order is derived from and matches the authoritative snapshot
  exactly.
- stale offer IDs, duplicate submits, key repeat, pointer double-fire, and
  re-entrant listeners cannot choose twice.
- caller mutation of definitions/effects/scope/presentation cannot mutate
  canonical or active-offer state.
- resize keeps the current offer/read model or fails/retries cleanly.
- number-key shortcuts accept only visible 1–5 indices and remain optional.
- facade `focusPrevious` / `focusNext` / `confirmFocused` drive the same path as
  keyboard handling and are usable by a future logical action adapter.

### Assets / validation

- every shipped card has exactly `upgrade-icon:<upgrade-id>` as its icon ID.
- every shipped card resolves to one required `upgrade-icon` binding.
- pointing at another card's valid icon, a wrong-kind binding, optional binding,
  unknown family, malformed scope, dormant stat, or non-positive multiplier
  fails before gameplay.
- meta upgrades/static passives retain legacy unscoped validation.
- new upgrade cross-references are appended after all pre-Epic-18 cross refs so
  existing first-error ordering remains pinned.
- placeholder source/export chains pass the existing deterministic art checks.
- Boot uses the ordinary manifest preload path with no Epic 18 special case.

### Pacing / determinism

- seeded spawn, loot, upgrade, and weapon-reward **RNG consumption** remains
  stream-isolated; offer content may still legitimately differ when rack state
  differs.
- tuning changes do not introduce `Math.random()` or presentation RNG into
  gameplay.
- coarse deltas/pause do not advance weapon rewards or run-time pacing.
- scheduled reward placement uses current effective pickup radius, remains
  physical under max `scrap-magnet`, and consumes no additional reward RNG.
- scheduled reward `issuedCount`, weapon acquisitions, and blocked pickups are
  independently observable in dev evidence.
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
- `scrap-magnet` makes ordinary collection feel stronger without causing
  scheduled weapon rewards to silently skip the physical-pickup interaction;
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
- **Do not** type run-card stats as the broad `StatKey | WeaponBehaviorStatKey`;
  use the narrowed runtime-derived `RunUpgradeStatKey` allowlist.
- **Do not** let `resolveWeapon()` accept player/economy-only stat keys.
- **Do not** change add/mult ordering to an unscoped-before-scoped four-phase
  algorithm; preserve the existing two insertion-order passes with a scope
  predicate.
- **Do not** ship armor/crit/recovery/conditional cards without an authoritative
  gameplay consumer.
- **Do not** create a generic effect scripting engine. `pierce`, count, and
  spread already have authoritative semantics.
- **Do not** branch on upgrade IDs/family IDs in `GameScene`, `WeaponSystem`, or
  Phaser views.
- **Do not** use `DEFAULT_WEAPON_FAMILIES` as the family-scope cross-reference
  authority; derive families from the validated weapon catalog.
- **Do not** add a separate family eligibility field when scope already states
  the family requirement.
- **Do not** cache family eligibility across offers or re-check it during
  `applyCard()` after a valid offer already exists.
- **Do not** allow `UpgradeSystem` to create >5 visible choices even though the
  pure helper remains generic.
- **Do not** recompute active read models from mutable stack state on every
  getter; freeze them once per offer.
- **Do not** expose caller-owned nested scope/presentation objects as canonical
  active-offer state.
- **Do not** make number keys the chooser architecture; they are shortcuts.
- **Do not** make Epic 19 reach into a Phaser view for focus/confirm; expose the
  narrow chooser-facade seam now.
- **Do not** pull gamepad mappings/unified `GameAction` into Epic 18.
- **Do not** add a custom asset loader for cards; use `visual-art.json`.
- **Do not** permit a card to point at another card's icon just because that
  binding exists.
- **Do not** add save fields for temporary cards.
- **Do not** implement persistent Gunsmith parts/traits here.
- **Do not** leave scheduled reward separation snapshotted at run start after
  introducing a run-time `pickupRadius` card.
- **Do not** infer scheduled reward issuance from `weapon:acquired` telemetry.
- **Do not** insert new Epic 18 cross-reference checks ahead of the existing
  validation order.
- **Do not** add a new spawn phase system simply to make 4:30–5:00 harder.
- **Do not** tune several economy/spawn/XP knobs simultaneously without a
  recorded reason; otherwise the result cannot be attributed or reproduced.
- **Do not** claim RNG stream independence means offers ignore authoritative
  rack state.
- **Do not** claim the player-experience gate from automated tests alone.

## 12. Orthogonal architecture re-review

The original architecture was reviewed independently before its first commit.
PR #105 then received a second repository-grounded architecture pass against
current `main`. That re-review found additional cross-boundary risks and the
contract above incorporates them rather than leaving implementation agents to
resolve them ad hoc.

| Axis | Finding | Correction incorporated above |
| --- | --- | --- |
| Compatibility / IDs | An early draft renamed `extra-scrap`; current tests also expose a defensive `currentOffer` surface and a three-card helper fallback. | Preserve all three shipped IDs/values, keep `currentOffer` defensively compatible, and make four choices explicit production config instead of silently redefining the pure helper fallback. |
| Gameplay truth | The issue suggests armour/crit/recovery directions, but live Alpha 2 has no authoritative armor/crit/recovery consumer. | Exclude those cards and narrow `RunUpgradeStatKey` itself rather than relying only on runtime validation. |
| Type ownership | Widening shared `UpgradeEffect` would leak run-only scope/behaviour into meta upgrades and character passives; typing `resolveWeapon` with all run stats would also allow player/economy keys. | Add separate runtime-derived run/weapon allowlists and a weapon-only resolver key type. Legacy effects remain narrow. |
| Modifier semantics | The first PR draft described four resolution phases (global add, family add, global mult, family mult), which needlessly changes ordering from the existing stack algorithm. | Preserve the current two-pass insertion-order add-then-multiply algorithm and add only a scope predicate. |
| Offer boundary | `offerCards` currently has no rack input; passing whole `RunState` would over-couple the pure helper, while an unrestricted `UpgradeSystem.offerCount` could create six authoritative cards the UI cannot render. | Add minimum `{stacks, equipped}` offer context and fail fast on supplied system counts outside 1..5; keep the helper generic. |
| Snapshot / re-entrancy | Recomputing stack read models on getter access leaves event/snapshot consistency dependent on mutable state during synchronous listeners. | Build and freeze one read-model snapshot before `card:offered`; derive event IDs from that snapshot. |
| Mutation isolation | New `scope` and `presentation` fields are nested objects; existing shallow clone patterns would expose mutable aliases. | Explicitly copy/freeze nested definition fields and copy modifier scope on insertion. |
| Data validation | New family/icon cross refs could change frozen first-error order if inserted among existing assertions, and `DEFAULT_WEAPON_FAMILIES` is only a starter invariant. | Append Epic 18 cross refs after current cross refs in both boot/collector paths and derive scope families from validated weapon rows. |
| Asset identity | A mere “binding exists” check allows one card to reference another card's icon. | Require exact `upgrade-icon:<upgrade-id>` identity plus one required correct-kind binding. |
| Reward/pickup integration | `scrap-magnet ×1.25` at four stacks takes the 30px pickup radius above the current 64px cardinal scheduled-reward offset, while `WeaponRewardSystem` snapshots separation at construction. | Resolve live pickup radius at reward placement time, preserving deterministic placement and physical pickup semantics without consuming RNG. |
| Telemetry truth | `weapon:acquired` cannot distinguish scheduled reward issuance from ordinary loot and cannot count issued-but-uncollected rewards. | Add a narrow read-only `issuedCount` diagnostic; do not invent a gameplay event or fake the metric. |
| UI / input | Five default cards risks phone readability and a 2D-grid/nav design would prematurely own Epic 19 input semantics; an internal-only view method would also force Epic 19 to reach through presentation internals. | Default to four, support 1–5 with explicit content priority, and expose three narrow chooser-facade focus/confirm methods. |
| Determinism | Anti-repeat logic would add hidden offer history and alter RNG consumption before evidence exists; “independent streams” can also be misread as “offers ignore rack state.” | Keep weighted without-replacement baseline; define independence as RNG-consumption isolation while allowing legitimate authoritative-state coupling. |
| Spawn architecture | A bespoke final-minute phase system would duplicate future Stage/Encounter ownership and current spawn director. | Tune existing cadence/caps/scaling first; architecture amendment required for new temporal primitives. |
| Performance | Naive family filtering in every stat resolution could allocate in the weapon hot path, and the fixed catalog can compound attack rate/projectile count. | Inline scope predicates with no filtered allocations; calculate max shipped fan-out after tuning and include an extreme valid build in closeout performance evidence. |
| Persistence / Alpha 3 | A new eligibility/unlock grammar could conflict with #92's future shared condition vocabulary. | Family eligibility is derived only from current run scope; no durable condition syntax. |
| Epic boundaries | Final build summary/controller integration would overlap Epic 19. | Keep only dev tuning evidence + public chooser seam; final UX/controller stays Epic 19. |
| Gunsmith boundary | Treating scoped run modifiers as the persistent part contract would over-commit Epic 23. | Scoped modifier state is explicitly run-only; Epic 23 may reuse semantics, not ownership. |

No unresolved material architecture finding remains after these corrections.

## 13. Implementation-agent handoff

Implementation agents should work one slice at a time from current `main` after
this architecture PR merges.

For every slice:

1. re-read this document plus the immediately-owned source/tests;
2. re-inspect current `main` before coding; if live code contradicts this
   contract, stop and amend architecture rather than silently choosing a third
   design;
3. do not redesign frozen decisions unless live evidence contradicts them;
4. implement the smallest coherent slice;
5. add focused negative/adversarial regression tests, not only happy paths;
6. run focused tests, then full tests, lint, build, relevant art validation, and
   `git diff --check`;
7. review the diff specifically for `GameScene` rule leakage, ID branches,
   duplicated stack/eligibility truth, nested-mutation aliases, RNG coupling,
   validation-order drift, and listener/lifecycle regressions;
8. record tuning evidence only in the tuning slice, never as unexplained magic
   constants in architecture prose.

A lower-tier implementation agent should not need to decide card IDs, effect
scope semantics, run-vs-weapon stat vocabularies, resolver ordering, default
choice count, active-offer snapshot timing, icon ownership, family eligibility,
reward/pickup coupling, input ownership, validation ordering, or pacing-system
ownership; those decisions are frozen here.