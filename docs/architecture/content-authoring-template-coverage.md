# Alpha 3 Content Authoring Template Coverage

**Status:** final extensibility audit companion to `content-authoring-templates.md`.

**Baseline audited:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This document answers one narrower question:

> If Meowcenary grows after Alpha 3, is **every content-bearing catalog** covered by a predictable, machine-checkable authoring path?

The answer after this review is: **the planning contract now is; the current runtime still has a small remediation list before it should be called fully template-clean.**

---

# 1. Catalog coverage matrix

| Current catalog / domain | Ordinary future addition | Canonical authoring path | Core-code change? | Current scalability verdict |
| --- | --- | --- | --- | --- |
| `characters.json` | Character N+1 | character template + ability/passive refs + actor/portrait packet | No for existing primitives | Good; remove fixed-count test expectation and keep actor-art convention explicit |
| `abilities.json` | ability using existing effect | ability template + icon | No | Good |
| character passives | static or existing reactive handler | character-owned passive / registered handler | No for existing primitive | Good |
| `enemies.json` | Enemy N+1 using existing archetype | enemy template + actor art + explicit encounter + Compendium | No | Good; actor-art convention must remain documented/tested |
| boss definitions in `enemies.json` | boss using existing action/phase vocabulary | boss composition template | No | Good |
| `equipment.json` | another piece | piece template | No | Good |
| equipment sets | Set N+1 | **first-class set definition + pieces** | Current runtime needs one cleanup first | **Not yet template-clean** |
| `gun-parts.json` | part using existing slot/stat/trait | Gunsmith part template | No | Good; remove authored `sourceId` duplication |
| `weapons.json` | new weapon/tier using existing weapon mechanics | weapon-family template below | No | Good; explicit art refs already exemplary |
| `upgrades.json` | run card using existing stat/weapon primitive | run-upgrade template below | No | Good; explicit `presentation.iconArtId` already exemplary |
| `meta-upgrades.json` | permanent upgrade using existing stat primitive | permanent-upgrade template below | No | Registry is scalable; presentation reference still needs formalization if screen remains |
| `achievements.json` | achievement using existing metric/condition/grant | achievement template | No | Good; badge reference needs adding with art integration |
| `stages.json` / chapters | Stage/Chapter N+1 using existing objective composition | stage/chapter template | No | Good |
| `encounter-profiles.json` | new explicit enemy composition | encounter template below | No | Good |
| `difficulty-profiles.json` | new tuning profile | difficulty template below | No | Good |
| `reward-profiles.json` | new reward composition | reward template below | No | Good |
| `loot-tables.json` | new explicit loot pool | loot-table template below | No | Good |
| `spawn-curves.json` | legacy/new wave curve using existing wave semantics | spawn-curve template below | No | Good; stage composition should remain the preferred Alpha 3 layer |
| `arenas.json` | new physical location | arena/world template below | No for existing arena mechanics | Good |
| `asset-bundles.json` | new chapter/location bundle | bundle template below | No | Good |
| `visual-art.json` | new existing rendering-contract asset | generic visual binding + visual brief | No | Registry good; **kind/prefix model must be generalized before many new presentation families** |
| `audio-assets.json` | new audio asset | audio asset template below | No | Good |
| `audio-map.json` | map existing event/family to asset | audio mapping template below | No for existing event/family dimension | Good |
| `weapon-feel.json` | tuning an existing weapon family | family feel template below | No | Good; new family requires explicit map/data entry, not scene logic |
| `content-version.json` | any content release | increment content version according to release policy | No gameplay code | Good |
| Monster Compendium metadata | Enemy N+1 presentation | Compendium entry template | No | Planned correctly; sparse save means no migration per enemy |

Non-content implementation catalogs/types are deliberately excluded; a new **mechanic primitive** may require registered code and tests once, then later instances return to the data-only path.

---

# 2. Weapon-family template

`weapons.json` is already one of the strongest examples because art references are explicit rather than reconstructed.

## Definition skeleton

```json
{
  "id": "new-family-t1",
  "name": "New Family I",
  "family": "new-family",
  "rarity": "common",
  "fireRateMs": 500,
  "damage": 5,
  "projectileSpeed": 350,
  "range": 200,
  "mergeTier": 1,
  "maxTier": 3,
  "pierce": 0,
  "projectileCount": 1,
  "spreadDeg": 0,
  "art": {
    "iconId": "weapon-icon:new-family:t1",
    "heldId": "weapon-held:new-family:t1",
    "projectileId": "projectile:new-family"
  }
}
```

