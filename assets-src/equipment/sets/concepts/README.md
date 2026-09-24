# Equipment family concept provenance

Generated 2026-09-24 with the built-in OpenAI image-generation tool for the
seven non-Commando Equipment families. These untouched boards are provenance;
the runtime pixels were reconstructed at native 32×32 scale in the editable
Pixelorama source and deterministic Lua builder.

## Shared generation brief

Create a coherent pixel-art equipment concept board for Meowcenary, covering
Scavenger, Juggernaut, Pyro, Recon, Medic, Technician and Demolition. Give each
family one emblem and four immediately recognizable slot objects: Helmet,
Armour, Gloves and Boots. Use chunky hard pixel clusters, near-black outlines,
flat restrained palettes, strong negative space and a cute improvised
junkyard/workshop language. Family identity must come from construction, not
only color: hooks and pockets; slab armour; refractory vents and copper heat
management; lenses and light straps; padding, repair canisters and a teal
paw/spark sustain symbol; cables and powered sockets; blast plates and impact
wedges. No text, pseudo-lettering, watermarks, camouflage, military rank marks,
skulls, copied warning logos, permanent flame halos, glossy gradients,
anti-aliasing or protected Red Cross imagery. Compose for faithful 32×32 native
pixel reconstruction and grayscale readability.

The detailed item-by-item constraints came from
`docs/art/alpha-3-art-production-briefs.md` §9.2–§9.8.

## Selected — direction B

`equipment-families-direction-b-selected.png`

- strongest family construction differences across the full seven-row matrix;
- slot silhouettes remain recognizable without labels;
- Technician/Recon and Demolition/Juggernaut remain structurally separate;
- Medic uses an original teal sustain motif rather than a protected emblem;
- restrained shared workshop materials keep the catalog coherent.

SHA-256:
`c43d0727ce022b76c398248c4b8531ccd24bf93bf37176dd5ebdac212276bbe6`

## Rejected — direction A

`equipment-families-direction-a-rejected.png`

The individual props were attractive, but several families leaned too heavily
on palette and fine surface detail. Slot rows were less consistent and the
Technician/Recon and heavy-set comparisons were weaker at final icon scale.

SHA-256:
`5e405d8a63787addb26733c85430d53dfd16cfff58ffd546980543f8cf9d25c7`

## Production translation

The selected direction informed silhouette and construction language only.
`source/equipment-sets-atlas.pxo` is the accepted editable production source;
`docs/art/scripts/build-equipment-sets-atlas.lua` reproduces it exactly, and
the exporter derives the named-frame runtime atlas without redrawing it.
