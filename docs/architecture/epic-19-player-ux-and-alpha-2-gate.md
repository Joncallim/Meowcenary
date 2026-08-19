# Epic 19 — Player UX and Alpha 2 Gate

**Issue:** #78 · **Base:** `main` @ `f34e277` (Epic 18 runtime merge, PR #106)

> Status: **implementation-ready architecture; runtime not yet implemented.**
> This document is the authoritative implementation contract for Epic 19.
> The architecture PR is intentionally documentation-only. Runtime work lands
> in ordered slices after this contract is reviewed and merged.
>
> Maintainer decision record (2026-08-19): the §4 mapping tables are approved
> as frozen; floating is the confirmed production touch-stick mode (D12); the
> no-dash default (D10) is confirmed — Slice 4 evidence can still overturn
> either, but only through an architecture amendment; §6 device coverage is
> deferred, so unavailable device rows will be recorded unverified per the
> honesty rule.

## 1. Outcome

Epic 19 is the final Alpha 2 player-experience gate. It freezes one
platform-neutral logical input/action layer shared by touch, keyboard, and game
controller; makes the entire player journey — launch → menu → character/arena →
run → upgrade chooser → rack/merge → pause → settings → summary → Retry/Menu —
completable controller-only with visible focus and no pointer dependency;
validates portrait touch movement and thumb ergonomics with recorded evidence;
and proves the Golden Run is a good player experience on touch and controller,
not merely a green test suite.

The finished epic has:

- one frozen `GameAction` vocabulary plus a separate analog movement intent,
  consumed identically by gameplay and UI on all three device families;
- every player-facing surface operable through logical nav/confirm/back with an
  explicit visible focus indicator; touch direct-selection preserved everywhere;
- analog deadzone/normalization, multi-touch movement pinning, gamepad
  connect/disconnect held-state clearing, and mixed-input duplicate-command
  suppression, all owned by one adapter boundary;
- a maintainer-confirmed floating touch stick, validated at phone scale in the
  gate record (anchored retained only as a dev diagnostic variant);
- a dash/evade shipped **only** if the recorded movement-agency gate fails
  movement-only play; otherwise a recorded no-dash decision;
- a reserved `ability` action and mapping for Epic 24 with zero Epic 19 consumer
  and zero dead UI chrome;
- no save-schema change, no new persistent settings, no remapping UI, no
  right-stick/manual aiming, no gameplay rules inside device adapters;
- a player-experience gate record with honestly verified/unverified device rows.

Epic 19 ends only when the Golden Run passes the §10 player-experience gate on
touch and controller with recorded evidence, per the roadmap gate rule.

## 2. Repository architecture pass

### Existing boundaries to preserve

- **Command-based UI controllers are already device-agnostic.** `PauseController`
  (`src/ui/pause.ts:19`) owns the `closed → pause → inventory` panel state
  machine and accepts `pause()/resume()/openInventory()/openInventoryFromRun()/back()`
  commands with full state guards. `MainMenuController` (`src/ui/menus.ts:27`)
  owns panel navigation plus selection/purchase/settings/reset commands.
  `InventoryController` owns `toggle()/clearSelection()/mergeSelected()`.
  `SettingsController` owns `set()` + `cycleVolumeStep()`.
  `UpgradeChooserController` owns the offer-token command flow with
  `submitting` guards and stale-`offerId` rejection. Epic 19 **drives** these
  owners from logical actions; it never re-implements or bypasses them.
- **The Epic 18 (D9) chooser seam is live and tested**:
  `focusPrevious() / focusNext() / confirmFocused()` on the `UpgradeChooser`
  facade (`src/ui/UpgradeChooser.ts:42-52`), mirrored on the
  `UpgradeChooserView` interface (`src/ui/upgradeChooserController.ts:23-27`).
  Epic 19 consumes this seam; it does not reach into the Phaser view.
- **`ui:navigate` / `ui:confirm` / `ui:back` bus events** are the Epic 10 audio
  feedback vocabulary, emitted only from view/scene command-dispatch points.
  That ownership is unchanged: logical actions are **not** domain events and
  must not be added to `GameEventMap`.
- **`InputController` movement abstraction** (`src/systems/input.ts`):
  `getMoveVector()` is consumed only by `Player.update()`;
  `getPresentationSnapshot()` only by `ControlsView`; `getPointer()` only by the
  GameScene debug overlay (`GameScene.ts:448`). Movement intent is already
  device-agnostic at the consumer boundary.
- **Pause ownership** stays in `runState.ts`
  (`pauseRun/resumeRun`, `PauseReason = 'manual' | 'levelUp'`); a `levelUp`
  pause cannot be resumed by the manual path, and `GameScene.syncPhysicsPause`
  gates physics on `status !== 'active'`. Input routing changes must not alter
  these semantics.
- **Scene topology**: Boot → Menu → Game via `scene.start` only; exactly one
  scene is active at a time, so scene-scoped input lifecycles reset held state
  across transitions by construction.
- **Number-key shortcuts** (chooser 1–5, rack 1–6) remain optional view-local
  shortcuts per the Epic 18/19 seam; they are not the selection architecture.
