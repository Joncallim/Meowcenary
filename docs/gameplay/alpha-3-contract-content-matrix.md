# Alpha 3 V4 Contract Content Matrix — Ten-Contract Product Pass

**Status:** reviewed V4 content target for #171. Values are initial tuning candidates; Contract theses, objective roles, progression sequence and reward semantics are authoritative until playtest evidence changes them.

**Implementation baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Current authority:** read with `../architecture/alpha-3-final-execution-handoff.md`, `alpha-3-engagement-benchmark.md`, `alpha-3-loadout-economy.md`, and `../architecture/content-authoring-templates-v4.md`. If an older planning artifact disagrees, the final execution handoff wins.

This plan deliberately uses the existing:

```text
Stage/Contract
  -> Arena
  -> Objective
  -> Encounter profile
  -> Difficulty profile
  -> fixed first-clear RewardProfile
```

It does not add a general encounter scripting language.

The existing stage spawn composer can already create ordered pressure layers across a 120-second Contract:

```text
4 encounter members -> new layer about every 30s
5 encounter members -> about every 24s
6 encounter members -> about every 20s
```

Use that composition capability first. Add a new runtime mechanic only when real playtests prove the existing primitives cannot express the desired Contract.

---

# 1. V4 RewardProfile contract

RC1 `RewardProfile.lootTableId` is not consumed as a clear-time reward, and `scrapPerMinute` rewards delaying completion. Both are removed from the V4 first-clear contract.

Target:

```ts
export interface RewardProfile {
  readonly id: string;
  readonly firstClearScrap: number;
  readonly grants?: readonly ProgressionGrant[];
}
```

Rules:

- `firstClearScrap` is a fixed, deterministic first-clear amount;
- `grants` are explicit persistent headline grants only;
- ordinary world loot remains enemy/loot/weapon-reward owned;
- replay economy comes from normal in-run Scrap/loot, not replaying the first-clear transaction;
- do not invent a second post-clear loot RNG system;
- no full Equipment Set inventory dump.

A clear should answer: **what did I get, what became available, and what can I do next?**

---

# 2. Difficulty profiles — first tuning candidate

Difficulty supports the authored Contract; it is not the Contract identity.

| ID | HP | Damage | Speed | Spawn pressure | Purpose |
| --- | ---: | ---: | ---: | ---: | --- |
| `difficulty:chapter-1-easy` | 1.00 | 1.00 | 1.00 | 0.20 | onboarding / early build formation |
| `difficulty:chapter-1-medium` | 1.15 | 1.08 | 1.02 | 0.35 | established Junkyard pressure |
| `difficulty:chapter-1-hard` | 1.30 | 1.15 | 1.04 | 0.50 | pre-boss Junkyard challenge |
| `difficulty:forge-medium` | 1.35 | 1.18 | 1.05 | 0.45 | Forge baseline + spatial pressure |
| `difficulty:forge-hard` | 1.55 | 1.28 | 1.08 | 0.60 | late Forge |
| `difficulty:boss-crusher` | 1.60 | 1.25 | 0.95 | 0.40 | first boss; readable heavy threat |
| `difficulty:boss-forge` | 1.90 | 1.40 | 1.00 | 0.55 | final Alpha 3 climax |

These values must be tuned from real runs rather than frozen because the table looks tidy.

---

# 3. Encounter-profile targets

Weights affect cadence for an enemy layer; they do not create duplicate enemy identity. Keep them modest because base cadence + difficulty already increases pressure.

## 3.1 First Scavenge

`encounter:junkyard-first-scavenge`

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

Layers: approximately 0 / 30 / 60 / 90s. Starts simple, then adds lateral movement, charge threat and ranged line pressure.

## 3.2 Scrap Run

`encounter:junkyard-scrap-run`

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

Collection routes become progressively less safe: flank pressure -> ranged lane denial -> spawner -> shield wall.

## 3.3 Rusher Ambush

`encounter:junkyard-rusher-ambush`

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

A two-minute movement exam. Increasingly mobile/splitting threats punish holding one comfortable orbit.

