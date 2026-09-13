# Alpha 3 Mobile Acceptance Follow-up

**Status:** implementation-ready planning authority for the next stacked mobile remediation tranche.

**Reviewed baseline:** PR #176 head `19622aa01dfb50ed172037c6184770a20d5ff3b5` (`codex/ability-gunsmith-progression`).

**Deployment truth:** the baseline above remains the current acceptance candidate. This document does not advance or redefine that deployed SHA.

**Delivery shape:** implement in a new PR stacked on PR #176. Do not add runtime work to PR #176 after its exact-SHA device evidence has begun.

## 1. Findings and product decisions

Real-device testing on the reviewed baseline found four presentation/lifecycle gaps:

1. completed-run Achievements show badges, but `Home -> Career -> Achievements` does not reliably present the same badge identity;
2. `Play Contract` can spend noticeable time preparing run resources without a blocking loading state, while unrelated menu actions remain usable;
3. named active abilities work mechanically, but activation/effect state is not visually legible enough to teach what the ability actually did;
4. phone landscape breaks the intended layout.

The product decisions are:

- Achievement identity is one semantic presentation contract. Career and terminal surfaces may lay it out differently, but must resolve the same badge binding.
- Run preparation is a modal transition. Once accepted, the captured run request cannot compete with further menu mutations until it succeeds or fails.
- Ability visuals are presentation-only feedback driven by successful authoritative ability state transitions. They must not create gameplay truth.
- Meowcenary remains a portrait-first phone game. Do **not** build a second landscape gameplay layout in this tranche. Coarse-pointer landscape is blocked by a rotate-device guard; desktop landscape remains supported through the existing fitted portrait canvas.
- No Save V4 schema change is required.
- #87 remains open for assembled-weapon visual engineering. Do not fold that separate art system into this tranche.

Inherit `alpha-3-shared-foundation.md`, `alpha-3-content-extensibility-contract.md`, `../ai-workflow.md`, and `../../AGENTS.md`.

## 2. Baseline evidence

The current code already contains useful seams; extend them rather than replacing them.

### 2.1 Contract loading

`MenuScene` already owns:

```ts
runLaunchState: 'idle' | 'loading' | 'failed'
```

and `startRunWithResources()` sets `loading`, rerenders, resolves the physical run-resource closure, awaits `prepareRunPresentation()`, then starts `GameScene`.

The defect is presentation/input ownership: Home still looks substantially interactive while `loading`, and the accepted request was captured before the asynchronous load. Treat this as a transition-state correctness issue, not merely a spinner request.

### 2.2 Achievement badges

`renderAchievements()` already receives `achievement.iconArtId`, calls `addCatalogIcon()`, and invokes `ensureAchievementPresentation()`. The runtime result nevertheless differs from terminal presentation.

Do not guess the root cause. First reproduce on the exact baseline and inspect:

- whether the logical binding exists;
- whether its physical resource is already loaded;
- whether the lazy load succeeds;
- whether the post-load rerender occurs while the Achievements panel is still committed;
- whether the image is created but hidden/clipped/positioned incorrectly.

The repair should preserve one logical badge identity rather than creating a second Career-only art catalog.

### 2.3 Ability state

`abilities.json` owns the eight current mechanics and descriptions. `gameplay/abilities.ts` owns deterministic activation/timing/effects. `GameScene` applies the effect only after `activateAbility(...).fired === true`.

There is no corresponding ability-presentation contract in `GameEventMap`, and the existing `FeedbackSystem` does not subscribe to ability activation/end state.

### 2.4 Orientation

The authored canvas is `390 x 844` and Phaser uses `FIT` + `CENTER_BOTH`. The root container still fills the device viewport. `ui/layout.ts` intentionally converts physical hit targets through the current fitted display scale, so a phone rotated to a very short landscape display can produce extreme logical UI sizing even though the authored canvas itself remains portrait.

Hide that unsupported phone state instead of maintaining a second layout system.

## 3. Slice A — modal run-loading transition

Implement this first because it currently permits stale/conflicting menu interaction during an asynchronous launch.

### 3.1 State model

Keep `runLaunchState` as the one Menu-owned launch state. Do not add parallel booleans such as `isBusy`, `launching`, or `resourcesPending`.

Introduce an immutable presentation snapshot where useful:

```ts
interface RunLaunchPresentation {
  readonly state: 'idle' | 'loading' | 'failed';
  readonly contractName?: string;
  readonly mercenaryName?: string;
  readonly completedResources?: number;
  readonly totalResources?: number;
  readonly failureMessage?: string;
}
```

The state is presentation only. The already-captured `ComposedRunRequest` remains the authoritative request for that attempt.

### 3.2 Loading UI

On the first accepted `Play Contract` or Training launch:

