# Alpha 3 V4 Engagement Benchmark and Product PASS Conditions

**Status:** product/fun acceptance authority for the Alpha 3 V4 tranche.

**Implementation sequence authority:** `../architecture/alpha-3-final-execution-handoff.md`.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This document defines the outcome meant by “fun/replayable” without manipulative retention systems.

> **The player should want one more Contract because the next attempt promises a different build, visible power, a clear milestone and a short path back into action — not because of energy timers, streak pressure, ads, loot-box scarcity, daily chores or paid power.**

The repository non-negotiables remain: no ads, energy systems, paid progression, forced waiting, account dependency or copied gameplay expression.

---

# 1. Benchmark lessons

Successful survivor/one-hand action games repeatedly demonstrate useful product outcomes:

- movement/control is immediately understandable;
- offence has low control burden;
- build choices arrive frequently enough to change the run;
- power growth is visually/perceptually obvious;
- enemy pressure changes rather than remaining one flat wave;
- characters/loadouts meaningfully alter build decisions;
- bosses punctuate progression;
- restart/continue is fast.

Meowcenary borrows those **outcomes**, not another game’s characters, exact abilities, UI, economy, monetisation or progression expression.

---

# 2. Immediate agency

A first-time player should understand the physical loop within roughly 10 seconds:

```text
move -> auto-target/auto-fire -> avoid threats -> collect drops -> get stronger
```

The player should not need to understand Stage vs Arena or internal progression architecture before playing.

PASS:

- Home has one obvious **Play Contract** CTA;
- selected Mercenary/Loadout are visible but do not obstruct first play;
- Contract communicates objective/location/reward before Start.

---

# 3. Frequent meaningful change

A normal Contract fails when long stretches contain the same movement, same pressure and no meaningful build/objective decision.

Target beat cadence for a roughly 2–3 minute Contract:

| Window | Expected kind of change |
| --- | --- |
| 0–10s | movement/threat comprehension |
| 15–35s | first meaningful weapon/card/build beat |
| 30–60s | build identity begins to read |
| 45–90s | encounter/objective pressure changes |
| 90–135s | perceptible power spike and/or escalation |
| 135–180s | climax/extraction/boss punctuation where applicable |

A beat need not be a modal card. It may be a weapon pickup/merge, new enemy archetype, objective route shift, chest, active ability moment, boss phase or other real state change.

PASS:

> No normal Contract contains an unexplained **>35 second low-information stretch** where encounter pressure, objective state, player build and meaningful choices are all effectively unchanged.

---

# 4. Power must be felt

Small percentages are useful tuning components but weak as the only emotional reward.

A successful ordinary run should normally produce at least **three perceptible power moments**, such as:

- another weapon or higher weapon tier;
- visibly changed projectile count/spread/pierce/range/cadence;
- strong rare/family card;
- meaningful active-ability save/play;
- FIRE/EXPLOSIVE/PIERCING behavior becoming visible;
- major boss/Contract milestone opening a new persistent project.

Design rule:

> Memorable power is expressed through shape, count, cadence, threat response, synergy and audiovisual feedback; generic stats support those moments rather than replacing them.

---

# 5. Build identity by midpoint

By roughly the first half of a successful run, the player should be able to describe the build in ordinary language:

```text
fast SMG spray
heavy close shotgun
piercing pistol line
loot-heavy mobility build
```

If the best description is “my numbers went up,” the run-build layer is failing.

The existing run-upgrade/weapon modifier vocabulary is already sufficient for the first V4 pass. Do not introduce an arbitrary universal effect scripting layer merely to create variety.

Offer direction, when the eligible pool allows:

- one relevant equipped-family identity option;
- one useful general/defensive/economy alternative;
- wildcard/pivot opportunity;
- avoid four near-equivalent tiny stat choices;
- never offer family-specific content for a family that cannot currently benefit.

---

# 6. Contract is the product entry point

Player model:

```text
Contract
  -> location / Arena
  -> objective
  -> threat composition
  -> difficulty
  -> first-clear reward
```

Arena is location, not a peer campaign mode. Legacy Golden Run may remain as explicit Training if product-useful.

Each Contract has one thesis sentence:

> “This Contract is about ___, so the player must ___.”

If two Contracts reduce to the same sentence/behavior, one needs revision.

---

# 7. Forge must be a real second location identity

RC1 reused Junkyard broadly as architecture proof. V4 no longer treats that as the product target.

Forge chapter uses a real **Forge Foundry Arena/world bundle** through the existing Arena architecture:

- distinct spatial layout;
- collision-honest Forge world art;
- readable heat/hazard routing using existing registered mechanics;
- distinct spawn-lane/encounter composition;
- no second map/Arena engine.

Forge should feel different because space + encounter + art + reward cadence differ together, not because the same Junkyard is recolored.

---

# 8. Reward cadence

Do not dump whole systems at the player.

V4 first-clear grammar:

```text
fixed firstClearScrap
+ at most a small number of explicit headline persistent grants
+ before->after availability reveal
```

Ordinary Contract:

- fixed first-clear Scrap;
- normally one meaningful item/capability/project opening;
- ordinary world/run loot remains separate.

Boss milestone:

- one memorable headline reward/capability;
- stronger fixed Scrap;
- at most limited supporting persistent grants.

Do not grant entire Equipment Sets in one stage merely to demonstrate persistence machinery.

Equipment primarily opens through Set availability + fabrication. Parts use fabrication and/or explicit deterministic reward routes.

---

# 9. Persistent systems have distinct jobs

Player language:

```text
Contracts    = what I play next
Mercenary    = who I play
Loadout      = persistent build I bring
Gunsmith     = weapon-family engineering
Equipment    = armour/Set build
Achievements = accomplishments/goals
Compendium   = what I learned about monsters
Career       = presentation of goals/progress, not another power system
```

Generic top-level `Progression` and the legacy permanent-stat shop are retired in Save V4 according to `alpha-3-final-execution-handoff.md`.

Historical player spend is refunded deterministically; UI does not improvise migration behavior.

---

# 10. Persistent build identity

## Equipment

Every active Set needs a plain-language build thesis. Its 2-piece threshold reinforces that thesis; 4-piece is a stronger capstone. Mixed 2+2 remains legitimate.

V4 does not require eight bespoke mini-engines. Existing modifiers + shared registered weapon traits are used first. A new primitive is justified only by multiple concrete content needs or clear playtest evidence.

## Mercenaries

Changing Mercenary should change movement, ability timing and weapon/card valuation. Active ability is the main moment-to-moment differentiator; starting weapon/passive/art should point toward the same fantasy.

## Gunsmith

Persistent engineering should make FIRE/EXPLOSIVE/PIERCING and family-specific stat shaping visible and understandable. A selected family build remains installed even if that family is acquired later in the run.

---

# 11. Between-run loop

Win:

```text
clear -> reward/new availability -> Next Contract / Adjust Loadout / Replay
```

Loss:

```text
loss -> concise cause/build summary -> Retry / Adjust Loadout
```

Default win action: **Next Contract**.
Default loss action: **Retry**.

Target: Retry/Next returns to combat in roughly **5–10 seconds**, excluding deliberate loadout browsing.

Avoid forcing:

```text
result -> Home -> Career -> Loadout -> Home -> Contracts -> Start
```

for ordinary continuation.

---

# 12. Player-facing information architecture

Target:

```text
HOME
|- Play Contract
|- Mercenary
|- Loadout
|  |- Equipment
|  `- Gunsmith
|- Career
|  |- Next Goals
|  |- Achievements
|  `- Compendium
|- Training (optional Golden Run)
`- Settings
```

Every top-level item must have one clear job. The exact visual composition is owned by #165/#167.

---

# 13. Difficulty / objective quality

Difficulty should come from readable combinations and spatial pressure rather than invisible stat cliffs.

Early Contracts remain beatable fresh; frontier pressure rises before boredom; bosses have learnable tells/phases; failure teaches and still produces reasonable run progress without making the easiest Contract the dominant farm.

Objective quality:

- **Kill:** target/position priority, not merely wait for N generic deaths.
- **Collect:** creates movement/risk routes, not passive pickup completion while circling.
- **Survive:** composition/pressure changes; a flat timer is insufficient.
- **Defeat:** boss owns attention and readable phase/attack identity.

---

# 14. Evidence recorded per Contract

Capture:

```text
stage/Contract
Mercenary + persistent Loadout
completion/death time
level
upgrade offers/choices + timestamps
weapon pickup/merge timestamps
encounter/boss phase timestamps
objective progress timestamps
damage/death source
>35s low-information stretches
perceptible power moments
boring / confusing / tense / satisfying moments
post-run next action
```

This is playtest evidence, not a live-service analytics requirement.

---

# 15. Anti-patterns

Do not create engagement through:

- daily-login streaks;
- energy/refill timers;
- ads;
- loot-box scarcity;
- time-limited power;
- currency sprawl;
- gear-score inflation;
- hundreds of nearly identical upgrades;
- grind walls;
- notification pressure;
- fake urgency;
- auto-play replacing movement decisions.

Replayability should come from **run variation + mastery + meaningful persistent choice**.

---

# 16. Alpha 3 V4 product PASS

CI/correctness is necessary but not sufficient. Product PASS requires all of:

1. first-time player starts a normal Contract without decoding internal architecture;
2. every top-level destination has a clear job;
3. no unexplained >35s low-information stretch in normal Contracts;
4. build identity is describable by roughly midpoint;
5. successful run has multiple perceptible power moments;
6. every Contract has a distinct thesis;
7. Forge is a materially distinct Foundry location within the same Arena architecture;
8. bosses feel like climaxes;
9. rewards create clear next choices rather than inventory dumps;
10. persistent systems have distinct jobs;
11. Retry/Next is fast;
12. touch/controller/keyboard preserve the same gameplay decision model;
13. no dark-pattern retention mechanic is introduced;
14. at least one independent playtest verdict says the **integrated current build is fun/replayable now**.

A green test suite cannot substitute for item 14.
