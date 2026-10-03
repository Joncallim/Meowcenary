# Static art review

Reviewed 2026-09-30. All 18 baseline upgrade IDs have individual generated illustrations and corresponding 48×48 candidates. The original eight character ability icons remain separate.

## Completed checks

- 18/18 originals and 18/18 48×48 exports exist, with distinct SHA-256 hashes
- Every original contains genuine transparency (alpha minimum 0, maximum 255)
- Every normalized candidate retains a minimum three-pixel transparent margin and the full nontransparent source bounding box
- Inspected all candidates at native 36-pixel display size on both dark and light backgrounds, plus 2× source size
- No text, tile backgrounds, logos, or sprite-sheet neighbors appear in these icons
- Category and family overlap is differentiated by silhouette: magnet versus scrap pile; heavy bullet versus split projectile; aimed pistol versus piercing pistol; SMG gauge versus spray; shell/pellets versus breaching muzzle
- The data snapshot and subject briefs are matched one-to-one by stable ID

## Findings and integration cautions

1. Small material scratches naturally disappear at 36 pixels. The broad object silhouettes remain the intended recognition cue. Do not add further fine decoration during import.
2. Reinforced Coat and the weapon-family combinations are visually denser than the simplest icons. Verify their real upgrade-card captures before accepting the cutover; preserve the full icon footprint rather than adding another inset border.
3. Colored trails and bursts are illustrative cues. They do not create elemental damage, critical hits, or additional mechanics. Existing readable titles and trade-off descriptions remain essential.
4. The final Shotgun Breacher was generated separately after the first batch yielded only 17 saved outputs. It was included in the same size, alpha, margin, uniqueness and visual checks.
5. BOX reduction and nearest-neighbour 36-pixel display are documented review transformations. The actual engine's sampling and real Pixelorama export must be checked independently.

## Not yet verified

Canonical Pixelorama project creation; exported metadata/source parity; registry validation on the final integration branch; real browser/phone rendering; input/focus/reroll regression tests; user visual acceptance. This package is ready for implementation review, not a completed runtime cutover.
