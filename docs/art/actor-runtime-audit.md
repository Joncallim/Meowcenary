# Alpha 3 actor runtime audit

This audit records the actor remediation baseline for issue #191. The source
contract is 48×48 with 16 clips for mercenaries and ordinary enemies, and 64×64
with 16 clips for bosses. Runtime display sizes remain data-owned.

| Actor family | Native source | Runtime classification after remediation | Silhouette gate |
| --- | ---: | --- | --- |
| Scrap Tabby, Bolt Hound, Volt Lynx, Brass Boar, Ember Cougar, Scrap Weasel, Rattle Raptor, Piston Ram | 48×48 | Native Pixelorama sheets; concept-derived actor masters | compact ears; low quadruped; tall tufted; wide tusked; low-eared athletic; stooped satchel; beak/tail; horn arcs/box chest |
| Dust Mite, Junk Rusher, Trash Brute, Scrap Sniper | 48×48 | Selected V3 4×4 native-pixel masters with high-contrast role accents | round; wedge; square; tripod |
| Scrap Skitter, Bastion Beetle, Junk Nester, Shard Bot | 48×48 | Selected V3 native-pixel masters with simplified material groups | lateral crescent; dome/front wall; rear-heavy nest; fractured diamond |
| Scrap Crusher, Forge Warden | 64×64 | Selected V3 boss masters translated into the hero's pixel language | horizontal compactor jaw; furnace gantry |

Character runtime PNGs are deterministically exported from their matching
editable `.pxo` sources. Enemy production sheets are passed through the
provenance-locked `build-enemy-production-art.py` importer, which creates the
native 48/64px editable PXO sheets, runtime animation strips, and a separate
high-resolution portrait atlas from the same selected masters. This avoids
enlarging tiny gameplay frames in menus while keeping actor frame geometry,
anchors, collision, and logical display sizes unchanged.

The table records source/export conformance, not product-owner visual approval.
Mercenary runtime sheets remain **CANDIDATE**. The canonical roster direction
is Figma `LHpXaKqFKksfF2uismDws5` nodes `91:2` / `92:2`, and Volt Lynx is
`113:2`; native pixel masters and screenshot baselines cannot supersede those
references. See the dated [crop repair](../implementation/mercenary-sprite-crop-2026-10-08.md)
for the next evidence-led correction.

The visual review target is the canonical 390×844 viewport at actual logical
display size. The character binding is 28×28 logical pixels, but `actorView.ts`
currently applies a 1.55 presentation factor, making the full character frame
43.4 world pixels before camera/canvas scaling. Capture the actual viewport and
transform instead of treating 28 pixels as the shipped screen size. Loading
success is not visual acceptance; reviewers must
inspect silhouettes and material accents in gameplay. Enemy actor textures use
nearest-neighbour sampling, and the Junkyard roster is tested against the live
floor luminance at display scale rather than judged only from enlarged source
art.
