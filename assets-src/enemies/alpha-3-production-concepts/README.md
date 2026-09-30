# Alpha 3 enemy production concepts

These untouched ImageGen boards record the exploration behind the Dust Mite,
Scrap Sniper, and Scrap Crusher production redraw. They are provenance only;
the selected production sheets are imported through the deterministic enemy
builder into native editable Pixelorama projects and runtime exports.

## Selected production sheets

The original 4×4 transparent production masters established poses and actor
identity. Product-owner runtime review then found that their painterly detail
collapsed at 26 px and visibly disagreed with the native Mercenary sprites.
The approved September 2026 contrast/style remediation therefore generated a
second, deliberately pixel-made pass from each original sheet plus the shipped
Scrap Tabby sprite and selected Mercenary board. Every prompt locked the 4×4
pose order, scale, ground datum and identity while requiring broad pixel
clusters, near-black silhouette separation, compact flat palettes, transparent
gutters and no text, glow, gradients or fine surface noise.

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

## Runtime pixel-style masters — selected

| Actor | Source | SHA-256 | Runtime value/read correction |
| --- | --- | --- | --- |
| Dust Mite | `../dust-mite/source/dust-mite-pixel-v3.png` | `8130ea294b2dbf1eec32cea48f9e3e31dc6fb9046f73b78e8fdd0a4524dddc24` | orange shell, cream brushes, steel eye and dark pin-leg separation |
| Junk Rusher | `../junk-rusher/source/junk-rusher-pixel-v3.png` | `4eb94a37c5275aa849be887fa535fbc4c2dcc523aa41d5f2e797b2ced77025c9` | bright wedge/cream wear edge against charcoal springs |
| Trash Brute | `../trash-brute/source/trash-brute-pixel-v3.png` | `5318a3435977a88ac83a3865833910e9d9e1e6d13b7b2f00855a3f0490d6acfc` | brighter violet square mass and pale bin-lid forearms |
| Scrap Sniper | `../scrap-sniper/source/scrap-sniper-pixel-v3.png` | `1c0b0e3e722ca8891d3184b44e56d024cec061ede79d18a2e9cc35336325459f` | pale tripod negative space and isolated red sight |
| Scrap Skitter | `../scrap-skitter/source/scrap-skitter-pixel-v3.png` | `4edb552b52737ba6a6c2a526232c438b53c19df8eb436552edba3ee4b9e25869` | acid-lime lateral read with separated dark side legs |
| Bastion Beetle | `../bastion-beetle/source/bastion-beetle-pixel-v3.png` | `54bacaeb1703a2af7875db932416ad6aa919684c67ee853c9a4cf7a3f89ef00f` | cream/teal front wall against exposed navy dome |
| Junk Nester | `../junk-nester/source/junk-nester-pixel-v3.png` | `7f0e158f0bffc43f539b40f948d42cb660de486159938f4e84e437573887bda9` | bright ochre rear nest and small cream front body |
| Shard Bot | `../shard-bot/source/shard-bot-pixel-v3.png` | `ef1a55079eb58054175a8ea06349b947690e4d7aa77decfde1f633c5939a1059` | magenta/blue facets with broad cream fracture gaps |
| Scrap Crusher | `../boss-crusher/source/boss-crusher-pixel-v3.png` | `149c798906c6f43706051012ffb2307d59d05977677c0131c9935f59980e244d` | bright hazard-red horizontal jaws and cream bite edge |
| Forge Warden | `../boss-forge/source/boss-forge-pixel-v3.png` | `fd52d2b2e0cc993398dc7b29363f971a135dabda2875beaa0769a64ca341f6ab` | white-hot core/copper bands separated from charcoal gantry |

The generated boards remain immutable provenance. The builder imports them
with nearest-neighbour sampling into the native editable 48/64 px PXO sources;
runtime actors now also use nearest sampling, matching the Mercenary pipeline.

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
