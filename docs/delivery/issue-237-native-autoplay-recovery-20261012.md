# Issue #237: bounded native HTML5 autoplay recovery

12 October 2026. This slice builds on the four-file #239 lifecycle candidate
`848b23cf5b34ff8d337ec5a91a38ba4d00972f72`. Its original branch and protected
main are unchanged. The coordinator will replay the lifecycle foundation and
this fix onto current main before full closeout; focused evidence below is
from the allocated candidate worktree before that replay. No merge, deployment,
audio asset replacement, gameplay change or issue closure is claimed.

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
same-key retry, unlock-only retry and a stop/restart control. Every initial
attempt must have no prior activation, a genuine NotAllowedError, ready media
with no media error; every retry must be trusted. GREEN requires native playing
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
