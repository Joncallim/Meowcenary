# Meowcenary live Loadout audit
Captured 9 October 2026 in the requested cloud browser. Audit only; no implementation or deployment.

## Verdict
The large-art implementation is present. The remaining work is composition and state-by-state visual acceptance, not re-creating the Gunsmith or Equipment mechanics. PR #226 explicitly left #193/#197 open for owner visual approval, first-time-player comprehension, and physical input evidence.

Live HTML meta[name="meowcenary-build"] is a100e053ce4e2bc48bc4b8844e7da5010d562096, matching current main. URL: https://meowcenary.jo-nas.com/

## Evidence boundary
- Fresh browser profile, Scrap Tabby, 0 Scrap, no owned Equipment or Parts.
- Actual capture viewport 1180×757, DPR 1; canvas matches it exactly.
- Selected SMG through normal UI to inspect a created active build. No spending, reset, fabrication, equip, upgrade, debug state injection, or source modification.
- Figma desktop references are 1440×900, phone 390×844. These are deliberately labelled unmatched viewport/state comparisons, not pixel diffs.
- Browser API exposes no viewport setter. The native browser reports “Your organization has blocked the use of DevTools on this page.” No bypass attempted. Exact-size phone/tablet and richer-owned-state comparisons remain unverified.
- Current Figma screenshots were obtained directly. Original approved fixtures are illustrative: the workbench is SMG with compact receiver T1 + long barrel T1; Equipment fixture has 2/4 equipped. Fresh runtime has no fitted Parts or owned gear, so their state differences are not bugs.
- Canvas accessibility tree exposes the game canvas/image but not individual game controls. Screen-reader support cannot be claimed. Physical touch/controller and first-time-player review were not performed.

