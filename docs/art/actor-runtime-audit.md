# Alpha 3 actor runtime audit

This audit records the actor remediation baseline for issue #191. The source
contract is 48×48 with 16 clips for mercenaries and ordinary enemies, and 64×64
with 16 clips for bosses. Runtime display sizes remain data-owned.

| Actor family | Native source | Runtime classification after remediation | Silhouette gate |
| --- | ---: | --- | --- |
| Scrap Tabby, Bolt Hound, Volt Lynx, Brass Boar, Ember Cougar, Scrap Weasel, Rattle Raptor, Piston Ram | 48×48 | Native Pixelorama sheets; concept-derived actor masters | compact ears; low quadruped; tall tufted; wide tusked; low-eared athletic; stooped satchel; beak/tail; horn arcs/box chest |
| Dust Mite, Junk Rusher, Trash Brute, Scrap Sniper | 48×48 | Native Pixelorama sheets | round; wedge; square; tripod |
| Scrap Skitter, Bastion Beetle, Junk Nester, Shard Bot | 48×48 | Re-authored native sheets; ImageGen imports removed | lateral crescent; dome/front wall; rear-heavy nest; fractured diamond |
| Scrap Crusher, Forge Warden | 64×64 | Native boss sheets; oversized imports removed | horizontal compactor jaw; furnace gantry |

Each runtime PNG is deterministically composited from the matching editable
`.pxo` source by `export-enemy-pxo-fallback.py` or
`export-character-pxo-fallback.py`. Concept boards under `assets-src/**/concepts`
remain provenance only; no generated pixels are copied into runtime sheets.

The visual review target is the canonical 390×844 viewport at actual logical
display size (characters ~28px, ordinary enemies ~26px, bosses according to
the current binding). Loading success is not visual acceptance; reviewers must
inspect silhouettes and material accents in gameplay.
