# Gunsmith and Equipment interaction audit, 9 October 2026

## Runtime observations
Actual cloud browser, 1180×757 DPR1. Fresh profile with 0 Scrap and no owned gear/Parts; existing active SMG from earlier audit. No debug or save injection. Source mechanism is separately documented in selection-scroll-source-audit.md.

1. Equipment candidate selection: open Loadout→Equipment, scroll once to the Scavenger Helmet candidate at y286. Click its name. Immediate capture briefly retains list; settled view relocates to the selected-detail section and aligns its400px art near the viewport top. The previous candidate/list context vanishes. Footer changes from Fabricate Selected to Fabricate for100Scrap; header changes to Scavenger Set. This reproduces disruptive forced scroll/navigation, specifically a jump DOWN to detail, not an observed literal offset-zero. See followup/01-equipment-before-select.jpg and03-equipment-settled-after-select.jpg. Intermediate02 is not settled-state evidence.
2. Equipment Back: clicking fixed top-right Back from selected detail exits entirely to Loadout; it does not return to the selected candidate/list. See04-equipment-back.jpg. This confirms a missing local return affordance, distinct from scroll preservation.
3. Workshop entry: Build→Workshop shows Merge/Infuse and “Two matching parts / one higher tier”; no legal recipes in fresh inventory. There is no missing-input checklist or direct acquisition route. See05-workshop-top.jpg. Recipe/A/B/confirmation cannot be exercised in this state.
4. Workshop Back: fixed Back leaves Workshop for Build, not Loadout. Another Back then exits to Loadout. See06-workshop-back-to-build.jpg. Its destination differs from Equipment’s Back despite both presenting generic Back.

## Source-backed findings, not claimed as live merge reproduction
- Recipe→A, A→B, Cancel and successful Merge do not supply successor semantic focus keys. Their prior clicked keys disappear, triggering the current-main fallback to the active-family selector and scroll-ensure-visible toward the top.
- Fixed Back within a pending merge full-rebuilds while holding a non-scrolling Back key; no content anchor restores its reading position.
- Equipment candidate selection explicitly alignTop-scrolls to detail appended after all candidates/blueprints. At desktop eight blueprint rows alone take≥2368px before detail.
- Merge input rows are≥272px+12gap;50choices mean≥14,200px before header/detail. This is source-derived scale, not a measured50-item live profile.
- B selection focuses the final confirmation button after large input/output cards and explanation. The focus destination can skip the context that explains the decision.
- Current tests verify safety/ownership/cancel mechanics, not transition reading position. Normal slot selection has explicit surviving keys, so “every click resets” would overstate evidence.

## Bounded redesign/acceptance handoff
P1: Make every recipe/A/B/Cancel/Back/success transition name a predictable semantic successor and preserve a meaningful scroll anchor. Test both fixed pointer Back and logical Escape/controller Back.
P1: Keep selected input A, legal B choices and output/consequences together in a bounded work area; compact choice rows or a grid rather than huge serialized art cards. Do not weaken legal eligibility or atomic merge/save checks.
P1: Equipment needs a clear local Back-to-candidates/selection-context affordance; selecting an item should not silently teleport through the full catalogue. Retain stable selected ID, scroll and focus.
P1: Present Merge as choose two matching physical instances→review consumed/fitted-location effects→confirm→output stored, with distinct instructional states. Empty inventory should explain what is missing and where to get it.
P2: Verify long lists, controller focus, touch/pointer and mixed input, selection/resource repaint, cancel and failed save using exact before/after screenshots and offsets. Existing green tests are not proof of navigational usability.

## Required regression fixture
Configured active build; at least two same-definition/same-tier legal merge inputs, one fitted and one stored; enough extra owned Parts to force scrolling. Record recipe→A, A→B, B→review, review Cancel→B, Back B→A, Back A→recipe, and success→stored output. Assert selected IDs, semantic focus owner, viewport anchor and explicit consumed/emptied-slot consequences at every step. Then repeat with save failure and stale input. No production debug injection is authorized or needed; use the normal controlled test fixture in an engineering test environment.

## Ordinary-inventory attempt and boundary
One ordinary First Scavenge run reached a natural level-up. Selected Hot Barrel through the displayed card. It ended at0:23 with10kills,8banked run Scrap and33total Scrap (the result screen also displayed First Blood). No first-clear Part reward and no legal merge pair was obtained. Stopped rather than grind or inject inventory. Runtime recipe/input/confirmation replacement and consumption transitions remain blocked by this inventory. See07-natural-upgrade.jpg and08-contract-result.jpg. The natural level-up also provides fresh visual confirmation of several integrated #208 illustrations.

Live build recheck remains a100e053ce4e2bc48bc4b8844e7da5010d562096;1180×757,DPR1.


## Screenshot delivery boundary
Only the previously authorized baseline comparison image is included in this draft. Follow-up interaction screenshots/contact sheet are withheld pending separate sharing approval; the text findings and source links remain available. This is a delivery-only gate, not a design-readiness gate.
