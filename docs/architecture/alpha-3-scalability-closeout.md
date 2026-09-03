# Alpha 3 Content Scalability Closeout

**Status:** final architecture/extensibility review for the Alpha 3 art-production, Compendium and future-content authoring plans.

**Baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

**Planning head:** `codex/alpha3-art-compendium-planning` / PR #169.

This review asks a stricter question than “is the game data-driven?”:

> **Can Meowcenary grow from 8 to 20+ characters, 8 to 20+ equipment sets, 10 to dozens of enemies, and hundreds of presentation assets without content authors editing engine switches, hidden provider rows, validator ID lists, save interfaces or global loader lists?**

The answer is:

- **content architecture:** largely yes;
- **authoring documentation:** yes after the template/coverage work in this PR;
- **current implementation/tooling:** not yet completely template-clean;
- **required hardening:** finite and explicitly listed below.

Do not merge future large content tranches on the assumption that the remaining implementation debts are harmless. They are exactly the sort of debts that turn “add Character 9” into repository archaeology later.

---

# 1. What “template-clean” means

An ordinary instance of an existing content type is template-clean when a future agent can:

1. copy the domain definition template;
2. choose a stable ID using that domain's real convention;
3. author mechanics using existing primitives;
4. author its presentation/art packet;
5. place it explicitly into intended encounter/reward/loot/bundle composition;
6. run generic validators/conformance tests;
7. playtest it;
8. ship without editing core scene/controller/save/loader/validator logic merely because the content count grew.

A genuinely **new mechanic** may add one registered implementation. Once that primitive exists, later content using it returns to the ordinary template path.

A deliberate **release-content assertion** may change when the product itself changes. For example, a test saying “Alpha 3 ships eight characters” may intentionally become nine when the release roster becomes nine. That is different from a generic controller test assuming there can only ever be eight.

---

# 2. Domain-by-domain verdict

| Domain | Ordinary N+1 path | Verdict |
| --- | --- | --- |
| Characters | definition + existing ability/passive/unlock + actor/presentation art | **Structurally scalable** |
| Active abilities | definition using existing effect kind + icon | **Scalable** |
| Static/reactive passives | data / registered existing handler + icon | **Scalable** |
| Enemies | definition + existing archetype/mechanics + actor + explicit encounter + Compendium copy | **Structurally scalable** |
| Bosses | existing registered actions/phases + actor + encounter/stage + Compendium | **Scalable for existing primitives** |
| Weapons/tiers | definition + explicit icon/held/projectile + explicit pool/feel membership | **Scalable** |
| Run upgrades | definition + explicit icon + existing effect vocabulary | **Scalable** |
| Permanent upgrades | definition + optional presentation if surface survives #165 | **Scalable/conditional** |
| Equipment pieces | definition + icon + existing set/slot/modifiers | **Scalable** |
| Equipment sets | set metadata + four pieces + emblem | **Architecture target is scalable; current provider-piece implementation is not template-clean** |
| Gunsmith parts | definition + icon + explicit pools | **Scalable; authored source duplication should be cleaned up** |
| Achievements | definition + existing metric/condition/grant + badge | **Scalable** |
| Stages/chapters | composition of existing arena/objective/encounter/difficulty/reward/unlock primitives | **Scalable** |
| Encounters/difficulty/rewards/loot | explicit profile composition | **Scalable** |
| Arenas/world | definition + world assets/bundle using existing mechanics | **Scalable for existing primitives** |
| Audio | asset + existing event/family mapping | **Scalable** |
| Compendium | presentation row + sparse discovery + derived mechanics/stages/art | **Scalable after universal death boundary prerequisite** |
| Visual art logical content | stable logical art ID + reusable renderer contract | **Needs #167 resource/bundle hardening before large expansion** |
| Pixelorama/build tooling | source + deterministic builder + generic verification | **Current validator still contains per-ID contract lists; must be generalized** |

---

# 3. Character N+1 — verified architecture, one test-cleanliness nuance

The current implementation already has the important pieces:

