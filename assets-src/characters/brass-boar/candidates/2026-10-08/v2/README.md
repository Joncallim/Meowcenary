# Brass Boar native candidate V2 — 2026-10-08

**CANDIDATE. Not approved for shipping or screenshot-baseline promotion.**
No production binding uses this directory. Current runtime pixels remain
unchanged by this packet. Review [review.html](review.html), or the static
[overview](review-overview.png), against the canonical first figure of Figma
`LHpXaKqFKksfF2uismDws5`, nodes `91:2` / `92:2`.

The production master is directly authored on a native 48×48 grid and stored
losslessly in `brass-boar-native-raster.lua`. `brass-boar.pxo` is the editable
16-frame counterpart, and `brass-boar.png` / `.json` are candidate exports.
The current `build-brass-boar.lua` / native-raster helper and PXO exporter were
used in an isolated copy of the existing directory layout to package them.
To reproduce, create an isolated checkout of the recorded fixture SHA, copy
these candidate Lua/PXO/PNG/JSON files over that checkout's matching Boar
source/export paths, then run the existing builder source/parity and art gates.
Do not perform this promotion in production before recorded owner approval.

Two enlarged ImageGen pose explorations were rejected as native production
masters: their fine detail did not satisfy the 48px-grid requirement. They
informed pose exploration only; neither was downsampled into these runtime
pixels. Existing selected/rejected canonical concept provenance is preserved.
Animation frames are 4 idle, 6 run, 2 hurt and 4 collapse poses. There is no
change to content IDs, clips, physics, scaling, loadout, abilities or RNG.

Independent mechanical review verified PXO-visible-layer / PNG equality across
all sixteen frames, clear borders, sixteen distinct alpha poses, and one
connected alpha component per pose. These checks do not approve visual fidelity.

Actual browser evidence uses the recorded production fixture, fulfills one
Boar PNG request with these exact bytes, and poses the existing player view.
The display frame remains 43.4 world pixels; camera zoom and DPR are recorded.
Five profiles include 360×640, 390×844/DPR3, 1114×720/DPR2, 1280×720 and
1920×1080. Gear is empty, the held weapon is hidden only for this paused art
fixture, and no ability effect is active. This is emulated browser evidence,
not physical-device acceptance. The capture script record and immutable file
hashes live in `docs/art/evidence/mercenary-sprites-2026-10-08/v2/`.

**Revised presentation:** muted brass plate and cream tusks are separated;
angular ears, bristled shoulder and four distinct native breathing poses are
present. This supersedes V1 for review, while preserving the earlier packet.
The canonical three-quarter face, shell dents and collapse still require
owner judgement at actual game scale.
No screenshot golden has been updated, and #191/#174/#175/#167 remain open.
If rejected, move this packet to **DEPRECATED — DO NOT SHIP** while retaining
its provenance. It cannot supersede **CANONICAL** direction; exploration is
**ARCHIVE — PROVENANCE ONLY**.
