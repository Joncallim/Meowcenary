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
