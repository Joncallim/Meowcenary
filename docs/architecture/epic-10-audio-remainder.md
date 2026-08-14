# Epic 10 Audio Remainder — Issue #67 Architecture and Implementation Handoff

Status: **implementation-ready architecture** for Issue #67. This is the
architecture commit for the single delivery branch
`agent/epic-10-audio-remainder`; implementation commits for the same issue
must be appended to this branch and PR.

Architecture baseline: `main` at
`8985d52c9fcb6601985d3fa4959a24c85f30750a` (Epic 10 slices 1–2 merged in
PR #65; 934 tests / 68 files reported green).

Implementation baseline: **to be recorded after PR #66 merges**. Issue #67 is
sequenced after Epic 11. No runtime implementation may begin until §4 is
complete.

Authority:

- [`epic-10-audio.md`](epic-10-audio.md) §§1–12 remain authoritative for the
  shipped data, event, cooldown, `AudioManager`, browser-autoplay, and
  lifecycle contracts.
- This document is the executable source of truth for Issue #67 and
  supersedes `epic-10-audio.md` §§13–19 for the remaining slices.
- The current repository wins over stale line numbers. The symbols and
  behavioral seams named below are frozen; do not invent compatibility layers
  if PR #66 changes a named seam.

## 1. Outcome

Finish Epic 10 without redesigning the contracts already on `main`:

1. Boot preloads the validated audio catalog, constructs exactly one
   game-scoped `AudioManager`, initializes it once, and publishes it through
   the Phaser registry.
2. `GameContext.updateSettings` emits `settings:changed` only when
   `applySettingsPatch` returns a new settings object, including when the
   persistence attempt fails.
3. Menu and game scenes fetch the shared manager, select their music loop,
   forward `delta`, and install one removable first-gesture unlock pair.
4. User commands emit exactly one of `ui:navigate`, `ui:confirm`, or
   `ui:back` from the concrete scene/view dispatch point. Controllers remain
   headless.
5. A dependency-free deterministic Node script generates the exact fourteen
   placeholder WAV files declared by `audio-assets.json`.
6. The browser matrix, full automated gates, documentation closeout, and
   delivery record prove the epic is complete.

The intended implementation is mechanical. The agent should follow the
file-by-file edits, tests, and commit gates below rather than performing a new
architecture pass.

## 2. Repository review findings and frozen decisions

### 2.1 Already delivered — do not rebuild

PR #65 already placed these contracts on `main`:

- `settings:changed`, `ui:navigate`, `ui:confirm`, and `ui:back` in
  `GameEventMap` and `GAME_EVENT_KEYS`;
- `shouldPlay` in `src/engine/cooldown.ts`;
- `audio-assets.json`, `audio-map.json`, their types, validation, and
  `GameData.audio`;
- the full game-scoped-capable `AudioManager` and
  `AUDIO_MANAGER_REGISTRY_KEY` in `src/systems/audio.ts`;
- non-finite guards, warn-once missing-asset handling, locked-SFX dropping,
  deferred music, update-driven fades, `stopMusic` opt-in, and Retry-safe
  fading-loop behavior.

Issue #67 wires those contracts. It must not alter the public API or behavior
of `AudioManager`, the audio JSON, cooldowns, validation, event payloads, or
the save schema unless a failing conformance test proves a regression in the
landed code. Any such regression is reported separately before changing the
contract.

### 2.2 One manager, owned by Boot

`scene.sound` is Phaser's game-global sound manager. The repository therefore
needs one `AudioManager`, constructed by `BootScene`, stored under
`AUDIO_MANAGER_REGISTRY_KEY`, and fetched by both active scenes.

The manager is **not**:

- constructed by `MenuScene` or `GameScene`;
- added to `GameScene.systems`;
- destroyed during scene shutdown;
- stopped with `sound.stopAll()`;
- recreated on Retry or Menu ↔ Game transitions.

`AudioManager.destroy()` remains a test/full-game-teardown API only.

### 2.3 PR #66 is a hard sequencing dependency, not a design dependency

PR #66 is the Epic 11 delivery PR. Its later slices are expected to add
debug-cheat wiring, a `DpsMeter`, overlay lines, and a development-only
playtest summary to `GameScene`. Issue #67 does not consume those features,
but both PRs touch the same composition root.

Frozen integration rule: merge the completed `main` after PR #66 into this
branch before Slice 3. Preserve every Epic 11 import, field, subscription,
system, overlay line, and teardown step. Add the audio seams named in §6
without reordering or simplifying Epic 11.

### 2.4 The generic Menu button cannot own an unconditional confirm sound

`MenuScene.addBackButton` delegates to the generic `addButton`. If
`addButton` emitted `ui:confirm` unconditionally and `addBackButton` emitted
`ui:back`, one Back click would produce two sounds.

Frozen correction: `addButton` accepts an explicit event argument defaulting
to `ui:confirm`; `addBackButton` passes `ui:back`. The single `POINTER_UP`
callback emits that selected event exactly once before executing the action.
Keyboard Enter/Space already synthesizes the same `POINTER_UP`, so it gains
sound without another emission site.

### 2.5 Controllers stay headless

Do not add the event bus or audio calls to:

- `MainMenuController`;
- `SettingsController`;
- character/arena/progression controllers;
- `PauseController`;
- `InventoryController`;
- `RunSummaryController`;
- `createModalTextHelpers` / `ui/modal.ts`.

The existing controllers return snapshots, booleans, or command results.
Scenes/views use those returns to decide whether a visible command succeeded,
then emit from the presentation dispatch point.

### 2.6 First gesture means one cross-removed listener pair

Each active scene installs:

- one `POINTER_DOWN` `once` listener on `this.input`; and
- one generic `keydown` `once` listener on `this.input.keyboard`, when a
  keyboard exists.

Whichever fires first removes **both** listeners before calling
`audioManager.unlock()`. Scene shutdown also removes both. Merely registering
two independent `once` listeners is insufficient: the unfired listener would
survive and accumulate when the scene instance is revisited.

No DOM listeners, `AudioContext.resume`, timers, or scene tweens are added.

### 2.7 Placeholder assets are generated content, not final sound design

The WAVs are deliberately simple, deterministic signals that prove loading,
mapping, cooldowns, music switching, and failure tolerance. Final composition,
mixing, codecs, audio sprites, spatial audio, and pitch variation are outside
Issue #67.

## 3. Scope and non-goals

### In scope

- `src/engine/context.ts`
- `src/scenes/BootScene.ts`
- `src/scenes/MenuScene.ts`
- `src/scenes/GameScene.ts`
- `src/ui/pause.ts`
- `src/ui/runSummary.ts`
- focused tests for the files above
- `scripts/generate-audio-placeholders.mjs`
- `public/assets/audio/*.wav`
- `tests/audioAssets.test.ts`
- Epic 10 status/delivery documentation

### Out of scope

- changes to audio JSON or audio validation;
- changes to `AudioManager` behavior or API;
- new events or payload changes;
- new save fields, migrations, or storage keys;
- new dependencies or package scripts;
- controller API redesign;
- shared UI-helper instrumentation;
- gameplay tuning, Epic 11 tooling changes, or Epic 12 pooling/polish;
- final audio art.

## 4. Pre-implementation gate and branch protocol

Implementation starts only after every item below is true:

1. PR #66 is merged into `main`.
2. On `agent/epic-10-audio-remainder`, fetch and merge the new `origin/main`.
   Do not create a second branch or PR. Do not force-push a shared delivery
   branch.
3. Record in §17:
   - the PR #66 merge commit;
   - the new `origin/main` SHA;
   - this branch's post-merge SHA;
   - the exact baseline test/file count.
4. Run the full baseline before editing:
   ```bash
   npm ci
   npm test
   npm run lint
   npm run build
   git diff --check
   ```
5. Audit only these expected post-PR-66 seams:
   - `GameScene.systems` still owns scene-scoped systems and destroys them in
     `handleShutdown`;
   - `GameScene.update` still has one `systems.forEach(system.update)` block;
   - `GameScene.handlePauseKey` still owns P/Escape/HUD pause dispatch;
   - `PhaserPauseView` construction still occurs in `GameScene.create`;
   - `PhaserRunSummaryView` still owns Retry/Main Menu scene commands;
   - no second `AudioManager` or audio registry publication exists.

If all six seams exist, implement this document directly. If a seam is
materially absent, stop **that slice only** and report the exact file, symbol,
and conflicting post-PR-66 behavior. Do not redesign Epic 11 or add an
adapter layer.

## 5. Final runtime ownership and flow

```text
BootScene.preload
  audio-assets.json rows
    -> Phaser loader cache

BootScene.create
  loadGameData()
    -> GameContext
    -> one AudioManager(this)
    -> audio.init(ctx.bus, ctx.settings, ctx.data.audio)
    -> registry[meowcenary.audioManager]
    -> MenuScene

GameContext.updateSettings
  applySettingsPatch
    -> persist current snapshot
    -> settings:changed only when settings identity changed
      -> shared AudioManager.applySettings

MenuScene (active)
  registry AudioManager
    -> playMusic("music-menu")
    -> update(delta)
    -> first pointer/key unlock
  menu command
    -> exactly one ui:* event
      -> audio-map.json
        -> AudioManager.play(...)

GameScene (active)
  registry AudioManager
    -> playMusic("music-run")
    -> update(delta)
    -> first pointer/key unlock
  pause/summary command
    -> exactly one ui:* event
```

Lifecycle invariants:

| Transition | Required result |
| --- | --- |
| Boot → Menu | one initialized manager; menu loop current or pending |
| Menu → Game | same manager; menu loop replaced by run loop |
| Game Retry | same manager; fading run loop restarts correctly |
| Game → Menu | same manager; any run fade is replaced by menu loop |
| scene shutdown | unlock listeners removed; scene reference cleared; manager survives |
| missing manager registry entry | scene remains functional and silent |
| missing asset files | loader completes; manager cache gate drops playback; no throw |

## 6. Slice 3 — settings, Boot, and scene lifecycle wiring

### 6.1 `src/engine/context.ts`: the only settings emitter

Keep `applySettingsPatch`, snapshot replacement, and save behavior unchanged.
Replace only the body of `updateSettings` with this ordering:

```ts
updateSettings(patch) {
  const previousSettings = current.settings;
  const settings = applySettingsPatch(previousSettings, patch);
  current = Object.freeze({ version: 2, settings, meta: current.meta });
  const persisted = options.save.save(current);

  if (settings !== previousSettings) {
    options.bus.emit('settings:changed', { settings });
  }

  return Object.freeze({ value: settings, persisted });
},
```

Frozen semantics:

- identity equality, not patch-object equality, decides emission;
- a no-op/sanitized-to-current patch emits nothing;
- persistence is attempted exactly as today;
- a real in-memory change emits even when `persisted === false`;
- assignment occurs before emission, so a listener reading
  `context.settings` observes the same object in the payload;
- no other module emits `settings:changed`.

### 6.2 `src/scenes/BootScene.ts`: preload, construct, initialize, publish

Add imports for `audio-assets.json`, `AudioManager`, and
`AUDIO_MANAGER_REGISTRY_KEY`.

Add:

```ts
preload(): void {
  for (const asset of [...audioAssetsJson.sfx, ...audioAssetsJson.music]) {
    this.load.audio(asset.key, asset.url);
  }
}
```

Do not validate or catch loader errors here. `loadGameData()` remains the
fail-closed validation boundary in `create`; Phaser loader failures are
best-effort and must not prevent `create`.

In `create`, retain the existing data/registry/context construction. After
`registry.set(GAME_CONTEXT_REGISTRY_KEY, context)` and before
`scene.start(SceneKey.Menu)`, add exactly:

```ts
const audio = new AudioManager(this);
audio.init(context.bus, context.settings, context.data.audio);
this.registry.set(AUDIO_MANAGER_REGISTRY_KEY, audio);
```

There is no Boot shutdown hook for the manager.

### 6.3 Shared scene fields and unlock helpers

Both `MenuScene` and `GameScene` gain:

```ts
private audioManager?: AudioManager;

private readonly handleAudioUnlock = (): void => {
  this.removeAudioUnlockListeners();
  this.audioManager?.unlock();
};

private installAudioUnlockListeners(): void {
  if (!this.audioManager) {
    return;
  }
  this.removeAudioUnlockListeners();
  this.input.once(
    Phaser.Input.Events.POINTER_DOWN,
    this.handleAudioUnlock,
    this,
  );
  this.input.keyboard?.once('keydown', this.handleAudioUnlock, this);
}

private removeAudioUnlockListeners(): void {
  this.input.off(
    Phaser.Input.Events.POINTER_DOWN,
    this.handleAudioUnlock,
    this,
  );
  this.input.keyboard?.off('keydown', this.handleAudioUnlock, this);
}

private getAudioManager(): AudioManager | undefined {
  return this.registry.get(AUDIO_MANAGER_REGISTRY_KEY) as
    | AudioManager
    | undefined;
}
```

Use the same helper shape in both scene files; do not create a shared utility.
The field is a non-owning cache. `handleShutdown` must call
`removeAudioUnlockListeners()` and set `audioManager = undefined`, but never
call `destroy`, `stopMusic`, or `stopAll`.

### 6.4 `MenuScene` exact wiring

Add type-only `EventBus` import for Slice 4 and the audio imports. Add:

```ts
private bus?: EventBus;
```

In `create`:

1. obtain `ctx` as today;
2. assign `this.bus = ctx.bus`;
3. preserve controller, display, keyboard, and render setup;
4. after a successful `render(...)`, fetch the manager;
5. call `playMusic('music-menu')`;
6. install the unlock listeners;
7. retain the existing scene shutdown/destroy registrations.

```ts
this.audioManager = this.getAudioManager();
this.audioManager?.playMusic('music-menu');
this.installAudioUnlockListeners();
```

Add the Phaser scene update hook:

```ts
update(_time: number, delta: number): void {
  this.audioManager?.update(delta);
}
```

At the start of `handleShutdown`, after removing scene lifecycle callbacks,
remove the unlock pair. At teardown end clear `bus` and `audioManager` along
with the existing controller/display fields.

A missing audio registry entry is tolerated; no scene behavior changes.

### 6.5 `GameScene` exact wiring after PR #66

Add the audio imports and `audioManager` field without changing any Epic 11
field.

In `create`, after the scene's existing display tree has been constructed and
immediately before `startRun(...)`:

```ts
this.audioManager = this.getAudioManager();
this.audioManager?.playMusic('music-run');
this.installAudioUnlockListeners();
```

In the `PhaserPauseView` options, Slice 4 will add `bus: ctx.bus`.

In `update`, insert exactly one call immediately after the existing
`systems.forEach` block and before controls/overlay presentation:

```ts
this.audioManager?.update(delta);
```

This position keeps the manager's deterministic clock aligned with the active
scene update and lets terminal music fades continue while the finished run
scene remains visible.

In `handleShutdown`:

1. remove the audio unlock pair;
2. set `audioManager = undefined`;
3. preserve all Epic 11 and existing teardown;
4. do not destroy the manager.

Add the tolerant `getAudioManager` and unlock helpers from §6.3.

### 6.6 Slice 3 automated evidence

#### `tests/contextSystem.test.ts`

Add three tests:

1. a real settings change emits once; payload `.settings`,
   `result.value`, `context.settings`, and `context.saveData.settings` are the
   same object;
2. an identity-equal/no-op patch emits zero times;
3. with storage writes forced to fail, a real change returns
   `persisted: false` and still emits once.

Retain all current persistence assertions.

#### `tests/bootScene.test.ts` (new)

Use the repository's existing local Phaser-mock style. Assert:

- `preload()` calls `load.audio` once for every row in
  `audio-assets.json`, in `[...sfx, ...music]` order, with exact key/url;
- `create()` publishes context first, then one initialized manager under
  `AUDIO_MANAGER_REGISTRY_KEY`, then starts `SceneKey.Menu`;
- manager `init` receives the exact `context.bus`, `context.settings`, and
  `context.data.audio` references;
- only one `AudioManager` instance is constructed per Boot `create`.

Mock the audio module or provide the minimal sound/cache fake; do not weaken
`AudioManager`'s own tests.

#### `tests/menuScene.test.ts`

Extend the existing harness rather than replacing it:

- registry lookup must branch on `GAME_CONTEXT_REGISTRY_KEY` and
  `AUDIO_MANAGER_REGISTRY_KEY`;
- add an audio fake with `playMusic`, `update`, and `unlock` spies;
- add `POINTER_DOWN` to the Phaser mock;
- extend fake input/keyboard emitters with `once`, `off`, listener counts, and
  one-shot removal;
- extend fake scene lifecycle events so shutdown can be emitted.

Assert:

- `create()` requests `music-menu` once;
- `update(_, 17)` forwards exactly `17`;
- first pointer down unlocks once and removes the pending keyboard listener;
- first keydown unlocks once and removes the pending pointer listener;
- shutdown before any gesture removes both;
- two create/shutdown visits on the same scene leave one pair, never an
  accumulated pair;
- missing audio registry entry preserves all existing menu tests.

#### Game-scene lifecycle evidence

Add focused coverage in `tests/gameSceneAudio.test.ts` if the post-PR-66
Phaser mock permits direct construction without duplicating the entire game
composition. It should exercise the private seam through a typed test cast:

- registry fetch is tolerant;
- install → first gesture → cross-removal;
- shutdown clears the field without calling `destroy`;
- `handlePauseKey` cases from §7.2.

Do **not** build a brittle full `GameScene.create` fake solely to assert one
line. If direct scene construction becomes disproportionate, cover
`GameScene` update/music placement by source review plus the mandatory browser
matrix; the Boot, Menu, manager, pause, and summary tests still provide the
behavioral integration evidence.

## 7. Slice 4 — exact UI event emission

### 7.1 Event table

Exactly one event is emitted for each listed command:

| Surface | Command | Event | Success gate |
| --- | --- | --- | --- |
| Menu | keyboard focus index actually changes | `ui:navigate` | compare old/new index |
| Menu | normal button `POINTER_UP` (pointer or synthetic Enter/Space) | `ui:confirm` | none |
| Menu | `< Back` button | `ui:back` | none |
| Menu | Esc through `handleBack` | `ui:back` | none; home Esc is still a back command |
| Game | closed panel → `pause()` | `ui:confirm` | controller returned `true` |
| Game | inventory → `back()` | `ui:back` | controller returned `true` |
| Game | pause → `resume()` | `ui:back` | controller returned `true` |
| Pause view | Resume | `ui:back` | controller returned `true` |
| Pause view | Inventory | `ui:confirm` | controller returned `true` |
| Pause view | weapon row toggle | `ui:navigate` | clicked row selected state changed |
| Pause view | Merge Selected | `ui:confirm` | always, success or failure |
| Pause view | `< Back` | `ui:back` | controller returned `true` |
| Summary | Retry button | `ui:confirm` | view visible and not disposed |
| Summary | R shortcut | `ui:confirm` | same Retry helper; ignore repeats |
| Summary | Main Menu | `ui:confirm` | view visible and not disposed |

No new event is emitted for:

- pointer hover;
- initial focus assignment during render;
- the HUD pause button directly — it already delegates to
  `GameScene.handlePauseKey`;
- the upgrade chooser — `card:chosen` is already mapped;
- merge result internals — `weapon:merged` remains unchanged;
- controller method calls outside these views/scenes.

### 7.2 `MenuScene`: one event selected by `addButton`

Define:

```ts
type MenuAudioEvent = 'ui:confirm' | 'ui:back';
```

Extend `addButton`:

```ts
private addButton(
  root: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  minHeight: number,
  callback: () => void,
  audioEvent: MenuAudioEvent = 'ui:confirm',
): Phaser.GameObjects.Text
```

Its existing `POINTER_UP` callback becomes:

```ts
text.on(Phaser.Input.Events.POINTER_UP, () => {
  this.focusIndex = this.focusables.indexOf(text);
  this.bus?.emit(audioEvent, {});
  callback();
});
```

`addBackButton` passes `'ui:back'` as the final argument. It does not emit
separately.

`handleBack` emits `ui:back` once before the existing controller/render call:

```ts
private handleBack(): void {
  this.bus?.emit('ui:back', {});
  const next = this.requireController().back();
  this.render(next);
}
```

`handleFocusMove` compares indices:

```ts
const previousIndex = this.focusIndex;
this.focusIndex =
  (this.focusIndex + delta + this.focusables.length) %
  this.focusables.length;
if (this.focusIndex !== previousIndex) {
  this.bus?.emit('ui:navigate', {});
}
this.applyFocus();
```

`handleActivate` remains unchanged. Do not add a keyboard emission: its
synthetic `POINTER_UP` is the single command boundary.

### 7.3 `GameScene.handlePauseKey`: emit only on accepted state change

Preserve the post-PR-66 method's rendering and panel routing. Use this command
shape:

```ts
private handlePauseKey(): void {
  const controller = this.pauseController;
  if (!controller) {
    return;
  }

  const panel = controller.snapshot().panel;
  let accepted = false;
  let event: 'ui:confirm' | 'ui:back';

  if (panel === 'inventory') {
    accepted = controller.back();
    event = 'ui:back';
  } else if (panel === 'pause') {
    accepted = controller.resume();
    event = 'ui:back';
  } else {
    accepted = controller.pause();
    event = 'ui:confirm';
  }

  if (accepted) {
    this.getContext().bus.emit(event, {});
  }
  this.pauseView?.render(controller.snapshot());
}
```

If PR #66 adds local work to this method, retain it around this command
boundary. Do not emit from `onPauseRequested`; it already calls this method.

### 7.4 `PhaserPauseView`: add a bus, not controller behavior

Add `readonly bus: EventBus` to `PhaserPauseViewOptions`, store it in a
private field, and pass `ctx.bus` from `GameScene`.

Callbacks:

```ts
// Resume
if (this.controller.resume()) {
  this.bus.emit('ui:back', {});
}
this.render(this.controller.snapshot());

// Inventory
if (this.controller.openInventory()) {
  this.bus.emit('ui:confirm', {});
}
this.render(this.controller.snapshot());
```

For a weapon row, use the row snapshot closed over by the render callback:

```ts
const next = this.inventory.toggle(weapon.instanceId);
const selectedAfter = next.selectedInstanceIds.includes(weapon.instanceId);
if (selectedAfter !== weapon.selected) {
  this.bus.emit('ui:navigate', {});
}
this.render(this.controller.snapshot());
```

For Merge Selected, emit exactly once regardless of result:

```ts
const result = this.inventory.mergeSelected();
this.bus.emit('ui:confirm', {});
this.notice = result.ok ? undefined : mergeFailureCopy(result.reason);
this.render(this.controller.snapshot());
```

For `< Back`:

```ts
if (this.controller.back()) {
  this.bus.emit('ui:back', {});
}
this.render(this.controller.snapshot());
```

Do not change `PauseController`, `InventoryController`, or `ui/modal.ts`.

### 7.5 `PhaserRunSummaryView`: one shared Retry command

Store `options.bus` as a field. Add:

```ts
private retry(): void {
  if (this.disposed || !this.visible) {
    return;
  }
  this.bus.emit('ui:confirm', {});
  this.scenePlugin.restart();
}

private returnToMenu(): void {
  if (this.disposed || !this.visible) {
    return;
  }
  this.bus.emit('ui:confirm', {});
  this.scenePlugin.start(SceneKey.Menu);
}
```

`handleRetryKey` retains its repeat/visibility guard and calls `retry()`.
The Retry button calls `retry()`. The Main Menu button calls
`returnToMenu()`. Neither button emits independently.

Keep terminal-event subscriptions, render-failure cleanup, banking reads, and
destroy behavior unchanged.

### 7.6 Slice 4 automated evidence

#### Menu

Add assertions to `tests/menuScene.test.ts` that:

- one ArrowDown changing focus emits one `ui:navigate`;
- a one-item/same-index move emits none where a focused fixture can express
  that case;
- pointer Start emits one `ui:confirm`;
- Enter/Space activation emits one `ui:confirm`, not two;
- opening Character then clicking `< Back` produces
  `[ui:confirm, ui:back]`, not a second confirm on Back;
- Esc emits one `ui:back`;
- pointer hover emits nothing.

#### Pause view

Update the existing `PhaserPauseView` harness in
`tests/pauseController.test.ts` to pass a real local bus and record `ui:*`.

Assert:

- Resume: one back;
- Inventory: one confirm;
- valid row toggle: one navigate;
- Merge success: one confirm;
- Merge failure: one confirm;
- Back: one back;
- a controller-rejected command emits nothing, using a disposed/invalid-state
  fixture rather than modifying controller code.

Keep all existing rendering, failure-cleanup, and destroy tests.

#### Run summary

Extend `tests/runSummary.test.ts`:

- Retry button emits one confirm and restarts once;
- R emits one confirm and restarts once;
- repeated R emits nothing;
- hidden or destroyed R emits nothing;
- Main Menu emits one confirm and starts `SceneKey.Menu`;
- button callbacks do not emit after view destruction.

#### Controllers

No controller test should need an expected event changed except the events
they already own (`run:*`, `weapon:merged`, etc.). A source search must show
no `ui:navigate`, `ui:confirm`, or `ui:back` emission in controller files or
`ui/modal.ts`.

## 8. Slice 5 — deterministic placeholders

### 8.1 Files and manifest

Create:

- `scripts/generate-audio-placeholders.mjs`
- `public/assets/audio/`
- one `.wav` for every key in `audio-assets.json`:
  - 12 SFX files;
  - `music-menu.wav`;
  - `music-run.wav`.
- `tests/audioAssets.test.ts`

The output directory must contain exactly those fourteen `.wav` files and no
other generated audio.

### 8.2 Generator I/O contract

The script:

1. runs on Node 18+ with built-in modules only;
2. reads and parses `src/data/audio-assets.json`;
3. flattens `[...sfx, ...music]` in catalog order;
4. checks every row has a non-empty key and
   `url === "assets/audio/<key>.wav"`;
5. checks the declared key set equals the profile key set exactly; missing or
   extra profiles throw with the differing keys;
6. creates `public/assets/audio/` recursively;
7. renders deterministic PCM bytes;
8. writes `<key>.wav` for each declared row;
9. prints one concise summary line and no per-sample output;
10. uses no wall-clock values, random source, metadata chunk, or platform
    newline inside the WAV bytes.

Do not add an npm script. Run it directly with Node.

### 8.3 WAV encoding contract

Every file is:

- RIFF/WAVE;
- PCM format 1;
- mono;
- 8,000 Hz;
- 16-bit little-endian;
- 44-byte canonical header followed by a `data` chunk;
- sample clamped to `[-1, 1]` and encoded with
  `Math.round(sample * 32767)`.

Header fields:

```text
0   "RIFF"
4   uint32LE(36 + dataBytes)
8   "WAVE"
12  "fmt "
16  uint32LE(16)
20  uint16LE(1)          // PCM
22  uint16LE(1)          // mono
24  uint32LE(8000)
28  uint32LE(16000)      // sampleRate * channels * bytesPerSample
32  uint16LE(2)
34  uint16LE(16)
36  "data"
40  uint32LE(dataBytes)
```

### 8.4 Deterministic synthesis algorithm

Use one phase accumulator per tone segment:

```text
phase += 2π * frequencyHz / sampleRate
tone = sin(phase)
```

SFX segments use a Hann envelope:

```text
progress = sampleIndex / max(1, segmentSamples - 1)
envelope = 0.5 - 0.5 * cos(2π * progress)
frequency = startHz + (endHz - startHz) * progress
```

When `noiseMix > 0`, mix deterministic noise:

```text
sample = envelope * gain *
  ((1 - noiseMix) * sin(phase) + noiseMix * noise)
```

Noise uses FNV-1a of the UTF-8 asset-key bytes as a non-zero 32-bit
seed and one `xorshift32` step per sample. Use these exact helpers:

```js
function seedFor(key) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(key, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 0x6d2b79f5;
}

function nextNoise(state) {
  let next = state >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return {
    state: next || 0x6d2b79f5,
    value: (next / 0xffffffff) * 2 - 1,
  };
}
```

For every segment,
`segmentSamples = Math.round(durationMs * 8000 / 1000)`. Append segments in
profile order with no inserted silence. Reset phase to zero at each segment;
keep the noise state across segments of one asset. For each sample, calculate
progress/frequency, advance phase, step noise, and then calculate the mixed
sample in that order.

Use these exact SFX profiles:

```js
const SFX_PROFILES = {
  'sfx-weapon-fired': [
    { durationMs: 120, startHz: 880, endHz: 440, gain: 0.42, noiseMix: 0.00 },
  ],
  'sfx-projectile-hit': [
    { durationMs: 100, startHz: 180, endHz: 90, gain: 0.34, noiseMix: 0.55 },
  ],
  'sfx-enemy-killed': [
    { durationMs: 90, startHz: 220, endHz: 440, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 120, startHz: 440, endHz: 660, gain: 0.35, noiseMix: 0.00 },
  ],
  'sfx-player-damaged': [
    { durationMs: 220, startHz: 120, endHz: 70, gain: 0.38, noiseMix: 0.25 },
  ],
  'sfx-drop-collected': [
    { durationMs: 80, startHz: 660, endHz: 660, gain: 0.30, noiseMix: 0.00 },
    { durationMs: 100, startHz: 880, endHz: 990, gain: 0.34, noiseMix: 0.00 },
  ],
  'sfx-level-up': [
    { durationMs: 90, startHz: 440, endHz: 440, gain: 0.30, noiseMix: 0.00 },
    { durationMs: 90, startHz: 660, endHz: 660, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 140, startHz: 880, endHz: 880, gain: 0.35, noiseMix: 0.00 },
  ],
  'sfx-card-chosen': [
    { durationMs: 70, startHz: 520, endHz: 520, gain: 0.28, noiseMix: 0.00 },
    { durationMs: 100, startHz: 780, endHz: 780, gain: 0.32, noiseMix: 0.00 },
  ],
  'sfx-run-won': [
    { durationMs: 100, startHz: 523, endHz: 523, gain: 0.30, noiseMix: 0.00 },
    { durationMs: 100, startHz: 659, endHz: 659, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 220, startHz: 784, endHz: 784, gain: 0.35, noiseMix: 0.00 },
  ],
  'sfx-run-lost': [
    { durationMs: 160, startHz: 330, endHz: 247, gain: 0.32, noiseMix: 0.00 },
    { durationMs: 220, startHz: 247, endHz: 165, gain: 0.34, noiseMix: 0.10 },
  ],
  'sfx-ui-navigate': [
    { durationMs: 80, startHz: 700, endHz: 760, gain: 0.25, noiseMix: 0.00 },
  ],
  'sfx-ui-confirm': [
    { durationMs: 110, startHz: 520, endHz: 700, gain: 0.28, noiseMix: 0.00 },
  ],
  'sfx-ui-back': [
    { durationMs: 110, startHz: 520, endHz: 360, gain: 0.28, noiseMix: 0.00 },
  ],
};
```

Music files are exactly 4 seconds (`32,000` samples), with no random noise
and no amplitude envelope. Integer-Hz components make the loop boundary
phase-aligned over the integer duration:

```js
const MUSIC_PROFILES = {
  'music-menu': {
    durationMs: 4000,
    gain: 0.12,
    components: [
      { hz: 220, weight: 1.00 },
      { hz: 330, weight: 0.50 },
      { hz: 440, weight: 0.35 },
    ],
  },
  'music-run': {
    durationMs: 4000,
    gain: 0.12,
    components: [
      { hz: 110, weight: 1.00 },
      { hz: 165, weight: 0.50 },
      { hz: 220, weight: 0.35 },
    ],
  },
};
```

Normalize each music sample by the sum of component weights before applying
`gain`.

### 8.5 Asset tests and reproducibility

`tests/audioAssets.test.ts` reads the catalog and filesystem. Assert:

- catalog URLs map one-to-one to existing files;
- directory `.wav` basenames equal the declared key set exactly;
- every file has the exact header values in §8.3;
- RIFF size and data size match the actual buffer;
- every data chunk is non-empty and has an even byte length.

Reproducibility gate while Slice 5 is still uncommitted:

```bash
node scripts/generate-audio-placeholders.mjs
find public/assets/audio -type f -name '*.wav' -print0 \
  | sort -z | xargs -0 shasum -a 256 > /tmp/meowcenary-audio-before.sha256
node scripts/generate-audio-placeholders.mjs
find public/assets/audio -type f -name '*.wav' -print0 \
  | sort -z | xargs -0 shasum -a 256 > /tmp/meowcenary-audio-after.sha256
diff -u /tmp/meowcenary-audio-before.sha256 \
  /tmp/meowcenary-audio-after.sha256
```

After the Slice 5 commit, run:

```bash
node scripts/generate-audio-placeholders.mjs
git diff --exit-code -- public/assets/audio
```

Both checks must produce zero byte changes.

### 8.6 Missing-assets run

After all automated tests pass:

1. rename `public/assets/audio` outside `public`;
2. run the development build;
3. perform the no-assets row in §10;
4. restore the directory;
5. rerun `git status --short` and `git diff --check`.

Do not run the filesystem asset test while the directory is intentionally
renamed.

## 9. Ordered single-branch implementation plan

The architecture commit is already the first commit. Append these three
implementation commits on the same branch:

| Commit | Outcome | Files | Required gate |
| --- | --- | --- | --- |
| Slice 3 | settings event + Boot/shared-scene lifecycle wiring | `context.ts`, `BootScene.ts`, `MenuScene.ts`, `GameScene.ts`, context/Boot/Menu/Game tests | focused tests, full test, lint, build, diff check |
| Slice 4 | exactly-one UI command events | `MenuScene.ts`, `GameScene.ts`, `pause.ts`, `runSummary.ts`, Menu/pause/summary/Game tests | focused tests, full test, lint, build, diff check |
| Slice 5 | deterministic generator/assets + docs closeout | script, 14 WAVs, asset test, Epic 10 docs/status files | generation diff gate, full test, lint, build, diff check, manual matrix |

A later commit may fix a confirmed defect from an earlier slice on this same
branch. It may not broaden the scope or open a new PR.

## 10. Browser manual matrix

Run once in development and once where marked in production preview. Record
browser, platform, result, and any console output in §17.

| Check | Expected |
| --- | --- |
| Cold load, no gesture | silence; no console exception; music pending |
| First menu pointer gesture | menu music begins; no queued SFX burst |
| First menu key gesture | menu music begins; no queued SFX burst |
| Hold ArrowUp/Down | navigate cues are cooldown-limited; UI remains responsive |
| Pointer and Enter/Space activation | one confirm cue per command |
| Back button and Esc | one back cue, never confirm + back together |
| Settings: mute | active music silences immediately; no reload |
| Settings: music/SFX volume | active music/later SFX reflect new values immediately |
| Settings persistence | values survive reload |
| Start run | menu loop switches to run loop |
| Combat | mapped fire/hit/kill/damage/drop/level/card cues play and spammy keys are rate-limited |
| P, Esc, HUD pause | correct confirm/back cue through the same handler |
| Pause inventory/merge | navigate/confirm/back mapping matches §7.1; failed merge still confirms once |
| F8 / F9 in dev | run loop fades under lose/win stinger |
| Retry button and R | one confirm; run music restarts; no duplicate subscription |
| Main Menu | one confirm; menu music replaces run music |
| Three Menu ↔ Game cycles | no louder/duplicated SFX, music, bus subscription, or input listener |
| `public/assets/audio` absent | game boots and plays silently; missing keys warn at most once in development; zero throws |
| `npm run build && npm run preview` | audio loads from Vite public output; no dev-only assumptions |
| 390×844 emulation | controls remain usable; audio adds no layout change |
| real mobile browser when available | first tap unlocks; scene changes have no audible glitch |

If a real mobile browser is unavailable, record it as unrun; do not claim
completion of that row.

## 11. Automated commands

After Slice 3:

```bash
npm test -- --run \
  tests/contextSystem.test.ts \
  tests/bootScene.test.ts \
  tests/menuScene.test.ts \
  tests/audioManager.test.ts
npm test
npm run lint
npm run build
git diff --check
```

After Slice 4:

```bash
npm test -- --run \
  tests/menuScene.test.ts \
  tests/pauseController.test.ts \
  tests/runSummary.test.ts \
  tests/gameSceneAudio.test.ts \
  tests/audioManager.test.ts
npm test
npm run lint
npm run build
git diff --check
```

Omit `tests/gameSceneAudio.test.ts` only if §6.6 records why a direct scene
harness would be disproportionate and the equivalent manual/source evidence.
Do not omit the behavioral pause/summary tests.

Final:

```bash
node scripts/generate-audio-placeholders.mjs
git diff --exit-code -- public/assets/audio
npm test -- --run \
  tests/audioAssets.test.ts \
  tests/audioManager.test.ts \
  tests/contextSystem.test.ts \
  tests/bootScene.test.ts \
  tests/menuScene.test.ts \
  tests/pauseController.test.ts \
  tests/runSummary.test.ts
npm test
npm run lint
npm run build
git diff --check
git grep -n "new AudioManager" -- src
git grep -n "stopAll" -- src
git grep -n "emit('ui:" -- src
```

Expected source-audit results:

- `new AudioManager` appears in `BootScene` only;
- no Issue #67 code adds `stopAll`;
- `ui:*` emitters appear only in `MenuScene`, `GameScene`,
  `PhaserPauseView`, and `PhaserRunSummaryView`;
- no controller or `ui/modal.ts` emitter appears.

## 12. Documentation closeout

Perform this only after automated and manual evidence exists. Preserve PR
#66's final Epic 11 status and exact post-merge test count.

### `docs/architecture/epic-10-audio.md`

- change top status to complete;
- identify PR #65 as slices 1–2 and this PR as slices 3–5;
- replace §19 with the final delivery evidence;
- point implementation/review readers to this remainder document;
- leave the frozen behavioral contracts in §§1–12 intact.

### This document

Replace §17 placeholders with:

- PR #66 merge/base information;
- architecture and slice commit SHAs;
- delivery PR number/head SHA;
- exact test count/file count;
- lint/build/diff/CI results;
- generator reproducibility result;
- complete manual matrix with honest unrun rows;
- explicitly deferred final sound design/mobile evidence.

### `docs/epics.md`

- set Epic 10 status to `Complete`;
- link both the contract document and this delivery document;
- keep Epic 11's status as merged/complete after PR #66;
- update the single-branch exception wording if it still names only Epics 9
  and 10 inaccurately.

### `docs/architecture.md`

- retain the Epic 10 contract paragraph;
- add this document as the implementation/delivery handoff for Issue #67;
- do not redefine the manager contract.

### `docs/roadmap.md`

- mark Epic 10 complete with PR #65 plus this PR;
- remove “next delivery after Epic 11” wording;
- identify Epic 12 as the next untouched epic unless the live roadmap says
  otherwise.

### `docs/knowledge-graph.md`

Correct the live runtime map, not merely the status line:

- Boot preloads audio, constructs the shared manager, and publishes it;
- Menu and Game fetch it; `GameScene.systems` does **not** own it;
- `GameEventMap` has 24 events including settings and three UI events;
- list both audio JSON files, the generator, and public audio directory;
- mark Epic 10 complete and record the exact new test/file count;
- preserve all Epic 11 modules and status from PR #66.

Issue #67 closes through `Resolves #67` when the delivery PR merges. Do not
close it earlier.

## 13. Global acceptance criteria

- [ ] PR #66 merged first; branch synced to its completed `main`; baseline
      recorded.
- [ ] Exactly one `AudioManager` is constructed in Boot, initialized once,
      and registry-published.
- [ ] Menu/Game fetch the shared instance, select music, forward `delta`, and
      never destroy it.
- [ ] Both scenes cross-remove first-gesture pointer/keyboard listeners and
      remove pending listeners on shutdown.
- [ ] `settings:changed` is emitted only from `GameContext.updateSettings`,
      only on settings identity change, and also after failed persistence.
- [ ] Every command in §7.1 emits exactly its specified event; Back never
      emits both confirm and back; keyboard activation shares the pointer
      dispatch.
- [ ] Controllers and `ui/modal.ts` remain free of `ui:*` emissions.
- [ ] PR #66 GameScene features remain intact.
- [ ] Fourteen deterministic WAVs exactly match the catalog and pass header,
      existence, and regeneration tests.
- [ ] Missing assets produce a silent, non-throwing game and at most one
      development warning per key.
- [ ] No save schema, event payload, gameplay rule, audio-map value,
      dependency, or package-script change.
- [ ] Focused tests, full suite, lint/typecheck, build, diff check, and hosted
      CI are green with exact counts recorded.
- [ ] Manual matrix is recorded honestly, including no-assets and production
      preview runs.
- [ ] Docs describe the real manager ownership and mark Epic 10 complete only
      after the evidence exists.

## 14. Reviewer traps

- Do not start implementation before PR #66 merges.
- Do not resolve merge conflicts by deleting or reordering Epic 11
  `GameScene` code.
- Do not construct a second manager or add it to `systems`.
- Do not call `AudioManager.destroy`, `sound.stopAll`, `Date.now`,
  `performance.now`, `setTimeout`, or a scene tween for audio.
- Do not add DOM autoplay listeners or resume an `AudioContext` directly.
- Do not leave the second first-gesture listener armed after the first fires.
- Do not emit `settings:changed` from SettingsController or a scene.
- Do not emit `ui:*` from controllers or the shared modal helper.
- Do not add an emission to `handleActivate`; it already reaches
  `POINTER_UP`.
- Do not let `< Back` inherit `ui:confirm`.
- Do not make pointer hover or initial render focus audible.
- Do not suppress Merge Selected's confirm cue on a failed merge.
- Do not queue SFX while locked or consume cooldown while muted; those landed
  manager rules remain frozen.
- Do not change `audio-assets.json`, `audio-map.json`, cooldown values, or
  `player:damaged` cadence.
- Do not add packages, codecs, audio sprites, final music, or pitch
  randomization.
- Do not claim mobile/manual/CI evidence that was not run.
- Do not open slice branches or a second delivery PR.

## 15. Implementation-agent handoff (historical)

The implementation is complete and merged via PR #68. This prompt is kept as a
record of what was executed, not a live work order — do not re-run it.

> Implement Issue #67, the Epic 10 audio remainder, in the existing local
> Meowcenary checkout on branch `agent/epic-10-audio-remainder`. Do not create
> another branch or PR.
>
> First verify PR #66 is merged, fetch `origin/main`, and merge it into this
> branch without force-pushing. Run the full baseline and record the
> post-PR-66 SHA and exact test/file count in
> `docs/architecture/epic-10-audio-remainder.md` §17.
>
> Read `docs/knowledge-graph.md`,
> `docs/architecture/epic-10-audio.md` §§1–12, and
> `docs/architecture/epic-10-audio-remainder.md` in full. The remainder
> document is authoritative for all implementation choices. Do not perform a
> new architecture pass.
>
> Implement §§6–8 in order as three green commits on this same branch:
> Slice 3 settings/Boot/scene lifecycle wiring; Slice 4 exactly-one UI events;
> Slice 5 deterministic WAVs, tests, manual matrix, and docs closeout.
>
> Preserve all Epic 11 work from PR #66. Do not redesign `AudioManager`,
> controllers, audio data, validation, events, save data, or gameplay. Use the
> exact code shapes, synthesis profiles, tests, command gates, and reviewer
> traps in the document. When a named seam differs materially, report the
> exact file/symbol mismatch instead of inventing an adapter.
>
> After each slice run its focused gate plus the full suite, lint, build, and
> `git diff --check`. Before handoff run the generator twice/diff gate, source
> audits, full final commands, and the browser matrix including the no-assets
> and production-preview runs. Commit each green slice, push to the existing
> PR, and report exact SHAs, counts, CI, manual evidence, and any genuinely
> unrun row.

## 16. Review-and-hardening handoff (historical)

The review is complete and the delivery merged via PR #68. This prompt is kept
as a record of what was executed, not a live work order — do not re-run it.

> Review and harden Issue #67 on
> `agent/epic-10-audio-remainder`; do not create another branch or PR. Read
> `docs/architecture/epic-10-audio.md` §§1–12 and
> `docs/architecture/epic-10-audio-remainder.md` in full. Diff from the
> post-PR-66 implementation baseline recorded in §17.
>
> Treat this as architecture-conformance review, not redesign. Prioritize:
> single-manager ownership; preservation of Epic 11 GameScene code; settings
> identity/failure semantics; listener accumulation across scene visits;
> locked-SFX versus deferred-music behavior; update/fade continuity;
> exactly-one UI event per pointer/keyboard command; the generic Back-button
> double-emission trap; controller/modal purity; deterministic asset bytes and
> exact manifest; and the missing-assets boot path.
>
> Run the §11 gates independently. Add mutation-style regression tests for
> any invariant that can be broken while the suite stays green. Fix confirmed
> defects only inside the Issue #67 scope. For each finding record causal
> path, user-visible effect, fix, and validation.
>
> End with the reviewed head SHA, exact tests/files, lint/build/diff/CI
> results, generator check, source-audit results, manual rows, remaining
> limitations, and a clear ready/not-ready verdict against §13. Do not mark
> Epic 10 complete if evidence is missing.

## 17. Delivery record

Complete during implementation; do not fabricate values.

- PR #66 merge commit: `1f22858` (Epic 11 squash-merged into `main`)
- post-PR-66 `origin/main` implementation baseline: `1f22858`
- branch sync commit: `38a6100` (merge of `origin/main` into `agent/epic-10-audio-remainder`)
- architecture commit: `6c1a28c`
- Slice 3 commit: `7f938c6` — settings:changed, Boot manager publication, scene lifecycle wiring
- Slice 4 commit: `139dd81` — exactly-one UI command events
- Slice 5 commit: `e9c945c` — deterministic placeholders, asset tests, docs closeout
- review-fix commit: `1f4fd6d` — PR #68 review findings 1–3 (OS key-repeat guard on menu focus move; delta-based bootScene hoisted-state assertions; ternary-derived pause event type); full gates re-run green on this head
- delivery PR: `#68`
- final head SHA (at time of writing): `1f4fd6d` — the review-fix commit; all gates verified on this head
- baseline tests/files: `978 / 70` (post-PR-66 baseline on this branch, before Slice 3)
- final tests/files: `1041 / 73` (after review fixes; Slice 3 → 998/72, Slice 4 → 1023/72, Slice 5 → 1040/73, review-fix → 1041/73)
- lint/typecheck: `green` (every slice gate)
- production build: `green` (every slice gate)
- `git diff --check`: `clean` (every slice gate)
- hosted CI: `unrun` — no hosted CI evidence in this delivery environment
- generator regeneration diff: `zero byte changes` (two consecutive runs, §8.5)
- source audits: `pass` — `new AudioManager` in BootScene only; no `stopAll`; `ui:*` emitters only in MenuScene, GameScene, PhaserPauseView, PhaserRunSummaryView
- manual matrix: `unrun` — no interactive browser session available in the implementation environment; rows requiring one (first-gesture unlock, settings live apply, combat cues, F8/F9 dev, Retry, menu↔game cycles, no-assets boot, 390×844 emulation, real mobile) were not executed and must not be claimed. The production-preview asset-serve check ran headlessly and passed: `vite preview` served every `.wav` with exact byte sizes from the Vite public output.
- explicitly deferred/unrun: hosted CI; interactive browser manual matrix (§10) including real mobile; final sound design and mixing (out of scope, §2.7).

Until every acceptance criterion has evidence, status remains
**implementation-ready**, not Epic 10 complete.
