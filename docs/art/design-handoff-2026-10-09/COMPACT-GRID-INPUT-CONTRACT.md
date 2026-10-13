# Compact-grid focus and input contract — #193 / #197

12 October 2026. Resolves the two integration questions raised in #193 comment 6115429782 and cross-linked from #197 comment 6115432428. Jonathan requested their resolution. This is the implementation contract for those questions, not a runtime implementation or owner visual approval.

Read with [COMPACT-GRID-SPEC.md](COMPACT-GRID-SPEC.md) and [193-197-CONTEXT-PRESERVING-LAYOUT.md](193-197-CONTEXT-PRESERVING-LAYOUT.md). This document wins on focus authority, scroll/input ownership, overflow, return state and their integration. Existing layout/art direction, mechanical preview/commit rules and unrelated holds remain unchanged.

Source baseline is main `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`. The earlier design packet is draft #231 at `bbeca5586980ba1914c8270e08bb61306baa70de`. This addition deliberately changes only handoff documentation and its nonshipping proof, not main, runtime files, assets, save data, CI or other workers' branches.

## 1. Verified problem and correction to the original report

[MenuScene][menu] has one global navigator, one scroll region, index synchronisation through repeated directional movement, a full-width vertical mask, wheel routing without a region hit test, and shared drag state. [ScrollableFocusRegion][scroll] contains a second navigator but exposes no direct index synchronisation. [FocusNavigator][focus] already exposes bounded `setIndex` and grid movement. Main creates the scroll region in linear mode; the identified grid failure is conditional on a future integration.

The original nine-item example was inaccurate. With two columns, starting at 0 and targeting 1 executes **0 → 2 → 0**, returning the wrong index; it does not itself loop forever. Actual nontermination witnesses are nine items, starting at 1 and targeting 0 (Up stays at 1), and ten items, starting at 0 and targeting 9 (Down reaches 8 and stays there). Bounded probes using the hash-verified source reproduce all three. Preserve this correction when citing the original finding.

The solution is direct state synchronisation, not a loop guard, extra synthetic navigation, or enabling grid mode everywhere.

## 2. One focus authority, a passive scroll mirror

MenuScene remains the sole live logical focus owner. Its existing navigator/index plus semantic key map identify the current target. A surface supplies immutable layout/navigation data through [MenuSurfaceControls][surface], never another live navigator or its own keyboard/controller listeners. Existing controller selections remain separate from focus: moving focus is not an equip, build selection, candidate commit or save.

Add exactly this bounded seam to ScrollableFocusRegion:

```ts
setFocusedIndex(index: number, options: { readonly reveal?: boolean } = {}): boolean {
  if (!Number.isSafeInteger(index)) throw new RangeError('index must be a safe integer');
  if (index < 0 || index >= this.items.length) return false;
  const changed = this.navigator.setIndex(index);
  this.prefixRevealed = false;
  if (options.reveal !== false) this.ensureVisible(index);
  return changed;
}
```

The return value means focus changed, not that the request was accepted. Invalid finite indexes are no-ops, never clamped onto a different action. Noninteger/nonfinite indexes throw before changing state. Empty regions retain -1. An unchanged valid index still receives requested minimal reveal; `reveal:false` preserves the scroll offset. `setItems([])`/destroy already reset empty state.

Replace both `syncScrollFocus` while loops with one scene-global-to-region-local lookup and one call to this method. A focused fixed control has no local mapping and does not move collection focus/scroll. Never call region.moveFocus to mirror scene state. Keep the region linear/passive in these mixed-layout menus; the seam must nevertheless work in both existing modes. Preserve existing standalone users of moveFocus.

## 3. Spatial navigation is declared once per committed layout

Add a small pure helper under `src/ui/menuSurfaces/` that builds a keyed neighbour table for Equipment/Gunsmith. Reuse existing FocusDirection and semantic focus keys. The plan contains current target keys, their scene index mapping, optional scroll-local mapping, target role (action/card/reading), and Up/Down/Left/Right neighbours. No durable state or content-ID branches.

Build once on mount, candidate-set change or geometry change, not per frame. Validate unique keys and that every neighbour resolves within the current view. Commit the table atomically with hit targets and layout generation. A malformed participating plan fails the existing safe display/recovery gate; do not silently fall through to old numeric navigation. Unchanged Home/Career/other surfaces keep their current navigation.

An absent directional edge means remain on the current target, never fall back to linear navigation. Empty destination groups are skipped to their next declared action/Back; never reference a phantom inspector or card.