For T2/T3, copy the same family, raise `mergeTier`, keep the family projectile reference unless the mechanic deliberately changes, and use explicit tier art IDs.

## Family packet

```text
family ID
mechanical identity
T1/T2/T3 silhouette progression
shared projectile identity
held-grip anchor
icon/held/projectile art IDs per tier
explicit loot/reward pool membership
weapon-feel profile
closest weapon family + mechanical/visual difference
```

Adding a tier/family may require explicit edits to intended loot/reward pools and `weapon-feel.json`; it must not automatically enter old pools.

---

# 3. Run-upgrade template

The existing `upgrades.json` pattern is the desired model: mechanical definition plus explicit presentation reference.

```json
{
  "id": "new-upgrade",
  "name": "New Upgrade",
  "rarity": "common",
  "target": "player",
  "description": "Player-facing summary.",
  "maxStacks": 3,
  "effects": [
    { "stat": "existingStat", "op": "mult", "value": 1.05 }
  ],
  "presentation": {
    "category": "utility",
    "iconArtId": "upgrade-icon:new-upgrade"
  }
}
```

Requirements:

- existing stat/effect vocabulary => data + icon only;
- explicit pool/offer eligibility if later architecture introduces separate pools;
- icon must pass semantic collision test against mechanically adjacent cards;
- no upgrade-ID branch in chooser/GameScene.

---

# 4. Permanent/meta-upgrade template

The current registry is generic, but `meta-upgrades.json` has no presentation reference even though the retained Progression UI needs art under #167.

Target authoring shape if the permanent-upgrade surface survives #165:

```json
{
  "id": "new-permanent-upgrade",
  "name": "New Permanent Upgrade",
  "description": "Player-facing summary.",
  "maxLevel": 5,
  "cost": { "base": 20, "growth": 1.6 },
  "effects": [
    { "stat": "existingStat", "op": "mult", "value": 1.03 }
  ],
  "presentation": {
    "iconArtId": "permanent-upgrade-icon:new-permanent-upgrade"
  }
}
```

A new permanent-upgrade definition must be absorbed by the existing ID-keyed progression/max-level maps without adding a save field. Generic validation should prove that.

If #165 removes/de-emphasizes this progression layer, do not formalize a new art pipeline solely to preserve obsolete content.

---

# 5. Encounter-profile template

Encounter profiles are explicit deterministic membership. Adding an enemy globally must never modify this file automatically.

```json
{
  "id": "encounter:new-mix",
  "enemyIds": ["enemy-a", "enemy-b"],
  "compositionWeights": {
    "enemy-a": 2,
    "enemy-b": 1
  },
  "bossId": "optional-boss-id"
}
```

Validation:

- every member resolves;
- every weighted key is a member;
- weights are valid;
- boss resolves when present;
- order is not persistence identity;
- adding Enemy N+1 does not alter this profile unless explicitly edited.

---

# 6. Difficulty-profile template

```json
{
  "id": "difficulty:new-tier",
  "healthMultiplier": 1.0,
  "damageMultiplier": 1.0,
  "speedMultiplier": 1.0,
  "spawnPressure": 0.5
}
```

Difficulty is tuning composition, not content identity. It does not own enemy lists, rewards or stage unlocks.

---

# 7. Reward-profile template

```json
{
  "id": "reward:new-stage",
  "scrapBase": 50,
  "scrapPerMinute": 10,
  "lootTableId": "existing-loot-table",
  "grants": [
    {
      "type": "grant-equipment-instance",
      "instanceId": "reward:new-stage:new-item",
      "equipmentId": "equipment:new-item",
      "tier": 1
    }
  ]
}
```

Rules:

- grants use the shared grant vocabulary only;
- deterministic instance IDs are explicit when a durable owned instance is being granted;
- content references resolve generically;
- rewards do not duplicate unlock conditions;
- first-clear/exactly-once is owned by the durable grant transaction boundary, not by ad-hoc reward code.

A new item is not automatically rewarded anywhere. The author deliberately chooses the reward profile(s).

---

# 8. Loot-table template

```json
{
  "id": "new-loot-table",
  "entries": [
    { "kind": "scrap", "amount": 10, "weight": 3 },
    { "kind": "xp", "amount": 10, "weight": 2 },
    { "kind": "weapon", "definitionId": "existing-weapon", "weight": 1 }
  ]
}
```

Nested chest/table entries may use the existing table-reference primitive when needed.

Validation must cover:

- valid positive weights;
- content/table references;
- no recursive/cyclic table chain if nesting is allowed;
- no implicit inclusion of newly added weapons/items;
- deterministic seeded draw behavior unchanged for untouched tables.

