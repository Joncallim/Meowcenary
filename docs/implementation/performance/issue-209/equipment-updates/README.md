# Issue #209 — local Equipment selection updates

Pinned comparison baseline: main `251d77d9a87d2062e6cd9e7b13c66fad95a94363`
(PR #215). The only open PR at the start is draft #208's art handoff.
The previous resource report observed 117 created objects per Equipment selection.

## Ownership and acceptance

An explicit candidate/blueprint selection returns one authoritative controller
snapshot. If the mounted Equipment prefix is unchanged, its shell, header,
rows and one scroll mask survive. The surface replaces its selection detail
and fixed Fabricate/Back controls; MenuScene prunes and rebuilds their shared
focus/scroll registrations. Retained prefix indices remain stable.

The eligibility check compares immutable presentation facts, Scrap, slot,
Browse Sets state, the selected Set hero, notice, backdrop and viewport geometry.
A changed prefix, resize, lazy-art hydration, equip/upgrade/fabricate or other
command keeps the existing full-render path. Controller commands are never
replayed during local-draw recovery. Gameplay, save, preview and art truth stay
with their existing owners under #193/#197/#198/#199.

Detail callbacks carry a generation in addition to the whole surface mount.
Old detail objects are revoked before destruction. The single Scene-owned
scroll region is replaced with its recomputed extent, allowing shorter details
to shrink the scroll range. Base coordinates are restored synchronously before
remeasuring retained objects. No second mask or focus owner is introduced.

Presentation revisions now include local updates. `menu.update` is distinct
from `menu.render`, and POST_RENDER observes the current revision rather than
assuming every state change increments the full-rebuild count. The existing
performance runner accepts exactly one action presentation and compares its
revision to the actually presented frame, with fallback for older baselines.
The local section timer covers replacement construction; the eligibility guard
is outside that timer. Whole-action POST_RENDER latency includes the guard.

The baseline RED regression in `selection-baseline-red.log.gz` uses baseline
production sources plus the new shell-retention test. It fails because the old
root is destroyed. Candidate tests require the root/mask/rows to survive,
revoked detail commands to remain inert, and equip to retain its durable
semantics. Twelve long/short swaps cover extent shrinkage, focus and object
bounds; changed Set/inventory forces a full rebuild; injected draw failure
recovers the selected snapshot without repeating its command. The existing
deferred-art/navigation/resize test also selects through the local update
while loading. The unit display mock now removes destroyed children from their
parent, matching Phaser; deep destruction iterates a copy.

The new real-browser journey uses the established catalog fixture, logical
focus, profile-specific touch/pointer selection, revision observation, resize
and authoritative equip. Screenshots are evidence, not new visual authority.

## Measurement and release gates

Compare repeated runs using `scripts/performance-baseline.mjs`, pinned build
metadata, fresh browser contexts, identical catalog/seed fixtures and active
combat windows. Retain raw archives, environment and limitations; do not claim
an improvement from one run or from source-file size. Ordinary bundle inventory
is measured separately from the instrumented test build.

Before shipping: lint/typecheck, full ordinary units, allocation and runner
probes, content, complete art/source/export validation, ordinary production
build/seam checks, diff checks, full existing viewport/browser matrix and
exact-head hosted CI. Human Figma, art, physical-device and product gates stay
open. #209 is not complete from this scoped optimization alone.

## Repeated findings

The immediate baseline is `251d77d9a87d2062e6cd9e7b13c66fad95a94363`; the
measured implementation is `e0c0a3f805fdac2e8eaacd01e1c0618e7ba80aa1`.
The initial bc4b8e7 measurement is retained separately. The final runtime also
contains the hosted-load corrections below. Both final runs used the
candidate runner, with its older-baseline presentation-revision fallback.
There were nine fresh cohorts per runtime, three repeats each for desktop
1280×720, phone 390×844/DPR3 and foldable 1114×720/DPR2: 18 cohorts, 468
checkpoints, zero browser errors. Runs were sequential, never concurrent.

All nine candidate selections changed their owner from full `menu.render` to
local `menu.update`. Created objects fell from 118 to 41 (65% fewer), destroyed
objects from 96 to 19. Stable objects stayed at 118 and textures at 57. Median
selection latency to POST_RENDER fell from 226.8 to 182.7ms on desktop, 324.3
to 178.6ms on phone, and 455.8 to 282.9ms on foldable. The three-repeat ranges
for this action do not overlap. Its unnecessary shell/prefix reconstruction
was a demonstrated cost; retaining them removes that work.

Other actions have mixed results, including slower phone equip/fabricate and
warm Equipment entry, and slower desktop/foldable run preparation in this run. Baseline-first ordering and host load were
not controlled, so this evidence cannot attribute those changes to the code
or demonstrate unchanged whole-game timing. No boot, Gunsmith or combat
improvement is claimed. Blueprint selection sometimes changes the Set hero
and legitimately uses the full path. This slice addresses candidate selection;
#209's broader responsiveness acceptance remains open.

[comparison.md](comparison.md) retains action ranges, raw frame sample counts,
p50/p95/p99, worst frames, over-budget counts/ratios and limitations. The
three-second headless combat windows are comparable bounded evidence, not a
physical-device or long-soak performance verdict. The GPU backend is unverified.

Raw inputs are `baseline-raw.json.gz` and `candidate-raw.json.gz`. Reproduce:

```bash
python3 docs/implementation/performance/issue-209/equipment-updates/summarize.py \
  --baseline docs/implementation/performance/issue-209/equipment-updates/baseline-raw.json.gz \
  --candidate docs/implementation/performance/issue-209/equipment-updates/candidate-raw.json.gz \
  --out /tmp/meow-equipment-comparison.md
```

For fresh captures, build each pinned worktree with `VITE_VISUAL_TEST=1`, serve
its production directory on a separate local preview port, then run the
candidate `scripts/performance-baseline.mjs` from that worktree with `--url`,
`--out`, `--repeats 3`, `--window-ms 3000` and `--expected-sha` set to its pin.
Do not run builds, tests or another capture alongside a timing capture.
Ordinary resource inventories are separate gzip archives; their compression
is a reproducible build estimate, not measured CDN transfer.

## Remaining ownership

Gunsmith local updates, other measured panel costs, justified remaining surface
extraction, native integration documentation and final baseline-to-final/device
acceptance remain under #209. The shared focus colour guard and diagnostic
read correction remove reproduced redundant work; their individual timing
contributions are not isolated. Product issues and visual approval remain
with their owners.

## Ordinary build inventory

| Item | Baseline raw / gzip9 / Brotli11 bytes | Candidate raw / gzip9 / Brotli11 bytes |
|---|---:|---:|
| Application JS | 809244 / 182723 / 149087 | 814034 / 183813 / 149956 |
| Phaser chunk | 1208050 / 330419 / 264694 | 1208050 / 330419 / 264694 |

The candidate inventory records uncommitted evidence files only; runtime and
manifest source hashes match the pinned build. This scoped retention logic
increases application bytes; it is not a bundle
size optimization. Both inventories have 619 logical art bindings, 96 physical
visual resources, 112 distinct visual URLs and 226 dist files. No asset/audio
manifest changes are included. Six selected-detail captures are in `captures/`;
controls and Recon comparison state were inspected across all profiles. The
large-desktop Technician row highlight is pointer hover, separate from the
active Recon detail and semantic selection. Supplemental detail stays inside
the scroll viewport; the footer remains fixed. These are parity evidence only.

## Full-suite harness reconciliation

The first full suite exposed the controller journey fake Container's missing
Phaser `list` property. The owning production path correctly requires that
list to track selected-detail children. The shared journey fake now models
list, child removal/reparenting and nested deep destruction; the MenuScene
fake also removes nested containers by their wrapper identity. The new
conformance test fails on the old harness (`container-harness-red.log.gz`),
then checks that individually destroyed children leave the owner and all
nested children are destroyed during disposal. Existing controller journey
assertions remain intact. This is test fidelity, not a production fallback or
behavior change; complete validation is rerun on the reconciled head.

The next full browser run passed all selection journeys but failed the six
telemetry registry checks: the intentionally added `menu.update` owner was
absent from their exact expected list. That list now includes the new owner,
with additional assertions that it has zero samples/events on Home. The exact
registry assertion is retained, as are save, bounds and opt-in assertions;
`telemetry-registry-red.log.gz` preserves the full RED run. No timing, image,
skip or timeout policy changes accompany this contract update.

## Hosted-load reconciliation

Hosted runs on a077c10 and 4616c08 hit the unchanged 30-second budget in the new
1920×1080 journey while traversing the catalog's real keyboard focus. The latter
full hosted RED is preserved in `hosted-keyboard-budget-red.log.gz`. The former
failure screenshot was inspected: it showed Recon focused in the catalog, not
an accepted new visual baseline. No fixture, input coverage, assertion, timeout,
image policy or skip is reduced to pass the journey.

Two concrete owning-boundary costs were reproduced. The diagnostic resolved
the lazy Equipment model four times per call (`diagnostic-read-red.log.gz`). It
now resolves once and stays lazy outside Loadout/Equipment. Shared focus called
Text.setStyle on every label on every navigation even when its colour was
unchanged. Installed Phaser 3.90 TextStyle.setStyle defaults to remeasuring text
and updating its canvas on each call. `focus-colour-red.log.gz` shows redundant
writes; the guard compares the current colour before writing. The regression
also requires a moved single ring and restoration when a label's palette really
changes. Fakes expose the real Text style property. These costs both contribute;
the hosted timeout cannot be assigned solely to one, and host load also matters.

Initial repeated bc4 results remain in `initial-comparison.md` and the two
`initial-*-raw.json.gz` files. The final comparison and raw archives use fresh pinned runs after both
corrections; diagnostic workload itself can perturb timing. Reproduce the
initial report using its raw archives and `--candidate-sha bc4b8e771c0b8bea734f214fe4796f0444432bb2`.