- **Dev-only cheats** (F3 overlay, F4 physics debug, F8/F9/F10 in dev builds)
  remain raw keyboard listeners. They are outside the player journey and
  outside the controller gate.

### Gaps Epic 19 must close

- **No gamepad support exists anywhere.** Zero gamepad references in `src/`;
  `src/main.ts` does not enable Phaser's gamepad plugin.
- **No logical action layer.** Raw device listeners are attached independently
  in at least ten places: `MenuScene.ts:44-48` (ESC/UP/DOWN/ENTER/SPACE),
  `GameScene.ts:388-395` (P/ESC/I + dev keys), `UpgradeChooser.ts:106`
  (keydown), `weaponRackView.ts:63` (keydown), `runSummary.ts:101` (keydown-R),
  `debug.ts:25` (F3), plus pointer-only widgets (`modal.ts:111-112`,
  `hud.ts:366`, `controls.ts:95-96`) and per-element pointer handlers in
  MenuScene/chooser/rack.
- **Focus is re-implemented per surface and uneven.** MenuScene: color-only
  focus, `focusIndex` reset to 0 on every re-render (`MenuScene.ts:69-70`).
  Chooser: full `FocusStroke` ring (the good pattern). Weapon rack: number keys
  only, no cursor. Pause panel and run summary: no focus at all — their buttons
  are pointer-only (`modal.ts:110-113`); run summary has no keyboard path to
  "Main Menu".
- **Multi-touch is broken by default.** `main.ts` does not set
  `input.activePointers`, so Phaser's single-pointer default applies: a second
  simultaneous touch cannot register, so moving and tapping pause/a button at
  once is impossible. Worse, `InputController.handlePointerDown`
  (`input.ts:109-113`) re-anchors the movement origin on **any** pointerdown —
  no pointer-identity tracking.
- **No analog tuning surface.** The 64px stick radius is hard-coded in both
  `input.ts:106` and `controls.ts:7`; there are no deadzones, no
  normalization policy, and no input section in `RuntimeConfig`.
- **No lifecycle safety for devices.** No connect/disconnect handling, no
  held-state clearing, no mixed-input duplicate-suppression story beyond the
  transactional guards inside individual command owners.
- **Audio unlock has no controller path.** Both scenes arm a
  pointerdown + any-keydown pair (e.g. `MenuScene.ts:559-570`). A
  controller-only journey has no unlock trigger, and browsers may not treat
  gamepad input as user activation for `AudioContext`.
- **MenuScene never polls input** (`update()` only ticks audio), so a polled
  adapter model requires an explicit menu-scene update wiring decision.

## 3. Frozen decisions

### D1 — The logical action vocabulary is frozen now

`docs/epics.md` and `docs/architecture.md` carry an *illustrative* `GameAction`.
This pass freezes the live Alpha 2 contract:

```ts
type GameAction =
  | 'confirm'
  | 'back'
  | 'pause'
  | 'inventory'
  | 'dash'        // reserved; consumer gated by D11 evidence
  | 'ability'     // reserved for Epic 24; no Epic 19 consumer
  | 'navUp'
  | 'navDown'
  | 'navLeft'
  | 'navRight';

type InputSource = 'keyboard' | 'pointer' | 'gamepad';

interface ActionEdge {
  readonly action: GameAction;
  readonly source: InputSource;
}
```

Movement is **not** an action. It remains a separate analog vector intent
(`Vec2`, magnitude 0–1) with its own ownership policy (D4). The vocabulary is
additive-frozen for Alpha 2: Epic 24 consumes `ability`; no epic adds actions
without an architecture amendment. Closeout syncs the "illustrative" wording
in `docs/epics.md` / `docs/architecture.md` to point here.

### D2 — One pure core, one adapter boundary, scene-scoped lifecycle

- **Pure core — `src/engine/logicalInput.ts` (no Phaser imports).** Owns the
  `GameAction`/`InputSource` types, radial deadzone normalization, per-source
  held state, pressed-edge derivation, cross-source edge coalescing, nav
  auto-repeat timing, and movement-source hysteresis (D3/D4). Everything here
  is deterministic, allocation-free in the poll path, and unit-testable
  without a scene.
- **Adapter boundary — `src/systems/input.ts`, evolving `InputController` in
  place.** It remains the single Phaser-aware input coordinator (keyboard,
  pointer, gamepad adapters live behind it). Do not create a second parallel
  input system, and do not push adapter branches into views.
- **Scene-scoped lifecycle.** Each scene constructs/destroys its
  `InputController` in `create()`/`handleShutdown()`, exactly as GameScene does
  today. Only one scene is ever active, so held state cannot leak across scene
  transitions. `GameContext` remains input-free.

### D3 — Polled adapters, derived edges, coalescing by construction

- Keyboard and gamepad adapters are **polled** once per frame from the scene
  update (GameScene already updates input first; MenuScene's `update()` gains
  the same one-line poll). Polling `Key.isDown` eliminates the OS key-repeat
  defect class by construction; existing `event.repeat` guards in views become
  redundant but harmless.
