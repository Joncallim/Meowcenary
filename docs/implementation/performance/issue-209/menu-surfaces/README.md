# Issue #209 — mounted Menu surfaces, parity first

Baseline: `169e3b9829d49514e491ffad6b8e5c5efeb38896` (current main, PR #214).
The only open PR at the start of this slice is the draft #208 art handoff;
there is no competing MenuScene implementation branch.

Slice B measured 117 objects created for Equipment selection and 110 for a
Gunsmith replacement. This slice establishes ownership for those panels and
Loadout before attempting incremental updates. It does not claim a timing
improvement: both the shared shell and panel content still rebuild for parity.

## Ownership and lifecycle

- MenuScene owns navigation/controller coordination, input quarantine, run
  launch, the shared focus/scroll coordinator, common shell and serialized
  resource queue. There is still exactly one navigator and scroll mask.
- A Loadout, Equipment or Gunsmith surface owns its panel container and drawing.
  Shared Loadout copy/chrome and assembled weapon drawing consume existing
  authoritative read models; they do not derive gameplay or save state.
- The required surface lifecycle is `present`, `unmount`, `dispose`. A panel
  instance survives visits during one Menu activation. `unmount` revokes the
  content mount and destroys its tree; `dispose` also ends the instance.
  Equipment's Browse Sets state survives panel visits and resets with Menu.
- Every content mount has a generation. Commands from a revoked mount are
  rejected before invoking the existing controller mutation. Partial mount
  failure cleans its owned tree and leaves Menu's existing recovery gate closed.
- Surfaces receive geometry, the immutable lazy snapshot, current Scrap, typed
  controller capabilities, shared drawing/focus/scroll primitives and resource
  request callbacks. They cannot read GameContext or durable storage.
- Resource promises remain Scene-owned. Late loads can populate shared cache,
  but repaint the current panel using a fresh controller snapshot. They never
  call a captured surface or snapshot. A→B→A may use A's earlier completed art;
  shutdown/restart remains protected by the existing Scene generation guards.

The first partition deliberately covers the measured Loadout family. Other
panels remain under their current owner until a further independently shippable
partition. Slice D can retain shell objects and update panel-local sections
through these owners; it must preserve semantic selection, focus, scroll,
disabled states and the shared resource queue.

## Validation contract

Preserve existing Menu lifecycle, lazy-read-model, input, scrolling and resize
tests and browser observation fields. Add revoked-mount command, partial mount
rollback and repeated unmount/remount regressions, including A→B→A late-art
hydration with changed selection. Run ordinary tests, allocation and runner
probes, lint, content/art validation, production build, diff checks, full browser
matrix and exact-head hosted CI. Inspect real panel captures; no screenshot,
timeout or assertion loosening is authorized by this extraction.

Owning #193/#197/#198/#199/#201/#175 semantics and human art/device acceptance
remain unchanged. This partition does not complete #209.

## Reproduced resource defect

During lifecycle review, the Equipment loader dropped requests arriving while
`equipmentArtLoading` was true. A repro against the exact baseline source
requested the Commando atlas, then Recon's Set atlas before completion. Only
Commando was queued; the Recon request was lost. The failing runner output is
preserved in `equipment-closure-baseline-red.log.gz`.

The same regression now verifies both physical atlases are requested once,
completion repaints the latest snapshot, and a warm repeat does not load again.
The loader retains pending IDs, clears its loading flag before hydration, and
uses the existing Scene generation to reject obsolete completion. Create and
shutdown clear pending IDs. This is a resource correctness fix, not a reason to
change Equipment mechanics or art authority.

Additional ownership coverage verifies partial mount/adoption failure cleanup,
repeated mount/unmount bounds, disposed callbacks, Browse Sets state across
visits and Scene restart, and current-selection hydration after
Equipment→Home→Equipment plus resize during a deferred load. The live-control
unit helper now ignores destroyed controls; explicit stale-callback tests still
invoke retained callbacks to verify rejection before controller mutation/audio.
The extracted panels add one zero-position content container; no extra mask or
input listener is introduced. All previous pixel/geometry assertions remain.
