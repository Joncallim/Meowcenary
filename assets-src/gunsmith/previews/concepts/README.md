# Assembled weapon preview art provenance

These boards were generated for directional exploration only. Their pixels are
not shipped in the runtime atlas. The checked-in Pixelorama source deliberately
translates the selected direction into native 96×48 pixel art with a common
receiver/grip datum and transparent, interchangeable Part overlays.

## Selected direction

`assembled-weapons-direction-a-selected.png`

Prompt contract: explore a cohesive Meowcenary pixel-art weapon workbench sheet
with a compact scrap pistol, improvised SMG, broad salvage shotgun, and modular
receiver/barrel/optic/stock/trigger/magazine/underbarrel components. Use chunky
silhouettes, charcoal steel, refractory cream, teal enamel and copper fasteners;
side view, no lettering, no logos, no realistic military insignia, readable at
phone scale, and suitable for translation to co-registered transparent layers.

SHA-256: `608cfe343a78c8ad924d6d5a8ce2009b6c84ccc2bdbd893598d427f835c09bd0`

## Rejected direction

`assembled-weapons-direction-b-rejected.png`

Prompt contract: alternate assembled scrap-firearm component board emphasizing
more ornate industrial detail and aggressive proportions, using the same palette
and side-view modularity constraints. Rejected because fine detail and uneven
component registration did not survive intended 96×48 runtime scale.

SHA-256: `d94029a5b404e0999d4e1892d2bb448ce27f8c9810129ff9e0f2e38d286ef9f6`

The deterministic Lua builder is the production drawing authority; the Node
exporter proves editable-source → runtime-atlas parity.
