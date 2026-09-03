# Alpha 3 Engagement Benchmark and Product Pass Conditions

**Status:** product/design authority for the Alpha 3 remediation and production tranche.

**Applies to:** #164, #165, #166, #167, #168, #170 and the next consolidated Alpha 3 acceptance candidate.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This document defines what “fun, addictive” means for Meowcenary without adopting manipulative retention mechanics.

> **The player should want one more run because the next run promises a different build, a visible power spike, a clear next milestone and a short path back into action — not because of energy timers, streak pressure, ads, loot-box scarcity, daily chores or paid power.**

The repository non-negotiables remain in force: no ads, no energy systems, no paid progression, no forced waiting, no account dependency and no gameplay cloned from another product.

---

# 1. External benchmark set

The reference set is selected by large-scale mobile evidence and genre relevance, not personal taste.

As checked on Google Play in September 2026:

| Game | Android scale | Useful product lesson | Do not copy |
| --- | ---: | --- | --- |
| Survivor.io | 50M+ downloads, 1M+ reviews | one-hand movement; enormous horde spectacle; clear stage difficulty; broad skill combinations | monetisation/live-service event pressure; exact skills/evolutions/UI |
| Archero | 50M+ downloads, 1.7M+ reviews | extremely low control burden; repeated random skill choices; worlds/stages as progression | stop-to-shoot combat, exact upgrade/equipment systems, monetisation |
| Heroes vs Hordes | 10M+ downloads, 400K+ reviews | one-hand play; build synergies; heroes/loadouts; chapter/boss cadence | live-event grind, guild/competitive pressure, currencies |
| Vampire Survivors | 5M+ downloads | automatic offence; escalating “become the bullet hell” snowball; readable build transformation | exact weapon-evolution recipes, gothic identity, content expression |
| Brotato | 5M+ free mobile downloads; 1M+ premium | short wave cadence; dense item/build variety; strong character constraints; rapid shop/build decisions | exact six-weapon/shop/item economy or character concepts |

The benchmark is outcome-oriented. Meowcenary should learn why these games are readable, replayable and satisfying while retaining its own junkyard-mercenary identity and simpler no-dark-patterns economy.

---

# 2. Engagement pillars

## 2.1 Immediate agency

The first-time player must understand the physical game within **10 seconds**:

```text
move → enemies are targeted automatically → collect drops → get stronger
```

The player should never need to decode Stage vs Arena, Progression vs Character, or a wall of equipment text before playing.

### Pass condition

From a clean save, the primary call to action is a single visible **Play Contract** path. Character/loadout choices are available but not prerequisites to understanding how to start.

---

## 2.2 Frequent meaningful change

A run becomes boring when the player spends long stretches doing the same movement against the same pressure with no meaningful decision or perceptible power change.

Target **engagement beat cadence** during a normal ~3 minute contract:

| Window | Expected beat |
| --- | --- |
| 0–10 s | threat + movement comprehension |
| 15–35 s | first meaningful build/reward beat |
| 30–60 s | first visible build identity or weapon change |
| 45–90 s | pressure pattern changes: new archetype, elite beat, objective movement or second build choice |
| 90–135 s | meaningful power spike and/or encounter escalation |
| 135–180 s | climax: objective completion pressure, boss/elite punctuation or extraction decision |

This is not a requirement to interrupt the player every 20 seconds with modal UI. A beat can be an upgrade, weapon pickup, enemy composition change, telegraphed elite, objective pivot, chest, merge, active ability opportunity or boss phase.

### Pass condition

In recorded playtest footage, no normal stage contains a **>35 second low-information stretch** in which enemy composition, objective pressure, player build and meaningful choices are all effectively unchanged.

---

## 2.3 Power must be felt, not merely computed

A +3% or +5% number is useful for tuning but weak as the main emotional reward.

Each successful run should normally contain at least **three perceptible power moments**, for example:

- acquiring another weapon;
- merging to a higher weapon tier;
- a family-specific upgrade changing projectile count/spread/pierce/range noticeably;
- a strong rare card;
- an active ability turning a dangerous moment;
- a trait-bearing persistent gun expressing burn/explosion/pierce;
- a boss reward unlocking a new persistent build option.

Persistent progression should also produce visible identity changes, not only compound percentage inflation.

### Design rule

Generic stat changes remain supporting material. The memorable moments come from **shape, count, cadence, targeting, threat response, build synergy and visible art/audio feedback**.

---

## 2.4 Build identity by the first half of a run

A player should be able to describe the run in plain language before it ends:

- “fast SMG spray build”;
- “slow heavy shotgun breacher”;
- “piercing pistol line”; or
- “loot-heavy scavenger build”.

If the only description is “my numbers are somewhat higher,” the run-build layer is failing.

### Current strengths

The current 18-card catalog already has useful identity primitives:

- family-scoped pistol/SMG/shotgun cards;
- projectile count and spread;
- pierce;
- range/projectile speed;
- attack-speed/damage trade-offs;
- movement/economy/defence alternatives.

The current architecture does not need a speculative universal effect scripting system merely to satisfy this product requirement.

### Required tuning direction