- Pointer input remains event-driven into adapter state (as today); discrete
  pointer gestures fold into the next poll. Direct taps on visible
  cards/buttons keep bypassing the logical layer as direct commands — their
  transactional owners already guard them.
- The pure core tracks held state **per source**. Effective held for an action
  is the OR across sources; a pressed edge fires only on the false→true
  transition of effective held. Consequences, both intended:
  - keyboard Enter and gamepad bottom-face going down in the same frame
    produce **exactly one** logical `confirm` edge (mixed-input
    duplicate-suppression rule);
  - releasing one device while another still holds produces no spurious
    release/re-press.
- Dispatch: `InputController.onAction(action, listener): () => void`, invoked
  synchronously during the scene's update immediately after the poll, over a
  copied listener snapshot (same re-entrancy pattern as `eventBus.emit`).
- Command owners remain the authoritative idempotency layer (chooser offer
  tokens, pause panel guards, inventory selection rules, menu revision
  checks). Edge coalescing is a convenience, not a replacement for those
  guards.
- Nav auto-repeat: while a nav action stays held beyond
  `navRepeat.delayMs`, repeat edges emit every `navRepeat.intervalMs`
  (initial values in §4 config, tuned only with recorded evidence). Repeat
  state resets on release or direction change. No other action repeats.

### D4 — One movement owner; deadzones at the adapter boundary

- Movement vectors are computed per source. The **movement owner** is the most
  recent source to exceed its deadzone; it keeps ownership until its magnitude
  stays below the deadzone for one full poll, at which point ownership is
  re-evaluated. This replaces today's keyboard+pointer vector **summation**
  (`input.ts:53`): summing N devices lets a stuck touch drift the player while
  another device is in use. Ownership hysteresis is deterministic and
  testable.
- Gamepad left stick: radial deadzone, rescaled `[deadzone, 1] → [0,1]`, then
  length-clamped to 1. Keyboard: digital normalize as today. Touch: drag delta
  divided by the configured stick radius, clamped to 1 (current behavior).
- Right stick is intentionally unmapped. Required manual/twin-stick aiming
  remains outside the product direction.

### D5 — Frozen mapping tables (§4); positions, never vendor labels

Mappings reference standard-layout **positions** (bottom face button, right
shoulder, Menu/Start), never Xbox/PlayStation vendor names, in code, config,
copy, or tests. Non-standard pads that do not follow the standard mapping are
recorded as unsupported in the gate record, not special-cased.

### D6 — Focus and navigation converge on one owner

- New Phaser-free `src/ui/focusList.ts`: a minimal `FocusNavigator` supporting
  a linear ordered list and a regular columns-based grid (move up/down/left/
  right with wrap in linear mode; clamped index arithmetic in grid mode), with
  `setCount()` clamping, `reset()`, and index preservation semantics. This is
  deliberately not a spatial/geometry nav framework.
- Views render focus with the existing `FocusStroke` theme token
  (`src/ui/theme.ts:33-37`) — the chooser's ring becomes the universal
  pattern. Color-only focus (MenuScene) is upgraded, not kept.
- Focus index is **preserved across same-panel re-renders** (clamped to the
  new item count) and resets to the first actionable item only on genuine
  panel changes. This fixes the MenuScene reset-to-top churn
  (`MenuScene.ts:69-70`) that would make settings toggles hostile on a pad.
- Pointer hover may move visible focus (existing chooser behavior) but pointer
  is never required to reach or activate anything.

### D7 — Active input source drives hints only

Extend `InputMode` to `'keyboard' | 'pointer' | 'gamepad'` (the
`InputPresentationSnapshot.mode` field). The active source changes only on a
genuine signal: movement beyond deadzone, any action edge, or pointerdown.
`ControlsView` hint copy and menu hint copy follow the active source
("Control-hint presentation may follow the last active input source" —
`docs/architecture.md`). The active source **never** changes gameplay
semantics, command availability, or RNG.

### D8 — Phaser input config: multi-touch and gamepad plugin

`src/main.ts` gains:

```ts
input: {
  activePointers: 3,   // movement + action button + spare
  gamepad: true,
},
```

The pointer adapter pins movement to the `pointer.id` that began the movement
gesture; later pointers never re-anchor movement (fixing the
`input.ts:109-113` defect) and remain available to interactive UI widgets.
Movement ends only when the pinned pointer releases.

### D9 — Audio unlock on first logical activity

The first-gesture unlock pair becomes: **any logical action edge** (any
source) **or pointerdown**, whichever arrives first, using the existing
once/cross-remove pattern. Honest platform rule: browser `AudioContext`
unlock requires user activation, and gamepad input is polled and may **not**
count as activation. If activation is denied, the existing
locked/`pendingMusicKey` behavior keeps the game fully playable and silent
until an activating gesture; this is recorded as an accepted platform
limitation in the gate record, never worked around with hacks, and never
blocks gameplay.

### D10 — Dash ships only through the evidence gate

