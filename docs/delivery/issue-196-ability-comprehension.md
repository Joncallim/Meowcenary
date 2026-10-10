# #196: ability comprehension and run-start briefing

Baseline main: `a100e053ce4e2bc48bc4b8844e7da5010d562096`.

This report tracks the requested mechanical identity, per-run explanation,
input safety, feedback, responsive presentation and lifecycle scope for #196.
The corrected #231 packet is intake context only; it does not amend acceptance
or confer art authority. #228 and #229 retain their existing scope and status.
No art source, export, manifest or authority record was changed. No owner or
player approval is claimed here.

## Acceptance matrix

| Contract | Acceptance evidence / owner | Status |
| --- | --- | --- |
| Eight data-backed mechanical identities | `src/data/abilities.json`, `src/data/characters.json`, `src/gameplay/abilities.ts`, `src/systems/abilities.ts`, `tests/abilityResolution.test.ts`, `tests/roster.test.ts`. Scrap Burst: 90-radius knockback; Overclock: +50% fire rate/+25% move speed for 3.5s; Shield Flicker: 1.2s invulnerability; Giga Chomp: heal up to 40; Adrenaline: +40% move speed for 2.5s; Heat Vent: 90 damage within 110; Scavenge Pulse: collect Scrap/XP within 160; Precision Mark: +30% damage/+1 pierce for 4s. | Implementation and focused tests present; exact-head/release results pending. |
| Start brief and shared logical input | `src/ui/runStartAbilityBrief.ts`, `src/scenes/GameScene.ts`, `src/ui/characterSelectionController.ts`, `src/ui/controls.ts`, `src/systems/input.ts`; `tests/runStartAbilityBrief.test.ts`, `tests/gameSceneIntro.test.ts`, `tests/controls.test.ts`; `browser-tests/ability-comprehension.pw.ts`. Brief presents character, ability icon/name, plain-language effect and cooldown. Touch, keyboard and controller resolve through shared actions. | Implementation and targeted browser coverage present; exact-head/release results pending. |
| Held-input quarantine | `src/scenes/GameScene.ts`, `src/systems/input.ts`, `tests/gameSceneIntro.test.ts`, `browser-tests/run-start-helpers.ts`, `browser-tests/ability-comprehension.pw.ts`. Start is one-shot; launch-held Confirm/movement/ability cannot leak into combat. A neutral sample re-arms a fresh ability action. | Implementation and regression coverage present; exact-head/release results pending. |
| Activation receipts | `src/systems/abilities.ts`, `src/systems/abilityPresentation.ts`, `src/ui/controls.ts`; `tests/abilityResolution.test.ts`, `tests/abilityPresentation.test.ts`, `tests/controls.test.ts`, and browser receipt checks. Receipts report actual resolution (affected targets, actual healing or loot collected), not just an activation request. | Implementation and focused coverage present; exact-head/release results pending. |
| Responsive geometry and readable copy | `src/presentation/abilityEffectPresentation.ts`, `src/ui/runStartAbilityBrief.ts`, `src/ui/controls.ts`; `tests/runStartAbilityBrief.test.ts`, `tests/uiText.test.ts`, `tests/controls.test.ts`, `browser-tests/ability-comprehension.pw.ts`. Check phone 360/390, tablet 768, compact landscape 844×390, DPR3, resize and blocked orientation. | Long hints wrap at 360/390px without clipping or card overlap. The compact 844×390 card uses 360px of the 366px available safe height; its binding text clears both 44px actions. Targeted compact/crowded matrix: 12 passed. |
| HUD state | `src/systems/abilityPresentation.ts`, `src/ui/controls.ts`, `tests/controls.test.ts`, `browser-tests/ability-comprehension.pw.ts`. Fixed ability card reflects ability identity, cooldown/readiness and timed persistent duration; pause freezes the state. One-shot abilities enter cooldown immediately, so internal transient `active` resolution maps to HUD `cooling` intentionally. | Implementation/tests present; exact-head/release results pending. |
| Distinct mechanical FX | `src/presentation/abilityEffectPresentation.ts`, `src/systems/abilityPresentation.ts`, `src/entities/Player.ts`, `src/entities/Enemy.ts`; `tests/abilityPresentation.test.ts`, `tests/abilityResolution.test.ts`, `browser-tests/ability-comprehension.pw.ts`. FX derive from mechanic kind and data radius; persistent and transient cues are distinct, reduced-motion silhouettes remain static, and effects stop on lifecycle transitions. | Implementation and focused coverage present; exact-head/release results pending. |
| Pause, lifecycle and replay assumptions | `src/scenes/GameScene.ts`, `src/systems/abilityPresentation.ts`, `src/engine/eventBus.ts`; `tests/gameSceneAbilities.test.ts`, `tests/gameSceneIntro.test.ts`, `tests/eventBus.test.ts`, `tests/abilityPresentation.test.ts`, `browser-tests/ability-comprehension.pw.ts`. Intro freezes run time and combat; pause/terminal/foreground behavior freezes or disposes owned ability state without stale brief/FX. | Implementation and focused coverage present; exact-head/release results pending. |
| Existing visual expectations | Preserve individual semantic ownership: Mercenary row = mechanical ability line; upgrade chooser = unchanged reference, with Start using a real pointer gesture to preserve its existing input modality; boss and forge gameplay = active `RUN` label, persistent HUD card/readiness glyph, and transient mechanic cue; phone HUD readability = long-hint wrap/clipping. Inspect each actual/expected/diff before updating only its owning expectation. | Fourteen localized goldens are individually reviewed in the committed manifest; no art or comprehension approval is implied. Chooser and summaries remain unchanged after preserving pointer-mode Start. |
| Production and release gates | `npm run lint`, `npm run test`, `npm run build`, strict browser TypeScript, targeted comprehension browser matrix, and exact-head hosted checks. Report command, runtime, exact source SHA and observed case/pass/skip/fail counts. | **Pending integrator:** enter final exact-head SHA and complete gate results here before release. |
| Human acceptance | Product owner reviews all eight briefings and actual-scale HUD/FX, including the 360px long-hint treatment; human playtest confirms clarity and fair presentation. Physical touch/controller/device coverage is recorded separately from emulated browser evidence. | **Pending human acceptance.** No automated test or packet intake is a substitute. |

