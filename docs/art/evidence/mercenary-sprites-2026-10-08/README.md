# Mercenary actual-scale evidence — 2026-10-08

Baseline main: `2865e28f46b046b743283b8c1bcf7fc7ef2936a3`.
Lynx crop-repair/runtime fixture: `00bf2de9bbc6e2c61d4a5a4a55a3c55cceb0fde2`.
Boar candidate PNG: SHA-256
`a873e7d1aa726a55340da7ba438e3037f86a8d0b08e2eaf5e0e42005732b6b30`.

`manifest.json` records twenty independent browser contexts, eighty posed
actor crops and twenty full-viewport captures. `checked-evidence.json` pins
every screenshot's hash and verified texture/frame/scale and overlay facts.
The external capture record is retained as text with its original host paths;
it is provenance, not a portable repository test command.

Names encode actor, before/after/candidate, viewport/DPR and idle/run/hurt/defeat.
Crops are 96×96 CSS pixels with no post-capture enlargement. The existing
paused art-reference fixture supplies stable framing. Production actor view,
nearest sampling, physics radius and camera zoom remain intact. Selected
frames are 0, 6, 10, 15. A fixture-only pose update renders through the real
Phaser scene renderer; one held-weapon node is hidden, Equipment is empty and
the active ability-effect count is zero. No screenshot golden is promoted.

Lynx idle/run/hurt before-versus-after crops are pixel-identical on all five
profiles. Only its final defeat pose changes (537 changed screen pixels per
profile), consistent with the exact one-native-pixel right translation. Source
QA independently proves frames 1–15 unchanged and all 725 opaque frame-16
pixels preserved. The attached RED and GREEN logs demonstrate the all-eight
border regression.

The separate Brass Boar candidate remains unapproved. Its interactive review
packet is under `assets-src/characters/brass-boar/candidates/2026-10-08/`.
Neither these captures nor source conformance close a human visual gate.