The rules are fixed:

- Header controls navigate by their rendered rows. Left/Right stays within a row; Up/Down chooses the nearest horizontal centre in the adjacent row, ties left. Up from the first row reaches outer Back. Down from the last header row enters the retained candidate, or the first available card. Empty collections go to the visible empty-state/details control, then Back.
- Candidate cards navigate by **rendered rows**, including group boundaries and ragged rows. Left/Right chooses the adjacent card in that row. Up/Down chooses the same column, clamped to the last card in the adjacent nonempty row. Decorative headings are not grid cells. Up from the first candidate row returns to the last relevant header control. Do not apply one modulo grid to headers, cards and inspector actions together.
- On wide layouts, Right from a row's last card enters the first inspector control; Left from the inspector returns to the exact grid departure key. Down from the last candidate row enters inspector/actions. On compact layouts Right at the edge stays put; Down from the last row enters fixed summary/actions. Those actions return Up to the retained card. All controls remain reachable without a pointer.
- Inspector/actions use their visible order; Down after the last reaches outer Back. Outer Back Down returns to the first header, and Up returns to the last action/retained card. In a local detail/review view, use local Back instead; underlying browse/header controls are absent from its plan. Back never invokes a mutation.

For these surfaces, replace the existing `current < 4` slot-header special case with the participating plan. Do not additionally advance the scene's old linear navigator after choosing a plan neighbour. A direction applies one table lookup, one scene setIndex and at most one region sync/reveal.

Locked-but-readable targets can remain focusable; Confirm obeys their explicit activation eligibility. Selecting a card by tap/Confirm updates the existing controller candidate and stationary inspector, retaining the card's focus. Directional focus alone does not silently change the selected candidate or persistent engineered family. Returning from the inspector uses the departure key, which may differ from the selected candidate.

## 4. Exactly one scroll rectangle per active view

Use one scene-owned rectangle `{ x, y, width, height }` in the same logical coordinates as Menu pointer positions and display bounds. Extend beginScrollableRegion with a rectangle form while retaining the existing top/bottom form for unaffected callers. Both enter the same region/mask/gesture owner.

In browsing view, this rectangle encloses **only the candidate collection**. Header, inspector, fixed summary, actions and Back are outside it. In detail/review view, it encloses **only the detail body**; browse nodes and their hit targets are unmounted. Retain a bookmark, not an invisible second live scroller. There is no nested scroll region.

Use the exact rectangle for stencil clipping, wheel admission, drag admission, pointer activation intersection and keyboard reveal. A partially visible card is clickable only where its own hit rectangle intersects the region. A visual mask is not input clipping. Include horizontal bounds as well as vertical bounds, with half-open edge tests to avoid double ownership on shared edges.

All card children retain their semantic owner. Fixed inspector nodes are never registered as collection scroll objects. A read-only detail body still needs its mask and content extent when it contains **zero action rows**; do not retain finishScrollableRegion's current early return solely because itemCount is zero.

Use existing UiViewport/safe-area conversions. The original spec's CSS-pixel budgets remain authoritative; do not treat DPR/device pixels as logical pixels. End the collection above fixed summary/actions plus one bottom-safe inset and the specified gap. Do not double-count that inset. No full-width mask may cut through the stationary inspector.

## 5. Inspector overflow has a defined escape, not another scroller

Wide browsing uses a fixed inspector. When the complete decision content fits at supported text/target sizes, it can contain existing actions. Fit is determined from actual laid-out content height, not string-length guesses. Mandatory decision content includes identity/state, replaced or consumed/fitted items, costs, scope, gains/losses including Set thresholds and deduplicated traits, and relevant lock/acquisition facts.

When it does not fit, show a concise nonmutating summary plus **View details / Review change**. Do not truncate required consequences and leave an immediate commit button underneath. The explicit action opens a panel-local detail view. Compact layouts use the same detail view when full inspection is requested; ordinary card selection never opens it automatically. This is the existing inspection/review surface, not an extra confirmation after every equip.

Detail/review has fixed identity/Back, one scrollable body and fixed eligible actions. On entry start at the explanation, never at Confirm below unseen consequences. Add one genuine nonmutating reading target, registered as Text/focus rather than a fake command. It has no action sound, pointer activation or save callback.

