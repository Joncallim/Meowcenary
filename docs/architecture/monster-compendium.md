# Monster Compendium / Bestiary

**Status:** reviewed implementation-ready plan for Issue #168. Planning only; no runtime feature is implemented by this document.

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

The Compendium exists to preserve and expose the work already invested in Meowcenary's enemies, bosses, encounter composition and art. It is a field guide and collection surface, **not a second enemy database**.

---

## 1. Product outcome

A player can open the Compendium and understand:

- what monsters they have actually encountered;
- what each threat does;
- how to read its tells;
- how to respond to it;
- where it appears in the current stage ladder;
- how bosses change through their encounters;
- the personality and visual identity of Meowcenary's junkyard creatures.

The Compendium should make enemy production feel persistent and collectible without introducing grind. Seeing and defeating monsters naturally fills the guide; there is no arbitrary “kill 100 to unlock paragraph three” ladder.

The current roster is:

1. Dust Mite
2. Junk Rusher
3. Trash Brute
4. Scrap Sniper
5. Scrap Skitter
6. Bastion Beetle
7. Junk Nester
8. Shard Bot
9. Scrap Crusher
10. Forge Warden

Future ordinary enemies and bosses must enter the same system through data/assets and existing mechanics rather than menu branches.

---

## 2. Non-goals

Do not add:

- a parallel copy of enemy health, damage, speed, attack timers or phase thresholds;
- a second kill-counter/achievement system;
- platform achievement dependencies;
- online accounts, telemetry or cloud requirements;
- randomized discovery;
- lore XP, scanning, capture mechanics or kill-count grind;
- bespoke UI code per enemy ID;
- a second monster portrait pipeline by default;
- raw developer stat dumps as the main player-facing value;
- another generalized content framework beyond the validated catalog/registry pattern already used by Alpha 3.

---

## 3. Ownership map

Combat and progression truth stay where they already live.

```text
Enemy definitions / behavior fields ─────┐
Boss actions / phases ───────────────────┤
Encounter profiles ──────────────────────┤
Stage registry ──────────────────────────┼─> Compendium read model ─> Compendium UI
Visual-art registry ─────────────────────┤
Persistent discovery state ──────────────┤
Compendium presentation copy ────────────┘
```

### Existing authoritative sources

- `src/data/enemies.json`: identity, archetype and real combat configuration.
- registered enemy/boss behavior/action code: actual mechanics.
- `src/data/encounter-profiles.json`: explicit enemy/boss membership.
- `src/data/stages.json`: encounter-to-stage/chapter relationship.
- Save progression/boss facts: existing durable facts that can prove historical boss completion.
- visual-art registry: final production actor sheets from #167.

### New Compendium-owned data

Only two concepts are new:

1. **presentation copy** keyed by the existing stable enemy ID;
2. **minimal discovery state** keyed by the existing stable enemy ID.

UI never mutates combat truth, boss truth or stage truth.

---

## 4. Discovery model

Use exactly three player-facing states.

### Unseen

No saved entry exists.

Presentation:

- `???` or intentionally hidden name according to spoiler policy;
- derived black silhouette/masked final sprite where revealing shape is acceptable;
- no tactical detail;
- bosses may be more aggressively hidden until encounter if stage-selection UX does not intentionally reveal them.

### Encountered

The player has had the monster successfully spawn into an active run.

Reveal:

- name;
- approved production sprite/idle animation;
- broad threat/archetype tags;
- short field note;
- Behaviour;
- Tells;
- derived `Found In` information for content already encountered/visible under normal progression rules.

### Defeated

The player has authoritatively killed the monster at least once.

Reveal everything above plus:

- Counterplay;
- full mechanic summary;
- boss move/phase summary where applicable;
- richer derived stage/context relationships;
- progression/reward relationships only when they can be derived from authoritative data without inventing a second reward table.

`defeated` always implies `encountered`. Status is monotonic; it never regresses.

---

## 5. Persistence — use a real domain, not a hiding place

Current `SaveDataV3` has no Compendium domain. Do not smuggle discovery into `items`, achievements, unlock strings or another unrelated map.

