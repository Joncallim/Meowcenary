# Alpha 3 V4 Loadout Economy — Fabrication, Set Identity and Acquisition

**Status:** final product/gameplay contract for the persistent Loadout economy used by #170/#171/#167.

**Execution authority:** `../architecture/alpha-3-final-execution-handoff.md`.

**Authoring authority:** `../architecture/content-authoring-templates-v4.md`.

**RC1 baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The V4 problem is not merely that RC1 rewards dump too much gear. The persistent systems need a coherent economic loop:

```text
complete Contract / milestone
        ↓
authoritative progression fact opens Set/Part project
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

Do not create a parallel blueprint-unlock database when authoritative progression facts already exist.

## Equipment Sets

Each `EquipmentSetDefinition` owns one normal `ProgressionCondition` and one `pieceFabricationCost`.

When the Set condition is true, its missing pieces are fabricable. The player does not also need a duplicate `set:*` token in `progression.unlocks`.

## Gun Parts

Each Part may own:

```ts
unlock?: ProgressionCondition
fabricationCost?: number
```

Interpretation:

- positive `fabricationCost` + condition true => fabricable;
- absent cost => reward-only / non-fabricable;
- absent or `always` unlock means no progression gate beyond fabrication cost.

Do not use `null` as a second reward-only convention; **field absence** is the V4 contract.

## Direct owned-item rewards

A Contract/Boss/Achievement may still grant a physical owned instance when the item itself is the headline reward.

Useful V4 examples:

- First Scavenge -> one Standard Barrel;
- Scrap Crusher -> one Fire Trait Core;
- Forge Warden -> reward-only Mastered Fire Trait Core.

Do not pair every physical reward with a duplicate unlock token when availability already comes from Stage/Boss/Achievement truth.

---

# 2. Definition versus owned-instance state

## Parts

`PartInstance.tier` remains the actual engineering tier produced by merging.

```ts
interface PartInstance {
  partId: string;
  tier: 1 | 2 | 3 | 4 | 5;
  infusedTraits: BehaviorTrait[];
}
```

The static Part definition does **not** have a `tier`.

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

## Equipment

Static Equipment definitions are blueprints/items, not owned copies. Remove catalog `tier: 1`.

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

Owned Equipment instance carries its current tier.

---

# 3. Source-free modifiers and correct tier scaling

Definition rows declare the modifier, not a second copy of the owner identity.

```ts
interface ModifierSpec {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
}
```

Runtime derives `sourceId` from the owned instance, Set threshold or Ability owner.

Shared tier scaling:

```text
add  => value × tier
mult => 1 + (value - 1) × tier
```

Examples:

| Base | T1 | T2 | T3 |
| --- | ---: | ---: | ---: |
| +35 range | +35 | +70 | +105 |
| 1.12× damage | 1.12× | 1.24× | 1.36× |
| 0.94× modifier | 0.94× | 0.88× | 0.82× |

Validation rejects a multiplier whose supported-tier extrapolation becomes non-positive.

Equipment and Gunsmith share this helper.

---

# 4. First-class Equipment Set model

Set owns Set facts:

```ts
interface EquipmentSetThresholdBonus {
  modifiers: readonly ModifierSpec[];
  weaponTraits?: readonly BehaviorTrait[];
}

