# Alpha 3 V4 — Part Tier Value Amendment

**Status:** narrow V4 authoring/gameplay amendment discovered during the final adversarial review of PR #169.

**Implementation baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Scope:** this file closes three coupled Part-value ambiguities: higher owned tiers must have real value, the shared FIRE behavior must remain distinct from Fire Core engineering modifiers, and an advertised early Part must not be a silent zero-effect choice on the weapon families available when it is introduced. It does not introduce a new progression system or behavior primitive.

V4 correctly separates:

```text
PartDefinition = immutable blueprint facts
PartInstance   = owned engineering tier 1..5 + infused traits
```

and correctly keeps shared behavior traits such as FIRE / EXPLOSIVE / PIERCING **tier-invariant**.

The governing product rule is:

> **Engineering choices must change real mechanics. A tier number, blueprint card or headline reward that produces no actual delta is not progression.**

---

# 1. Problem exposed by Fire Trait Core

RC1 contains:

```text
part:trait-fire
traits: [FIRE]
effects: []
```

V4 makes Parts definition-tier-free and uses generic owned-instance merging. Fire Trait Core becomes available after Scrap Crusher and the product matrix gives one physical first-clear copy.

The shared FIRE behavior is intentionally resolved once per weapon family and does **not** scale with engineering tier.

Therefore if the V4 Fire Trait Core remained `effects: []`:

```text
Fire Core T1 == Fire Core T2 == Fire Core T3 == Fire Core T4 == Fire Core T5
```

mechanically.

That would make fabrication/merging a Scrap sink with no player value.

Do not fix this by:

- making FIRE itself secretly scale by Part tier;
- creating FIRE_T2 / MASTERED_FIRE / another trait ID;
- special-casing Fire Trait Core in merge code;
- disabling generic merging only for this current Part ID;
- retaining RC1 static definition tier as a substitute for owned state.

---

# 2. Generic V4 tier-value invariant

Every Part definition that may legally produce or be granted an owned instance above T1 must have at least one **tier-sensitive mechanical contribution**.

Under the current V4 vocabulary, that normally means at least one `ModifierSpec`, because shared FIRE / EXPLOSIVE / PIERCING traits are tier-invariant.

Generic rule:

```text
legal owned tier > 1
=>
at least one contribution changes under the shared tier resolver
```

Current resolver remains:

```text
add  => value × tier
mult => 1 + (value - 1) × tier
```

A future registered behavior primitive may deliberately define tier-sensitive behavior, but that requires its own reusable mechanic contract/tests. Catalog authors may not infer tier scaling from a trait name.

---

# 3. Shared FIRE package — preserve existing behavior

The V4 authoring contract says:

```text
FIRE -> existing damage modifier + burn projectile effect
```

That wording is intentional. RC1's registered FIRE package is already one generic, family-scoped behavior consisting of:

```text
damage modifier:     mult 1.15
burn duration:       2000 ms
burn tick interval:   500 ms
burn damage:          0.20 × triggering hit per tick
```

V4 moves ownership of this behavior out of the Gunsmith-specific module into shared pure gameplay code; it does **not** silently strip the 1.15× damage component merely because another document used the shorthand `FIRE -> burn`.

Initial V4 migration therefore preserves this existing FIRE package. Any later numeric rebalance is explicit Slice-G/playtest tuning, not an accidental consequence of the architecture refactor.

## Dedupe boundary

Deduplication applies to the **shared FIRE package**:

```text
one family has FIRE from one or more sources
-> one 1.15× FIRE modifier
-> one burn projectile behavior
```

A PartDefinition's own `effects` are **not part of that dedupe set**. They are independently source-owned engineering modifiers and follow ordinary stat stacking.

Therefore:

```text
Pyro 4-piece FIRE + Fire Core FIRE
-> shared FIRE package once
-> Fire Core's own tier-scaled Part modifier still applies once
```

and:

```text
Fire Core FIRE + Mastered Fire FIRE
-> shared FIRE package once
-> each actually fitted source-owned Part modifier resolves normally
```

The implementation must not:

- apply the shared 1.15× FIRE modifier once per FIRE source;
- dedupe away the fitted Part's own `effects` because the trait already exists;
- fold the Part-owned 1.02/1.05 base modifier into the shared FIRE behavior;
- make the shared FIRE package tier-sensitive.

RC1 `ModifierStack.resolveWeapon()` already establishes the ordinary rule: independent multiplicative modifiers are multiplied after additive modifiers. V4 preserves that stat-stack behavior unless a separate reviewed balance change says otherwise.

---

# 4. Ordinary Fire Trait Core — frozen V4 target

`part:trait-fire` remains the ordinary, repeatable FIRE engineering project after Scrap Crusher.

Target definition shape:

