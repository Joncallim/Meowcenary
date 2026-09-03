# Monster Compendium / Bestiary

**Status:** reviewed implementation-ready plan for Issue #168. Planning only; no runtime feature is implemented by this document.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Authoring contract:** future entries follow `content-authoring-templates.md` and `content-authoring-template-coverage.md`.

The Compendium preserves and exposes the work already invested in Meowcenary's enemies, bosses, encounter composition and art. It is a field guide and collection surface, **not a second enemy database**.

---

# 1. Product outcome

A player can open the Compendium and understand:

- which monsters they have actually encountered;
- what each threat does;
- what visual/timing tells matter;
- how to respond;
- where the threat appears in the stage ladder;
- how bosses escalate;
- the personality and visual identity of Meowcenary's junkyard creatures.

Discovery happens naturally through play. There is no scan mechanic, lore currency or “kill 100 to unlock paragraph three” grind.

Current authoritative roster:

1. Dust Mite — `dust-mite`
2. Junk Rusher — `junk-rusher`
3. Trash Brute — `trash-brute`
4. Scrap Sniper — `scrap-sniper`
5. Scrap Skitter — `scrap-skitter`
6. Bastion Beetle — `bastion-beetle`
7. Junk Nester — `junk-nester`
8. Shard Bot — `shard-bot`
9. Scrap Crusher — `boss-crusher`
10. Forge Warden — `boss-forge`

Future Enemy N+1 must enter through the same catalog/read-model/UI path. No menu branch or save migration merely because the roster grows.

---

# 2. Non-goals

Do not add:

- a parallel copy of enemy health, damage, speed, attack timers or phase thresholds;
- a second kill-counter or achievement system;
- platform-achievement dependencies;
- online accounts, telemetry or cloud requirements;
- randomized discovery;
- scanning/capture mechanics;
- lore XP;
- kill-count grind;
- bespoke UI code per enemy ID;
- a second monster portrait canon by default;
- raw developer stat dumps as the primary player view;
- another generalized content framework beyond the existing validated catalog/registry pattern.

---

# 3. Ownership map

Combat/progression truth stays where it already lives.

```text
Enemy definitions / archetypes ──────────┐
Registered enemy/boss mechanics ─────────┤
Encounter profiles ──────────────────────┤
Stage registry ──────────────────────────┼─> Compendium read model ─> Compendium UI
Visual-art registry ─────────────────────┤
Sparse discovery save state ─────────────┤
Compendium presentation copy ────────────┘
```

Existing authoritative sources:

- `src/data/enemies.json`: stable enemy IDs, names, archetypes and combat configuration;
- registered behavior/action code: actual mechanics;
- `src/data/encounter-profiles.json`: explicit enemy/boss composition;
- `src/data/stages.json`: encounter-to-stage/chapter relationship;
- current boss/stage save facts: durable historical facts where available;
- visual-art registry: final actor sheets from #167;
- existing gameplay event boundaries, after the death-boundary correction in §6.

The Compendium owns only:

1. player-facing field-guide copy keyed to the existing enemy ID;
2. minimal sparse discovery state keyed to the existing enemy ID.

It does not own combat, reward or stage truth.

---

# 4. Discovery states

Use exactly three player-facing states.

## Unseen

No saved discovery entry.

Presentation:

- hidden name (`???`) according to spoiler policy;
- derived black silhouette/masked final actor where silhouette reveal is allowed;
- no tactical text;
- bosses may remain more aggressively hidden until encountered if stage-selection UX has not already revealed them.

## Encountered

The monster has successfully materialized into an active run.

Reveal:

- name;
- approved actor/idle art;
- broad derived threat tags;
- short field note;
- Behaviour;
- Tells;
- spoiler-safe derived `Found In` information.

## Defeated

The monster has authoritatively transitioned from alive to dead at least once.

Reveal Encountered content plus:

- Counterplay;
- complete player-facing mechanic summary;
- boss move/phase summary where applicable;
- richer derived stage/context relationships.

