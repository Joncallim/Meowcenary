# #241 save-only preference foundation

Protected main and production remain `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`. This held continuation is reconciled onto the fully verified disposable Contracts/Progression/Arena rehearsal `f7521fe67859a881bb8b4a5ac748e97a94e5f568`, preserving the newer #235 save owner and #240 launch owner. The original source checkpoint used historical `db9d503` before that rehearsal’s observer and abandoned-preparation corrections. Original #242 remains unchanged. No merge or deployment is authorised.

Authority: [#241 architecture v2](https://github.com/Joncallim/Meowcenary/issues/241), §3.1. This implements only the persistence part of slice 2, alongside the independently reviewed pure plan/layout foundation in #243. Menu/Controls/GameScene/resource wiring is deferred to its explicit shared-file handoff. No new architecture choice or gameplay change is introduced.

## Owning correction

Settings adds one required readonly `abilityButtonSide: 'left' | 'right'`, default Left. Existing Save V4, storage key, migration/progression/reward IDs, transaction boundary and `GameContext.updateSettings` remain unchanged. Every supported legacy load fills a missing/invalid side with Left while retaining its existing version-specific migration semantics. Right round-trips through V4.

The existing sanitizer reads own data descriptors exactly once; invalid runtime patches retain the current valid preference. Passing the patch directly to that sanitizer removes the previous pre-sanitizer spread/accessor evaluation, and the fallback preserves omitted settings fields. This applies the existing own-data sanitizer contract consistently; it adds no storage adapter. Equality includes the enum, so no-op/invalid-to-current patches preserve settings identity and emit no settings event. A real change emits once after the in-memory snapshot is published. Failed storage writes retain the existing session-only value and notice.

SettingsController includes the enum in its explicit frozen read model. No button placement or menu toggle is implemented by this tranche. Current Controls behavior is unchanged until slices 2–3 wire the approved next-run setting.

## RED/GREEN and review

On baseline source with final feature tests: **43 failed /35 passed across three files**. These are missing-feature contract failures, not a #201 current-main bug claim. After implementation: **398 passed across ten focused suites** on Node22.23.2, one worker. Independent persistence/state review: **PASS**, independently running **55 tests/two files**. Typecheck covers configured `src`, `tests` and `vite.config.ts`; diff check passes.

New-test fixture mistakes (prefixed mastery/boss IDs, V3 retired boss timestamp/initial Compendium assumptions) were corrected against current migration code, not by changing production or weakening existing coverage. Raw legacy settings still omit the preference. One old exact V1-to-V4 Settings expectation gains approved default Left; six typed runtime-settings fixtures gain the required field. Existing audio, feedback, chooser and progression assertions remain.

Evidence commands:

```sh
PATH=/opt/node22/bin:$PATH node node_modules/vitest/vitest.mjs run tests/abilityButtonSidePreference.test.ts tests/save.test.ts tests/settingsController.test.ts tests/saveV3.test.ts tests/saveV4.test.ts tests/contextSystem.test.ts tests/menuController.test.ts tests/audioManager.test.ts tests/feedback.test.ts tests/upgradeChooser.test.ts --maxWorkers=1 --minWorkers=1
PATH=/opt/node22/bin:$PATH node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Run from this candidate worktree. External `ability-side-preference-*` evidence includes exact RED/GREEN logs, reviewed file hashes and the independent report. Complete mandatory runner/allocation/content/art/build/production-identity/browser and hosted gates remain pending at initial commit; no full-green claim from focused checks.

## Remaining #241 acceptance

- Settings Controls row, semantic focus/scroll/no-op and storage-notice behavior on narrow/short viewports.
- Captured next-run Controls side, asymmetric safe-area bounds, two-finger input ownership and stale-target disposal.
- Reconciled shared launch/resource/FX lifecycle integration, complete authored eight-effect sources, generic registrations, actual-scale biome proof and one-second comprehension.
- Full exact candidate gates, device/visual approval and release authorisation.

#241, #201 and related product/art issues remain open. #228 obsolete-context acknowledgement and #229 collection/clear boundaries are unchanged.

## Verified-parent reconciliation

The original nine-file change was replayed once onto #249 `f7521fe` only after
its complete local non-browser gates and exact-tree hosted six-profile matrix
passed: 3,488 ordinary tests /218 files, nine allocation gates, nine runner
probes, 752 browser passes /64 existing scoped skips /0 failures.
[Hosted run38329699986](https://github.com/Joncallim/Meowcenary/actions/runs/38329699986)
checked out a synthetic merge ref whose tracked tree was verified identical
to that rehearsal. This is parent evidence, not this preference head's full
acceptance. No merge or deployment occurred.

The first clean rebase `7d16467fd964e9d5fb78dfe05e610ece27c9c0a1` retained
exactly nine byte-identical changed files and the identical original binary
patch (SHA256 `8fe3ba41b97128be33b79838752b1a7157fc50da16f324193f974b4a98cb2c24`).
This subsequent documentation amendment does not change the eight production/
test files. MenuScene and GameScene are byte-identical to the verified new
parent: no obsolete shared file was reinstated. The old public candidate and
its RED hosted run remain historical evidence.

Coordinator focused rebase check: 364 tests in ten files passed, covering
preference, settings, Save V1/V3/V4, canonical commits, audio, feedback, chooser
and chooser layout. This differs from the original ten-file 398-test selection
above; neither substitutes for the complete exact-head gates. Independent
persistence reconciliation and new full local/hosted validation are required
at the amended final head. Protected main/public and #242 remain unchanged.
