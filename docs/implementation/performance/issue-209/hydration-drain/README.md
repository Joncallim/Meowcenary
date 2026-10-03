# Issue #209 — one terminal panel-art hydration

Immediate baseline main: `070ebb0942b854b7b57e8857624fb75e2d9de827`.
Measured runtime candidate: `d25a61700048edc4494a06c90a196207c2d1ce15`.
Only draft art handoff #208 was open when this slice started. No competing
MenuScene implementation or product/layout change is introduced.

## Owning defect and correction

The panel-art loader recursively drained queued IDs. A queued batch already
in cache repainted, then its outer successful load repainted again with the
same texture/object state. Cold Home and Loadout each paid one unnecessary
full rebuild in every fresh baseline cohort. The outer invocation also lacked
a generation check after awaiting its recursive child: a Menu restart during
the second load could let that obsolete outer completion repaint the new
activation. It read a fresh snapshot, so the repro proves unauthorized repaint,
not old save/selection publication or production data loss.

One iterative Scene-owned pipeline now drains overlapping panel-art requests,
retaining its loading ownership across batches. Each awaited completion checks
Scene generation and liveness before consuming pending IDs or registering
animations. Only the current generation may release its loading flag. Batch
success and queued cached overlap retain the existing panel eligibility; one
terminal hydration reads the current controller snapshot. A warm request with
no pending repaint still does nothing. Empty queued closures release their repaint markers, so the settled
observation can close. A queued panel still hydrates art cached by a prior
batch when its remaining resource fails. Both gaps are also RED on baseline.
The empty-request repro establishes a Scene boundary/settling defect, not a
confirmed permanent hang on a public input journey. No timer/debounce or
longer wait hides the work. The existing physical-resource resolver, deduplication, serialized
Phaser loader, source/export rules and animation registration remain intact.

Equipment, Gunsmith, Mercenary and Achievement loaders retain their separate
ownership. This change does not merge their resource queues or claim that all
hydration now happens in place. Full-render recovery, semantic focus/scroll,
input, disabled state, selected IDs and authoritative save commands retain
their existing boundaries. Further surface-local hydration remains #209 work.

## Regressions

Six units are RED against the pinned baseline and GREEN after correction:
one cached same-panel overlap; successful distinct batches with a request
arriving during the second load; the same drain with a failed middle resource;
Scene restart during the queued second load; an empty queued Compendium
closure; and queued cached art alongside a failed missing resource. They
assert one terminal
fresh-snapshot repaint, serialized starts, cached resources and untouched
new-activation flags/requests. Their retained RED logs are compressed here.
The multi-batch fixture resolves three real stable art IDs from the live
registry; an initial nonexistent third ID was corrected, and that invalid
failure was discarded outside the authoritative evidence.

A real-browser cold Home regression is also RED on baseline (two hydration
renders, expected one). It uses the existing committed Menu/resource boundary,
not a wall-clock performance threshold. Its six-profile acceptance is part of
the full matrix. Existing navigation, partial-failure, cached prior-panel
closure, late-load, resize, revoked-command, input, save and lifecycle tests
remain in place. No timeout, image threshold, golden or assertion is weakened.

## Reproduction and limitations

Both sides use the unchanged checked-in `scripts/performance-baseline.mjs`.
Build each pinned runtime with `VITE_VISUAL_TEST=1`, serve its dist on a
separate local preview port, and run from that runtime's worktree:

```bash
node scripts/performance-baseline.mjs --expected-sha <runtime-sha> --url <preview-url> --repeats 3 --window-ms 3000 --out <evidence-directory>
```

