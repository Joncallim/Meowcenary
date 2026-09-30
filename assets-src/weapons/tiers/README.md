# Native weapon tier masters — CANDIDATE

These three original transparent 2172×724 family masters were generated with
the built-in `image_gen` tool on 2026-10-01. Exact prompts are retained in
`prompts.json`; source paths, SHA-256 pins, crop rectangles and authored grip
anchors are recorded in `masters.json`. All new art is **CANDIDATE**, pending
actual-size inspection and owner approval. Passing machine gates does not grant
visual approval. The rejected #198 Equipment board is not a visual authority.

The historical selected assembled-weapon board remains unchanged at
`assets-src/gunsmith/previews/concepts/assembled-weapons-direction-a-selected.png`.
It supplied worn-metal/pixel style reference only. Its earlier reference status
does not approve these new tier silhouettes. The old color/contrast-only weapon
exports and procedural wrappers remain available in Git at `03695c3`.
`masters.json` records SHA-256 and original paths for all eighteen previous PXOs
and all eighteen previous builder wrappers. `lib/epic16-weapon-art.lua` is retained
as the archived procedural recipe for these weapons, not their current source;
its projectile use remains intact.

Each family was authored natively left to right as T1/T2/T3, pointing right.
Pistol advances through side-cell and forward open chamber housings; SMG through
drum, rear brace and rail/front housing; Shotgun through barrel bands, thicker
chamber and broad front/pump housing. There are no synthesized tint tiers.

The master columns have unequal sprite extents. Crop rectangles follow measured
transparent separators and complete meaningful-alpha bounds, rather than blind
equal thirds. Native masters contain faint speckles below 16/255 alpha outside
the weapons; the importer uses threshold 16 solely to define bounds and validate
coverage. It preserves every original pixel inside each complete crop, including
its original alpha, and never reconstructs geometry or paints replacement parts.
All meaningful pixels are covered exactly once, with no meaningful border
crossings or overlapping crops.

One shared scale per family and a fixed grip datum place all three tiers into
128×80 production buffers with a four-pixel gutter. Physical buffer size preserves
authored structure; existing logical IDs, physical resource paths, and display
sizes remain unchanged. Both held and icon exports consume the same authored
shape. NEAREST sampling matches the existing runtime resource contract.

The normalized one-layer editable Pixelorama PXOs, PNG pixels and JSON dimensions
come from `build-weapon-production-art.py`, with Pillow pinned to 12.1.1. The
eighteen Lua wrappers delegate to that importer. The Lua contract validator runs
its pinned source/output parity check for exactly these known weapon wrappers;
unrelated contracts retain their existing validation.

Run from the repository root:

```sh
python3 docs/art/scripts/build-weapon-production-art.py
python3 docs/art/scripts/build-weapon-production-art.py --check
python3 docs/art/scripts/build-weapon-production-art.test.py
python3 docs/art/scripts/build-weapon-tier-evidence.py
```

`--check` compares all 54 PNG/JSON/PXO outputs exactly and never repairs changed
files. Tests inspect all eighteen actual resource images and native PXO pixels,
reject color-only adjacent tier pairs at 28px held and 44px icon sizes, and reject
source/output tampering, missing pins, coverage loss and escaping symlinks.

`evidence/actual-scale-color-gray.png` presents every resource at those actual
sizes in color and grayscale. Its 4× companion is an inspection enlargement,
not runtime art. These contacts support owner review; in-game/browser review
and owner approval remain unverified.
