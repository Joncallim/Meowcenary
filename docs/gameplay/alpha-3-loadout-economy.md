# Alpha 3 Loadout Economy — Fabrication, Set Identity and Acquisition

**Status:** reviewed V4 target. This is the product/gameplay authority for the persistent Loadout economy used by #170/#171 and the #167 art pass.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The problem this solves is larger than the current reward dump:

- Equipment has no acquisition path except direct owned-instance grants;
- Gunsmith has no fabrication path and most shipped Parts are unreachable in ordinary play;
- the legacy permanent-stat shop is being retired, so Scrap needs a concrete, satisfying purpose;
- complete sets are currently dumped into inventory because the player cannot choose which unlocked gear to make;
- Part definition `tier` and owned-instance `tier` use the same word for different concepts;
- merged Part multiplicative modifiers currently scale incorrectly.

The target loop is:

```text
complete Contract / milestone
        ↓
unlock a new Set or Part blueprint through authoritative progression facts
        ↓
choose what to fabricate with Scrap
        ↓
fit/equip it
        ↓
play a visibly different build
        ↓
upgrade / merge / infuse over later runs
```

Scrap becomes **agency over persistent build direction**, not a generic permanent-stat tax.

---

# 1. One source of truth for availability

Do not introduce a second “blueprint receipt” database when Stage/Boss/Achievement facts already exist.

## Equipment Sets

Each `EquipmentSetDefinition` owns one ordinary `ProgressionCondition`:

```ts
readonly unlock: ProgressionCondition;
```

Every piece in the Set becomes fabricable when that condition evaluates true.

Example:

```json
{
  "id": "set:commando",
  "name": "Commando",
  "unlock": { "type": "stage-cleared", "stageId": "stage:junkyard-01" },
  "pieceFabricationCost": 45,
  "...": "set bonuses and presentation"
}
```

The player does **not** also need `set:commando` in `progression.unlocks` merely to represent the same fact.

## Gun Parts

Keep the existing definition-owned `unlock?: ProgressionCondition` concept.

- absent / `always` = available from the start when fabricable;
- stage/boss/achievement/mastery condition = blueprint becomes available automatically when the authoritative fact exists;
- an unavailable definition does not require a separate reward token.

## Direct reward exceptions

A Contract/Boss/Achievement may still grant an actual owned instance when that physical item itself is the headline reward. That is separate from blueprint availability.

Examples retained as useful product moments:

- first Contract awards one actual Standard Barrel so the Gunsmith is tangible immediately;
- Scrap Crusher awards one actual Fire Trait Core;
- Forge Warden awards the reward-only Mastered Fire Trait Core.

Do not pair every actual instance with a duplicate “unlock” grant unless there is a distinct future fabrication reason.

---

# 2. Resolve the two-tier ambiguity

## 2.1 Owned Part tier is the real engineering tier

`PartInstance.tier` already has an explicit persisted meaning:

> per-owned-copy engineering tier produced by merging.

It remains.

```ts
interface PartInstance {
  partId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  infusedTraits: BehaviorTrait[];
}
```

## 2.2 Retire static `PartDefinition.tier`

The current `PartDefinition.tier` is not consumed by live effect resolution or merge rules. Rarity already describes the static blueprint grade.

Do **not** invent a new meaning for this unused field during fabrication.

V4 target:

```ts
interface PartDefinition {
  id: string;
  name: string;
  slot: PartSlot;
  rarity: Rarity;
  fabricationCost?: number;
  effects: ModifierSpec[];
  traits: BehaviorTrait[];
  unlock?: ProgressionCondition;
  rewardPoolId?: string;
  presentation: { iconArtId: string };
}
```

No definition `tier`.

## 2.3 Retire static `EquipmentDefinition.tier`

All current Equipment definitions are static catalog pieces while the owned instance carries the actual upgrade tier. The catalog-level `tier: 1` adds no product information.

V4 target removes it too.

```ts
interface EquipmentDefinition {
  id: string;
  name: string;
  setId: string;
  slot: EquipmentSlot;
  effects: ModifierSpec[];
  presentation: { iconArtId: string };
}
```

This leaves one meaning of “tier” per owned system.

---

# 3. Fix Part modifier tier scaling before fabrication

Current Gunsmith resolution does:

```ts
value = effect.value * ownedTier
```

for both additive and multiplicative modifiers.

That makes a 1.12× multiplier become **2.24× at tier 2**, which is not the Equipment tier semantics and will explode once duplicate fabrication makes merging common.

