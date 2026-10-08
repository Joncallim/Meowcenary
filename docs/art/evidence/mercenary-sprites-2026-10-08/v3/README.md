# Brass Boar V3 native candidate — browser evidence

**CANDIDATE. Owner approved direction only; native sprite/animation not approved.**

Twelve Chromium contexts compare current runtime Boar and the exact native V3
PNG across six profiles: 360×640, 390×844/DPR3, 768×1024, 1114×720/DPR2,
1280×720 and 1920×1080. Forty-eight actor captures cover idle/run/hurt/defeat;
twelve full viewport captures show placement. The existing production fixture
`00bf2de9bbc6e2c61d4a5a4a55a3c55cceb0fde2` remains unchanged.

One actor PNG request is fulfilled per context with recorded exact bytes.
The actor is paused/posed, Equipment is empty, the held weapon is hidden only
in this fixture, and no ability FX is active. Resource/scaling/camera facts
and errors are in manifest.json; file hashes are in checked-evidence.json.

These are actual-scale browser emulations, not physical-device acceptance,
live gameplay, an animation performance benchmark or the full acceptance
matrix. No screenshot golden or production binding changed. The capture
record is provenance with machine-local paths, not a portable CI runner.
V2 remains DEPRECATED — DO NOT SHIP. #191/#174/#175/#167 remain open.
