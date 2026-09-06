# Alpha 3 V4 Monster Compendium / Bestiary

**Status:** implementation-ready V4 plan for Issue #168. Planning only; no runtime feature is implemented by this document.

**RC1 baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Execution authority:** `alpha-3-final-execution-handoff.md`.

**N+1 authoring authority:** `content-authoring-templates-v4.md`.

The Compendium is a field guide and collection surface over existing enemy/boss/encounter/stage/art truth. It is **not a second enemy database**.

---

# 1. Product outcome

A player can open Career -> Compendium and understand:

- which threats they have actually encountered;
- what each discovered threat does;
- what tells are visible in play;
- how to respond;
- where the threat appears;
- how boss mechanics/phases change the fight;
- Meowcenary’s creature personality and production art.

Discovery happens naturally through play. Do not add arbitrary “kill 100 for paragraph three” grind tiers.

Initial active roster:

```text
Dust Mite
Junk Rusher
Trash Brute
Scrap Sniper
Scrap Skitter
Bastion Beetle
Junk Nester
Shard Bot
Scrap Crusher
Forge Warden
```

Enemy N+1 must enter the same system through definition/art/editorial data and existing mechanics.

---

# 2. One authority per fact

Derived combat/product truth:

```text
name / archetype / stats / actions / phases -> enemy definition + registered mechanics
Found In                              -> encounter profiles -> Contracts/Stages
actor art                             -> logical visual-art registry/resources
discovery status                      -> Save V4 Compendium domain
```

Compendium-owned data is deliberately narrow editorial/presentation copy:

```ts
interface CompendiumEntryDefinition {
  enemyId: string;
  fieldNote: string;
  behaviour: string;
  tells: string;
  counterplay: string;
  spoilerPolicy?: CompendiumSpoilerPolicy;
  displayOrder?: number;
}
```

Do **not** manually duplicate:

- health/damage/speed numbers;
- stage lists;
- encounter IDs;
- boss action arrays;
- reward tables;
- art paths;
- kill totals that have no product use.

A balance/content edit should flow through the read model automatically.

---

# 3. Hard prerequisite: universal enemy death settlement

RC1 has a real lifecycle-authority gap:

- `Enemy.takeDamage()` owns health/death state;
- `WeaponSystem.applyProjectileDamage()` separately increments run kills and emits `enemy:killed`;
- Heat Vent / elemental burst may call enemy damage directly and can therefore bypass the WeaponSystem kill settlement.

Compendium **must not** paper over this with its own kill event.

Before defeated discovery ships, V4 creates one narrow reusable post-damage/death boundary used by every lethal source:

```text
direct projectile
explosive splash
burn tick
Heat Vent / elemental burst
future lethal source
```

On the one authoritative alive -> dead transition, exactly once:

- run kill count increments;
- existing canonical `enemy:killed` publishes its payload;
- Stage objective, achievement, drop/presentation and Compendium consumers see the same fact.

Shield-blocked, nonlethal and repeated post-death damage publish no kill.

Do not add `enemy:defeated`, `compendium:killed`, or another parallel death fact.

---

# 4. Encounter discovery uses the existing spawn fact

RC1 already emits `enemy:spawned` after a valid enemy is constructed/materialised.

Compendium encountered state consumes that event.

Do **not** add `enemy:encountered`; it would duplicate the same lifecycle edge and could drift from future spawn paths.

These do not count as encountered:

- preloaded art;
- encounter-profile membership;
- failed spawn attempt;
- hidden catalog definition;
- cosmetic preview outside real play.

---

# 5. Save V4 discovery state

One explicit sparse domain:

```ts
interface CompendiumSaveV4 {
  enemies: Readonly<Record<string, 'encountered' | 'defeated'>>;
}
```

Semantics:

```text
absence      = unseen
encountered  = spawned in real gameplay
defeated     = canonical enemy:killed accepted; implies encountered
```

Properties:

- monotonic (`unseen < encountered < defeated`);
- stale deleted IDs fail soft;
- Enemy N+1 requires no structural save migration;
- repeated spawn/kill events are idempotent.

## Migration

V3 cannot safely reconstruct ordinary per-enemy discovery from aggregate total kills or stage membership.

V4 migration may backfill only already-authoritative historical facts, e.g. known defeated bosses from the boss save domain.

Do not fabricate ordinary enemy encounter/defeat history.

The historical physical LocalStorage key remains unchanged according to the final execution handoff.

---

# 6. Persistence failure semantics

Discovery updates go through the normal write-first persistence boundary.

On storage failure:

- do not publish optimistic durable discovery;
- optionally keep an in-memory retry marker containing only the highest pending status per enemy;
- retry later from the authoritative event fact;
- never downgrade a successfully persisted status.

Compendium UI reads accepted save state rather than inventing a second mutable cache as truth.

---

# 7. Read model

Build a pure/generic read model from:

```text
Enemy registry
+ Compendium editorial registry
+ encounter/stage registries
+ logical art registry
+ sparse discovery save
```

Conceptual row:

```ts
interface CompendiumRow {
  enemyId: string;
  status: 'unseen' | 'encountered' | 'defeated';
  name?: string;
  artId?: string;
  threatTags?: readonly string[];
  fieldNote?: string;
  behaviour?: string;
  tells?: string;
  counterplay?: string;
  foundIn?: readonly CompendiumStageRef[];
  boss?: CompendiumBossSummary;
}
```

Visibility policy decides which fields are populated for each status. UI does not read raw registries and recreate spoiler rules itself.

---

# 8. Discovery presentation states

