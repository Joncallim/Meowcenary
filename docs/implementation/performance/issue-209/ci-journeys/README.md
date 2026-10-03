# Issue #209 — preserve acceptance within bounded UI journeys

Baseline main: `1e6528f3e2769c6046bf10352ac1b1a386bbfe9b`.
Owning release slice: [PR #219](https://github.com/Joncallim/Meowcenary/pull/219).

## Observed failure

[Hosted main CI run 37155057479](https://github.com/Joncallim/Meowcenary/actions/runs/37155057479)
passed art, content, lint, ordinary units and build, then finished with
143 browser passes, 59 existing scoped skips and two failures. The full local
matrix on the identical merged tree passed 145/59. This report retains the
completed hosted job log compressed beside it; no unchanged retry is used as
the correction.

Both failures exhausted the existing 30-second test budget at desktop
1920×1080. Equipment became ready at 8447ms, completed 11 real keyboard focus
steps at 27713ms, then recorded its selection commit at 29401ms. The presented
revision poll expired at the global deadline before resize/equip acceptance.
Gunsmith became ready at 5821ms, switched SMG then Pistol by 15587ms, committed
and presented replacement at 23581ms, and restored resize focus at 27505ms.
The post-removal local-commit assertion expired at the global deadline.

These checkpoints establish cumulative journey-budget exhaustion; they do
not establish a stuck resource loader, stale save or gameplay defect. Failure
screenshots were inspected: candidate Equipment selection and post-resize
Gunsmith removal were visible. They cannot prove the uncompleted assertions.
No runner-outage explanation or physical-device performance claim is made.

## Correction and retained acceptance

Gunsmith has two independently seeded real-input journeys sharing the same
setup/replacement helper. One switches SMG → Pistol then performs replacement
in that returned family. It also asserts that switching preserves every build
and Part assignment and changes the correct fitting command. The other
performs replacement → resize → keyboard removal. Both retain local-update
ownership, presented revision, semantic focus, durable save and error checks.
The two adjacent interaction chains are preserved; the original entire
four-operation chain is no longer one test.

Equipment's update journey keeps selection → resize → keyboard equip, every
original ownership/focus/save assertion and the complete helmet catalog. Its
fixture now has two stored helmets and six fabricable blueprints, verified by
stable IDs against the live catalog. Commando replacement, loss/gain of Set
thresholds, All Weapons scope and inventory preservation are asserted. This
mixed fixture is representative of stored/fabricable presentation; it is not
claimed to prove faster full-owned inventory performance.

The separate existing full-owned Equipment journey retains all eight stored
helmet rows, real long keyboard traversal, touch/pointer selection, comparison,
resize and durable equip. It now additionally asserts no full render, exactly
one committed local selection update, unchanged rebuild owner and presented
revision. Its existing 120-second budget is unchanged. Default 30-second
budgets in the update tests are unchanged.

Commit/presentation polls now read one lightweight performance snapshot and
require both a committed update and that exact presented revision. The final
checkpoint still asserts exact event counts, owner, save and focus. Resize
polls likewise observe the resize event and cheap focused key together, then
retain full diagnostic/save/focus checks. Polls do not repeatedly construct
the full panel diagnostic. This reduces redundant test/browser protocol reads;
it is not a production runtime optimization.

No production source, game behavior, image golden, threshold, runner/retry
setting or acceptance assertion is removed or loosened. There is one additional
Gunsmith test per browser profile. The ordinary production entry assets must
remain byte-identical to the already measured runtime from #219.

## Validation

The three changed browser specifications are explicitly checked with strict
TypeScript because the ordinary application lint configuration excludes the
browser-test plane:

```bash
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --resolveJsonModule browser-tests/equipment-updates.pw.ts browser-tests/equipment-loadout.pw.ts browser-tests/gunsmith-updates.pw.ts
CI=1 npx playwright test browser-tests/equipment-updates.pw.ts browser-tests/equipment-loadout.pw.ts browser-tests/gunsmith-updates.pw.ts
```

Before the observation batching, all 24 focused rows passed on all six
established profiles. An additional adversarial experiment pinned Node, Vite
and all Chromium child processes to one CPU: all nine repeated desktop
update journeys exhausted the unchanged deadline. Pinning the batched
observations to two CPUs also produced deadline failures. These whole-browser
affinity constraints are not equivalent to the CPU4x benchmark or physical
mobile hardware. They establish a remaining harness/environment limit, not a
proven gameplay or loader defect. No one/two-core robustness or timing
improvement is claimed. Retained logs and the exact pre-batching patch make
the experiment inspectable; the final supported matrix and hosted runs must
pass, rather than being replaced by a retry of the original red head.

Final closeout
requires ordinary units/allocation/runner probes, lint, content, full art/source
validation, ordinary production build and identity, diff checks, the full
six-profile matrix, independent exact-head review and hosted CI. Exact candidate
and merged-main results belong on the PR and owning issue once completed.

#209 and #201 remain open. This release correction does not resolve human
Figma/art/device gates or introduce another architecture/product slice.