The `dash` action and its mapping (§4) are always reserved. A dash **consumer**
is implemented only if the Slice 4 movement-agency gate (§6) records that
movement-only play is materially passive. The maintainer has confirmed no-dash
as the default stance (2026-08-19): if the gate passes movement-only, dash
stays unbound (exactly like `ability`) and the decision is recorded with
evidence. Overturning the default requires recorded evidence plus an
architecture amendment.

If dash ships, its contract is frozen here so implementation cannot drift:

- pure deterministic rules: `RuntimeConfig.gameplay.player.dash` =
  `{ speedMultiplier, durationMs, cooldownMs }`, tuned only with recorded
  evidence; no RNG; no save fields; no new events beyond reusing existing
  feedback cues;
- run-scoped state owned by `Player`, advanced only inside `Player.update()`
  while the run is `active` (pause-safe by the existing update gating);
- a bounded speed burst in the current movement direction; **no invulnerability
  frames in Alpha 2** (add i-frames only via architecture amendment with
  evidence);
- one logical action on every device: keyboard Shift, gamepad right shoulder,
  touch dash button rendered only when dash is enabled (≥ `minimumHitTarget`,
  thumb-reachable, does not overlap the stick activation zone);
- dash never interrupts the upgrade chooser/pause/summary modals; while a
  modal pause is active the dash edge is discarded like other gameplay actions.

### D11 — `ability` is a reservation, not a feature

`ability` enters the vocabulary and mapping table (keyboard Q, gamepad left
face button, reserved touch slot) so Epic 24 character abilities consume this
layer instead of inventing a device path. Epic 19 ships **no** ability
consumer, cooldown, UI chrome, hint copy, or settings entry. An unbound action
must be invisible to players.

### D12 — Floating stick is the confirmed production mode

The maintainer confirmed `floating` as the production touch-stick mode
(2026-08-19). `RuntimeConfig.gameplay.input.touchStick` = `{ radius: 64, mode:
'floating' | 'anchored', anchored: { centerX, centerY, activationRadius } }`.

- `floating` (current behavior, re-anchoring at gesture start) is the shipped
  default; the §6 touch gate validates it at phone scale rather than
  re-opening the mode decision.
- `anchored` survives only as a dev/config diagnostic — not a player-facing
  setting: fixed anchor in the lower-left safe zone; a movement gesture
  beginning inside the activation zone drives the stick from the anchor
  center; the stick visual renders at the anchor while active. It exists so
  that if floating validation surfaces real edge-clip or re-anchor problems,
  comparison evidence can be gathered without new code.
- `radius` moves from the two hard-coded sites into this config.

### D13 — Explicit exclusions

- No save-schema change, no new settings fields, no remapping UI.
- No achievements, stage/objective, Gunsmith, or Epic 20+ work.
- No gameplay rules, content IDs, or device branches inside adapters; adapters
  translate devices into D1 vocabulary and nothing else.
- No new RNG streams: input consumes no randomness.
- No synthetic cross-device event translation (e.g. the logical layer never
  fabricates Phaser pointer events; a view's internal activation funnel such
  as MenuScene's `focused.emit(POINTER_UP)` is preserved view plumbing, called
  by the logical confirm handler — not replaced by event forgery).
- Future native wrappers may add adapters; they must not fork gameplay rules
  (existing cross-epic rule, restated).

## 4. Frozen mapping and tuning tables

| Action | Keyboard | Gamepad (standard-layout position) | Touch |
| --- | --- | --- | --- |
| `confirm` | Enter, Space | bottom face button (A/Cross position) | direct tap on the visible control |
| `back` | Esc | right face button (B/Circle position) | visible Back affordance |
| `pause` | P | Menu/Start position | HUD pause button |
| `inventory` | I | top face button (Y/Triangle position) | HUD rack button |
| `dash` (if enabled) | Shift (either) | right shoulder (RB/R1 position) | dash button, only when enabled |
| `ability` (reserved) | Q | left face button (X/Square position) | reserved slot; no chrome |
| `navUp/Down/Left/Right` | Arrow keys | D-pad + left-stick digital projection | n/a — direct selection |
| movement (analog) | WASD + arrows | left stick (deadzoned) | virtual stick drag |

Notes:

- Esc is bound **only** to `back`, P **only** to `pause`. The run-level
  context routing in §5 reproduces today's "Esc pauses/resumes" behavior
  without one key owning two actions.
- Menu navigation intentionally excludes WASD: movement keys stay movement
  vocabulary so a player resting on WASD cannot drift menu focus.
- Number keys 1–5 (chooser) and 1–6 (rack) survive as optional view-local
  shortcuts, per the Epic 18 seam. Dev F-keys remain raw keyboard.

Initial config values (Slice 2 wires them; later changes require recorded
evidence, same convention as Epic 18 tuning):

```ts
gameplay: {
  input: {
    touchStick: {
      radius: 64,
      mode: 'floating',
      anchored: { centerX: 82, centerY: 700, activationRadius: 120 },
    },
    gamepad: { moveDeadzone: 0.25, navThreshold: 0.5 },
    navRepeat: { delayMs: 400, intervalMs: 150 },
  },
  player: {
    // only when the D10 evidence gate enables dash:
    dash?: { speedMultiplier: 2.6, durationMs: 180, cooldownMs: 1400 },
  },
}
```

