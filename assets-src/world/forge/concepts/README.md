# Forge / Foundry concept provenance

Generated 2026-09-24 with the built-in OpenAI image-generation tool. The
selected board direction is retained as construction reference only; neither
board is a runtime export. The production packet is rebuilt at native 32 px
and 64 px scales by `docs/art/scripts/build-forge-world-atlas.lua`.

## Prompt contract

> Working improvised foundry built into reclaimed industrial scrap; readable
> top-down/three-quarter pixel-art world packet for a phone-sized roguelite;
> charcoal and dark steel plates, refractory cream, restrained copper/orange
> heat accents; ordered heat-management lanes, grates, rails, coils, ingots,
> quench equipment, cooling ducting; 3 seamless floor tiles, 4 engineered
> boundary tiles, 6 low props, 2 squat landmarks, and 1 contained live heat
> grate; preserve clear open navigation lanes; show actual-size and grayscale
> readable silhouettes; no text, logos, copied game assets, monsters, or
> generic lava field; provide a location-card composition as layout reference.

## Selection

`forge-foundry-direction-a-selected.png`

- selected for the strongest processed/ordered industrial grammar;
- charcoal, cream, copper and orange hierarchy is useful at thumbnail size;
- furnace throat and cooling manifold read as separate squat landmark families;
- retained only as provenance; native pixels were translated and simplified in
  the deterministic builder.

SHA-256:
`b21829884ab66dbc8026f7337655a8c6c65b04f7392a9054d0d5371cbf1b1729`

## Rejection

`forge-foundry-direction-b-rejected.png`

- rejected because the hot core dominates the composition and drifts toward a
  generic lava level; boundary/collision silhouettes are less engineered.

SHA-256:
`9c66c68c02821450a144d0f7658770a189daa7f0954a31ed46f0558bf3699d23`

## Production boundary

The selected image and rejected direction are not shipped board pixels. The
runtime atlas is exported from the editable `.pxo` source and parity-checked
against the deterministic builder. Floor and live hazard values are separated
by border/grate density in grayscale, while landmark silhouettes retain their
64×64 collision-readable footprints.