- `DataCharacterRegistry` consumes catalog rows generically;
- character selection iterates registry content;
- unlock conditions use shared progression vocabulary;
- abilities reference a registry ID;
- static passives are definition data;
- `tests/roster.test.ts` already contains a synthetic `proof-sphinx` second-fixture proving a new character using existing primitives can be registered without a new runtime branch.

This is strong evidence that Character N+1 is not merely aspirational.

## Release count versus generic count

There are current tests that assert `8` because Alpha 3 intentionally ships eight mercenaries. That may remain as an explicit **release-spec assertion** if desired.

However, a generic controller/read-model test should not say `toHaveLength(8)` when its actual contract is “one row per registry character.” Change generic tests to compare against fixture/registry membership. Keep the product-level “this release ships eight” assertion in one deliberate roster contract, not scattered through implementation tests.

**Pass condition:** Character 9 changes the release roster/data/art and the one intentional release cardinality expectation, not controller implementation or multiple magic-count tests.

---

# 4. Equipment Set N+1 — first-class set ownership is mandatory

The current equipment system is data-driven but hides set-owned metadata on one arbitrary equipment piece. Validation explicitly requires exactly one piece in each set to act as the `setBonuses` provider; upgrade unlocks use the same representative-provider idea.

That convention fails the authoring test: a future author must know which otherwise-ordinary helmet/armour/glove/boot secretly owns the whole set.

## Required target

Introduce a first-class validated `EquipmentSetDefinition` / set catalog owning:

```text
set ID
name
presentation emblem
2-piece bonus
4-piece bonus
upgrade-tier unlock conditions
future set-level presentation metadata
```

Pieces then own only piece facts:

```text
piece ID
name
setId
slot
tier
piece effects
piece icon
```

The synthetic “second four-piece set” test must be rewritten to instantiate:

```text
1 set definition + 4 plain pieces
```

and prove 2/4-piece behavior without assigning metadata to `index === 0` or another arbitrary piece.

**Severity:** HIGH before meaningful post-Alpha-3 equipment expansion.

---

# 5. Definition-owned modifier `sourceId` duplication

Equipment and Gun Part effects currently ask the author to repeat the owner ID inside every modifier row, and validators enforce that the duplicate matches the owning definition.

Example current authoring shape:

```text
part.id = part:barrel-long
effect.sourceId = part:barrel-long
```

The owner is already known. Requiring both fields creates drift without adding authoring information.

## Target

Static definition data should declare only the modifier:

```json
{ "stat": "range", "op": "mult", "value": 1.08 }
```

Runtime resolution injects the authoritative source identity from:

- owned equipment instance / definition;
- owned Gun Part / definition;
- set + threshold for set bonuses.

Review the same pattern in ability modifiers before broadening the migration; remove duplication where `sourceId` is merely equal to the owning definition and preserve explicit source identity only where it genuinely distinguishes multiple independently removable effect sources.

**Severity:** MEDIUM; pair with equipment/set data-contract cleanup.

---

# 6. Visual art: logical identity must be separated from physical texture resources

This is the largest scale issue found by the audit.

Current `visual-art.json` effectively makes one logical art binding equal one unique Phaser texture resource:

```text
binding ID
textureKey (must be globally unique)
URL
load contract
display contract
```

The current validator also caps the catalog at **256 bindings**.

The existing game has **77** bindings. The planned Alpha 3 presentation pass adds roughly another **160–170 logical art units** once portraits, abilities, passives, parts, equipment, achievements, stage presentation, UI chrome, stat/action/settings glyphs and menu art are included.

A straightforward one-PNG-per-logical-item implementation therefore lands at roughly **240+ bindings**, i.e. within only a small amount of headroom under the present 256 cap before any meaningful post-Alpha-3 expansion.

Raising the number alone does not solve the more important issue: Boot currently loads essentially every non-world binding globally, so hundreds of small future icon PNGs would also become hundreds of global asset loads.

## Frozen target architecture

Before #167 integrates the large presentation-art set, separate **logical visual assets** from **physical texture resources**.

Conceptual shape:

```ts
interface VisualTextureResource {
  id: string;
  textureKey: string;
  url: string;
  load: ImageOrSpritesheetContract;
  sampling: 'nearest' | 'linear';
}

interface VisualArtBinding {
  id: string;                 // stable logical identity
  kind: VisualRendererKind;   // coarse rendering contract
  resourceId: string;         // physical texture/atlas resource
  frame?: number;             // for static atlas entries
  clips?: ...;                // for animated entries
  display: { width: number; height: number };
}
```

Existing 77 bindings can migrate **mechanically 1:1** to 77 resources first. No shipped stable logical art ID needs to change.

New small static presentation families may then pack into deterministic atlases while retaining independent logical IDs:

```text
resource:ui-abilities         -> many ability-icon:* bindings
resource:ui-equipment         -> many equipment-icon:* bindings
resource:ui-achievements      -> many achievement-icon:* bindings
resource:ui-gunsmith          -> part/slot/trait logical bindings
resource:ui-common            -> shared stat/action/chrome glyphs
```

An atlas is a physical optimization, not semantic identity. Repacking the atlas must not rename saved/content references.

## Bounded limits after separation

Keep defensive ceilings, but apply them to the right concepts:

- logical art bindings: bounded high enough for multiple future content packs (e.g. 2,048 rather than 256);
- physical texture resources: much smaller bounded resource count (e.g. 512 maximum, with production expected far below it);
- atlas frame counts/dimensions: separately bounded.

The exact ceiling can be refined from profiling; the architectural requirement is that **a logical-content cap is not also an HTTP/GPU-resource design by accident**.

**Severity:** HIGH for #167 integration.

---

# 7. Renderer kinds must describe rendering, not ownership

Current visual-art validation couples `kind` to ID prefix and currently knows semantic-looking values such as:

```text
character
enemy
weapon-icon
upgrade-icon
...
```

Equipment and Gun Part validators go further: their `presentation.iconArtId` currently must resolve specifically to a required **`upgrade-icon`** binding because those domains still borrow run-upgrade art.

That is incompatible with the final #167 plan for dedicated equipment and part art.

## Target renderer vocabulary

Use a small bounded rendering contract such as:

```text
animated-actor
projectile / animated-effect
pickup
icon
portrait
weapon-held
world
ui-chrome
```

Semantic ownership stays in the logical ID/reference:

```text
equipment-icon:commando-helmet
achievement-icon:first-victory
ability-icon:heat-vent
```

The renderer should not need a new switch branch because a static 32×32 icon belongs to Equipment rather than Achievements.

## Required validator migration

`assertEquipmentArtReferences` and `assertPartArtReferences` must validate:

```text
reference exists
binding is required as appropriate
renderer contract is compatible with a static icon
expected size/sampling/source rules pass
```

They must stop requiring `kind === 'upgrade-icon'`.

**Severity:** HIGH during #167 integration; this is a concrete blocker to the planned dedicated art.

---

# 8. Asset loading must scale by bundle/surface, not by total art catalog

Current Boot logic loads all non-world visual-art bindings globally; only world art is meaningfully constrained through stage bundles.

That was acceptable for a 77-binding proving set. It is not the target for a game containing hundreds of character portraits, equipment icons, achievement badges and Compendium presentation assets.

## Frozen loading model

Load **physical resources**, not logical bindings, and resolve them through explicit bundles.

Recommended bundle responsibilities:

```text
bundle:boot-core
  title/menu minimum, shared focus/chrome, essential loading/error assets

bundle:run-core
  universally required combat effects/pickups/common weapon presentation

resolved run bundle
  selected character actor
  explicit encounter-profile enemies/boss
  selected/available run weapon resources as required
  selected stage world bundle

bundle:ui-characters
  portraits + character detail icons

bundle:ui-gunsmith
  part/slot/trait atlas/resources

bundle:ui-equipment
  equipment/set atlas/resources

bundle:ui-achievements
  badge atlas/resources

bundle:ui-compendium
  Compendium chrome plus enemy art not already resident
```

The exact physical grouping may combine small static surfaces where sensible, but **opening Equipment must not require Boot to have preloaded every future Compendium asset**.

