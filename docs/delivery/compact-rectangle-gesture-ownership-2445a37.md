# Current Menu rectangle and gesture ownership

This bounded runtime slice starts at PR244 `5a37cb0994ed93229bf9d116e4badaadd46f50b1`, which already includes Contracts240 recovery and direct Menu-to-region focus synchronization. Its authority is the rectangle/gesture portion of PR231's `COMPACT-GRID-INPUT-CONTRACT.md` at `789b264`. It does not complete the compact Equipment/Gunsmith view, reader, bookmark, or acquisition work in #193/#197.

## Reproduced behavior

Current Equipment and Gunsmith at 360×640 have real overflowing bodies. A wheel above the body moved their offsets, and an outside pointerdown could acquire scrolling and later enter the body. The initial committed regression, `947acc4`, fails both outside-input cases and passes both inside-input positives against the unchanged runtime.

Additional owning regressions reproduced scrolling before 8 CSS pixels, accumulated jitter becoming a drag, secondary button activation, and stale drag movement after resize, render, unmount, shutdown or orientation blocking. A same-button secondary down/up/out also erased the original button's admission; separate failing evidence records that case. Existing canceled-up and blur rejection were preserved.

Independent review of `6d5c71b` then reproduced secondary OVER redirecting logical focus despite rejected DOWN/UP. Committed RED `ce07522` follows actual Phaser object/scene DOWN→OVER and object/scene UP→OUT order: three failures and one passing case. It also reproduces secondary OUT clearing primary hover, and the former button-local OUT guard blocking fresh hover cleanup after the owner ends. Focus-affecting OVER/OUT now use the active scene pointer owner; normal fresh hover resumes after ownership ends.

## Resulting boundary

`MenuScene` owns one immutable `{ x, y, width, height }` rectangle. The existing top/bottom callers still create their current full-width strips. A rectangle argument enters the same scroll region; the scene copies and validates it before mutation. Its half-open edges govern the single stencil, wheel/down admission, clipped command release and horizontal hit-area eligibility. This slice changes no Equipment/Gunsmith layout or authored geometry.

One physical gesture token identifies the first admitted pointer, its original target, interactive generation, origin, last scrolling position and latched drag state. Object-down precedes scene-down in Phaser; the scene handler neither replaces the target nor reanchors it. Secondary down/move/up/out cannot activate or erase the original admission, and a released secondary requires a fresh down. A fixed button can own a command gesture without owning collection scrolling.

No scrolling occurs below a maximum Euclidean displacement of 8 CSS pixels from the origin. Logical pointer displacement is divided by Phaser's actual `displayScale.x/y`, which the installed ScaleManager derives from base size and canvas bounds. Crossing the threshold latches the drag, applies vertical movement and invalidates command release; returning to the origin cannot recover a tap. A wheel or logical navigation invalidates a pending pointer command before acting.

Existing generation boundaries now also discard the token: render, partial replacement, actual pixel hydration, resize, unmount, orientation blocking, blur/focus and shutdown. The current physical-neutral quarantine still requires real release. No general visibility quarantine is introduced or claimed. Phaser 3.90 routes a native touch cancellation through object/scene up with `Pointer.wasCanceled`; this slice uses that actual route and does not register a nonexistent `pointercancel` input event.

No save, controller, resource, RNG, reward, gameplay, Equipment/Gunsmith surface or source-art files change. Existing focus synchronization, retained controls, resource generations and the menu command/audio boundary remain in place.

## Validation and remaining acceptance

Focused validation uses Node22 and the actual changed-file runners, rather than a broad wrapper:

```bash
cd /home/jon/projects/meowcenary-worktrees/meowcenary-compact-gesture
/opt/node22/bin/node node_modules/vitest/vitest.mjs run tests/menuScene.test.ts tests/menuFocusSynchronization.test.ts tests/menuSurfaceMount.test.ts tests/scrollableFocus.test.ts
PATH=/opt/node22/bin:$PATH npm run lint
/opt/node22/bin/node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --types node --skipLibCheck browser-tests/menu-gesture-ownership.pw.ts
```

The final focused run passes **242 tests** across four files, including 24 rectangle/gesture cases. Lint passes. The browser file receives its own strict type check because the repository's normal lint excludes `browser-tests`.

`browser-tests/menu-gesture-ownership.pw.ts` adds one case per existing profile, without skips, custom budgets or new production diagnostic hooks. Twenty valid stored helmet instances force real overflow. All six profiles check native outside-header wheel, outside-start drag, subthreshold jitter, threshold scrolling, return-to-origin rejection, fresh scrolling and fresh Back activation against unchanged post-boot save bytes. The four existing touch profiles additionally dispatch real CDP cancellation and secondary Back release while the first finger remains held, observing trusted canvas delivery and the existing physical-neutral boundary. Both desktop profiles retain mouse authority; touch emulation is not enabled. No claim is made about unavailable native Phaser flags.

The browser ownership phases also require the exact semantic focused key captured after the primary down to survive secondary contact, release and cancellation. The expectation is captured after legitimate primary hover, preserving ordinary mouse/touch focus behavior rather than requiring a whole-test focus freeze.