interface EquipmentSetDefinition {
  id: string;
  name: string;
  description: string;
  unlock: ProgressionCondition;
  pieceFabricationCost: number;
  presentation: { emblemArtId: string };
  setBonuses: {
    2: EquipmentSetThresholdBonus;
    4: EquipmentSetThresholdBonus;
  };
}
```

No Set bonus/availability/tier rule lives on an arbitrary helmet or other provider piece.

---

# 5. One global Equipment tier policy

RC1’s Sets all repeat the same tier milestones. Moving that table from one provider piece into every Set would preserve duplicated truth.

V4 uses one global policy:

```ts
interface EquipmentUpgradeRules {
  unlocks: {
    2: ProgressionCondition;
    3: ProgressionCondition;
    4: ProgressionCondition;
  };
}
```

Initial release target:

```json
{
  "unlocks": {
    "2": { "type": "stage-cleared", "stageId": "stage:junkyard-03" },
    "3": { "type": "boss-defeated", "bossId": "boss-crusher" },
    "4": { "type": "boss-defeated", "bossId": "boss-forge" }
  }
}
```

Set N+1 automatically consumes the same current release policy.

Do not add per-Set override machinery until a real design requires it.

---

# 6. Initial Equipment Set theses

Values are first tuning candidates. The thesis/differentiation is more important than numeric neatness.

| Set | Availability | Piece cost | 2-piece thesis | 4-piece thesis |
| --- | --- | ---: | --- | --- |
| Commando | clear Junkyard 1 | 45 | attack tempo | precision/projectile speed |
| Scavenger | clear Junkyard 2 | 50 | Scrap economy | pickup + XP efficiency |
| Demolition | clear Junkyard 3 | 60 | damage | shared `EXPLOSIVE` behavior |
| Recon | clear Junkyard 4 | 65 | movement | reach/projectile speed |
| Juggernaut | Scrap Crusher | 75 | health | maximum forgiveness |
| Technician | clear Forge 1 | 80 | projectile speed | projectile count with spread trade-off |
| Pyro | clear Forge 2 | 90 | damage | shared `FIRE` behavior |
| Medic | clear Forge 3 | 90 | flat health | health + modest movement |

Mixed 2+2 builds remain valid.

Alpha 3 does not invent a bespoke heal-on-kill/regen engine solely to make Medic’s name literal. If real playtests show the Set still lacks identity, either revise the display fantasy or justify one reusable recovery primitive with evidence.

---

# 7. Shared weapon behavior traits

FIRE / EXPLOSIVE / PIERCING are gameplay-owned reusable weapon behaviors, not Gunsmith-only concepts and not Set-ID branches.

Conceptually:

```text
FIRE      -> burn
EXPLOSIVE -> splash
PIERCING  -> pierce
```

Gunsmith owns how Parts carry/infuse traits. Equipment Set thresholds may also contribute them globally.

Build a unique trait Set per weapon family before resolving effects:

- active Equipment traits apply to all relevant weapon families;
- selected Gunsmith build traits apply to its engineered family;
- duplicate trait ID is applied once per family.

Example: Pyro 4-piece FIRE + pistol Gunsmith FIRE = one FIRE behavior on pistol, not doubled burn.

---

# 8. Equipment fabrication

Equipment duplicates have no current purpose, so each definition can have at most one owned instance.

Eligibility:

```text
Set condition true
AND definition not already owned
AND Scrap >= Set pieceFabricationCost
```

Authoritative command receives only `equipmentId`; persistence re-resolves current Set, condition, cost, ownership and Scrap.

Use deterministic owned identity, e.g.:

```text
owned:equipment-commando-helmet
```

Candidate save atomically:

```text
progression.scrap -= cost
equipment[ownedId] = { equipmentId, tier: 1 }
```

Persist once, publish once. Storage failure publishes neither spend nor item.

No durable external-event receipt is needed for this direct interactive purchase.

---

# 9. Part fabrication serials

Part duplicates are legitimate because merge consumes two copies.

Save V4 extends Gunsmith state with per-definition serials:

```ts
interface GunsmithState {
  builds: Build[];
  parts: Record<string, PartInstance>;
  fabricationSerials: Readonly<Record<string, number>>;
  selectedBuildId?: string;
}
```

For `part:barrel-standard`, serial 3:

```text
owned:part-barrel-standard:3
```

Serial means **last successfully persisted fabricated copy number**. It never decreases after merge/consumption, so an old instance ID is never reused accidentally.

Eligibility:

```text
definition exists
AND fabricationCost exists
AND unlock condition passes
AND enough Scrap
AND next serial is safe/bounded
AND derived ID is unused
```

Candidate save atomically spends Scrap, creates T1 owned Part, and increments the serial.

Migration initializes serial maps safely; sanitizer never reconstructs/decrements serial from current inventory.

---

# 10. Initial Part availability direction

The detailed Contract cadence lives in `alpha-3-contract-content-matrix.md`. The V4 release progression is approximately:

```text
Junkyard 1 -> Compact Receiver, Standard Barrel
Junkyard 2 -> Red-Dot Optic, Padded Stock
Junkyard 3 -> Extended Magazine, Heavy Receiver
Junkyard 4 -> Long Barrel, Hair Trigger
Crusher    -> Piercing Barrel, Fire Trait Core
Forge 4    -> Grenade Launcher
Warden     -> Mastered Fire Trait Core reward-only
```

Fabrication costs should make common projects reachable from early play while advanced/behavioral Parts require a meaningful save/spend choice. Final values are tuning, not architecture.

---

# 11. Mastered Fire correction

`part:trait-fire-mastered` is not a second FIRE mechanic.

V4 target:

- same shared `FIRE` trait;
- modest definition modifier so “Mastered” is mechanically meaningful;
- boss-forge/Warden milestone visibility;
- **no `fabricationCost` field**, so it is reward-only;
- no static definition tier;
- owned reward instance carries engineering tier.

Do not create `MASTERED_FIRE` just for naming symmetry.

---

# 12. Persistent Gunsmith family semantics

The selected Gunsmith build engineers one weapon family. It does **not** inject a second starting weapon.

At run start:

- if the engineered family is already present, engineering is active immediately;
- if absent, family-scoped engineering remains installed and activates when that family is acquired later.

UI says either:

```text
Engineered SMG — active from start
```

or

```text
Engineered SMG — activates when an SMG is acquired
```

This keeps Mercenary starting-weapon identity and Gunsmith persistence simultaneously meaningful.

---

# 13. Pure persistent Loadout resolver

Do not keep Equipment/Gunsmith composition scattered through `GameScene`.

One pure resolver consumes:

```text
validated Set/Equipment/Part/weapon registries
+ owned Equipment/Gunsmith Save V4 state
+ selected Mercenary/run weapon families
```

and returns effective:

```text
player modifiers
family-scoped weapon modifiers
unique weapon behavior traits/effects per family
presentation/read-model facts where useful
```

Scene code applies the result; it does not decide persistence/loadout rules.

---

# 14. Reward integration

V4 clear rewards are deliberately narrow:

```text
fixed firstClearScrap
+ at most one or two explicit headline persistent grants
```

**No RewardProfile loot-table reference.** Ordinary enemy/world loot remains its own runtime system and is not simulated at clear time.

Set/Part availability normally derives from the Stage/Boss/Achievement facts that were just durably persisted. Result UI shows the before->after availability diff rather than reconstructing a flat unlock receipt bag.

Do not grant all four pieces merely because a Set became fabricable.

---

# 15. Acquisition coverage validation

A release definition is not valid if no player can ever obtain it.

Generic validation must prove:

- Set conditions are satisfiable along active progression;
- Set `pieceFabricationCost` is positive/bounded;
- fabricable Part condition/cost is satisfiable;
- reward-only Part has at least one deterministic reward source;
- no self-owned/circular route makes advertised content impossible;
- global Equipment tier policy milestones are reachable;
- adding global content does not implicitly enter old reward/loot pools.

---

# 16. Player-facing availability resolver

One pure resolver serves Home/Career/Mercenary/Equipment/Gunsmith/result reveal.

Conceptually:

```text
selectable Character IDs
fabricable Equipment Set IDs
fabricable Part IDs
maximum Equipment tier capability
```

UI receives immutable read models; it never reimplements conditions or costs.

The result screen compares run-start and post-settlement availability snapshots to say what **became available this run**.

---

# 17. Persistence / migration

Save V4 owns the structural changes. The historical physical LocalStorage key remains `meowcenary.save.v2` so older saves are still found.

Important invariants:

- write-first/atomic persistence;
- no optimistic item/currency publication on storage failure;
- stable content IDs survive content expansion;
- stale owned definition IDs fail soft;
- ordinary new Set/Equipment/Part definitions do not require structural migration;
- fabrication serials never reuse an old fabricated Part ID.

---

# 18. N+1 / scale acceptance

## Set 12 + 48 pieces

Must require:

```text
1 Set row + 4 plain piece rows per Set
+ presentation art
```

and automatically use:

- global tier policy;
- fabrication;
- 2/4 threshold resolution;
- mixed 2+2 handling;
- shared modifier/trait rules.

No provider piece, per-Set tier gates, static definition tier, authored source ID, controller branch or save-shape edit.

## Part 50

Existing slot/stat/trait + definition/art + explicit fabricable/reward route. No Gunsmith-core, loader, renderer or validator-ID registration.

## Failure tests

Pin:

- T2/T3 multiplier math;
- duplicate Equipment fabrication prevention;
- Part serial durability across merge/consumption;
- storage-failure atomicity;
- family engineering activation after later weapon acquisition;
- trait dedupe across Equipment + Gunsmith;
- acquisition coverage/cycle rejection.

---

# 19. Product PASS

Persistent Loadout economy passes when:

- Scrap creates meaningful choice rather than a generic stat tax;
- Set unlock creates projects, not an inventory shower;
- Equipment/Gunsmith have distinct understandable jobs;
- shared traits make build identity visible;
- tier upgrades are understandable and globally consistent;
- persistent power supports rather than replaces run decisions;
- pointer/touch/keyboard/controller can browse, fabricate, compare, equip, fit, merge and back;
- new ordinary content follows the V4 template without hidden authoring conventions.