Offer composition should bias toward **coherent choices without becoming deterministic**:

1. at least one choice relevant to the player’s currently equipped weapon family when eligible;
2. at least one general or defensive/economy alternative;
3. avoid an offer consisting entirely of near-equivalent small stat bumps;
4. preserve a wildcard slot where practical so a run can pivot;
5. never offer a family card for a family the player does not own.

A future effect primitive is justified only when playtesting demonstrates a missing build fantasy that the current modifier/projectile-effect vocabulary cannot express.

---

# 3. Stage/contract experience

## 3.1 Stage is the product entry point; Arena is implementation detail

The runtime already makes Stage authoritative for normal Alpha 3 composition. The UI should reflect that.

**Normal player model:**

```text
Contract
  ├─ location / arena
  ├─ objective
  ├─ enemy mix
  ├─ difficulty
  └─ reward
```

A player should not independently choose both “Arena” and “Stage” and wonder which one matters.

### Target

- **Stages/Contracts** becomes the normal play-selection surface.
- Arena identity is shown *inside* the selected contract card/details.
- The Alpha 2 arena path survives only as an explicit **Training / Golden Run** compatibility mode if it remains product-useful.
- A legacy arena selection never competes visually with the main campaign progression.

---

## 3.2 Current stage-content risk

The current ten contracts are architecturally valid but compositionally repetitive:

- all use `junkyard-lot`;
- both chapters reuse the same world bundle;
- several stages reuse `junkyard-mixed`, `junkyard-rusher-heavy` or `junkyard-elite`;
- most use the same two non-boss difficulty profiles;
- the second chapter repeats collect/survive/kill patterns without a strong new world or systemic twist.

This is acceptable as architecture proof. It is **not sufficient as a fun/content acceptance gate**.

### Required Alpha 3 content pass

Without inventing a second stage architecture:

- each stage gets a distinct **encounter thesis**;
- the objective and enemy mix must interact, not simply coexist;
- stage pressure escalates in identifiable beats rather than a flat spawn curve;
- Chapter 2/Forge must feel materially different even if it initially reuses the physical arena — through lighting/art treatment, encounter composition, hazard/landmark use, pressure patterns and rewards;
- boss stages introduce the boss as a climax, not simply another spawned entity on the same pacing curve.

---

# 4. Reward and progression cadence

## 4.1 Do not dump entire systems at once

The current reward data grants entire four-piece equipment sets on individual early stage clears and later grants multiple full sets at boss milestones. This proves the durable grant machinery but destroys collection pacing and makes equipment feel like admin instead of discovery.

### Target reward grammar

Every successful contract should answer:

```text
What did I earn now?
What new choice did that create?
What visible thing am I now closer to?
```

Use three reward scales:

### Ordinary stage

- scrap/coin progression;
- **one** meaningful deterministic first-clear unlock/grant or a small bounded choice;
- normal loot/run rewards.

### Chapter midpoint / special contract

- stronger targeted equipment/part unlock;
- character/achievement route progress;
- new build option rather than merely larger currency.

### Boss milestone

- one headline reward with a clear new capability or content path;
- materially better scrap/loot;
- optional secondary reward, but never an unreadable dump of eight unrelated pieces.

### Collection rule

A complete four-piece set should normally be something the player **assembles over several meaningful accomplishments**, not receives as four simultaneous bookkeeping rows.

---

## 4.2 Persistent systems need distinct jobs

The player should not need an architecture diagram to understand why a screen exists.

Target player language:

- **Contracts:** what I play next.
- **Mercenaries:** who I play.
- **Loadout:** what persistent gear/build I bring.
- **Gunsmith:** how I engineer my gun.
- **Equipment:** how I build armour/set identity.
- **Achievements:** goals and accomplishments.
- **Compendium:** what I have learned about monsters.

The existing generic **Progression** screen is the main semantic outlier. It exposes four legacy permanent stat purchases that overlap conceptually with equipment, character identity and the Gunsmith.

### Target decision

Retire **Progression** as a top-level product noun.

- `ProgressionOverviewController` can continue to supply next-goal data but should feed Home/Career presentation rather than a vague “Progression” destination.
- legacy `meta-upgrades.json` should not remain a permanent top-level feature merely because it exists in Save V3.
- if the legacy upgrades are retired, migration must preserve player value deterministically (refund or explicit legacy conversion) rather than silently deleting spent scrap.
- the final migration decision is frozen in the implementation blueprint, not improvised in UI code.

---

# 5. Persistent build identity

## 5.1 Equipment

The current equipment architecture is intentionally simple and currently leans heavily on generic stat bonuses. During Alpha 3 this is acceptable only if the **set identity is legible and useful**.

The initial requirement is not eight bespoke mini-game systems. It is:

- every set has one plain-language build thesis;
- its 2-piece bonus reinforces that thesis;
- its 4-piece bonus creates a clearly stronger expression of the same thesis;
- two different sets should not feel interchangeable after removing their names/art;
- mixed 2+2 builds remain legitimate.

If existing stat primitives cannot produce distinguishable sets after real playtesting, add the **smallest reusable registered effect primitive** required by at least two concrete sets. Do not add one-off set-ID logic.