### Schema direction

If this feature is implemented after the existing V3 shape is considered a persisted contract, introduce **Save V4** with one sparse domain:

```ts
export type CompendiumDiscoveryStatus = 'encountered' | 'defeated';

export interface CompendiumState {
  readonly enemies: Readonly<Record<string, CompendiumDiscoveryStatus>>;
}
```

Unseen enemies are absent. There are no counters or timestamps in the first version because the product does not use them.

Adding Enemy N+1 remains a content change, not a schema migration: the new ID simply begins absent.

Do not silently change the meaning/shape of V3 just to avoid incrementing the save version. If implementation occurs before V3 has ever been treated as a real persisted release contract, a dedicated architecture review may deliberately fold the field into that unreleased schema, but the default plan is the honest structural V4 migration.

### V3 → V4 migration

Preserve every V3 field unchanged, then create `compendium.enemies`.

Safe backfill is intentionally conservative:

- a saved boss fact with `defeated: true` may backfill that boss to `defeated`;
- a completed stage whose authoritative objective is `defeat` for a named boss may be used as an additional proof only when the stage definition resolves unambiguously to that boss;
- ordinary-enemy discovery is **not fabricated**, because V3 does not store per-enemy encounter history;
- achievements are not treated as the primary backfill store merely because some achievements happen to correlate with combat facts;
- stale/unknown saved Compendium IDs fail soft and do not brick the save.

A long-time player may therefore see ordinary monsters as newly discovered after the feature ships. That is preferable to pretending historical evidence exists when it does not.

---

## 6. Authoritative discovery facts

### Encounter

Add one authoritative gameplay fact at the point an enemy has successfully been instantiated/activated into the run, conceptually:

```ts
'enemy:encountered': { enemyId: string }
```

This must be emitted by the authoritative spawn/enemy boundary **after** a valid enemy is active. Do not infer encounter from:

- a sprite becoming visible;
- an encounter profile merely containing an ID;
- a preloaded texture;
- a spawn request that failed;
- a cosmetic telegraph.

A Compendium tracker consumes the fact and requests the monotonic transition `unseen -> encountered`.

### Defeat

Reuse the existing authoritative `enemy:killed` event, which already carries `enemyId`. Bosses can also consume/reconcile `boss:defeated`; repeated equivalent facts are harmless.

Transition:

```text
unseen      + killed => defeated
encountered + killed => defeated
defeated    + killed => no-op
```

Killing an enemy directly implies it was encountered; no ordering dependency is required.

### Persistence command

Add a narrow `GameContext` command such as:

```ts
updateCompendium(enemyId, nextStatus): PersistenceUpdate<CompendiumState>
```

The command:

1. validates/normalizes the stable enemy ID against release content policy;
2. computes a monotonic next state purely;
3. writes through the existing SaveManager boundary;
4. publishes the new snapshot only after successful persistence;
5. returns a no-op for equal/lower status;
6. never grants rewards or mutates achievements.

A storage failure must not freeze combat. Because transitions are bounded and idempotent, a failed transition may remain in a small in-memory pending set and retry on the next Compendium fact / safe persistence opportunity. Do not build an unbounded queue.

---

## 7. Presentation catalog

Create one validated file such as `src/data/compendium.json`. It contains player-facing copy, not combat values.

Recommended shape:

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

### Explicitly forbidden duplicate fields

Do not store these in Compendium JSON:

- health;
- damage;
- speed;
- XP/scrap values;
- attack range;
- cooldown/telegraph milliseconds;
- boss health thresholds;
- encounter profile IDs;
- stage IDs / `foundIn` lists;
- boss action lists that already exist in authoritative data;
- reward tables.

If a number is not a deliberately player-facing stable rule, it should not be Compendium copy.

### Copy validation

Validate:

- one metadata entry for every release enemy/boss or an explicit validated fallback policy;
- no duplicate `enemyId` or display order;
- every `enemyId` resolves;
- bounded copy lengths appropriate to the responsive UI;
- allowed spoiler policy values;
- optional portrait art resolves if present;
- unknown fields fail validation so duplicated combat stats cannot creep into the catalog unnoticed.