While that reading target is focused, Up/Down pages the body by `max(1, viewportHeight - physicalToLogical(48))`, clamped to its bounds. Only when already at the corresponding boundary does another Up move to local Back or another Down enter the first fixed action. Left/Right and Confirm on the reading target do not mutate. Actions Up return to the reading target with its offset retained. Pointer users can scroll the same body normally; no forced reading timer is introduced.

On width/orientation changes, an open detail view stays open until explicit Back. Do not convert it into browsing merely because a desktop inspector now fits. Content that becomes too long while browsing switches to the nonmutating summary/detail route with stale hit targets invalidated.

## 6. Bookmarks, rebuilds and local Back

Controller-owned slot/build/candidate/recipe/input selection stays where it is today. The cached owning surface holds only bounded transient view/bookmark data, not Save fields or GameObjects. Store scope identity, selected candidate identity, focused key, first-visible row's stable item key, and intra-row scroll offset. Scope includes slot/Set filter or Gunsmith family/surface/recipe/input step. Keep only the current browsing bookmark and the finite workflow return points, not an unbounded navigation history.

Restore in this order: derive the current legal read model; lay out the new rows; repair missing keys; install the new focus/hit map; restore the key-based anchor; then reveal only when appropriate. For a retained anchor:

```text
scrollOffset = clamp(newRowTop + clampedIntraRowOffset - viewportTop,
                     0, maxScroll)
```

Resolve newRowTop from the stable key and new column count. Clamp intra-row offset to the new row height. A removed key chooses the first surviving successor from its old ordered list, then predecessor, then the new first card; no survivors means the scope's empty-state control/Back. This is deterministic repair, not persisting row indexes.

Ordinary pointer selection, pixel-only hydration and same-geometry detail Back preserve the anchor without automatic ensureVisible. Keyboard/controller moves reveal minimally. On structural reflow restore the anchor first; if keyboard/controller focus no longer fits, minimal reveal may override exact pixel preservation. That documented exception prevents promising both impossible exact scroll retention and visible focus in a smaller viewport. Oversized reading content uses the detail reader rather than trying to reveal an entire oversized card.

Route fixed local Back, Escape and controller Back through the same scene-owned action. Preserve outer Back-to-Loadout as a distinct browsing command. Extend the existing GunsmithSurface.handleBack pattern to Equipment; do not let a pointer Back call the parent controller directly while Escape restores local context.

Merge keeps the established ladder: recipe → A → B → review → result. Review entry shows its heading; Cancel returns to B with A and the B anchor retained; Back from B returns to A; Back from A returns to recipe. Success focuses the output/result, not a consumed input. Save failure retains review and selected inputs with an error. Back does not repeat confirmation or discard valid earlier inputs. Eligibility, stale-confirmation rejection and one durable commit remain domain/controller-owned.

## 7. Gesture ownership and lifecycle

MenuScene owns a single menu pointer gesture token with pointer ID, interactive generation, origin, last admitted position, pressed semantic key and latched drag state. Surfaces never install their own pointer/wheel listeners.

Begin a collection/detail drag only inside its active rectangle. Fixed inspector/actions cannot start one. The first pointer owns the gesture; other pointers neither reanchor, release, scroll nor activate it. Do not adopt a still-held secondary pointer when the owner lifts: require a fresh eligible pointerdown.

Use an 8 CSS-pixel maximum displacement threshold from pointerdown, converted consistently to logical coordinates. Below threshold, do not scroll. Once crossed, latch drag and apply vertical movement; moving back to the origin cannot turn it into a tap. Release can select only the same pressed semantic target, same interactive generation, matching pointer and valid clipped hit area, with no drag or interruption. Wheel over the inspector/background never scrolls the collection. A wheel or keyboard/controller command during a pending pointer press cancels that press before it can activate later.

Cancel ownership and invalidate pending release on pointercancel, input interruption/hidden or blur, orientation block, local-view transition, hit-target replacement, resize, unmount and shutdown. Use the existing InputController quarantine boundary for held-input admission; cancel scene-owned gesture state first. Register any missing browser interruption notification once at the Menu/platform edge and unsubscribe on shutdown, never inside a surface or pure gameplay. Do not claim current main already has general visibility quarantine. Preserve #240's newer launch/recovery input rules when integrating.

Physical key repeats, mixed inputs and stale pointerup must not trigger a second command. Resource completion may paint only its current mount/candidate generation. Pixel-only hydration that preserves hit targets need not restart focus; replacing controls invalidates their old callbacks. Missing art preserves labels/context and Retry/Back, not an incorrect substitute item. Shared textures remain loader-owned.

