# #237: audio ownership hardening, 10 October 2026

## Bounded contract

This is the first runtime slice of the requested end-to-end audio work. It
supersedes only the historical stop-only disposal and deferred live-gain
behavior in [Epic 10 audio](../architecture/epic-10-audio.md). Current assets,
content keys, event payloads, save/settings and scene ownership are unchanged.
No sound production, paid generation, new semantic cues or mixing policy is
included.

- The existing Boot-owned singleton owns every handle it creates. Scenes
  remain non-owning references; no global stop/remove operation is used.
- SFX use `add` + owned lifecycle instead of fire-and-forget `sound.play`.
  Active voices retain their existing family/tier multiplier and follow live
  SFX gain. Mute retires current one-shot tails so unmute cannot revive them.
  Existing per-key cooldown gates are unchanged; synchronously rejected playback consumes no
  cooldown. Volume zero remains a valid playback request.
- Every music stop clears deferred intent, including a terminal stop while
  autoplay is locked. Only the latest surviving music request may flush.
- Replacement, fade completion, natural completion and teardown release
  owned voices. Completion/destroy listeners detach before own destruction;
  callbacks are idempotent and identity-checked, so obsolete completion cannot
  clear a replacement. External destruction only relinquishes ownership.
- A music-intent generation covers public play, stop and teardown. Recheck it
  after synchronous backend callbacks so an older replacement cannot overwrite
  newer intent or create a loop after teardown. Internal cleanup is not a new
  intent; a newer fade may continue to own the same handle.
- Retiring an owned HTML5 handle also removes that identity from Phaser 3.90's
  private blur-resume queue before destruction. Engine blur/focus listeners and
  all unrelated paused sounds stay intact. Real-manager tests pin this narrow
  version-specific adapter; recheck it when upgrading Phaser.
- Music volume is current user gain multiplied by an update-driven envelope.
  Gain changes apply during fades, including zero gain and repeated fades.
- HTML5 tag stealing can reset a voice without a completion event. The normal
  manager update reaps stopped, unpaused voices. Paused voices are preserved;
  Phaser still owns autoplay, blur/focus and browser interruption handling.
- Synchronous add/start errors and false starts fail silently and may retry on a later
  valid request. Failed handles use immediate per-handle removal because
  NoAudio has no sound-update sweep. Ordinary completion calls destroy and
  lets Phaser remove its pending handle on the next tick, avoiding splicing
  the manager's active iteration.

## Primary API evidence

Inspected the installed Phaser 3.90 source, also available upstream:

- [BaseSoundManager](https://github.com/phaserjs/phaser/blob/v3.90.0/src/sound/BaseSoundManager.js):
  `play` adds a handle and destroys it on completion; `update` removes
  pending handles before iterating active sounds; `remove` destroys one handle.
- [BaseSound](https://github.com/phaserjs/phaser/blob/v3.90.0/src/sound/BaseSound.js):
  `destroy` stops synchronously, emits destroy, then sets pending removal.
- [HTML5AudioSound](https://github.com/phaserjs/phaser/blob/v3.90.0/src/sound/html5/HTML5AudioSound.js):
  tag stealing resets the previous voice without a completion event; start
  can return false. Its internal play-promise rejection handling is unchanged.
- [WebAudioSound](https://github.com/phaserjs/phaser/blob/v3.90.0/src/sound/webaudio/WebAudioSound.js)
  and [NoAudioSoundManager](https://github.com/phaserjs/phaser/blob/v3.90.0/src/sound/noaudio/NoAudioSoundManager.js):
  backend release and silent-failure behavior verified in focused tests.

## Changes and evidence

Changed paths:

- `src/systems/audio.ts`
- `tests/audioManager.test.ts`
- `tests/audioPhaserLifecycle.test.ts` (new)
- this delivery record (new)

Baseline source checkout: `b226c55f222100f188432aa416be90cf46fa3c08`;
other work streams already had unrelated uncommitted edits. The implementation
worker made no commit, push, PR, merge, deployment, asset or dependency change.
The coordinator's isolated draft preparation is recorded below.

RED: original 38 manager tests passed. Expanded lifecycle tests then failed
13 assertions against unchanged runtime source, reproducing active-SFX gain,
locked stop, retention, gain-during-fade, stale ownership and failed-start gaps.

Independent review found two additional P2 defects: disposing blur-paused HTML5
voices left a stale engine resume queue entry; synchronous stop/destroy
callbacks could supersede a replacement and orphan a loop. A second RED run
failed 10 tests against the frozen first implementation. The ownership fixes
and full HTML5-manager regressions now pass, including unrelated paused-handle
preservation, normal focus resumption, nested play/stop/teardown, add/play
callbacks, stopped-voice reaping and a newer fade on the same voice.

GREEN: final focused run passed **114 tests in 5 files**:

- audioManager: 52
- audioPhaserLifecycle: 29
- audioResources: 8
- gameSceneAudio: 19
- cooldown: 6

The backend tests import the installed real Phaser WebAudioSound,
HTML5AudioSound, full HTML5AudioSoundManager and NoAudioSoundManager modules
with stub browser audio nodes/tags. They verify real disposal, completion iteration, NoAudio retention,
HTML5 tag exhaustion/stealing, WebAudio start failure and external destruction.
These are API/lifecycle tests, not audible browser/device acceptance.

Commands (Node 22, no emitted build):

```sh
node node_modules/vitest/vitest.mjs run \
  tests/audioPhaserLifecycle.test.ts tests/audioManager.test.ts \
  tests/audioResources.test.ts tests/gameSceneAudio.test.ts \
  tests/cooldown.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
git diff --check -- src/systems/audio.ts tests/audioManager.test.ts \
  tests/audioPhaserLifecycle.test.ts docs/delivery/issue-237-audio-lifecycle-20261010.md
```

## Remaining gates and later #237 slices

Full repository test runner/allocation gate, build and asset gates were not
run: this cloud workspace must preserve a strict 1 GiB free-space reserve.
Browser acceptance was already blocked; no browser was launched or security
restriction bypassed. Desktop/mobile listening, autoplay refusal, background
interruption and actual audio-device behavior remain unverified. In particular,
Phaser's HTML5 promise-based playback denial cannot be inferred from its
synchronous play return value. A characterization test confirms that a rejected
tag play promise leaves Phaser reporting isPlaying=true, the tag actually
paused, and same-key music intent latched. Phaser logs the rejection but exposes
no failure event here. No promise interception, paused-state guess, automatic
retry or autoplay override was added. Fixing this safely and verifying actual
playback/refusal recovery remains a later audio acceptance requirement; the
successful-start/cooldown guarantee here covers synchronous backend results only.

Keep the current short assets until production validation and listening gates
are ready. Future slices own voice budgets/priorities, cue variants/coalescing,
pause/terminal-run semantic policy, stage loading/cache budgets, production
formats/provenance and replacement music/effects. This slice adds no global
voice cap or new event/schema assumptions. The full audio redesign is not
complete and this record is not a release certification.

## Coordinator isolation and independent recheck

The reviewed four-file slice was isolated onto verified current remote main
`a100e053ce4e2bc48bc4b8844e7da5010d562096`, on
`codex/redesign-audio-20261010`. No Contracts, progression, arena, sprite or
PR #238 changes are included. The source-only verification worktree contains
about 5.6 MiB in temporary storage; authoritative commits remain in the durable
shared Git store. Preserved restoration archives and worktrees were unchanged.

Independent recheck gives a qualified pass for this lifecycle slice: both
reported P2 defects were reproduced as fixed, unrelated paused handles and newer
music intent were preserved, and all 114 focused tests passed independently.
The coordinator reran TypeScript, the same 114 tests and diff checks on the
isolated main-based candidate, all passing. The reviewed and isolated audio
source SHA-256 is
`07e5f9ad25a29820fd96d7e51e058b1bb6c53c7616d5b10ee6a1152ebdee5b08`.

Full repository/allocation/build/art and Playwright checks await exact-head
hosted CI. The local disk reserve and browser blocker remain in force. This is
only the first #237 engineering slice, not completion of music/SFX production
or listening, autoplay/refusal, phone or controller acceptance. Draft only;
no merge or deployment is authorized.
