# Alpha 3 Contract Content Matrix — Ten-Contract Product Pass

**Status:** reviewed first-pass content target for #171. Values are the initial tuning candidate; the stage theses, objective roles and progression sequence are the design authority.

**Implementation baseline:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Depends on:** `alpha-3-engagement-benchmark.md`, `alpha-3-loadout-economy.md`, #164/#166, and the V4 implementation blueprint.

This plan deliberately uses the **existing Stage → Arena + Objective + Encounter + Difficulty + Reward architecture**. It does not add an encounter scripting language.

The current spawn composer already creates one ordered layer per encounter member across the 120-second legacy cadence:

```text
4 enemies -> new layer every 30s
5 enemies -> every 24s
6 enemies -> every 20s
```

That is sufficient to build much better pacing before adding another runtime abstraction.

---

# 1. Remove one misleading RewardProfile field

Current `RewardProfile.lootTableId` is resolved into `ResolvedRunPlan` but StageRuntime never consumes it at clear time.

It is therefore not a real reward and should not appear in the V4 reward contract.

V4 target:

```ts
export interface RewardProfile {
  readonly id: string;
  readonly scrapBase: number;
  readonly scrapPerMinute: number;
  readonly grants?: readonly ProgressionGrant[];
}
```

Run-world loot remains owned by enemy/loot tables and WeaponRewardSystem. First-clear rewards remain deterministic.

Do not implement a second post-clear loot RNG system merely to make this stale field true.

---

# 2. Difficulty profiles — first-pass target

Difficulty is not the stage identity; it supports the authored encounter.

| ID | HP | Damage | Speed | Spawn pressure | Purpose |
| --- | ---: | ---: | ---: | ---: | --- |
| `difficulty:chapter-1-easy` | 1.00 | 1.00 | 1.00 | 0.20 | onboarding / early build formation |
| `difficulty:chapter-1-medium` | 1.15 | 1.08 | 1.02 | 0.35 | established Junkyard pressure |
| `difficulty:chapter-1-hard` | 1.30 | 1.15 | 1.04 | 0.50 | pre-boss Junkyard challenge |
| `difficulty:forge-medium` | 1.35 | 1.18 | 1.05 | 0.45 | Chapter 2 baseline + heat-space pressure |
| `difficulty:forge-hard` | 1.55 | 1.28 | 1.08 | 0.60 | late Forge |
| `difficulty:boss-crusher` | 1.60 | 1.25 | 0.95 | 0.40 | first boss; readable heavy threat |
| `difficulty:boss-forge` | 1.90 | 1.40 | 1.00 | 0.55 | final Alpha 3 climax |

These values require playtest. Do not lock balance because a spreadsheet looks tidy.

---

# 3. Encounter profiles

Weights affect cadence for that enemy layer; they do not create duplicate identity rows.

Keep weights modest. The base curve + difficulty already increases cadence, and a weight of 3 on a fast base wave can create unreadable spam.

## 3.1 `encounter:junkyard-first-scavenge`

```json
{
  "enemyIds": ["dust-mite", "scrap-skitter", "junk-rusher", "scrap-sniper"],
  "compositionWeights": {
    "dust-mite": 2,
    "scrap-skitter": 1,
    "junk-rusher": 1,
    "scrap-sniper": 1
  }
}
```

**Layers:** 0 / 30 / 60 / 90s.

Purpose: starts simple, then adds lateral movement, charge threat and finally ranged line pressure.

## 3.2 `encounter:junkyard-scrap-run`

```json
{
  "enemyIds": ["dust-mite", "scrap-skitter", "scrap-sniper", "junk-nester", "bastion-beetle"],
  "compositionWeights": {
    "dust-mite": 2,
    "scrap-skitter": 2,
    "scrap-sniper": 1,
    "junk-nester": 1,
    "bastion-beetle": 1
  }
}
```

Purpose: collection route becomes progressively less safe: flanking → ranged lane denial → spawner → shield wall.

## 3.3 `encounter:junkyard-rusher-ambush`

