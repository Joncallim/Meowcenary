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

CDP's [official active-touch-point contract](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Input.pdl) generates changes from the supplied active list; the test removes only the secondary via `touchMove` and asserts a trusted native end with one remaining touch. `touchEnd` and `touchCancel` use empty lists.

Browser execution, full test/build gates, independent adversarial review and hosted CI remain coordinator-owned and unverified in this writer's work. The browser test must pass on the six unchanged profiles, including actual touch cancellation on the four touch profiles, before native acceptance is claimed. No browser server or port4173 was used by this writer.

RED/GREEN logs and the read-only current-path probe are external under `/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/`: `compact-rectangle-current-red-plan.md`, `compact-gesture-admission-red.log`, `compact-gesture-contract-red.log`, `compact-gesture-secondary-red.log`, `compact-gesture-secondary-out-red.log`, `compact-gesture-focused-green.log`, `compact-gesture-lint.log`, and `compact-gesture-browser-typecheck.log`.

The bounded review correction records `compact-gesture-secondary-focus-owning-red.log`, `compact-gesture-secondary-focus-focused-green.log`, `compact-gesture-secondary-focus-lint.log` and `compact-gesture-secondary-focus-browser-typecheck.log`.