---

## 8. Derived threat tags

Tags such as `Boss`, `Ranged`, `Spawner`, `Shielded`, `Splitter`, `Charger`, `Flanker`, `Tank` are derived from real definition/archetype/mechanic structure wherever possible. Do not maintain a second hand-curated list of mechanical tags.

The presentation layer may normalize internal terms into player language, for example:

```text
archetype: tank      -> Heavy
archetype: flanker   -> Flanker
summon exists        -> Spawner
splitOnDeath exists  -> Splits
shieldArcDeg exists  -> Shielded
archetype: boss      -> Boss
```

This mapping is generic by mechanic/property, never `if enemyId === ...`.

---

## 9. `Found In` is derived

The Compendium must not manually list stages.

Build it from authoritative composition:

1. for an enemy ID, find every encounter profile whose `enemyIds` contains it;
2. for bosses, also match `bossId`;
3. find every stage referencing those encounter profiles;
4. deduplicate stages;
5. sort by chapter/order using current stage/chapter presentation rules;
6. apply normal spoiler/progression visibility policy before presenting names.

As a consequence, moving an enemy to a different encounter profile or adding it to a new stage automatically updates the Compendium.

The current oddity where the Forge Warden boss stage uses a `stage:junkyard-06` stable ID while belonging to the Forge chapter is not “fixed” by Compendium code; display derives current authoritative chapter/name data and stable IDs remain untouched.

---

## 10. Boss mechanic presentation

Boss detail should expose learnable player-facing behavior without dumping implementation state.

### Rules

- use action/phase mechanics already present in boss definitions;
- describe thresholds qualitatively: “as it is worn down”, “late in the fight”, “meltdown phase”, not `atHealthFraction: 0.33`;
- show named mechanic labels only as presentation metadata/registered-mechanic copy, not new mechanics;
- never infer a move from VFX alone;
- if a boss definition changes action/phase composition, conformance tests must reveal stale editorial copy.

A small reusable mechanic-copy map may translate registered action IDs into player-facing names such as `Aimed Shot` or `Calls Reinforcements`. It should be keyed by mechanic/action ID, not duplicated per boss.

---

## 11. Read-model boundary

Build one immutable read-model constructor outside Phaser presentation.

Conceptual input:

```ts
buildCompendiumReadModel({
  enemies,
  encounterProfiles,
  stages,
  visualArt,
  presentation,
  discovery,
  progressionVisibility,
})
```

Representative output:

```ts
interface CompendiumEntryReadModel {
  readonly enemyId: string;
  readonly status: 'unseen' | 'encountered' | 'defeated';
  readonly name: string;
  readonly nameHidden: boolean;
  readonly artId?: string;
  readonly silhouetteOnly: boolean;
  readonly threatTags: readonly string[];
  readonly fieldNote?: string;
  readonly behaviour?: string;
  readonly tells?: string;
  readonly counterplay?: string;
  readonly foundIn: readonly CompendiumStageRef[];
  readonly boss?: CompendiumBossReadModel;
}
```

The UI receives already-gated data. It must not decide that a defeated boss may reveal a phase or that an unseen name should be hidden.

---

# 12. Responsive UX

## Navigation placement

Add **Compendium** as a top-level between-run destination alongside the existing management surfaces. It uses the field-guide/monster-eye navigation icon planned in `docs/art/alpha-3-art-production-briefs.md`.

It is a reference/collection surface, not part of the Stage-versus-Arena decision and not a replacement for Achievements.

## Mobile / canonical 390×844

### Roster state

- title/header + compact discovery count;
- filter chips below header;
- scrollable two-column monster card grid where 390px layout permits comfortable cards;
- at very narrow/small layouts, allow a one-column list rather than shrinking names/sprites below readability;
- each card: sprite/silhouette, name/`???`, one/two threat tags, discovery marker;
- no raw stat table.

### Detail state

Selecting a card opens a full-width detail page rather than trying to squeeze a permanent side panel into portrait:

- back control preserves previous filter, focus and scroll position;
- large crisp integer-scaled sprite near top;
- name + tags;
- field note;
- sections: **Behaviour**, **Tells**, **Counterplay**, **Found In**;
- defeated bosses add **Moves** / **Phases**.

Long text scrolls; the monster art does not consume most of the viewport.

## Desktop

Use the same read model with a split layout where space permits:

- left: scrollable grid/list;
- right: persistent selected detail panel;
- selected card has unmistakable focus/selection frame;
- resizing into portrait collapses safely into roster/detail navigation without losing selection.

---

## 13. Filters and sorting

Initial filters only:

- **All**
- **Encountered**
- **Bosses**

Do not add eight archetype filter tabs for a ten-monster roster. Threat tags may become filters later when the roster size creates a real navigation need.

Default sort uses validated `displayOrder`, not ID string order and not encounter time.

Discovery count can show `encountered-or-defeated / total-visible` without creating a reward track.

---

## 14. Input and accessibility

All interaction consumes the shared logical action/focus architecture.

### Pointer / trackpad

- click card to select/open;
- wheel/trackpad scrolls roster/detail;
- no hover-only tactical information.

### Touch

- tap card;
- ordinary vertical scroll;
- no drag-to-open, pinch or precision gesture;
- targets meet the same real-display-size expectations as other Alpha 3 menus.

### Keyboard / controller

- directional navigation between cards/filters;
- confirm opens/selects;
- back returns from detail / exits surface;
- focused card automatically scrolls into view;
- returning from detail restores the exact prior focus and scroll position;
- filter changes move focus to a deterministic valid card, never stale invisible content.

### Reduced motion

With reduced motion enabled:

- monster display uses a stable first/representative idle frame rather than looping animation;
- filter/card transitions do not slide/bounce unnecessarily;
- no information depends on animation.

Color is never the sole discovery/focus/tag cue.

---

## 15. Art policy

Default monster art is the final approved production actor sheet from #167.

- show the real sprite at crisp integer scale;
- ordinary entries use idle animation where motion is allowed;
- bosses may use idle/phase-neutral presentation, not combat telegraph loops;
- unseen silhouettes are derived from final sprite masks rather than separately drawn fake monsters;
- dedicated portraits are optional only after layout review proves enlarged runtime art is materially insufficient.

If a dedicated portrait is later approved, it uses the same enemy ID, visual design and complete Pixelorama/builder/provenance process. It never becomes a second canonical monster design.

---

# 16. Editorial template

Each metadata entry answers four distinct questions.

### Field note

One memorable sentence of Meowcenary voice. It gives character, not mechanics.

### Behaviour

What the monster actually does in player terms.

### Tells

What the player can see/read before or during the threat.

### Counterplay

What movement/priority lesson improves the player's response.

Copy rules:

- concise enough for phone reading;
- factual against current runtime mechanics;
- no exact balance numbers likely to drift;
- no claims that depend on unreleased art/telegraphs unless the production task explicitly adds them;
- no lore sludge;
- no reference-game language;
- bosses get richer copy but stay actionable.

---

# 17. Current entry content briefs

These are the approved editorial directions. Final implementation may tune sentence rhythm, but not change mechanical claims without re-reviewing the source behavior.

## 17.1 Dust Mite

**Field note:** “A fistful of rust with legs and absolutely no respect for personal space.”

**Behaviour:** Closes directly on the mercenary and becomes dangerous through numbers rather than tricks.

**Tells:** There is no elaborate wind-up: its constant forward scuttle *is* the warning. Groups compress escape lanes quickly.

**Counterplay:** Keep moving, thin dense groups before they surround you, and preserve somewhere to step next.

**Visual anchor:** round rust-fluff body, goggle eye, brush cheeks.

## 17.2 Junk Rusher

**Field note:** “Someone put springs behind a dustpan and taught it commitment.”

**Behaviour:** Pursues normally, then winds up a fast committed charge when it has a line on you.

**Tells:** The wedge body and rear coils compress into a clear ready pose before the dash; the readiness lamp reinforces the state.

**Counterplay:** Wait for commitment, then move across the charge line. Retreating straight away gives it the lane it wants.