## 5. Player journey routing contract

Routing targets are the existing command owners. "—" means the edge is
deliberately discarded in that context.

| Surface / context | nav | confirm | back | pause | inventory |
| --- | --- | --- | --- | --- | --- |
| MenuScene panels (home/character/arena/progression/settings/reset) | `FocusNavigator.move` | activate focused item (single command funnel, unchanged) | `MainMenuController.back()` | — | — |
| Run, status `active`, no modal | — (movement owns sticks) | — | `PauseController.pause()` (Esc pauses, as today) | `PauseController.pause()` | `PauseController.openInventoryFromRun()` |
| Pause panel | focus Resume / Weapon Rack | activate focused | `PauseController.resume()` | `PauseController.resume()` | `PauseController.openInventory()` |
| Inventory panel (rack) | grid cursor over slots + Merge + Back (columns from `weaponRackLayout`) | toggle focused slot / activate focused button; two compatible selections expose Merge exactly as today | `PauseController.back()`; a non-empty selection clears first via `clearSelection()` (current semantics preserved) | — | — |
| Upgrade chooser (levelUp pause) | `focusPrevious()/focusNext()` (Up/Left = previous, Down/Right = next) via the Epic 18 facade | `confirmFocused()` | — (modal choice required; current rejection behavior preserved) | — | — |
| Run summary | focus Retry / Main Menu | activate focused | — (deliberate no-op: two explicit choices, no accidental exit) | — | — |
| HUD (run, touch/chrome) | — | — | — | pause button stays pointer-only; `pause` action covers controller/keyboard | rack button stays pointer-only; `inventory` action covers controller/keyboard |

Additional journey rules:

- Level-up `pause`/`back` edges are discarded while the chooser owns the modal,
  matching the current `PauseController` guards (`pause()` requires `active`;
  `resume()` requires `pauseReason === 'manual'`).
- `R` remains an optional retry shortcut on the summary; number keys remain
  optional shortcuts in chooser/rack. Shortcuts never appear in hint copy as
  the primary model.
- Every surface renders the `FocusStroke` ring on the focused element whenever
  the active source is keyboard or gamepad; with pointer active, focus
  presentation follows the existing hover/focus behavior.
- Re-renders (resize, settings toggle, purchase) preserve focus per D6.
- Scene transitions reset all held state (scene-scoped lifecycle, D2); no
  edge may fire into a scene that has not finished `create()`.

## 6. Player-experience gate targets and evidence protocol

Evidence lands in `docs/delivery/epic-19-player-experience-gate.md`, created
in Slice 4 and completed in Slice 5, following `docs/delivery/README.md` and
the honesty rule: unavailable device/browser rows stay **unverified**, never
claimed by assumption.

Device matrix rows: desktop keyboard+mouse (Chrome), desktop gamepad (Chrome,
standard-layout pad), Android Chrome touch, iOS Safari touch. Where hardware
is unavailable, the row is recorded unverified.

### Journey gate (each row verified per available device)

1. Launch → menu → select character → select arena → Start, controller-only
   (no pointer/touch at any point).
2. Full run: movement, auto-fire, level-up card choice, pause/resume,
   rack open + merge + back, controller-only.
3. Settings: change mute/volume/reduced-motion mid-menu, verify live effect
   (audio/feedback) and persistence across reload.
4. Terminal: lose a run → summary → Retry; win a run → summary → Main Menu;
   both controller-only.
5. Touch parity of rows 1–4 with direct selection (no focus requirement).
6. Disconnect/reconnect the pad mid-run and in menus: held movement/buttons
   clear, no phantom confirms, focus survives, journey continues on the pad or
   falls back to keyboard/touch without a scene restart.
7. Mixed-input soak: alternate devices rapidly; simultaneous Enter + pad
   bottom-face on a chooser produces exactly one `card:chosen`.

### Touch ergonomics gate (phone-scale, 390×844 reference)

Floating-mode validation, recorded per device: time to first comfortable
movement, accidental pause-tap count, stick re-anchor incidents per run,
deaths inside the 60s Rusher / 150s Brute pressure windows, and a 10-minute
sustained-play comfort note. The production default is already confirmed
(D12); anchored rows are optional diagnostics gathered only if floating shows
material problems.

### Movement-agency gate (dash decision)

Movement-only is judged against Epic 18's Golden Run: if recorded seeded runs
with competent play show repeated unavoidable-damage deaths in the Rusher/
Brute pressure windows that positioning cannot solve, the D10 dash consumer
ships (via architecture amendment) and the gate re-runs with dash enabled.
Otherwise the confirmed no-dash default stands and the evidence is recorded.
This is a human playtest judgment backed by the recorded evidence; it cannot
be closed by automated tests.

### Performance gate

The poll path performs zero per-frame allocations (reused edge buffer), the
full suite and Epic 18 performance posture hold, and a late-wave run shows no
frame-budget regression attributable to input polling.

## 7. File ownership map for runtime implementation