`defeated` implies `encountered`. Status is monotonic and never regresses.

No kill counts/timestamps are stored until a real product use requires them.

---

# 5. Persistence: a real sparse domain

Current Save V3 has no Compendium domain. Do not hide discovery in `items`, achievements, unlock strings or another unrelated map.

Default implementation direction, if V3 is already a persisted contract: introduce **Save V4** with one sparse domain.

```ts
export type CompendiumDiscoveryStatus = 'encountered' | 'defeated';

export interface CompendiumState {
  readonly enemies: Readonly<Record<string, CompendiumDiscoveryStatus>>;
}
```

Unseen enemies are absent.

Adding Enemy N+1 requires **no later save migration**: the new ID simply starts absent.

If implementation occurs before V3 is treated as a release persistence contract, a dedicated migration review may intentionally fold the field into that unreleased schema. Do not silently mutate an already-frozen schema merely to avoid a version increment.

## V3 → V4 migration

Preserve every V3 field, then initialize `compendium.enemies` conservatively.

Safe historical backfill:

- current saved boss fact with `defeated: true` may backfill that boss to `defeated`;
- an unambiguous completed defeat-boss stage may corroborate the same fact;
- ordinary-enemy history is **not fabricated** because V3 does not contain per-enemy encounter/defeat history;
- achievements are not used as a substitute enemy-history database merely because some correlate with combat;
- unknown/stale Compendium IDs fail soft.

A returning player may rediscover ordinary enemies after the feature ships. That is preferable to inventing evidence.

---

# 6. Authoritative discovery facts

This section contains two important corrections from independent PR review.

## 6.1 Encounter: reuse the existing `enemy:spawned` fact

The repository already emits:

```ts
'enemy:spawned': { instanceId, enemyId, x, y }
```

from SpawnSystem after a valid enemy is constructed/materialized into the active collection/group.

**Compendium must consume this existing event. Do not add a duplicate `enemy:encountered` event.**

This gives one lifecycle fact for one lifecycle edge and prevents future spawn paths from remembering to emit two semantically equivalent events.

Do not infer encounter from:

- preload/texture existence;
- encounter-profile membership;
- a failed spawn request;
- a cosmetic telegraph;
- visibility/camera intersection.

A successful `enemy:spawned` is sufficient.

## 6.2 Defeat: first unify the authoritative death boundary

At the reviewed baseline, `enemy:killed` is **not yet universal**. WeaponSystem emits it after projectile/burn damage, but `elemental-burst` in the ability path calls `Enemy.takeDamage()` directly. An enemy killed by Heat Vent can therefore die without publishing `enemy:killed`.

The Compendium must **not** ship defeat tracking on top of that incomplete event topology.

### Required prerequisite

Create one narrow authoritative enemy-damage/death boundary used by every damaging path. It owns the transition:

```text
active/alive -> dead
```

and publishes the canonical death fact exactly once regardless of source.

Preferred compatibility direction: keep the existing event name/payload **`enemy:killed`**, but move its emission and associated kill settlement out of WeaponSystem-specific logic into the shared death boundary. Existing consumers can then remain on the same event contract.

Conceptually:

```ts
applyEnemyDamage(enemy, amount, source): EnemyDamageResult
```

The shared boundary:

1. ignores damage to already-dead/inactive enemy;
2. applies/caps damage through the authoritative enemy health owner;
3. emits the existing `enemy:damaged` semantics as appropriate;
4. detects the one alive→dead transition;
5. increments run kill accounting exactly once;
6. emits one canonical `enemy:killed` carrying enemy ID/reward facts/position;
7. returns the kill result to the caller for source-specific presentation;
8. never emits a second kill for overkill/reentrant damage.

Every damage source routes through it:

- direct projectile hit;
- explosive splash;
- burn/DOT tick;
- Heat Vent / elemental burst;
- future damaging abilities;
- future environmental/status damage that can kill enemies.