```json
{
  "enemyIds": ["dust-mite", "junk-rusher", "scrap-skitter", "shard-bot", "bastion-beetle"],
  "compositionWeights": {
    "dust-mite": 2,
    "junk-rusher": 2,
    "scrap-skitter": 2,
    "shard-bot": 1,
    "bastion-beetle": 1
  }
}
```

Purpose: 120-second movement exam. Threats increasingly punish holding one comfortable orbit.

## 3.4 `encounter:junkyard-brute-force`

```json
{
  "enemyIds": ["dust-mite", "trash-brute", "bastion-beetle", "shard-bot", "junk-nester"],
  "compositionWeights": {
    "dust-mite": 2,
    "trash-brute": 2,
    "bastion-beetle": 1,
    "shard-bot": 1,
    "junk-nester": 1
  }
}
```

Purpose: Brutes arrive at 24s and remain the objective target while shield/spawn/split bodies make target access harder.

## 3.5 `encounter:junkyard-crusher-boss`

```json
{
  "enemyIds": ["dust-mite", "junk-rusher", "bastion-beetle", "scrap-sniper"],
  "compositionWeights": {
    "dust-mite": 2,
    "junk-rusher": 1,
    "bastion-beetle": 1,
    "scrap-sniper": 1
  },
  "bossId": "boss-crusher"
}
```

Boss itself spawns immediately. Add layers arrive at 0/30/60/90s, creating escalation without delaying the fight.

## 3.6 `encounter:forge-hot-salvage`

```json
{
  "enemyIds": ["dust-mite", "shard-bot", "junk-nester", "scrap-sniper", "bastion-beetle"],
  "compositionWeights": {
    "dust-mite": 2,
    "shard-bot": 2,
    "junk-nester": 1,
    "scrap-sniper": 1,
    "bastion-beetle": 1
  }
}
```

Purpose: first Forge contract teaches that the new heat-grate space matters while split/spawn threats increase clutter around collection routes.

## 3.7 `encounter:forge-smelter-rush`

```json
{
  "enemyIds": ["dust-mite", "junk-rusher", "shard-bot", "scrap-skitter", "bastion-beetle"],
  "compositionWeights": {
    "dust-mite": 2,
    "junk-rusher": 2,
    "shard-bot": 2,
    "scrap-skitter": 1,
    "bastion-beetle": 1
  }
}
```

Purpose: speed + splitting + heat lanes. Survival is about continually changing route, not DPS-checking one target.

## 3.8 `encounter:forge-steel-wall`

```json
{
  "enemyIds": ["dust-mite", "bastion-beetle", "junk-nester", "trash-brute", "scrap-sniper"],
  "compositionWeights": {
    "dust-mite": 2,
    "bastion-beetle": 1,
    "junk-nester": 1,
    "trash-brute": 1,
    "scrap-sniper": 1
  }
}
```

Purpose: shielded objective targets arrive from 24s onward while spawner/tank/ranged support turns “walk behind the Beetle” into an actual positioning problem.

## 3.9 `encounter:forge-cut-the-feed`

```json
{
  "enemyIds": ["dust-mite", "scrap-sniper", "junk-nester", "junk-rusher", "shard-bot", "bastion-beetle"],
  "compositionWeights": {
    "dust-mite": 2,
    "scrap-sniper": 1,
    "junk-nester": 1,
    "junk-rusher": 1,
    "shard-bot": 1,
    "bastion-beetle": 1
  }
}
```

**Layers:** 0/20/40/60/80/100s.

Purpose: full-system pre-boss exam. Ranged objective targets begin at 20s; later melee/split/shield pressure interferes with reaching them.

## 3.10 `encounter:forge-warden-boss`

```json
{
  "enemyIds": ["dust-mite", "junk-rusher", "shard-bot", "junk-nester"],
  "compositionWeights": {
    "dust-mite": 2,
    "junk-rusher": 1,
    "shard-bot": 1,
    "junk-nester": 1
  },
  "bossId": "boss-forge"
}
```

Boss spawns immediately and also owns its registered reinforcement behavior. Normal layers punctuate rather than replace its tells.