Use one shared pure helper for owned-tier scaling:

```ts
export function scaleModifierSpecForTier(spec: ModifierSpec, tier: number): ModifierSpec {
  const safeTier = clampOwnedTier(tier);
  return {
    ...spec,
    value: spec.op === 'mult'
      ? 1 + (spec.value - 1) * safeTier
      : spec.value * safeTier,
  };
}
```

Examples:

| Base effect | T1 | T2 | T3 |
| --- | ---: | ---: | ---: |
| +35 Range | +35 | +70 | +105 |
| 1.12× Damage | 1.12× | 1.24× | 1.36× |
| 0.94× Fire-rate modifier | 0.94× | 0.88× | 0.82× |

The last row intentionally scales the authored downside away from 1.0 by tier. Validation must reject a multiplier whose extrapolation becomes non-positive at any supported owned tier.

Equipment and Gunsmith use the same helper rather than maintaining two subtly different scaling formulas.

### Required regression

Pin Heavy Receiver (or a synthetic multiplicative Part) at T1/T2/T3 so this bug cannot return.

---

# 4. Equipment Set authoring model

## 4.1 Set-owned facts

```ts
export interface EquipmentSetThresholdBonus {
  readonly modifiers: readonly ModifierSpec[];
  /** Existing registered weapon behavior, never a set-ID branch. */
  readonly weaponTraits?: readonly BehaviorTrait[];
}

export interface EquipmentSetDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unlock: ProgressionCondition;
  readonly pieceFabricationCost: number;
  readonly presentation: { readonly emblemArtId: string };
  readonly setBonuses: Readonly<{
    2: EquipmentSetThresholdBonus;
    4: EquipmentSetThresholdBonus;
  }>;
}
```

No Set bonus or Set availability fact is stored on an arbitrary physical piece.

## 4.2 Equipment upgrade gates are global, not duplicated per Set

The current eight sets all carry the **same** tier-upgrade gates. Moving those identical conditions from the helmet/provider to every Set would remove one hidden convention while preserving 8× duplicated truth.

V4 therefore uses one equipment progression policy:

```ts
export interface EquipmentUpgradeRules {
  readonly unlocks: Readonly<{
    2: ProgressionCondition;
    3: ProgressionCondition;
    4: ProgressionCondition;
  }>;
}
```

Data target:

```json
{
  "unlocks": {
    "2": { "type": "stage-cleared", "stageId": "stage:junkyard-03" },
    "3": { "type": "boss-defeated", "bossId": "boss-crusher" },
    "4": { "type": "boss-defeated", "bossId": "boss-forge" }
  }
}
```

The exact storage may be `equipment-rules.json` or a clearly named root alongside the Set catalog; there is one owner either way.

Do not introduce per-Set override machinery until a real Set needs a different rule.

---

# 5. Eight Set identities — initial Alpha 3 tuning target

These are **first playtest values**, not immutable balance doctrine. The gameplay thesis and behavioral distinction are frozen; values may move on evidence.

## 5.1 Commando — handling / controlled tempo

**Unlock:** clear `stage:junkyard-01`  
**Piece fabrication:** 45 Scrap

2-piece:

```text
Fire rate +8%
```

4-piece capstone:

```text
Spread -3°
Projectile speed +8%
```

**Read:** faster, cleaner weapon handling. No explosion/burn gimmick.

## 5.2 Scavenger — collection / economy

**Unlock:** clear `stage:junkyard-02`  
**Piece fabrication:** 50 Scrap

2-piece:

```text
Scrap gain +15%
```

4-piece:

```text
Pickup radius +30
XP gain +10%
```

**Read:** deliberately takes a combat-power opportunity cost for faster collection/progression.

## 5.3 Demolition — burst / splash

**Unlock:** clear `stage:junkyard-03`  
**Piece fabrication:** 60 Scrap

2-piece:

```text
Damage +8%
```

4-piece:

```text
weaponTraits: [EXPLOSIVE]
```

**Read:** hits create real splash behavior. This is the first Set where the name becomes mechanically literal.

## 5.4 Recon — mobility / reach / precision

**Unlock:** clear `stage:junkyard-04`  
**Piece fabrication:** 65 Scrap

2-piece:

```text
Move speed +6%
```

4-piece:

```text
Range +30
Projectile speed +10%
```

**Read:** sees and reaches threats sooner; distinct from Commando’s close handling/tempo.

## 5.5 Juggernaut — maximum forgiveness