Bosses use the same death transition. Boss-specific progression can consume/reconcile the same canonical death plus its existing boss completion boundary without inventing a second definition of “dead.”

### Required death-boundary tests

Prove exactly-once `enemy:killed` for:

- projectile lethal hit;
- explosive splash lethal hit;
- burn lethal tick;
- elemental-burst/Heat Vent lethal hit;
- simultaneous/overkill damage;
- repeated damage after death;
- boss death;
- a synthetic future damage source using the shared boundary.

Only after these pass should Compendium `defeated` subscribe to `enemy:killed`.

## 6.3 Discovery tracker

The tracker then becomes simple:

```text
enemy:spawned -> unseen -> encountered
enemy:killed  -> unseen/encountered -> defeated
defeated      -> any repeat -> no-op
```

Killed directly implies encountered; no event-order assumption is required.

---

# 7. Persistence command and failure behavior

Add one narrow `GameContext` command, e.g.:

```ts
updateCompendium(enemyId, nextStatus): PersistenceUpdate<CompendiumState>
```

The command:

- validates/normalizes the stable current enemy ID;
- computes a monotonic next state purely;
- writes through SaveManager;
- publishes the new snapshot only after persistence succeeds;
- returns no-op for equal/lower status;
- grants no rewards;
- mutates no achievements.

Storage failure must not freeze combat. Because discovery transitions are tiny, bounded and idempotent, failed transitions may remain in a small in-memory set and retry at the next safe persistence opportunity. Do not build an unbounded event queue.

---

# 8. Presentation catalog

Create one validated file such as `src/data/compendium.json`.

It contains **copy only**, keyed to the exact existing enemy ID (for example `dust-mite`, not a reconstructed `enemy:dust-mite` catalog ID).

```ts
interface CompendiumEntryPresentation {
  readonly enemyId: string;
  readonly displayOrder: number;
  readonly fieldNote: string;
  readonly behaviour: string;
  readonly tells: string;
  readonly counterplay: string;
  readonly spoilerPolicy: 'hide-until-encountered' | 'silhouette-until-encountered';
  readonly portraitArtId?: string;
}
```

Forbidden duplicate fields:

- health;
- damage;
- speed;
- XP/scrap values;
- attack range;
- cooldown/telegraph milliseconds;
- phase health fractions;
- encounter profile IDs;
- stage IDs / `foundIn` lists;
- boss action arrays already owned by the definition;
- reward tables.

If a number is not a deliberately player-facing stable rule, it does not belong in editorial copy.

## Validation

Require:

- exactly one presentation entry per release enemy/boss, or one explicit validated fallback policy;
- unique `enemyId` and display order;
- every `enemyId` resolves to `enemies.json`;
- bounded copy lengths;
- allowed spoiler policy;
- optional portrait art resolves;
- unknown fields fail validation so combat stats cannot quietly creep into the copy catalog.

---

# 9. Derived threat tags

Tags are derived from authoritative mechanics, not maintained as another enemy taxonomy.

Examples:

```text
archetype: tank       -> Heavy
archetype: flanker    -> Flanker
archetype: charger    -> Charger
attack + ranged       -> Ranged
summon exists         -> Spawner
splitOnDeath exists   -> Splits
shieldArcDeg exists   -> Shielded
archetype: boss       -> Boss
```

Mapping is generic by mechanic/property. Never `if enemyId === ...`.

---

# 10. `Found In` is derived

Do not author stage lists in Compendium JSON.

For an enemy ID:

1. find encounter profiles whose `enemyIds` include it;
2. for bosses, also match `bossId`;
3. find stages referencing those encounter profiles;
4. deduplicate;
5. order through current chapter/stage presentation rules;
6. apply normal spoiler/progression visibility before showing names.

Moving a monster to another encounter profile automatically updates the Compendium.

Do not “fix” unusual historical stable IDs in Compendium code. Display uses authoritative current chapter/name data; stable IDs remain untouched.

