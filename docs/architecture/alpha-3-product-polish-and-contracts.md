# Alpha 3 Product Polish and Contract Hierarchy

**Status:** implementation-ready planning authority for the next Alpha 3 product-polish sequence.

**Reviewed live baseline:** PR #177 head `e9576ee1245f67fae48b9a615e47a3d300dc0f86` (`codex/mobile-acceptance-followup`).

**Live deployment at planning time:** `e9576ee1245f67fae48b9a615e47a3d300dc0f86`.

**Planning branch:** `codex/alpha3-product-polish-plan`.

This plan incorporates the latest real-device findings and supersedes conflicting presentation details in earlier Alpha 3 planning. It does not supersede stable save IDs, shared Alpha 3 data/extensibility rules, or the existing run-composition boundaries unless stated below.

Read first:

- `../../AGENTS.md`
- `../knowledge-graph.md`
- `../ai-workflow.md`
- `alpha-3-shared-foundation.md`
- `alpha-3-content-extensibility-contract.md`
- `alpha-3-final-execution-handoff.md`
- Issue #88 for Mercenary/ability identity
- Issue #89 for Equipment
- Issue #168 for the Compendium
- Issue #85 for Contracts/Stages
- Issue #167 for production art

---

## 1. Product objective

The next sequence must move Meowcenary from “systems are present” toward a game that is immediately understandable, comfortable to control and visually satisfying on a portrait phone.

The target experience is:

> The player can move without accidentally firing an ability, understands an ability from its icon and world effect, gets a short safe re-entry after choosing an upgrade, can browse enemies and Equipment visually rather than through text walls, and understands a Contract as a short sequence of Levels rather than as one isolated run.

This is not a general menu redesign. Fix the surfaces named here and preserve unrelated mechanics.

---

## 2. Delivery topology

Do not put all work into PR #177.

### 2.1 First: close existing PR #177 review debt in PR #177

PR #177 currently has four unresolved Codex P2 findings on the exact deployed head. Resolve these on `codex/mobile-acceptance-followup` before branching product work:

1. sustained ability visuals must freeze whenever authoritative ability time is frozen;
2. zero-duration ability bursts must survive long enough to render at least one presentation frame;
3. orientation blocking must quarantine keyboard/gamepad/pointer input until neutral, so a hidden press cannot fire on return to portrait;
4. transient radial ability cues must remain anchored to activation coordinates instead of following the player.

Add regressions for each. Re-run full gates and request a fresh Codex review. Do not mark threads resolved merely because code changed; resolve them only after the replacement head proves the behavior.

Do **not** add the new product scope below to PR #177. PR #177 should remain the bounded mobile-acceptance fix it already claims to be.

### 2.2 PR A: mobile playability + visual presentation

After PR #177 has a clean reviewed head, create one new PR stacked on it for:

- ability control relocation and iconography;
- ability visual-language hardening;
- post-upgrade resume grace;
- illustrated Compendium;
- grouped, visual Equipment experience.

This PR is intentionally presentation/input heavy but does not alter Stage/Contract architecture or Save V4 schema.

### 2.3 PR B: Contract -> Levels hierarchy + map placeholders

After PR A is green and reviewed, create a second PR stacked on PR A for the Contract information-architecture change.

Keep this separate because it changes campaign terminology, selection/read models, catalog structure and result/navigation semantics. It must not be mixed into the visual-control PR.

### 2.4 Existing follow-ups remain separate

- #87 assembled-weapon visual engineering remains open and separate.
- Do not use this work as an excuse for a whole-menu reskin.
- Do not claim real-device PASS from a host that cannot execute the phone journey.

---

# PR A — Mobile playability and visual presentation

## 3. Ability control: stop stealing movement

### 3.1 Current failure

The live control is a large text-heavy `120 x 60` physical-pixel card in the lower-right movement area and activates from `pointerdown`. On a portrait phone this competes directly with the thumb space used to begin or maintain the floating movement gesture.

The fix is not simply making the existing card smaller.

### 3.2 Product decision

