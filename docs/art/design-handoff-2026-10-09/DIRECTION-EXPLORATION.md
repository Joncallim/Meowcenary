# #230 direction exploration brief

Decision owner: Jonathan. Status: UNAPPROVED. No actor production, sockets, renderer, topology or shadow-state contract may be frozen yet.

## Canonical subjects

Use the SAME Scrap Tabby and Bolt Hound across every direction. No fur/colour variants. Tabby is compact, square-headed, notched-ear, short-tail, teal-neckchief amber/cream scavenger. Hound is long low quadruped, asymmetrical ears, angular tail, springy legs, canvas/cable racing harness, cyan foreleg bracer and restrained lime timing light. Follow current `alpha-3-art-production-briefs.md`; rejected recoloured-cat sheets are excluded.

## Comparison and decision criteria

- 2-direction: one side view plus mirror; clearly demonstrate that up/down travel does not turn the face or anatomy. Lowest art cost, greatest mismatch risk for top-down movement and vertical shots. Mirroring flips fixed anatomical asymmetry, so it is not visually neutral.
- 4-direction: front/back/right/left; side may still mirror only if identity asymmetry is deliberately accepted. Front/back require genuine separate body, Equipment occlusion, weapon-mount and shadow footprints. Four movement sectors must not change authoritative aim or projectile angle.
- 8-direction: defer full production; one diagonal study may show whether it materially improves vertical/diagonal firing or merely multiplies upkeep. No eight-direction recommendation without an observed 4-direction defect.

Compare at 48×48 native-target canvas, nominal 28 px stress size, and current transformed 43.4-world-unit size before camera scale. Enlarged views are supplemental only. Generated art is exploratory reference; a miniature render is not proof that it contains accepted native pixel clusters.

## Exploration coverage

Each subject needs four directional columns (right, left, front, back) and consistent rows: unequipped idle; unequipped movement; representative composed Equipment; alternate weapon-pose/mount study. Keep body design identical. Show a separate irregular stepped contact shadow appropriate to the direction, never a baked circular actor shadow. Use canonical Equipment and weapon sources for composition; any generated schematic equipment is labelled schematic, not approved tier art.

Three weapon families must be compared using existing held art. Current `HeldWeaponView` owns one node showing the latest actual firing weapon for 110 ms, updates at player root, rotates to actual shot angle, and flips Y for leftward shots. Preserve this as the default semantic policy unless visual evidence justifies a different presentation-only rule; never add gameplay 'active weapon' state. Multiple shots in one tick need a documented stable presentation tie-break derived from existing fire order, not new randomness.

## Provisional directional logic to review, not implement

Candidate body facing follows last meaningful movement vector when moving and holds previous direction at neutral; stationary firing-facing is a comparison option, not a chosen behavior. Current production only updates body facing on nonzero horizontal movement and holds that side on vertical travel. Do not let rapid rack fire whip the actor among targets. Weapon angle is the authoritative target-central aim (not each pellet's spread angle). Existing same-tick presentation tie is last successfully fired entry in equipped-array order; preserve it unless an explicitly reviewed presentation-only change is chosen. If using directional quantization, compare fixed sectors plus small angular hysteresis; do not freeze thresholds before prototypes.

Equipment must identify the same instance/tier on every view. Front/back occlusion may hide part of an item without silently unequipping it. A glove pair must be one resolved Equipment identity even if it needs two nodes; node budgets cannot incorrectly promise four total nodes when seven socket targets are chosen. Portrait/gameplay may use different transforms, not different gear truth.

## Output gate

Deliver the two-subject comparison, real-scale rendered review, explicit art limitations and a short 2 vs 4 vs 8 recommendation. Ask Jonathan to choose. Only after approval may the roster production packet and socket/renderer schemas be finalized. #196/#194/#200 stay independent and can proceed.