## 3.4 Brute Force

`encounter:junkyard-brute-force`

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

Brutes are the priority target while shield/spawn/split bodies make target access progressively harder.

## 3.5 Scrap Crusher boss

`encounter:junkyard-crusher-boss`

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

Boss spawns immediately. Add layers escalate around its tells; they do not delay the fight.

## 3.6 Hot Salvage

`encounter:forge-hot-salvage`

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

First Forge Contract teaches heat-lane routing while split/spawn threats increase clutter around collection paths.

## 3.7 Smelter Rush

`encounter:forge-smelter-rush`

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

Speed + splitting + heat lanes. Survival is continual route change, not a stationary DPS check.

## 3.8 Steel Wall

`encounter:forge-steel-wall`

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

Shielded priority targets plus spawner/tank/ranged support make repositioning the actual objective skill.

## 3.9 Cut the Feed

`encounter:forge-cut-the-feed`

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

Approximately 0/20/40/60/80/100s layers. Ranged priority targets begin early; later melee/split/shield pressure interferes with reaching them.

## 3.10 Forge Warden boss

`encounter:forge-warden-boss`

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

Boss spawns immediately and owns its registered reinforcement behavior. Normal layers punctuate rather than replace boss tells.

---

# 4. Forge Foundry Arena target

Add one ordinary `ArenaDefinition`, not another map system.

Stable target ID:

```text
forge-foundry
```

First physical candidate:

```text
size: 768 x 1344
```

Keeping broad dimensions near Junkyard reduces camera/layout confounds while spatial structure changes.

Candidate major obstacles:

```text
furnace-throat      x~96  y~448  w~80 h~80
cooling-manifold    x~592 y~832  w~80 h~80
```

Candidate heat lanes:

```text
north heat grate: x~288 y~304 w~192 h~48
south heat grate: x~288 y~992 w~192 h~48
```

They occupy only the central lane so left/right bypasses remain. Initial tuning around 8 damage/sec is a playtest hypothesis, not a frozen balance value. Hazard timing remains `HazardSystem` owned.

Use four edge lanes with offsets distinct from Junkyard. Every spawn region must retain a valid witness clear of obstacles/hazards under existing validation.

World art/resource ownership follows `../art/alpha-3-v4-product-art-delta.md` and #170.

---

# 5. Ten-Contract release matrix

Historical `stage:junkyard-06` is already persistence identity for Forge Warden. Preserve it; do not rename it only for chapter symmetry. The raw ID is not player-facing.

| Stable Stage | Display name | Design sentence | Objective | Encounter | Difficulty | Arena |
| --- | --- | --- | --- | --- | --- | --- |
| `stage:junkyard-01` | First Scavenge | Learn movement/build flow while threats become less one-dimensional. | Kill 25 | first-scavenge | chapter-1-easy | Junkyard |
| `stage:junkyard-02` | Scrap Run | Collect deliberately while changing threats invalidate safe routes. | Collect 14 Scrap | scrap-run | chapter-1-easy | Junkyard |
| `stage:junkyard-03` | Rusher Ambush | Keep moving for two minutes as mobile threats collapse a static orbit. | Survive 120s | rusher-ambush | chapter-1-medium | Junkyard |
| `stage:junkyard-04` | Brute Force | Hunt Brutes while supporting archetypes obstruct priority-target access. | Kill 8 `tank` | brute-force | chapter-1-hard | Junkyard |
| `stage:junkyard-05` | Scrap Crusher | Read and beat the first boss while adds escalate around its tells. | Defeat Crusher | crusher-boss | boss-crusher | Junkyard |
| `stage:forge-01` | Hot Salvage | Learn heat-lane routing while collecting under split/spawn pressure. | Collect 18 Scrap | hot-salvage | forge-medium | Foundry |
| `stage:forge-02` | Smelter Rush | Survive speed/split pressure while heat lanes invalidate lazy routes. | Survive 120s | smelter-rush | forge-medium | Foundry |
| `stage:forge-03` | Steel Wall | Break shielded targets through deliberate repositioning. | Kill 10 `shielded` | steel-wall | forge-hard | Foundry |
| `stage:forge-04` | Cut the Feed | Hunt ranged threats while the full roster interferes with access. | Kill 12 `ranged` | cut-the-feed | forge-hard | Foundry |
| `stage:junkyard-06` | Forge Warden | Defeat a phase-changing boss while reinforcements and Foundry space test the finished build. | Defeat Warden | warden-boss | boss-forge | Foundry |

