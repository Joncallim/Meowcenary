# Alpha 3 owner acceptance packet — 2026-10-17

This is an actionable handoff, not a merge, deployment, issue-closure, art
approval, audio adoption, or product-pass claim. GitHub issue state below was
rechecked on 2026-10-17 UTC; every issue listed remains **Open**.

## Candidate and verification provenance

| Scope | Exact candidate | Branch | What it contains |
| --- | --- | --- | --- |
| R1 Loadout/Equipment/Gunsmith | `c6b4939e989cf1f5613cbc9fd72b8e704699f667` | `r1-equipment-gunsmith-review` | Layout, Equipment/Gunsmith semantics, touch/controller/browser diagnostics |
| R2 Abilities/handedness | `00545f27ff2314e1880ac106784f6fea888dc578` | `r2-issue-241-ability-lifecycle` | Ability lifecycle, terminal cleanup, handed-controls wiring, ledger evidence |
| R3 audio review | `33d010340ea000cc92e483586e488bf2063fc755` | `r3-issue-237-audio-review` | Held editable auditions and lifecycle review; public runtime audio unchanged |
| protected remote main at this review | `08b28a33d2994f1c9131e9537c21d9f6680dac00` | `origin/main` | Integration baseline; no source adoption is inferred from held branches |

The R2 and R3 tips above contain documentation-only reconciliation commits
after their source-validation heads. Hosted PR #261 browser CI was reported as
still running by the parent connector at 10:38 UTC; this packet makes no hosted
success claim.

The complete `npm run art:validate` chain passed on the R2 candidate using:

- Node `22.23.3`;
- Pillow `12.1.1` and CairoSVG `2.9.1` from the repository requirements;
- official Debian `lua5.4_5.4.7-1+b2_amd64.deb`, SHA-256
  `da5947f8274bdcd0dd6d1aaf6d780bc7537827455d456d07dc9c14daf702f1df`,
  extracted under `/tmp` rather than installed system-wide.

The prior intermittent allocation evidence remains valid: the first R1 full
Node-22 run recorded one runner-level pointer-anchored Scavenge event, direct
zero-allocation probes passed `3/3`, and the complete rerun passed. The Node-24
base-versus-candidate discrepancy remains unresolved and is not relabeled as a
source fix. Raw logs remain at `/tmp/r1-c6-full-test-pillow1211-20261017.log`,
`/tmp/r1-c6-full-test-pillow1211-repeat2-20261017.log`, and
`/tmp/r1-c6-zeroAllocation-pillow1211-repeat{1,2,3}-20261017.log`.

## Roadmap reconciliation

The current GitHub state and repository code distinguish machine-complete
foundations from the remaining product, visual, listening, and device gates.

