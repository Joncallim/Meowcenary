# Alpha 3 Art Production — Final Orthogonal Review Closure

**Authority:** final review companion for Issue #167, read after:

1. `alpha-3-art-production-briefs.md`
2. `alpha-3-current-content-art-matrix.md`
3. `../architecture/content-authoring-templates.md`
4. `../architecture/content-authoring-template-coverage.md`
5. `../architecture/alpha-3-scalability-closeout.md`

**Baseline reviewed:** `codex/alpha3-campaign` at `f5ea5e297c54c84ec8b3ad7193768fbc29ac33a7`.

This note records the corrections that survived the final catalog, originality and scalability passes. It deliberately supersedes the earlier closure language that said no findings remained before PR review had completed.

---

# 1. Corrections made after independent PR review

The first automated PR review found three **P1 content-identity errors** in the earlier art packet. They were valid and are fixed rather than waived.

## P1-A — run-upgrade identity

The draft brief contained a nonexistent `Last Stand` card while omitting the actual current `pistol-needle-rounds` definition.

**Resolution:** §7 of the main brief is now keyed to the exact 18 current `upgrades.json` IDs. `Pistol Needle Rounds` has a dedicated design and `Last Stand` is removed from current production scope.

## P1-B — Gunsmith identity/slot coverage

The draft described several imagined current parts (Long-Range Optic, Stable Stock, Standard Underbarrel, Incendiary Barrel) while omitting current stable definitions including Padded Stock, Piercing Barrel, Fire Trait Core and Mastered Fire Trait Core. It also omitted the actual `trait` slot from the slot-glyph family.

**Resolution:** §8 is rebuilt against the exact 12 current `gun-parts.json` IDs and all eight current slots:

```text
receiver
barrel
optic
stock
trigger
magazine
underbarrel
trait
```

Physical trait-core items are now explicitly distinguished from reusable FIRE/PIERCING/EXPLOSIVE trait emblems.

## P1-C — achievement identity

The draft badge list included nonexistent current achievements such as Untouchable, Hot Work and Fully Suited while omitting real current entries including First Victory, Scrap Tycoon and Well Protected.

**Resolution:** §10 is rebuilt against the exact 10 current `achievements.json` IDs/names.

---

# 2. Process correction: counts are not completeness

The earlier review correctly counted 18 upgrades, 12 parts and 10 achievements yet still mapped several of those counts to the wrong identities. The production gate is therefore strengthened:

> **Every art-requiring catalog is compared by stable ID set, not only by count.**

The current-content matrix now records the exact collision-prone ID sets and becomes part of future content conformance.

A future `count === N` test is insufficient if it cannot tell that one real ID was replaced by one invented ID.

---

# 3. Originality correction retained

The reusable boss-stage marker is a **compact compactor-jaw / toothed-gear hazard emblem** inside a clipped workshop warning frame. One heavy jaw/ram silhouette faces a smaller opposing plate, with gear teeth/piston notches establishing industrial danger.

Do not use human/animal skulls, generic fantasy boss crowns, military rank marks, copied warning logos or baked text.

---

# 4. Production-source clarification

The current repository contains deterministic ImageGen-to-Pixelorama import paths for some expanded actors. The scalable production rule is therefore:

- exploratory concept boards are never automatically accepted as final runtime art;
- a generated sheet **may** become a selected production source when its provenance is retained;
- the selected source is imported through the deterministic pipeline, reviewed/polished against the brief, and approved only after Pixelorama/source/export/real-game checks;
- the deterministic builder/import path must reproduce the accepted production source rather than an obsolete pre-polish concept.

There is no requirement to redraw every generated pixel solely because AI produced it. The actual requirements are provenance, originality, deliberate review, reproducibility and final in-game quality.

This clarification supersedes any narrower sentence in the main brief that could be read as forbidding reviewed generated source pixels from entering production at all.

---

# 5. Final cross-document checks

- **Catalog identity:** current art-producing domains are checked against stable IDs; exact run-upgrade, Gunsmith and achievement sets are now correct.
- **Actors:** all 8 mercenaries and 10 enemies/bosses have distinct silhouette directions and collision guards.
- **Combat art:** all weapon tiers, held weapons, four projectile bindings, four pickups and current world art are covered.
- **Progression art:** exact run upgrades, conditional meta upgrades, abilities, passives, 32 equipment pieces/8 sets, exact 12 Gunsmith parts/8 slots/3 trait emblems and exact 10 achievements are covered.
- **Stage art:** reusable chapter/arena/objective/boss composition avoids one-painting-per-stage debt.
- **UI:** menu, navigation, chrome, stats, HUD, controls, settings, inventory/merge and result states have an art source.
- **Compendium art:** reuses final enemy/boss sheets by default rather than creating parallel monster canon.
- **Accessibility:** grayscale/silhouette, focus, reduced-motion and 390×844 review gates are explicit.
- **Production:** concept provenance, Pixelorama source, deterministic builder parity, validation and real-game review remain mandatory.
- **Originality/legal:** no reference-game copying, realistic military expression, protected Red Cross symbol or generic skull fallback.
- **Scalability:** every future family uses canonical authoring templates and exact stable-ID coverage checks; ordinary content may not create scene/controller/save/loader/validator branches merely because the catalog grew.

---

# 6. Final scalability findings

The planning/art contract is template-complete, but the live art/runtime/tooling stack is intentionally **not** certified fully template-clean until the P1 items in `alpha-3-scalability-closeout.md` are closed.

The most important findings are:

- first-class Equipment Set ownership must replace arbitrary provider pieces;
- the synthetic Equipment Set N+1 test must stop teaching that provider pattern;
- dedicated equipment/part art requires generic static-icon compatibility rather than validators requiring `upgrade-icon`;
- logical art identity must be separated from physical texture resources before the planned Alpha 3 presentation set nearly consumes the current 256-binding ceiling;
- Boot must load resource bundles/surfaces rather than eagerly loading every non-world presentation asset;
- builder validation must become manifest/resource-driven rather than requiring another per-ID contract row for Character 9 / Enemy 11;
- deterministic builder/source/export parity must become a machine-verifiable gate;
- Compendium defeat discovery requires the universal source-independent enemy-death boundary already specified in `monster-compendium.md`.

The complete priorities and synthetic proof scenarios are in `../architecture/alpha-3-scalability-closeout.md`.

---

# 7. Closure

After applying the independent catalog corrections, the **art-production brief set has no known unresolved current-catalog identity gap** and the future-content authoring templates are comprehensive.

It is safe to use these documents as the design authority for #167, but #167 implementation must include the P1 art-resource/loader/builder hardening rather than simply adding 160+ new one-file/one-binding assets to the current proving architecture.

This closure therefore distinguishes two claims deliberately:

- **Art/content planning:** PASS.
- **Current whole authoring/tooling implementation:** NOT YET FULLY TEMPLATE-CLEAN; bounded remediation is frozen in the scalability closeout.
