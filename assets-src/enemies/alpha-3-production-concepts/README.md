# Alpha 3 enemy production concepts

These untouched ImageGen boards record the exploration behind the Dust Mite,
Scrap Sniper, and Scrap Crusher production redraw. They are provenance only;
the selected production sheets are imported through the deterministic enemy
builder into native editable Pixelorama projects and runtime exports.

## Selected production sheets

Five 4×4 transparent production masters were generated with the built-in
OpenAI image generator before the later visual-cutover instruction froze new
generation. Each prompt required the Alpha 3 limited salvage palette, a strict
row order of idle/run/hurt/defeat, no text or UI, one consistent ground datum,
and the behaviour silhouette below. No later replacement generation is part
of this cutover.

| Actor | Source | SHA-256 | Prompt-specific silhouette |
| --- | --- | --- | --- |
| Dust Mite | `../dust-mite/source/dust-mite-imagegen-v2.png` | `9237f225cea7061dd73fef61f6a34583720b9e421bb87bfd466732911091fb8a` | compact round one-eyed scrap/fluff mite, wire antennae and six pin legs |
| Junk Rusher | `../junk-rusher/source/junk-rusher-imagegen-v2.png` | `d7ae54fee56e7fe8f3f9bab6f25dd63084c37cfe5bf8254c3197c6608bca5791` | low forward wedge with bumper/coil construction and a readable charge line |
| Trash Brute | `../trash-brute/source/trash-brute-imagegen-v2.png` | `a1635961c4cc8b95c6972bd66fcda6f60c0ead62296fce36687c64de008f2629` | broad square bruiser with oversized plated forearms |
| Scrap Sniper | `../scrap-sniper/source/scrap-sniper-imagegen-v2.png` | `8deeb61ba3cf1cdba03fc6d0162c9a46901a922afb7985f5edf68f0b128ce77c` | very tall narrow non-humanoid tripod with lateral optic stalk |
| Scrap Crusher | `../boss-crusher/source/boss-crusher-imagegen-v2.png` | `d5cae0c21c3060e053a610a495f3b90c44b089b4539b95d952250792c421ca28` | low asymmetric boss dominated by two horizontal compactor jaws |

The remaining five selected masters already existed beside their actor PXO
sources. `build-enemy-production-art.py` treats every selected sheet the same:
native 48/64px gameplay output plus the separate shared portrait atlas.

## Selected — Direction B

- File: `direction-b-selected.png`
- SHA-256: `340303cfe687c5940f7868052d1bad531f4562ee91891fcf7635e699fd07e820`
- Selection: the simplified facets and cooler shadow blocks preserve the three
  behavior silhouettes at native scale: circle, tall tripod, horizontal jaw.

Prompt:

> Create an ALTERNATIVE production concept sheet for three ORIGINAL Meowcenary enemies, optimized for tiny runtime readability. No text, no labels, no logos, no UI, neutral cool gray workshop backdrop. Three evenly spaced full-body side/three-quarter maquettes, each with a simple solid-black silhouette thumbnail beneath. Crisp arcade pixel-art concept, minimal interior detail, thick dark contour, large geometric features, limited colors, designed for 48x48 ordinary sprites and 64x64 boss sprites. Left DUST MITE: a tiny near-perfect round rust-fluff and metal-filings ball, one enormous dark goggle eye, cream brush cheeks, six hairpin legs, two bent wire antennae, compact and frantic. Center SCRAP SNIPER: a very tall narrow NON-HUMANOID three-legged aiming machine, open negative space between long tripod legs, a long lateral sighting stalk rather than a gun, tiny body hub, rear battery counterweight, pale steel/icy blue and one danger-red optic. Right SCRAP CRUSHER BOSS: huge low asymmetrical industrial crawler whose silhouette is almost entirely two horizontal compactor jaws, one obvious side piston and exposed motor, tiny recessed cyan sensor, hazard red and dark steel; boss presence from mass and mechanics, not a crown or skull. Make the three flat-black silhouettes instantly nameable: circle, tall tripod, horizontal jaw. Avoid biped rifleman, enlarged ordinary enemy, copied warning logos, military insignia, pseudo-text, watermarks, protected symbols. Direction B: simplified graphic arcade maquettes, cooler shadow blocks, cleaner facets and less surface texture than painterly concept art.

## Rejected — Direction A

- File: `direction-a-rejected.png`
- SHA-256: `0337e8433c9dfc5f1d241ea18444471f81f7fc7e2755d7899a84d86ef67302c4`
- Rejection: the warm, dented surface treatment is appealing enlarged but is
  busier at the shipped 26 px actor display and weakens the mechanical reads.

Prompt:

> Create a production concept sheet for three ORIGINAL Meowcenary enemy actors that currently share placeholder art. No text, no labels, no logos, no weapons held by humanoids, no UI. Neutral pale workshop-paper background. Three evenly spaced full-body three-quarter enemy maquettes at comparable game scale, each with a tiny black silhouette thumbnail underneath. Crisp hard-edged limited-palette pixel-art concept rendering intended for reduction into 48x48 ordinary actor sheets and a 64x64 boss sheet. Left: DUST MITE — smallest low circular hostile, rust-fluff and metal-filings body, one oversized dark goggle eye, cream brush cheeks, six pin legs, bent wire antennae, frantic but endearing menace, must read as a round speck. Center: SCRAP SNIPER — tall narrow non-humanoid tripod scrap creature, three thin planted legs with strong negative space, long mechanical sighting stalk/arm making a horizontal aiming cue, small rear battery counterweight, pale steel and icy blue with exactly one danger-red sight accent; absolutely not a rifleman. Right: SCRAP CRUSHER BOSS — large asymmetric low industrial machine with giant horizontal compactor jaws/ram dominating the silhouette, one heavy side piston, exposed motor, small recessed sensor face, hazard red/dark steel/cream and restrained cyan machinery accent; unmistakably a boss, not an enlarged biped. Emphasize readable mechanics and radically different silhouettes. Avoid skulls, crowns, copied warning logos, military insignia, pseudo-text, watermarks, and resemblance to existing game IP. Direction A: rugged scrapyard storybook pixel art, dented hand-built materials, warm rust textures, chunky readable construction.