The first physical candidate run (`f8113cd`) passed both mouse profiles and failed all four touch profiles because its `touchMove` omission did not release the secondary contact. No runtime or assertion was changed to admit this false release. An independent native Chromium 153.0.8010.12 probe found that its default WebTouchEvents path preserves omitted MOVE contacts and releases only supplied END IDs. The test now ends the exact secondary ID, requiring a trusted native end, remaining IDs `[1]`, changed IDs `[2]`, retained nonneutral primary input, unchanged focus/save/offset and genuine final cancellation. The [protocol PDL](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl) describes an empty END list; the [pinned Chromium handler](https://chromium.googlesource.com/chromium/src/+/971a7443b0c9b0a9b2860529b33331b76077ec62/content/browser/devtools/protocol/input_handler.cc) has distinct WebTouchEvents and SyntheticPointerActions paths. Native delivery assertions fail closed if the browser backend changes; no synthetic DOM events or Phaser input reset substitutes for release.

Browser execution, full test/build gates, independent adversarial review and hosted CI remain coordinator-owned and unverified in this writer's work. The browser test must pass on the six unchanged profiles, including actual touch cancellation on the four touch profiles, before native acceptance is claimed. No browser server or port4173 was used by this writer.

RED/GREEN logs and the read-only current-path probe are external under `/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/`: `compact-rectangle-current-red-plan.md`, `compact-gesture-admission-red.log`, `compact-gesture-contract-red.log`, `compact-gesture-secondary-red.log`, `compact-gesture-secondary-out-red.log`, `compact-gesture-focused-green.log`, `compact-gesture-lint.log`, and `compact-gesture-browser-typecheck.log`.

The bounded review correction records `compact-gesture-secondary-focus-owning-red.log`, `compact-gesture-secondary-focus-focused-green.log`, `compact-gesture-secondary-focus-lint.log` and `compact-gesture-secondary-focus-browser-typecheck.log`.

## Separate physical-owner observation boundary

PR #246 hosted run 38240675904 at `24a01fc` passed 601 browser cases and
failed one held-pad fixture before any keyboard dispatch. The actual CDP
touch cancellation succeeded; the deliberately held pad still kept input
non-neutral and the helper rejected its unchanged five-second neutral wait.
The fixture is designed to prove that wait, then release its final owner;
it must not bypass neutrality or remove the intentional held phase.

The already reviewed #236 correction groups each held phase's same three
actual POST_STEP observations and state/save/contact snapshots into one page
evaluation. This removes redundant driver round trips before planned release.
All original frozen-intro, no-start, non-neutral, no-save, trusted cancellation
and release-before-dispatch assertions remain; each frame must explicitly
complete. No timeout, protocol-error classification, input owner, runtime,
screenshot, retry, or scoped skip changes. The hosted trace proves rejection
before release; it does not isolate every component of driver latency.
Focused physical-owner tests, complete final-head gates and exact-head hosted
CI remain required; this fixture correction adds no #201 runtime finding.

## Desktop observer recovery after run 38281514365

At `04e21fad0c21f2d5843d343af212f764543ac3b4`, hosted CI passed the preceding
repository gates but ended with **17 failures / 585 passed / 64 existing scoped
skips**. All failures were desktop1920 whole-test deadlines. The complete raw
log and failure ZIP were inspected separately from the physical input contract.
Seven Ability activation receipts contained the expected one start/activation
and authoritative result. All five world-readability contrast samples exceeded
0.6. Owned interruption recorded trusted cancellation, zero remaining contacts
and no admitted start. The camera failure recorded zero completed poll samples;
it did not demonstrate a wrong clamp. These are not new #201 runtime defects.

The recorded renderer was around3fps. Four representative unmodified desktop
checks passed locally. JavaScript throttling4 also passed12 checks and did not
reproduce the hosted render cost. A controlled two-core-affinity run reproduced
six original30s deadlines near2fps. The first transport candidate also failed
all six under that more severe condition. These stress failures remain evidence;
there is no claim of improved gameplay FPS or a passing stress matrix.

The correction is limited to test observation: reuse the successful immutable
poll sample, join the same sequential owner-frame waits through one transport,
read diagnostics and DPR together, and batch placement with the first camera
observation. A miss still polls the unchanged original readiness predicate.
Capture-time framing/readbacks remain fresh. Exact duplicate pre-DOWN mouse
moves are omitted; every nonzero jitter/drag, release, cancellation, detach,
neutrality check and touch path remains. Assertions, images, deadlines, retries,
thresholds and scoped skips are unchanged.

Twelve new exported-helper regressions were RED on the preceding source
(97 existing checks passed). New deferred-frame tests prove sequential ownership,
false/malformed/rejected-frame short circuiting and unchanged cleanup. Independent
review caught a missing diagnostics assertion during capture batching; its
actual-source regression was RED before that guard was restored. The expanded
focused set is **186 tests/5 files GREEN**, and typecheck passes. Source review
PASS covers unchanged admission/completion predicates and physical cleanup.
All44 normal desktop1920 cases across Ability/input, actor framing, world/HUD
and native Menu gestures pass with no skips or flakes (442.67s). This covers all
17 hosted failure classes; it is not a passing reduced-core stress experiment.
Full exact-head repository/browser and hosted gates must still pass before this
held candidate is engineering-ready. The two-core experiment is not a device
acceptance result. No screenshot golden was updated or promoted to art authority.

Main/public game remain `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`.
The release hold and original #242 playtest head remain unchanged.