---

# 11. Boss mechanics presentation

Boss detail teaches player-readable behavior without dumping implementation state.

Rules:

- derive action/phase presence from boss definitions;
- translate registered action IDs through a generic mechanic-copy map;
- describe thresholds qualitatively (“as it is worn down”, “late in the fight”) rather than exposing health fractions;
- never infer a move from VFX alone;
- conformance tests must flag editorial claims whose required mechanic no longer exists.

Example generic mapping:

```text
boss-action:aimed-shot -> Aimed Shot
boss-action:summon     -> Calls Reinforcements
charger attack config  -> Charge
```

This map is keyed by mechanic/action ID, not repeated per boss.

---

# 12. Immutable read-model boundary

Build one Phaser-independent constructor:

```ts
buildCompendiumReadModel({
  enemies,
  encounters,
  stages,
  presentation,
  discovery,
  visualArt,
  progression
})
```

Output item concept:

```ts
interface CompendiumEntryViewModel {
  readonly enemyId: string;
  readonly status: 'unseen' | 'encountered' | 'defeated';
  readonly name: string;
  readonly isBoss: boolean;
  readonly threatTags: readonly string[];
  readonly artId?: string;
  readonly fieldNote?: string;
  readonly behaviour?: string;
  readonly tells?: string;
  readonly counterplay?: string;
  readonly foundIn: readonly CompendiumLocationView[];
  readonly mechanics: readonly CompendiumMechanicView[];
}
```

The builder owns spoiler filtering and derived relationships. Phaser UI only lays out/focuses/renders this immutable snapshot.

No UI component queries enemy JSON directly.

---

# 13. UX / information architecture

## 13.1 Entry point

Add `Compendium` to the shared menu/navigation family using the field-guide icon from #167.

It is a reference/collection surface, not a progression gate. Nothing required for winning depends on opening it.

## 13.2 Desktop/wide layout

Two-pane:

```text
┌ Monster list/filter ┬ Detail ────────────────────────┐
│ [sprite] Dust Mite  │ enlarged idle actor            │
│ [sprite] Rusher     │ name + tags                    │
│ [???]   ???         │ field note                     │
│ ...                 │ Behaviour / Tells / Counterplay│
│                     │ Found In                        │
└─────────────────────┴─────────────────────────────────┘
```

List pane keeps one selected row visible. Detail pane scrolls independently when required.

## 13.3 Portrait phone layout

Do not squeeze two panes side by side at 390×844.

- Level 1: single-column list/grid of entries.
- Confirm/tap: open full-width detail.
- Back: return to same list position/focus.
- Detail uses compact art header + stacked sections.
- Long copy scrolls; core controls remain reachable.

## 13.4 Filters

Keep first version intentionally small:

- All;
- Encountered;
- Defeated;
- Bosses.

Do not add a complex taxonomy until the roster warrants it.

## 13.5 Search

Not required for ten entries. Architecture must not block it later, but do not build it now.

---

# 14. Input/accessibility

The entire surface must be usable with:

- touch;
- keyboard;
- controller.

All converge on shared logical actions/focus behavior.

Required behavior:

- visible focus frame/chevron;
- stable focus after filter changes;
- Back returns to prior list item/scroll position;
- touch targets remain comfortably large;
- no hover-only information;
- status is not communicated by color alone;
- unseen entries have text/silhouette/latch state;
- enlarged pixel art remains crisp;
- reduced-motion uses a stable approved actor frame rather than looping idle;
- text scales/wraps without covering art at 390×844.

---

# 15. Art behavior

Default art source is the same final actor binding used by combat.

```text
enemy definition ID -> documented actor-art convention -> final actor sheet
```

Use integer-scale idle animation when motion is enabled. Use stable first/approved frame when reduced motion is enabled.

Do not create a second monster portrait pipeline by default.