## 5.2 Mercenaries

A character must change player decisions, not merely starting numbers.

For the current eight:

- the active ability is the primary moment-to-moment differentiator;
- starting weapon/passive should point toward a playstyle;
- art, ability icon and passive icon must reinforce the same fantasy;
- unlock requirements should create anticipation rather than obscure grind.

No future Character N+1 should require scene/controller source changes.

## 5.3 Gunsmith

Gunsmith’s strongest existing differentiator is already the bounded trait model:

```text
FIRE -> burn
EXPLOSIVE -> splash
PIERCING -> pierce
```

That should be visible to the player as a build fantasy, not buried in a text table. The UI/art pass should make fitted physical parts and resulting traits readable at a glance.

---

# 6. Between-run loop

A completed run should reach another meaningful action quickly.

### Win

```text
clear -> reward reveal -> new unlock/progress -> Next Contract / Adjust Loadout / Replay
```

### Loss

```text
loss -> concise cause/build summary -> Retry / Adjust Loadout
```

Do not require:

```text
summary -> main menu -> progression -> equipment -> back -> stages -> select -> start
```

### Timing target

A player who chooses **Retry** or **Next Contract** should be able to return to combat in roughly **5–10 seconds**, excluding deliberate loadout browsing.

---

# 7. Menu information architecture target

Recommended top-level model after #165:

```text
HOME
├─ Play Contract        <- primary CTA + next-stage summary
├─ Mercenary            <- character identity
├─ Loadout              <- Equipment + Gunsmith entry points
├─ Career               <- Achievements + Compendium + mastery/next-goal overview
├─ Training             <- optional legacy Golden Run, if retained
└─ Settings
```

The exact visual layout belongs to #165/#167, but the semantic hierarchy is a product constraint.

Do not expose both Stage and Arena as peer campaign concepts.

---

# 8. Difficulty and failure

A compelling run needs enough danger that build decisions matter, but failure should teach rather than stall progression.

### Target

- early stages are winnable on a fresh save with basic competence;
- frontier stages become threatening before the player becomes bored;
- difficulty comes from readable combinations/space pressure, not invisible stat cliffs;
- bosses have learnable tells and phase escalation;
- failure gives enough persistent progress that the attempt was not meaningless, but repeating the easiest contract cannot be the dominant farming strategy;
- no content requires waiting or buying power.

---

# 9. Objective quality gates

Each contract objective must change movement/priority.

## Kill

Fails if it is merely “survive until the counter reaches N.” Enemy composition or tagged priority must create target/position decisions.

## Collect

Drops/targets should create movement routes and risk/reward exposure, not passively complete through ordinary pickup radius while circling.

## Survive

Must have pressure beats. A flat two-minute timer with the same composition is not a complete stage design.

## Defeat

Boss must own attention through readable attacks/phases and arena pressure. Normal enemies may support the encounter but cannot obscure boss tells.

---

# 10. Metrics/evidence to record during acceptance

Do not optimize solely from telemetry, but record enough evidence to diagnose dullness.

For each playtest stage capture:

```text
stage ID
character / persistent loadout
completion or death time
level reached
upgrade offer timestamps + choices + selected cards
weapon pickup/merge timestamps
elite/boss phase timestamps
damage/death source
objective progress timestamps
periods >35s with no meaningful state/decision change
post-run next action: retry / next / loadout / quit
qualitative: boring / tense / confusing / satisfying moments
```

No analytics service/account is required for Alpha 3. Dev/playtest summaries may remain local/test-only.

---

# 11. Explicit anti-patterns

Do **not** pursue engagement through:

- daily-login streaks;
- energy/refill timers;
- rewarded ads;
- loot-box scarcity;
- time-limited power;
- five parallel currencies;
- unreadable gear-score inflation;
- hundreds of near-identical upgrades;
- difficulty walls designed to force grinding;
- notification pressure;
- fake urgency;
- auto-play replacing movement decisions.

The game should be replayable because **runs vary and mastery improves**, not because the player is punished for leaving.

---

# 12. Alpha 3 fun gate

Architecture/test correctness is necessary but insufficient.

The next Alpha 3 candidate is **not product-PASS** until all of the following are true:

1. first-time player can start a normal contract without understanding Arena vs Stage;
2. no top-level menu item has an unclear product purpose;
3. normal contract contains frequent pressure/build beats, with no unexplained >35s dead stretch;
4. by roughly the midpoint the run has a describable build identity;
5. a successful run has multiple perceptible power moments;
6. each stage has a distinct encounter/objective thesis;
7. boss stages feel like climaxes;
8. rewards create one or two clear next choices rather than inventory dumps;
9. persistent systems have distinct jobs;
10. Retry/Next Contract returns the player to action quickly;
11. touch/controller/keyboard preserve the same decision model;
12. art/audio make upgrades, monsters, equipment, abilities and rewards immediately legible;
13. the player has a clear “what should I do next?” answer after every run;
14. at least one independent playtest pass describes the game as **fun/replayable without qualification by future content**.

A technical Alpha 3 build that fails this gate remains **NOT READY**, even with fully green CI.