## 8. File ownership and implementation order

One integration writer owns `MenuScene.ts`, `surface.ts`, `scrollableFocus.ts`, the small pure navigation/bookmark helper and their focused tests. EquipmentSurface owns Equipment view/bookmarks; GunsmithSurface owns its view/bookmarks. Neither owns persistence, loader queues or raw input. Keep the same shared scroll and focus primitives rather than introducing a UI framework.

Active work rechecked on 12 October: #236 is draft at `aa0bdcd664ded0ca94124432f07a319a53e38f55`, and #240 is draft at `d2dedffbcac9568ca81e9d5e667eb41d1890e569`. #236 changes both surfaces/controllers and menu tests; retain its acquisition summaries, blueprint/ownership distinctions and durable milestone rules. #240 owns Menu/launch/input integration. These SHAs identify inspected work, not accepted/merged authority. Recheck current heads and take an explicit shared-file handoff before implementation; do not copy stale whole files over either branch.

Implement in three bounded slices: (1) direct synchronisation plus pure keyed-plan/bookmark tests, with current linear menus unchanged; (2) rectangle/gesture/reader lifecycle integration behind the same controls boundary; (3) connect the approved compact Equipment/Gunsmith layouts and run integrated acceptance. Do not release an intermediate grid with old loop synchronisation or an inspector without its overflow/input policy.

## 9. Acceptance and evidence

Required integrated regressions include every focus pair for 0/1/2/8/9/10/50 candidates and 2/3 columns; ragged and grouped rows; removed/locked choices; reachability/return from every control; pointer selection without collection movement; column-change bookmarks; inspector wheel/touch exclusion; clipping on all four edges; second-pointer/release/cancel; drag-return-to-origin; stale callback after rebuild; empty and long read-only detail; long consequences/locks; all Back/merge/save-failure transitions; safe-area/resize and art-load races. Verify no background hit target remains active in details. Preserve preview/commit, economy, save, allocation and resource regressions.

Use 360×640, 390×844, supported short desktop/tablet/foldable and normal desktop profiles, including asymmetric insets. Coarse-pointer phone landscape keeps its portrait guard. Run the existing full lint/test/build/content/art/browser gates without loosening timeouts, assertions, skips or goldens. Review the actual layout and physical inputs separately.

Local architecture proof: Node 22.16.0; both source blobs checked against GitHub IDs before TypeScript compilation. The proposed method was inserted into a **temporary** copy only. 33,000 direct-focus cases passed across linear/grid, 1/2/3 columns, all pairs for the stated counts, and reveal/no-reveal. Invalid/empty/destroy checks also passed. 413 geometry/gesture/anchor model cases passed. These counts describe property-case iterations, not repository test files or browser tests. A second complete invocation also passed.

The proof covers the direct seam and selected specification models, not an implemented Menu focus plan or Phaser event wiring. It does not establish full-suite, browser, visual, device, CI, merge or deployment acceptance. No independent subagent review is claimed. Architecture decisions for both reported gaps are resolved; implementation remains open under #193/#197.

Reproduction of the nonshipping proof from a repository checkout with Node 22 and TypeScript available:

```sh
scratch=$(mktemp -d)
git show 4f79d6210c3b028b995d67a5cc6e35318b17b2ee:src/ui/focusList.ts > "$scratch/focusList.ts"
git show 4f79d6210c3b028b995d67a5cc6e35318b17b2ee:src/ui/scrollableFocus.ts > "$scratch/scrollableFocus.ts"
PATH="$PWD/node_modules/.bin:$PATH" node docs/art/design-handoff-2026-10-09/audit/verify-grid-input-contract.cjs "$scratch"
# Delete the temporary source copies after inspecting the result.
```

[menu]: https://github.com/Joncallim/Meowcenary/blob/4f79d6210c3b028b995d67a5cc6e35318b17b2ee/src/scenes/MenuScene.ts
[scroll]: https://github.com/Joncallim/Meowcenary/blob/4f79d6210c3b028b995d67a5cc6e35318b17b2ee/src/ui/scrollableFocus.ts
[focus]: https://github.com/Joncallim/Meowcenary/blob/4f79d6210c3b028b995d67a5cc6e35318b17b2ee/src/ui/focusList.ts
[surface]: https://github.com/Joncallim/Meowcenary/blob/4f79d6210c3b028b995d67a5cc6e35318b17b2ee/src/ui/menuSurfaces/surface.ts
