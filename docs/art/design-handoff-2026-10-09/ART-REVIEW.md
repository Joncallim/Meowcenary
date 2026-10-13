# Independent art review and delivery boundary

## Verdict

**Keep #230 on the visual design hold.** Four-direction presentation is the leading design candidate, not an approved production choice. No eight-character production, socket schema or renderer contract is authorized by this package. Generated source studies and a native-size simulation sheet are provided as real exploratory artwork, not accepted native sprite assets.

## Sources and generation

Canonical source: `docs/art/alpha-3-art-production-briefs.md`, current main `a100e053ce4e2bc48bc4b8844e7da5010d562096`. All new raster exploration used built-in OpenAI image generation; no paid external generator. Existing canonical Equipment/held-weapon/portrait/ability atlases were read from pinned main and reused only as references or layout art. `ART-MANIFEST.json` records source dimensions, alpha extrema and SHA-256.

- `art/tabby-direction-study-v1.png`: same canonical Tabby, side/front/back, idle and two stride poses. Useful orientation reference; unapproved.
- `art/hound-direction-study-v2.png`: same quadruped Hound in side/front/back and stride poses. Second version requested transparency cleanup; remains an oversized exploratory source with soft alpha, not a native export.
- `art/composition-study-v2.png`: equipped Tabby/Hound with family-different weapon poses and footprint studies. Schematic costume/mount reference only; not a controlled direction comparison or canonical wearable export.
- `art/pickup-family-exploration.png`: XP, Scrap and salvage-cache family, four subtle variations per row. Direction reference for deliberate native16/20 reconstruction, not a runtime sheet.
- `review/direction-review.png`: rendered report with small-size simulations and explicit limitations. This is not in-game evidence.
- `review/ability-layout.png`: authored vector layout specification using current committed Ember portrait and Heat Vent icon. It is not a browser screenshot or implemented UI.

Earlier Hound/composition versions are rejected/superseded and excluded from the implementation intake. The two old recoloured-cat explorations mentioned by Jonathan are not canonical and were not used.

## Adversarial findings that block sprite production

1. Tabby's guard remains on the same screen side in front and back, incorrectly changing physical shoulder. The ear notch is not consistently readable. Lock physical-side identity first. A mirrored two-direction model must explicitly accept that asymmetry trade-off rather than pretending it preserves anatomy.
2. Hound's bare front/back studies show a real orientation benefit. Equipped rear remains three-quarter, not cardinal back, and the side pistol mount/muzzle is ambiguous. The geared study loses the restrained lime timing cue among added cyan modules. Correct these before using it as construction authority.
3. Direction and weapon family vary simultaneously in composition v2. A valid A/B must hold subject, body scale, floor, Equipment instance/tier, gun family/tier, movement vector and aim vector constant while changing only directional model. Show left/up/down/off-axis shots and equipped movement. Current art does not finish that proof.
4. Existing `equipment-wearable:*` aliases inventory `equipment-icon:*` frames, including paired gloves/boots. These are not ready-made individual limb or rear-view overlays. Future directional adaptation must preserve #198 identity and have its own honest source/export contract; no full-outfit explosion.
5. Generated masters are 1447×1087 / 1536×1024-class illustrations with partial alpha edges, not native 48-pixel authored clusters. Small report views are scale simulations only. Cropping/bottom alignment in the report is not a stable root/foot-anchor test and must not be used to certify animation. No source `.pxo` or export metadata was fabricated.
6. Composition shadows are baked into the illustrative study. They are useful footprint ideas only. Final separate stepped contact-shadow atlas and idle/run/airborne/defeat behavior remain unapproved and unproduced. Current runtime circle is known existing behavior, not final art.
7. Hound's front view becomes narrow at current world-scale simulation. Deliberate native-pixel authoring must preserve enough body/face width without breaking anatomy; enlarging only selected directions would create popping. Review this before recommending four-direction production.

## Native pickup gate

The generated family has distinct tall XP / low irregular Scrap / broad rectangular cache silhouettes and restrained palette. Independent review still finds the XP too crystalline for the requested manufactured capsule, and the cache latch centered instead of the specified off-center latch. Correct those in native authoring; see GENERATION-PROVENANCE.md for prompts and references. It still contains oversized shading, partial-alpha edges and unverified cell/anchor topology. Accept it only as a semantic/material direction. Native 16×16 / 20×20 sources, exact 4-frame export, stable centers, real floor tests and pool integration remain implementation/art gates. Weapon art is existing canonical identity; do not redraw it from the illustrated composition.

## Review process evidence

A separate reviewer inspected the source images, canonical briefs and runtime boundaries, and challenged all four architecture packets. Corrected issues include selected intro portrait resource closure, true damage-result receipts instead of inferred hits, missing arena safe-drop/spawn/hazard/performance consumers, explicit solver budgets/geometry, distinction between player Replay and failed-load Retry, pool rollback on missing art, exact chest-kind vocabulary, and honest total node budgets. Source and visual findings are recorded separately from unrun runtime tests.

Figma inspection was attempted and cancelled by the user; no alternate Figma write route was used. Local headless-browser screenshot rendering was unavailable due OS socket restrictions. Static review sheets were rendered from authored SVG layouts; no live-game or physical-device result is claimed.

## What can proceed

#196 and #194 architecture can be implemented independently after packet review. #200 pooling/resolver work can proceed using current bindings while native pickup art is authored and accepted as a separate cutover. #199/#230 renderer/art production stays blocked until the controlled visual comparison and owner decision are complete. The final delivery must not tell an implementation agent to guess the remaining direction/art decisions.