The active ability becomes a compact graphical action control on the **mid-right edge**, leaving the lower movement zone visually and interactively quiet.

Target phone geometry:

- visual/hit target: approximately `60–68` physical px square/circle;
- right-edge aligned with safe-area margin;
- center in roughly the `58–62%` band of the safe vertical viewport;
- the lower ~28% of the safe viewport must contain no ability hit surface;
- Pause remains top-right and must not overlap the ability control or HUD.

Implement this through the existing physical-to-logical layout helpers rather than hard-coding device CSS pixels into world coordinates.

### 3.3 Tap semantics

Do not activate the ability on raw `pointerdown`.

Use an armed-tap contract:

1. pointer-down inside the ability target arms that pointer;
2. pointer movement beyond a small physical travel threshold cancels the tap;
3. pointer-up on the same live target commits once;
4. pointer-out/cancel/shutdown clears the armed pointer;
5. a second finger using the ability must never replace, release or zero the existing movement pointer;
6. an existing movement pointer that passes visually beneath/near the action control keeps movement ownership.

Keyboard `Q` and the existing gamepad logical ability action remain unchanged.

### 3.4 Ability iconography

Every current ability must own a dedicated logical icon reference in ability presentation data, e.g. `ability-icon:*`.

Required button presentation:

- dedicated icon as the primary identity;
- short ability name retained as secondary text so the icon is never the only semantic cue;
- `READY`, `ACTIVE` or cooldown seconds remain readable;
- cooldown must have a non-text visual treatment such as radial mask/ring or sweep;
- ready state gets a restrained pulse/highlight, disabled by reduced-motion preference;
- state cannot be communicated by color alone.

The eight current icons must be recognisably different at phone size. Do not reuse unrelated upgrade-card icons.

Prefer a compact atlas or similarly bounded physical resource set if that fits the existing art/resource pipeline.

### 3.5 Ability world feedback

PR #177 established the event/presentation seam. Keep it, but harden its visual vocabulary.

No ability may differ from another only by ring color.

Registered cue kinds should visibly express the mechanic:

- shockwave: expanding impact ring with outward force language;
- overclock aura: sustained electrical/rapid-motion treatment around the player;
- shield aura: visibly protective enclosed shape;
- heal burst: instantaneous recovery burst that survives at least one frame;
- speed trail: player-following motion trail/afterimage language;
- heat ring: anchored fiery radial burst;
- loot pulse: anchored collection/magnetic pulse distinct from damage;
- precision mark: crosshair/reticle treatment and sustained precision identity.

Keep cue behavior registered by cue kind, never `if (abilityId === ...)` branches.

Transient radial cues use activation coordinates. Sustained auras/trails may follow the player. Presentation time freezes exactly when the authoritative ability time freezes.

### 3.6 Ability visual acceptance

On a 390x844 phone, after one run with three different Mercenaries a tester should be able to answer without opening a wiki:

- where the ability control is;
- what ability is equipped;
- whether it is ready;
- whether activation succeeded;
- what broad thing the ability did.

Fail if the tester repeatedly starts movement on the action control, if movement stops when a second finger triggers the ability, or if two ability effects are distinguishable only by color/text.

---

## 4. Upgrade selection: safe re-entry into combat

### 4.1 Current failure

The final upgrade selection releases the level-up pause immediately. On touch, the selection finger has just left the chooser and the movement thumb may not yet have reacquired movement; the first resumed combat frame can therefore punish the player before control feels restored.

### 4.2 Product decision

After the **final queued** upgrade choice, use one short deterministic resume-grace phase:

1. chooser disappears;
2. simulation remains frozen for an initial `650 ms` tuning value;
3. normal movement input is sampled during this grace so the player can put a thumb down and prepare a movement vector;
4. a small `READY` presentation makes the frozen state intentional;
5. when the grace expires, release only the level-up pause lease;
6. at actual resume, grant a non-stacking `500 ms` damage-safety window as an initial tuning value.

These numbers are initial product constants and may be adjusted only from real-device evidence. Do not silently increase them to create difficulty balance.

### 4.3 Ownership

Do not use `setTimeout`.