**Visual anchor:** low orange wedge, dustpan bumper, coil legs.

## 17.3 Trash Brute

**Field note:** “Mostly bin lids, stubbornness, and enough mass to make both your problems worse.”

**Behaviour:** Advances slowly, absorbs punishment and turns occupied space into a problem while faster enemies pressure around it.

**Tells:** Its huge square body and planted march make the threat obvious; it does not need a surprise attack to matter.

**Counterplay:** Keep open lanes around it, kite the slower mass, and avoid backing into boundaries while concentrating on smaller threats.

**Visual anchor:** purple compactor block, enormous bin-lid forearms.

## 17.4 Scrap Sniper

**Field note:** “Patient, unpleasant, and somehow the one piece of junk that learned to lead a target.”

**Behaviour:** Keeps useful distance and fires a telegraphed ranged shot rather than relying on contact damage.

**Tells:** The sighting arm/stalk settles into an aiming pose before the projectile is committed.

**Counterplay:** Keep changing your line, cross its aim rather than freezing in it, and remove it when ranged pressure starts dictating your movement.

**Visual anchor:** tall narrow tripod, long sighting stalk.

## 17.5 Scrap Skitter

**Field note:** “It has discovered the side of the screen you were not looking at.”

**Behaviour:** Uses fast lateral/flanking movement to approach from awkward angles instead of simply following the shortest path.

**Tells:** Its wide sideways leg motion and lateral body orientation announce that it is trying to get around your line.

**Counterplay:** Preserve side escape space and periodically re-check the flanks instead of tunnelling on the largest threat ahead.

**Visual anchor:** low wide crab/crescent body with side legs.

## 17.6 Bastion Beetle

**Field note:** “Half beetle, half wall, entirely convinced the front is the only direction that matters.”

**Behaviour:** Carries directional protection that makes frontal pressure less effective and rewards attacking from a better angle.

**Tells:** The oversized front plate and facing are always readable; the protected side of the body should never be visually ambiguous.

**Counterplay:** Move around the shield and create rear/side angles rather than wasting fire into its strongest face.

**Visual anchor:** domed rear shell behind a dominant frontal shield.

## 17.7 Junk Nester

**Field note:** “A mobile rubbish nest whose main contribution is making more problems.”

**Behaviour:** Applies ranged/support pressure and periodically adds Dust Mites, making it a priority target when left alone.

**Tells:** The rear nest assembly opens/raises into a clear summoning posture before new threats arrive.

**Counterplay:** Do not let it sit safely behind a crowd. Make room, reach it, and reduce the source before the extra bodies close your routes.

**Visual anchor:** small front body carrying a large cable/scrap nest.

## 17.8 Shard Bot

**Field note:** “Breaking it is easy. The administrative consequences are two Dust Mites.”

**Behaviour:** Chases directly, but its defeat changes the local fight by splitting into new enemies.

**Tells:** Fracture seams and splintered geometry advertise that the shell is waiting to come apart.

**Counterplay:** Choose where you finish it. Killing one while boxed in can turn a solved threat into two immediate contacts.

**Visual anchor:** angular diamond body with major fracture seams.

## 17.9 Scrap Crusher — Boss

**Field note:** “A walking compactor with the temperament of a dropped toolbox.”

**Behaviour:** Mixes committed charge pressure with aimed ranged attacks, then becomes more aggressive as the fight wears it down.

**Tells:** The main ram visibly draws back/braces for charges; the ranged port/launcher exposes for aimed fire; the enraged state should have an obvious mechanical/heat change without hiding timing in VFX.

**Counterplay:** Keep open terrain, move across committed charges and do not spend the early fight using every escape route. Expect the cadence to tighten later.

**Moves presentation:**

- **Compactor Charge:** committed linear ram attack.
- **Aimed Shot:** ranged pressure at the mercenary's line.
- **Enraged:** later phase with more urgent charge pressure.

Do not show exact health fractions or milliseconds.

**Visual anchor:** horizontal compactor jaws/ram, asymmetric piston, recessed face.

## 17.10 Forge Warden — Boss

**Field note:** “Built to keep the forge orderly. You are, technically, clutter.”