## Evidence and change boundaries

The comprehension browser suite covers all eight mercenaries, the brief and
receipt/HUD, fresh touch and controller activation, 32-enemy Overclock, held-confirm quarantine,
resize/relaunch, DPR3 reduced-motion orientation/foreground restoration,
compact landscape, and pause-frozen loot resolution. Source and test inventory
is listed in the matrix; browser captures are currently preserved outside the
repository under
[the bounded committed dossier](evidence/issue-196/manifest.json). Full final captures are recorded on issue #196 at release.
Those captures are review evidence, not product-owner approval.

Fourteen existing golden expectations were individually reviewed and updated: six
Mercenary upper/lower mechanical-copy rows and the three ordinary/two desktop boss/Forge teaching hints
and READY glyphs, plus three exact-radius knockback FX/banner references. [The review manifest](evidence/issue-196/golden-review.json)
records old/new hashes and dispositions; expected/actual/diff images remain in
that directory. Actor crops, chooser, summaries and unrelated expectations
remain unchanged. Real pointer Start preserves the existing art-reference input
modality. No threshold, timeout, assertion, retry or scoped skip was weakened.

The HUD initially failed to repaint its intro snapshot on `run:start`; a RED
regression now verifies the existing event dirties the owning HudController at
time zero. Its additional subscription is disposed on every scene visit. The
production HUD alpha constants remain unchanged from current main. Its existing
transparency predates this tranche; it is not a new style or authority decision.