```text
src/engine/logicalInput.ts            (new)
  GameAction/InputSource/ActionEdge types; deadzone normalization; per-source
  held + edge derivation + coalescing; nav repeat; movement-owner hysteresis

src/systems/input.ts
  InputController evolved in place: keyboard/pointer/gamepad adapters,
  pointer-id movement pinning, onAction subscription/dispatch, active-source
  tracking, extended presentation snapshot, getMoveVector unchanged for Player

src/engine/config.ts
  gameplay.input section; optional gameplay.player.dash (D10 gate only)

src/main.ts
  input.activePointers = 3; input.gamepad = true

src/ui/focusList.ts                   (new, Phaser-free)
  FocusNavigator linear/grid semantics

src/ui/theme.ts
  reuse existing FocusStroke; add tokens only if a surface proves a real gap

src/ui/modal.ts
  modal buttons become focus-registrable (pause + summary surfaces)

src/scenes/MenuScene.ts
  raw key listeners -> logical actions; FocusNavigator + ring; focus
  preservation; source-aware hint copy; unlock on first logical activity

src/scenes/GameScene.ts
  P/ESC/I routing -> logical actions (same command bodies); chooser facade
  wiring while levelUp modal owns input; unlock on first logical activity;
  dash command wiring only under the D10 gate; dev F-keys stay raw

src/ui/controls.ts
  source-aware hints; anchored-stick variant; dash button only when enabled;
  ability slot reserved with no chrome; multi-touch-safe widget hit areas

src/ui/pause.ts
  pause panel buttons focusable/navigable; routing unchanged

src/ui/runSummary.ts
  Retry/Main Menu focus nav + confirm; R shortcut retained

src/ui/weaponRackView.ts
  grid focus cursor via FocusNavigator; number shortcuts retained; selection
  semantics unchanged

src/ui/UpgradeChooser.ts
  logical nav/confirm drive the existing Epic 18 facade; number shortcuts
  retained; pointer direct-select unchanged

src/ui/hud.ts
  unchanged except hint-copy source awareness if needed; buttons stay
  pointer-only by design (actions cover controller/keyboard)

src/systems/audio.ts
  no structural change; scenes extend the unlock trigger per D9

tests/
  logicalInput.test.ts (new), input.test.ts (evolved), focusList.test.ts (new),
  menuScene/gameScene journey tests, chooser/rack/pause/summary focus tests,
  __mocks__/phaser.ts extended with minimal keyboard/gamepad fakes

docs/delivery/epic-19-player-experience-gate.md   (created in Slice 4)
```

`GameScene` and `MenuScene` remain composition/lifecycle glue: they route
logical actions to command owners and must not gain device branches, mapping
tables, or gameplay rules.

## 8. Ordered runtime slices

### Slice 1 — Pure logical core and config

- add `src/engine/logicalInput.ts` (D1 vocabulary, deadzone, held/edge/
  coalescing, nav repeat, movement hysteresis);
- add `RuntimeConfig.gameplay.input` (§4 initial values);
- no runtime wiring yet — zero behavior change.

Gate: pure unit tests cover edge/coalescing/repeat/hysteresis/deadzone
exhaustively, including same-frame multi-source confirm and stuck-source
movement takeover; full suite, lint, build stay green.

### Slice 2 — Adapters, Phaser config, and run-level migration

- evolve `InputController` with the three adapters, pointer-id pinning,
  `onAction` dispatch, active-source tracking, extended snapshot;
- `main.ts`: `activePointers: 3`, `gamepad: true`;
- GameScene routes pause/inventory/back through logical actions (same command
  bodies); MenuScene migrates to logical actions + poll in `update()`;
- audio unlock on first logical activity (D9);
- gamepad connect/disconnect clears pad-held state with no phantom edges;
- ControlsView hints follow active source.

Gate: `tests/input.test.ts` evolved; new adapter tests with minimal keyboard/
gamepad fakes; menu journey test drives the menu headlessly via logical
actions only; existing suites (controls, pauseController, menuScene) updated
deliberately and green; manual smoke: keyboard-only menu→run→pause→summary
loop works exactly as before.

### Slice 3 — Focus convergence and the controller-only journey

- add `src/ui/focusList.ts`; migrate MenuScene (ring + preservation), pause
  panel, run summary, weapon-rack grid cursor;
- wire logical nav/confirm into the chooser facade;
- modal buttons gain focus registration;
- hint copy updated per surface; number/R shortcuts retained.

Gate: every §5 row is executable headlessly through logical actions in tests
(command-level journey from menu to Retry/Menu with zero pointer events);
all view suites green; 390×844 layout/readability unchanged.

### Slice 4 — Touch ergonomics validation and dash evidence

- wire the config-backed anchored dev variant alongside the confirmed floating
  default (D12);
- create `docs/delivery/epic-19-player-experience-gate.md`; record the §6
  floating-validation rows (anchored comparison optional, diagnostic only);
- run the movement-agency gate against the confirmed no-dash default; ship the
  D10 dash consumer only if recorded evidence overturns the default through an
  architecture amendment, with pure dash tests (determinism, pause-safety,
  cooldown, modal discard) and per-device binding tests;
