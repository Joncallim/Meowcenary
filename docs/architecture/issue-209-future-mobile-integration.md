# Issue #209: future Android/iOS integration boundary

Status: browser implementation inventory and future integration decisions. Native
packaging is deferred; this document does not certify mobile readiness or close
[#209](https://github.com/Joncallim/Meowcenary/issues/209).

Reviewed implementation: main `a4264051dcd786c87dc40d955b502736492708da`.
Current code and owning issues override older architecture descriptions. In
particular, the older [mobile acceptance follow-up](alpha-3-mobile-acceptance-followup.md)
records a PR #176 UI tranche, not the current scale policy or deployed SHA.
This document adds future shell requirements without superseding #193, #197,
#198, #199, #201 or #175 product and visual authority.

## Existing browser boundaries

The canonical runtime remains Phaser 3 + TypeScript, with the current gameplay,
save, RNG and logical-to-physical art contracts. A future shell hosts this same
runtime; it does not create a second game or a native Menu implementation. No
Capacitor dependency, platform service locator or framework is introduced here.

| Concern | Current owner and consumer | Existing evidence; scope limit |
| --- | --- | --- |
| Durable state | [StorageAdapter / SaveManager](../../src/systems/save.ts), [GameContext](../../src/engine/context.ts) | [canonicalSaveCommit](../../tests/canonicalSaveCommit.test.ts), [contextSystem](../../tests/contextSystem.test.ts), [save](../../tests/save.test.ts): synchronous write-result contract and exact canonical snapshot publication. No native storage implementation. |
| Achievement mirrors | [AchievementPlatformAdapter](../../src/gameplay/achievementPlatform.ts), injected into GameContext | [achievements](../../tests/achievements.test.ts): asynchronous, retry-safe reports after local truth. No Game Center / Play Games implementation or account requirement. |
| Canvas / safe areas | [gameScale](../../src/platform/gameScale.ts), [safeArea](../../src/platform/safeArea.ts), [layout](../../src/ui/layout.ts), [CSS](../../src/styles.css) | [gameScale](../../tests/gameScale.test.ts), [responsiveViewport](../../tests/responsiveViewport.test.ts), [safeArea](../../tests/safeArea.test.ts): RESIZE with CSS-pixel game units, camera-owned magnification and CSS inset evidence. WebView bars/cutouts unverified. |
| Orientation / pointer coordinates | [orientation](../../src/platform/orientation.ts), [visualViewport](../../src/platform/visualViewport.ts), [main](../../src/main.ts), [GameScene](../../src/scenes/GameScene.ts) | [orientation](../../tests/orientation.test.ts), [epic19PlaytestRegressions](../../tests/epic19PlaytestRegressions.test.ts), [gameScenePendingClear](../../tests/gameScenePendingClear.test.ts): layout-viewport landscape gate, gesture-safe geometry refresh and scene-owned physics/input return. Not native app lifecycle. |
| Optional fullscreen | [FullscreenController](../../src/ui/fullscreen.ts), [pause UI](../../src/ui/pause.ts) | [pauseController](../../tests/pauseController.test.ts), [responsive browser matrix](../../browser-tests/responsive.pw.ts): pending request/settlement/failure/teardown. Browser capability deliberately excludes iOS; native system bars are a separate future capability. |
| Audio | Boot-owned [AudioManager](../../src/systems/audio.ts), [audioResources](../../src/systems/audioResources.ts), Menu/Game consumers | [gameSceneAudio](../../tests/gameSceneAudio.test.ts), [audioResources](../../tests/audioResources.test.ts), [resource lifecycle browser tests](../../browser-tests/resource-lifecycle.pw.ts): one game-scoped manager, optional failure, unlock and cached retry. No native interruption policy. |
| Art / run preparation | [resourceLoader](../../src/systems/resourceLoader.ts), Menu's generation-guarded serialized loader | [resourceLoader](../../tests/resourceLoader.test.ts), [menuScene](../../tests/menuScene.test.ts): deduplicated physical closures, required animation/frame validation, stale completion cancellation. Native packaging must supply the same complete resources. |

These test links identify existing browser contracts. They do not prove Android
or iOS behavior. Measurements and their limitations remain in the
[#209 performance reports](../implementation/performance/issue-209/README.md),
including the [latest scoped Gunsmith comparison](../implementation/performance/issue-209/gunsmith-updates/README.md).

## Persistence decision before packaging

Production Save V4 remains owned by SaveManager and GameContext. Durable
progression, Equipment, Gunsmith and terminal transactions publish only after a
successful synchronous save result; `commit()` returns the exact sanitized
snapshot written, not a second storage read. The browser adapter reports whether
`localStorage.setItem` returned successfully. This is the current contract, not
proof of OS-level power-loss durability.

There are explicit legacy exceptions: `updateSettings` and `updateMeta` publish
in memory before reporting the save result. Settings listeners may apply a
change even when the write fails. Do not describe all context methods as durable
transactions or silently alter these semantics under platform work.

An asynchronous native store cannot return a synthetic `true` and complete its
write later. Before using one, choose and review an explicit transaction model:

1. Define what successful durable acknowledgement means, atomic whole-save
   replacement, serialization of competing writes, and crash recovery.
2. Migrate the owning command boundaries deliberately: keep candidate state
   private until acknowledgement, return explicit success/failure, and preserve
   stale-instance resolution inside the transaction. Specify how settings'
   in-memory exception is represented.
3. Preserve stable IDs, migrations, future-version write protection, grant
   receipts/fingerprints and exactly-once terminal reward semantics. Pending
   terminal retries must retry the same captured facts, never earn twice or
   turn an earned clear into a loss.
4. Prove interrupted/rejected writes, stale completions, overlapping Equipment
   and Gunsmith commands, restart after acknowledgement, and process termination
   before/after replacement. No late completion may publish into a superseded
   context or recreated game. Define whether an unfinished run survives process
   loss separately; current terminal save semantics do not implement run restore.

Keep the browser adapter and its semantics until that migration is authorized.
Do not create per-feature native save keys or route durable state through UI.

## Lifecycle, audio and presentation decisions

`visibilitychange` currently schedules viewport refresh. Phaser/browser behavior
is not an explicit game-owned background/resume protocol. When packaging creates
a real lifecycle consumer, use one small platform-facing active/background
notification seam and reconcile it at the scene-owned frame boundary. It must
preserve manual/level-up/pending-clear/terminal states, input quarantine, and the
orientation return rule: physics cannot resume ahead of neutral input processing.
Coalesce duplicate browser/native notifications; dispose listeners and revoke old
generations on game destruction. Do not blindly resume a manually paused run.

Choose foreground/background clock policy and process-loss UX explicitly. Test
app switching during pointer drag, held keyboard/controller input, run preparation,
late art hydration, summary persistence retry and achievement reporting. No
resume may dispatch the dismissing edge or resurrect an old surface/run.

Keep one game-scoped AudioManager. Boot now queues the four `menu-common` audio
files; Menu prepares the seventeen `run-common` files before GameScene needs
them. [The catalog](../../src/data/audio-assets.json) owns that split; physical
caching and optional failures preserve silent play. Native audio focus/session
interruptions, background audio policy and foreground unlock/retry require device
evidence. Do not assume foregrounding grants audio permission, duplicate the
manager, restart loops blindly, or advance fades using unbounded background time.
WAV conversion remains a measured compatibility/latency/looping decision.

Preserve the compact coarse-pointer landscape guard and supported desktop/tablet/
foldable layouts. The guard uses layout viewport size so keyboard shrinkage alone
cannot block portrait play. Native orientation policy, status/navigation bars,
cutouts, keyboard and inset propagation need separate actual-device evidence.
Use the existing safe-area geometry and shared input owner; do not move physics
bounds to match chrome. Browser fullscreen continues through its existing
controller. Add a narrow native presentation capability only when a native
consumer exists; unsupported capability remains a usable ordinary presentation.

There is no current haptics consumer. Defer a small optional web-no-op/native
haptics adapter until a product-owned interaction requests it. Gameplay/domain
and deterministic generation must not depend on platform identity or haptics.

## Offline package and store integration

Browser local saves require no server or account; guaranteed offline cold startup
is not implemented. There is no service worker or native asset package in the
reviewed tree. A future package must include the ordinary production build,
self-hosted Nunito, all validated visual resources/atlas metadata, lazy panel and
run closures, and audio. Keep the four-weight font readiness barrier so Phaser
never permanently rasterises fallback-font text.

Verify asset origin and base paths: index/font references include `/assets/...`,
while manifest resources include `assets/...`; importing `dist` alone is not
proof they resolve under a native asset host. Test cold offline Home, every panel,
a complete run, failed optional audio, and package upgrade against existing Save
V4 data. Diagnostic/test-only builds must not enter release packages. Preserve
build SHA metadata, logical art/resource deduplication, lazy closure bounds and
source/export provenance; do not make all run resources boot requirements.

Game Center / Google Play Games will implement the existing achievement adapter,
with reviewed ID mappings, authentication failure and idempotent retry evidence.
Local completion/rewards remain authoritative and independent of mirror success.
The existing durable report outbox is the starting point, not a second progression
system. Current report-settlement callbacks clear their outbox entry through the
captured context/save owner; they have no context-generation revocation check.
Context recreation with an in-flight report therefore needs explicit adversarial
reconciliation before adding a native lifecycle consumer. Late reports must not
affect a newly replaced context or regrant rewards.

Signing, distribution, store requirements and any future IAP decision belong to
an explicitly authorized packaging/product tranche. No store/IAP/account SDK,
monetization or social infrastructure is authorized by #209 or future-concept #98.

## Integration evidence required later

| Gate | Evidence required before claiming native readiness |
| --- | --- |
| Durable storage migration | Independently reviewed success/failure/crash/concurrency tests through real native durability acknowledgements; existing browser regressions remain green. |
| Lifecycle / audio | Physical Android and iOS background/resume/interruption/process-loss sessions, pending writes/loads/reports, pointer/controller quarantine, and no listener/manager leaks across repeated scene/game recreation. |
| Device presentation | Phone high-DPR portrait, compact landscape block/return, tablet and foldable, safe areas/system bars, fullscreen failure/exit, active gesture viewport movement, controller reconnect/mixed input and reduced motion. Emulation is supplementary. |
| Package / release | Pinned ordinary build and complete asset inventory; cold offline install and upgrade; no diagnostic globals; exact source/build/deployed identity and smoke evidence. |
| Product acceptance | #193/#197/#198/#199/#175 and Figma/art approval remain their owners' gates; #171 requires genuine integrated play evidence. Native packaging cannot substitute for those approvals. |

Procedural generation remains a deterministic plan/data boundary consumed by
Phaser object construction; keep it platform-free and prepare it before live
combat when needed. #209 does not implement procedural maps. #199 owns visible
Equipment and the immutable mechanics/appearance/resource run snapshot; this
inventory does not claim that remaining feature is delivered.

#209 still requires remaining Menu ownership/hydration work and final matched
whole-game performance evidence. This document fulfills its future integration
artifact only. Add adapters only for real consumers, and stop abstraction when
measured browser responsiveness and clear ownership satisfy the issue.
