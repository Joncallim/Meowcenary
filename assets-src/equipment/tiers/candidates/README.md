# Equipment tier master candidates

These eight native transparent masters were generated on 2026-09-30 with the
built-in OpenAI image-generation tool for issue #198. They remain **CANDIDATE**
art. Structural import and deterministic export checks do not constitute owner
approval or a real-size visual review. Each master contains helmet, armour,
gloves, and boots in that row order, with tiers 1 through 4 from left to right.

The seven Set prompts are retained verbatim in [prompts.json](prompts.json).
The initial Commando generation prompt was not retained. Its native output was
`/root/.codex/generated_images/01a0f247-89c1-79f2-b82a-a6dddca85434/exec-13637db2-a62a-4e47-b7fe-e7c5beafffa1.png`,
copied unchanged to `commando-tiers-v1.png`. Do not infer an exact prompt or an
approval from that source path.

## Source import

[`../masters.json`](../masters.json) pins SHA-256 digests and dimensions for all
eight original PNGs and for both historic concept boards used only for Set
emblems. The original Commando and Set concept histories/provenance remain in
their existing directories. No candidate master has been repainted, split into
reconstructed geometry, or overwritten by the importer.

Equal 4×4 cuts clipped meaningful silhouette pixels in seven masters. The
config instead records complete cell rectangles at transparent separators. The
initial diagnostic selected the nearest full transparent horizontal line to
each nominal row cut, then the nearest full transparent vertical line inside
each row band to each nominal column cut. Alpha greater than 32 defines
meaningful silhouette coverage for this diagnostic; alpha at or below 32 is
generator dust for bounds/separator detection. Low-alpha pixels inside retained
bounds are preserved without changing their alpha or color.

The frozen horizontal cuts below include both outer edges. Most rows use
vertical cuts `0, 314, 627, 940, 1254`; exceptions are listed explicitly.

| Master | Horizontal cuts | Vertical-cut exceptions (slot: cuts) |
| --- | --- | --- |
| Commando | 0, 314, 627, 940, 1254 | None |
| Scavenger | 0, 325, 627, 921, 1254 | armour: 0, 314, 627, 937, 1254 |
| Juggernaut | 0, 353, 646, 937, 1254 | armour: 0, 314, 627, 937, 1254; gloves: 0, 314, 620, 925, 1254; boots: 0, 314, 627, 936, 1254 |
| Pyro | 0, 327, 627, 927, 1254 | None |
| Recon | 0, 325, 627, 940, 1254 | None |
| Medic | 0, 348, 655, 949, 1254 | armour: 0, 314, 624, 937, 1254; gloves: 0, 314, 627, 928, 1254; boots: 0, 314, 627, 933, 1254 |
| Technician | 0, 332, 632, 945, 1254 | armour: 0, 314, 627, 938, 1254; boots: 0, 314, 627, 937, 1254 |
| Demolition | 0, 375, 658, 940, 1254 | armour: 0, 314, 627, 941, 1254 |

The importer never searches for new cuts. It validates the configured
rectangles as a full, nonoverlapping partition of every source; checks each
internal separator and the master outer edges for meaningful alpha; and rejects
empty tier cells. This accounts for every meaningful source pixel and prevents
an alpha component from crossing a cell boundary. Merged adjacent objects or a
missing tier require a new native master rather than a geometric repair.

## Candidate exports

Run from the repository root:

```bash
python3 docs/art/scripts/build-equipment-concept-atlases.py
python3 docs/art/scripts/build-equipment-concept-atlases.py --check
```

Each slot row uses one proportional scale across its four tier silhouettes,
with nearest-neighbor sampling into centered 96×96 frames and at least a
6-pixel gutter. This preserves the relative authored size progression instead
of independently maximizing every tier. The eight retained emblems use the
original LANCZOS crop to preserve their existing exported pixels exactly.

The two existing resources contain 17 frames per family row: one emblem, then
four tiers for each of the four slots. Commando has one row and the other Sets
have seven rows. All 128 tier frame IDs come from the authored
`src/data/equipment-visuals.json`; tier-1 icon IDs remain stable. Wearable logical
bindings alias these frames in the presentation registry rather than creating
duplicate atlas frames. The PNG, JSON, and editable Pixelorama project are
deterministic exports; `--check` generates temporary output and fails on
tampering or drift without repairing checked-in files.

Human owner review of the native candidates and live 44–60px presentation is
pending. Structural checks do not settle tier distinctness, family identity,
pixel quality, or visual fit.
