# Native Gunsmith Part tier packet — CANDIDATE

All new artwork in this packet is **CANDIDATE**, pending owner approval. This
packet does not claim approval from Figma, browser goldens or machine validation.
The six native transparent raster masters were authored using built-in
`image_gen` on 2026-10-01. Exact prompts and reference roles are retained in
`prompts.json`; `masters.json` pins SHA-256, native dimensions, complete crop
rectangles, source assembly anchors, target anchors and shared family extents.

The ten active physical Part definitions each have five structurally distinct
native tiers. Trait Cores reuse authored tier-invariant emblems. The presentation
catalog is `src/data/gunsmith-part-visuals.json`; runtime resolution is generic
and follows the exact owned/fitted instance tier. Weapon acquisition/merge tiers
are separate. Each of Pistol, SMG and Shotgun has exactly one explicitly authored
presentation-owned base chassis and icon, with no weapon-T1 chassis lookup.

There are 100 logical physical-Part bindings (50 icons, 50 assembly overlays)
and six chassis bindings. They share **two physical resources**, not 106 required
textures: a 128×80 icon frame atlas and a 358×196 assembly frame atlas. The
assembly uses one shared canvas and data anchors; current, candidate and committed
builds compose the same exact layers rather than pre-rendering every build.

`build-gunsmith-tier-art.py` performs deterministic import, never geometric
reconstruction, repainting or tint-only synthesis. One shared scale per component
family preserves relative tier structure. Complete native RGBA crop pixels and
alpha are preserved by NEAREST import; alpha threshold16 defines meaningful
bounds and coverage only. Native master PXOs preserve **all original pixels** at
original master dimensions. Both runtime atlases also have editable Pixelorama
PXOs matching every exported pixel. Pillow is pinned to12.1.1.

The initial receiver board touched the left image edge in HeavyT1; it was rejected
and is preserved under `archive/receiver-board-v0-clipped-rejected.png`, with SHA
and rejection reason in `masters.json`. Its repaired/padded sibling is the pinned
candidate master. The earlier tierless/geometric Part icons and assembled base
atlas are deprecated for the Gunsmith surfaces. Their historical concepts,
editable PXOs, source pins and deterministic builders remain unchanged under
`assets-src/gunsmith/{icons,previews}` for provenance and legacy validation; those
historical selections do not approve this replacement candidate packet.

Run from repository root:

```sh
python3 docs/art/scripts/build-gunsmith-tier-art.py
python3 docs/art/scripts/build-gunsmith-tier-art.py --check
python3 docs/art/scripts/build-gunsmith-tier-art.test.py
python3 docs/art/scripts/build-gunsmith-tier-evidence.py
npm run art:gun-build:check
npm run art:validate
```

The check rejects changed/missing pins, crop or anchor bounds, lost native alpha
coverage, overlapping crops, tier aliases, missing catalog/resources, clipping,
escaping symlinks and stale PNG/JSON/PXO outputs. It rejects structurally
indistinct adjacent tiers at44px icon size and actual358×196 assembly size.
Negative tests verify failure occurs without output mutation or repair.

`evidence/icons-actual-scale-color-gray.png` shows all53 exact icon frames at44px;
its3× companion is inspection enlargement only. The assembly contact shows the
three chassis composed at358×196 with five tiers of compatible physical Parts in
color and grayscale. It includes both receivers, all three barrels and all seven
physical slots across the family rows. These contacts were inspected locally;
in-game/device review and owner approval remain unverified.

## Integration path and evidence checks

The component importer confines all three gameplay/presentation catalog inputs
and every source/output to the repository boundary. Evidence generation also
preflights every resolved destination before writing. `--check` rejects stale or
missing boards without repairing them. Required `art:gun-build:check` (and thus
`art:validate`) executes both import/evidence parity checks and all nine Python
regressions, including real symlink targets and non-repairing CLI behavior.
All twelve native exports and all three contact boards retain their original
bytes. These checks preserve CANDIDATE provenance; they do not confer owner
approval or satisfy the separate Build/Workshop/Parts menu acceptance.
