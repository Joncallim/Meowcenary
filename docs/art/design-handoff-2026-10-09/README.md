# Meowcenary — single implementation intake, 9 October 2026

Baseline reverified at publication preparation: main `a100e053ce4e2bc48bc4b8844e7da5010d562096`. This additive package changes documentation/art references only. No runtime implementation, merge, deployment or new implementation agent was started.

## Read this first

**Implement bounded packets, not one giant rewrite.** Start from current main and recheck active work before editing. Existing gameplay/save/resource owners remain authoritative. Do not treat candidate art as finished native exports or automated checks as human/device acceptance.

| Packet | Current intake status | Dependency |
|---|---|---|
| [#196 ability comprehension](196-ABILITY-COMPREHENSION.md) | Reviewed architecture + layout; ready for bounded implementation | Preserve #229; add selected portrait closure and truthful owner receipts |
| [#194 seeded arena composition](194-SEEDED-ARENA.md) | Reviewed bounded solver/launch design; ready for pure implementation | #195 framing already landed; preserve it |
| [#200 physical pickups](200-PHYSICAL-PICKUPS.md) | Resolver/pool design ready; native artwork cutover remains gated | Existing weapon art reused; generated pickup family is direction reference only |
| [#193/#197 context-preserving layout](193-197-CONTEXT-PRESERVING-LAYOUT.md) | Specific fix requirements and live/source evidence | Preserve domain/save semantics and existing large-art resources |
| [#199/#230 actor composition](199-230-CONDITIONAL-COMPOSITION.md) | **HOLD: owner directional/style/composition approval required** | No socket/renderer freeze or eight-character mass production |

## One clear implementation request

Read this index and only the bounded packet you are implementing. Preserve the baseline fixes and exact IDs. Implement #196 as pure explanation/receipts → intro/input gate → HUD/FX; implement #194 as pure layout/validator → one launch/resource boundary → consumer integration; implement #200 as pure resolver → one pooled view using current validated art. Its separate native-art cutover requires accepted pixels/source/export evidence supplied by the art owner; do not ask the implementation agent to invent missing art. #193/#197 fixes must preserve semantic focus and list context. Use separate reviewable changes. **Do not implement #199/#230 until the recorded visual hold is explicitly cleared by Jonathan.** Report passed/failed/unrun checks honestly; do not merge or deploy from this package alone.

## Visual deliverables

- [Ability brief/state layout](review/ability-layout.png): uses existing committed portrait/icon art; authored layout, not a runtime screenshot.
- [Directional review at small sizes](review/direction-review.png): canonical Tabby/Hound comparison, limitations shown on-image; not an approval-ready production sheet.
- [Pickup family exploration](art/pickup-family-exploration.png): real generated artwork reference; native16/20 authoring/export still required.
- [Art review and rejected assumptions](ART-REVIEW.md), [direction exploration brief](DIRECTION-EXPLORATION.md), [asset manifest](ART-MANIFEST.json).

The #230 exploration has useful front/back evidence but fails anatomical-side consistency, controlled gear/aim comparison and native-pixel/anchor proof. These are explicit design work, not decisions for the implementation agent to guess. Four directions are the leading candidate; eight directions are not justified yet. No production handoff is frozen for the roster.

## Existing work reconciled

- #198: Jonathan's 9 October “ok - passed” is recorded as narrow owner visual acceptance in [comment 6071701006](https://github.com/Joncallim/Meowcenary/issues/198#issuecomment-6071701006).
- #209: “very responsive and good” is recorded as narrow responsiveness evidence in [comment 6071702839](https://github.com/Joncallim/Meowcenary/issues/209#issuecomment-6071702839), not untested lifecycle acceptance.
- #174 works in the owner's current check, but the full Mercenary redesign remains requested under #230. #175 includes authored shadows; its enemy/boss umbrella remains separate.
- #208: all 18 upgrade illustrations are already integrated by merged #225. [Independent parity audit](audit/upgrade208-parity.md) verifies 18/18 native sources/pixels/builders/metadata/bindings on current main. [Production closeout](https://github.com/Joncallim/Meowcenary/issues/224#issuecomment-5994987524) is historical acceptance evidence. Do not redraw, reimport or merge stale #208 to obtain shipped art. Original Library master provenance and broader human/device gates remain distinct.
- #167 is substantially delivered, but cannot be closed by this package: #230 direction/roster/shadows, #200 native pickup cutover, #196 comprehension and remaining whole-game human acceptance still have owners. Do not count #208 as missing integration.

## Audit evidence

[Live/Figma comparison](audit/live-layout-audit.md), [selection/scroll source audit](audit/selection-scroll-source-audit.md), and [live interaction follow-up](audit/interaction-followup.md) distinguish observed behavior from source-inferred merge consequences. The requested cloud browser was used; exact viewport emulation was unavailable and no restriction bypass was attempted. The previously authorized baseline comparison is included; follow-up screenshot bytes are withheld pending separate sharing approval (delivery-only gate).

## Review and completion boundary

All four original packets received independent adversarial source/art review. Corrections included portrait loading, damage truth, arena consumer completeness, finite conservative clearance, replay-vs-load-retry semantics, pool failure rollback and honest node budgets. No runtime tests were run for this docs/art package. The rendered layout was visually inspected. Sprite production remains blocked by documented art defects and owner choice; this package is intentionally a draft until those parts are resolved.
