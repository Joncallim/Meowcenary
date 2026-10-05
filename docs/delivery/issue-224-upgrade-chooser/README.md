# In-run Upgrade chooser — issue #224

Starting main: **8615a0d6424117a345c9fe0f253a715163d89dd4**. This is the bounded delivery for [#224](https://github.com/Joncallim/Meowcenary/issues/224). Exact final candidate/main identities, hosted CI, production pin and closeout results are recorded on its PR and issue. No umbrella acceptance is implied.

## Result and owning boundaries

The normal four-choice offer uses illustrated rows on phones and bounded illustrated columns on wide screens. Every name in an offer has the same font hierarchy; wrapping replaces name-specific shrinking. Cards show exact per-pick benefits **and downsides**, affected scope, new/owned current → resulting/max stacks, and secondary textual rarity on neutral plates. Large artwork, hover fill, pressed fill and a shared visible focus ring make the choice identifiable.

`UpgradeSystem` exposes its already captured/deeply frozen effect facts on `UpgradeCardReadModel`; a pure presentation formatter derives concise mechanics. No prose is parsed and no balance, RNG stream, eligibility, modifier application, persistence schema or save transaction changes. Percentages describe one pick rather than inventing additive accumulated totals.

All input still submits the existing `(offerId, choiceIndex)` command. Pointer handlers additionally require the live card object and captured token. A recreated controller hydrates the current immutable unresolved offer without rerolling or consuming a queued level; constructor failure releases its observers/view. An absent texture **or frame** uses a numeric fallback rather than an unrelated atlas frame.

## Reproduced defects and regressions

- Starting main omitted scope/stack facts from normal four-card offers. The explicit four-card regression fails before the fix.
- The camera-compensated phone layout gave a long title an inferior font size. The same-hierarchy regression fails on starting main; supported browser offers assert every full literal title and measured glyph fit.
- A texture could exist without its requested frame. The RED regression refuses construction of that wrong-frame image; corrected rendering uses the fallback and preserves authoritative selection.
- Recreating the chooser during an unresolved offer lost its presentation. RED/real-system GREEN tests verify unchanged offer token, RNG state, queue and exactly one accepted choice.
- Candidate validation caught a newly introduced Phaser crop/resolution interaction: resolution-2 Text cropping magnified real glyphs despite plausible metadata bounds. The browser raster regression failed first. Text now uses its bounded backing canvas without sprite cropping; text resolution remains 2.

The shared-text AST inventory changes from 59 to 56 construction sites because the four card roles share one wrapped factory. Its forbidden-constructor audit, allowed central factory and all bypass-detection probes remain intact. Legacy geometry assertions now test the actual illustrated regions; actual-font browser assertions are additional acceptance, not substitutes for input/lifecycle/gameplay tests.

## Art disposition

All 18 delivered 48×48 illustrations from draft [#208](https://github.com/Joncallim/Meowcenary/pull/208), exact candidate head **04e2840dae4b1efb7f8806ae350942e68768f651**, were individually compared against starting main's category placeholders and selected for this production implementation. The draft's old-base runtime/data changes were not imported and the draft remains untouched.

The pinned inputs and hashes live beside the editable native projects. Lossless per-icon Lua builders regenerate the native Pixelorama body/hidden-notes projects; runtime exports consume validated native cel pixels. Stable logical IDs, physical resources and URLs remain unchanged. Checks enforce source → builder → native cels → runtime pixels/metadata parity and detect deliberate builder/project/runtime corruption, including invisible source layers. The retired placeholder entry point is check-only.

See [art provenance](../../art/upgrade-icon-art-provenance.md). The handoff reports 1254×1254 generated masters and its normalization method; the three original Library archives were unavailable here. Only delivered 48×48 inputs are independently hash-verified. Native project generation/export uses the repository harness and pinned Pillow, not an unperformed Pixelorama desktop session. This adopts a production candidate; it does not claim canonical whole-game owner approval under #167/#191.

## Acceptance evidence and limits

The browser fixture controls eligibility in an isolated visual-test build, then uses the real UpgradeSystem, pause lease, frozen offer, named RNG and actual input adapters. Literal expected catalog text independently checks all 18 names/effects/scopes; new/owned/last-stack picks are included. It does not call a replacement chooser renderer or bypass selection. Ordinary production builds must contain no mutable visual-test seam.

Coverage includes 360×640, 390×844, 768×1024, 1114×720, 1280×720 and 1920×1080, plus 390px/DPR3 and blocked 844×390 → portrait restoration. Checks attack wrong-card release, stale release during queued offer replacement, held/repeated number/confirm keys, keyboard/controller focus, real virtual-gamepad polling, resize preserving focus/token, missing texture/frame, reduced motion, and successful queue completion. [Committed captures](captures/) include all 18 cards at both phone sizes and desktop, plus actual input presentation. Unit coverage additionally exercises all five rarity values, safe insets, failed construction/rebuild, stale callbacks and destroy/recreate.

Phone catalog captures show all 18 active cards at actual scale. Mechanical trade-offs remain fully visible, including SMG Spray's third effect and Pistol Needle Rounds' damage reduction. Desktop/foldable captures inspect title wrapping, large icons and focus presentation. Only the two existing Upgrade chooser goldens change, following individual actual-versus-expected inspection; no unrelated screenshot, timeout, threshold, retry or skip mechanism is relaxed.

Independent read-only review reruns focused tests and inspects actual phone/foldable/focus screenshots. The final code/art/bundle pass and complete exact-head validation results are posted with the PR.

Required closeout: lint/typecheck; full ordinary unit suite; all nine allocation gates; all nine runner probes/self-audits; content; complete art/source/export checks; ordinary production build/resource identity and absent diagnostics; full supported browser matrix; diff checks; hosted CI at PR head and merged main; exact deployed build marker and phone/desktop smoke. Do not close the issue until these have actually passed.

Emulated viewports/input and headless Chromium are not physical iOS/Android or subjective independent fun/whole-game art approval. #165, #167, #171, #191, #209 and unrelated owning issues remain open. Draft #208 remains an old-base candidate handoff. Independent art review reproduced hidden-body source metadata passing the raw-cel exporter. The validator now checks the single-layer render contract (visibility, opacity, blend/mask, ordered cels and RGBA mode), with a failing-before-fix metadata regression.

The next recommended bounded correctness tranche is #201's already reproduced stale-context delayed achievement acknowledgement, before actual native context recreation; this delivery does not repair or expand that ledger.

## Golden reconciliation

The phone golden now shows one title hierarchy instead of shrinking Pistol Needle Rounds, full exact effects and scope/stack facts, larger selected artwork and secondary rarity. The desktop golden replaces text-led full-width rows (with missing effect copy) with illustrated columns and complete mechanics. Both retain the same offer IDs/order and world/camera fixture.

The old top-border HUD paint was also reconciled rather than silently blessed: those goldens predate main commit `77ab1490d8e589e0792594ed0dab70fd08adbd67`, which reduced the HUD backing/frame from 1/0.9 to 0.42/0.48. Fresh baseline/candidate isolation shows identical current HUD geometry, texture UVs, alpha, camera and world pixels when the chooser is hidden. The old dark-opacity difference was within the existing pixelmatch colour tolerance, so pristine main still passed its old goldens. The new chooser goldens reflect that already-merged translucent HUD; this tranche changes no HUD/world/camera code or screenshot threshold. Raw local comparison/source-history evidence is retained with the audit.

[Golden reconciliation facts and captures](golden-reconciliation/) preserve the proof. The local-only audit requires two already-built visual-test worktrees and only serves localhost ports4295/4296; its historical-alpha mutation is an isolated paused presentation experiment, not production behavior or a game-input acceptance test. Current strips are identical across3,312 sampled pixels; historical opacity restores the old-golden RGBs. No screenshot tolerance changed.

## Hosted CI reconciliation

Candidate `47d43394b7bac6ee8c2e3f20b0d26e2caaced155` passed the full local suite, but hosted run37244733805 reported214 browser passes,64 scoped skips and4 failures. Both chooser-image mismatches were isolated to the stack arrow and following digits; the shipped Nunito Latin charset does not contain U+2192. OS fallback glyph metrics differed between the developer and Ubuntu environments. Stack copy now says `0 to 1/4`, preserving current/resulting/max truth using bundled-font ASCII. A failing-before-fix regression checks every catalog transition; all six presentation tests pass. No font-readiness barrier or image tolerance changes.

The two updated images were inspected individually. Their above-threshold deltas lie only in footer text; artwork, geometry and gameplay remain the same. [Hosted actual/diff images, charset, RED logs and final comparison](hosted-font-reconciliation/) preserve the diagnosis. Both complete transient-visual journeys pass after the explained footer update.

The other two hosted failures exhausted the existing 30-second widescreen test budget while bundling multiple fullHD captures with long input/catalog journeys. Completed captures/facts showed correct, unclipped cards; the pointer failure capture already showed the queue drained and gameplay resumed. Removing screenshots alone was insufficient: a two-CPU repeat reported 78 passes, five scoped skips and seven failures. Phase measurements placed widescreen launch at about 13 seconds and each warm catalog group at about five seconds; the combined five-group journey exceeded the single-case budget.

The final harness preserves the same live page/GameScene across bounded serial warm-catalog, queued-keyboard, stale-pointer and mixed-controller phases. Independent catalog and hover/pressed captures retain the ordinary 30-second budget. Context setup and cleanup use normal lifecycle hooks, with the same project viewport, touch/mobile and colour settings. Every original acceptance assertion remains, including failed/stale input and final queue completion. Expected total counts reject any skipped serial phase. No timeout, retry, viewport, skip or image threshold is relaxed.

The two-CPU repeat also observed two resize focus failures. Repeated observational trials, including a real stationary pointer beneath a rebuilt card, retained focus and the offer; they did not establish a runtime resize defect or prove that missed pulses caused the earlier failures. The original fresh-key driver used immediate press/release even though KeyboardAdapter samples key state on owner updates. Intended fresh navigation/confirm actions now hold the real key through an owner frame, then release through a neutral frame. Repeated/held negative-input sequences remain unchanged. Resize additionally asserts focus before rebuilding and records before/after facts. This strengthens driver ownership without claiming an unproved game fix. Exact-head full gates and hosted CI must pass again before merge.

The final two-CPU, six-profile chooser repeat passed **133 cases**, with **five existing DPR scope skips and zero failures**. Its pinned browser file is `e4287ec0172e4b1b9221e8ee1c01e73ec14a83637f023417b19489e3d8304378`. Fresh phone/desktop catalog, hover, pressed and controller captures above were refreshed from that completed run after the bundled-font correction. Independent AST review retained every original matcher/action sequence and added pre-resize focus evidence. Full repository discovery is 372 cases; exact-head acceptance must report 308 passes and 64 existing scoped skips.