Keep the grace deterministic and driven by the existing update clock. The system that owns the level-up pause lease should also own the resume-delay state; `GameScene` may wire presentation/callbacks but must not become the timer/rule owner.

The damage-safety window may use the Player's existing authoritative invulnerability mechanism, but it must be granted only from the successful final level-up resume boundary.

### 4.4 Queue semantics

If multiple level-ups are queued:

- do not insert a grace delay between cards;
- do not grant damage safety after each card;
- present the next chooser immediately while unresolved level-ups remain;
- start one grace only after the last queued offer is resolved.

A rejected/stale card selection grants nothing.

Grace must not force a resume if another higher-priority block exists, including terminal state, extraction/pending-clear, scene shutdown or portrait-orientation block.

### 4.5 Resume visual acceptance

The grace presentation is intentionally small: do not add a three-second countdown. A short `READY` cue/progress sweep is enough.

The control should feel faster and fairer, not slower.

Fail if repeated level-ups create repeated dead time, if invulnerability stacks, if combat resumes while the chooser is still visible, or if the player can be damaged before the first prepared movement vector can take effect.

---

## 5. Compendium: make it a visual bestiary

### 5.1 Current failure

The Compendium read model is currently dominated by prose. Existing enemy/boss art already exists, but Career does not use it as the primary identity.

### 5.2 Data/identity rule

Do not create a second enemy portrait database.

For encountered/defeated enemies, derive the Compendium picture from the same canonical enemy visual binding used by combat. If an elite uses base actor art at runtime, the Compendium must resolve through the same generic visual rule.

Unseen enemies use one generic mystery/silhouette asset and must not leak the undiscovered actor identity.

### 5.3 Interaction model

Use two simple states rather than a long wall of text:

**Compendium gallery**

- two-column portrait cards at phone width;
- large enemy picture or unknown silhouette;
- name (or `Unknown`);
- encountered/defeated state;
- one short role/field-note line where revealed;
- boss identity may use a visually stronger frame but the same navigation contract.

**Entry detail**

- larger static idle-frame portrait;
- name/status;
- field note;
- Behaviour;
- Tells;
- Counterplay;
- Found In when earned by discovery rules.

Tap/Confirm opens detail. Back returns to gallery, then Career. No hover-only information.

The detail state may live as presentation state in the existing menu controller; do not create new durable save state.

### 5.4 Resource loading

Do not add all enemy art to Boot.

The gallery must become usable immediately with text/placeholders. Lazy-load revealed actor art after the panel opens, then rerender only if the relevant panel/detail state is still committed.

A failed portrait load leaves a usable named text card rather than blanking the menu.

### 5.5 Compendium visual acceptance

At phone size, enemy pictures must be the first thing the eye reads. The screen should look like a bestiary, not a database table.

Fail if cards are mostly paragraph text, pictures are tiny decoration, unseen entries reveal silhouettes unique enough to identify the enemy, or loading art blocks navigation.

---

## 6. Equipment: replace the inventory dump with a build screen

### 6.1 Current failure

The current Equipment screen renders an `Owned equipment` sequence. It does not make the four slots or Set-building decision visually primary, and many pieces still borrow unrelated `upgrade-icon:*` assets.

This fails both usability and product identity.

### 6.2 Product structure

Equipment gets three bounded presentation states.

#### Equipment hub

Top section: **EQUIPPED**

Render a 2x2 grid:

- Helmet
- Armour
- Gloves
- Boots

Each slot card shows:

- slot icon/silhouette;
- equipped piece art or Empty;
- piece name;
- tier;
- small Set emblem/identity;
- obvious selected/focus treatment.

Tap an equipped slot to open that slot's chooser. Empty slots must look intentionally empty rather than missing.

Second section: **SETS**

Each Set card shows:

- Set emblem;
- Set name and one-line build thesis;
- `owned / 4` and `equipped / 4` progress;
- visible 2-piece and 4-piece milestone state.

Tap a Set card to open Set detail.

#### Slot chooser

Show only valid owned pieces for the chosen slot plus the current piece.

Each row/card shows:

- piece art;
- name + tier;
- Set emblem/name;
- concise effect delta;
- `EQUIP` / `UNEQUIP` action.

Do not mix four slots into one scrolling list.

#### Set detail

Show:

- large Set emblem + thesis;
- 2-piece and 4-piece bonuses;
- four fixed piece slots in canonical order;
- each piece state: Equipped / Owned / Fabricable / Locked / Unavailable;
- context action: Equip, Unequip, Fabricate, Upgrade, or explanatory lock copy.

All fabrication/tier/equip rules still come from existing authoritative Equipment logic. The UI renders read models and issues commands only.

### 6.3 Equipment art system

Stop shipping unrelated upgrade-card icons as final Equipment identity.

Required art:

- one dedicated emblem per active Set;
- one dedicated icon per active Equipment piece;
- coherent visual family for Helmet/Armour/Gloves/Boots;
- each Set recognisable by construction/silhouette/emblem, not color alone.

A scalable production approach is acceptable: four slot silhouettes combined with Set-specific motifs may generate distinct dedicated piece exports, provided each final piece has its own logical art ID/export and survives visual review.

Prefer one/few atlases over dozens of unrelated network resources if supported cleanly by the existing resource pipeline.

Do not create runtime branches on Set IDs. Set emblems and piece icons are data-owned refs.

### 6.4 Read model

Refactor `EquipmentController.snapshot()` into a presentation-friendly immutable model rather than forcing `MenuScene` to regroup flat arrays.

The read model should expose, at minimum:

- canonical slot cards;
- all relevant Set cards;
- active thresholds;
- selected slot/set presentation state;
- piece state/action eligibility;
- human-readable effects;
- art refs.

Keep mutation commands authoritative and separate.

### 6.5 Equipment visual acceptance

Five-second test: from the Equipment hub a player must immediately be able to answer:

- what four things can be equipped;
- what is currently equipped;
- which Sets are being built;
- how close the current loadout is to a 2-piece or 4-piece bonus.

Fail if the dominant experience is still scrolling a text inventory, if piece art is smaller than status text, if Set identity is color-only, or if simple equip/unequip requires navigating several unrelated sections.

---

## 7. PR A architecture boundaries

- No Save V4 schema change.
- No new ability mechanics.
- No new enemy mechanics.
- No new Equipment mechanics.
- No content-ID branches in controls, Compendium or Equipment renderers.
- Keep scenes as composition/lifecycle glue; pure grouping/state derivation belongs in controllers/layout helpers.
- Touch, keyboard and gamepad converge on existing logical actions.
- All interactive targets stay at least 44 physical px.
- Reduced-motion mode removes optional motion but never removes semantic state.
- New required art must pass the existing art/resource manifest and validators.
- Existing missing-resource fallbacks remain usable.

---

## 8. PR A regression matrix

Write RED tests first for the current failures and for the new ownership rules.

### Ability/input

- ability hit target not in lower movement zone at 360x640 and 390x844;
- touch down + drag on ability does not fire;
- tap down/up fires exactly once;
- movement pointer remains active while second pointer uses ability;
- ability pointer never becomes movement owner;
- cooldown/ready/active visuals update without per-frame object allocation;
- every active ability resolves a dedicated icon;
- every cue kind has a registered renderer;
- no ability-ID branch required for the eight-current-ability catalog;
- sustained FX freeze through manual pause and level-up pause;
- zero-duration FX render visibly;
- transient radial FX stay at activation coordinates;
- shutdown/restart clears effects and armed touch state.

### Upgrade resume grace

- final queued choice starts one grace;
- non-final queued choice starts no grace;
- stale/rejected choice starts no grace;
- run remains level-up paused throughout delay;
- input continues to sample during delay;
- one resume occurs after delay;
- damage safety granted once at resume;
- damage safety does not stack;
- pause/terminal/orientation/shutdown prevent accidental forced resume;
- no timer survives scene teardown.

### Compendium

