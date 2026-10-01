# Figma menu chrome source import — candidate

The twelve original SVG files are byte-for-byte downloads from the high-fidelity
Figma design context fetched on 2026-09-30. The user's supplied canonical layout
is file `LHpXaKqFKksfF2uismDws5`, page `28:2` (Menu Screens — Premium), frame
`28:7` (Dispatch). `sources.json` records each original node ID, SHA-256, MIME,
and intrinsic root dimensions. Temporary download URLs are deliberately absent.

This authorizes the supplied menu layout and chrome as a source. These runtime
derivatives remain **candidate**, pending actual-scale inspection and owner
review. This does not promote actor art, equipment art, or other art families.

The importer composes whole original SVG images with CairoSVG 2.9.1, without
extracting or redrawing path geometry or changing intrinsic root dimensions.
Pillow 12.1.1 writes the deterministic atlas and normalized editable Pixelorama
project. The original SVGs remain the vector editing source; the PXO exposes the
exact imported atlas pixels in one editable layer. All frames have a 2px gutter.

Composition follows the returned high-fidelity code, with offsets measured from
the outer SVG root. Card and selected use shadow `(3,4)`, outer `(0,0)`, and face
`(2,2)`. Primary uses shadow `(3,4)` and face `(0,0)`. Rivet uses the original
5px bolt and its original 2px pin at `(1.5,1.5)`. Arrow and brand import the
whole original SVG. Each original root is preserved, including its stroke
extent: the card/selected/primary roots extend 0.5px beyond the nominal geometry.

| Frame | PNG canvas | Nominal Figma geometry | Geometry origin inside PNG |
| --- | --- | --- | --- |
| card | 174×75 | 170×70 | (0.5,0.5) |
| selected | 354×241 | 350×236 | (0.5,0.5) |
| primary | 220×51 | 216×46 | (0.5,0.5) |
| rivet | 5×5 | 5×5 | (0,0) |
| arrow | 14×20 | 12×18 | (0.5,1) |
| brand | 174×129 | 174×127 | (0,0) |

The arrow's intrinsic root is 13.3333×20 and the brand's is 174×128.172; integer
PNG canvases round upward without scaling their SVGs. Presentation code can
slice these imported assets while preserving the supplied cuts and insets.

Run `python3 docs/art/scripts/build-figma-menu-chrome.py` from the repository
root to regenerate. Install the exact versions in `docs/art/scripts/requirements.txt`
first. `--check` rejects missing or changed sources and outputs without repairing
them; it compares PNG, atlas JSON, PXO archive bytes, and native PXO pixel parity.
Source paths must remain within this directory. SVG external resources,
executable elements, events, and XML entities are rejected; the rasterizer also
uses a fetcher limited to the pinned whole SVG payloads.