---

# 4. Forge Foundry arena target

Add a second **ordinary ArenaDefinition**, not another map system.

Stable target ID:

```text
forge-foundry
```

Recommended first physical candidate:

```text
size: 768 × 1344
```

Keeping the same broad dimensions as Junkyard reduces camera/layout confounds while the layout itself changes.

## Major obstacle layout

```text
furnace-throat      x≈96  y≈448  w≈80 h≈80
cooling-manifold    x≈592 y≈832  w≈80 h≈80
```

Final rectangles follow collision-honest art review.

## Heat lanes

Initial hazard candidates:

```text
north heat grate: x≈288 y≈304 w≈192 h≈48
south heat grate: x≈288 y≈992 w≈192 h≈48
```

They span only the central lane so left/right bypasses remain. The player decides whether a short route is worth crossing heat, rather than facing a mandatory damage wall.

Start around **8 damage/sec** before difficulty/playtest tuning. Environmental damage timing remains HazardSystem-owned.

Use the art contract in `docs/art/alpha-3-v4-product-art-delta.md`.

## Spawn lanes

Use four edge-lanes with different offsets from Junkyard so the location does not play as an art reskin. Every spawn region must keep a witness clear of hazards/obstacles per existing validation.

---

# 5. Ten Contract matrix

The historical stable ID `stage:junkyard-06` is preserved for Forge Warden. It is already persistence identity even though its name is awkward. **Do not rename it merely for aesthetics.** UI never exposes the raw ID.

| Stable stage | Display name | Design sentence | Objective | Encounter | Difficulty | Arena |
| --- | --- | --- | --- | --- | --- | --- |
| `stage:junkyard-01` | First Scavenge | Learn the movement/build loop while threats become less one-dimensional. | Kill 25 | first-scavenge | chapter-1-easy | Junkyard |
| `stage:junkyard-02` | Scrap Run | Collect deliberately while flankers/ranged/spawners make safe routes expire. | Collect 14 Scrap | scrap-run | chapter-1-easy | Junkyard |
| `stage:junkyard-03` | Rusher Ambush | Keep moving for two minutes as increasingly mobile threats collapse a static orbit. | Survive 120s | rusher-ambush | chapter-1-medium | Junkyard |
| `stage:junkyard-04` | Brute Force | Hunt heavy Brutes while other archetypes protect/block the priority target. | Kill 8 `tank` | brute-force | chapter-1-hard | Junkyard |
| `stage:junkyard-05` | Scrap Crusher | Read and beat the first boss while add composition escalates around its tells. | Defeat Crusher | crusher-boss | boss-crusher | Junkyard |
| `stage:forge-01` | Hot Salvage | Learn Forge heat lanes while collecting under split/spawn pressure. | Collect 18 Scrap | hot-salvage | forge-medium | Foundry |
| `stage:forge-02` | Smelter Rush | Survive speed/split pressure while heat lanes invalidate lazy routing. | Survive 120s | smelter-rush | forge-medium | Foundry |
| `stage:forge-03` | Steel Wall | Break shielded priority targets by repositioning through a busier foundry. | Kill 10 `shielded` | steel-wall | forge-hard | Foundry |
| `stage:forge-04` | Cut the Feed | Hunt ranged threats while the full roster increasingly interferes with access. | Kill 12 `ranged` | cut-the-feed | forge-hard | Foundry |
| `stage:junkyard-06` | Forge Warden | Defeat a phase-changing boss while reinforcements and foundry space test the finished build. | Defeat Warden | warden-boss | boss-forge | Foundry |

### Review rule

If two rows can be rewritten into the same design sentence without changing player behavior, revise one before implementation.

---

# 6. Engagement beat expectations by Contract

These are test hypotheses, not hard-scripted spawn events.

## First Scavenge

```text
0s       swarm establishes movement
20–40s   expected first weapon reward/build choice
30s      flanker layer
60s      charger layer
90s      ranged layer if still active
```

A skilled player may clear before 90s; that is acceptable if the run already had meaningful build/weapon beats.