```json
{
  "id": "part:trait-fire",
  "name": "Fire Trait Core",
  "slot": "trait",
  "rarity": "uncommon",
  "fabricationCost": 120,
  "presentation": {
    "iconArtId": "gun-part-icon:trait-fire"
  },
  "effects": [
    { "stat": "damage", "op": "mult", "value": 1.02 }
  ],
  "traits": ["FIRE"],
  "unlock": { "type": "boss-defeated", "bossId": "boss-crusher" }
}
```

`120 Scrap` is the initial implementation/playtest candidate, not an immutable balance constant. It must remain a positive numeric fabrication cost unless later playtest tuning changes the number deliberately.

Scrap Crusher first-clear supplies one **owned T1** Fire Trait Core as the free headline copy. After the same boss fact is durable, additional copies are fabricable at the tuned positive cost.

The source-owned same-clear eligibility case uses `alpha-3-terminal-settlement-amendment.md`; no duplicate `unlock-part` token is added.

---

# 5. Fire Core tier progression

The table below is the **Part-owned engineering modifier only**. Every fitted Fire Core also contributes the one deduped shared FIRE package from §3 when its family otherwise lacks FIRE.

| Owned tier | Part-owned damage modifier | Shared FIRE package |
| ---: | ---: | --- |
| T1 | 1.02× | once per family |
| T2 | 1.04× | once per family |
| T3 | 1.06× | once per family |
| T4 | 1.08× | once per family |
| T5 | 1.10× | once per family |

The visual FIRE behavior is the main identity; the modest Part-owned slope makes engineering/merging non-fake without turning the trait into five behavior variants.

---

# 6. Mastered Fire remains a distinct final-boss reward

The existing V4 Mastered Fire target remains:

```text
part:trait-fire-mastered
reward-only / non-fabricable
same shared FIRE trait
base Part-owned damage modifier 1.05×
Forge Warden first-clear grants owned T3
```

At T3, the **Part-owned** modifier resolves to:

```text
1 + (1.05 - 1) × 3 = 1.15× damage
```

Therefore the engineering-specific comparison is:

```text
ordinary Fire Core T5  -> Part-owned 1.10× + shared FIRE package
Mastered Fire Core T3  -> Part-owned 1.15× + shared FIRE package
```

The Warden reward remains meaningfully superior to a fully engineered ordinary Fire Core without creating another FIRE behavior.

Its owned T3 is transaction/instance state, not static Part definition tier.

---

# 7. Current early-Part usefulness correction

A separate current-content audit found two RC1 Parts whose only effect is negative spread:

```text
Red-Dot Optic: spreadDeg -2
Padded Stock:   spreadDeg -1.5
```

But all three Scrap Pistol tiers have base spread 0, Can SMG T1/T2 have base spread 0, and effective spread is clamped to `>= 0` after modifier resolution. Therefore:

- J2's headline Red-Dot reward can have **zero effect** on the player's pistol or early SMG;
- Padded Stock can be fabricated while doing nothing on an early SMG.

This fails the V4 product goal that a newly earned/fabricated Part creates an understandable build decision.

## Frozen first tuning candidate

Preserve each Part's accuracy/control identity and add one small existing-stat contribution:

### Red-Dot Optic

```json
"effects": [
  { "stat": "spreadDeg", "op": "add", "value": -2 },
  { "stat": "range", "op": "add", "value": 12 }
]
```

Interpretation: modest effective-range benefit on every compatible current family, plus actual spread tightening where spread exists.

### Padded Stock

```json
"effects": [
  { "stat": "spreadDeg", "op": "add", "value": -1.5 },
  { "stat": "attackSpeed", "op": "add", "value": 0.03 }
]
```

Interpretation: modest controllability/cadence benefit on SMG/shotgun even when spread is already zero, plus spread tightening where relevant.

These values are first playtest candidates. They intentionally remain smaller than the primary specialization of Long Barrel / Compact Receiver and may be tuned from real runs.

Do not add a recoil subsystem merely to justify these Parts.

---

# 8. Generic validation and release-content usefulness checks

## Generic tier validation

Part validation must reject a definition/route that creates meaningless higher tiers.

At minimum:

```text
if an owned Part can legally reach tier >1:
    prove at least one contribution changes across legal tiers
```

Current shared traits alone do not satisfy this proof because they are intentionally tier-invariant.

Validation should report the stable Part ID and reason, e.g.:

```text
part:example-trait-core can reach T2+ but has no tier-sensitive contribution
```

Do not hard-code `part:trait-fire` into validator logic.

A synthetic future trait-only Part with no tier-sensitive contribution must fail the same gate.

## Release-content usefulness

For the active release content matrix, automatically evaluate each Part against its compatible current weapon families/tiers and flag definitions whose entire effect set is clamped/no-op for all intended consumers.

