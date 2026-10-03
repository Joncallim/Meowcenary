# Gunsmith updates — issue #209

Immediate baseline main: `f61d1231c72e8dc69cf543b3a673c4e16400915a`.
The Phase A baseline and previous resource/Equipment reports remain separate
historical evidence. This slice preserves the current #193 layout, art and
authoritative commands; it does not complete #193's Build/Workshop/Parts UX.

## Owning boundary

Existing-build selection and fit/replace/unequip return one authoritative
snapshot. If the mounted prefix is unchanged, Gunsmith retains the common
Menu shell, heading, family controls, family artwork and scroll mask. Selected
family status updates on its existing text node. Build details, Workshop,
Catalog and fixed Back form one coupled suffix and are reconstructed together.
Those sections derive from the same changed build/part state.

The eligibility guard compares viewport dimensions, notice, Scrap, backdrop,
and the ordered family ID/name/art/existing-build identity. Creating a build,
changed prefix, save-failure notice, resize, lazy-art hydration and other
commands retain the full-render path. Family selection still changes the
durable active engineered family. No second viewed-build state is introduced.

MenuScene owns one shared focus/scroll update for Equipment and Gunsmith.
It prunes the replaced suffix, restores retained base coordinates before
remeasuring, recomputes the scroll extent and reuses the existing mask.
Controls use semantic family/part/recipe/catalog IDs. Replaced body callbacks
carry a generation and become inert before destruction; remount/dispose also
revoke the mount. A local draw failure renders the already-produced snapshot
once, without replaying the gameplay or save command.

The full local and hosted matrix caught a candidate-only resize regression at
`164e9146cecd9f6f3ff2270934d9ea16acc9df25`: semantic focus survived, but
restoring its previous screen anchor undid the earlier visibility check and
clipped the receiver replacement action. The shared full-render and local
mutation paths now check visibility after anchoring and before painting.
Anchors that already fit remain unchanged. A keyboard-driven unit is RED on
that candidate (row bottom 776 > viewport bottom 572), GREEN after correction;
the unchanged six-profile browser acceptance also passes. Full raw local/hosted
RED logs and a labelled unit failure summary are archived alongside this report.
This regression was caught before merging and never shipped. Representative
[RED](resize-red-360x640.png) and [GREEN](resize-green-360x640.png) captures
show the replacement action before/after scroll correction; they are runtime
evidence, not approved visual goldens. Independent review inspected 18 GREEN
resize captures across all six profiles. Compact phone/foldable landscape
retains the existing orientation gate.

## Reproducible evidence

The runner now uses an existing SMG build alongside the Pistol build. It
switches Pistol → SMG → Pistol, asserts each durable selected ID, then replaces
an occupied receiver and asserts the saved fit. Earlier Equipment reports
reselected the active Pistol; their Gunsmith action timings are not controls
for this stronger journey. Both sides of this comparison use this same runner.

Build each pinned runtime with `VITE_VISUAL_TEST=1`, serve its `dist` on a
dedicated local preview port, and invoke the **candidate 0c2afcc runner** by
absolute path from each runtime's working directory. Do not use f61's old
checked-in runner: it lacks the strengthened SMG fixture. Pass `--expected-sha`, `--url`, `--out`,
`--repeats 3` and `--window-ms 3000`. Run captures sequentially, without
concurrent builds/tests. Each runtime has nine fresh contexts, three repeats
per desktop 1280×720/DPR1, phone 390×844/DPR3 and foldable 1114×720/DPR2
profile. The latter two use Chromium CPU4x emulation, not physical devices.
Keep timing evidence outside Playwright's disposable output directory.

The raw archives preserve environment, fixture, seeded combat, owner spans,
presented-frame latency, frame percentiles/sample counts/worst/over-budget
ratios, resources and stable object/texture counts. Ordinary production bundle
inventories are separate; gzip9/Brotli11 are reproducible size estimates, not
CDN transfer measurements. Timing evidence is descriptive, never a brittle
single-run CI threshold. Probe/polling work and uncontrolled background host
load remain limitations.

## Acceptance harness under load

Hosted run `37128832951` at `36bf650f3764969864a0fd424131ce9346ec5aa0`
passed the corrected resize test on all six profiles, but five newer journey
rows exhausted their existing 30-second budgets. Its browser matrix took
29.9 minutes versus 13.7 locally. Failures occurred at different journey
phases; the Equipment 1920 row logged its keyboard target at 31.9 seconds and
successful selection at 34.6 seconds. The raw hosted failure log is archived.

Gunsmith's old helper returned from SMG to adjacent Pistol by pressing Down
through the entire catalogue. It now uses real Up, and the same neutral-input
assertions poll at the existing Equipment cadence (16/32/50ms). Checkpoints
batch diagnostics, performance state and durable state after authoritative
commit. Gunsmith's returned checkpoint is captured after its existing
presented-revision wait; it does not substitute an earlier snapshot for
post-presentation focus/save assertions. Equipment observes semantic ordering
and uses real directional keys through the same full inventory.

