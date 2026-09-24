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

## Selection

`volt-lynx-direction-a-selected.png`

- strongest upright, long-limbed silhouette;
- high ear tufts and compact sensor harness remain legible without color;
- closest to the 48×48 biped animation contract;
- selected only as construction reference for the deterministic builder and
  editable Pixelorama source.

SHA-256:
`ab84b83f729bdce701a50d50751bc04a1081dd3dd6b263127dfba50973aa5701`

## Rejections

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

No generated pixels are copied directly into the runtime sheet. The accepted
silhouette is rebuilt in `docs/art/scripts/build-volt-lynx.lua`; that builder
produces the committed `.pxo` source and the normal export pipeline produces
the runtime PNG/JSON.
