# Selection, scroll and merge-flow audit

Repository: Joncallim/Meowcenary. Main verified 9 October 2026 at commit a100e053ce4e2bc48bc4b8844e7da5010d562096. All source links below are pinned to that commit.

Evidence: read-only source audit. The findings below establish implementation behavior and likely visible consequences, not reproduction in the live browser. No app execution, save mutation, code change, test run or deployment was performed.

## Main findings

### 1. Merge has missing successor focus keys that send users back toward the family selector
High-confidence static defect for an existing selected build, when the normal local-update path is available.

- Opening a merge recipe calls redraw(beginGunMerge(...)) with no next focus key. The recipe button is removed and replaced by input choices.
- Choosing input A calls redraw(selectGunMergeInput(...)) with no next key. The clicked gunsmith-merge-input:A becomes gunsmith-merge-first:A; the remaining input choices exclude A.
- Cancelling the confirmation removes gunsmith-cancel without selecting a return key.
- Successful confirmation similarly removes gunsmith-confirm without choosing the recipe/output/next-step key.

The local-update path reads the clicked key, fails to find it in the replacement body, and falls back to gunsmith-family:<selected family>. It restores the old offset, then immediately syncs focus, which ensures that top family control is visible. The later anchor restoration runs only when the original key survived, so cannot undo the fallback jump.