If final UI evidence proves an actor sheet cannot support a detail header, an optional `portraitArtId` can be explicitly authored in `compendium.json`; it must still represent the same enemy and use the #167 art pipeline.

Unseen silhouette is derived from final art, not a separate mystery asset.

---

# 16. Current editorial briefs — exact 10 entries

The following is the editorial direction. Final copy must be checked against the same implementation SHA used for release. Do not copy the exact internal numeric values into player-facing text.

## 16.1 Dust Mite — `dust-mite`

**Field note:** A fistful of angry filings that discovered legs were an option.

**Behaviour:** Simple chaser. Closes directly and hurts through contact.

**Tells:** Small round body, constant pursuit, no wind-up attack state.

**Counterplay:** Keep moving, avoid being boxed in by groups, clear them before larger threats use them as pressure.

**Prose identity:** baseline swarm threat; never describe ranged/charge behavior it does not own.

## 16.2 Junk Rusher — `junk-rusher`

**Field note:** Most junk waits to be collected. This bit has other plans.

**Behaviour:** Charger. Approaches, visibly winds up, then commits to a fast dash before recovering.

**Tells:** Compressed/aimed wind-up and clear forward commitment.

**Counterplay:** Move laterally after the charge is committed; punish the recovery rather than outrunning it in a straight line.

## 16.3 Trash Brute — `trash-brute`

**Field note:** A compact argument for walking around the problem.

**Behaviour:** Slow heavy contact threat with much greater durability than basic chasers.

**Tells:** Large square silhouette and deliberate advance; no ranged attack.

**Counterplay:** Maintain space, avoid letting smaller enemies pin you against it, and use sustained damage while repositioning.

## 16.4 Scrap Sniper — `scrap-sniper`

**Field note:** Somehow the junkyard has invented patience.

**Behaviour:** Ranged threat. Maintains distance and uses a telegraphed shot rather than contact damage.

**Tells:** Tall sighting silhouette and clear aiming/attack preparation.

**Counterplay:** Break the firing line with movement, close/reposition during its cadence, and avoid ignoring it behind melee pressure.

## 16.5 Scrap Skitter — `scrap-skitter`

**Field note:** It has correctly identified “beside you” as the worst possible place to be.

**Behaviour:** Flanker. Uses lateral positioning rather than simply joining the direct chase line.

**Tells:** Very low wide silhouette and side-biased movement.

**Counterplay:** Preserve escape space, change direction before it establishes the flank, and avoid tunnel vision on frontal heavies.

## 16.6 Bastion Beetle — `bastion-beetle`

**Field note:** The front is mostly a wall. Fortunately it has a back.

**Behaviour:** Shielded contact threat. A directional frontal arc blocks attacks from the protected side.

**Tells:** Dominant front plate makes facing obvious; blocked hits have an authoritative feedback cue.

**Counterplay:** Circle/flank and attack outside the protected arc rather than wasting fire into the front.

## 16.7 Junk Nester — `junk-nester`

**Field note:** If left alone, it begins making the local Dust Mite problem more local.

**Behaviour:** Slow ranged support threat that summons Dust Mites under a bounded active cap.

**Tells:** Rear-heavy nest silhouette; summon preparation opens/raises the nest assembly; ranged cadence remains readable.

**Counterplay:** Prioritize it when safe; otherwise summoned Mites steadily increase movement pressure.

**Editorial invariant:** spawned creature is **Dust Mite** unless authoritative definition changes.

## 16.8 Shard Bot — `shard-bot`

**Field note:** Destroying it is correct. It is merely not the end of the conversation.

**Behaviour:** Direct chaser that splits into Dust Mites on death under a bounded active cap.

**Tells:** Fracture-seam body language anticipates the split.

**Counterplay:** Avoid killing it while surrounded/boxed in; leave space for the child threats and clear them quickly.

**Editorial invariant:** split creature is **Dust Mite** unless authoritative definition changes.

## 16.9 Scrap Crusher — `boss-crusher`