| Issue | Criteria met in current code/evidence | Criteria still unmet; next action |
| --- | --- | --- |
| [#85 Contracts/Stages](https://github.com/Joncallim/Meowcenary/issues/85) | Stage/Contract data, objective runtime, encounter/difficulty composition, durable clear/extraction and retry foundations are integrated and tested. | Full controller/touch/player-experience journey, formal prerequisite chain, and integrated acceptance remain. Run after child feature gates are stable. |
| [#88 Mercenary roster](https://github.com/Joncallim/Meowcenary/issues/88) | Roster, unlock and active-ability foundations are present. | Base identity approval, actual gameplay/device acceptance, and #196 comprehension remain. |
| [#98 asynchronous challenges](https://github.com/Joncallim/Meowcenary/issues/98) | Correctly remains a future concept. | Deferred; no Alpha 3 accounts/network/social implementation is authorized. |
| [#167 whole-game art](https://github.com/Joncallim/Meowcenary/issues/167) | Multiple authored source/export and runtime-art pipelines are validated. | Whole-game art authority, expanded enemy/Warden coverage, actual-scale crowded combat and phone acceptance remain. |
| [#171 product pass](https://github.com/Joncallim/Meowcenary/issues/171) | Diagnostic pacing/progression evidence exists. | Final fun, replayability, reward clarity and physical-phone verdict must wait for the child gates below. |
| [#174 Volt Lynx identity](https://github.com/Joncallim/Meowcenary/issues/174) | Existing source tests distinguish the current silhouettes. | Jonathan must approve the naked Lynx/Tabby comparison and any corrected base-fidelity candidate. |
| [#175 actor polish](https://github.com/Joncallim/Meowcenary/issues/175) | Existing actor/runtime conformance and authored sources are covered. | Broader animation, personality, contact-shadow and readability review follows #191/#174; no art reconstruction is authorized here. |
| [#191](https://github.com/Joncallim/Meowcenary/issues/191) | Runtime scale, source/export checks and known fidelity evidence are recorded. | Reference-to-runtime authority, the reproduced Lynx defeat-border correction, and owner actual-scale approval remain. |
| [#193 Gunsmith](https://github.com/Joncallim/Meowcenary/issues/193) | Atomic fitting, Workshop/Parts semantics, shared scope language and candidate responsive screens are implemented. | First-use comprehension, real touch/controller/mixed-input checks and owner visual approval remain. |
| [#194 seeded Arena](https://github.com/Joncallim/Meowcenary/issues/194) | `ResolvedArenaLayout`, dedicated layout RNG, immutable consumer handoff, bounded generation, witnesses and deterministic fallback are live (`src/gameplay/arenaLayout.ts`, `tests/arenaLayout*.test.ts`). | Product seed cohort: same seed must reproduce, different seeds must visibly vary collision-bearing layout, both biomes must remain legible, and mobile/desktop play must be accepted. No new generation architecture is needed. |
| [#196 ability comprehension](https://github.com/Joncallim/Meowcenary/issues/196) | Eight mechanical explanations, run-start brief, actual outcome receipts, active/cooldown HUD state and lifecycle tests are present; R2 browser coverage is `222/222`. | Owner comprehension, actual phone touch/controller use, reduced-motion/device review and final production FX relationship remain. |
| [#197 Loadout/Equipment](https://github.com/Joncallim/Meowcenary/issues/197) | Shared semantics, candidate responsive surfaces, focus/scroll, atomic save behavior and browser workflows are implemented. | Product-owner actual-scale review, first-time-player comprehension, physical touch/controller/mixed-input acceptance. |
| [#198 type/tier art](https://github.com/Joncallim/Meowcenary/issues/198) | Generic 32-definition × 4-tier registry, source/export parity, resource closure and candidate references are present. | Candidate art is not authority. Approve/reject type/tier readability at 44px menu and 28px held scales before #199 consumes it. |
| [#199 equipped appearance](https://github.com/Joncallim/Meowcenary/issues/199) | Equipment visual identities and immutable loadout data foundations exist. | After approved base direction and #198, implement the bounded appearance resolver/composite owner and immutable run-start snapshot; then validate layering, lifecycle and phone readability. This is not merely a sign-off item. |
| [#200 pickups](https://github.com/Joncallim/Meowcenary/issues/200) | Pure grant-to-presentation resolution, exact weapon family/tier identity, one reusable pooled sprite and reset/blocking regressions are integrated. | **Not finished.** Canonical XP/Scrap/Chest native art, crowded-floor readability, actual-size phone review and owner approval remain; loot/physics semantics must stay unchanged. |
| [#201 defect ledger](https://github.com/Joncallim/Meowcenary/issues/201) | Recorded fixes including delayed achievement acknowledgement, Scavenge continuation and bounded resource/freshness corrections are integrated in known heads. | **Still open.** Newer recorded findings include stale latest music intent and Menu outer-Back/gesture admission work; verify each exact head and do not close the iterative ledger merely because earlier fixes are green. |
| [#209 performance/mobile boundaries](https://github.com/Joncallim/Meowcenary/issues/209) | Measured loader/resource ownership and bounded performance architecture are integrated; no broad rewrite is justified. | Remaining measured Menu ownership, long-run/performance comparison on real devices and product responsiveness acceptance. |
| [#237 original audio](https://github.com/Joncallim/Meowcenary/issues/237) | Editable menu/run/SFX auditions, exporters, lifecycle/package candidates and focused checks are preserved on R3; public catalog/runtime remains unchanged. | Listening approval, original-source adoption decision, complete cue coverage, browser decode/resource closure, mono/phone-speaker and interruption/background/Retry device checks. |
| [#241 authored ability FX](https://github.com/Joncallim/Meowcenary/issues/241) | R2 contains handed-controls wiring and tokened ability lifecycle cleanup; the ability suite is green locally under the pinned setup. | Candidate FX sources remain unapproved; selected-resource closure, generic renderer/token integration, both-biome one-second recognition, crowded/sustained-expiry review and physical-device/owner acceptance remain. |

## Proposed order

1. Jonathan selects/approves the base Mercenary direction and the narrow
   Volt-Lynx/Tabby outcome (#191 → #174), then judges broader actor polish
   (#175). Do not use #199 wearables to hide a base-identity problem.
2. Review the R1 candidate side-by-side for #198 type/tier readability, then
   perform #197/#193 first-use and physical touch/controller checks.
3. After #198 and base visual approval, authorize the bounded #199 appearance
   resolver/composite implementation and its run-start snapshot tests.
4. Supply and approve canonical #200 pickup pixels; validate the already-built
   pooled presentation against both floors, dense clusters and a full rack.
5. Decide on the #241 FX masters/resource cutover, then run the R2 two-biome
   comprehension and physical-input checklist.
6. Hold a listening session for #237, decide whether the candidate sources may
   replace placeholders, and only then run integrated audio lifecycle/device
   checks.
7. Re-run #194 seed-cohort play, #85/#88 integrated Contract/roster journeys,
   #209 device performance, and finally #171 fun/replayability after the child
   outcomes are stable.
8. Keep #98 deferred. Keep #201 open until every current ledger entry is
   separately repaired or explicitly dispositioned.

## Visual reference-versus-candidate packet

These are existing committed references; no new artwork or golden was made.
Candidate images are evidence for a decision, not authority.

| Decision | Reference and candidate attachments | Difference to inspect |
| --- | --- | --- |
| #197 Loadout/Equipment | Canonical Figma frames [Loadout 104:206](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=104-206) and [Equipment 104:268](https://www.figma.com/design/LHpXaKqFKksfF2uismDws5?node-id=104-268); candidate [phone comparison](../art/design-handoff-2026-10-09/review/equipment-comparison-grid-phone.png), [wide comparison](../art/design-handoff-2026-10-09/review/equipment-comparison-grid-wide.png), and [Gunsmith merge](../art/design-handoff-2026-10-09/review/gunsmith-merge-comparison-grid.png). | Candidate uses the real save/inventory and adds selected-preview/fixed-footer behavior; inspect scope labels, tier readability, scroll anchoring and whether the adaptive chrome still communicates the intended Figma hierarchy. |
| #198 type/tier | [Integration evidence](../art/issue-198-integration-evidence.md), [phone candidate grid](../art/design-handoff-2026-10-09/review/equipment-comparison-grid-phone.png), and [wide candidate grid](../art/design-handoff-2026-10-09/review/equipment-comparison-grid-wide.png). | T1–T4 structure is visible, but glove/helmet changes and small held-weapon differences are subtler than Armour; decide if type/tier is recognizable at actual use sizes and grayscale. |
| #199 base/composition prerequisite | [Current runtime Mercenary capture](../../browser-tests/visual-fidelity.pw.ts-snapshots/mercenary-phone-390x844-linux.png), [Tabby direction study](../art/design-handoff-2026-10-09/art/tabby-direction-study-v1.png), [Hound direction study](../art/design-handoff-2026-10-09/art/hound-direction-study-v2.png), and [composition study](../art/design-handoff-2026-10-09/art/composition-study-v2.png). | The runtime is a flat actor/weapon presentation; the studies show exploratory anatomy/direction/wearable composition. They are not approved masters. Jonathan must select topology/style before renderer implementation. |
| #200 pickups | [Pickup family exploration](../art/design-handoff-2026-10-09/art/pickup-family-exploration.png) and [current gameplay reference](evidence/issue-196/gameplay-phone-390x844-actual.png). | The exploration shows candidate XP/Scrap/cache silhouettes; the gameplay capture is a current-world baseline, not a pickup approval plate. A new exact-size runtime comparison over Junkyard and Forge floors is required after native pixels are supplied. |
| #196/#241 comprehension | Existing [phone actual](evidence/issue-196/gameplay-phone-390x844-actual.png), [expected](evidence/issue-196/gameplay-phone-390x844-expected.png), and [diff](evidence/issue-196/gameplay-phone-390x844-diff.png), plus [phone effect actual](evidence/issue-196/ability-effect-phone-390x844-actual.png) and [expected](evidence/issue-196/ability-effect-phone-390x844-expected.png). | Automated captures show the brief/HUD/effect layout and localized candidate deltas. They do not establish one-second recognition, audio-visual clarity, or physical-device usability. |

The R1 compact fine-pointer golden mismatch remains a stable renderer-era
comparison reproduced by unchanged base and candidate (`6,896` differing
pixels, ratio `0.03`); no replacement is proposed.

## Listening packet — #237

The exact R3 candidate is `33d010340ea000cc92e483586e488bf2063fc755`.
Candidate sources are explicitly `productionAccepted: false` and are not in the
public runtime map. Listen to these existing files directly:

- [menu audition](https://github.com/Joncallim/Meowcenary/blob/r3-issue-237-audio-review/assets-src/audio/music-menu/music-menu.audition.wav)
- [run audition](https://github.com/Joncallim/Meowcenary/blob/r3-issue-237-audio-review/assets-src/audio/music-run/music-run.audition.wav)
- [SFX audition directory](https://github.com/Joncallim/Meowcenary/tree/r3-issue-237-audio-review/assets-src/audio/sfx/auditions)
- [source/export measurements](https://github.com/Joncallim/Meowcenary/blob/r3-issue-237-audio-review/docs/delivery/issue-237-original-auditions-20261013.md)

Comparison tasks:

1. Loop menu and run tracks at least three times; judge seam, phrasing,
   contrast, fatigue and whether the run track supports dense combat without
   masking cues.
2. Audition every existing SFX key against the corresponding current public
   placeholder in `public/assets/audio/`, including weapon-family hits/fires,
   UI, level-up, damage, pickups, merge and terminal cues.
3. Repeat on mono phone speaker, headphones and low-volume playback. Check
   family identity, transient fatigue, masking, perceived loudness and mute /
   fade readability.
4. On a real phone, test unlock/autoplay refusal, pause/resume, background /
   foreground, Retry, win/loss, late mute/fade and loop recovery. Record phone,
   OS, browser, output route and exact candidate SHA.

No result from this packet authorizes adoption; Jonathan must explicitly choose
which source set, if any, becomes production audio.

## Physical-device checklist

Use a fresh save and record device/OS/browser, viewport orientation, candidate
SHA and whether the test used the public runtime or an approved candidate.
Serve a local candidate with `npm run dev -- --host 0.0.0.0`; do not use this
checklist as deployment evidence.

### R1 — `c6b4939e989cf1f5613cbc9fd72b8e704699f667`

- At 390×844 portrait and compact landscape, navigate Home → Loadout →
  Equipment → Gunsmith with touch, keyboard and controller.
- Equip/unequip, preview/cancel, fabricate/merge, failed-save/retry and warm
  return; confirm semantic focus, scroll anchor, fixed footer and no duplicate
  spend or stale committed preview.
- Repeat at desktop/landscape and DPR 3 where available; inspect tier/type
  readability and first-time-player explanation.

### R2 — `00545f27ff2314e1880ac106784f6fea888dc578`

- Toggle Ability Button Left/Right in Settings, start a fresh run, and verify
  the next-run card moves without changing the movement-stick ownership.
- Use two fingers: movement plus Ability, then ability plus pause/extract;
  release in both orders and repeat after resize/orientation/foreground return.
- Exercise all eight abilities in both biomes: brief before start, one
  activation, actual consequence, ready/active/cooling state, pause, Retry,
  terminal win/loss and reduced-motion mode.
- Reject the candidate if the ability is not identifiable within roughly one
  second or if a stale target/held input activates after rebuild.

### R3 — `33d010340ea000cc92e483586e488bf2063fc755`

- Treat the branch as an audition/source packet only: public runtime audio is
  unchanged. Complete the listening tasks above before any runtime adoption.
- If an approved source is later integrated, repeat unlock, mute/fade,
  background/foreground, Retry, endings, latency, loop and phone-speaker tests
  on the exact integrated SHA.

### Arena/Contracts and pickup follow-up

- For #194, record two different seeds and one repeated seed in Junkyard and
  Forge; verify collision-bearing variation, safe start, preserved objective,
  and deterministic Retry/Replay semantics.
- For #200, after approved native art exists, inspect XP/Scrap/cache and each
  weapon family/tier on both floors, in a moving magnet stream, dense cluster,
  blocked full-rack state and pool reuse. Confirm no collision, loot, RNG or
  Scavenge behavior changed.

## Jonathan’s decisions needed

1. Accept/reject the current #198 type/tier candidate at menu and held-weapon
   sizes, including grayscale.
2. Choose the approved base/direction/composition path for #191/#174/#175 and
   authorize the bounded #199 renderer/composite implementation only after that
   choice.
3. Supply or approve native #200 XP/Scrap/cache pixels and authorize the final
   actual-size pickup review.
4. Accept/reject the eight #241 FX sources and decide whether their resources
   may enter the production closure.
5. Accept/reject the #237 audition package after the listening/device session;
   separately authorize any public catalog/runtime cutover.
6. Choose the physical-device matrix and sign each manual result. Keep #201’s
   current defect entries open until their exact heads are individually
   resolved or explicitly dispositioned.