Sources: [recipe/input/confirm/cancel callbacks](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/gunsmithSurface.ts#L421-L445), [local-update fallback and restoration](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/scenes/MenuScene.ts#L754-L829), [ensure-visible implementation](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/scrollableFocus.ts#L75-L103).

Do not generalize this to every selection: Gunsmith engineering-slot selection explicitly supplies its surviving slot key, and candidate preview explicitly targets gunsmith-commit. Equipment slot selection supplies its surviving slot key too. [Gunsmith slot/candidate paths](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/gunsmithSurface.ts#L239-L284), [Equipment slot path](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/loadoutChrome.ts#L128-L155).

### 2. Equipment selection is implemented as a long jump to detail at the end of the list
Owned candidate and blueprint clicks explicitly focus equipment-detail:<id> / equipment-blueprint-detail:<id> with alignTop=true. The selected detail is not a neighbouring panel: it is appended after every owned candidate and every blueprint for that slot. Thus the whole shared scroll surface moves, losing list context.

At widths >=600, each candidate/blueprint has a 264px art extent and a minimum 288px row, plus an 8px gap. Eight blueprints alone therefore occupy at least 2,368px before detail. Selected inspection then uses up to 400px art in an at-least-510px focusable card.

Sources: [candidate rows, explicit alignment and detailTop](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/equipmentSurface.ts#L103-L153), [size constants](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/loadoutChrome.ts#L107-L125).

This predicts a jump DOWN to the selected detail aligned near the viewport top, not necessarily an offset reset to page top. A literal Equipment offset-to-zero needs live reproduction and must not be stated as already proven.

Blueprint selection can also change the header's featured Set, invalidating the local-update invariant and requiring a full rebuild. The new selected-detail key still exists and is explicitly restored/aligned. Rebuild alone is not evidence of lost selection. [Invariant](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/equipmentSurface.ts#L53-L74).

### 3. Merge becomes a giant serial list; confirmation and explanation are separated by scroll
The actual merge state machine is recipe → choose A → choose legal B → review/confirm → output stored. Each A/B option is a full-width large-art card, not a compact input selector.

At wide layouts, media=240 and card height is at least272, plus12 gap. At390px media=144 and stacked height is also272, plus12 gap. Fifty inputs therefore mean at least14,200px of rows, before headers. Choosing A then repeats a selected-A card before all remaining B choices. This growth is directly implied by the layout, not measured in a live 50-item profile.

Confirmation presents three input/output cards (stacked below1000px or lane width700px), then fitting/consumption consequences, mechanical delta, and current/preview comparison, followed by Confirm and Cancel. B selection explicitly focuses the bottom gunsmith-confirm action, potentially moving the explanatory cards above the viewport. Pointer users who inspect the explanation must scroll back up; users following normal focus can land at commitment before seeing all context.

Sources: [breakpoint/media sizing](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/gunsmithSurface.ts#L89-L91), [card dimensions](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/gunsmithSurface.ts#L286-L299), [confirmation/selection layout](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/gunsmithSurface.ts#L370-L445).

### 4. Fixed Back and logical Back have different focus/scroll consequences
Pointer Back is fixed outside the scroll region. Within a pending merge it routes controller.back() through a FULL render; gunsmith-back survives semantically but has no scroll bounds to restore. A newly constructed scroll region starts at0 and finishScrollableRegion asks its initial item to be visible. This strongly predicts a return to top on pointer Back within these states.

Logical Escape/Back also full-renders, but retains the prior content key when possible. If it disappeared, the full-render Gunsmith branch has no semantic fallback; it retains/clamps a numeric index. That is a different and less predictable focus destination than the local-update family fallback.

Sources: [fixed Back](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/gunsmithSurface.ts#L170-L180), [logical Back](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/scenes/MenuScene.ts#L2452-L2461), [full-render preservation](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/scenes/MenuScene.ts#L337-L346), [full-render restoration](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/scenes/MenuScene.ts#L532-L555), [new region/finalization](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/scenes/MenuScene.ts#L2207-L2267).

Equipment has no selection-level Back-to-candidates step: its fixed Back opens Loadout; logical Back also leaves Equipment. Returning to Equipment remounts with a new scroll region. [Equipment Back](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/equipmentSurface.ts#L220-L223), [controller Back](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menus.ts#L109-L134).

## Controller safety and exact Back ladder
- beginMerge and choosing A are UI-only pending state; choosing B creates confirmation.
- Cancel confirmation preserves pending A selection, so returns to choosing B.
- Back from B removes A and returns to choosing A.
- Back from A removes merge selection and returns to recipes.
- Back from Workshop goes to Build; next Back leaves for Loadout.
- Confirm revalidates the exact confirmation, performs the domain merge once, clears pending selection on success, and retains pending confirmation on save failure.
- Explicit Build preview Cancel has a stable return candidate key. This is a good existing pattern to reuse conceptually for merge transitions.

Sources: [controller merge commands](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/gunsmithController.ts#L544-L624), [Back ladder](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menus.ts#L109-L134), [preview commit/cancel focus keys](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/ui/menuSurfaces/gunsmithSurface.ts#L229-L235).

## Why existing tests can pass
Existing merge scene tests verify text, legal input count, ownership, cancellation and duplicate-confirm safety. They invoke fake pointer callbacks and do not assert successor focus key or before/after viewport offsets for recipe→A, A→B, Cancel or fixed Back. The separate infusion test only asserts that its commit action is visible. The large-inventory test asserts generic focus/scroll bounds, not those transitions.

[50-input merge test](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/tests/menuScene.test.ts#L1838-L1859), [confirmation/Back tests](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/tests/menuScene.test.ts#L1888-L1988).

## Suggested next acceptance checks
1. Record focused semantic key and shared scroll offset before/after recipe, A, B, Cancel, fixed Back, Escape, and successful merge in a configured build with duplicate parts.
2. For Equipment distinguish literal offset0 from detail alignment after the list; record selected key, detail top, and offset. Test owned candidate and blueprint separately.
3. Repeat a slot change while only the lower portion of its tall card is visible. Pointer activation itself calls ensure-visible before the command, so partial-card clicks may move the viewport even before repaint. [Pointer activation](https://github.com/Joncallim/Meowcenary/blob/a100e053ce4e2bc48bc4b8844e7da5010d562096/src/scenes/MenuScene.ts#L1563-L1587).
4. Define explicit successor/return focus and reading position for every merge state; keep choices, selected inputs, consequence summary and commit within a coherent bounded area. Preserve domain legality, ownership, save-failure, and duplicate-confirm protections.
5. Test actual pointer/touch/controller scroll continuity. Existing code intentionally scrolls to fully reveal focused controls; “keeps the same key” alone does not mean “keeps the same viewport.”

No implementation made.

