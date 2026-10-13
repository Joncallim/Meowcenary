# Issue #237: bounded native HTML5 autoplay recovery

12 October 2026. This slice builds on the four-file #239 lifecycle candidate
`848b23cf5b34ff8d337ec5a91a38ba4d00972f72`. Its original branch and protected
main are unchanged. The coordinator replayed the lifecycle foundation onto
protected main `4f79d6210c3b028b995d67a5cc6e35318b17b2ee` as `f3113e5`,
then replayed this bounded fix. The four-file lifecycle patch is identical to
#239; newer #196 scene/input/resource owners remain intact. Focused evidence
below was captured before that replay; full closeout must use the final replayed
head. No merge, deployment, audio asset replacement, gameplay change or issue closure is claimed.

Authority: current #237 maintainer instructions and the genuine native RED
recorded in [#201 comment 6123407199](https://github.com/Joncallim/Meowcenary/issues/201#issuecomment-6123407199).
This resolves the native Promise-refusal limitation characterised in the #239
delivery note within this slice's scope. Its other lifecycle contracts remain.

## Contract and implementation

One game-scoped AudioManager still owns individual Phaser voices. Installed
Phaser 3.90.0 HTML5AudioSound marks a voice playing synchronously even when the
native HTMLAudioElement.play Promise later rejects. Its private
`playCatchPromise` only warns; neither Phaser PLAY nor a media error event
establishes successful native playback.

Each acquired HTML5 voice now receives an instance-local adapter at that method.
It calls the real tag play method exactly once, preserves the original warning
and rejection handler, and observes rejection. No global prototype, shared tag
method, backend choice, media error listener or native paused-state polling is
modified. WebAudio and NoAudio lack the method and retain their paths; legacy
no-Promise, synchronous throw and synchronous false starts retain compatibility.
The seam depends on installed Phaser 3.90 internals and must be revalidated on
an upgrade. It is restored on owned release or external destruction, removing
the instance closure while preserving any externally replaced method.

A rejection retires only the still-owned matching attempt and tag. A newer
resume/loop attempt, tag theft, intentional pause/tag release, replacement,
stop or destruction makes an earlier rejection stale. The warning still occurs.
An in-flight rejection during a terminal fade may retire its failed voice but
cannot resurrect terminal music. The latest requested key is tracked separately
from the retained playing identity. A known refusal preserves a retry key only
when that voice remains the latest non-terminal music intent. Every newer
playMusic call (including missing or locked keys), stop/fade and destroy clears
older failed retry state.

A later explicit same-key playMusic starts fresh after refusal. The existing
unlock surface retries known-failed latest music when Phaser already reports
unlocked, or the existing unlocked event flushes it after normal lock handling.
There is no immediate retry or queued SFX. Retained same-key loops remain a
no-op. Live gain/mute, fades, blur queues, tag theft, cooldowns and owned cleanup
retain the #239 boundaries. SFX cooldown continues to use synchronous Phaser
acceptance; asynchronous refusal does not roll back an accepted cue's cooldown.

## Executable evidence and validation

Dedicated local/hosted gate (Node 22, installed dependencies and Chromium):

```sh
node scripts/check-audio-native-autoplay.mjs --output test-results/audio-native-autoplay.json
```

CI runs this named gate after browser installation, before ordinary viewport
and touch acceptance. The report directory is created explicitly on a fresh
checkout; the existing failed-browser artifact step also captures native gate
failures. Operational failure reports retain partial browser/server facts when
available; failed assertions write the complete report and return nonzero.

The gate serves only an ephemeral loopback page, actual installed HTML5 Phaser
classes and the existing four-second menu WAV. It neither patches native media
nor invents success. The parser-loaded module attempts playback before the
driver performs any page evaluation, polling or click. Initial and final facts
are POSTed to its bounded local endpoint. Separate fresh contexts cover explicit
same-key retry, unlock-only retry and a stop/restart control. Before the parser's managed play attempt, a bounded loadeddata/canplay readiness
wait is subscribed before loading; readiness and activation are captured at the
actual attempt. After refusal cleanup, the gate re-awaits media readiness before
its initial snapshot, since seeking/release may change readiness. Both waits
retain the 15-second bound and use media events, without driver evaluation or
policy gestures. Every initial attempt must have no prior activation, a genuine
NotAllowedError, ready media with no media error; every retry must be trusted. GREEN requires native playing
and positive clock advancement, latest key and one retained voice after cleanup;
the refused initial voice must already be removed. Source/committed hashes,
HEAD, dirty status, browser/policy, native events, warnings, trusted clicks and
handle counts are saved. Native clock evidence does not establish audibility.

`--expect-red` characterises the older #239 runtime: same-key and unlock-only
remain paused at time zero while the separate reset control plays. The same
final executable was copied into a detached #239 evidence worktree for RED;
that runtime's tracked source and WAV match its exact HEAD. No original #239
branch or files were edited.

External evidence is under
`/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/`:

- `audio237-recovery-focused-red.txt`: 1 failed / 28 skipped before the fix,
  demonstrating that native refusal retained a latched voice.
- `audio237-recovery-native-red-final-harness.json`: native RED on exact #239
  source with the final committed gate; same-key/unlock-only paused/time zero,
  separate control positive clock; no page errors.
- `audio237-recovery-native-required-green-red.json`: the default CI GREEN
  mode exits 1 on that same exact pre-fix runtime, proving the executable gate
  detects the regression rather than only describing it.
- `audio237-recovery-native-green.json`: actual native GREEN; both recovery
  surfaces and the separate control advance with one voice and no page errors.
- `audio237-recovery-fresh-output/audio237-recovery-native-green.json`:
  successful creation/use of a previously absent output directory.
- `audio237-recovery-focused-green.txt`: direct focused Vitest run of
  audioManager and installed-Phaser lifecycle files, 99 tests / 2 files pass.
- `audio237-recovery-lint.txt`: npm run lint passes. git diff --check passes.

Deferred unit cases cover refusal/repeated refusal, pending same-key intent,
latest missing/locked intent, terminal stop/fade/destroy, external destruction,
replacement, mute/gain, restoration, tag theft, newer attempt settlement and
normal blur/focus with stale pre-blur rejection. An intermediate new blur test
failed because it incorrectly expected the old attempt to survive Phaser's
intentional tag release; installed source showed that callback must be stale.
The corrected test preserves ordinary paused-voice resumption. That intermediate
95/96 result was a test expectation correction, separate from genuine native RED.

## Independent review follow-up (12 October)

The independent architecture/adversarial review of replayed `7c475eed` requested
changes for two P2 findings. Both are corrected in this follow-up; a fresh
independent verdict remains required. No PASS or full-closeout claim is made.

A locked pending A survived a newer missing request; the same stale pending
problem also followed refused A → locked B → missing. Two new installed-Phaser
regressions failed before the correction (2 failed / 47 skipped), saved in
`audio237-recovery-review-pending-red.log`. Clearing pending intent before the
missing-asset check fixes both, while the valid pending/current same-key no-op
branches remain above that clear. Focused GREEN is now 101 tests / 2 files
(`audio237-recovery-review-focused-green.log`); lint passes
(`audio237-recovery-review-lint.log`), as do syntax and diff checks.

The old gate admitted loadedmetadata but later asserted loaded data. The
reviewer's raw failed report is retained unchanged as
`audio237-recovery-review-old-readiness-flake.json`: initial same-key readiness
was 1, despite all trusted retries playing with positive clocks and one voice.
Three additional untouched old-gate attempts passed
(`audio237-recovery-review-old-readiness-{1,2,3}.json`); this was intermittent,
and those passes do not invalidate the observed false failure. The corrected
gate waits for actual loadeddata/canplay readiness before attempting and after
cleanup, preserves the later readyState/error assertions, and additionally
asserts readiness at the actual attempt. No policy, native playback, handle
count or clock assertion is removed, and no deadline is increased.

Three separate concurrent corrected-gate runs pass all nine scenarios, saved as
`audio237-recovery-review-native-green-{1,2,3}.json`; attempt and post-cleanup
readyState are 4, prior activation is absent and every trusted retry advances.
This is three-run evidence, not a claim that a timing issue can never recur.
The same final executable copied into the detached exact-848 evidence worktree
still fails default GREEN with native refusal and silent same-key/unlock retry
(`audio237-recovery-review-native-required-green-red.json`, exit 1). Original
#239 branch/source and #245 remain untouched. The former in-flight full check
was stopped and invalidated before these edits; it supplies no full validation
claim. Full closeout remains pending after fresh independent review.

## Remaining acceptance and review

Full repository tests/build and current-main integration, independent review,
exact candidate hosted CI and all broader #237 product gates remain pending
coordinator closeout. Focused Vitest here intentionally does not claim the full
repository runner, allocation gates or runner self-audits were executed.

This gate explicitly selects HTML5 in a minimal cache/scene harness; it does
not exercise the game loader/default backend journey or establish a WebAudio
policy issue. Real phone touch, physical keyboard/controller parity, Safari and
other engines, app/tab interruption and acoustic/listening quality remain
unverified. The existing scene hook is one-shot: a refusal occurring after that
hook was consumed can recover through later explicit playMusic/unlock calls,
but this slice does not promise that every later gesture invokes those calls.
No new scene/input subscriptions are introduced.

Independent review should inspect adapter/version compatibility, native Promise
handler containment and restoration, identity/attempt/tag guards, terminal and
latest-intent invalidation, reentrant teardown, SFX non-retry, existing blur/gain
semantics and whether the native gate can falsely report success or skip CI.
