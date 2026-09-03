# Alpha 3 Art Production — Final Orthogonal Review Closure

**Authority:** final review companion for Issue #167, read after:

1. `alpha-3-art-production-briefs.md`
2. `alpha-3-current-content-art-matrix.md`
3. `../architecture/content-authoring-templates.md`
4. `../architecture/content-authoring-template-coverage.md`

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

# 4. Final cross-document checks

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
- **Scalability:** every future family uses the canonical authoring templates and exact stable-ID coverage checks; ordinary content may not create scene/controller/save/renderer branches.

---

# 5. Remaining implementation-level scalability findings

The **planning/art contract is now template-complete**, but the current runtime/test layer is intentionally not certified as fully template-clean until the remediation register in `content-authoring-template-coverage.md` is closed. In particular:

- TPL-01: equipment-set bonuses/unlocks must move from an arbitrary provider piece to a first-class set owner;
- TPL-02: equipment/part effect `sourceId` duplication should be derived rather than manually authored;
- TPL-03: character-selection tests must stop hard-coding the current roster size `8`;
- TPL-04: the synthetic equipment-set extensibility test must stop teaching the provider-piece pattern;
- TPL-06: the visual-art rendering-kind contract must be generalized/frozen during #167 integration before many new presentation families land.

These are not art-brief ambiguity; they are implementation authoring-path debt that would otherwise make future Character 9 / Set 9 additions less clean than the documentation promises.

---

# 6. Closure

After applying the independent P1 corrections, the **art-production brief set itself has no known unresolved current-catalog identity gap**. It is now safe to use as the design authority for #167, subject to live repository data remaining the implementation truth.

This closure does **not** claim the runtime is already fully template-clean. Runtime template cleanliness is gated separately by TPL-01 through TPL-04 and the #167 rendering-kind integration work described above.
