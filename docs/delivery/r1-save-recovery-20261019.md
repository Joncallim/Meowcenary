# R1 Equipment and Parts save-failure recovery

Owning outcome: R1; Equipment #197 and Gunsmith/Parts #193.
Imported R1 baseline: `7fb3f90e55354127b05df10a8f57efee52f2c052`.
R2 remains separate at `2812e6f804a67d52f9af5d1f3c1959f42c668399`.

## Player-visible correction

When storage rejected an Equipment upgrade or Parts fabrication, the save stayed
unchanged but the confirmation disappeared. The player had to reopen it before
retrying. Both flows now retain the reviewed intent and semantic confirm focus
when the returned authoritative item facts are unchanged. A successful retry
clears the confirmation and charges once. Rejected actions report that they did
not complete and no Scrap was spent, without inventing a funds or unlock cause.

Each rendered confirmation captures its review identity. Failure creates a new
identity, so callbacks from the failed, canceled, or superseded review cannot
spend. Existing input and mount-generation guards remain. The patch changes no
prices, effects, progression rules, save schema, RNG, or gameplay lifecycle.

## Regression and verification contract

Before the repair, four new composed MenuScene cases failed at 360×640 and
1280×720: an actual rejected storage write preserved save identity but removed
the confirmation. The expanded regression matrix checks direct retry and
cancel/reopen, stale callbacks, unchanged failed-save identity, exact currency
and output, semantic focus, and success clearing the gate.

`browser-tests/r1-save-recovery.pw.ts` adds actual browser storage-failure
injection, keyboard owner-frame input, visible confirmation bounds, and exactly
one successful retry for both flows. It runs against the isolated local preview;
it is synthetic browser evidence, not physical touch/controller acceptance.

For a candidate, run lint, the complete repository test runner (including its
allocation/runner stages), production build, content validation, and explicit
strict TypeScript checking of the new browser file. Then build with
`VITE_VISUAL_TEST=1` and run the recovery browser file at phone and desktop sizes.
Record results against the final candidate SHA separately from main/deployment.
The handoff coordinator's external verification receipt owns executed results.

## Remaining gates and next R1 action

R1 remains open. Continue Parts fabrication and exact fit/merge/infuse
consequences, followed by character selection/Career/Next Goals/achievements/
mastery/results, then the level-up chooser and in-run rack/merge. Do not change
authoritative progression or decide RPG versus roguelike through this repair.

Physical Android/iOS, IME, standard controller, human comprehension/visual
approval, and matched device performance remain unverified. R3 still needs
listening acceptance, R4 art/composition approval, and R5 owner/device/product
acceptance. The #233 no-merge/no-deploy hold remains. This local correction does
not authorize a push, upstream submission, merge, deployment, or issue closure.