**Unlock:** defeat `boss-crusher`  
**Piece fabrication:** 75 Scrap

2-piece:

```text
Max health +12%
```

4-piece:

```text
Max health +40
```

**Read:** intentionally simple defensive identity. It is the “I want room to make mistakes” Set.

## 5.6 Technician — projectile engineering

**Unlock:** clear `stage:forge-01`  
**Piece fabrication:** 80 Scrap

2-piece:

```text
Projectile speed +10%
```

4-piece:

```text
Projectile count +1
Spread +4°
```

**Read:** visibly changes shot shape with an accuracy trade-off. This is different from Commando’s precision and from Gunsmith’s one-family build specialization.

## 5.7 Pyro — sustained incendiary damage

**Unlock:** clear `stage:forge-02`  
**Piece fabrication:** 90 Scrap

2-piece:

```text
Damage +6%
```

4-piece:

```text
weaponTraits: [FIRE]
```

**Read:** attacks visibly ignite/burn; no longer “Demolition but orange.”

## 5.8 Medic — forgiving survival / mobility

**Unlock:** clear `stage:forge-03`  
**Piece fabrication:** 90 Scrap

2-piece:

```text
Max health +20
```

4-piece:

```text
Max health +10%
Move speed +4%
```

**Read:** broad survivability and escape margin.

**Deliberate limitation:** Alpha 3 does **not** invent a new heal-on-kill/regen subsystem only to make the word “Medic” more literal. If playtesting says this Set still lacks identity, the next review may either rename its display fantasy or justify one reusable recovery mechanic with concrete evidence.

---

# 6. Reuse existing weapon BehaviorTraits across Equipment and Gunsmith

Pyro/Demolition should not reimplement burn/splash.

Move the reusable trait vocabulary/behavior mapping out of a Gunsmith-specific ownership file into a small shared pure module, e.g.:

```text
src/gameplay/weaponBehaviorTraits.ts
```

It owns:

```ts
type BehaviorTrait = 'FIRE' | 'EXPLOSIVE' | 'PIERCING';
TRAIT_BEHAVIORS
resolveTraitModifiers(...)
resolveTraitProjectileEffects(...)
```

Gunsmith still owns how Parts acquire/carry traits. Equipment owns which active Set threshold contributes a trait.

## Per-family dedupe

Before runtime effects are resolved, build a **Set of trait IDs per weapon family**:

```text
all equipped weapon families receive active Equipment Set traits
selected persistent Gunsmith build family additionally receives its fitted/infused traits
```

Then resolve the unique set once.

If Pyro 4-piece supplies FIRE and the selected pistol Gunsmith also carries FIRE:

- pistol gets one FIRE behavior, not double damage + two burn payloads;
- other weapon families still receive the Pyro FIRE behavior.

No duplicate behavior is allowed merely because it came from two persistent systems.

---

# 7. Equipment fabrication

Equipment is not consumable and duplicates have no current gameplay purpose. Fabrication is therefore **one owned instance per definition**.

## Eligibility

```text
set unlock condition true
AND no owned Equipment instance with this equipmentId
AND enough Scrap
```

The player may choose the slot order. Unlocking Commando does not immediately dump four pieces; it offers four potential projects.

## Stable owned ID

Use a deterministic owned key such as:

```text
owned:equipment-commando-helmet
```

It is an ownership key, not the definition ID.

## Atomic command

UI calls an authoritative context/gameplay command with only the definition ID.

The command itself resolves:

- current Set unlock facts;
- current price;
- existing owned definition;
- current Scrap.

Candidate save mutation:

```text
progression.scrap -= cost
equipment[ownedId] = { equipmentId, tier: 1 }
```

Persist once, then publish. If storage fails, publish nothing. A retry sees the same Scrap, same missing item and same deterministic ID.

No durable grant receipt is needed for an interactive purchase because there is no external source event to replay.

---

# 8. Gun Part fabrication

Parts are legitimately duplicated because merging consumes two copies of the same definition.

## 8.1 Definition contract

```ts
readonly fabricationCost?: number;
```

- positive cost = repeatably fabricable when unlock condition passes;
- absent = reward-only / not fabricable.

## 8.2 Persistent serial state

Extend V4 Gunsmith state:

```ts
interface GunsmithState {
  builds: Build[];
  parts: Record<string, PartInstance>;
  fabricationSerials: Readonly<Record<string, number>>;
  selectedBuildId?: string;
}
```

