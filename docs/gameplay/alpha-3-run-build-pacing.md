# Alpha 3 Run-Build Pacing — Upgrade Offer Quality and Power Beats

**Status:** first implementation/tuning target for #171. Uses the existing 18-card upgrade catalog, XP loop, weapon rack, merging and scheduled weapon rewards.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The current run systems already contain enough ingredients for a strong “one more run” loop:

- XP levels start cheaply and grow geometrically;
- each level pauses for a four-card choice;
- family-scoped cards are automatically ineligible unless that weapon family is owned;
- scheduled weapon rewards begin at 20–40 seconds and repeat every 30–45 seconds;
- six rack slots and weapon merging create visible arsenal changes;
- 18 current cards include projectile count, spread, pierce, range, attack speed, damage, movement, health, XP and Scrap trade-offs;
- character active ability adds a separate tactical moment.

Do **not** add another upgrade tree before making this system produce better offers and measuring the result.

---

# 1. Problem in the current offer algorithm

`offerCards()` currently:

1. filters maxed cards;
2. filters weapon-family cards for families not equipped;
3. repeatedly draws from the whole remaining eligible pool using rarity weights.

That is deterministic and correct, but it has no concept of **choice quality**. Four offense/synergy choices may appear while defense/mobility/economy alternatives exist.

The target is a small deterministic composition policy, not a reroll shop or AI director.

---

# 2. Four-slot offer policy

Keep `RuntimeConfig.gameplay.upgrades.offerCount = 4` for Alpha 3.

After normal eligibility filtering, partition:

```ts
familyPool   = eligible definitions with a weapon-family scope
supportPool  = unscoped eligible definitions whose category is one of:
               defense | mobility | utility | economy
allPool      = all remaining eligible definitions
```

Then select without replacement:

```text
Slot A — BUILD IDENTITY
  weighted rarity draw from familyPool when non-empty
  otherwise weighted draw from allPool

Slot B — SUPPORT ALTERNATIVE
  weighted rarity draw from supportPool when non-empty
  otherwise weighted draw from remaining allPool

Slot C — WILDCARD
  weighted rarity draw from remaining allPool

Slot D — WILDCARD
  weighted rarity draw from remaining allPool
```

Use the existing `UPGRADE_RARITY_WEIGHTS` for every weighted draw.

A selected card is removed from every partition before the next draw.

If fewer than four eligible cards remain, return the valid smaller offer as today.

## Why this is enough

It guarantees **opportunity**, not a forced build:

- relevant family specialization appears when one exists;
- the player normally sees one non-family survival/economy/mobility alternative;
- two wildcards preserve surprise, global offense, synergy and second-family possibilities;
- no selection remembers prior offers or creates pity state;
- no card ID is special-cased.

---

# 3. Determinism contract

The content pass is allowed to change the **sequence** of upgrade offers because the offer-selection policy is intentionally changing.

It must remain deterministic:

```text
same definitions
+ same stacks
+ same equipped weapon rack
+ same upgrade RNG state
= same offer order
```

Do not create another RNG stream per role. The existing `upgrades` run-scoped stream remains the sole offer RNG.

A four-card offer should consume exactly one weighted draw per selected card. The partition used for that draw changes; random sourcing does not.

No `Math.random` and no global state.

---

# 4. Presentation ordering

For Alpha 3, preserve the selected Slot A/B/C/D order in the chooser.

This has a useful learnable visual grammar:

```text
build-relevant | support | wildcard | wildcard
```

The UI does **not** label these internal roles. Icons/category/family treatment makes the distinctions visible.

Do not consume extra RNG merely to shuffle card positions unless playtesting demonstrates a real first-card positional bias.

---

# 5. Existing 18-card catalog: product-role audit

No current card is removed in this planning pass.

## General support / economy

```text
Quick Paws           movement
Extra Scrap          persistent economy trade-off
Scrap Magnet         collection safety
Reinforced Coat      health
Fast Learner         faster level cadence
```

These give Slot B enough breadth.

## General offense / run shaping

```text
Hot Barrel
Heavy Rounds
Long Barrel
Split Shot
Punch Through
Glass Cannon
Run and Gun
```

These remain wildcard/general build pieces.

## Family identity

Pistol:

```text
Pistol Deadeye
Pistol Needle Rounds
```

SMG:

```text
SMG Overclock
SMG Spray
```

Shotgun:

```text
Shotgun Buckshot
Shotgun Breacher
```

Two cards per family are enough to test the family-offer architecture without immediately expanding the catalog.

---

# 6. Balance review notes before live tuning

The current card values are deliberately punchy enough that multiple stacks can be felt. That is a strength; do not flatten everything into +3% increments.

Watch these in real traces:

## Extra Scrap

1.25× per stack, max 3, compounds strongly. That may be fine because taking it costs immediate combat power, but measure whether it becomes the universally correct early choice for fabrication progression.

Do not nerf it merely because 1.25³ looks large in isolation.

## Quick Paws

