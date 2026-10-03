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

## Reproducible evidence

The runner now uses an existing SMG build alongside the Pistol build. It
switches Pistol → SMG → Pistol, asserts each durable selected ID, then replaces
an occupied receiver and asserts the saved fit. Earlier Equipment reports
reselected the active Pistol; their Gunsmith action timings are not controls
for this stronger journey. Both sides of this comparison use this same runner.

Build each pinned runtime with `VITE_VISUAL_TEST=1`, serve its `dist` on a
dedicated local preview port, and run `scripts/performance-baseline.mjs` from
that runtime's working directory with `--expected-sha`, `--url`, `--out`,
`--repeats 3` and `--window-ms 3000`. Run captures sequentially, without
concurrent builds/tests. Each runtime has nine fresh contexts, three repeats
per desktop 1280×720/DPR1, phone 390×844/DPR3 and foldable 1114×720/DPR2
profile. The latter two use Chromium CPU4x emulation, not physical devices.

The raw archives preserve environment, fixture, seeded combat, owner spans,
presented-frame latency, frame percentiles/sample counts/worst/over-budget
ratios, resources and stable object/texture counts. Ordinary production bundle
inventories are separate; gzip9/Brotli11 are reproducible size estimates, not
CDN transfer measurements. Timing evidence is descriptive, never a brittle
single-run CI threshold. Probe/polling work and uncontrolled background host
load remain limitations.

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
