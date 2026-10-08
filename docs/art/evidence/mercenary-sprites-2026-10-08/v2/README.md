# Brass Boar V2 browser review evidence

CANDIDATE only; no production binding or screenshot goldens changed.
The exact PNG, native source and editable PXO are pinned by the sibling V2
source manifest under assets-src/characters/brass-boar/candidates/2026-10-08/v2/.

Ten independent Chromium contexts compare current Boar and V2 across five
viewport/DPR profiles; forty actor pose captures and ten full viewport captures.
`manifest.json` records exact source hashes, camera/viewport/world/actor facts,
one fulfilled PNG request per context, no page errors, empty gear, hidden held
weapon, and no active ability FX. `checked-evidence.json` pins all capture hashes.
The source dimensions, scaling, physics and camera are unchanged. The renderer
is explicitly paused and posed for this art fixture; this is browser emulation,
not physical-device acceptance or a gameplay performance benchmark.

The capture record is provenance with machine-local paths; it is not a portable
CI runner. Native candidate source/export tests and independent visual judgment
are separate gates. Owner approval under #191 is still pending.