1.08× max 5 can create very high movement. Test camera/input readability and whether movement trivializes charger/boss tells before changing it.

## Reinforced Coat

1.12× max 4 is the primary run-defense choice. Ensure its UI shows the **resulting meaningful health change**, not only “+12%”.

## Heavy Rounds / Glass Cannon / family trade-offs

Trade-offs are valuable because they create describable builds. Keep them visible in copy and iconography.

## Projectile-count cards

Split Shot / SMG Spray / Shotgun Buckshot should be among the most perceptible power moments. Test projectile-pool/performance and visual clarity at stacked counts.

## Pistol Needle Rounds

Must remain visually/textually distinguishable from global Punch Through and Pistol Deadeye after #167.

---

# 7. Scheduled weapon reward cadence

Keep the current first candidate until playtest:

```text
first:  20–40s
repeat: 30–45s
```

This already fits the engagement target:

- level-up choices begin early via XP;
- first physical weapon/rack change should occur inside the first minute;
- later drops can create merges/family pivots.

Do not tighten the timer from desk analysis alone. The relevant metric is **collected/usable power timing**, not schedule issuance.

A reward spawned at 22s but ignored until 60s is not a 22s player power beat.

---

# 8. Power-beat evidence

A successful ordinary Contract should normally contain at least three player-perceptible power beats drawn from:

```text
level/card chosen
new weapon acquired
weapon merge
active ability turning a dangerous moment
new projectile behavior becoming obvious
rare/epic card
major Set/Gunsmith persistent behavior visible from run start
```

Do not count a level-up modal and its selected card as two beats.

## Build identity check

At roughly half the final run time, ask the reviewer to describe the build without opening stats.

PASS examples:

```text
“fast spray SMG with lots of movement”
“piercing pistol line build”
“huge close-range shotgun”
“explosive Demolition setup”
```

FAIL:

```text
“I have some upgrades.”
“damage is higher.”
```

---

# 9. PlaytestSummary extension

The current dev-only `PlaytestSummarySystem` already records:

- level-up timestamps;
- offers + chosen card IDs;
- first merge;
- weapon acquisition timestamps;
- offer overlap;
- final rack distribution;
- average DPS.

Extend it rather than creating an analytics service.

## Add

```text
stageId
card offer timestamp
card chosen timestamp
first-seen enemy/archetype timestamp per ID
authoritative boss phase timestamps
objective completion time
```

Where objective progress timestamps are useful, expose them through a small dev/playtest seam rather than adding a production network/telemetry event solely for analytics.

At print time include derived:

```text
firstOfferTimeMs
firstWeaponAcquiredTimeMs
firstMergeTimeMs
longestBuildDecisionGapMs
uniqueUpgradeIdsChosen
familyScopedChoicesTaken
```

The system remains:

- dev-only;
- local console only;
- no PII;
- no network;
- no persistent player analytics.

---

# 10. Pure offer tests

Use synthetic card pools so tests prove the algorithm rather than the current 18 IDs.

## Required

### Relevant family slot

With one equipped pistol and eligible pistol/general cards:

```text
offer contains a pistol-scoped definition
```

### Multiple families

With pistol + SMG equipped, Slot A comes from the combined eligible family pool and remains seeded deterministic.

### Support slot

When a support category is eligible, offer contains one support card even if offense cards have higher aggregate pool size.

### Fallbacks

- no family cards → Slot A falls back cleanly;
- no support cards → Slot B falls back;
- all family cards maxed → no invalid card;
- fewer than four total eligible → smaller unique offer;
- family card for unequipped family never appears.

### Determinism

Two identical seeded harnesses return identical ordered IDs.

### No duplication

A definition appears at most once in one offer.

### Rarity

Within each role pool, rarity weights remain the current weights. Do not test one exact random statistical sequence as a balance requirement; test deterministic seeded outcomes and distribution sanity separately.

---

# 11. What would justify more upgrade content

After #164 and the first content/pacing pass, playtest all three weapon families.

Only expand the catalog when evidence identifies a missing fantasy such as:

```text
“shotgun never develops a genuinely different late-run identity”
“pistol choices converge every time”
“defensive choices never alter how I move”
```

Then add the smallest data-authored card using existing modifier/projectile primitives first.

A new effect kind requires a concrete fantasy that cannot be expressed by the current system and an implementation plan reusable beyond one card.

Do not add 50 cards simply because successful genre references advertise hundreds of items. Their lesson is **build variety**, not catalog size for its own sake.

---

# 12. Checkpoint pass condition

The run-build system is ready for Alpha 3 tuning when:

1. offers present relevant build identity + a real alternative;
2. offer generation remains pure and seeded;
3. no family card appears without that family;
4. no reroll/pity/currency system has been added;
5. existing scheduled weapon cadence remains intact until evidence says otherwise;
6. playtest output can reconstruct the run’s meaningful build timeline;
7. a successful Contract normally produces multiple visible power moments;
8. reviewers can describe builds without reading the stat engine.