---

# 9. Spawn-curve template

Spawn curves remain an explicit legacy/composition primitive rather than a global roster.

```json
{
  "id": "new-curve",
  "durationSeconds": 120,
  "scaling": {
    "healthPerMinute": 0.15,
    "damagePerMinute": 0.10
  },
  "waves": [
    {
      "startSecond": 0,
      "enemyId": "existing-enemy",
      "spawnEveryMs": 1800,
      "maxAlive": 10
    }
  ]
}
```

Adding Enemy N+1 does not alter existing curves. Alpha 3 stage/encounter composition remains the higher-level authoring surface; do not create a curve merely because a new enemy exists.

---

# 10. Arena / world template

A new arena is a physical-space definition plus explicit visual-art references.

```text
arena stable ID
name
world size
spawn curve / compatible physical-spawn primitive
spawn regions
obstacles with stable local IDs
hazards using registered hazard kinds
floorArtIds
boundary art IDs
non-colliding decorations
obstacle skin mappings
unlock condition
```

World packet:

```text
arena/location visual thesis
floor base + variants
boundary straight/corner/patch/gate
props
landmarks / obstacle skins
collision-honesty review
quietness/readability against actors/pickups
asset bundle membership
```

A new arena with existing obstacle/hazard/spawn-region mechanics is data + assets. A genuinely new hazard mechanic is one registered mechanic change.

---

# 11. Asset-bundle template

```json
{
  "id": "bundle:new-location",
  "assetIds": [
    "world:new-location-floor:base",
    "world:new-location-boundary:straight"
  ]
}
```

Rules:

- bundle membership is explicit;
- all art IDs resolve;
- no hard-coded BootScene list per content item;
- a new chapter/location can introduce a bundle without changing loading architecture;
- shared assets may live in shared/core bundles according to the existing bundle policy rather than being duplicated.

---

# 12. Audio templates

## Asset

```json
{ "key": "sfx-new-action", "url": "assets/audio/sfx-new-action.wav" }
```

or the equivalent `music` entry.

## Existing-event mapping

```json
{
  "event": "existing:event",
  "sfxKey": "sfx-new-action",
  "cooldownMs": 100
}
```

If an existing event has an established dimension such as weapon family, add the family mapping in data. A genuinely new semantic event is a mechanic/event-contract change and must first be justified at the authoritative gameplay boundary.

Audio identity must never be reconstructed from a content display name.

---

# 13. Weapon-feel template

For an existing/new weapon family using the current feel vocabulary:

```json
{
  "family": "new-family",
  "muzzle": { "color": "#ffffff", "radius": 5, "lifetimeMs": 70 },
  "impact": { "color": "#ffffff", "radius": 5 },
  "recoilPx": 3,
  "sfxTierVolumeMultiplier": [1.0, 1.1, 1.2]
}
```

This is presentation/tuning metadata; it does not redefine weapon damage/range/fire rate.

---

# 14. Actor-art identity convention: make it explicit, not hidden

Current runtime resolves actor art by convention:

```text
character ID `scrap-tabby` -> visual-art ID `character:scrap-tabby`
enemy ID `dust-mite`       -> visual-art ID `enemy:dust-mite`
```

The validation suite also deliberately proves that a synthetic future character without `character:<id>` art fails. That makes the convention machine-enforced, but it still needs to be visible in the authoring template.

For Alpha 3 actor sheets, this convention may remain because it is simple, deterministic and validated. Do **not** extend it indiscriminately to every presentation asset.

When an owner needs multiple independent visual assets—portrait, ability icon, set emblem, card art, etc.—use explicit presentation references or a validated presentation catalog. Do not rely on increasingly elaborate prefix/string reconstruction.

This rule prevents a future author from needing to memorize undocumented naming magic while avoiding a pointless migration of stable current actor IDs.

---

# 15. Visual-art rendering kinds: required integration hardening

Current `VisualArtKind` values are coupled to semantic prefixes (`character`, `enemy`, `weapon-icon`, `upgrade-icon`, etc.), and validation expects kind/prefix agreement. That is manageable for the current manifest but does not scale cleanly to all new Alpha 3 presentation families.

Before integrating the large #167 presentation-art expansion, choose and freeze one of two deliberate designs:

**Preferred:** coarse renderer-contract kinds such as `animated-actor`, `icon`, `portrait`, `projectile`, `pickup`, `weapon-held`, `world`, `ui-chrome`, while semantic ownership remains in the binding ID/reference.

