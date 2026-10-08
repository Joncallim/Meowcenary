# Brass Boar V3 native animation candidate — 2026-10-08

**CANDIDATE. Owner-approved direction; native sprite/animation shipping approval pending.**

Open [review.html](review.html) for the canonical reference, accepted identity
direction, current/candidate actual-scale browser views and animation source
previews at the registered runtime frame rates. The owner approved the large
direction (“yeah this direction is fine”); that does not approve these pixels.

## Inspectable source chain

- CANONICAL: Figma file LHpXaKqFKksfF2uismDws5, 91:2 / 92:2, first figure.
- Accepted direction: sibling v3-idle-preview large generated pose.
- Candidate master: directly authored 48×48 Lua palette/row runs, 16 complete
  poses, no downsampled illustration or rejected V2 reuse.
- Editable source: brass-boar.pxo from the existing native raster builder.
- Export: brass-boar.png from the existing PXO fallback exporter.
- Metadata: brass-boar.json copied byte-for-byte from current main.
- Runtime identity for eventual approved promotion remains existing
  character:brass-boar / resource:character-brass-boar. Neither is bound here.
- Actual-scale evidence: docs/art/evidence/mercenary-sprites-2026-10-08/v3/.
- Owner acceptance: outstanding for native pixels, animation and device review.

## Validation and limits

The isolated existing builder/source-parity and exporter checks pass. Independent
QA compares all sixteen Lua frames, visible PXO composites and PNG frames
byte-for-byte; frame 1 equals the frozen refined idle. Sixteen color/alpha
poses are distinct, all borders transparent, each silhouette connected.
Clip tags remain idle1–4/run5–10/hurt11–12/defeat13–16. Standing feet remain
grounded; revised defeat closes the eyes and lowers into a resting posture.

The first animation pass was rejected internally for an alert kneeling defeat;
only frames13–16 changed in refinement. Independent visual review of the final
contact and phone captures finds identity intact and no material limb jump.
Run motion is a restrained heavy shuffle, a remaining subjective review point.

Twelve paused browser contexts across six viewport/DPR profiles fulfill exactly
one recorded PNG resource each, with no page errors. Equipment is empty; the
held weapon is fixture-hidden and no ability FX is active. Display frame remains
43.4 world pixels. This is browser emulation, not live gameplay, physical-device
acceptance, a performance benchmark or the full browser acceptance matrix.
Source animation previews loop for inspection; gameplay hurt/defeat play once.

## Reproduction

Use an isolated checkout of fixture 00bf2de9bbc6e2c61d4a5a4a55a3c55cceb0fde2;
copy this master over that checkout's Boar source (never current production
before approval). Run the existing builder with --only/--write and --check-source,
then the existing PXO exporter for brass-boar. No importer algorithm changed.
The recorded browser capture script has machine-local paths and is provenance,
not a portable CI runner. The manifest pins final source and evidence hashes.

No runtime binding, registry, gameplay, scaling, persistence or screenshot
golden changed. V2 remains DEPRECATED — DO NOT SHIP; #191/#174/#175/#167 stay open.
PR #227 remains a separate focused Lynx crop fix and is blocked by hosted CI.