1. capture the request once;
2. set `runLaunchState = 'loading'` before any await;
3. render a full menu-covering modal layer;
4. make the layer own pointer input;
5. reject keyboard/controller/menu navigation while loading;
6. load/validate the exact physical resource closure;
7. start GameScene exactly once on success;
8. return to a usable failed state on failure.

Target copy:

```text
PREPARING CONTRACT
First Scavenge
Scrap Tabby

Loading 8 / 13
```

A truthful resource count is preferred. Extend `loadTextureResources()` with an optional progress callback if needed; the callback must count the deduplicated physical resources that this invocation actually owns. Cached resources may count as already complete. Do not manufacture a percentage from elapsed time.

Do not impose a minimum display time. A cached launch may transition immediately.

Reduced-motion mode may use static text/progress rather than an animated spinner.

### 3.3 Input/lifecycle gate

All Menu input funnels must fail closed while loading:

- pointer button callbacks;
- Back;
- Confirm;
- directional focus navigation;
- wheel/touch scrolling where it could expose/activate old controls.

The modal backdrop should consume pointer gestures, but do not rely on that alone: keyboard and gamepad paths also need the same state gate.

Protect against stale async completion. If the scene shuts down or another launch generation supersedes the attempt, its promise completion must not start GameScene or rerender a dead MenuScene.

### 3.4 Failure state

Failure returns to the Menu with an explicit recovery surface:

```text
COULDN'T PREPARE CONTRACT
Retry
Back
```

Do not expose raw loader/resource IDs to players. Preserve details for development logging/tests.

### 3.5 Required tests

Add focused regressions for:

- loading state commits synchronously before the first await;
- double touch, touch+keyboard, and repeated Confirm start one attempt only;
- all non-launch menu actions are rejected while loading;
- captured character/stage/loadout request cannot change under the loading attempt;
- truthful 0/N -> N/N resource progress with cached and uncached resources;
- resource failure returns to retryable failed state;
- retry creates one new attempt;
- successful transition starts GameScene exactly once;
- scene shutdown during loading ignores late success/failure callbacks;
- resize/orientation events during loading cannot resurrect underlying buttons;
- Training inherits the same loader gate without changing its no-progression contract.

## 4. Slice B — Achievement badge parity

Implement after the launch-state gate; this should remain a small presentation repair.

### 4.1 Reproduce before refactor

Automate the real route where possible:

```text
fresh MenuScene
-> Career
-> Achievements
-> lazy presentation completion
```

Assert badge texture/binding presence for visible entries after the load settles.

Also reproduce after returning from a run so globally cached textures are covered separately from cold menu loading.

### 4.2 Shared semantic resolver

Career and terminal surfaces must resolve the same:

```text
AchievementDefinition.presentation.iconArtId
    -> validated VisualArt binding
    -> physical texture/frame
```

If current code duplicates this resolution, extract the smallest shared resolver. Do **not** force the two views to share Phaser layout objects or one monolithic renderer.

Hidden Achievements continue to use the established generic hidden badge behavior; do not leak hidden identity through its icon.

### 4.3 Failure behavior

Missing/failed optional presentation must leave the textual Achievement entry usable and focusable. A missing icon must never make an Achievement impossible to inspect.

### 4.4 Required tests

Cover:

- cold Home -> Career -> Achievements loads and renders badges;
- post-run Career uses the same logical badge identity as terminal results;
- hidden Achievement uses generic badge semantics;
- 40 synthetic Achievements remain scrollable and badge-aligned;
- leaving the panel before lazy completion cannot resurrect the Achievements tree;
- re-entry after a failed optional load remains retry-safe;
- resize/rerender produces one badge per visible card, no stale images;
- text/focus remains usable when one icon resource is unavailable.

## 5. Slice C — ability visual feedback

This slice teaches the ability through visible effects without changing any ability mechanics, cooldowns, damage, healing, movement, invulnerability, collection radius, or stat modifiers.

### 5.1 Architecture

Do not draw ability FX directly inside `GameScene.activateCharacterAbility()`.

Add a small registered presentation vocabulary to `AbilityDefinition`, validated from data. Example shape:

```ts
type AbilityPresentationCue =
  | 'shockwave'
  | 'overclock-aura'
  | 'shield-aura'
  | 'heal-burst'
  | 'speed-trail'
  | 'heat-ring'
  | 'loot-pulse'
  | 'precision-mark';

interface AbilityPresentationDefinition {
  readonly cue: AbilityPresentationCue;
  readonly color: string;
  readonly radius?: number;
}
```

The exact finite vocabulary may be adjusted during implementation, but it must remain mechanic/content-ID independent: runtime code switches on registered cue kinds, never `ability:scrap-burst` or character IDs.

Add authoritative presentation facts only after successful activation, for example:

```ts
'ability:activated': {
  abilityId: string;
  cue: AbilityPresentationCue;
  x: number;
  y: number;
  durationMs: number;
  radius?: number;
}

'ability:ended': {
  abilityId: string;
}
```

`ability:ended` should come from the same active -> non-active transition that expires authoritative stat effects. Do not run a second gameplay timer to decide when the visual effect ends.

### 5.2 Presentation owner

Prefer a dedicated Phaser-aware `AbilityPresentationSystem` if sustained player-following effects would make `FeedbackSystem` assume player ownership. It may reuse the existing pooling/motion primitives, but scenes remain composition-only.

Requirements:

- presentation subscribes to successful ability facts;
- instantaneous cues are pooled/bounded;
- sustained cues follow the player without changing physics/collision;
- visual time freezes whenever authoritative run simulation is frozen;
- reduced motion substitutes lower-motion cues rather than removing all feedback;
- shutdown destroys all live/pool-owned objects and unsubscribes listeners.

### 5.3 Initial cue intent

The eight current abilities should read distinctly at phone size:

| Ability | Required visual read |
|---|---|
| Scrap Burst | expanding impact/shock ring around the Mercenary; nearby knockback is easy to associate with it |
| Overclock | sustained energized aura + restrained rapid-fire treatment while active |
| Shield Flicker | unmistakable shield/bubble around the player for the invulnerable interval |
| Giga Chomp | immediate bite/heal burst plus visible positive-health feedback |
| Adrenaline | player speed trail/afterimage while active |
| Heat Vent | fiery radial ring/burst matching the damage radius |
| Scavenge Pulse | expanding magnetic pulse; existing pickup movement remains the gameplay truth |
| Precision Mark | precision/targeting aura and restrained projectile treatment while active |

Colors are presentation data and must retain non-color cues. Do not make FIRE vs shield vs precision distinguishable only by hue.

### 5.4 Teaching line

At run start, or the first time the selected Mercenary's ability becomes relevant in that run, show one short temporary semantic hint using the existing ability description, e.g.:

```text
SCRAP BURST — knocks nearby enemies back
```

Do not add a permanent explanatory paragraph to the combat HUD.

### 5.5 Required tests

Cover:

- every production ability validates a presentation cue;
- a synthetic ninth ability using an existing cue requires data only;
- rejected cooldown activation emits no activation presentation;
- successful activation emits exactly once;
- duration-zero abilities do not leak a sustained effect;
- active -> cooling emits/cleans up exactly once;
- pause/level-up/pending-clear freeze visual lifetime consistently with simulation;
- reduced-motion presentation remains visible and informative;
- ability FX never mutate health, stats, enemy state, pickups, collision, RNG, cooldown, or save state;
- FX object allocation remains bounded under repeated activations;
- restart/shutdown clears prior ability visuals;
- movement + second-finger ability activation remains unchanged.

Run `npm run art:validate` only if new logical/physical art resources are added. Geometry-based FX alone should not invent unnecessary art assets.

## 6. Slice D — portrait-only phone orientation guard

This is a support boundary, not a landscape redesign.

### 6.1 Detection

Add a small platform adapter under `src/platform/` that exposes whether portrait is currently required but unavailable.

Use browser media/query/viewport evidence rather than content-scene heuristics. The intended product rule is approximately:

```text
coarse primary pointer + viewport width > viewport height
    => portrait blocked
fine-pointer desktop landscape
    => allowed; keep fitted portrait canvas
```

Keep the detection pure/testable where possible and isolate browser listeners in the adapter.

### 6.2 Overlay

Add one global portrait guard above the Phaser canvas:

```text
ROTATE DEVICE
Meowcenary is designed for portrait play.
```

It must:

- cover the full device viewport including safe areas;
- consume pointer input;
- remain legible without Phaser having to successfully lay out the landscape frame;
- disappear immediately on return to portrait;
- not appear merely because a desktop browser window is wider than tall.

A DOM overlay owned beside `#game-root` is preferred because it must remain reliable while the canvas is in the unsupported geometry.

### 6.3 Simulation/input suspension

Orientation must not advance combat invisibly behind the guard.

Do **not** add `'orientation'` to the gameplay `PauseReason` union solely for this presentation constraint. Preserve manual/level-up pause semantics.

Instead expose an orientation-blocked runtime condition that:

- makes GameScene skip active simulation ticks while blocked;
- pauses Arcade physics while blocked;
- suppresses logical actions while blocked;
- resumes only the orientation suspension when portrait returns.

If the run was manually paused or level-up paused before rotation, returning to portrait leaves that pause intact. If the run is terminal, returning to portrait leaves terminal state intact.

Menu/Training/Results controls must likewise reject keyboard/controller input behind the global guard.

### 6.4 Required tests

