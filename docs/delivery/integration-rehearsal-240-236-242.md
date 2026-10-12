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

## Observed Replay identity correction

Actual screenshot inspection exposed a failing screen whose hero identified the frontier rather than its captured loading request. The initial recorded-stage fixture alone was insufficient proof. A separate unmodified-source probe reproduced the ordinary first-clear path on protected main and this candidate: accepted first clear advances First Scavenge → Scrap Run; terminal Replay retains First Scavenge; failed resource preparation displays Scrap Run beside Retry. The request/seed/layout remained correctly retained in the candidate.

A focused regression failed at the missing First Scavenge title before the correction. Home now projects the captured stage while loading/failed and projects the frontier again after Back. The regression also checks objective/BEST copy, absent first-clear reward copy, identical loading Retry request/layout, one Replay RNG draw, unchanged acknowledged save and unchanged frontier selection. It flushes legitimate first-clear achievement acknowledgements before taking the durable baseline; an initial external probe's premature baseline failure was a harness mistake, not a persistence defect. Independent review passed 276 tests across Menu, Game intro, Summary and Arena closure.

The browser matrix now asserts failed-screen copy identifies its requested Contract. Native Node 22 test collection also requires an explicit JSON import attribute: the first attempt collected zero tests and was rejected as evidence; the corrected collection lists all 108 rows. The corrected pre-title-fix matrix passed 36 phone/desktop rows, but final runtime evidence must be regenerated after this title correction. No snapshot or acceptance mechanism was weakened.

## Hosted deadline investigation and observation correction

The previous rehearsal head `db9d503cdd3405a8c71ba198507293e61c354cd7` passed every local gate (3,429 ordinary tests / 216 files, nine allocation gates and nine runner probes; six-profile browser 752 passed / 64 existing scoped skips / zero failures or flaky results). Hosted run [38286817287](https://github.com/Joncallim/Meowcenary/actions/runs/38286817287) subsequently failed: 717 passed / 64 skipped / 35 failed. Those failures report the unchanged 30-second test deadline, including observations, screenshot capture and downstream cleanup after page closure; none reports a screenshot-difference assertion. The save-only child #251 at `a694a64` separately failed six desktop terminal/warm-return rows (746 passed / 64 skipped), using this same rehearsal observer.

Raw logs and the child's verified artifact11773053148 were retained externally. Its six initial prepared receipts were neutral, unquarantined intro snapshots before any action. The coordinator inspected all six failure screenshots: two intact initial/replay briefs and four Home screens. These images cannot prove timely POST_STEP neutrality or release; the old artifacts lacked post-action scalar samples. No new gameplay defect is established by a missing observation, and no golden becomes visual authority from this investigation.

Two deterministic RED regressions execute the actual observer: neutral checking makes two browser round trips for one owner frame; capture mixes three distinct observation generations. The correction joins frame and scoped receipt in one evaluation, retaining the original predicates. Accepted keyboard/controller holds are recorded in that same post-step evaluation before physical UP. A vanished focus surface still fails. Capture reads intro, preparation and physical events together. A bounded twelve-sample test-only receipt log can be attached without contacting an already-closed page, so a future failure retains the last completed owner observations.

The seven applicable test/helper paths from PR248's reviewed `2dca83a` transport correction are carried forward as patches, without its gesture/runtime/UI changes. Each requested frame remains sequential; false/malformed frames and destroyed owners cannot report success. Existing physical DOWN/UP, trusted touch START/END, original-session CANCEL/detach, quarantine predicates, cold-resource failure, Retry/Replay identity and two independent warm-return observations remain required. No runtime, art, golden, timeout, retry, skip or image threshold changes belong to this corrective commit.

Focused observer checks: 140 passed across three files, including sixteen rehearsal transport/receipt tests; strict browser-module checking and diff checks passed. Focused physical warm-return, full local acceptance and exact-head hosted CI must be completed for the successor; previous-head green local results do not certify it. The broader severe two-core stress record from PR248 remains red and is not claimed fixed. Physical device/controller acceptance and #233's release hold remain unchanged.
