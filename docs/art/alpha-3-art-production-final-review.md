# Alpha 3 Art Production — V4 Orthogonal Review Closure

**Status:** review/closure companion for Issue #167. Active implementation decisions are governed by `alpha-3-v4-product-art-delta.md` plus the final V4 architecture.

Read in this order:

1. `../architecture/alpha-3-final-execution-handoff.md`
2. `../architecture/content-authoring-templates-v4.md`
3. `alpha-3-v4-product-art-delta.md`
4. `alpha-3-art-production-briefs.md` for unchanged detailed family/item directions
5. `alpha-3-current-content-art-matrix.md` for exact RC1 baseline identities
6. `../architecture/alpha-3-scalability-closeout.md`

**RC1 baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This note records what survived independent catalog, originality and scalability review. It does not resurrect superseded RC1 product/art requirements.

---

# 1. Independent PR-review corrections

The first automated PR review found three valid P1 catalog-identity errors in the early art packet.

## Run upgrade identity

Early draft had nonexistent `Last Stand` while omitting real `pistol-needle-rounds`.

Resolution:

- main detailed brief now uses exact RC1 18 run-upgrade IDs;
- Pistol Needle Rounds has a dedicated direction;
- Last Stand is not current/V4 content.

## Gunsmith identity / slot coverage

Early draft invented several Parts while omitting real Padded Stock, Piercing Barrel, Fire Trait Core and Mastered Fire Trait Core, and missed the real `trait` slot.

Resolution:

- exact current 12 Part IDs are recorded in the RC1 matrix;
- all eight slots are recognized;
- physical trait-core items are distinct from reusable FIRE/PIERCING/EXPLOSIVE emblems.

## Achievement identity

Early draft used invented current achievements while omitting real RC1 entries.

Resolution:

- RC1 matrix records exact stable IDs;
- V4 then deliberately retires active Well Protected and adds `achievement:boss-forge` / Warden Down.

---

# 2. Process correction: count is not completeness

A catalog can have the expected count and still contain the wrong identities.

Final gate:

> **Every active art-requiring catalog is compared by stable ID set, not only cardinality.**

A future `count === N` assertion is not an exhaustiveness proof if one real ID can be silently replaced by one invented ID.

---

# 3. Originality correction

Reusable boss-stage marker uses a compact **compactor-jaw / toothed-gear industrial hazard** vocabulary rather than generic skull/crown shorthand.

Do not use:

- human/animal skulls;
- generic fantasy boss crowns;
- copied warning logos;
- military rank marks;
- baked tiny text.

The final V4 Forge/Warden family must also distinguish intact Forge chapter/location identity from broken Warden Down defeat imagery.

---

# 4. Production-source clarification

Some RC1 expanded actors already have deterministic generated-source -> Pixelorama import paths.

Final V4 rule:

- exploratory generated boards are not automatically runtime art;
- a generated sheet may become a deliberately selected production source;
- preserve untouched selected source as provenance;
- import deterministically;
- review/edit/polish in Pixelorama as required;
- pass silhouette, palette, originality, anchor, animation, grayscale and real-scale checks;
- deterministic builder/import reproduces the **accepted production source**, not an obsolete concept.

There is no ceremonial hand-redraw requirement solely because generation contributed to source creation.

`alpha-3-v4-product-art-delta.md` is the supersession authority for any narrower wording in the older detailed brief.

---

# 5. Active V4 production corrections

The RC1 matrix is historical inventory. V4 production explicitly changes it:

- **retire** the four permanent/meta-upgrade icons with the removed permanent-stat shop;
- **retire active** Well Protected badge production while preserving historical earned save state;
- **add** Warden Down badge;
- **add** Forge/Foundry 16-asset world packet + location/chapter presentation;
- **replace** old peer Stage/Arena/Progression navigation assumptions with Play Contract / Mercenary / Loadout / Career / Training / Settings;
- use generic logical `icon`/`portrait`/`animated-actor` renderer contracts instead of semantic renderer proliferation;
- separate stable logical art IDs from physical textures/atlases/resources;
- load heavy UI/run resource bundles on demand rather than globally preloading every future presentation asset.

---

# 6. Final cross-document checks

- **Catalog identity:** exact stable-ID coverage is mandatory.
- **Mercenaries:** all eight current Mercenaries have distinct actor silhouette directions; V4 additionally requires portrait/ability/passive presentation under scalable resources.
- **Enemies/bosses:** ten current hostiles have distinct threat silhouettes; Compendium reuses final runtime sheets by default.
- **Combat art:** weapon tiers/held art/projectiles/pickups remain covered.
- **Run-build art:** exact run-upgrade catalog remains covered.
- **Loadout art:** 8 Set emblems, 32 piece icons, exact current Parts/slots/traits are production targets under V4 generic icon resources.
- **Achievements:** active V4 set uses exact stable IDs and Warden Down replacement.
- **World:** Junkyard plus justified Forge/Foundry packet; collision honesty remains mandatory.
- **UI:** final Contract-first navigation, HUD, controls, inventory/merge, results/loading/error states have owned art sources.
- **Accessibility:** silhouette/grayscale/focus/reduced-motion/phone-scale gates remain explicit.
- **Production:** provenance, editable source, deterministic build/import, parity, validation and actual-game review remain mandatory.
- **Originality/legal:** no copied reference-game expression, protected Red Cross symbol, realistic military insignia dependency or generic skull fallback.

---

# 7. Runtime/tooling scalability findings remain implementation work

Planning/art is coherent, but RC1 tooling is not yet fully template-clean. #170 owns the cross-cutting remediation:

- first-class Equipment Set ownership instead of provider pieces;
- source-free definition modifiers;
- generic dedicated icon compatibility instead of `upgrade-icon` coupling;
- logical art separate from physical resource/atlas;
- bounded logical/resource ceilings;
- lazy surface/run bundles instead of global non-world Boot preload;
- manifest/family-driven builder validation rather than current-ID registration;
- deterministic source/builder/export parity gate;
- synthetic 500 logical static art proof.

Compendium defeated discovery separately depends on the universal source-independent enemy-death settlement in the final handoff/Compendium plan.

---

# 8. Closure verdict

### Art/product planning

**PASS**, subject to current repository data remaining implementation truth and the V4 delta being applied before production.

### RC1 authoring/resource/tooling implementation

**NOT YET FULLY TEMPLATE-CLEAN.** The bounded remediation is frozen in #170 and `../architecture/alpha-3-scalability-closeout.md`.

Do not bulk-add the V4 presentation set onto RC1’s one-binding/one-texture/global-preload proving architecture and then call scalability complete. The production tranche must consume the V4 resource/tooling foundation.