Review rule:

> If two rows can be rewritten into the same design sentence without changing player behavior, revise one before implementation.

---

# 6. Engagement beat expectations

These are hypotheses for traces/playtests, not hard-scripted spawn events.

### First Scavenge

```text
0s       swarm establishes movement
20-40s   expected first weapon/build decision
30s      flanker layer
60s      charger layer
90s      ranged layer if still active
```

A skilled early clear is acceptable if the run already produced meaningful threat/build decisions.

### Scrap Run

```text
0-24s    collect under simple pursuit
24s      flank pressure
48s      ranged pressure
72s      Nester multiplies bodies
96s      shielded blockers
```

The collection count should not complete passively before ordinary first-clear play experiences meaningful route changes.

### Rusher Ambush / Smelter Rush

Full 120s by definition, with roughly 24s composition changes. These are the cleanest cadence reference Contracts and should never contain an unexplained >35s low-information stretch.

### Priority-target Contracts

Brute Force / Steel Wall / Cut the Feed tune target count/cadence so normal first-clear builds experience supporting archetypes before completion. Final target counts come from playtest traces.

### Bosses

Boss starts at 0s. Add layers may arrive around 0/30/60/90s while boss phase thresholds remain boss-data owned. Do not health-gate a strong player merely to force every timeline beat; tune only if the fight is genuinely anticlimactic.

---

# 7. Persistent availability / fabrication cadence

Availability is derived from authoritative facts via the shared V4 resolver in `alpha-3-loadout-economy.md`.

| Milestone | Newly available persistent projects/capability |
| --- | --- |
| Clear Junkyard 1 | Commando Set; Compact Receiver; Standard Barrel |
| Clear Junkyard 2 | Scavenger Set; Red-Dot Optic; Padded Stock |
| Clear Junkyard 3 | Demolition Set; Extended Magazine; Heavy Receiver; Equipment T2 capability |
| Clear Junkyard 4 | Recon Set; Long Barrel; Hair Trigger |
| Defeat Scrap Crusher | Juggernaut Set; Piercing Barrel; Fire Trait Core; Equipment T3 capability |
| Clear Forge 1 | Technician Set |
| Clear Forge 2 | Pyro Set |
| Clear Forge 3 | Medic Set |
| Clear Forge 4 | Grenade Launcher |
| Defeat Forge Warden | Equipment T4 capability; Mastered Fire Trait Core headline reward |

These are **availability** changes, not automatic ownership. Scrap spending choices remain meaningful.

Equipment tier capability is governed by the one global V4 Equipment policy. Do not duplicate T2/T3/T4 conditions on each Set.

---

# 8. Fixed first-clear RewardProfile target

The values below are initial tuning candidates and are **exact fixed first-clear Scrap**, not time-dependent formulas.

| Reward profile | `firstClearScrap` | Deliberate persistent physical grant |
| --- | ---: | --- |
| `reward:stage-01` | 35 | Standard Barrel T1 |
| `reward:stage-02` | 45 | Red-Dot Optic T1 |
| `reward:stage-03` | 60 | Heavy Receiver T1 |
| `reward:stage-04` | 75 | Hair Trigger T1 |
| `reward:stage-05-boss` | 130 | Fire Trait Core T1 |
| `reward:forge-01` | 90 | none — Technician availability + Scrap is the choice |
| `reward:forge-02` | 105 | none — Pyro availability is the headline |
| `reward:forge-03` | 120 | none — Medic availability is the headline |
| `reward:forge-04` | 140 | Grenade Launcher T1 |
| `reward:stage-06-boss` | 180 | Mastered Fire Trait Core, reward-only |