**Behaviour:** Combines charge and aimed-fire pressure with reinforcement summons, escalating through increasingly hot/aggressive phases.

**Tells:** Tool/launcher arms lock into their attack roles; the signal arm/nest-control cue precedes reinforcements; vent shutters expose progressively more furnace core as the Warden overheats.

**Counterplay:** Manage the Junk Rusher adds before they steal every escape lane, keep enough space to cross charges, and expect less recovery time as the furnace escalates.

**Moves presentation:**

- **Warden Charge:** committed movement attack.
- **Aimed Shot:** ranged pressure.
- **Call Reinforcements:** summons Junk Rushers under the authoritative cap.
- **Overheat:** middle escalation state.
- **Meltdown:** late escalation state with the highest sustained pressure.

Do not expose implementation thresholds or internal timer values.

**Visual anchor:** tall furnace/gantry core with asymmetric tool arms and opening vent shutters.

---

# 18. Editorial/runtime truth check

Before shipping any entry, compare its copy directly against the final enemy definition and registered behavior. Specific traps:

- never claim Scrap Sniper tracks continuously if the runtime only commits a telegraphed shot;
- never claim Bastion Beetle is invulnerable from the front if the mechanic is mitigation/protection rather than absolute immunity;
- never promise a visible Nester/Shard telegraph that final #167 art/runtime does not actually present;
- never describe a boss move that was removed from the definition;
- do not list loot/rewards manually.

Content conformance should fail loudly when boss mechanic composition changes in a way that invalidates a required presentation reference.

---

# 19. Tests and validation

## Catalog conformance

For every release enemy/boss:

- exactly one enemy definition exists;
- required Compendium presentation metadata exists or a deliberate default policy applies;
- presentation ID resolves to that enemy;
- display order is unique/valid;
- no forbidden duplicated-combat fields exist;
- final art resolves;
- boss-only copy is only attached to a boss;
- optional portrait art resolves;
- copy fits configured length bounds.

## Read-model tests

Test all three states:

- unseen exposes no forbidden name/tactical copy according to spoiler policy;
- encountered exposes the correct subset;
- defeated exposes full allowed copy;
- defeated implies encountered;
- derived tags match definition mechanics;
- `Found In` follows real encounter/stage relationships;
- stage/encounter changes update the result without editing Compendium JSON;
- reduced-motion read model selects static presentation policy.

## Persistence tests

- V3 → V4 preserves every existing domain;
- known boss facts backfill safely;
- ordinary enemy history is not fabricated;
- unseen → encountered persists;
- unseen/encountered → defeated persists;
- repeated encounter/kill is idempotent;
- stale saved IDs fail soft;
- unsupported future save remains protected by existing future-version rules;
- persistence failure does not publish a false discovery and retry remains bounded.

## Input/UI tests

- large synthetic roster scrolls without clipping;
- focus follows grid navigation and scrolls into view;
- filter changes cannot strand focus;
- detail → back restores scroll/focus;
- controller/keyboard/touch/pointer converge on the same selection commands;
- resize between desktop split and portrait detail mode preserves selected enemy;
- no content is hover-only.

## Extensibility proof

Add a representative test enemy using existing mechanics, encounter membership, art conventions and Compendium presentation metadata. It must appear in generic validation/read models without changes to Compendium core runtime, view branching or save schema.

---

# 20. Implementation slices

1. **Architecture/data types:** Compendium presentation definition, validator/aggregate registration, read-model types.
2. **Save migration:** V4 Compendium sparse domain and migration/backfill tests.
3. **Authoritative facts:** encounter fact at successful enemy activation; consume existing kill/boss facts; transactional `GameContext` update.
4. **Read model:** derive status, tags, art and `Found In` from authoritative catalogs.
5. **Current ten entries:** add reviewed copy from Section 17.
6. **UI shell:** filters/grid/detail/responsive focus/navigation using shared logical actions.
7. **Art integration:** use #167 final actor sheets; add Compendium nav icon/chrome only.
8. **Adversarial tests:** migration, stale IDs, filters, focus, resize, persistence failure, new-enemy fixture.
9. **Manual review:** 390×844, small portrait, landscape/resized desktop, keyboard/controller/touch when available; reduced motion on/off.