Exact final PR/main gate results, hosted CI, public metadata/assets and separate
game/infrastructure SHAs are recorded on [#196](https://github.com/Joncallim/Meowcenary/issues/196)
at release. Pre-commit evidence is labeled in the manifest and does not certify
a final head. Human comprehension remains required.

## Additional mandatory boundaries

| Requirement | Evidence |
| --- | --- |
| One exhaustive explanation, including future content | `src/presentation/abilityEffectPresentation.ts` uses a `never` exhaustive effect switch and player-facing stat labels; `tests/abilityEffectPresentation.test.ts` covers eight snapshots, changed numerical fixtures, invalid/unsupported shapes, scopes and signed modifiers. Mercenary read model, intro and teaching copy share this resolver. |
| Sole mechanical geometry owner | `src/systems/validation/abilities.ts` rejects `presentation.radius` and area `visualRadius`; `tests/abilityResolution.test.ts` and `tests/abilityPresentation.test.ts` prove exact mechanical boundaries in ordinary and reduced motion. Only self-aura style uses `visualRadius`. |
| Selected resources, not global portraits | `src/systems/resourceLoader.ts` includes only the chosen logical portrait/icon before Game creation. Eight-roster closure regression excludes other character actor resources; one shared portrait atlas physically contains its registered frames. Loader deduplication, generation guards and required-frame checks remain authoritative. |
| Immutable actual consequences | `src/gameplay/abilities.ts` freezes scalar receipts and modifier copies; Player reports actual restored HP, Enemy owns damage/shield success, and the scene adds frozen activation identity/origin. No receipt retains an entity. Full-HP healing returns zero. |
| Existing Scavenge transaction | DropSystem and its #229 admitted-consumable continuation remain unchanged. Unit/browser checks cover the actual collection through level-up pause, pause-frozen HUD, immediate zero-delta cue publication, and objective-complete physics hold. |
| Cross-scene Back quarantine | The departing intro and destination Menu input owners both quarantine until neutral. Real controller RED and Menu unit RED reproduced immediate relaunch; fresh post-neutral Confirm still works. Phaser may retain the entry data on later payload-free returns, which safely retains quarantine. |
| Bounded presentation | One Graphics plus one banner, at most one transient and one sustained slot, maximum sixteen primitives; dense/repeated facts and real 32-enemy combat preserve those bounds. Persistent expiry comes from authoritative end events; resize, destroy and stale callbacks are covered. |
| Unchanged persistence and mechanics | No Save V4/GameContext/DropSystem changes. Mechanical cooldowns, durations, modifiers, damage, impulse, RNG and targeting are unchanged. #228 acknowledgement and #229 regressions remain in the full suite. |

## RED evidence and reproducibility

Baseline feature contracts failed before their owning changes: resolution facts
and duplicate geometry (5 tests), mechanic FX/lifecycle/bounds (9 tests), intro
command gating (2 tests), and separate HUD state. Integration review also caught
fresh activation during pending clear, Scavenge's first paint behind its own
level-up pause, held controller Back relaunch, clipped phone teaching copy and
compact binding overlap. These failures were repaired without weaker assertions,
image thresholds, timeouts, retries or new skips. Preserved [RED logs and owner receipt comparison](evidence/issue-196/manifest.json) distinguish baseline defects from new feature-contract regressions.

The pre-existing damage resolver additionally reported `applied: true` for a
blocked living target. A deterministic exact-baseline/candidate comparison and
real Enemy tests verify the new owner receipt; kill settlement remains once only.
The damage-result and extraction-boundary findings belong in the standing #201
ledger. Newly introduced integration failures were caught before release.

Run the focused tests with `npm test -- tests/abilityEffectPresentation.test.ts
 tests/abilityResolution.test.ts tests/abilityPresentation.test.ts
 tests/controls.test.ts tests/gameSceneAbilities.test.ts tests/gameSceneIntro.test.ts
 tests/runStartAbilityBrief.test.ts tests/resourceLoader.test.ts` (one shell line).
Full gate: `npm run lint`, `npm run test`, `npm run content:validate`,
`npm run art:validate`, `npm run build`, `npm run test:browser`, and
`git diff --check`. Browser modules are additionally compiled strictly **one file
per invocation**, because existing test-local global declarations are incompatible
when compiled together. No test module may be omitted for that reason.

Pre-final source validation: 3,035 ordinary tests in 202 files, nine allocation
gates and nine runner probes completed with exit zero; full art/export and
content gates and lint passed. Final PR/main hosted and local regression results,
build identity, public metadata/assets and both release SHAs must be recorded on
[#196](https://github.com/Joncallim/Meowcenary/issues/196) at release. Production
may not be updated while any exact-head gate is red.

## Maintained capture-runner compatibility

The current performance Training and real Contract launch runners previously
waited directly for active combat. The new required intro made both wait without
issuing Start. A [RED regression](evidence/issue-196/performance-start-red.log)
reproduces that stalled boundary for keyboard, pointer and touch, while retaining
the historical already-active route. `scripts/performance-run-start.mjs` now
waits for the rendered prepared intro, verifies its time-zero brief, samples
neutral input and confirms with a real input gesture. Both maintained callers
retain their active-run postconditions before measuring combat.

Launch evidence labels `preparedStatus`; preparation duration ends at the first
rendered intro, or active on historical builds. Automated confirmation and
end-to-end active latency are separate fields. These changed presentation
boundaries must not be represented as a performance improvement against older
archives. No performance architecture, timeout, gameplay or diagnostic bypass
was introduced. The helper regression is part of ordinary Vitest discovery.

## Remaining product gate

Automated virtual gamepads, Chromium viewport/DPR/touch emulation and CDP
background/orientation journeys do not certify physical devices or subjective
comprehension. Jonathan (or an explicitly authorized product reviewer) must try
the actual-scale selected-Mercenary briefing, activation consequence, ready /
active / cooling distinction and persistent expiry, and record that the ability
is understandable. Until that evidence exists, #196 stays open even after merge
and deployment. #201 and every sprite/art umbrella stay open; #230, #199 and
PR #227 are untouched. The next bounded engineering recommendation is #194;
this tranche does not start it.