For a **headline first-clear Part reward**, add a stricter release assertion:

> At the milestone where it is awarded, the Part must have a non-zero mechanical delta on at least one weapon family that a normally reachable Mercenary/build can actually use at that point.

This is a release-content assertion, not a universal engine rule. Future niche content may intentionally target a later family if its product brief says so; the reason must be explicit rather than accidental.

---

# 9. Merge/read-model behavior

Merge remains generic:

```text
same Part definition
+ same owned tier
-> consume two
-> one owned instance at tier +1
```

Before confirm, UI shows the actual mechanical delta of the output, including the tier-scaled Part-owned modifier.

For Fire Trait Core:

```text
T1 + T1 -> T2
Part-owned 1.02× damage -> 1.04× damage
shared FIRE package remains one copy
```

Do not imply the burn behavior or shared FIRE 1.15× modifier doubled merely because engineering tier increased.

The same read model should expose when a clamped stat has no further effect on the current family rather than promising a phantom improvement.

---

# 10. Required tests

## Fire Core engineering slope

```text
T1 -> Part-owned 1.02× + shared FIRE package
T2 -> Part-owned 1.04× + shared FIRE package
T3 -> Part-owned 1.06× + shared FIRE package
T4 -> Part-owned 1.08× + shared FIRE package
T5 -> Part-owned 1.10× + shared FIRE package
```

Two fabricated T1 copies merge to T2 and the resulting Part-owned contribution changes.

Crusher first-clear T1 + later fabricated T1 can merge normally after the boss fact is durable.

## Mastered Fire

Warden first-clear produces one owned T3 Mastered Fire Core:

```text
Part-owned 1.15× damage + shared FIRE package
```

It remains reward-only because `fabricationCost` is absent.

## Trait dedupe versus Part effects

Prove separately:

```text
Pyro FIRE + ordinary Fire Core FIRE
-> exactly one shared FIRE 1.15× modifier
-> exactly one burn behavior
-> Fire Core Part-owned tier modifier remains present
```

```text
ordinary Fire Core FIRE + Mastered Fire FIRE
-> exactly one shared FIRE package for the engineered family
-> each actually fitted Part-owned modifier remains independently source-owned
```

No duplicate shared FIRE modifier/projectile effect is emitted merely because two sources carry the same trait.

## Early-Part current-content checks

- Red-Dot T1 changes a Scrap Pistol's effective range even though spread remains clamped at zero.
- Red-Dot tightens spread on a weapon that actually has spread.
- Padded Stock T1 changes early SMG attack speed even though spread is zero.
- Padded Stock tightens shotgun/late-SMG spread where applicable.
- the J2 headline Red-Dot reward has a non-zero delta for a reachable early family.

## Generic validator

A synthetic Part that can reach T2 but has:

```text
effects: []
traits: [FIRE]
```

fails tier-value validation.

A synthetic Part with an existing valid modifier passes without a core-code or validator-ID edit.

---

# 11. N+1 rule

The final authoring test is generic:

> A future Part using existing slots/modifiers/traits may be added through data/art/acquisition composition, and its legal engineering tiers must produce real mechanical deltas without content-ID code.

This amendment does not require:

- a per-Part tier table;
- per-Part merge code;
- trait-specific tier switches;
- another save field;
- another RNG stream;
- a recoil/accuracy subsystem.

---

# 12. Implementation owners

- #87 — Gunsmith definition/merge/read-model behavior;
- #170 — generic authoring/validation/N+1 gate;
- #171 — current Fire/Mastered/early-Part content and product tuning;
- #167 — existing Part visual directions remain valid.

---

# 13. PASS

This amendment passes implementation when:

1. every legal T2+ Part has a real tier-sensitive contribution;
2. shared FIRE preserves its existing 1.15× damage + burn package and is deduped once per family;
3. ordinary Fire Trait Core has the frozen 1.02× base Part-owned damage modifier + FIRE;
4. Crusher first-clear grants one T1 Fire Core and later fabrication is available at initial 120 Scrap (tunable by playtest);
5. Fire Core merges change the Part-owned modifier but never duplicate/scale the shared FIRE package;
6. Mastered Fire remains Warden-only T3 with a Part-owned 1.15× modifier plus the same shared FIRE package;
7. Pyro/Part duplicate FIRE sources emit one shared behavior package while fitted Part-owned modifiers remain present;
8. Red-Dot/Padded Stock no longer resolve to silent no-ops for their early intended families;
9. generic validation rejects a synthetic meaningless tier ladder;
10. release-content validation catches an accidentally zero-effect headline Part reward;
11. no content-ID merge/trait branch or new recoil system is introduced.

This is a progression-quality invariant, not a balance-system expansion.