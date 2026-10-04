# In-run upgrade icon production art

The 18 stable in-run upgrade IDs now use the individually illustrated 48×48
candidate PNGs pinned beside their editable Pixelorama projects at
`assets-src/upgrade-icons/upgrade-icon-<id>/source/candidate-48.png`. Their
SHA-256 values, stable ID order, raster contract, and original-master source
limits are recorded in `assets-src/upgrade-icons/candidate-manifest.json`.

These are the selected production candidates from PR #208 at head
`04e2840dae4b1efb7f8806ae350942e68768f651`, reconciled against main baseline
`8615a0d6424117a345c9fe0f253a715163d89dd4`. The candidate artwork also had a
static 36px asset inspection. Separately, the primary integrator reviewed all
18 icons in the integrated chooser at 360px and 390px widths, plus long-label
captures at 1114px, 1280px, and 1920px widths. This records focused integration
review only; the broader human art approval gates tracked by #167/#191 remain
open.

The candidate PNGs are the normalized deliverables from the 2026-09-30 review
package. Its handoff records 1254×1254 RGBA generated masters, alpha cropping,
Pillow BOX reduction, and fitting into 48×48 with a three-pixel minimum
transparent margin. The original masters were referenced in three ChatGPT
Library archives named in the manifest, but were not available in this
workspace; their dimensions and transformations were not independently
verified here. The pinned 48×48 files are the reproducible art inputs, and
their SHA-256 hashes are checked before import.

`docs/art/scripts/build-upgrade-production-art.py --write` imports the exact
RGBA8 bytes into the per-icon Lua builders and writes each native `.pxo` with
the repository's `lua docs/art/scripts/validate-builders.lua --only <builder>
--write` Pixelorama project writer. It then reads the body cel from that native
project, exports the runtime PNG from those cel bytes with the pinned Pillow
runtime, and normalizes the existing Pixelorama 1.2 metadata schema. The input,
native body cel, and decoded runtime PNG are checked for exact pixel parity;
the canvas remains 48×48 with the existing visible `body` and hidden `notes`
layers. The runtime manifest IDs, resource IDs, and URLs stay stable.

The former `generate-upgrade-icon-placeholders.mjs` entry point is retained as
a check-only compatibility command. It cannot regenerate category placeholder
pixels over the selected production candidates. The Pillow exporter uses the
validated native project's RGBA body cel, rather than running Pixelorama's
GUI/CLI in the import environment. Whole-game human art approval remains open.

Run `python3 docs/art/scripts/build-upgrade-production-art.py --check` to verify
the pinned PNG hashes, builder payloads, native project cels and structure,
runtime pixels, metadata, active IDs, and per-icon pixel uniqueness. Its
focused red probes reject corruption in builder source, native PXO pixels, or
runtime PNG pixels. The `npm run art:validate` gate includes this check and its
corruption-probe test.