- unseen entry exposes generic mystery art only;
- encountered/defeated entry resolves canonical actor art;
- elite/base-art rule remains generic;
- gallery -> detail -> back works by pointer/keyboard/controller;
- 50 synthetic entries remain navigable/scrollable;
- failed lazy load keeps text/focus usable;
- stale async load cannot resurrect a closed panel;
- no Boot preload of the Compendium actor catalog.

### Equipment

- four canonical slot cards always exist;
- empty slot is explicit;
- slot chooser contains only compatible owned pieces;
- Set counts and thresholds match authoritative equipped state;
- Set detail exposes four canonical piece slots;
- fabrication/upgrade/equip eligibility matches domain commands;
- 12-set/48-piece synthetic catalog remains generic;
- every active piece resolves dedicated Equipment art;
- every active Set resolves an emblem;
- no `upgrade-icon:*` final Equipment art remains after production conversion;
- 360x640 and 390x844 navigation/focus/scroll remains usable.

---

# PR B — Contract hierarchy and map placeholders

## 9. Terminology decision

The player-facing model changes from the previous conflated `Contract/Stage` wording.

New player-facing model:

```text
Contract
  -> Level 1
  -> Level 2
  -> ...
  -> Boss Level
```

Internal compatibility model:

```text
Contract = presentation/progression group
Level    = existing StageDefinition / stable stage ID / atomic playable run
Arena    = actual playable map/location for that Level
```

Do not mass-rename TypeScript `Stage` types or stable `stage:*` IDs merely to match player-facing language.

Save V4 continues to persist completion by stable Stage ID. Contract completion is derived from its Levels.

---

## 10. First-class Contract catalog

Add a validated Contract presentation catalog, preferably `src/data/contracts.json` plus registry/read model.

Preserve the existing `chapterId` values as the Contract grouping keys for compatibility. Their historical `chapter:*` ID prefix may remain internal.

A Contract definition should own only group-level/presentation information, for example:

```text
id                       # matches existing stage.chapterId grouping key
name
description
displayOrder
presentation.previewArtId
presentation.plannedMaps?  # presentation-only future slots
```

**Do not duplicate Level membership in `levelIds`.**

Membership is derived from `StageDefinition.chapterId`; order is derived from existing `displayOrder`. There must be one source of truth for which Levels belong to a Contract.

Do not add a Contract completion field to the save. Derive progress/completion from `save.stages`.

---

## 11. Map placeholders without fake gameplay

Current playable data has only `junkyard-lot`, and the current Forge Levels still point to it.

Do not create fake playable Arena definitions merely to make the menu look deeper.

The Contract presentation catalog may show **planned map slots** that are explicitly non-gameplay metadata:

- existing playable locations are derived from member Levels' real `arenaId`s;
- future map slots are presentation-only and marked `PLANNED` / `COMING LATER`;
- a planned map must never be accepted as a Stage `arenaId` or enter run-resource closure;
- do not invent extra named lore locations unless an existing canonical plan already names them;
- `Forge Foundry` is an acceptable planned label because current Alpha 3 planning already calls for a Forge/Foundry location.

The point is to make future multi-map capacity visible without lying about what is playable.

---

## 12. Contract UI

### 12.1 Contract selector

Replace the flat ten-row `Choose Contract` list with Contract cards.

Each Contract card shows:

- map/contract preview graphic;
- Contract name;
- short thesis;
- progress `x / n Levels`;
- selected/locked/completed state;
- compact level-path/progress markers;
- playable current location(s);
- planned map slot(s), clearly marked as planned.

Current release should therefore read naturally as two Contracts, each containing its five current Levels.

### 12.2 Contract detail

Selecting a Contract opens its Level list/path.

Each Level entry shows:

- `LEVEL N`;
- title;
- objective icon + concise objective;
- completed/selected/locked state;
- reward teaser where the existing reward model permits it;
- boss marker for boss Levels;
- actual current Arena/location.

Five current Levels should fit into a clean scrollable portrait journey without becoming a text dump.

Selecting an unlocked Level updates the existing selected Stage identity. No new selected-Contract persistence is required; selected Contract is derived from the selected Level.