The loader deduplicates resources shared by multiple logical bindings and surfaces.

## Transition rule

A surface/run transition resolves its required bundle(s), loads missing resources, then renders/enters. It does not require manual `BootScene.load.image(...)` edits for each content item.

**Severity:** HIGH for long-term art scale and should land with the logical-resource split.

---

# 9. Pixelorama builder validation is not yet N+1 generic

Two parts of the current pipeline are already good:

- `export-pixelorama.sh` iterates the live visual-art manifest, so manifest entries drive export;
- `validate-visual-art.mjs` iterates manifest bindings and checks for PNG, metadata, `.pxo`, matching builder, dimensions, frame counts and tags.

However, `validate-builders.lua` still contains a large **hard-coded contracts table** naming specific characters/enemies and generated loops for current families. A future Character 9 or Enemy 11 can therefore require editing validation code simply so its builder is actually executed under the structural contract.

That violates the template-clean rule.

## Target

Make builder verification driven by validated art/resource metadata plus renderer-family contract templates.

Example contract registry:

```text
animated character actor -> 48×48 / 16 frames / character layers / idle-run-hurt-defeat
ordinary animated enemy  -> 48×48 / 16 frames / enemy layers / same core tags
projectile               -> 16×16 / 2 frames / fly
pickup                    -> configured size / 4 frames / idle
static icon               -> configured canvas / 1 frame
world                     -> configured canvas / 1 frame
boss                      -> declared 64/96 canvas + required core tags + declared extra clips
```

Adding another actor points at one existing contract; it does not append another validator table row.

A renderer/family contract may be extended once when a genuinely new animation contract appears.

**Severity:** HIGH for scalable art production tooling.

---

# 10. Builder/source/export parity must become an actual machine gate

Current tooling checks that builders/sources/exports exist and checks their structure, but the scalable production promise is stronger:

> rebuilding must reproduce the reviewed source/export; a polished `.pxo` may not silently diverge from its deterministic builder.

This should be proved rather than asserted in prose.

## Required gate

Add a generic verification mode, conceptually:

```text
npm run art:verify-repro
```

For every production visual resource/binding with a deterministic builder:

1. execute the builder into a temporary workspace;
2. produce/normalize the expected Pixelorama/source/export representation;
3. compare normalized pixels + relevant metadata against the checked-in reviewed production output;
4. fail with exact asset ID/path on mismatch;
5. never overwrite the working source during verification.

`art:validate` / `content:validate` should include this verification once runtime cost is acceptable, or CI should run it as an explicit companion gate.

**Severity:** MEDIUM-HIGH because reproducibility is a stated production invariant.

---

# 11. Generated/ImageGen source workflow: provenance versus production source

Current expanded enemy builders include a generic ImageGen importer that converts a checked-in 4×4 generated sheet into the Pixelorama/runtime sheet. That is a legitimate deterministic source path, but it conflicts with overly absolute wording such as “generated/concept pixels are never copied into runtime art.”

The scalable rule should be precise rather than performative:

## Frozen production-source rule

- raw exploratory concept boards are never **automatically accepted** as final runtime art;
- if a generated image/sheet is selected as a production source, keep the untouched original as provenance;
- import it through the deterministic source pipeline;
- review/edit/polish the Pixelorama source as needed to satisfy the brief, silhouette, palette, anchor and originality gates;
- ensure the deterministic builder/import path reproduces the **accepted production source**, not an obsolete pre-polish concept;
- final approval occurs only on the checked-in source/export viewed in the game at target scale.

No requirement exists to manually redraw a generated pixel merely because AI produced it. The requirement is **reviewed authorship, provenance, reproducibility and originality**, not ritual redrawing.

This rule supersedes any narrower sentence in the art-production brief that could be read as forbidding a selected generated source from entering the production pipeline after review.

**Severity:** process clarification; closes a documentation/tooling contradiction.

---

# 12. Compendium: the content template is scalable, but death truth must be universal

The Compendium plan now correctly:

- uses current unprefixed enemy IDs as its keys;
- consumes the existing `enemy:spawned` event for encounter discovery rather than creating a duplicate encounter fact;
- derives `Found In` from encounter profiles/stages;
- derives threat/mechanic presentation from authoritative mechanics;
- stores only sparse monotonic discovery state;
- requires no save migration when Enemy N+1 is later added.

One prerequisite is architectural rather than Compendium-specific:

Current lethal damage can bypass WeaponSystem and therefore bypass `enemy:killed` (e.g. Heat Vent/elemental burst). Before defeat discovery ships, all lethal sources must converge on one authoritative alive→dead boundary and publish canonical `enemy:killed` exactly once.

That boundary automatically benefits future damage mechanics and prevents every new ability from re-solving kill settlement.

**Severity:** HIGH prerequisite for #168 implementation, already frozen in `monster-compendium.md`.

---

# 13. Supporting catalog scalability

The repository already has a strong aggregate catalog architecture:

- one descriptor table assembles/validates catalogs;
- cross-reference validation is centralized;
- `content:validate` composes art validation and generic domain conformance;
- encounters/rewards/loot/stages use explicit IDs rather than global implicit inclusion.

The new `content-authoring-templates.md` and `content-authoring-template-coverage.md` now provide copyable authoring paths for:

```text
character
ability
passive
enemy
boss
weapon
run upgrade
permanent upgrade
equipment set
equipment piece
Gun Part
achievement
stage/chapter
encounter
difficulty
reward
loot table
arena/world
asset bundle
visual art
audio
Compendium
```

When a new content catalog is introduced, the coverage matrix must be updated in the same architecture change; it may not become an undocumented parallel authoring path.

---

# 14. Final remediation register

| ID | Finding | Priority | Required close condition |
| --- | --- | --- | --- |
| `SCAL-01` | equipment set metadata lives on arbitrary provider piece | **P1** | first-class validated Equipment Set owner; synthetic Set N+1 uses it |
| `SCAL-02` | definition-owned equipment/part modifier `sourceId` duplicated by author | P2 | derive source from owner; retain explicit source only when semantically necessary |
| `SCAL-03` | generic character/controller tests include magic current roster count | P2 | generic tests derive registry membership; optional single release-spec cardinality assertion remains intentional |
| `SCAL-04` | equipment extensibility fixture codifies provider-piece convention | **P1** | rewrite after SCAL-01 as 1 set + 4 plain pieces |
| `SCAL-05` | actor art ID reconstruction could be hidden convention | closed/guardrail | current character/enemy convention documented + validated; multi-asset refs explicit |
| `SCAL-06` | visual renderer kind/prefix model and part/equipment validators assume `upgrade-icon` | **P1 for #167** | coarse renderer kinds + compatible static-icon validation |
| `SCAL-07` | current 256 logical-art cap nearly consumed by Alpha 3 expansion | **P1 for #167** | separate logical bindings from physical resources; bounded higher logical cap |
| `SCAL-08` | Boot eagerly preloads all non-world art | **P1 for #167 scale** | explicit resource bundles/lazy surface loading; run resolves exact required resources |
| `SCAL-09` | `validate-builders.lua` contains per-ID builder contract list | **P1 tooling** | manifest/resource-driven renderer-family contract validation; N+1 needs no validator edit |
| `SCAL-10` | builder/source/export parity asserted but not generically compared | P2 | deterministic temp rebuild/normalized parity gate |
| `SCAL-11` | generated-source wording conflicts with current deterministic ImageGen import path | closed by this decision | selected generated source allowed only through provenance/review/polish/reproducibility gate |
| `SCAL-12` | Compendium defeat event not universal across damage sources | **P1 for #168** | one shared alive→dead boundary; canonical `enemy:killed` exactly once for every lethal path |
| `SCAL-13` | meta-upgrade presentation has no explicit icon ref | P3/conditional | add only if #165 retains that surface |
| `SCAL-14` | supporting-catalog authoring was previously implied rather than templated | closed | coverage doc now enumerates every current content-bearing catalog |

`SCAL-01`, `04`, `06`, `07`, `08`, `09` are the material blockers to claiming the **whole live authoring/tooling stack** is fully template-clean. `SCAL-12` blocks Compendium defeat tracking specifically.