**Field note:** The junkyard's answer to “could this press be mobile?” was regrettably yes.

**Behaviour:** Boss combining a committed charge with an aimed-shot action. As it is worn down, its charge becomes more aggressive.

**Tells:** Heavy horizontal ram silhouette; charge wind-up braces/draws the ram; aimed-shot state exposes its firing cue; later phase is visibly more urgent.

**Counterplay:** Bait the charge into a lane you can leave, change direction after commitment, respect aimed shots, and use the recovery windows.

**Mechanic invariants:** Charge + Aimed Shot + one later enraged phase. Do not publish numeric health thresholds/cadences in editorial copy.

## 16.10 Forge Warden — `boss-forge`

**Field note:** A furnace with management responsibilities and very poor delegation skills.

**Behaviour:** Boss combining charge, aimed shot and Junk Rusher reinforcement summons. It escalates through overheat and meltdown phases, with more aggressive pressure/reinforcement behavior.

**Tells:** Tall furnace/gantry silhouette; tool-arm aiming cue; lowered charge preparation; raised summon/signal arm; increasingly open/hot vent treatment in later phases.

**Counterplay:** Keep a movement lane for charges, clear Rushers before their pressure compounds, and exploit the readable windows between major actions.

**Mechanic invariants:** Charge + Aimed Shot + summons **Junk Rusher**; two escalation phases (overheat, meltdown). Avoid copying internal fractional thresholds into player copy.

---

# 17. Editorial validation

Each release entry records/reviews:

```text
Enemy ID
Mechanics checked against commit SHA
Field note unique to creature
Behaviour factual
Tells actually exist in runtime/art
Counterplay actionable
No implementation-only numbers
No duplicated stage/action/reward lists
Closest prose/role collision + difference
```

Conformance should fail when an entry's claimed mechanic dependency disappears. Examples:

- Junk Nester copy requires a summon mechanic;
- Shard Bot copy requires split-on-death;
- Bastion Beetle copy requires directional shield;
- Crusher copy requires aimed shot + charge + phase;
- Forge Warden copy requires aimed shot + summon + two phase definitions.

This is dependency validation, not a second copy of the numeric configuration.

---

# 18. Generic extensibility proof

A synthetic Enemy N+1 using an existing archetype must be addable by:

1. enemy definition;
2. actor art binding/source;
3. explicit encounter-profile membership where desired;
4. one Compendium presentation row;
5. no scene/controller/Compendium component branch;
6. no save migration;
7. generic validation/read-model tests.

A new mechanic may require one registered implementation. Once registered, later enemies using it return to the same data/art/Compendium path.

Required synthetic test proves:

- entry resolves by exact unprefixed enemy catalog ID;
- status begins unseen by sparse absence;
- `enemy:spawned` changes it to encountered;
- canonical `enemy:killed` changes it to defeated;
- derived tags/Found In update from mechanics/composition;
- UI list includes it automatically;
- adding it globally does not alter old encounter pools.

---

# 19. Test plan

## Pure/read-model tests

- unseen/encountered/defeated projection;
- killed implies defeated even if encountered persistence was missed;
- monotonic transitions;
- spoiler filtering;
- threat-tag derivation;
- `Found In` derivation and ordering;
- boss mechanic translation;
- unknown/stale IDs fail soft;
- immutability.

## Persistence/migration

- V3 → V4 preserves every old field;
- known defeated bosses backfill safely;
- ordinary enemies are not fabricated;
- V4 round-trip;
- unsupported future version stays protected;
- equal/lower discovery update is no-op;
- failed save does not publish durable state;
- bounded retry converges.

## Lifecycle/death topology

- existing `enemy:spawned` drives encounter;
- failed spawn never drives encounter;
- projectile/explosion/burn/Heat Vent all drive the same canonical kill boundary;
- kill event exactly once under overkill/repeated damage;
- boss kill exactly once;
- pause does not synthesize events;
- scene restart does not duplicate listeners.

## UI/input

