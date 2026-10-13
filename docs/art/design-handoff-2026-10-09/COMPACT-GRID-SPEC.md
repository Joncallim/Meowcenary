# Compact comparison grids — #193 / #197 revision

9 October 2026. Responds to the owner's explicit objection that one huge card at a time wastes the available screen. This supersedes the previous default full-width candidate-card layout; it does not change Equipment or Parts rules.

## Visual proof

- `review/equipment-comparison-grid-wide.png`: 1180×757, three compact candidate columns and a stable right inspector.
- `review/equipment-comparison-grid-phone.png`: 390×844, two compact columns with a fixed selected-summary/action bar. Details is explicit local navigation, not automatic scroll relocation.
- `review/gunsmith-merge-comparison-grid.png`: 1180×757, six bounded instance cards, persistent A/B/output tray and nearby consequence/review area.

These are authored design layouts using real committed art, not runtime screenshots. Equipment images are clearly labelled independent Commando T1–T4 **tier specimens**, not four simultaneous owned copies. Current Equipment ownership is by definition; the production list uses real legal candidate IDs, not invented tier alternatives. The art-only fixture exists because the other large atlas was unavailable through the approved read path. Do not recreate a Commando-only catalog in code.

The layout source is `review/build-compact-grids.py`. It verifies the pinned Git blob hashes in `review/compact-grid-source-refs.json` before reading existing repository atlas PNG/JSON files, then writes editable SVG layouts. Run it from a checkout with Pillow installed; render the SVGs with Inkscape. It never writes runtime assets or changes their pixels. The review PNGs are the delivered view; generated SVG intermediates need not be committed.

The Gunsmith example is a mechanically legal synthetic fixture: six distinct stored `part:receiver-compact` T1 instances, no infused traits. A is #R101, B is #R104, output is T2 stored. It is not the user's current inventory. Selected A is a pinned, disabled context card, not a B candidate. Equipment never borrows this two-input merge rule.

## Responsive geometry

| Usable viewport | Default comparison region | Art and card budget | Selected context |
|---|---|---|---|
| ≥1040 wide | 3 columns when each can be ≥216px; 12–16px gaps | Equipment about208px high; 96px art box; Parts about148–176px high with 96×60 art box | Persistent288–320px inspector; one action/consequence region |
| 600–1039 wide | 3 columns if ≥176px each, otherwise2; no narrow permanent inspector | 80–96px art; flexible card height for labels | Stable compact summary; explicit local detail sheet/subview |
| 360–599 portrait | 2 columns; at360 with16px outer/12px gap each is158px | 72px art; about184px card; name may wrap to2lines; text≥14px | Fixed≤116px summary/action bar; details is explicit |
| Height≤480 | Reduce header/summary footprint before shrinking type; keep2–3 readable columns | 64–80px art; aim160px card where labels fit | Local detail view returns to preserved grid context |

All action targets remain at least48px high. Do not clip long names, effects or localized text to preserve an arbitrary density number. Expand card rows as needed. At1180×757, a populated list should show six Equipment/Parts candidates in two rows where content fits; at390×844 the two-column view should show at least four complete ordinary cards without opening details. Sparse inventories need not fabricate filler cards.

The phone exposes all four slot tabs (Helmet/Armour/Gloves/Boots) as real48px targets; the selected Helmet tab is not an inert label. A dedicated header Back-to-Loadout is distinct from local detail Back. The fixed mobile summary includes the device safe-area inset; the rendered example reserves34px but implementation reads the actual supported inset. Compute the grid viewport to end at least16px above the summary, or add bottom content/scroll padding equal to summary content height + safe inset +16px when using an overlay. Do not count the inset twice. Focus reveal and the last card must remain wholly above the summary/actions after scroll, resize and orientation changes.

Current production art framing remains authoritative: crop only proven transparent native padding, preserve aspect ratio/full meaningful pixels, use correct sampling and avoid unrequested resampling. Do not shrink art until it becomes an unreadable thumbnail merely to meet a count. Detailed inspection enlarges the selected item separately.