Do not block #164 runtime remediation or entangle the feature with combat balance changes.

---

# 21. Iterative review record and closure

This plan was revised through independent review passes before commit.

## Pass 1 — ownership / duplicate-truth review

**Findings resolved:**

- An early concept risked storing stats, stage lists and boss mechanics in Compendium records; all mutable combat/content truth is now derived from existing registries.
- `Found In` is derived through encounter profiles → stages rather than maintained manually.
- Mechanical tags are derived generically from definition/archetype/mechanic shape rather than per-ID metadata.
- Dedicated monster portraits were made optional; final production combat sprites are the default collection art.

**Result:** Compendium owns presentation copy and discovery only.

## Pass 2 — persistence / migration / event-order review

**Findings resolved:**

- Current Save V3 has no legitimate Compendium home; plan now uses an explicit sparse domain and honest structural V4 migration by default.
- Historical ordinary-enemy discovery cannot be reconstructed safely; migration no longer invents it.
- Boss facts/stage-defeat facts can provide narrowly provable backfill.
- Encounter is tied to successful authoritative activation, not encounter-list membership or sprite visibility.
- Defeat consumes existing `enemy:killed`; killed-before-encounter ordering safely resolves directly to `defeated`.
- Storage failure cannot publish false discovery; retries are idempotent and bounded.

**Result:** discovery truth is monotonic, persistence-safe and does not contaminate achievements/progression authority.

## Pass 3 — spoiler / responsive / input review

**Findings resolved:**

- A permanent desktop-style split view would fail portrait; mobile now uses roster → detail and desktop may split responsively.
- Filter taxonomy was excessive for ten entries; reduced to All / Encountered / Bosses.
- Focus restoration, scroll-into-view, resize state and filter focus behavior are explicit.
- No hover, drag, pointer precision or platform-specific controller glyph is required.
- Reduced-motion presentation uses static representative frames.
- Unseen bosses use explicit spoiler policy instead of a universal reveal rule.

**Result:** the same feature is practical on canonical phone, desktop, keyboard, touch and controller.

## Pass 4 — editorial accuracy review

The ten briefs were checked against current enemy definitions and boss compositions.

**Findings resolved:**

- Removed raw health/speed/timer/phase-threshold numbers that would go stale.
- Nester copy reflects Dust Mite summoning rather than generic “spawns enemies”.
- Shard Bot explicitly warns of Dust Mite split outcome.
- Scrap Crusher copy reflects charge + aimed shot + later enrage, not a generic HP sponge.
- Forge Warden reflects charge + aimed shot + Junk Rusher summons + two escalation phases.
- Bastion Beetle uses “directional protection” rather than claiming absolute frontal immunity.
- Copy now distinguishes Behaviour, Tells and Counterplay instead of repeating the same sentence three times.

**Result:** no current entry makes a known claim that conflicts with reviewed runtime data; final integration still requires a truth check against the implementation SHA.

## Pass 5 — extensibility / conformance review

**Findings resolved:**

- Adding Enemy N+1 after the Compendium domain exists requires no save migration.
- Generic conformance covers every release enemy rather than one test per hard-coded ID.
- New stage membership automatically updates `Found In`.
- New existing-mechanic enemies do not require view/controller branches.
- Presentation copy has unknown-field rejection so combat stats cannot silently leak into the second catalog over time.

**Result:** ordinary future content remains data/assets work.

## Pass 6 — simplicity / anti-overengineering review

Removed or rejected:

- kill-count lore tiers;
- encounter timestamps;
- collection rewards/currency;
- online sync;
- scans/captures;
- raw stat encyclopaedia;
- separate monster portrait requirements;
- over-granular filters;
- a new generalized content framework;
- per-enemy UI code.

**Final result:** no material unresolved ownership, persistence, spoiler, UX, factual-copy, accessibility, extensibility or complexity finding remains. Implementation should reopen architecture only if live runtime evidence contradicts an assumption recorded above.