- verify the D11 ability reservation compiles into the vocabulary/mapping with
  zero consumer and zero chrome.

Gate: evidence rows are real (seed, device, outcome, decision); dash, if
present, touches no save/RNG/event contracts; if absent, the reserved action
is provably invisible.

### Slice 5 — Player-experience gate closeout and independent re-review

- complete the §6/§10 matrices on available hardware with honest unverified
  rows;
- disconnect/reconnect, mixed-input, and duplicate-suppression soaks;
- reduced-motion and resize regression passes; late-wave performance check;
- independent orthogonal review across input ownership, focus correctness,
  lifecycle/leaks, re-entrancy, determinism, portability, and doc truth;
- closeout doc sync: point the "illustrative" `GameAction` wording in
  `docs/epics.md` / `docs/architecture.md` and the Epic 19 sections of
  `docs/roadmap.md` / `docs/knowledge-graph.md` at this contract.

Gate: full suite green with at least two independently shuffled reruns;
lint/build/`art:validate`/`git diff --check` clean; the gate record shows no
required row resting on an unverified assumption; #94 is unblocked only after
this epic's gate passes.

## 9. Automated acceptance matrix

### Logical core

- every `GameAction` derives pressed edges only on effective false→true;
- same-frame multi-source presses of one action yield exactly one edge;
- releasing one of two holding sources produces no edge and no drop;
- held state is per-source; disconnect clear emits no edges;
- nav repeat honors delay/interval and resets on release/direction change;
- deadzone rescale maps `[dz,1]→[0,1]`, clamps outside, handles zero/NaN;
- movement ownership follows recency-above-deadzone hysteresis and never sums
  devices;
- no RNG consumption; pure module imports no Phaser.

### Adapters and lifecycle

- keyboard polling ignores OS repeat by construction;
- gamepad connect mid-scene is usable without restart; disconnect clears pad
  movement/buttons immediately;
- movement stays pinned to the initiating `pointer.id`; a second pointer never
  re-anchors it; release of the pinned pointer ends movement;
- active source changes only on genuine signals and only affects hints;
- scene shutdown unsubscribes all action listeners and adapter events (no
  leaks across menu↔game transitions);
- audio unlock fires on first logical activity and degrades to the existing
  locked/pending behavior when activation is denied.

### Surfaces and commands

- every §5 routing row is covered by a headless logical-action test;
- chooser: facade path preserves token/stale/re-entrant guards; number
  shortcuts still optional; pointer direct-select unchanged;
- rack: grid cursor wraps/clamps per layout columns; selection/merge semantics
  and `weapon:merged` flow unchanged;
- summary: nav+confirm reach both buttons; back is a no-op; `R` still retries;
- pause: focus nav cannot resume a `levelUp` pause; `back()` ordering
  (clear selection → panel walk) unchanged;
- menu: focus preserved across same-panel re-renders, reset on panel change;
  settings rows keep stepper semantics; reset confirmation still requires its
  two-step command flow.

### Compatibility and regression

- `getMoveVector()` contract to `Player` unchanged; `getPresentationSnapshot()`
  extended additively;
- `ui:navigate`/`ui:confirm`/`ui:back` still emitted exactly once per accepted
  command from the same dispatch points;
- no `GameEventMap` additions for input; no save-schema diff; no data-file
  changes; `art:validate` unaffected;
- dev cheats and physics-debug gating unchanged.

## 10. Player-experience matrix (manual gate)

Across the §6 device matrix, a player can:

- complete the whole journey with only a controller, never needing pointer,
  touch, hover, or a hidden cursor;
- always see what is focused; never lose focus on re-render, resize,
  disconnect/reconnect, or device switching;
- never double-confirm a card, merge, purchase, or reset when two devices act
  together;
- read source-appropriate hints ("Drag to move" vs "WASD/arrows" vs pad
  prompts) that track the last device actually used;
- play a full Golden Run one-handed on a phone comfortably in the chosen stick
  mode, with pause and (if shipped) dash reachable by the holding thumb;
- feel that movement/positioning provides real agency; if dash shipped, it
  reads as a deliberate evade, not a required twitch reflex;
- hear audio after the first intentional input on any device, or experience
  graceful silence with deferred music where the browser denies gamepad
  activation.

Epic 19 is not complete when the code works; it completes when these rows are
recorded as verified or honestly unverified in the gate record.

## 11. Reviewer traps

- **Do not** add device branches (`if gamepad …`) to views, scenes, or gameplay
  systems; translation happens only inside `src/systems/input.ts` adapters.
- **Do not** add input actions to `GameEventMap` or move `ui:*` emission
  ownership away from command dispatch points.
- **Do not** create a second input coordinator or put input into `GameContext`.
- **Do not** sum movement vectors across devices; use the D4 ownership
  hysteresis.
- **Do not** bind vendor button names (A/B/X/Y, Cross/Circle) anywhere;
  mappings use standard-layout positions.
- **Do not** map the right stick; required manual aim is out of direction.
- **Do not** make number keys, `R`, or any shortcut the primary selection
  model; keep them optional view-local shortcuts.
