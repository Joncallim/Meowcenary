# Junkyard world-kit provenance

`junkyard-world-kit-selected.png` is the selected production-source board for
the playable Junkyard arena. It was created with OpenAI's built-in image
generation tool on 2026-09-28, using the approved Forge world direction and
Junkyard menu backdrop as style/material references.

Prompt summary: a strict 5×3 top-down sprite-kit board containing the three
floor materials, four boundary pieces, six low props, hanging press, and
barrel/power-stack landmark; chunky pixel-painted salvage materials; dark
steel/rust/cream/cyan palette; compact collision-honest silhouettes; no text,
characters, logos, or copied hazard marks. A second background-extraction pass
requested transparent alpha without changing the asset layout.

Selected-source SHA-256:
`fafbd2d1663868f6f47e691108fc536555e0a2dcaf51ca52b652456a711e6dee`

`docs/art/scripts/build-junkyard-concept-assets.py` performs the deterministic
grid crop, native-grid reduction, PNG export, metadata normalization, and
editable Pixelorama packaging. The original selected board is never
destructively overwritten.
