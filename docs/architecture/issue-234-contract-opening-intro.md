# #234 — Expanded contracts and one run-opening owner

Status: architecture candidate R2, 10 October 2026. R1.1 (`f8cfc52`) received one fresh lifecycle PASS and one fresh product FAIL with two P2 blockers (captured objective projection; optional-contract completion semantics). This revision resolves those design findings and awaits both reviewers’ delta verdicts; the implementation gate remains CLOSED. **No engine implementation is authorized by this document until two fresh independent Astra architecture reviews have no unresolved blockers and the coordinator releases the gate.** This is an engineering review gate, not a user approval request.

Baseline: `main a100e053ce4e2bc48bc4b8844e7da5010d562096`. Work branch: `codex/redesign-contracts-20261010`. Related scope: [#234](https://github.com/Joncallim/Meowcenary/issues/234), [#85](https://github.com/Joncallim/Meowcenary/issues/85), [#171](https://github.com/Joncallim/Meowcenary/issues/171), [#196](https://github.com/Joncallim/Meowcenary/issues/196). The reviewed [#231 ability packet at bbeca558](https://github.com/Joncallim/Meowcenary/tree/bbeca5586980ba1914c8270e08bb61306baa70de/docs/art/design-handoff-2026-10-09) is input to this design, not runtime already present on main.

Read with [shared foundation](alpha-3-shared-foundation.md), [content extensibility](alpha-3-content-extensibility-contract.md), [V4 final handoff](alpha-3-final-execution-handoff.md), [authoring templates](content-authoring-templates-v4.md), [content matrix](../gameplay/alpha-3-contract-content-matrix.md), and [engagement benchmark](../gameplay/alpha-3-engagement-benchmark.md). Newer V4 persistence rules supersede historical V3 descriptions.

## 1. Goal and bounded scope

Add four distinct post-Warden contracts using the current objective, encounter, difficulty and reward primitives. Give the two existing bosses a short, original opening taunt without slowing replays or introducing a second input/pause lifecycle. One frozen intro owns the selected mercenary's ability brief and optional boss card; combat starts exactly once after the player's command.

This tranche does not add camera tracks, timelines, script execution, voice assets, branching narrative, dialogue history saves, new boss mechanics, a cutscene Scene, or an independent input controller. The broader in-combat ability receipts/HUD/FX work in #196 remains separately owned. This tranche consumes its pure ability explanation and implements only the shared pre-run brief needed to avoid competing intro owners.

## 2. Source audit and concrete traps

| Existing owner | Baseline evidence and required consequence |
|---|---|
| `src/gameplay/runState.ts` | `createRunState` creates `intro`; `startRun` already guards `intro -> active` and emits `run:start`. Reuse it; add no RunStatus or PauseReason. |
| `src/scenes/GameScene.ts` | `create` calls `startRun` immediately near line 721; remove that call in favor of one guarded intro completion. `syncPhysicsPause` already freezes non-active state. |
| `GameScene.create` boss materialization | Lines 565–567 spawn the boss before `startRun`; `enemy:spawned` listener records Compendium discovery immediately. Move boss materialization to the first active simulation boundary, not merely freeze existing boss AI. Otherwise cancelling its taunt would write discovery. |
| `GameScene.update` | `updateStageObjective` rejects non-active state, but `player.update` and every `system.update` are still called unless pending clear. Add an explicit intro return before the stage/simulation/persistence retry phase; do not assume all present/future systems self-guard. |
| `src/gameplay/stage/stageRuntime.ts` | First `tick` activates StageState and advances survive progress. Never call it in intro. StartRun activates RunState; first subsequent gameplay tick activates StageState, retaining current ordering. |
| `src/systems/input.ts` | `quarantineUntilNeutral` stops later sampled edges, returns zero movement and suspends pointer capture. It does not currently expose quarantine to directly invoked UI callbacks. Add only a read-only readiness query, under a shared-file lease, and test that seam. |
| `GameScene.syncGameplayPointerOwnership` | Derives pointer ownership from active state/modal/orientation. Intro entry must explicitly call `suspendGameplayPointer`, since the scene's reset flag alone does not suspend the newly created adapter. |
| `MenuScene.startRunWithResources` | Owns `runLaunchGeneration`, serial texture/audio loads, stale completion guards and recoverable failure. Extend this exact gate; never create an intro loader. |
| `resourceLoader.resolveRunPhysicalResources` | Loads selected ability icon and recursively composed enemies, including boss, summons and split children. Selected mercenary portrait is currently absent and must be added for the brief; boss actor is already in the closure. |
| `stage/spawnComposition.ts` | Roster order is semantic: N layers enter at floor(index * 120 / N). Weight increases cadence; no random global pool. Four/five/six rows yield 30/24/20-second layers. Preserve all old profiles. |
| `src/data/enemies.json` | Junk Nester is `ranged`, not a `spawner` archetype; Shard Bot is `chaser`, not `splitter`. New objective tags must use real archetypes and encounters that make the intended target unambiguous. |
| `StageRegistry` | Menu order follows prerequisite depth then display order. Add a sequential four-contract extension after Warden so continuation is unambiguous; no menu IDs or unlock tokens. |
| `src/engine/context.ts` / stage clear | Save V4 and durable grant/settlement boundary remain authoritative. Intro has zero persistence effects. Progression worker owns context. Authoritative fact listeners must reject events while RunState is intro, so stray/development bus events cannot persist Compendium/achievement/merge facts; retain admitted batch and paused lethal semantics outside intro. |
| Installed Phaser 3.90 | `renderer/events/LOSE_WEBGL_EVENT.js` and `RESTORE_WEBGL_EVENT.js` expose `losewebgl` / `restorewebgl`. Phaser may keep updating with no GL context; wait for renderer restoration, not raw DOM restoration, before rebuilding UI. |

Focused baseline tests read: `stageRuntime`, `stageState`, `stageResolution`, `stageSpawnComposition`, `inputQuarantineBoundary`, and the scene/resource lifecycle suites. Existing mock scene tests assume an immediately active run; migrate those fixtures explicitly through the real intro command, not by deleting lifecycle assertions.

## 3. One launch composition and one intro owner

Menu captures the immutable `ComposedRunRequest`, run presentation baseline and stage plan. After arena work lands, it also captures that worker's single resolved geometry. In the **same preparation function**, resolve intro presentation, derive resource closure, await texture/audio, revalidate generation, then start GameScene with those exact values. A resource retry preserves this request/seed/resolved geometry. A terminal Replay/Retry follows the arena owner's new-seed policy through Menu; intro never reseeds anything.

One new pure `RunStartIntroController` owns only which of at most two cards is visible and whether its launch token has been consumed. It neither calls Phaser nor starts/pauses a run. One `RunStartIntroView` owns display/focus and delegates commands. GameScene wires returned effects to its existing run/input/lifecycle owners. No other object can invoke intro-related `startRun`.

Proposed exact public seams (implementation may narrow private fields, not fork these authorities):

```ts
// src/gameplay/stage/stageContracts.ts
interface StageOpeningDialogue {
  readonly speakerEnemyId: string;
  readonly lines: readonly string[]; // 1–2, <=100 chars each, <=160 total
}
// StageDefinition.campaignRole?: 'main' | 'optional'
// Missing campaignRole means 'main' for existing rows/fixtures.
// StageDefinition.openingDialogue?: StageOpeningDialogue
// ResolvedRunPlan.openingDialogue?: StageOpeningDialogue (cloned/deep-frozen)

// src/presentation/runStartIntro.ts — pure, no Phaser
interface RunStartIntroModel {
  readonly identity: Readonly<{
    characterId: string; stageId?: string; arenaId: string;
    seed: number; contentVersion: string;
  }>;
  readonly objective:
    | Readonly<{ kind: 'stage'; definition: ObjectiveType;
        presentation: ObjectivePresentation }>
    | Readonly<{ kind: 'training'; copy: string; durationSeconds: number }>;
  readonly ability: Readonly<{
    characterName: string; portraitArtId: string;
    iconArtId: string; name: string; effect: AbilityEffectPresentation;
  }>;
  readonly boss?: Readonly<{
    enemyId: string; name: string; actorArtId: string;
    lines: readonly string[];
  }>;
}
resolveRunStartIntroModel(options: {
  data: GameData; request: ComposedRunRequest; plan?: ResolvedRunPlan;
}): Readonly<RunStartIntroModel>;
requiredRunStartIntroArtIds(model: RunStartIntroModel): readonly string[];

// src/presentation/stageObjective.ts — extracted from current selection copy
interface ObjectivePresentation {
  readonly kind: ObjectiveType['type'];
  readonly copy: string;
  readonly artId: string;
}
resolveObjectivePresentation(objective: ObjectiveType, names: {
  enemyName(id: string): string | undefined;
  collectibleName(id: string): string;
}): Readonly<ObjectivePresentation>;

// src/ui/runStartIntroController.ts — pure UI state, no Phaser
// Card phases are presentation substates of RunState.intro, not run states.
type IntroPhase = 'ability' | 'boss' | 'consumed' | 'cancelled';
type IntroCommand = 'continue' | 'start' | 'skip-dialogue' | 'return-menu';
type IntroEffect = 'none' | 'show-boss' | 'begin-run' | 'return-menu';
interface IntroSnapshot {
  readonly phase: IntroPhase;
  readonly revision: number;
}
class RunStartIntroController {
  constructor(model: RunStartIntroModel);
  snapshot(): IntroSnapshot;
  command(command: IntroCommand, expectedRevision: number): IntroEffect;
  destroy(): void; // idempotently cancels unused authority
}

// src/ui/runStartIntroView.ts — only Phaser display/focus/layout
class RunStartIntroView {
  constructor(options: {
    scene: Phaser.Scene; model: RunStartIntroModel;
    onCommand: (command: IntroCommand, revision: number) => void;
    canInteract: () => boolean; readInputMode: () => InputMode;
  });
  render(snapshot: IntroSnapshot): void;
  moveFocus(direction: FocusDirection): void;
  confirmFocused(): void;
  refreshInputPresentation(): void;
  reflow(): void;
  destroy(): void;
}

// src/systems/input.ts — single existing adapter, lease required
isQuarantined(): boolean; // returns quarantinedUntilNeutral, no mutation

// scene-local wiring, not another public manager
handleIntroCommand(command: IntroCommand, revision: number): void;
beginRunFromIntro(): void;
returnFromIntro(error?: string): void;
```

`resolveAbilityEffectPresentation` is the exhaustive pure resolver from #196/#231. Reuse it if integration has landed; otherwise add only that pure resolver with the documented six effect kinds and eight expected snapshots. Do not derive mechanical copy from free text or implement in-combat receipt/FX changes in this workstream. A missing character, ability or mandatory presentation fails preparation; all current mercenaries have an ability. Training uses the same one-card brief, without a boss card or persistence.

The stage objective is deep-cloned from **the captured `ResolvedRunPlan.objective.definition`**, not reread from selectedStageId, a mutable catalog, or live StageRuntime. The pure model resolver formats that exact definition through `resolveObjectivePresentation`, extracted from the existing `StageSelectionController.objectivePresentation` into `src/presentation/stageObjective.ts`. Both selection and intro consume this one exhaustive formatter; presentation names are resolved from the same captured catalog snapshot. Current count/tag, collected-item name, exact survive duration and named defeat target must appear. The returned definition and presentation are deeply frozen. Stage cards display `objective.presentation.copy` and its required logical art binding; `requiredRunStartIntroArtIds` includes that objective icon alongside portrait, ability and boss art.

Training has no Stage objective. Its discriminated projection is `{kind:'training', durationSeconds: <captured arena spawn-curve duration>, copy: 'Training — survive <formatted duration>. Progress is not saved.'}`. It uses the same duration formatter as stage survive copy and adds no objective icon/resource or implicit Stage fact. Resolve and freeze this from the captured training arena/curve before resource loading; a missing curve fails preparation.

A mandatory selection-mutation test pauses the resource promise, changes selected stage/mercenary and their displayed Menu selection, then completes loading. The created intro must still show the original captured stage objective/name/count, character, ability and art closure (or be rejected by revoked generation), never a mixture. A plan/model objective mismatch before GameScene construction fails preparation. A synthetic changed objective verifies that selection and intro copy agree without changing the formatter.

Model identities must match the captured request/plan and content version before entities/intro mount. GameScene does not re-resolve a newer selected character or stage from mutable Menu selection. Derived `actorArtId` follows the existing registry convention `enemy:<speakerEnemyId>` in the pure presentation resolver, never in the scene. No newly duplicated authored portrait field is necessary for bosses.

## 4. Transitions, command semantics and start boundary

| Run / intro state | Input or event | Result |
|---|---|---|
| Menu preparing | success, matching generation | GameScene created frozen; input quarantined; ability card shown |
| Menu preparing | Back, shutdown, newer launch | revoke generation; late completions cannot enter GameScene |
| intro / ability, no boss | focused Start + Confirm | consume intro authority; begin once |
| intro / ability, boss exists | focused Continue + Confirm | increment revision; show boss; quarantine again |
| intro / ability, boss exists | focused Start / Skip dialogue + Confirm | consume intro authority; begin once, bypass boss card |
| intro / boss | focused Start + Confirm | consume intro authority; begin once |
| either card | Back / Return to Contracts | cancel; destroy; Menu, no loss/settlement |
| either card | Pause, Inventory, Ability, Dash, movement | inert; no buffered gameplay command |
| either card | resize | same phase and semantic focused key; reflow only |
| either card | renderer lost / orientation blocked | keep same card state; block every command; quarantine; physics remains frozen |
| either card | renderer restored and bindings valid | rebuild/reflow same card; quarantine; next neutral poll permits interaction |
| either card | required resource/model/view failure | cancel; return captured request to Menu failure/retry surface; no combat |
| consumed/cancelled | any stale/double/mixed command | no-op |

No typewriter, auto-advance timeout, mandatory animation or press-and-hold skip. Text is complete on first paint and remains until input. Budget is **two cards maximum**, not a timeout imposed on readers. Ordinary run: one confirm after neutral. Boss run: two confirms by default or one explicit skip command. Retry shows the same immediately dismissible content; no saved seen-intro flag or forced repeat animation.

Intro handler precedence is after global orientation/renderer availability guards and before terminal/chooser/manual-pause routing. Keyboard/controller navigation uses existing `FocusNavigator`; Confirm dispatches the focused command. Touch uses the same command and revision, with pointer down/up belonging to the same live card. Back cancels rather than secretly meaning Skip. Skip is a visibly named focusable command on the ability card when a boss card follows; Start on the boss card immediately ends it. All targets >=48 physical px.

`handleIntroCommand` rejects when scene generation mismatches, RunState is not intro, renderer/orientation is blocked, input is quarantined, or revision is stale. For a valid state-changing command: controller first consumes/increments its revision; then quarantine input and invalidate old view callbacks; then render successor/destroy view. A button's pointer-up is accepted only if pointer-down was admitted on that same card revision; a pointer already down on Menu or the previous card cannot confirm a new card. Mixed pointer/keyboard same-frame actions cannot bypass the synchronous revision change.

`beginRunFromIntro` checks RunState intro plus the consumed controller effect and a scene-local `introStartCommitted` latch. Set the latch **before** callbacks; quarantine, suspend pointer, destroy the view, then invoke existing `startRun` once. Do not resume Arcade immediately inside input dispatch. `GameScene.update` captures `wasIntro` before input polling; if it was intro, refresh intro/presentation, synchronize physics and return even when that poll accepted Start. The next update is the first simulation frame; same-poll ability/nav edges are discarded by quarantine. At that first active boundary, after `StageRuntime.tick(0, 0)` activates the stage and before any player/system updates, a run-local one-shot pending boss entry calls existing `SpawnSystem.spawnEncounterEnemy` with the prepared arena boss anchor (arena-owner geometry). Consume the pending entry before calling to prevent reentrancy; scene create must no longer spawn the boss. This preserves a time-zero boss encounter while keeping Compendium discovery out of intro. The spawn must succeed or enter a visible fatal run preparation recovery path without a fabricated win/loss; required art/definition validation runs before Start to make this a defensive failure. No intro-specific boss behavior owner is added. No wall-clock delta accumulated while reading is carried into run time.

While intro, skip player/system/stage/ability ticks, achievement retries, terminal settlement and developer force-win/force-loss/chest commands. Guard **all** run:won/run:lost settlement listeners as well as the update retry path and early-exit helper against an unstarted intro; an externally injected terminal bus event cannot bypass update gating. The admission predicate must require `introStartCommitted` plus the matching authoritative terminal RunState; merely testing an event payload is insufficient. Retain the existing idempotent settlement owner after an actual start. Existing damage eligibility already rejects non-active RunState. No `run:start`, spawn, RNG draw after preparation, objective fact, Compendium fact or durable mutation occurs until Start. Preparation can compute immutable equipment/loadout and geometry as it does today; it cannot settle the run.

## 5. Resource and lifecycle closure

`resolveRunPhysicalResources` gains a required `introArtIds: readonly string[]` option supplied from `requiredRunStartIntroArtIds` for the exact prepared model (or equivalent required prepared-intro object; choose one shape consistently in implementation). Add those logical IDs to its existing `Set`, then use current `DataVisualArtRegistry` and physical dedup. Selected portrait/icon plus captured stage objective icon and optional boss actor only; no preload-all-dialogue catalog. The boss actor is already requested for gameplay, so normally adds no physical resource. Do not evict globally shared textures on intro destruction.

The Menu preparation tuple carries the same intro model into GameScene; all required bindings and atlas frames are asserted before construction and again after context restoration. Art loads occur only in the existing serialized Menu loader queue. No asynchronous intro asset load and no promises owned by the view. Optional run audio failure retains current silent-play behavior; no new boss dialogue audio dependency.

GameScene initializes its presentation-blocked flag from the **current** renderer `contextLost` state before mounting or admitting the first intro action; listening only for a future loss event is insufficient. It registers renderer `losewebgl`/`restorewebgl` listeners with named removable callbacks if the renderer exposes them. A Canvas renderer without that property is available by this check. The initial current-state check, model/resource validation and listener installation must finish before any view can call Start. Loss sets a scene-local presentation-blocked flag, quarantines input and prevents Start synchronously. It does not replace Phaser's native handlers. Restoration is handled on Phaser's `restorewebgl` event after resource recreation: verify required binding/frame availability, rebuild current view with same semantic focus and revision, quarantine, then clear the block. Rebuild creates a new view generation so stale pointer callbacks fail even if the logical card revision is unchanged. No raw DOM restore callback may claim textures are usable. Failure takes the Menu recovery path; Back is blocked during renderer loss, like every player command. Shutdown or external cancellation may still revoke the owner while loss is active, so subsequent restoration cannot resurrect it.

Context-loss behavior here applies while intro is owned; existing active-run context-loss behavior is outside this tranche. Renderer listeners can be removed when Start commits. Orientation remains the existing platform gate; it never turns intro into manual pause. Blur/background cannot auto-advance because there is no timer, and regain of UI authority quarantines input. If actual device focus testing reveals stale held sources, fix at the existing adapter seam, never a second keyboard listener in the view.

`returnFromIntro(error?)` carries `{ failedRunRequest?: ComposedRunRequest, failedRunError?: string, isTraining }` into Menu. Menu initializes its existing failed launch surface using the preserved request; Retry reruns full preparation and Back returns to normal selection. Normal intro cancellation carries no error and never uses terminal `replayRequest`, because cancellation is not a loss. This small Menu API extension must be reconciled with the arena owner's captured-layout retry payload under a lease; do not discard its seed/layout or create a second retry button path.

Shutdown/destroy revokes scene generation, cancels controller, destroys view once, removes resize/renderer/focus listeners, clears model references and delegates existing input/system cleanup. Both SHUTDOWN and DESTROY may occur; all cleanup is idempotent. Constructor/render failure destroys partial view objects through one root owned from its first allocation and returns via Menu recovery. No view closure retains entities, enemy controllers or resource promises.

## 6. Data and strict validation

Embed `openingDialogue` in the two boss Stage rows; another boss opening is a Stage-data-only change. No separate cutscene catalog/registry or `GameData` member is needed. `resolveRunPlan` deep-clones and freezes this field. Focused validation lives in `systems/validation/stages.ts` and is called through the current aggregate boundary in the established order.

Rules for a present opening:

- object has only `speakerEnemyId` and `lines`; reject unsupported script/camera/audio/timing/condition keys;
- `speakerEnemyId` is a real boss enemy and equals Stage `bossId`, resolved encounter `bossId` and defeat objective enemy;
- `lines` is an array of one or two non-empty trimmed strings, <=100 Unicode code points each and <=160 total; no newline/control characters or markup;
- boss logical actor binding is required, kind `enemy`, physical resource resolves, idle frame exists through ordinary visual-art validation;
- name comes from EnemyDefinition; do not duplicate or translate mechanical identity in dialogue;
- stage without opening remains valid; an opening on ordinary kill/collect/survive is rejected for this bounded first scope.

Original text candidates:

| Stage | Speaker | Lines |
|---|---|---|
| `stage:junkyard-05` | Scrap Crusher | “All that scrap, and you still think you're the weapon.” / “Come closer. I'll sort you with the rest.” |
| `stage:junkyard-06` | Forge Warden | “You walked through my furnace carrying a little spark.” / “Let's see what survives the heat.” |

These are flavour, not tactical instructions. Actual objective and ability explanation remain visible in the intro and HUD. No dialogue advertises a mechanic that the boss lacks.

## 7. Four-contract extension and reward contract

Preserve every shipped Stage/profile/reward/instance ID and all ten existing objectives, unlocks and encounters. In particular `stage:junkyard-06` remains Forge Warden. New contracts are a sequential **optional** post-Warden extension of the existing chapter lists (Junkyard display 6/7, Forge display 6/7), not inserted prerequisites that invalidate old progress. The existing ten clears ending at Forge Warden remain the main campaign completion milestone, even with zero optional clears. The four rows explicitly author `campaignRole: 'optional'`; absence means `main`, so all ten shipped Stage rows and old fixtures retain main-campaign membership without JSON rewrites. The first uses `stage-cleared:stage:junkyard-06`; each next uses the immediately previous new Stage ID. Stage selection already derives cross-chapter order from those prerequisites. Do not leave its current `stages.every(completed)` rule as campaign truth: that would revoke an earned campaign-complete status whenever optional rows are added.

### 7.1 Main campaign completion and optional continuation

Data owns membership through `StageDefinition.campaignRole?: 'main' | 'optional'` (enum validated by `checkStage`; unsupported values rejected). There is no completion flag in Save, no special-case Warden ID in runtime, no new chapter catalog, and no duplicate unlock token. `src/gameplay/stage/stageCompletion.ts` adds one pure projection:

```ts
interface StageCompletionSnapshot {
  readonly mainCompleted: number;
  readonly mainTotal: number;
  readonly campaignComplete: boolean; // mainTotal > 0 && all main rows cleared
  readonly optionalCompleted: number;
  readonly optionalTotal: number;
  readonly optionalComplete: boolean; // optionalTotal > 0 && all optional cleared
}
resolveStageCompletion(stages: readonly StageDefinition[],
  progress: Readonly<Record<string, { readonly completed?: boolean }>>
): Readonly<StageCompletionSnapshot>;
```

Only current catalog definitions count, so stale saved IDs cannot fake either total. Shipped main membership is pinned by a compatibility test; ordinary additions to the optional set cannot change `campaignComplete`. Main completion is a catalog-defined milestone from saved clears, not a callback from the intro.

`StageSelectionSnapshot` gains `completion: StageCompletionSnapshot`; `StageOptionView` exposes `campaignRole: 'main' | 'optional'`. Extend `StageFrontierView` with `optional-next` and `optional-replay`. For selected optional rows these kinds reflect selected-row completion, independently of the retained campaign milestone. For selected main rows, use existing `next`/`replay` until main completion, then `campaign-complete`. Therefore an existing ten-clear save resumes at Nest Breaker with `completion.campaignComplete=true`, `mainCompleted/mainTotal=10/10`, `optionalCompleted/optionalTotal=0/4`, and frontier `optional-next`; selecting Warden still yields `campaign-complete`. The frontier is an action suggestion, while completion is milestone truth.

`MenuScene.renderHome` consumes those explicit fields: at the first optional frontier, show **CAMPAIGN COMPLETE · OPTIONAL CONTRACT** with Nest Breaker objective/reward and the existing Play Contract action. Never show “campaign incomplete”, an unexplained 10/14 campaign bar, or “Replay” for an uncleared optional row. At all four optional clears show **CAMPAIGN COMPLETE · OPTIONAL CONTRACTS COMPLETE** and Replay for the selected completed row. Contract cards label optional rows as Optional. Main-campaign rows retain existing presentation.

`ProgressionOverviewController` consumes the same pure completion projection: `completedStages/totalStages` continue to mean the main campaign (10/10 after Warden), and its snapshot gains `optionalCompletedStages/totalOptionalStages`. Career copy distinguishes **Campaign 10/10 · Optional 0/4**. `nextGoals` may suggest the first optional contract, but its detail says it is optional and does not imply an unearned campaign milestone. No achievement or unlock is silently changed to require all catalog rows; progression worker retains existing stage/boss IDs and owns any new breadth goal separately.

Continuation remains the existing `continuationAfter` path across unlock order. Warden's terminal clear exposes **Next Contract** targeting Nest Breaker plus Replay/Loadout alternatives; this starts optional play without postponing its campaign completion. After each new clear it targets the next unlocked optional row. Pressure Test is the final optional row: no Next action, no wrap to First Scavenge; Replay/Loadout/Menu remain. `context.normalStageTargetId` already chooses first available incomplete, then last available; it may select Nest Breaker on reload or Pressure Test after all clears, because selected action and campaign milestone are distinct. No context implementation change is required or leased for this behavior.

Consumer owners for implementation: this workstream owns `stageCompletion.ts`, `stageContracts.ts`, `validation/stages.ts`, `StageSelectionController`, their focused tests, and the four new rows. `ProgressionOverviewController`/tests are a shared progression-worker surface: parent must lease or assign the small projection/copy delta after its current changes. Menu Home/Career/contract-label integration is under the post-arena scene lease. `RunSummary` only changes if its current continuation-derived Next affordance needs an optional label; it must not recompute completion. No engine/context change is permitted here.

Compatibility gates: (a) fresh save campaign 0/10 and optional 0/4, only first campaign contract unlocked; (b) old ten-clear V4 save reloads with campaign complete, Nest Breaker selected/unlocked, four optional rewards unclaimed; (c) Warden Next targets Nest Breaker exactly once even if context already advanced selection; (d) partial optional progress leaves campaign complete and selects next optional; (e) all fourteen clears retain campaign complete plus optional complete, no Next/wrap; (f) manually selecting Warden after fourteen clears retains its campaign-complete frontier; (g) a main-only ten-row synthetic catalog preserves the old final Warden behavior; (h) append another optional row and only optional total/continuation changes, with prior Save bytes and grants intact. Preserve the old-ten objective/profile/ID assertions while updating release-specific cardinality tests.

### 7.2 Initial content and rewards

Pressure Test uses initial Dust Mites before its tank/shield layers so its opening offers early XP/build decisions; it does not stack first-wave tank HP against an undeveloped run build. All values below are explicit initial tuning hypotheses. None is a claim of measured fun or clear time. No new persistent item instances or grant IDs; fixed first-clear currency only. Replays receive ordinary run loot, never repeat first-clear Scrap. No reward increases with intro duration or run duration.

| Stable Stage ID / name | Thesis and actual objective | Ordered encounter roster (120s composition) | Difficulty / fixed first-clear Scrap |
|---|---|---|---|
| `stage:junkyard-nest-breaker` / Nest Breaker | Stop replenishment at its source: eliminate 8 `ranged` targets; Nester is the only ranged roster member, so the player hunts summoners through their children. | dust-mite, junk-nester, scrap-skitter, bastion-beetle, trash-brute; Nester weight 2, all others 1; layers 0/24/48/72/96s. | `difficulty:salvage-hunt` HP1.45 damage1.20 speed1.02 pressure0.45 / 145 |
| `stage:junkyard-crossfire-salvage` / Crossfire Salvage | Carry routes through an early firing line: collect 32 Scrap while ranged and shielded pressure establishes before melee pursuit. | scrap-sniper, bastion-beetle, dust-mite, junk-rusher, scrap-skitter; all weights 1; 0/24/48/72/96s. | `difficulty:salvage-crossfire` HP1.40 damage1.18 speed1.00 pressure0.40 / 150 |
| `stage:forge-shatterline` / Shatterline | Cutting the crowd makes smaller pursuers: kill 70 enemies in a Shard Bot opening, then manage split bodies plus heat-lane access while keeping auto-fire productive. | shard-bot, scrap-skitter, scrap-sniper, junk-rusher, bastion-beetle; all weights 1; 0/24/48/72/96s. | `difficulty:forge-shatterline` HP1.45 damage1.22 speed1.04 pressure0.45 / 160 |
| `stage:forge-pressure-test` / Pressure Test | Survive 120s: build against initial fodder, reserve escape lanes as slow blockers establish, then change direction when fast flank/charge pressure arrives. | dust-mite, trash-brute, bastion-beetle, scrap-skitter, junk-rusher, scrap-sniper; all weights 1; 0/20/40/60/80/100s. | `difficulty:forge-pressure-test` HP1.40 damage1.20 speed1.03 pressure0.35 / 170 |

Encounter IDs are `encounter:` plus each stage suffix; rewards `reward:` plus stage suffix. No duplicate enemy IDs or new global pool. Existing Junkyard/Forge arenas and bundles remain; generated layouts come exclusively from arena work. The Crossfire ranged opening cadence inherits the composer's first wave and is a **playtest risk**; measure early burst pressure rather than assert late-game equipment guarantees safety. If unreasonable, reorder or reduce the new profile's spawnPressure/weight only; do not silently change old profiles or invent an authored timeline during implementation.

The progression worker may reference these Stage IDs and `save.stages.bestTimeMs`; all survival targets here and in the existing catalog are 120s, so a `<=180000ms` completion goal (“clear in 3 minutes or less”) is satisfiable for every row. Intro time is excluded by design. The boundary is inclusive and matches progression work: exactly 180000ms qualifies, 180001ms does not. A future >180s survival row requires goal eligibility filtering; do not reinterpret clear time as wall-clock launch time.

Cadence acceptance: each normal composition introduces a meaningful threat before 35s; traces must confirm no >35s stretch with no change in pressure, objective decisions or build. Early skilled clears are permitted; never artificially prevent completion to force all waves. Distinctness comparison must specifically contrast Nest Breaker vs Cut the Feed, Crossfire vs Scrap Run, Shatterline vs First Scavenge, and Pressure Test vs Smelter Rush. If players make the same decisions, tune these rows rather than count the extra IDs as success.

## 8. Layout and player control

Reuse established theme, portrait/icon art and frozen arena backdrop. Ability card follows #231: at 360/390 portrait, width min(viewport−32,420), >=14px body, >=22px title, 64px portrait and 48px ability icon. Boss card uses existing boss idle frame as static identity portrait (no live boss entity and no hidden simulation), speaker name, complete one/two-line text, current objective and Start. Desktop max width 560. At 844×390 use two columns and usable-height bounds. Do not shrink text to fit; accessible overflow scrolls card content while action footer remains reachable. All sizing must use current physical/logical viewport helpers rather than canvas pixel guesses.

One root per card at modal depth, focus ring on current semantic action, reduced-motion static by default. Full-card background consumes pointer events; buttons admit pointer-down only on a live, unblocked card and validate same revision on release. Input mode changes only glyphs, not selected action or phase. Resize preserves semantic focus; if prior key is unavailable, choose Start/Continue, never an unlabelled destructive fallback. Optional Skip is distinct from Return to Contracts.

## 9. Research and evidence boundaries

Primary sources checked 10 October 2026:

- [Supergiant, Hades II Warsong Update, 19 February 2025](https://www.supergiantgames.com/blog/hades2-warsong-update/): pairs new end-route confrontation content with expanded character events and dialogue; calls regional boss battles integral. **Design inference:** brief voiced-in-character punctuation can reinforce a milestone. The source does not establish optimal intro seconds, Hades' skip implementation, or causal retention gains; none is claimed here.
- [Microsoft XAG 116, updated 4 March 2026](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/116): recommends player-controlled duration for UI/dialogue; its Ori and Dragon Quest examples illustrate manual advancement. **Application:** full text, no deadline, explicit one-command advance/skip. Two cards is our product budget, not a benchmark measured from those games.
- [Game Accessibility Guidelines, replayable narrative/instructions](https://gameaccessibilityguidelines.com/allow-all-narrative-and-instructions-to-be-replayed/): describes missed information and the value of revisiting it. **Application:** every retry can display the same brief/taunt; no irreversible seen flag. This is a limited implementation, not a claim of a complete narrative archive/accessibility certification.

The existing #171 20–30s pressure, three power moments and 5–10s fast-retry targets remain local acceptance hypotheses, not externally proven universal timing rules. Measure our actual game; do not copy benchmark expression or monetisation.

## 10. Required tests and gates

Architecture gate: two fresh independent Astra reviews of this exact revision, one lifecycle/input/resource focused and one data/determinism/progression/UX focused. Both must inspect source. Record findings and resolutions before coordinator release. No engine code before release. Ordinary content design may continue.

Implementation RED/GREEN tests:

1. **Pure controller:** ability-only, ability→boss, skip, cancel, stale revision, double/mixed command, destruction, no command after terminal authority; zero gameplay callback from pure layer; captured objective and selection-mutation checks from §3.
2. **Data/validation:** absent opening compatible; wrong speaker/boss/objective; nonboss; empty/long/extra-key data; invalid actor binding; deep freeze; second boss fixture requires only Stage data.
3. **Explanation:** eight shipped ability snapshots; effect-derived numbers, zero-duration heal, one-shot vs sustained duration semantics; no free-text numeric fallback.
4. **Scene intro freeze:** after create and 100 updates/large delta, run time/stage progress/HP/position/spawn count/ability state/RNG stream state/save bytes unchanged and run:start count 0. Boss intro has zero enemy:spawned/Compendium calls before Start; first active boundary spawns its boss once at time zero. Inject stray gameplay facts and run:won/run:lost events during intro and assert zero settlement calls/persistent mutation. Start via real command gives exactly one run:start and first simulation only on following update. Training retains zero progression writes.
5. **Input parity:** keyboard Enter/Space, controller Confirm, touch Start/Skip/Back; held enter+ability+movement, pad reconnect held buttons, same-poll nav/ability, two simultaneous touches, pointer-down before scene/card change then pointer-up, mixed touch+keyboard, orientation return. Neutral release required; no movement or ability leak.
6. **Lifecycle:** resize every card 360×640/390×844/844×390/1280×720; preserve focus/model identity. Back, double shutdown/destroy, render exception, stale view callback, texture load failure, audio failure, resource retry and newer launch. No scene entry on stale completion; no reward/loss on cancellation.
7. **Renderer loss:** renderer already context-lost at scene creation, lose before first intro paint, on ability card, on boss card and during Start attempt; no combat. Restore same card/focus after required frame check; invalid frame recovers to Menu. Destroy while lost then restore cannot resurrect UI. Use installed Phaser renderer event order in a real browser test in addition to mocks.
8. **Resource closure:** cold launch includes selected portrait, selected ability icon, captured stage objective icon, optional boss actor, composed children; no other character portrait family introduced; dedup physical resources. Second stage with opening uses data only. Atlas missing-frame rejection and restoration checks remain fail-closed.
9. **Content:** every active stage validates/reaches its objective and unlock; old ten profile JSON unchanged; old stage plans/composed waves stable when four new rows are appended; synthetic Contract 25 requires no engine/save/loader registration; reward density <= existing cap; all four first-clears exact once and retries after save failure remain exact once; all main/optional completion compatibility rows in §7.1.
10. **Real player evidence:** independent actual play traces for each new contract using fresh and established loadouts: completion/death time, enemy/phase/objective beats, upgrades/pickups/merges, power moments, confusion and next action. Record objective target opportunity and no >35s dead stretch. A browser automation trace does not itself prove fun. Human physical touch/controller remains unverified until exercised.

Narrow commands after implementation: focused Vitest controller/validation/scene/input/resource/content files via `npm run test -- ...` as supported by `scripts/test.mjs`, then `npm run lint`, `npm run test`, `npm run build`, `npm run content:validate`. If any visual-art/manifest file changes, also `npm run art:validate`. Browser lifecycle/phone/controller tests run against exact final draft SHA. Report unavailable environments honestly; do not bless golden updates to hide clipping or held-input leaks.

## 11. File ownership and implementation slices

1. This document + content design only; two reviews and blocker resolution.
2. Data expansion and focused data tests in this worker: `stages.json`, `encounter-profiles.json`, `difficulty-profiles.json`, `reward-profiles.json`; coordinator owns single content-version bump after integrations. Coordinate new stage/achievement references through parent.
3. Pure intro model/controller, explanation seam if absent, strict stage field validator and focused tests, after gate. `stageContracts.ts` changes include only optional frozen opening projection.
4. After arena owner releases shared files: parent grants explicit leases for `GameScene`, `MenuScene`, `resourceLoader`, `input`, aggregate validation/boot/catalog only if needed. Integrate onto arena's current launch payload and layout; one writer per file. No `engine/context` changes by this worker.
5. View and browser/input/resource lifecycle hardening; fresh independent implementation review; final tests and draft PR evidence. No merge or deployment.

The parent may integrate pure modules and data before leasing scene files, but cannot claim completed opening behavior until the production flow and adversarial tests pass. Keep a draft PR and unresolved evidence visible rather than claiming readiness from this architecture alone.

## 12. R2 review resolution record

- Product P2 objective omission: immutable Stage/Training objective projection, shared pure formatter, objective-art closure and captured-selection mutation regression added in §3.
- Product P2 optional completion regression: explicit data membership, one pure completion projection, main/optional counters, frontier/Home/Career/Next ownership and eight old-save/N+1 gates frozen in §7.1. Main campaign stays the ten shipped contracts through Warden.
- Lifecycle hardening: initialize current renderer-loss state; all terminal settlement listeners require admitted start plus matching terminal state; Back remains blocked during renderer loss while shutdown/external cancellation can revoke.
- Cross-workstream wording: completion-time threshold is inclusive `<=180000ms`, displayed as “3 minutes or less”.
- Content self-review: Pressure Test now begins with Dust Mites, then tank/shield layers, preserving build opportunities before route-compression pressure.
- Gate status: R2 requires two delta PASS verdicts and coordinator release before any engine implementation. No runtime/data source file has been edited in this branch.