## Scrap Run

```text
0–24s    collect under simple pursuit
24s      flank pressure
48s      ranged pressure
72s      Nester starts multiplying bodies
96s      shielded blockers
```

Collection count must not complete passively before the player experiences at least two meaningful route changes in ordinary play.

## Rusher Ambush / Smelter Rush

Full 120s by definition, with five 24s enemy layers. These are the cleanest cadence reference stages and should never contain a >35s flat stretch.

## Brute Force / Steel Wall / Cut the Feed

Priority-target stages must tune target count/spawn cadence so the player cannot complete before the relevant supporting archetypes appear in a normal first-clear build. The counts above are starting candidates; playtest traces decide final values.

## Bosses

Boss at 0s. Add layers at 0/30/60/90s. Boss phase thresholds remain boss-data-owned. If a well-performing first-clear build kills the boss before later add layers, do not artificially gate its health merely to force the timeline; tune boss health/pressure only if the fight is anticlimactic.

---

# 7. Persistent unlock / fabrication cadence

Availability is derived from authoritative facts per `alpha-3-loadout-economy.md`.

| Milestone | Newly fabricable persistent content |
| --- | --- |
| Clear Junkyard 1 | Commando Set; Compact Receiver; Standard Barrel |
| Clear Junkyard 2 | Scavenger Set; Red-Dot Optic; Padded Stock |
| Clear Junkyard 3 | Demolition Set; Extended Magazine; Heavy Receiver; Equipment T2 upgrades |
| Clear Junkyard 4 | Recon Set; Long Barrel; Hair Trigger |
| Defeat Scrap Crusher | Juggernaut Set; Piercing Barrel; Fire Trait Core; Equipment T3 upgrades |
| Clear Forge 1 | Technician Set |
| Clear Forge 2 | Pyro Set |
| Clear Forge 3 | Medic Set |
| Clear Forge 4 | Grenade Launcher |
| Defeat Forge Warden | Equipment T4 upgrades; Mastered Fire Trait Core reward-only |

This cadence deliberately leaves Scrap spending choices open rather than instantly owning everything listed.

Existing character/achievement unlocks continue to provide parallel milestones, so persistent progression is not only gear.

---

# 8. First-clear RewardProfile target

RewardProfile Scrap is **first-clear only** in the current context transaction. Replays update best time without reconstructing the first-clear transaction. Ordinary in-run Scrap remains replayable progression.

The values below are initial tuning candidates.

| Reward profile | Base | /min | Deliberate persistent physical grant |
| --- | ---: | ---: | --- |
| `reward:stage-01` | 35 | 10 | Standard Barrel T1 |
| `reward:stage-02` | 45 | 15 | Red-Dot Optic T1 |
| `reward:stage-03` | 60 | 20 | Heavy Receiver T1 |
| `reward:stage-04` | 75 | 25 | Hair Trigger T1 |
| `reward:stage-05-boss` | 130 | 30 | Fire Trait Core T1 |
| `reward:forge-01` | 90 | 25 | none — Technician blueprint + Scrap is the choice |
| `reward:forge-02` | 105 | 28 | none — Pyro blueprint is the headline |
| `reward:forge-03` | 120 | 30 | none — Medic blueprint is the headline |
| `reward:forge-04` | 140 | 35 | Grenade Launcher T1 |
| `reward:stage-06-boss` | 180 | 40 | Mastered Fire Trait Core, reward-only; initial owned tier subject to modifier tuning |

No full Equipment Set instances are directly granted by these profiles.

### Reward reveal examples

After Junkyard 3:

```text
CLEAR — RUSHER AMBUSH
+100-ish first-clear Scrap (actual time-dependent value)
Heavy Receiver acquired
NEW BLUEPRINT: Demolition Set
NEW BLUEPRINT: Extended Magazine
Equipment upgrades can now reach T2
```

This is a lot of information, so UI groups it into:

```text
Reward
New projects
New capability
```

rather than a flat ten-row transaction log.

---

# 9. Mastered Fire Trait Core correction

