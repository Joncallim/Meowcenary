# Issue #237: bounded owned voice admission

Held candidate from protected main `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`,
through the exact hosted-green #247 recovery `0325eb2c630b7591722d04b22933a2af7db471e0`.
No merge/deployment or #237 closure is authorised. Main/public production stay unchanged.

## Reconciliation and observed missing policy

Issue #237 explicitly requires semantic priority and bounded retained handles/voices
before longer assets. The current manager is game-scoped and has correct per-key
cooldowns, optional loading, live volume/mute, owned teardown, and the held #247 native
refusal/latest-intent corrections. Preserve those owners. The old Epic 10 documents
freeze placeholder wiring, not the newer #237 production-audio budget requirement.

A bounded synthetic probe of the actual manager at `0325eb2` admitted all 256
zero-cooldown one-shots. Replacing music 256 times left one playing voice and 255
pending-removal handles before Phaser's sweep, one afterward. That is missing
admission policy, **not** evidence of typical gameplay concurrency, audible overload,
or a new #201 ordinary-runtime defect. The external probe retains raw before/after
counts and reproducible tests.

## Small owning-boundary policy

`RuntimeConfig.performance` declares safety ceilings of **32 concurrent owned SFX**
(including paused tails and failed retirement) and **64 total retained owned handles**
(including current/inactive music, deferred removal, and in-flight acquisition).
These finite engineering limits are not a desired audible mix, phone approval,
decoded-memory budget, or package-size claim.

Validated `AudioMapEntry.priority` uses `combat < feedback < alert < terminal`,
with absent priority/default direct callers treated as feedback. Family keys inherit
one row's priority, just as they inherit cooldown. The shipped data assigns repeated
combat/pickups combat, UI/progression feedback, player damage alert, and result cues
terminal. Existing keys, cooldown values, family/tier multipliers and event payloads
remain unchanged. No gameplay, rewards, save, RNG or scene changes.

Below saturation, behaviour is unchanged. At 32 SFX, equal/lower priority is dropped;
a strictly higher priority retires the oldest voice at the lowest eligible priority.
Music is never a priority victim. Admission reservations cover synchronous backend
add/play/retirement callbacks. Rejecting a request consumes no cooldown and creates
no queued SFX.

Completion and priority retirement use Phaser's ordinary deferred destruction,
including requests made from within a sound-update callback. They never splice the
backend iteration. The retained set is pruned only after actual absence from Phaser's
`sounds` array or an acknowledged owned failed-start removal; a released-but-still-
playing/paused handle remains charged when optional teardown fails. At 64 retained
handles no new SFX is allocated, even when priority is higher.

Music acquires its inactive prospective handle before retiring the current loop,
so reentrant callbacks cannot steal its last slot. At the ceiling, keep the current
loop and retain only the latest pending music key. Existing update/unlock paths clear
that pending key before retry, avoiding the same-key no-op latch. A newer missing
request, same-current intent, stop or teardown invalidates it. Failed old-loop
retirement cannot admit another audible loop; the latest intent waits for removal.
No additional queue, listener, timer, source pool or adaptive stem engine.

## Regression evidence

- Baseline focused suite: **12 RED / 199 passed**, including finite SFX/retained
  admission, semantic priority validation, sweep recovery and reentrant callbacks.
- A further conservative music-retirement regression was **1 RED** before the
  owning guard: a backend throwing before stop must not permit a second audible loop.
- Independent review added **1 RED** for reservation handoff: a result cue
  requested synchronously while the 32nd combat voice starts must replace one
  combat voice and remain admitted. Transfer reservation to retained ownership
  before start callbacks; never double-charge the published voice.
- Focused coverage includes equal-priority rejection, oldest/lowest priority,
  inherited family priority, paused tails, mute/lock/no replay, unchanged cooldowns,
  backend-add failure, reentrant add/retirement, last-slot music replacement,
  latest pending intent and dead-manager callbacks.
- Installed Phaser 3.90 WebAudio/HTML5 objects prove finite retained counts and
  actual backend-sweep recovery. A priority cue requested inside real
  `BaseSoundManager.update` must still visit all 32 original sounds in order.
- Full exact-head local/hosted gates and independent adversarial review are
  **pending**, and are reported separately when completed. No test timeout,
  assertion, retry, scope, skip, screenshot or threshold has been relaxed.

## Remaining issue acceptance

No new audio assets, cache eviction or longer audio is shipped here. Explicit bounded
music/SFX/ambience resource closures and decoded cache budgets are still required
before production-length assets; current menu/run lazy closures remain intact.
Original editable production sources, loop-safe composition, mono/phone-speaker
listening, low-fatigue mix and latency, real-device interruption and optional/default
backend acceptance remain #237 gates. This candidate does not close them.
