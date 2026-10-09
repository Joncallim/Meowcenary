# #193 / #197 — fix composition and selection-context loss

Current main/live baseline `a100e053ce4e2bc48bc4b8844e7da5010d562096`, inspected 9 October 2026. This packet is actionable remediation, not permission to replace existing mechanics. See the accompanying live/source reports for exact evidence and limits.

## Evidence boundary

Live cloud-browser capture was 1180×757 DPR1, fresh Scrap Tabby profile. Large weapon/equipment art and functional candidate/detail routes are present. Reference Figma desktop is 1440×900 and some references use fitted/owned states not available in the fresh profile. Do not call those unmatched captures pixel-perfect diffs. Physical touch/controller and exact-size phone runs are unverified. Ordinary Equipment selection/context loss was reproduced; merge focus loss is source-confirmed, not claimed as live merge reproduction.

## Required fixes

The owner's further density objection is now concretely designed in [COMPACT-GRID-SPEC.md](COMPACT-GRID-SPEC.md) and its three rendered examples. The default is a compact responsive comparison grid, not a full-width giant card for every candidate. Keep full inspection separate and selected context stable; use the spec's explicit column/media/target budgets, safe-area handling, domain-derived benefit and no-scroll-jump tests.

### Gunsmith Build composition

Compact the family selector, Build/Workshop/Parts navigation and scope/status area so the meaningful assembled weapon, selected slot and candidate/consequence area coexist wherever the approved layout intends. Keep active-family and “activates when acquired” semantics. Do not remove mechanical states merely because a focused Figma fixture omits them. Preserve large correctly framed art without letting one image push the entire engineering context below the fold.

### Equipment scan and inspection

Restore explicit card grouping and readable empty/blueprint presentation. A ghost must not imply owned/equipped gear. Put slot, name, tier, Set name, effect scope, cost and state near their art. Name Set filters visibly; separate “available to fabricate” from “affordable now.” Replace roughly 300px full-width candidate rows with compact grouped choices, while retaining large selected-item inspection in a deliberate secondary area.

Selecting an owned candidate or blueprint must preserve list context. Do not append selected detail after the entire candidate catalog and alignTop-scroll the whole page there. Use a persistent detail pane on wide layouts and a local inspection subview/sheet on compact layouts, with an explicit “Back to candidates” command. Preserve slot, Set filter, candidate ID, focus key and list scroll anchor. The existing outer Back-to-Loadout remains a distinct navigation action. Never fake equip/save to populate preview.

### Merge workflow and focus continuity

Use one bounded workspace for recipe → input A → legal input B → review → result. Compact input selectors replace the current ≥272+12px cards per choice (50 choices imply ≥14,200px). Keep selected inputs, output and consumption/fitting consequences visible together; commit must not receive focus below an unseen explanation.

Every transition must name a semantic successor/return focus key and reading anchor. Required mapping:

| Transition | Focus/reading destination |
|---|---|
| Recipe selected → choose A | merge workspace heading, then first legal A choice; retain recipe return anchor |
| A selected → choose B | selected-A summary + first legal B choice; retain A list anchor |
| B selected → review | review heading/input-output summary, NOT direct jump to Confirm before explanation |
| Cancel review | prior B choice/list anchor with A preserved |
| Back from B | A list with prior A choice visible |
| Back from A | originating recipe with its prior anchor |
| Successful merge | result/output summary and next valid action in the same workspace |
| Save failure | same review and selected inputs, visible error, no success styling or duplicate mutation |

Pointer fixed Back, Escape and controller Back must use the same semantic ladder and restored context. Missing clicked keys must not fall back to the top family selector or a stale numeric index. Restore the anchor after layout/focus reconciliation; an ensure-visible call must not silently undo it. Reuse the existing explicit Build-preview return-key pattern.

## Exact owning files

`src/ui/menuSurfaces/gunsmithSurface.ts`, `src/ui/menuSurfaces/equipmentSurface.ts`, `src/ui/menuSurfaces/loadoutChrome.ts`, `src/scenes/MenuScene.ts`, `src/ui/scrollableFocus.ts`, `src/ui/gunsmithController.ts`, `src/ui/menus.ts`. Preserve domain merge legality, ownership, atomic save, duplicate-confirm and stale-resource guards. This is layout/navigation work, not a merge/equipment rules rewrite.

## Regression acceptance

Record semantic focused key, selected/candidate identity and scroll offset/viewport anchor before and after recipe/A/B/review/Cancel/Back/success/save-failure. Assert no top-family fallback when the previous button disappears. Test 0/1/50 legal inputs, selected item disappearing after successful mutation, slot/Set changes, partially visible card pointer click, controller ensure-visible, resize and full/local rebuild paths.

Equipment: from a scrolled candidate list, inspect an owned item and a blueprint, return locally, and verify the same list context. Outer Back still leaves for Loadout. Candidate inspection must not write Save. Label affordability truthfully at 0 Scrap and sufficient Scrap.

Capture matched viewport/state Figma comparisons at 390×844, 360×640, supported landscape, 1280×720 and reference 1440×900 with equivalent fitted/owned/candidate states. Confirm pointer/touch/controller parity and reading order. Do not refresh golden screenshots to conceal context jumps. Full existing domain/save/input/resource tests remain required.
