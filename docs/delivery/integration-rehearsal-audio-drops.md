# Held audio and pickup integration rehearsal

This disposable branch integrates three individually machine-green candidates, in order: Contracts/Progression/Arena rehearsal #249 `f7521fe67859a881bb8b4a5ac748e97a94e5f568`, audio lifecycle #247 `0325eb2c630b7591722d04b22933a2af7db471e0`, and pooled pickup presentation #246 `9486b0264f59ed90d3b69a15f5eebfc4e5a4fef4`. It is independent of #250's unresolved Menu gesture deadline and contains no compact Menu changes. It is not authorised for merge or deployment. Main/public production remains `4f79d621`; #233 release hold and original #242/#231 heads remain unchanged.

## Reconciliation

The full #247 delta includes #239's audio lifecycle changes exactly once: retained music ownership, pause/mute/fades/unlock behavior, native HTML5 refusal recovery and latest pending music intent. #249 did not already contain those audio changes; actual file content was compared as well as ancestry. The only text conflict was CI. Both newer Linux Noto fallback validation and the native HTML5 autoplay recovery step are retained, including failure-artifact admission for either browser gate. No old workflow or shared production file replaced a newer one wholesale.

#246 merged text-cleanly, but `src/main.ts` and `src/scenes/GameScene.ts` remain semantic review boundaries. Gameplay receives the same immutable run request/layout, selected resource closure and Drop physics configuration. The pooled Drop owner resolves the exact weapon definition's tier icon and retains one reusable sprite plus bounded glint. Stopped animation metadata cannot rewind a reused static pickup during diagnostic freeze. No consumed drop/loot, reward, cooldown, targeting, balance, save-ID or RNG semantics changed. The #229 Scavenge transaction and scene-owned objective-clear physics capture remain authoritative.

Inherited owning corrections retain their original RED evidence: #247 native audio refusal/stale music intent; #246 PistolT1→reset→ShotgunT3→blocked→unblocked→reset→Scrap view reuse; #249 failed terminal Replay frontier and abandoned Home-art preparation. This tranche introduces no new claimed gameplay defect and does not promote test observer or authored-source findings into #201.

## Acceptance contract

Focused integration executes actual owners for audio/resources, pooled Drop view/system, Menu preparation, intro, abilities, pending/terminal clear, Arena resource/layout and progression: 551 tests across15 files passed with zero skips at integrated code head `47b7f59`. Independent source/state/resource review must match final source hashes. The exact final head requires the complete ordinary suite, nine allocation gates, nine runner probes, lint/typecheck, content, complete art/source/export, ordinary production/resource identity/diagnostic exclusion, strict browser modules, diff check, native HTML5 recovery and supported six-profile hosted browser suite. Individual candidate green runs do not certify this combined tree.

The existing integration matrix remains mandatory: touch/pointer, keyboard and controller; both biomes; normal and failed preparation; same-request Retry versus fresh-seed terminal Replay; neutral terminal/Menu exits; warm resource return; save failure and shutdown/resource cancellation. Existing six native pooled-view cases and native autoplay probes remain active, without changed budgets/retries/skips/assertions/thresholds/goldens.

## Preparation evidence amendment

Head `375a78e` hosted run [38351403202](https://github.com/Joncallim/Meowcenary/actions/runs/38351403202) finished RED: 756 passed, 64 existing scoped skips, two desktop1920 touch terminal-return screenshot deadlines. Both rows had already asserted trusted release, neutral Menu and two warm-idle receipts. The native HTML5 recovery gate passed. Independent review found no dropped warm-idle receipt or runtime resource-closure defect. Original two-row local timing evidence passed at 17.61/18.02 seconds with final screenshots taking 0.94/0.96 seconds; those isolated results do not explain or clear the hosted failure.

A separate actual-helper regression reproduced false certification at the final preparation frame: the observer could return its original layout after the intro seed, layout hash or run-start count changed, provided time stayed zero and durable save stayed unchanged. Baseline: eight passed, three RED; the corrected actual helper passes all eleven. This is an evidence-owner defect, not a reproduced gameplay defect or a #201 entry.

Initial intro and Arena facts now share one read. The same original final input frame remains mandatory; only after strict successful completion does one read capture intro, Arena and durable save. Every earlier predicate remains, with additional final intro/identity/layout checks. This removes three redundant renderer transports without removing any owner frame, physical event, screenshot or assertion. No runtime, touch helper, capture, timeout, retry, skip, threshold or golden changes. A passive native-touch correlation probe also rejected reusing an earlier release frame: those early receipts were not yet accepted.

The corrected head still requires complete exact-head gates and the full hosted matrix. No timing improvement or repair of the hosted screenshot deadline is inferred from the added guard or the local probes.

## Remaining gates

This does not adopt the unapproved original audio source candidates, claim listening quality or establish a mobile audio backend. It does not supply new canonical XP/Scrap/Chest artwork, approve pickup readability in crowded combat, or close #200/#237. Synthetic terminal fixtures prove navigation/ownership, not a genuine campaign clear/reward/pacing playthrough. Physical-device, visual, listening and product acceptance remain outstanding. #85/#171/#194/#201/#233 and all relevant art/actor umbrellas remain open. No #250 readiness or performance improvement is inferred from this independent rehearsal.