Provide a direct `PLAY LEVEL` action from the detail surface in addition to the normal Home Play action, using the same existing run-loading transition.

### 12.3 Result/navigation copy

After a cleared non-final Level, the terminal action should read **Next Level**.

After the final Level of a Contract, when another Contract is available, the action should read **Next Contract**.

Internally, selection may still resolve the next Stage. Player-facing copy must reflect the hierarchy.

Home/loading copy should expose both identities, e.g.:

`Junkyard Contract • Level 2 — Scrap Run`

Do not expose `Stage` or `Chapter` terminology in normal player UI after this change.

---

## 13. Contract architecture boundaries

- Existing `ComposedRunRequest` may continue to carry only `stageId`; do not add `contractId` unless live code proves it is necessary.
- `StageDefinition` remains the atomic run-composition root for objective/encounter/difficulty/reward/Arena.
- Contract grouping does not own or duplicate those refs.
- Contract selection is presentation/progression structure, not a second run resolver.
- No Save V5.
- No stable Stage ID renames, including historical `stage:junkyard-06`.
- Adding Contract N+1 with existing Level/Arena primitives should require contract data + Stage rows + presentation art only.
- A future playable map still requires a real Arena/world implementation; planned slots do not bypass that gate.

---

## 14. Contract regressions

- every active Stage `chapterId` resolves exactly one Contract definition;
- Contract membership is derived, never duplicated;
- Level display order is deterministic and unique within a Contract;
- Contract progress derives from saved Stage facts;
- selected Contract derives from selected Stage;
- no save migration for existing users;
- current completed Stage facts produce the same effective progression after upgrade;
- current two groups surface as two Contracts with five Levels each as a release-content assertion, not a generic engine cardinality;
- synthetic Contract N+1 works without core resolver/save changes;
- planned map metadata cannot be used as a playable `arenaId`;
- actual current location always derives from Stage/Arena truth;
- Next Level / Next Contract labels are correct at boundaries;
- pointer/touch/keyboard/controller cover Contract card -> Level -> Play -> Result -> next flow;
- 360x640 and 390x844 visual containment passes;
- long names and 8-Level synthetic Contract remain usable.

---

# 15. Hostile review of this plan

The following tempting implementations were rejected during planning.

### Rejected: just move the existing 120x60 Action card upward

Why it fails: it remains text-heavy, visually weak and still commits on pointer-down. The new control must change placement, activation semantics and graphical identity together.

### Rejected: icon-only ability button

Why it fails: new players cannot infer eight abstract icons immediately. Keep icon primary but retain name/state text and tutorial hint semantics.

### Rejected: split the whole screen into left movement/right actions

Why it fails: it would change the established floating-stick interaction more than current evidence requires. First remove the known conflict with placement + armed-tap + multi-touch ownership. Revisit movement zones only if real-device evidence still shows accidental activation.

### Rejected: solve upgrade damage by adding only hidden invulnerability

Why it fails: the player still feels thrown abruptly back into combat and may not understand why hits do nothing. Use a short visible resume-grace phase, allow movement input during it, then add a small safety window at actual resume.

### Rejected: three-second post-upgrade countdown

Why it fails: repeated leveling would make the game sluggish. Grace is sub-second and happens only after the final queued choice.

### Rejected: add a setTimeout in the chooser

Why it fails: timing becomes nondeterministic, teardown-prone and owned by the wrong layer. The system that owns the level-up pause lease owns the deterministic grace state.

### Rejected: bespoke Compendium portrait database

Why it fails: it duplicates enemy visual identity and creates drift. Reuse canonical runtime actor art; only the generic unknown silhouette is Compendium-specific.

### Rejected: keep the Compendium text list and add 24px thumbnails

Why it fails: pictures remain decorative rather than identity. The gallery/card and detail hierarchy must be visually led by the enemy.

### Rejected: group Equipment only by Set

Why it fails: players equip by four physical slots and would have to hunt through Sets to answer “what am I wearing?”. The hub leads with equipped slots, while Set cards expose build progression.

### Rejected: group Equipment only by slot