The current Mastered Fire Trait Core has the same FIRE trait and no extra effect, so “Mastered” is not mechanically meaningful.

Before using it as the final boss headline reward, give the blueprint a modest **definition-owned** modifier in addition to FIRE, e.g. an extra damage multiplier delta. The exact starting value should be balance-tested.

Recommended target shape:

```json
{
  "id": "part:trait-fire-mastered",
  "rarity": "rare",
  "fabricationCost": null,
  "effects": [
    { "stat": "damage", "op": "mult", "value": 1.05 }
  ],
  "traits": ["FIRE"],
  "unlock": { "type": "boss-defeated", "bossId": "boss-forge" }
}
```

If the Warden grant intentionally supplies owned tier >1, the shared owned-tier scaling rule determines the extra modifier. The FIRE behavior itself does not secretly scale by tier.

Do not create `MASTERED_FIRE` as a second projectile behavior merely for the name.

---

# 10. Achievement reward cleanup

Achievement rewards should complement the Contract economy rather than recreate inventory dumps.

Initial rule:

- currency is fine;
- character unlock facts already have their own shared grant vocabulary;
- avoid direct Equipment piece grants unless the achievement is specifically about that item/Set;
- Crusher Down no longer needs to both unlock and grant a Commando Helmet after Commando has been available since Contract 1;
- Warden Down should not duplicate the Mastered Fire Core already owned by the boss first-clear transaction.

The exact active V4 achievement reward table gets reviewed after its stable-ID correction, but **no achievement may exist solely as a second route to the same headline reward from the same run**.

---

# 11. Replay/farming guardrails

The first-clear profile is not repeatable, but in-run Scrap is.

Check actual Scrap/minute during playtests for each stage.

A later stage should normally offer at least comparable expected Scrap/minute because:

- tougher enemies carry more Scrap;
- enemy cadence/pressure increases;
- the player’s stronger build kills faster.

Do not add punitive stage-specific replay multipliers in Alpha 3 unless telemetry/playtest proves First Scavenge is the dominant optimal farm.

If the easiest stage dominates, first fix enemy composition/value/time-to-clear. Do not introduce diminishing-return timers or daily caps.

---

# 12. Content tests

## Contract identity

- every active stage has one design-thesis metadata/test fixture in the planning/content validation layer;
- all normal non-boss 120s encounters have ≥4 roster layers unless an explicit reviewed reason exists;
- all 120s survival encounters have ≥5 layers for ≤24s composition cadence;
- objective enemyTag resolves to at least one encounter member archetype;
- target-tag stage can generate enough target enemies under its caps to complete;
- Forge stages reference `forge-foundry` + Forge asset bundle;
- boss IDs/objective/profile identities agree.

## Progression

- all Set unlock conditions are satisfiable along the stage ladder;
- every fabricable Part unlock condition is satisfiable;
- every reward-only Part has at least one deterministic source;
- no first-clear reward exceeds the persistent-grant density cap;
- no active reward profile carries dead `lootTableId` metadata.

## Determinism

- same seed + same content data produces identical composed waves;
- untouched stage seed behavior is allowed to change only where this content pass intentionally edits its encounter/difficulty data;
- upgrade/loot/weapon RNG streams remain isolated.

## Fun evidence

Automated content checks do not claim “fun.” Each Contract still needs real playtest traces against the engagement benchmark.

---

# 13. Playtest review order

Do not attempt to tune all ten simultaneously.

```text
1. First Scavenge       — onboarding/build cadence
2. Rusher Ambush        — clean 120s cadence reference
3. Scrap Crusher        — boss baseline
4. Hot Salvage          — Forge location/hazard comprehension
5. Smelter Rush         — Forge 120s pressure
6. Forge Warden         — final boss
7. remaining target/collection Contracts
```

At each checkpoint:

- record dead stretches;
- record level/upgrade/weapon timing;
- record death source;
- record whether the intended thesis was felt without reading the design document;
- revise data values before adding mechanics.

If an independent playtester describes a different stage fantasy than the intended sentence, investigate why rather than explaining the intended design to them.
