# PR #227 current-main recovery

This held candidate recovers PR #227 onto implementation main
`4f79d6210c3b028b995d67a5cc6e35318b17b2ee`. It is not merge or deployment
approval. The original candidate `00bf2de9bbc6e2c61d4a5a4a55a3c55cceb0fde2`
and its dated 8 October evidence remain historical provenance.
This report and the current issue/PR comments supersede the dated open-issue
snapshot for present status; that snapshot is not a current backlog verdict.

## Reproduced defect and preserved correction

The all-eight, all-sixteen-frame crop regression fails on current main:
Volt Lynx frame 16 contains border offsets 1968, 2016 and 2064. After the
original one-pixel native-raster correction, all nine character-art tests pass.
The existing builder regenerates the editable PXO, and the existing exporter
regenerates the PNG. Independent RGBA comparison proves frames 1–15 unchanged
and frame 16 an exact one-pixel translation to the right, preserving all 725
opaque pixels, palette and alpha. No clips, dimensions, anchors, physics,
resource IDs or screenshots change.

The original authority/documentation hunks are applied to current files rather
than replacing newer shared files. Canonical Figma identity references remain
provenance: file `LHpXaKqFKksfF2uismDws5`, roster `91:2` / `92:2`, Lynx `113:2`.
The later eight-direction brief does not reject these references; it requires
new directional/composition proof. Neither reference history nor this crop
correction approves runtime fidelity, eight-direction production, anatomy,
equipment composition or the renderer handoff.

## Timeout ownership and validation

The original hosted attempt's remaining default-budget timeout was in the
failed-save/cancel/warm-return Gunsmith journey. Its retained screenshot
preceded cancellation and did not locate the stalled phase. Current main
already separates pointer preview/cancel/zero-write from failed save,
cancellation, Menu exit and warm re-entry, preserving real logical input and
all assertions. This recovery preserves that current event-owned test; it
does not rerun the unchanged old head, increase a timeout or remove coverage.

External recovery evidence is under
`/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/`:
`pr227-current-main-red.log`, `pr227-current-main-green.log`,
`pr227-current-pixel-proof.json` and the read-only timeout/recovery reports.
These paths describe this workspace, not portable runtime resources.

Full exact-head checks, browser matrix, hosted CI and independent review are
reported on the PR when complete. Focused GREEN alone is not acceptance.
Main and production remain pinned to `4f79d62`; #191/#174/#175/#167 and the
#230/#232 visual/production gates remain open. Rejected Boar V2 and recoloured
cat studies remain rejected. No eight-direction art or runtime work is part
of this candidate.