Why it fails: Set thresholds become invisible and the build fantasy disappears. Keep both: slot-first loadout overview and Set-first progression/detail.

### Rejected: draw 32 unrelated one-off Equipment icons with no system

Why it fails: expensive, inconsistent and hard to extend. Use a coherent Set-motif x slot-silhouette visual grammar while still exporting dedicated piece IDs.

### Rejected: continue using `upgrade-icon:*` for Equipment

Why it fails: semantic collisions make the game feel placeholder-heavy and visually confusing. Final Equipment identity gets dedicated art.

### Rejected: rename every Stage type/ID to Level

Why it fails: large migration/refactor risk with no player benefit. Change player language and add grouping while preserving stable internal Stage identities.

### Rejected: Contract owns an explicit `levelIds` list

Why it fails: membership would be duplicated with each Stage's existing `chapterId`. Derive membership from one authority.

### Rejected: create fake Forge Arena data as a placeholder

Why it fails: a placeholder could accidentally enter run composition/resource closure and masquerade as playable content. Planned map slots stay presentation-only until a real Arena exists.

### Rejected: implement all five findings in one giant PR

Why it fails: it mixes input timing, art/resource work and campaign architecture into one review surface. First stabilize #177, then PR A for player-facing polish, then PR B for Contract hierarchy.

---

# 16. Visual quality gate

Automated correctness is necessary but not enough.

Before either new PR is recommended for merge, capture or inspect representative 390x844 and 360x640 screenshots for the affected surfaces.

Reject the result if any of the following is true:

- the eye is drawn first to paragraph text instead of the primary game object/icon;
- important states are distinguishable only by color;
- touch targets visually merge into unrelated controls;
- cards have inconsistent spacing/alignment/radii/padding without a deliberate reason;
- icons are generic/reused in ways that confuse semantics;
- the layout looks like a developer/debug inventory rather than a consumer game screen;
- a player must read implementation vocabulary to make a decision;
- visual hierarchy collapses at 360x640;
- graphics exist but are too small to add recognition at actual phone scale.

Use the existing Meowcenary visual language; do not turn this into a Hearth dashboard or a cyberpunk/military control panel.

---

# 17. Automated closeout

Inspect the current branch's `AGENTS.md` and package scripts at execution time. At minimum, run the repository-authoritative equivalents of:

```bash
npm run lint
npm run test
npm run build
npm run content:validate
npm run art:validate
git diff --check
```

Also run focused allocation/performance/lifecycle tests covering newly introduced presentation systems and shuffled tests if the repository supports them.

Request a fresh independent Codex review on each final PR head and address every material finding before calling it review-clean.

---

# 18. Real-device acceptance

Codex/host automation may prepare the candidate but must not claim this gate without a physical phone.

### PR A phone journey

1. Start a run and move continuously with one thumb; intentionally begin movement in the lower-right region several times. Ability must not fire.
2. Keep movement held and trigger the ability repeatedly with a second finger. Movement must remain continuous.
3. Observe three abilities. Their button icons and world effects must be recognisably different.
4. Trigger a level-up near enemies, select an upgrade, immediately place the movement thumb. The player gets a brief visible re-entry and is not damaged before control can resume.
5. Trigger stacked level-ups. No grace delay appears between queued cards; one appears after the final card.
6. Open Compendium. It must read visually as a bestiary; open and close several enemy details.
7. Open Equipment. Within five seconds identify all four equipped slots, current Set progress and how to change one piece.
8. Browse/equip/unequip/upgrade/fabricate using the available save state; no text/image overlap or lost Back path.

### PR B phone journey

1. Open Contract selection. It must show Contracts rather than a flat list of ten runs.
2. Open each Contract and identify its Level progression, boss Level, current location and planned map slots.
3. Select Level 1/2/5 in an unlocked Contract and launch directly.
4. Loading/Results copy must identify Contract + Level correctly.
5. Clear a non-final Level: action says Next Level.
6. Clear a final Contract Level with the next Contract available: action says Next Contract.
7. Existing completed Stage progress and unlocks must remain intact after reload.

Only after these journeys pass should the relevant PR be called product-accepted.