## Sources
- [Gunsmith requirements and comments](https://github.com/Joncallim/Meowcenary/issues/193)
- [Equipment requirements and comments](https://github.com/Joncallim/Meowcenary/issues/197)
- [Approved larger-art implementation brief](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=146-102)
- [Gunsmith desktop](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=130-94)
- [Gunsmith phone](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=130-76)
- [Equipment desktop](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=130-22)
- [Equipment phone](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=129-10)
- [Selected Equipment phone](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=129-29)
- [Shipped #226 boundary](https://github.com/Joncallim/Meowcenary/issues/197#issuecomment-5994037963)

## Numbered flow and health
1. Home → Loadout. Healthy navigation; sparse overview. Screenshots live/01-home.jpg and live/02-loadout.jpg. Small mercenary and stock weapon at left, large empty vertical spacing, four empty slots. The view is functional, but provides little visual readiness information at this fresh state.
2. Loadout → Gunsmith, fresh state. Functional, visually unbalanced. live/03-gunsmith.jpg. The active family selector, CREATE states, Build/Workshop/Parts tabs and status consume the top ~260px. Weapon starts ~y323, at ~700px wide, but is clipped by the scroll viewport ending ~y682. It is not absent; lower content is scrollable.
3. Create active SMG, then scroll to engineering slots. Healthy mechanics visible, hierarchy gap. live/04-gunsmith-smg.jpg and live/05-gunsmith-lower.jpg. The active-family wording and “Activates when acquired” clarify scope. Slots and relevant selected-slot empty tray do exist, but require scrolling away from the whole weapon. Receiver/Barrel/Optic/Stock/Trigger/Magazine/Traits are visible lower down. No compatible stored Parts is truthful for this profile.
4. Back → Equipment overview. Functional, discovery/contrast gap. live/06-equipment.jpg. Four large ghosted preview silhouettes are present, each marked Empty. Visible objects are roughly 190px high at this viewport; do not compare this numerically as failure against the 264px desktop reference at 1440px. Set symbols below are tiny and have no visible names. The candidate heading sits near the bottom, with the sticky Fabricate Selected action present before a candidate is onscreen.
5. Scroll Equipment candidates. Functional, scan-density gap. live/07-equipment-candidates.jpg. Rows are ~300px tall and full width, with art at the far left, name/cost at x304 and small Set symbol near x1140. This produces a very long vertical list and weak grouping, rather than the reference's framed, labelled cards. FABRICABLE describes acquisition route but with 0 Scrap can read as currently affordable; keep affordability/state distinct.
6. Select Scavenger Helmet and inspect detail without spending. Large art and scope confirmed. live/09-equipment-detail.jpg. Visible helmet ~380–400px; “+12 Pickup Radius [Mercenary]”, stored-T1 consequence, no active Set, and 100-Scrap action remain visible. This proves larger selected art and domain-derived explanation are present. live/08-equipment-selected.jpg is an intermediate unchanged candidate view; exclude it from any before/after claim. Equipped/upgrade/replacement states cannot be assessed from this profile.

## Gap manifest for implementation review
### G193-01: Recompose the top-level workbench, not the art
Observed: top-level controls push the meaningful weapon/slot editing area below one visible screen. Approved brief asks one conceptual Build screen and warns against art displacing action/consequences. Reference 130:94 places active label at y82, workbench at y112–592 and selected slot at y604–876; reference 130:76 places workbench at y86–358 and selected slot at y370–744.
Action: keep authoritative active-family semantics and tabs, but compact their vertical footprint and reserve a deliberate workbench + slot/candidate region. Do not remove omitted mechanical states merely because the focused Figma fixture omits them.
Acceptance: exact-size captures with the same family, fitted parts, candidate and scroll position; whole weapon and selected-slot context clear together wherever intended, scroll/focus region correctly reachable at compact sizes.

### G197-01: Restore visible card grouping and readable empty/blueprint treatment
Observed: overview uses dark ghost silhouettes directly on near-black and widely separated text. Approved desktop is explicit framed cards with art, slot/name, state/tier and concise effect grouped.
Action: reconcile current empty and blueprint treatment with approved grouping, while preserving the fact that no item is owned/equipped. Do not copy the fixture's 2/4 state into runtime.
Acceptance: slot state and selected card readable without colour alone; meaningful contrast at actual scale; no claim of owned gear from ghost art.

### G197-02: Reduce full-width candidate-row dead space
Observed: very tall rows, small labels displaced far from right-hand Set symbol and a long scroll before selected detail.
Action: recompose art, name/tier/state, scope/effect, cost and Set into compact visual groups; retain large visible object, stable candidate identity, controller selection, shared scroll/focus.
Acceptance: same inventory size/source in all captures; selected state visually explicit; names and costs never masked; selected detail and commit reachable without losing context.

### G197-03: Name Set filters and clarify affordability
Observed: Browse Sets presents small bare symbols; Fabricate Selected is in the footer before the candidate is visible; FABRICABLE shown with 0 Scrap.
Action: retain semantic icon art but show names/selected filter state and separate “can fabricate this type” from “can afford now.” Verify current controller-disabled/action feedback before changing semantics.
Acceptance: a first-time player can identify the Set and intended item/cost; disabled/insufficient-funds state is explicit; no spending or double-commit regressions.

### A11Y-01: Validate input/accessibility rather than infer it
Observed: browser AX only sees canvas/image; on-screen tiny labels and colour/brightness treatment create readability risk.
Acceptance: real keyboard focus route, controller route, touch targets, mixed-input reconnect, screen-reader assessment if supported. Screenshots do not prove accessibility compliance.

## Required remaining capture matrix
360×640, 390×844, 844×390, 1114×720, 1280×720, 1920×1080; include 1440×900 for direct desktop fixture comparison. Match game state to Figma rather than compare a new account to an owned/engineered fixture. Capture Build, selected-slot candidate, before/after, replace/move, Parts, Workshop merge/infuse consequences; Equipment empty/owned/stored/equipped/blueprint, Set selection, inspection, upgrade preview/cancel/success, locked tier, insufficient funds and failed save. Preserve PR #226 functionality and all current atomic/controller/resource boundaries. No new art request is justified by this audit.

## #208 status
See upgrade208-parity.md for independent current-main checks. The 18-icon cutover is already integrated by #225 and owned by closed #224. Do not merge the stale docs-only PR as if runtime work is missing. Original high-resolution Library-master provenance and broad human/device approval are separate remaining evidence boundaries.


## Live captures

### 01-home
Capture reference: 01-home. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

### 02-loadout
Capture reference: 02-loadout. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

### 03-gunsmith
Capture reference: 03-gunsmith. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

### 04-gunsmith-smg
Capture reference: 04-gunsmith-smg. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

### 05-gunsmith-lower
Capture reference: 05-gunsmith-lower. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

### 06-equipment
Capture reference: 06-equipment. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

### 07-equipment-candidates
Capture reference: 07-equipment-candidates. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

### 09-equipment-detail
Capture reference: 09-equipment-detail. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

## Figma references (different viewport/state)

Capture reference: equipment-desktop. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

Capture reference: equipment-selected-phone. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

Capture reference: gunsmith-desktop. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

Capture reference: gunsmith-phone. Image bytes are not included in this draft; see the approved baseline contact sheet and source Figma links.

## Current-source confirmation
The fetched source is pinned to live/current main a100e053. `src/ui/menuSurfaces/loadoutChrome.ts` already uses Equipment media extents 128/144/264 and inspection extents 264/400, with four columns when content width is at least 1080. The slot's actual media is clamped to slotWidth−24, and empty placeholders use the older panel-art path with dimmed=true whereas owned gear uses addLoadoutArt. This is a useful specific distinction for reviewing empty-state optical scale; it is not proof that owned-art framing is broken. The shared `loadoutArtFraming.ts` already resolves visible-bound union and a common transform for co-registered layers, plus transparent crop safety. Preserve those contracts. `loadoutSurface.ts` specifies the sparse overview blocks and a later readiness/effects/engineered-build section, so below-fold content is present rather than missing. Copies are in source/.


## Screenshot delivery boundary
Only the previously authorized baseline comparison image is included in this draft. Follow-up interaction screenshots/contact sheet are withheld pending separate sharing approval; the text findings and source links remain available. This is a delivery-only gate, not a design-readiness gate.