No fixture, assertion, timeout, image threshold, golden or scoped skip was
removed or relaxed; journeys were not split to expand their budgets. A local
same-runtime desktop 1920 experiment at CDP CPU6x reproduced the original
Gunsmith timeout during resize; the optimized pair passed. Equipment did not
fail in that experiment and its small timing change is not evidence of a
material improvement. Temporary throttling hooks are excluded from committed
acceptance tests. Reproduce the load experiment by serving the pinned visual
build, copying each original/current spec into an isolated test directory, and
adding a test-only `beforeEach` that opens `page.context().newCDPSession(page)`
and sends `Emulation.setCPUThrottlingRate` with `{ rate: 6 }`. Use the existing
configuration and desktop-1920x1080 project, one worker, unchanged fixtures
and 30-second test budget. Original and post-presentation-corrected logs are
archived alongside the report. These harness changes are separate from game responsiveness;
the benchmark runner and measured runtime source remain unchanged.

## Validation and remaining acceptance

Two new regressions run against f61 first fail because build switching and
replacement destroy the menu root; their preceding one-command and durable
state assertions pass. Candidate tests also exercise retained identities,
semantic focus, stale callbacks, failure recovery and responsive rebuilding.
The browser journey uses real keyboard navigation, touch/pointer replacement,
resize and keyboard unequip across the six canonical profiles.

Closeout requires lint, full ordinary units, allocation/runner probes, content,
complete art/source/export checks, ordinary build/seam checks, diff checks,
full browser matrix, independent exact-head review and hosted CI. No golden,
image threshold, timeout or existing assertion changes are authorized here.
Human Figma, art, physical-device and product acceptance remain with their
owning issues. #209 also retains its remaining measured ownership/mobile seam
and final device acceptance work.

## Repeated findings

Measured implementation: `0c2afcca0303e9b891dd2724c0d79a9e9f8d87f6`.
There are 18 matched fresh cohorts / 486 checkpoints with zero browser errors.
The candidate was remeasured after the resize correction; the unchanged f61
control was captured earlier with the identical runner/fixture. Intervening
validation and uncontrolled host load limit timing attribution.
Every measured Gunsmith switch and replacement changes its presentation owner
from `menu.render` to `menu.update`. Each action retains 25 objects: Pistol
replacement creates/destroys 86 instead of 111 (22.5% fewer). Its stable count
remains 111 objects / 55 textures; SMG remains 116 / 59 on both runtimes.

Median replacement latency to the presented frame falls from 199.4 → 143.3ms
on desktop, 277.4 → 215.1ms on phone, and 416.0 → 317.6ms on foldable. The
three-repeat replacement ranges do not overlap. Both actual family switches
also improve their medians. Unnecessary common-prefix reconstruction was a
demonstrated contributor to these interaction costs; coupled body rendering
still owns most construction work and is retained for correctness.

Other timings are mixed, including slower phone Equipment equip and warm
Gunsmith entry on desktop/phone. No whole-game, boot or combat improvement is
claimed. Light/heavy median cadence is essentially unchanged in these short
windows; exact samples, p50/p95/p99, worst and over-budget counts/ratios are in
[comparison.md](comparison.md). Uncontrolled background load, baseline-first
ordering, CPU emulation and the unverified GPU backend limit attribution.
These results do not establish physical-device responsiveness or a simulation
CPU bottleneck.

| Ordinary build item | Baseline raw / gzip9 / Brotli11 bytes | Measured candidate |
|---|---:|---:|
| Application JS | 814154 / 183838 / 149925 | 817329 / 184492 / 150377 |
| Phaser chunk | 1208050 / 330419 / 264694 | 1208050 / 330419 / 264694 |

Boot remains six physical visual resources (ten files) plus four menu audio
files. Logical art remains 619 bindings / 96 physical resources / 112 distinct
visual URLs; production contains 226 files. Payload/resource ownership is
unchanged. Full raw inventories and compressed timing archives are alongside
this report. Reproduce the table with:

```bash
python3 docs/implementation/performance/issue-209/gunsmith-updates/summarize.py \
  --baseline docs/implementation/performance/issue-209/gunsmith-updates/baseline-raw.json.gz \
  --candidate docs/implementation/performance/issue-209/gunsmith-updates/candidate-raw.json.gz \
  --candidate-sha 0c2afcca0303e9b891dd2724c0d79a9e9f8d87f6 \
  --out /tmp/meow-gunsmith-comparison.md
```

Later evidence and browser-harness commits preserve the measured runtime
source, benchmark runner, art and catalog bytes. Final exact-head gates and
ordinary inventory remain separate release requirements; no final-head timing
claim is made from an unmeasured runtime change.
