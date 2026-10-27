# Junction Vale first playable — bounded draft handoff

27 October 2026. Status: repository/design assessment completed; visual-reference
materialization blocked. No runtime implementation or visual acceptance claimed.
This document records the boundary before significant code changes.

## Authority and preserved baselines

The latest owner instruction selects Steam/desktop first, mobile later, using the
existing Phaser/TypeScript runtime. It authorizes a bounded first area, routine
branch commits/pushes and draft PRs, with **no merge or deployment**. It supersedes
the older mobile-first sequencing and hosted-milestone instructions in the design
pages. No Steam purchase, Steamworks credentials, Unity work or new service setup.

- Main and this branch's initial source: `b19d25e4fe5ef793a5de06a524a2090e5dcb636a`.
- PR [262](https://github.com/Joncallim/Meowcenary/pull/262): open draft,
  `phaser/core-loop-int-fb`, inspected head
  `ae5bcd9e17c6d6a67f83c023de1aec5d842aad4e`. Preserve its correctness work.
- PR [263](https://github.com/Joncallim/Meowcenary/pull/263): open draft,
  `art/janet-reset-2026-10-23`, inspected head
  `714a0cbcdfad4a5f1af67b090d099eea567a022a`. Its retirement manifest and
  Janet-owned replacement workflow remain authoritative for art status.
- This new branch is `draft/junction-vale-first-playable`, based on main. Neither
  existing PR branch was changed, merged, rebased or reset. No art was restored,
  removed, generated or promoted. Inherited legacy files are historical runtime
  compatibility data, not current visual canon.

Owning outcome: an owner-directed diagnostic first-area slice within R5/#171
and the #167/#191 visual context, consuming R1/#193/#197 shop presentation and
R2/#241 ability/input contracts. This is not acceptance or closure of any R-number
or issue. The new direction does not claim the older eight-character catalog is
the new six-character roster.

Sources inspected:

- [Canonical enemy/world design](https://docs.google.com/document/d/1SmGKzdo2toW6D1_guqnJ-3NGGI5RdkXPnt6LVlKHa9A).
- [Narrative, cast and pixel-art authority](https://app.notion.com/p/3fe5797fd36e8100a1c4ccb44f60ede0).
- [Connected World Atlas](https://app.notion.com/p/4005797fd36e8131a4c9f4f89d68f409).
- [Existing integrated-run specification](https://app.notion.com/p/3fe5797fd36e8114939ec238f4218f7e).
- [Player control and recovery](https://app.notion.com/p/3ff5797fd36e81d99b1fcf96ef7c9b5f).
- [Combat/device ownership](https://app.notion.com/p/3ff5797fd36e81cb9786cec294d375c0).
- [Architecture and HUD semantics](https://app.notion.com/p/3fe5797fd36e8122ba67f70df6776ef1).
- Repository `AGENTS.md`, required planning/index/architecture reads, live
  integrated fixture, shared input, save and focus code, and focused tests.
  No local `.agents` skill files were present in this checkout or `/workspace/.agents`.

## The implementable boundary

Use an explicitly labelled, isolated technical profile with **Tabby and Hound**.
This is a prototype subset of the six launch designs, not a roster or campaign
cutover. The opening inventory must already support play without a purchase.

1. **One safe frontage.** A compact Junction Vale dispatch/workshop approach
   supports contact, loadout inspection and shop access. Public paths remain safe
   and available; inspecting or accepting a work order does not spawn hostiles
   into the dispatch area. Essential objective and permission information remains
   available after skipping dialogue.
2. **One adjacent restricted workyard.** An authored, collision-validated entrance
   leads to a bounded finite encounter with a readable retreat/return path and a
   small cover arrangement. Reuse existing validated enemy behaviors and automatic
   targeting/fire. No whole atlas, region streaming, new vertical traversal,
   unrestricted character switching, boss catalog or procedural world generator.
3. **One complete return.** A real encounter/objective completion enables explicit
   return and one durable result. Contact acknowledges that result. A failed write
   publishes no reward, purchase, equipment assignment or completion. Retry and
   reload must retain their exact declared state without duplicate rewards.
4. **Two weapons per actor.** Each owns two independently equipped signature-family
   guns; one active slot is visibly selected. Swap changes the active gun, never
   cooldown ownership or free ammunition. Stowed refill/setup behavior must follow
   the inspected mechanics, not an invented convenience rule.
5. **Truthful HUD.** A solid 0–100% health bar reads authoritative health
   immediately. Three equipped devices belong to each actor, separately from
   passives and weapon state. Radial cooldowns read committed device state;
   companion/party readiness is a separate read model, not an invented fourth
   shared ability or decorative READY label. Unsupported effects must never be
   advertised as working. No new cooldown durations or damage bonuses derive
   from the mockup.
6. **Compact merchant browsing.** Keep the world visible beside the browsing
   panel. Selecting an item shows the selected/owned/equipped comparison and
   actual tradeoffs. Purchase opens explicit Confirm/Cancel; default focus is
   safe, cancellation changes nothing, and buying does not silently equip or
   teach a recipe. Quotes, prices and dialogue remain labelled prototype values.
   Merging is excluded from the opening unlocks; preserve the separate later
   continuation instead of advancing its milestone.
7. **Desktop and controller parity.** WASD/arrows, pointer and standard controller
   movement converge on shared logical input. Contact, browsing, comparison,
   purchase confirmation, cancel/back, pause, weapon swap and skill selection
   need visible keyboard/controller focus with no pointer fallback. Modal input
   owns the gesture, freezes simulation where appropriate and requires deliberate
   rearming; resize, blur and disconnect cannot spend or move unexpectedly.

The work order's placeholder title/text and technical profile are not a new
canonical campaign operation, entitlement or economy. Do not relocate the current
post-Chapter-2 Freight Basin R01/F01 contracts into Junction Vale or relabel that
existing seed as a new-game start. Reuse their tested lifecycle primitives where
applicable, not their site/property/unlock identities.

Keep the existing camera projection until the references are inspected. Oblique
artifacts in generated images do not authorize a projection change. Actor/enemy
concept-relative heights are not sprite sizes or colliders; preserve authoritative
body dimensions. Any technical sprites must be visibly marked placeholders and
remain separate from final asset bindings. Do not use a prepainted background as
the arena or reintroduce PR263-retired visuals as accepted replacements.

## Reuse and integration risks

| Existing owner | Reuse / required boundary |
| --- | --- |
| `IntegratedFixtureCombat` | Two guns, independent supplies, active-only timing, ballistic LOS/range, damage and combat snapshot rules already exist. This is a bounded fixture, not complete enemy AI or the current device runtime. |
| `IntegratedFixtureOperation` and receipt helpers | Reuse inspect/accept/activate/objective/extract and event-based idempotence. Keep the new prototype's site and source identities explicit. |
| Fixture envelope / workshop transactions | Existing isolated namespace, revision checking, writer lock, persist-before-publish and failed-write behavior are useful. Preserve ordinary Save V4 and all legacy IDs. Do not perform a live migration for this slice. |
| PR262 camera/input geometry | Reuse fixed UI/world camera separation, inverse world-pointer mapping, dynamic actor ownership and resize fixes after review. Its restored legacy art binding must not become the new visual integration. |
| `InputController` / `LogicalInputCore` | Reuse device coalescing, deadzones, disconnect/blur clearing, neutral rearm and pointer suspension. The integrated fixture currently bypasses this owner. |
| `FocusNavigator` / `ScrollableFocusRegion` / pause controllers | Reuse existing navigation grammar and semantic focus/scroll restoration. Do not build a second controller focus system. |
| Ability/device rules | Existing legacy single-character Ability FX is not the specified three-device duo. Device commit/cancel, cooldown ownership and party read models need an explicit small integration; no cosmetic cooldown substitution. |

The existing fixture polls raw movement and binds `S` to Sell as well as downward
movement. It lacks controller/focus and ordinary pause/blur routing. Its workshop
overlay is not an explicit movement/simulation fence. Independent browser review
reproduced a P1 queued-confirm consent defect on `b19d25e`: hold the writer lock,
confirm Buy F2, explicitly cancel, open Build B3 at the same revision without
confirming it, then release the lock. The cancelled Buy F2 still spends 1,650
Credits (3,000 → 1,350), adds one part and writes `ui:buy-f2:0`. PR262 contains the
same vulnerable method, but only `b19d25e` was browser-reproduced. A future fix
must capture a preview identity/generation and validate it inside the writer;
profile revision alone does not prove current consent. The defect remains
**unfixed**: the subsequent parent instruction limits this turn to independent
checks and planning while references are blocked. No runtime file was changed.
These risks block blindly using the existing scene as the new desktop/controller
slice. Red trace/screenshots are retained at `/tmp/meow-first-slice-review/` in
this execution environment as diagnostic engineering evidence, not visual canon.

## Reference blocker

All three exact approved Library IDs were resolved through supported Library
preparation for this executor's `/workspace/meowcenary-references` destination:

| Reference | Library ID | Local verification |
| --- | --- | --- |
| Corrected combat HUD | `libfile_2e77144558b881919e2638435652d45f` | No readable bytes; pixels not inspected |
| Compact merchant browsing | `libfile_52c7fe3dfd4c81919fcf1050fa88920f` | No readable bytes; pixels not inspected |
| Contact dialogue | `libfile_d358b70f530c819196107243f8307db2` | No readable bytes; pixels not inspected |

Preparation succeeded but returned download transfers without local workspace
paths. The current bundled Library transfer helper failed for each with exit 1:
`library file transfer failed: download failed`. A fresh supported preparation
and consumer-local retry under `/workspace/meowcenary-references/retry` failed
identically for all three. An additional sandbox escalation for the HUD transfer
executed but also failed; automatic approval review did **not** reject it.
No private download URL was guessed, alternate asset substituted or transfer
credential committed. The underlying HTTP/network reason was not exposed by the
helper, so it is unknown.

**Blocked action:** image-dependent screen/HUD/shop/dialogue implementation and
visual screenshot comparison. The action did not execute; readable bytes and
pixel inspection remain prerequisites. Repository/design assessment and baseline
verification continued independently. Restore supported Library materialization
into this executor's local workspace, verify readable files, inspect all three
images, then resume the implementation sequence below.

Command-line `gh pr view` also returned GraphQL Forbidden. Connected GitHub
read-only metadata succeeded for both PRs and ordinary `git fetch` succeeded;
PR inspection is therefore completed, not an outstanding access blocker.

## Implementation and evidence sequence after unblocking

1. Inspect all approved reference pixels and pin identities/hashes outside runtime
   bindings. Keep approved concept art unchanged. Freeze the small state flow,
   logical actions, isolated save ownership and placeholder/final asset boundary.
2. Integrate reviewed PR262 camera/pointer/resize fixes without its art cutover.
   Build the one safe/restricted authored site and movement/combat/return loop,
   using existing systems and validated data rather than expanding scene rules.
3. Join the supported duo device state and two-gun HUD; then contact and merchant
   side panel using the same comparison resolver and transaction command as
   preview/commit. Add focus, pause, cancel and neutral-rearm lifecycle coverage.
4. Prove real controls from fresh isolated state through encounter, return,
   purchase/cancel/equip and reload. Include denied storage, stale profile,
   delayed writer, double confirm, blur/disconnect, resize and UI/world gesture
   ownership. No direct transaction call may stand in for the ordinary journey.
5. Run narrow rule/lifecycle tests, lint, full suite and build. Run art validation
   if any manifest/visual payload changes. Capture actual gameplay, contact,
   browsing/comparison and confirmation screenshots at 1280×720 and 1920×1080.
   Verify production bundles contain no debug transaction seams.
6. Obtain independent input/save review. Physical controller play, owner visual
   review, human readability/fun and later mobile validation remain distinct open
   gates. Keep any PR draft and report candidate/main/deployed SHAs separately.

## Executed baseline checks

On unchanged gameplay source at `b19d25e`:

- `npm run lint`: passed.
- `npx vitest run tests/integratedFixture.test.ts tests/lateFixture.test.ts tests/input.test.ts tests/logicalInput.test.ts`:
  4 files / 158 tests passed, zero skipped or failed.
- `npm run build`: passed (220 modules transformed; production Vite bundle built).
- No image-dependent implementation, accepted screenshots, whole-suite pass,
  physical-device result, merge, deployment or Steam integration is claimed.

The next action remains completing this same bounded R5 diagnostic slice after
reference access and the named input/save joins are resolved, not expanding the
world or resuming retired art production.