## Unseen

- unknown/locked treatment or silhouette where spoiler policy allows;
- do not reveal undiscovered boss identity unless Contract presentation deliberately exposes it.

## Encountered

Reveal at least:

- name;
- approved actor art;
- broad behavior/threat identity;
- field note;
- tells the player can actually observe.

## Defeated

Reveal fuller tactical detail:

- Behaviour;
- Tells;
- Counterplay;
- Found In;
- relevant shield/ranged/summon/split behavior;
- boss action/phase summary where applicable.

Do not expose implementation-only raw values merely because they are available.

---

# 9. Derived Found In relationships

`Found In` is not handwritten editorial truth.

Derivation:

```text
enemyId
  -> encounter profiles containing enemyId or bossId
  -> Contracts/Stages referencing those encounter profiles
  -> player-facing stage/chapter/location refs
```

This remains correct when encounter membership changes.

Summoned/split children may also be surfaced through the registered child relationship if that materially improves accuracy; keep the derivation generic and do not hard-code individual enemy IDs.

---

# 10. Threat tags / boss summaries

Threat tags are derived from archetype/registered mechanics, e.g. broad concepts such as:

```text
Chaser
Charger
Ranged
Tank
Shielded
Flanker
Spawner
Splitter
Boss
```

Do not create a parallel free-form mechanics taxonomy that can disagree with runtime.

Boss presentation derives action/phase structure from registered boss definitions. Editorial prose may explain it, but does not own phase thresholds/actions.

---

# 11. Art contract

Default Compendium visual uses the final #167 runtime enemy/boss production sheet under #170 logical-resource architecture.

This avoids parallel portrait canon.

Dedicated Compendium portrait/pose art is exceptional and requires a demonstrated presentation benefit. If added, it is an explicit logical presentation reference keyed to the same enemy identity and follows the same source/resource/bundle pipeline.

Generated-source rules follow #167/final V4 art policy: an intentionally selected generated production source is allowed after provenance, deterministic import, review/polish, originality, silhouette/anchor and real-scale gates.

---

# 12. Career UI / scalable list

Compendium lives under **Career** and consumes the shared V4 scroll/focus primitive rather than one-off pagination.

Input support:

- pointer + wheel/trackpad;
- touch;
- keyboard;
- controller;
- resize/orientation with stable focus/scroll.

No hover-only required information and no drag-only required action.

Synthetic **50-entry** data must remain usable at:

```text
360x640
390x844
844x390
1280x720
1920x1080
```

Useful filters should stay small/player-oriented, for example All / Encountered / Bosses. Avoid database-administration taxonomy.

---

# 13. Editorial template

Every active enemy/boss entry gets a review against the implementation SHA:

```text
Enemy ID
Mechanics checked against SHA
Field note unique to this creature
Behaviour factual
Tells actually visible in runtime/art
Counterplay actionable
No duplicated raw stats/stage lists/action arrays
Closest Compendium prose collision + distinction
Spoiler policy checked
```

Editorial text must use player-facing language rather than stale implementation jargon.

---

# 14. Generic validation

Validate automatically:

- every editorial `enemyId` resolves exactly once;
- every required active release enemy has presentation copy or an explicit validated default policy;
- no stale editorial row points at a deleted enemy;
- actor/presentation logical art resolves to a compatible renderer/resource;
- `Found In` derives from real encounter/stage data;
- boss-only presentation appears only for valid bosses;
- visibility rules expose exactly the permitted state fields;
- stale saved IDs fail soft;
- Save V4 migration backfills only authoritative history;
- no duplicate `enemy:encountered` event exists;
- defeated tracking cannot be enabled until universal `enemy:killed` coverage passes.

---

# 15. Exact-once death tests required before Compendium defeated state

At minimum:

```text
projectile lethal       -> 1 canonical kill
explosive splash lethal -> 1
burn lethal             -> 1
Heat Vent lethal        -> 1
boss lethal             -> 1
overkill                 -> 1
post-death damage        -> still 1
shield/nonlethal         -> 0
synthetic future source  -> 1
```

The test proves the shared lifecycle boundary, not Compendium-specific code.

---

# 16. Enemy N+1 / scale proof

Synthetic Enemy 50 using existing mechanics must require only:

```text
enemy definition
+ actor art/resource
+ explicit encounter membership
+ Compendium editorial row
```

and automatically:

- appears in derived read models;
- uses existing `enemy:spawned` / `enemy:killed` facts;
- stores sparse discovery without schema change;
- resolves Found In generically;
- renders through shared list/resources;
- requires no GameScene, event-map, save-shape, Compendium-core, loader-core, renderer-switch or validator-current-ID edit.

---

# 17. Non-goals

Do not add:

- second enemy database;
- second spawn/death event;
- arbitrary kill-count lore grind;
- duplicate stage lists/mechanics numbers;
- Compendium-only combat logic;
- per-enemy save fields;
- one-off menu branches;
- one-off pagination system.

---

# 18. PASS

Compendium passes when:

1. discovery reflects actual gameplay lifecycle facts;
2. one authoritative death boundary covers every lethal source;
3. editorial copy matches actual mechanics/tells/counterplay;
4. Found In and boss mechanics are derived rather than duplicated;
5. sparse Save V4 state is migration-safe and N+1-friendly;
6. current and synthetic 50-entry lists are accessible across input/viewports;
7. final monster art is reused coherently;
8. Enemy N+1 needs no structural save/event/menu/renderer change;
9. the feature makes the existing monster work more legible/memorable without adding grind or architecture weight.