- controller-only list → detail → back loop;
- keyboard equivalent;
- touch equivalent;
- focus survives filter/detail transitions;
- 390×844 no clipping;
- landscape/resized/desktop layouts;
- long localization-safe wrapping;
- reduced-motion stable actor frame;
- grayscale/status distinguishability.

---

# 20. Implementation sequence

1. **Prerequisite:** unify enemy damage/death settlement so canonical `enemy:killed` is source-independent and exactly once.
2. Add death-boundary regression tests covering Heat Vent plus projectile/splash/burn/overkill/boss cases.
3. Freeze Compendium presentation schema/validator using exact current enemy IDs.
4. Add Save V4 sparse Compendium domain/migration (or explicitly reviewed unreleased-V3 alternative).
5. Add Compendium tracker consuming existing `enemy:spawned` + canonical `enemy:killed`.
6. Build pure immutable read model and derived tags/Found In.
7. Add current ten editorial rows with dependency conformance.
8. Add menu navigation + responsive list/detail UI.
9. Wire final #167 actor art; no duplicate portraits by default.
10. Add synthetic Enemy N+1 conformance fixture.
11. Run full automated/manual input/accessibility/save/lifecycle gates.

Do not implement UI first and later discover that death facts are incomplete.

---

# 21. Review record

## Pass 1 — ownership/duplication

Resolved:

- Compendium owns only copy + sparse discovery state;
- combat/stage/reward/art truth remains authoritative elsewhere;
- Found In and threat tags are derived;
- no second monster database.

## Pass 2 — persistence

Resolved:

- dedicated sparse save domain;
- no enemy-count fields or per-enemy schema additions;
- conservative historical backfill;
- Enemy N+1 requires no migration.

## Pass 3 — event/lifecycle adversarial review

Independent PR review found two important issues in the earlier draft:

1. proposed `enemy:encountered` duplicated the already-authoritative `enemy:spawned` fact;
2. proposed defeat tracking trusted `enemy:killed`, but Heat Vent can currently kill through a direct `Enemy.takeDamage()` path that bypasses that event.

**Resolution:** encounter reuses existing `enemy:spawned`; defeat tracking is blocked on a unified source-independent death boundary that makes the existing `enemy:killed` fact canonical/exactly-once for every damage source.

## Pass 4 — spoiler/UX/accessibility

Resolved:

- only three discovery states;
- no grind;
- phone uses list→detail instead of crushed two-pane layout;
- controller/keyboard/touch share focus actions;
- reduced-motion and grayscale rules explicit.

## Pass 5 — editorial accuracy

Resolved:

- all ten current stable enemy IDs represented;
- Nester/Shard child enemy fixed to current Dust Mite truth;
- Crusher and Warden descriptions bound to real action/phase dependencies;
- no raw internal tuning values duplicated into prose.

## Pass 6 — scalability/overengineering

Resolved:

- exact unprefixed enemy catalog IDs are the Compendium keys;
- one generic presentation schema;
- one sparse save map;
- one read model;
- one list/detail UI;
- synthetic Enemy N+1 proves the path;
- no search/lore currency/portrait subsystem/general scripting framework.

---

# 22. Final acceptance

The Compendium plan is ready for implementation only when the death-boundary prerequisite is included in the implementation scope.

Pass requires:

- existing `enemy:spawned` is the sole encounter fact;
- `enemy:killed` becomes a universal exactly-once authoritative death fact across weapon, DOT, ability and future damage paths;
- sparse versioned discovery persists safely;
- all ten current enemy IDs have validated copy;
- `Found In`, threat tags and boss mechanics are derived;
- UI works at 390×844 and desktop with touch/keyboard/controller;
- reduced motion and focus/status accessibility pass;
- synthetic Enemy N+1 requires data/art/copy only for existing mechanics;
- no parallel combat/reward/stage truth exists in Compendium data.

With those conditions, the Compendium scales linearly with content rather than with bespoke code.