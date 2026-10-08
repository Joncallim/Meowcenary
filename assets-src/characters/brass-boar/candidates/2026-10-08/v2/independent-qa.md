# External Brass Boar V2 QA — 2026-10-08

Scope: read-only check of the external V2 source and PNG against current-main
actor files and canonical Direction B. No production files or candidate files
were changed. Numeric/source conformance does not approve art direction.

## Verified

- Runtime PNG: 768×48 RGBA = sixteen 48×48 frames. All 16 borders are fully
  transparent; 16 unique full-RGBA frames and 16 unique alpha masks.
- Native builder check passed from the candidate root:
  `lua docs/art/scripts/validate-builders.lua --only docs/art/scripts/build-brass-boar.lua --check-source`
  (Lua/native raster → candidate PXO).
- Independently composited the three visible PXO layers (`body`, `face`,
  `outfit`); every pixel across all 16 frames matches candidate PNG RGBA.
- Runtime JSON matches current-main clip tags exactly: idle 1–4, run 5–10,
  hurt 11–12, defeat 13–16. Candidate JSON is unchanged from main.

## Hashes

- Canonical roster reference, `direction-b-selected.png`:
  `25cdc618848f853e8053d430e3ef0a8e1c26a699245f98e82d6d25e91bbbe729`
- Candidate PNG: `feda43809d33b44bee4a0b0bd4e2e865ec262303f613dbc9fdbeab0b8302a47c`
- Candidate JSON: `58c78c1c2b61c1872c9d3c731d779eb5d9eaf83958d1081ac158f097d5a8c5e5`
- Candidate PXO: `b1eff0e043952bc59f407344a77a1e1d9cac075a8c25e46606757b071e0507b9`
- Candidate native Lua: `ce9277f235500401ab91d5983bfbdbc7c6a8213964643e8ab7b7c385f3e77b0b`
- Contact sheet: `55d28c89cf077732eb845fb9c2e91d5c6c0722cc3699f4e830d7bbd10563a4e2`

## Visual review notes

Compared the contact sheet and 43px sample with the first Direction B figure.
V2 has a clearer low, broad boar read than V1: the cream tusks are individually
visible, the wedge-like snout is more legible, and a single brass front plate,
oxblood straps and planted feet are identifiable at native scale. Remaining
review question: the candidate is mostly side-on, while the reference presents
a stronger three-quarter view with more obvious forearms/shoulders and a large
round dented chest shell. The candidate's front plate is smoother and visually
shares space with the face. This is a concrete fidelity point for owner review,
not a failed machine gate or an approval.

## Evidence commands

- `lua docs/art/scripts/validate-builders.lua --only docs/art/scripts/build-brass-boar.lua --check-source` (run from candidate root): pass.
- Python/Pillow RGBA/alpha inspection and Python `zipfile` visible-layer composite comparison: pass.