## Selection does not move the collection

Selecting a card updates candidate identity and the stationary inspector/summary. Preserve slot, Set filter, stable selected ID, semantic focus key and the grid's top-visible item plus intra-item offset. Do not append detail after all cards, call alignTop on a distant detail row, or reset to the family selector.

Desktop pointer selection does not force focus-driven scrolling if the clicked card is already within the viewport. Keyboard/controller navigation may reveal the next focus item with the minimum necessary movement; never recenter the whole collection on every command. Touch drag must not become a card activation on release. Keep selected, equipped and keyboard-focus states visually distinct: textual state label, selected accent, and cream focus outline.

At compact sizes, View details opens a local sheet/subview only when requested. Local Back/Close restores the exact candidate and grid anchor. Outer Back-to-Loadout remains distinct. On resize, retain semantic anchor and recompute its row position from current column count; raw pixel offset alone is insufficient.

## Merge stays a bounded workspace

The persistent tray shows A, B and derived output with their actual instance IDs/tier/location. Selecting A/B updates this tray without replacing a long full-screen list. Keep input/output consequences near Review/Confirm. Review begins at its heading, not a Confirm button below unseen text.

Production eligibility comes from `listWorkshopMergeFirstInputs`, `listWorkshopMergeSecondInputs` and `mergeParts`: same part definition, same tier, distinct instance IDs, below max tier, valid combined effective traits. Do not duplicate those rules in the view. The pinned A card cannot be selected as B. Fitted inputs display their real location; review explains consumed/fitted effects. Output is stored unless an existing separately authorized command fits it.

Show the actual benefit as well as consumption. In this stored Compact Receiver fixture, the definition's additive `attackSpeed` contribution is0.08 atT1 and0.16 atT2 via `scaleModifierByTier`/`resolveBuildModifiers`; the player-facing review says “Attack-speed bonus: +8% → +16%” beneath “Part contribution if fitted.” The engineering values remain additive fractions0.08→0.16 of the attack-speed factor; this is not a statement that final weapon DPS doubles. This is the part contribution **if fitted**, not an immediate16% increase to the current gun. No active build changes in this all-stored fixture. Traits remain none→none; exactly#R101 and#R104 are consumed and oneT2 is stored. In production, use the current command's domain-derived before/after, real fitted-location consequences, trait union and any actual resource cost. Do not hard-code the fixture or invent a Scrap charge.

Cancel from review returns to B with A and list anchor intact; Back from B returns to A; Back from A returns to recipe; success focuses the output/result in the same workspace. Revalidate and atomically save on Confirm. Save failure keeps the same review/inputs with a visible error; no false success or second merge.

## Empty, error, loading and disabled states

- Empty owned Equipment: show truthful empty-slot state plus available blueprints; no fake owned preview. Fabrication route and affordability are separate; disabled action states show shortfall/reason.
- No legal merge A/B: keep the selected recipe/A visible and explain the missing matching instance or rule. Give Clear A / Back to recipes, not a dead-end blank pane or fabricated candidate.
- Required art loading: stable-size placeholder retains labels, selection and scroll. Late resource completions are scoped to the same candidate/scene generation; stale completion cannot replace the newer inspector.
- Art-load failure: keep context and a bounded Retry/Back path; do not silently substitute the wrong item image.
- Save failure: retain the pending preview/review and explain that no change was committed. Repeated input must not create duplicate mutations.
- Filter/slot change: preserve an anchor per scope if supported; otherwise focus the new scope heading/first legal candidate deliberately. A disappeared key must not fall through to a generic top control.

## Regression evidence

Use real legal fixtures with0,1,8 and50 candidates. Record focused key, selected IDs, top-visible item/intra-item offset and exact viewport before/after every selection, resource completion, filter, resize, details/Back, recipe/A/B/Cancel/Confirm/success/failure transition. Prove no offset-zero/family-selector fallback and no distant detail relocation. Test pointer, touch, keyboard, controller and mixed input. Capture ordinary and compact viewports with readable source art and actual labels; do not treat this static design proof as execution evidence.