Each side has nine fresh contexts: three repeats each at desktop
1280×720/DPR1, phone 390×844/DPR3 and foldable 1114×720/DPR2. Phone/foldable
use Chromium CPU4x emulation. The same save/catalog/seed fixtures and all 27
journeys are asserted on both sides. Runs are sequential baseline then
final corrected candidate, with no concurrent builds/tests. An intermediate
c1ff candidate capture was stopped after concrete review blockers; it is
excluded from the authoritative comparison. Headless Linux, unverified GPU,
diagnostic observation and uncontrolled background host load remain limits.
Three-second combat windows do not establish physical-device or long-run
performance. Timing is descriptive; deterministic ownership/resource bounds
are the regression gate. Raw distributions, counts, p50/p95/p99, worst and
over-budget facts remain in the archives and [comparison](comparison.md).

Reproduce the report with:

```bash
python3 docs/implementation/performance/issue-209/hydration-drain/summarize.py --baseline docs/implementation/performance/issue-209/hydration-drain/baseline-raw.json.gz --candidate docs/implementation/performance/issue-209/hydration-drain/candidate-raw.json.gz --candidate-sha d25a61700048edc4494a06c90a196207c2d1ce15 --out /tmp/meow-hydration-comparison.md
```

## Repeated findings

There are 18 matched cohorts / 486 checkpoints with no browser errors.
Every repeat removes one Home and one Loadout full rebuild: Home creates
151 → 99 objects (34.4% fewer); Loadout creates 378 → 302 (20.1% fewer).
Stable Home remains 52 objects / 23 textures; Loadout remains 83 / 47.
The resource/physical binding counts and final presentation are unchanged.

Median hydration CPU totals fall on all three profiles. Home changes from
34.1 → 11.8ms desktop, 86.9 → 44.8ms phone and 101.0 → 56.9ms foldable.
Loadout changes from 80.4 → 61.6ms, 290.0 → 200.6ms and 332.3 → 256.0ms.
The three-repeat ranges are in the comparison; the redundant construction
is a measured contributor, rather than an inference from Scene file size.

Presented cold readiness/entry latency is mixed. Phone cold Home improves
1690.8 → 1574.8ms, while foldable cold Home increases 1984.6 → 2072.6ms;
foldable Loadout entry is also slower despite lower render-owner CPU.
Thus this is a reconstruction-cost reduction, not a claimed whole-game,
boot or physical-device speedup. Warm interactions and run-launch timings
remain descriptive controls; resource waits and uncontrolled scheduling
are included in end-to-end latency.

Light/heavy p50 cadence medians remain unchanged. Tail percentiles vary,
including foldable heavy p99 100.1 → 116.6ms in sparse three-second windows;
per-repeat worst-frame ranges overlap. This does not prove a combat CPU
bottleneck or improvement. Counts, p50/p95/p99, bounded worst frames and
all over-budget numerators/ratios are retained for honest comparison.
No gameplay owner, RNG, save semantics or simulation source is changed.

Ordinary build size estimates (raw / gzip9 / Brotli11 bytes) remain separate
from actual transfer and diagnostic builds:

| Item | Baseline | Measured candidate |
|---|---|---|
| Application JS | 817329 / 184492 / 150377 | 817355 / 184546 / 150623 |
| Phaser chunk | 1208050 / 330419 / 264694 | 1208050 / 330419 / 264694 |

Boot remains six physical visual resources (ten files) and four Menu audio
files; the 17 run-only audio files remain in run preparation. Logical art
remains 619 bindings / 96 physical resources / 112 visual URLs; production
contains 226 files. No asset/font/audio packaging change is made here.

## Validation and remaining acceptance

Closeout requires the full ordinary unit suite, allocation/runner probes,
lint/typecheck, content and complete art/source/export validation, ordinary
production build, full six-profile browser matrix, diff checks, independent
exact-head review and hosted CI. Runtime measurement and ordinary bundle
inventory are separate evidence. Later report-only commits do not change the
measured source/runner/art/catalog bytes.

#209 remains open: shared/panel-local hydration ownership and final integrated
performance/adversarial/actual-device acceptance remain. #193/#197/#198/#199,
#175 and human Figma/art/product gates retain their owners. #201 remains the
open adversarial ledger. No native package, Capacitor or new framework is added.
