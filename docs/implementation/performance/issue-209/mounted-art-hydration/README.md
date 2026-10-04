# Issue #209 — hydrate mounted Loadout art

Pinned immediate baseline main: `5c770c59f78c102465177fef680caf81320eef3e`.
Only draft art handoff #208 was open at slice start. Product semantics, Figma
layout and art authority remain with #193/#197/#198/#199/#175 and the art gates.

## Evidence-led scope and ownership

The prior repeated hydration comparison on the same production source showed
Loadout still paid four full renders / 302 objects constructed on cold entry.
Its three-repeat median hydration CPU was 61.6ms desktop, 200.6ms phone CPU4x
and 256.0ms foldable CPU4x. This motivates removing two Equipment/Gunsmith art
rebuilds, rather than decomposing scenes from source line count. It does not
establish physical-device speed or a gameplay bottleneck.

Only the existing Loadout mount declares static catalog, portrait and assembled
weapon image slots. Known absent bindings reserve transparent built-in Phaser
images at final size and draw order; texture/frame/opacity later change in
place. The Scene retains the single focus, scroll, clipping and resource owner.
No resource callback owns a captured snapshot, command, selection or layout.
Generic panel completion still rebuilds common chrome/backdrop. Equipment and
Gunsmith panels retain their existing update/paint boundaries; this is not a
second UI framework or a broad Menu extraction.

Before in-place hydration, the Scene checks the live committed Loadout mount,
current GameContext, immutable save reference and current character/arena/stage
selection. Changed authoritative state, unsupported display capability or
rebinding failure uses the existing fresh-snapshot full-render recovery.
Unmount, resize and shutdown revoke slots before destroying nodes. Opacity
hides unavailable images because the scroll owner controls visibility. Warm
cached completion makes no change. Actual browser observation is explicit and
test-only; ordinary input/performance polling does not gain an image-tree walk.

## Adversarial resource finding

Overlapping logical IDs for a failed physical atlas were re-enqueued by the
Equipment/Gunsmith pending drains. The same atlas could be attempted twice in
one closure (six HTTP attempts including Phaser's existing two retries), even
though the second request arrived before the first failed. Two owner-boundary
regressions are RED on the pinned baseline. The correction must retain one
attempt per physical resource in a drain, preserve genuinely new pending
closures and successful partial art, and permit a later explicit navigation
or selection to retry unavailable resources. This bounded optional-resource
work is not evidence of save loss or a new P0/P1.

## Acceptance and measurement

Retained RED evidence proves the old Loadout shell replacement and real-browser
full rebuilds, and duplicated failed physical requests for both owners. Current
acceptance covers retained control identities/callbacks, exact atlas frames,
geometry, mask/scroll/focus, current-save fallback, A→Home→A plus resize, shutdown,
actual Phaser image/frame/opacity/layer order, partial failure and later retry.
Cached-only queued art after an authoritative save change is also RED on main;
its regression requires one fresh-snapshot repaint and a later T2 art retry.

A complete matched comparison uses the unchanged performance-baseline runner,
identical catalog/save/seed fixtures, three fresh repeats on desktop1280×720,
phone390×844/DPR3/CPU4x and foldable1114×720/DPR2/CPU4x, with three-second light
and heavy combat windows. Timings are descriptive, not new CI thresholds.
A first baseline process terminated with exit143 after five completed cohorts;
its incomplete raw capture is retained externally and excluded. The complete
rerun finished nine cohorts / 243 checkpoints with no browser errors. Cause is not
established. Only completed controls/candidates can enter the comparison.

Full lint/typecheck, ordinary tests, allocation/runner probes, content and all
art/source/export validation, ordinary build/resources, diff checks, the full
six-profile browser matrix, independent exact-head review and hosted CI remain
required before merge. No timeout, retry, screenshot threshold, golden,
assertion or scoped skip is changed. #209/#201 and human visual/device/product
acceptance remain open.

The first cached-only RED attempt exhausted V8 while formatting the identity
failure against a circular fake Scene. It is excluded as assertion evidence.
The exact identity condition now reports a bounded boolean; the repeated
baseline repro reaches the expected RED assertion. No heap limit or production
behavior was changed for this test-formatting correction.
