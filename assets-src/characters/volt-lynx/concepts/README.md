# Volt Lynx concept provenance

Generated 2026-09-24 with the built-in OpenAI image-generation tool. Inputs
were the shipped Scrap Tabby and pre-production Volt Lynx sheets, used only as
pixel-language and silhouette-collision references. The generated images are
concept sources, not runtime exports.

## Shared prompt contract

- cute, chunky, deliberately clustered industrial pixel art;
- 48×48 actor feasibility and 28 px runtime readability;
- near-black outline; violet/navy, cyan sensor, pale-silver face accents;
- tall narrow upright lynx, long limbs, high ear tufts, cheek ruff, compact
  sensor harness and small hip cell;
- no broad shoulder armour, weapon, glow halo, anti-aliasing, text, logo, or
  copied character expression;
- materially different black silhouette from compact square-headed Scrap
  Tabby.

Each generation requested a hero/neutral pose, silhouette or grayscale proof,
and small motion studies. These requirements instantiate
`docs/art/alpha-3-art-production-briefs.md` §3.3 rather than introducing a new
direction.

## CANONICAL direction

`volt-lynx-direction-a-selected.png`

- strongest upright, long-limbed silhouette;
- high ear tufts and compact sensor harness remain legible without color;
- closest to the 48×48 biped animation contract;
- canonical identity/anatomy direction, confirmed against Figma file
  `LHpXaKqFKksfF2uismDws5`, node `113:2`, on 2026-10-08; the native runtime
  implementation remains **CANDIDATE** until owner runtime approval.

SHA-256:
`ab84b83f729bdce701a50d50751bc04a1081dd3dd6b263127dfba50973aa5701`

## DEPRECATED — DO NOT SHIP

`volt-lynx-direction-b-rejected.png`

- strong motion and narrow proportions, but the large visor/goggles drift into
  generic glossy cyber-recon language and obscure the face.

SHA-256:
`e1b3562950a86574c700a02b8cf49c5c5cda6cab8e29f221551575db6f491f4b`

`volt-lynx-direction-c-rejected.png`

- useful cheek/ear and grayscale studies, but the primary quadruped direction
  violates the approved upright actor contract.

SHA-256:
`1656d392fb7472263238f961e515a883bf50733c1cd78d56576aca78bf7b54ef`

## Production boundary

The runtime sheet is native-grid authored art. The builder
`docs/art/scripts/build-volt-lynx.lua` restores the checked-in native raster
losslessly into the committed `.pxo`; the normal exporter produces the runtime
PNG/JSON. It does not reconstruct anatomy from geometric primitives or make
the runtime candidate authoritative. **ARCHIVE — PROVENANCE ONLY** material
may be retained for history but cannot supersede the canonical direction.