---

# 15. Required proof scenarios

Before declaring the implementation template-clean, use synthetic fixtures rather than prose confidence.

## Character 9

Add a synthetic character using only existing ability/passive/unlock/weapon primitives.

Pass:

- validates;
- actor/presentation refs resolve;
- appears in registry/selection read model;
- no scene/controller/save/validator-core edit;
- no generic test changed from `8` to `9` merely to pass.

## Equipment Set 9

Add one synthetic first-class set + four pieces.

Pass:

- validates;
- 2/4-piece effects resolve from set owner;
- tier unlocks resolve from set owner;
- mixed loadouts remain correct;
- icons/emblem resolve;
- no provider piece;
- no equipment runtime/controller/save/validator-core edit.

## Part N+1

Add a part using an existing slot/stat/trait.

Pass:

- validates;
- appears in Gunsmith read model;
- art resolves through generic icon contract;
- does not enter old reward pools automatically;
- no part-specific source edit.

## Enemy 11

Add a direct enemy using an existing archetype.

Pass:

- validates;
- actor source/export builder verifies generically;
- explicit test encounter includes it;
- Compendium row appears automatically;
- `enemy:spawned` discovery works;
- canonical death fact works through shared death boundary;
- old seeded encounters unchanged.

## Presentation asset 257 / 500

Synthetic test should prove logical-art growth no longer trips an arbitrary texture-resource ceiling and does not cause Boot to request every asset.

Pass:

- hundreds of logical bindings validate;
- static bindings may share atlas resources;
- bundle resolver selects only requested resources;
- loader dedupes shared physical resources;
- an unopened UI surface does not preload its exclusive resources.

## Builder N+1

Add one synthetic actor/icon builder to fixture metadata.

Pass:

- validator discovers it from metadata/manifest;
- validates correct contract without adding a row to `validate-builders.lua`;
- intentional pixel/source mismatch fails the parity gate.

---

# 16. Content-author workflow after hardening

A future author should be able to issue a request such as:

> Add a ninth equipment set, “Salvager”, using the existing four slots and stat vocabulary.

The implementation sequence becomes deterministic:

```text
1. instantiate Equipment Set template
2. assign stable set ID
3. author set-level 2/4 bonuses + tier conditions
4. instantiate four piece definitions
5. instantiate set-art family brief + four piece deltas
6. produce emblem/icons into the equipment atlas/resource family
7. add explicit reward/unlock placement
8. run catalog + art + parity + Set N+1 conformance
9. run gameplay/UI/grayscale playtest
10. ship
```

The agent does **not** need to know:

- which piece should secretly carry set metadata;
- which scene needs another branch;
- which validator list needs another ID;
- which Boot loader call needs another PNG;
- which save interface needs another field;
- which renderer enum exists only for Equipment;
- which string prefix must be guessed for a portrait.

That is the target authoring experience for every ordinary content family.

---

# 17. Final verdict

## Planning/template layer

**PASS.**

Every current content-bearing domain has:

- a stable-ID rule;
- an owning catalog;
- a copyable authoring template;
- presentation/art guidance where applicable;
- explicit-pool/composition rules;
- a generic-validation expectation;
- an N+1 proof requirement.

The art and Compendium documents are also now keyed to the exact current catalog identities rather than count-only assumptions.

## Current runtime/tooling layer

**NOT YET FULLY TEMPLATE-CLEAN.**

The remaining issues are bounded, concrete and now designed rather than ambiguous. The most important are first-class Equipment Set ownership and the #167 art-resource/bundle/builder hardening.

Do not interpret this as a need for a generic ECS, scripting language, mod framework or universal content engine. The desired architecture remains deliberately small:

> validated catalogs + registered mechanic primitives + stable logical IDs + sparse persistence + explicit composition + resource bundles + generic conformance.

Once the P1 items in §14 close, Meowcenary will have a genuinely plug-in-like ordinary content workflow: adding more characters, equipment sets, parts, enemies, achievements and Compendium entries should scale with the **content being authored**, not with the size of the engine.