The serial is the **last successfully persisted fabricated copy number** for that definition. It never decreases when a Part is merged/infused/consumed.

This is required. Deriving the next ID from currently owned copies is unsafe because consumed instances disappear while historical ownership IDs/receipts may still exist.

## 8.3 Owned ID

For `part:barrel-standard`, serial 3:

```text
owned:part-barrel-standard:3
```

The existing owned-instance grammar supports this shape.

## 8.4 Atomic fabrication

Eligibility:

```text
definition exists
AND fabricationCost exists
AND unlock condition passes
AND Scrap >= cost
AND next serial is safe/bounded
AND derived owned ID does not already exist
```

Candidate save:

```text
progression.scrap -= cost
gunsmith.parts[newId] = { partId, tier: 1, infusedTraits: [] }
gunsmith.fabricationSerials[partId] = nextSerial
```

Persist once, publish once. Storage failure leaves all three facts unchanged.

## 8.5 Sanitizer

- only known-shape `part:*` keys;
- safe non-negative integer serials;
- bounded at a high defensive maximum;
- migration initializes `{}` because pre-V4 saves could not create the new fabricated ID family;
- sanitizer never reconstructs/decrements serial from current inventory.

---

# 9. Initial Part fabrication table

First-pass values deliberately put common projects within roughly one early clear while advanced/behavioral parts require a choice to save.

| Part | Availability | Cost | Notes |
| --- | --- | ---: | --- |
| Compact Receiver | clear Junkyard 1 | 30 | repeatable merge material |
| Standard Barrel | clear Junkyard 1 | 30 | first clear also grants one physical copy |
| Red-Dot Optic | clear Junkyard 2 | 35 | precision path |
| Padded Stock | clear Junkyard 2 | 35 | SMG/shotgun stability |
| Extended Magazine | clear Junkyard 3 | 40 | projectile-count build material |
| Heavy Receiver | clear Junkyard 3 | 60 | damage/tempo trade-off |
| Long Barrel | clear Junkyard 4 | 60 | reach path |
| Hair Trigger | clear Junkyard 4 | 65 | tempo path |
| Piercing Barrel | defeat Scrap Crusher | 100 | first advanced behavior path |
| Fire Trait Core | defeat Scrap Crusher | 110 | Crusher clear also grants one actual copy |
| Grenade Launcher | clear Forge 4 | 130 | high-impact EXPLOSIVE attachment |
| Mastered Fire Trait Core | defeat Forge Warden | — | reward-only headline/end-of-Alpha-3 mastery object |

Exact values are balance-testable. The availability order and distinction between fabricable vs reward-only are product decisions.

---

# 10. Scrap economy guardrails

The Scrap economy now has three understandable sinks:

```text
Fabricate new Equipment
Fabricate duplicate Parts for merge/build experimentation
Upgrade owned Equipment tier
```

No fourth generic permanent-stat sink is needed.

## Initial Equipment upgrade gates/costs

Keep the existing deterministic cost shape unless playtesting shows a clear problem:

```text
T1 → T2: 100 Scrap
T2 → T3: 150 Scrap
T3 → T4: 200 Scrap
```

Unlock gates:

```text
T2 after Junkyard 3
T3 after Scrap Crusher
T4 after Forge Warden
```

This makes Scrap choices legible:

> “Do I make my second Demolition piece, buy two more Barrel copies toward a merge, or upgrade my current Helmet?”

That is a materially better decision than “buy +3% permanent stat.”

## No respec tax

- equipping/unequipping is free;
- fitting Parts is free;
- selecting a saved build is free;
- no Scrap cost to try a different owned configuration.

The economy charges for **creating/improving durable objects**, not experimentation.

---

# 11. UI/read-model requirements

## Equipment

Snapshot separates:

```text
Owned
Available to Fabricate
Locked Sets / next requirement
Active Set bonuses
```

Each fabricable item shows:

- final dedicated item art;
- Set + slot;
- piece effect;
- contribution toward 2/4 threshold;
- fabrication cost;
- comparison with currently equipped piece.

Selecting a locked Set explains the concrete condition (“Defeat Scrap Crusher”), not an internal condition ID.

## Gunsmith

Snapshot separates:

```text
Current Build
Owned Parts
Fabrication Blueprints
Reward-only/locked discoveries where spoiler policy permits
```

Blueprint card shows:

- physical Part art;
- slot;
- rarity;
- base effect / behavior;
- cost;
- whether another copy advances an available merge pair.

A useful CTA may say:

```text
Fabricate — 30 Scrap
Fabricate — 30 Scrap · 1 more copy enables T2 merge
```

The UI derives this from owned same-definition/same-tier copies; no extra “merge progress” save field.

---

# 12. Reward integration

With fabrication, the current full-set grants are removed.

V4 first-clear rewards may still carry:

- Scrap;
- bounded normal loot-table reference;
- at most one or two deliberate actual persistent item grants;
- other truly source-owned progression rewards.

New Set/Part **availability** is generally derived from the just-persisted Stage/Boss/Achievement facts.

The result summary can therefore derive:

```text
NEW BLUEPRINT: Commando Set
NEW BLUEPRINTS: Red-Dot Optic, Padded Stock
```

by comparing availability before/after the authoritative completion fact, rather than storing duplicate unlock tokens.

A shared availability resolver should feed:

- result reveal;
- Career next goals;
- Equipment/Gunsmith locked/fabricable lists.

Do not make three independent UI implementations re-evaluate slightly different conditions.

---

# 13. Acquisition coverage proof

A release content validator must build a route for every active persistent definition.

## Equipment

Every current piece inherits a Set whose unlock condition is satisfiable in the active campaign and has a positive fabrication price.

Therefore all 32 pieces have a route without 32 individual reward rows.

## Parts

For each Part, exactly one or more routes exist:

```text
fabricable after condition
OR source-owned deterministic reward
OR both (when the reward is a free first copy of an unlocked blueprint)
```

Reject:

- a Part with neither fabrication nor reward route;
- an unsatisfiable condition;
- reward-only Part referenced by no reward source;
- a fabricable Part whose declared price is invalid;
- a definition whose availability relies on its own acquisition.

---

# 14. Tests

## Fabrication

- Set unlocked + enough Scrap → Equipment created once;
- second Equipment fabrication fails `already-owned` with no spend;
- locked Set fails with no spend;
- insufficient Scrap fails with no mutation;
- storage failure leaves Scrap/item/serial unchanged;
- successful retry after a failed Part write uses the same next serial;
- after successful Part fabrication, next copy increments serial;
- consuming/merging Parts never decrements fabrication serial;
- fabricated IDs survive Save V4 sanitizer/round trip.

## Tier semantics

- Part definition has no static tier;
- Equipment definition has no static tier;
- owned Part tier 2 additive = 2× additive delta;
- owned Part tier 2 multiplier 1.12 = 1.24, **not 2.24**;
- equipment uses the same scaling helper;
- hostile multiplier that would become ≤0 at supported tier fails validation.

## Set contribution

- 2+2 mixed Sets receive both 2-piece thresholds;
- 4-piece gets both 2 and 4 thresholds;
- Pyro 4-piece contributes FIRE through the shared trait resolver;
- Demolition 4-piece contributes EXPLOSIVE;
- same trait from Set + Gunsmith resolves once per family;
- Equipment trait applies to every equipped weapon family;
- Gunsmith trait remains scoped to its selected build family.

## N+1

Synthetic Set 9:

```text
one Set row + four piece rows + art
```

is automatically fabricable after its condition, appears in UI read models and contributes Set bonuses without scene/controller registration.

Synthetic Part N+1 with existing slot/trait/modifier + fabrication price automatically appears in Fabrication Blueprints.

---

# 15. Explicit non-goals

Do not add in Alpha 3:

- random affix rolls on fabrication;
- dismantling currencies;
- crafting materials separate from Scrap;
- equipment duplicates/quality RNG;
- gear score;
- repair durability;
- paid crafting acceleration;
- crafting timers;
- crafting failure chance;
- arbitrary recipe graphs;
- a generic executable effect language.

Fabrication is intentionally boring in implementation and satisfying in consequence:

```text
known blueprint + Scrap -> known object
```

The interesting decision is **what to build and equip**, not whether a slot machine grants the right version.

---

# 16. Checkpoint verdict

The persistent Loadout economy is sufficiently specified for implementation planning when all of these remain true:

1. availability has one authoritative condition source;
2. Scrap buys concrete persistent choices;
3. no Set is delivered as an inventory dump;
4. every current Equipment/Part has an acquisition route;
5. duplicate Parts are supported only because merge needs them;
6. one owned tier vocabulary exists per system;
7. Pyro/Demolition reuse existing weapon behavior rather than new ID-specific code;
8. failure/retry is atomic and deterministic;
9. experimentation after ownership is free;
10. no new currency, timer or random crafting layer has been introduced.
