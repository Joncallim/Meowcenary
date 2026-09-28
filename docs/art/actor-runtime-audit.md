# Alpha 3 actor runtime audit

This audit records the actor remediation baseline for issue #191. The source
contract is 48×48 with 16 clips for mercenaries and ordinary enemies, and 64×64
with 16 clips for bosses. Runtime display sizes remain data-owned.

| Actor family | Native source | Runtime classification after remediation | Silhouette gate |
| --- | ---: | --- | --- |
| Scrap Tabby, Bolt Hound, Volt Lynx, Brass Boar, Ember Cougar, Scrap Weasel, Rattle Raptor, Piston Ram | 48×48 | Native Pixelorama sheets; concept-derived actor masters | compact ears; low quadruped; tall tufted; wide tusked; low-eared athletic; stooped satchel; beak/tail; horn arcs/box chest |
| Dust Mite, Junk Rusher, Trash Brute, Scrap Sniper | 48×48 | Selected 4×4 production masters imported to native Pixelorama sheets | round; wedge; square; tripod |
| Scrap Skitter, Bastion Beetle, Junk Nester, Shard Bot | 48×48 | Selected production masters imported to native Pixelorama sheets | lateral crescent; dome/front wall; rear-heavy nest; fractured diamond |
| Scrap Crusher, Forge Warden | 64×64 | Selected boss production masters imported to native Pixelorama sheets | horizontal compactor jaw; furnace gantry |

Character runtime PNGs are deterministically exported from their matching
editable `.pxo` sources. Enemy production sheets are passed through the
provenance-locked `build-enemy-production-art.py` importer, which creates the
native 48/64px editable PXO sheets, runtime animation strips, and a separate
high-resolution portrait atlas from the same selected masters. This avoids
enlarging tiny gameplay frames in menus while keeping actor frame geometry,
anchors, collision, and logical display sizes unchanged.

The visual review target is the canonical 390×844 viewport at actual logical
display size (characters ~28px, ordinary enemies ~26px, bosses according to
the current binding). Loading success is not visual acceptance; reviewers must
inspect silhouettes and material accents in gameplay.
