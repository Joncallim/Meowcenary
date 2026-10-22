# INT-FB bounded playable-slice review · 68a798e

Status: review checkpoint only. This record does not authorize a merge,
deployment, hosted-site change, or product-acceptance claim.

## Supported routes

- Ordinary B1 (`/?fixture=int-fb`): select a job, walk to the service
  acceptance point, accept it, traverse the authored terrain, clear the finite
  hostile group, complete required interactions, extract, and reload the
  resulting saved attempt. The R01 browser route drives those controls rather
  than calling a transaction API.
- B1 safe-service workshop: the focused recovery/retry flow covers ordinary
  Buy F2 and Fit confirmation plus durable reload. The fixture's directed
  ledger separately covers claim/sell, build, Develop and idempotent durable
  writes.
- Later Chapter-5 fixture (`/?fixture=int-late`): an explicitly isolated save
  for preview/Confirm/Cancel, Develop, Merge, Build, Fit and H2 sale. It reads
  prior B1 history only and never modifies B1.
- Same-blueprint donor fixture (`/?fixture=int-late-same-b2`): separate,
  labelled alternate seed; it is not an ordinary B1 acquisition or a free item
  in the canonical late economy.
- Fitted-HM range fixture: enter through the visible `RANGE RUN` control after
  fitting a persisted TAB-A B-HM T3. It configures the existing combat owner
  with that saved weapon's setup, cadence, supply/refill, contact width and
  range values against independent 12m / 18m / 27m targets, makes no save
  writes, and returns to the late fixture.

## Executed evidence at this checkpoint

| Evidence | Actual result | Qualification |
| --- | --- | --- |
| `npm run lint` | pass | Typecheck only. |
| `npx vitest run tests/lateFixture.test.ts` | 17 passed | Pure range contact, workshop/lineage rules. |
| Guarded build (`VITE_VISUAL_TEST=1 npm run build`) | pass | Visual test seams enabled only for browser evidence. |
| Range focused browser set | 4 passed, 0 skipped | Actual control input covers full/falloff/outside contact, queued Confirm→Range cancellation, branch/missing/invalid recovery, denied storage. |
| Full late browser file, desktop project | 26 passed, 2 skipped | Two phone/tablet-only layout cases are intentionally project-targeted skips. |
| R01 ordinary browser route, desktop | 1 passed, 0 skipped | Real selection/movement/interact/extract controls; hostile clear is fixture combat behavior, not a human aim/playthrough claim. |
| Production `npm run build` + bundle scan | pass | No `__MEOWCENARY_INT_FB__`, `__MEOWCENARY_LATE_FIXTURE__`, or range test seam in built assets. |

Earlier retained focused evidence on the preceding range checkpoint was 6
executed / 3 project-targeted skips for the tablet/range subset and 2 executed
(desktop + phone) for F01 recovery/retry/extraction. It is supporting evidence,
not a substitute for the exact-head checks above.

## Limits and open gates

- The Chapter-5 fixture is intentionally separate from ordinary campaign
  progression. It does not establish seamless B1→late acquisition.
- The range fixture is a bounded real contact/damage proof, not a complete
  mission, enemy AI, reward, or human aim playthrough. Its centered B-HM
  profile exercises setup/cadence/supply/refill and persisted contact width,
  but does not yet provide a non-zero-offset cone/width boundary case.
- Evidence is Chromium/SwiftShader browser execution. Physical phone/controller
  validation and hosted-site validation remain open.
- The full repository suite has two Pillow-version environment failures shared
  with the true branch base; that comparison does not replace exact-head CI.

## Review, hosting, and rollback boundary

The repository declares GitHub Actions CI for pull requests and `main` pushes
only (`.github/workflows/ci.yml`); it contains no deployment workflow, hosting
credential, environment, or rollback command. The observable review route is:
push this review branch → open/update a PR → obtain exact-head CI and review →
receive separate merge/deployment authority. A rollback must use the hosting
provider's established deployment history after an authorized deployment; no
provider route is represented in this repository, so none was invoked or
invented here. GitHub CLI PR-status lookup from this environment was denied by
the GitHub GraphQL API, so PR/draft state is unverified rather than inferred.