- **Do not** let `back`/`pause` escape the level-up chooser modal.
- **Do not** give the run summary a `back` exit.
- **Do not** reset menu focus on same-panel re-renders (D6).
- **Do not** build a spatial-nav framework; the `FocusNavigator` is linear +
  regular-grid only.
- **Do not** ship the dash consumer without the recorded §6 movement-agency
  failure, and never add i-frames without an architecture amendment.
- **Do not** ship any ability consumer, chrome, or hint copy (D11).
- **Do not** add save fields, settings entries, remapping UI, or migrations.
- **Do not** let the logical layer synthesize Phaser pointer/key events into
  views; call their activation/command methods.
- **Do not** block gameplay on audio unlock or fake user activation (D9).
- **Do not** special-case non-standard pads; record them as unsupported.
- **Do not** allocate per frame in the poll/dispatch path.
- **Do not** move dev cheats behind the logical layer or into production
  player journeys.
- **Do not** claim device rows verified without real evidence; unverified is
  an acceptable row, an assumption is not.
- **Do not** start #94 or #92 work from this branch; Epic 19's merged gate is
  their precondition.

## 12. Orthogonal architecture re-review

This contract was reviewed against current `main` before freezing. Findings
and the corrections incorporated above:

| Axis | Finding | Correction incorporated above |
| --- | --- | --- |
| Input semantics | Evented keyboard listeners keep the OS key-repeat defect class alive in every view. | D3 polled adapters derive edges; repeat guards become redundant. |
| Duplicate commands | Per-source edge counting would double-fire confirm when two devices act in one frame. | D3 effective-OR held state coalesces same-frame multi-source presses by construction; command owners stay the authoritative guard. |
| Key ambiguity | Binding Esc to both pause and back risks double routing; Space as both confirm and dash would collide across pause contexts. | §4 binds Esc→`back`, P→`pause`, dash→Shift; §5 context routing reproduces current behavior. |
| Movement truth | Today's keyboard+pointer summation lets a stuck touch drift the player under mixed input. | D4 single-owner hysteresis replaces summation. |
| Focus churn | MenuScene resets focus to top on every re-render, hostile for pad-driven settings changes. | D6 preserves focus across same-panel re-renders. |
| Multi-touch | Single-pointer default plus re-anchor-on-any-pointerdown makes move+tap impossible. | D8 sets `activePointers: 3` and pins movement to one `pointer.id`. |
| Audio portability | Gamepad input may not count as browser user activation, so a controller-only journey could silently lose all audio. | D9 unlocks on any logical activity, degrades to existing deferred-music behavior, and records the platform limit honestly. |
| Bus boundary | Emitting domain events per action would pollute `GameEventMap` and the Epic 10 audio contract. | D3 uses a local subscription; `ui:*` emissions are unchanged. |
| Mapping drift | Vendor-label mappings fork per-device rules and copy. | D5/§4 positional standard-layout mapping only. |
| Nav ambiguity | WASD menu nav conflates movement and navigation vocabulary. | §4 restricts menu nav to arrows/D-pad/stick. |
| Scope creep | Building ability chrome or a generic dash now would pre-empt Epic 24 design and the dash evidence gate. | D10/D11 freeze reservations with zero consumer/chrome. |
| Over-abstraction | A spatial focus framework would exceed the actual surfaces (lists + one regular grid). | D6 minimal `FocusNavigator`. |
| Accidental exit | A `back` edge on the terminal summary could discard the run result unintentionally. | §5 makes summary `back` a deliberate no-op. |
| Test debt | The Phaser mock has no keyboard/gamepad surface, tempting untested adapter code. | §7 extends `tests/__mocks__/phaser.ts` with minimal fakes; journey tests are mandatory slice gates. |

No unresolved material architecture finding remains after these corrections.

## 13. Implementation-agent handoff

Implementation agents work one slice at a time from current `main` after this
architecture PR merges.

For every slice:

1. re-read this document plus the immediately-owned source/tests;
2. re-inspect current `main` before coding; if live code contradicts this
   contract, stop and amend architecture rather than silently choosing a third
   design;
3. do not redesign frozen decisions unless live evidence contradicts them;
4. implement the smallest coherent slice;
5. add focused negative/adversarial regression tests, not only happy paths;
6. run focused tests, then full tests, lint, build, `art:validate`, and
   `git diff --check`;
7. review the diff specifically for device branches outside the adapter,
   `GameScene`/view rule leakage, per-frame allocations, listener/lifecycle
   leaks, focus-loss on re-render, duplicate-command paths, and doc drift;
8. record player-experience evidence only in the gate record, never as
   unexplained prose here.

A lower-tier implementation agent should not need to decide the action
vocabulary, mappings, deadzone policy, edge/coalescing semantics, movement
ownership, focus behavior, unlock strategy, dash go/no-go criteria, journey
routing, or slice order; those decisions are frozen here. The stick-mode
default and the no-dash stance are maintainer-confirmed (2026-08-19); Slice 4
evidence can overturn either only through an architecture amendment, and the
§6 gate rows still require real recorded evidence.