**Acceptable alternative:** retain semantic kinds only if new families are grouped into a small bounded set and no scene/UI switch grows per content domain.

Pass condition:

> Adding a new equipment icon, achievement badge, passive icon or Compendium portrait must not require adding another branch to a renderer merely because the semantic owner changed.

---

# 16. Test-suite scalability findings

The current suite has good generic conformance coverage, but the audit found two tests that currently encode present-content shape rather than future extensibility.

## Character selection fixed count

`characterSelectionController.test.ts` asserts the shipped snapshot has exactly 8 characters. Character 9 would therefore require a test-code edit even if runtime/data handling is perfectly generic.

Target:

- compare snapshot length/IDs with the registry/data fixture rather than the magic number `8`;
- retain targeted assertions for representative default/locked characters;
- add one synthetic N+1 fixture proving selection/read-model discovery automatically.

## Equipment second-fixture currently proves the wrong authoring convention

`equipment.test.ts` already has an excellent “second four-piece set” extensibility test, but its synthetic set deliberately puts `setBonuses` and `upgradeUnlocks` on `index === 0`—thereby machine-locking the hidden provider-piece convention that this audit rejects.

Target after first-class set metadata is introduced:

- synthetic Set N+1 adds one set definition + four plain pieces;
- no piece is a metadata provider;
- test proves 2/4-piece bonuses and tier unlocks from the set owner;
- ordinary piece rows contain no manually synchronized owner `sourceId`.

These are not theoretical concerns: the current tests would otherwise teach future agents to reproduce the authoring debt.

---

# 17. Current remediation register before declaring the runtime fully template-clean

| ID | Finding | Severity for future scale | Required resolution |
| --- | --- | --- | --- |
| TPL-01 | equipment `setBonuses` / `upgradeUnlocks` live on arbitrary provider piece | High | first-class validated equipment-set owner/catalog |
| TPL-02 | equipment/part effect rows manually repeat owning `sourceId` | Medium | derive source identity during resolution |
| TPL-03 | character selection test hard-codes `8` | Medium | compare to registry + synthetic N+1 fixture |
| TPL-04 | equipment extensibility test codifies provider-piece pattern | High | rewrite after TPL-01 |
| TPL-05 | actor art uses implicit prefix reconstruction | Low while explicit/validated | document current convention; use explicit refs for multi-asset presentation |
| TPL-06 | `VisualArtKind` semantic-prefix model can grow per presentation domain | Medium | generalize/freeze rendering-kind contract during #167 integration |
| TPL-07 | permanent/meta upgrades have no explicit presentation icon reference | Low/conditional | add if #165 retains the surface; otherwise do not preserve obsolete layer |
| TPL-08 | no single supporting-catalog template matrix existed | Planning gap | **resolved by this document** |

Until TPL-01 through TPL-04 are implemented, it is accurate to say **the architecture and authoring plan are scalable, but the live Alpha 3 runtime/test contract is not yet completely template-clean**.

TPL-05 is acceptable as a documented, machine-enforced actor convention rather than a blocker. TPL-06 belongs to #167 integration. TPL-07 depends on #165's product decision.

---

# 18. Final scalable-content PR contract

Any future content PR should declare one or more template classes and prove the corresponding path:

```text
CONTENT TEMPLATE(S): character | ability | passive | enemy | boss | weapon |
                     run-upgrade | permanent-upgrade | equipment-set |
                     equipment-piece | gun-part | achievement | stage/chapter |
                     encounter | difficulty | reward | loot-table | arena/world |
                     asset-bundle | visual-art | audio | compendium

MECHANIC STATUS: existing primitive | new primitive (explain why)
STABLE IDS ADDED:
EXPLICIT POOLS/COMPOSITIONS EDITED:
ART/AUDIO REFERENCES ADDED:
SAVE MIGRATION REQUIRED: no for ordinary content; explain any exception
GENERIC CONFORMANCE TEST:
SYNTHETIC N+1 GATE AFFECTED:
MANUAL PLAYTEST:
```

A reviewer should reject an ordinary content PR if the author had to edit a scene/controller switch, fixed roster list, save interface or renderer branch without introducing a genuinely new mechanic contract.

---

# 19. Audit conclusion

All current content-bearing catalogs now have an explicit authoring template or a deliberate “new mechanic” boundary in the planning contract.

The audit therefore closes the **documentation/template coverage** question, but intentionally does **not** certify the current runtime as fully template-clean until the four concrete high/medium implementation/test debts TPL-01 through TPL-04 are remediated. This distinction prevents a well-written extensibility document from masking conventions that would still make Set 9 or Character 9 harder to add than it should be.