Cover:

- portrait coarse pointer: allowed;
- landscape coarse pointer: blocked;
- landscape fine pointer: allowed;
- repeated portrait -> landscape -> portrait does not duplicate listeners/overlays;
- active run clock, ability cooldown, player/enemy physics and system updates do not advance while blocked;
- manual pause survives orientation round-trip;
- level-up chooser survives orientation round-trip;
- extraction/pending-clear survives orientation round-trip;
- terminal summary survives orientation round-trip;
- Menu loading may continue its asynchronous resource work, but no hidden input is accepted and a GameScene started while blocked begins suspended;
- returning to portrait triggers the existing resize/layout rebuild once without stale hit targets;
- visualViewport/browser-toolbar resize events do not falsely toggle the guard when orientation did not change.

## 7. Ordered implementation sequence

Use regression-first commits and keep each slice independently revertible.

```text
1. RED tests / exact-baseline reproductions for all four findings
2. modal contract-loading transition
3. Achievement badge parity
4. ability presentation contract + system + eight data entries
5. portrait-only phone orientation guard
6. cross-slice hostile review and mobile acceptance
```

Do not combine the four fixes into a general MenuScene/layout rewrite.

Suggested ownership:

- Loading: `MenuScene`, `resourceLoader`, focused menu/resource lifecycle tests.
- Achievement parity: Achievement read/presentation resolver + Menu/summary tests; no gameplay change.
- Ability visuals: `gameplay/abilities` presentation type, validation/data, EventBus facts, dedicated presentation system, minimal GameScene wiring.
- Orientation: `platform` adapter + root/CSS overlay + narrow scene/runtime suspension seam.

## 8. Reviewer traps / explicit non-goals

Reject the change if it does any of the following:

- uses a fake timed loading percentage;
- leaves keyboard/gamepad capable of activating hidden menu controls during load/orientation block;
- changes the captured run request after resource loading began;
- builds separate terminal and Career Achievement badge catalogs;
- fixes one missing badge by hard-coding an Achievement ID;
- emits ability FX when activation is rejected on cooldown;
- uses ability/character IDs in the renderer instead of a registered cue vocabulary;
- adds gameplay damage/healing/stat logic to the presentation system;
- introduces a second ability timer that can drift from the authoritative state machine;
- allocates unbounded particles/effects;
- removes all ability feedback under reduced motion;
- implements a second landscape HUD/menu/gameplay layout;
- blocks ordinary desktop landscape windows;
- models phone rotation as a persistent gameplay pause reason;
- resumes a player from an existing manual/level-up pause after rotation;
- changes Save V4 for presentation-only state;
- closes #87 or treats ability FX as the assembled-weapon visual deliverable.

## 9. Automated closeout

Run focused tests first, then:

```bash
npm run lint
npm run test
npm run build
npm run content:validate
npm run art:validate   # required if ability work adds/changes art resources
npm run allocation:check  # if present on the implementation head

git diff --check
```

Also run the existing mixed-input, resize, reduced-motion, MenuScene, run-resource, Achievement, ability, feedback, and zero-allocation regressions affected by the change.

No test may be deleted simply because a new implementation is inconvenient. Replace a superseded assertion with the new explicit contract in the same commit.

## 10. Mandatory device acceptance

Pin one exact candidate SHA before testing.

Minimum phone journey:

1. cold-load `Home -> Career -> Achievements`; badges appear without first playing a Contract;
2. return Home, press Play Contract on a cold resource load; loading surface appears immediately and all underlying actions are inert;
3. complete a run; terminal badge identity matches Career for the same Achievement;
4. trigger at least Scrap Burst, one sustained stat ability, Shield Flicker, and Scavenge Pulse; the effect is understandable without reading source/data;
5. activate while moving with two-touch input;
6. rotate during active combat; overlay appears and combat/cooldown stop;
7. return portrait; active run resumes correctly;
8. repeat orientation round-trip while manually paused and during a level-up chooser; prior modal state survives;
9. rotate on Home and during Contract loading; no broken landscape UI is exposed or actionable.

Acceptance fails for invisible background simulation, stale/duplicated controls, badge inconsistency, ambiguous ability effects, or menu mutations during loading.

## 11. Completion boundary

This tranche is complete when:

- Career and terminal Achievements present consistent semantic badges;
- run launch always has a truthful blocking loading/failure state;
- each current active ability has clear, bounded, reduced-motion-safe visual feedback driven by authoritative activation state;
- coarse-pointer phone landscape is safely blocked and returning to portrait preserves the exact prior gameplay/modal state;
- desktop landscape remains usable with the fitted portrait canvas;
- all automated and exact-SHA phone gates pass.

After that, proceed separately with #87's assembled-weapon visuals and the broader #167 art/polish work.