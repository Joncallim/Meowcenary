# Contracts, Progression and Arena integration rehearsal

This branch is an engineering rehearsal, not release authority. Main and production remain at `4f79d6210c3b028b995d67a5cc6e35318b17b2ee`. Issue #233 prohibits merge/deployment. The preserved #242 playtest branch is not modified.

## Exact inputs

- Contracts #240: `5b6622b9d9708bc512e158e03b3f6d70d743023e`; hosted run 38214241551: 596 browser passes / 64 scoped skips / zero failures.
- Progression #236: `3abff8c9617bea4c652104acb8ccbc9a21e9bec2`, stacked on #240; hosted run 38252856309: 596 / 64 / zero.
- Arena #242: `a7803f6`, retained as historical candidate/playtest authority. Its domain/data changes are carried into this disposable branch without replacing newer launch, progression, save or input owners.
- Audio #239 remains separately reviewed at `848b23cf5b34ff8d337ec5a91a38ba4d00972f72`; #247's focused recovery successor is independently green. Neither audio candidate is silently included here.

## Reconciled boundaries

| Boundary | Reconciliation | Focused evidence |
| --- | --- | --- |
| Immutable preparation | One captured request, stage plan, intro model and resolved layout feed resource closure and GameScene; selected portrait/icon/objective art remain included. | `arenaResourceClosure.test.ts`: normal, Training, boss and 32 composed tuples; physical deduplication and mandatory selected-art failure. |
| Failed preparation | Capture the supplied layout before the first fallible create operation; exact Retry retains it. Validate restored tuple/hash before closure; invalid tuples remain failed. | `gameSceneIntro.test.ts`, `menuScene.test.ts`: failure capture, repeated invalid Retry, reuse reset. |
| Intro admission | Preserve newer brief/dialogue controller and held-edge quarantine. Prepared simulation remains intro; boss spawning waits until an active update after Start. | Existing intro/input tests plus prepared-layout assertions. |
| Replay versus loading Retry | Terminal Retry draws one fresh run seed; loading Retry keeps the recorded request and resolved layout. | Menu tests assert one draw / no draw respectively. |
| Neutral Menu return | Terminal Main Menu/Next/discard pass explicit empty scene payloads; leaving a failed launch clears captured layout/request. | Summary and Menu tests; warm-return browser matrix. |
| Settlement and durable state | Preserve newer GameContext, canonical save transaction, achievement acknowledgement and objective-clear owners. | Existing settlement/persistence/input suites; this branch does not change save IDs or rewards. |
| Arena determinism | Preserve generation version, content-version authority and original Arena domain implementations. Physics, hazards, spawns and scenery share the layout. | Arena layout/safety/witness/interaction/schema tests. |
| Shutdown/cancellation | Preserve launch generation guards, serialized loading and intro teardown; revoked callback cannot admit a dead launch. | Existing Menu/intro resource and lifecycle tests. |

## RED and GREEN scope

The initial source-conflict parse failure was not runtime RED evidence. The first reconciled focused run exposed obsolete harness assumptions and genuine cached-layout recovery gaps. Sixteen meaningful failure-capture/abandonment regressions failed before the owning-boundary fix; one additional failed harness incorrectly supplied a stage plan while attempting to exercise its resolver and was corrected separately.

After correction: 276 tests passed across four owning files; 189 passed across twelve actual Arena/launch modules; 217 passed across ten guarded persistence/input/settlement modules. These overlapping focused totals are not a new ordinary-suite count. The eight resource-closure tests also passed with all nine allocation gates and nine runner probes. Independent runtime and browser-matrix source reviews found no material blocking defect. These results are not full-suite/browser acceptance.

## Browser evidence contract

`browser-tests/integration-rehearsal.pw.ts` declares 18 rows per profile (two biomes × touch/keyboard/controller × normal/required-resource Retry/terminal replay-neutral return), using the six established profiles. Initial recorded composition is an explicit test fixture; Start, Retry and Menu return use real input owners. Touch requires trusted native contact start/end; keyboard/pad holds persist until the owning action receipt and are released in cleanup. Native gamepad API injection is browser evidence, not a physical controller/device claim.

The mandatory-resource failure is cold after Home and returns a deliberate 503. Retry must retain the exact seed/layout and unchanged save. Terminal Replay must receive a fresh seed. Warm neutral return must clear request/layout and avoid new resource fetches.

The terminal summary is deliberately synthetic presentation/navigation evidence. Real terminal persistence is verified by the existing unit/integration owners, not claimed from that fixture. New diagnostic seams are development/test-only and must be absent from the ordinary production build.

## Remaining acceptance

Full exact-head ordinary tests, allocation/runner gates, lint, content, complete art/source/export validation, ordinary production identity/diagnostic exclusion, strict browser checking, full six-profile browser matrix and hosted CI are still required before this rehearsal is engineering-ready. Historical Arena screenshots and existing Contract/Achievement goldens retain their individually recorded ownership; importing them is not approval of combined candidate visuals. Inspect combined actual captures separately. No golden refresh, timeout increase, retry, skip or threshold relaxation is authorised.

Physical devices/controllers, combined gameplay/readability, optional campaign play and issue #233's release decision remain human gates. No contributing or umbrella issue is closed by constructing this branch.