No full Equipment Set is directly granted by these profiles.

Example after Junkyard 3:

```text
CLEAR — RUSHER AMBUSH
+60 first-clear Scrap
Heavy Receiver acquired
NEW PROJECT: Demolition Set
NEW PROJECT: Extended Magazine
Equipment upgrades can now reach T2
```

The UI groups this into `Reward`, `New projects`, and `New capability`; it does not expose a flat transaction ledger.

---

# 9. Mastered Fire Trait Core correction

The RC1 Mastered Fire definition has the same FIRE trait and no meaningful extra mechanical identity. V4 makes it a Warden milestone reward while reusing the same shared FIRE behavior.

Target definition shape:

```json
{
  "id": "part:trait-fire-mastered",
  "name": "Mastered Fire Trait Core",
  "slot": "trait",
  "rarity": "rare",
  "presentation": {
    "iconArtId": "gun-part-icon:trait-fire-mastered"
  },
  "effects": [
    { "stat": "damage", "op": "mult", "value": 1.05 }
  ],
  "traits": ["FIRE"],
  "unlock": { "type": "boss-defeated", "bossId": "boss-forge" }
}
```

Important V4 details:

- **no static Part definition tier**;
- **no `fabricationCost` field**: absence means reward-only/non-fabricable;
- **no authored owner `sourceId`**;
- owned instance carries engineering tier;
- if the reward supplies an owned tier above 1, shared tier scaling applies to the modifier only;
- FIRE itself is one shared behavior and does not secretly scale by tier;
- do not create `MASTERED_FIRE` merely because the display name says Mastered.

---

# 10. Achievement reward cleanup

Achievement rewards complement Contract progression rather than recreate inventory dumps.

Rules:

- currency rewards are fine;
- authoritative stage/boss/achievement/mastery facts do not need duplicate shadow unlock tokens;
- avoid direct Equipment grants unless the achievement is specifically about that item/Set;
- Crusher Down should not also recreate an early Commando acquisition path;
- Warden Down should not duplicate the Mastered Fire Core already supplied by the boss first-clear transaction;
- retired Well Protected is historical migration state, not active V4 content.

No achievement should exist solely as a second route to the exact same headline reward from the same run.

---

# 11. Replay/farming guardrails

First-clear reward profiles do not repeat. In-run Scrap does.

Measure actual Scrap/minute per Contract. Later Contracts should normally remain at least competitive because tougher enemies/cadence and stronger builds increase ordinary run income.

If First Scavenge becomes the dominant farm, first fix enemy composition/value/time-to-clear. Do not add daily caps, punitive replay multipliers or manipulative diminishing-return systems without evidence.

---

# 12. Generic content gates

### Contract identity

- every active Contract has one plain-language thesis;
- normal 120s encounters have enough ordered layers to avoid unexplained flat pacing;
- objective `enemyTag` resolves to an encounter archetype;
- target-tag Contract can generate enough valid targets under caps;
- Forge Contracts reference `forge-foundry` + Forge asset bundle;
- boss IDs/objective/profile identities agree.

### Progression/acquisition

- all Set unlock conditions are satisfiable;
- all fabricable Parts have satisfiable unlocks/costs;
- every reward-only Part has at least one deterministic source;
- no first-clear reward exceeds the persistent-grant density cap;
- no active RewardProfile contains `lootTableId`, `scrapPerMinute`, or another time-scaled first-clear field;
- global Equipment tier policy is referenced once, not duplicated across Sets.

### Determinism

- same seed + same content data produces identical composed waves;
- old deterministic pools change only when deliberately edited;
- upgrade/loot/weapon/spawn RNG streams remain isolated.

### N+1

Synthetic Contract 25 using existing primitives must require only data/profile/art changes. No Stage-core, scene, save-schema, loader-core or validator-ID registration.

### Fun evidence

Automated checks never claim “fun.” Each Contract still needs real playtest traces against `alpha-3-engagement-benchmark.md`, including dead stretches, build choices, power spikes, confusion and post-run desire to continue.