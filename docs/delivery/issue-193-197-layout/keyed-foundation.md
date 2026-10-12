# #193 / #197 pure keyed navigation and collection bookmarks

13 October 2026. Implementation foundation on candidate #248 base
`04e21fad0c21f2d5843d343af212f764543ac3b4`; no runtime surface integration.
The policy source is PR #231 at
`789b2647eb9466895d90b336abaa2cec04d20e84`, particularly
[the complete input contract](https://github.com/Joncallim/Meowcenary/blob/789b2647eb9466895d90b336abaa2cec04d20e84/docs/art/design-handoff-2026-10-09/COMPACT-GRID-INPUT-CONTRACT.md)
§§2, 3, 5, 6, 8 and 9, read alongside its compact-grid spec and current
#193/#197 product acceptance. The reconnaissance record is the external
`compact-grid-next-boundary.md` under
`/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/`.

## Implemented boundary

`src/ui/menuSurfaces/keyedNavigation.ts` builds one immutable neighbour plan
from actual rendered header rows, explicit grouped card rows, visible actions,
a supplied outer/local Back, generation and semantic retained candidate.
Left/right is row-local; card vertical moves clamp the column in the adjacent
nonempty rendered row; header vertical moves choose nearest horizontal center
with a left tie. Headers, cards and fixed actions never share modulo arithmetic.
Empty rows/groups disappear without phantom nodes. A visible empty control is
optional; an otherwise empty view may contain Back alone.

Every node carries its semantic key, action/card/reading role, scene index,
optional scroll-local index, rendered horizontal center and generation.
Construction validates roles, unique keys/scene/scroll indexes, ordering,
finite centers, generation and retained references. Nodes cover the complete
current live view: scene indexes must form exactly the permutation
`0..nodeCount-1`, and optional scroll mappings exactly `0..mappedCount-1`.
Registration order may differ from node source order; controls may remain
unmapped to scrolling. Final-set validation rejects holes or out-of-range
mappings before any plan can reach the scene navigator/scroll mirror. Tables, arrays and node
copies are frozen. Internal lookup tables never escape as mutable Maps.
An invalid participating layout throws before a plan can be installed.

`resolveKeyedNavigation` returns the key/index mapping and departure receipt
in O(1). An absent edge stays; an unknown current key/direction, stale generation,
invalid departure or forged plan returns null. The caller must route null to
its existing recovery gate rather than numeric fallback. Wide edge Right and
last-row Down enter visible inspector actions. Compact edge Right stays.
The first action's Up returns to the retained candidate; wide inspector Left
uses the exact supplied grid departure, which may differ from that candidate.
Without a departure receipt, Left stays. The scene owns this scalar and should
clear it on plan replacement, pointer entry from elsewhere or view change.
The helper has no live focus, navigator, listeners, selected-candidate commands,
reveal, activation or persistence.

Detail plans contain only one genuine reading target, fixed actions and local
Back. Their Up/Down edges describe reader boundaries; the scene must consume
reader paging first and apply edges only when already at the relevant boundary.
The helper does not implement paging or retain browse targets behind details.

`src/ui/menuSurfaces/collectionBookmark.ts` repairs bounded transient data:
scope, candidate identity, focus identity, first-visible-row stable key and
intra-row offset. Current legal candidates/focus, explicit rendered rows,
fallback focus and scroll bounds are caller data. Missing identities repair by
old-order surviving successor, predecessor, then first current candidate;
empty collections use the supplied empty-state/Back focus. A scope change
resets the bookmark. Reordering and new columns locate the stable key in its
new row; the output anchor is that row's first key. Intra-row and global offsets
clamp independently. Existing fixed-control focus can remain distinct from
selection. Returned candidate repair is view data, not controller mutation.

Restore does not reveal automatically. `revealCollectionFocus` is a separate
explicit minimal-reveal policy for keyboard/controller restoration. Fixed
controls leave the clamped offset unchanged. Oversized rows reject this policy
and require the later detail-reader route. No Phaser objects, Save fields,
eligibility/acquisition rules, preview operations or unbounded history are held.

## Focused evidence

Node **22.23.2**, checked-in dependency runtime Vitest **3.2.6**. Direct execution
from `/home/jon/projects/meowcenary-worktrees/meowcenary-compact-keyed`:

```sh
/opt/node22/bin/node node_modules/vitest/vitest.mjs run tests/keyedNavigation.test.ts tests/collectionBookmark.test.ts
```

- RED before adding either module: **2 failed test-file collections, no tests**
  because the requested modules did not exist. This establishes a missing
  feature contract, not a defect in the existing linear runtime.
- Initial GREEN: **48 tests passed / 2 files** (37 navigation, 11 bookmark).
- Independent review identified sparse mapping acceptance in this newly added
  pure helper. Mapping RED: **3 failed / 48 passed tests**, 2 files. The cases
  include two-node reader index 0 / Back index 999, out-of-range card scroll
  index 999, other gaps and duplicates. A regression exercises the existing
  real `FocusNavigator`: Back index 999 clamps to 1, which cannot resolve to
  Back in the supplied mapping. This is a defect in this candidate helper,
  not a finding against current main or #201.
- Mapping GREEN after final-set density validation: **51 tests passed / 2
  files** (40 navigation, 11 bookmark). Existing accepted fixtures now assign
  complete live-view indexes; all oracle/reachability/bookmark coverage remains.
  Positive cases also accept scene/local mapping permutations and optional
  unmapped cards, including an entirely unmapped collection.
- Navigation matrix: **28 layouts**, counts 0/1/2/8/9/10/50, 2/3 columns and
  compact/wide modes, **2,080 node/direction oracle comparisons** plus reachability
  from Back. A separately written direct-search oracle evaluates rendered rows;
  it does not inspect/reuse production neighbour tables. Additional assertions
  cover interior ragged/grouped geometry, nearest ties, exact departure versus
  retained selection, compact boundaries, empty/no-header/no-action layouts,
  local detail roles, invalid plans/generations/indexes/roles, prototype-looking
  keys, immutable input copies and deterministic rebuilds.
- Bookmark matrix: **162 removal/reverse/column cases**, separately computed
  expected repair and offset. Additional assertions cover insertion, retained
  identities, scope reset, empty transitions, fixed focus versus selection,
  separate reveal, oversized rows, gaps, offset clamps, malformed layouts,
  immutable inputs and repeated deterministic calls.

Raw RED/GREEN logs remain external in
`/home/jon/projects/meowcenary-evidence/issue-burn-2026-10-12/compact-keyed-red.log`
and `compact-keyed-green.log`. The bounded mapping review/fix logs are
`compact-keyed-mapping-red.log` and `compact-keyed-mapping-green.log` in the same
external directory. The 2,080 navigation comparisons and 162 bookmark cases are model iterations;
51 is the actual focused repository test count. None is browser or physical-device evidence.

## Integration handoff and limits

The primary integrator owns independent review, typecheck and repository
closeout. This worker ran no build, full suite, browser or live service test.
Current linear menus and controllers are unchanged. No issue, branch, commit,
push, PR, merge or deployment mutation was performed by this worker.

The later single Menu/surface writer must build and commit the plan only at
mount/read-model/geometry changes with the same generation as hit targets,
supply every live control with its actual dense scene registration index and
each scroll-mapped target with its actual dense region registration index,
maintain one scene focus owner, apply one scene setIndex and at most one passive
scroll sync/reveal, and keep activation separate. Bookmark scope must include
slot/filter or family/surface/recipe/input-step identity; legal keys come from
the authoritative current read model. Browse/reader transition, local Back,
resource races, locked-readable eligibility, save/preview parity and merge
ladder remain integrated acceptance work under #193/#197. No visual,
physical-input, product-owner, full-suite, CI or release acceptance is claimed.
Main/production `4f79d621` remain protected; neither issue closes here.

Independent final read-only review and coordinator rerun both passed all 51 focused tests. The initially accepted sparse mapping was rejected, reproduced RED, and repaired before commit. Full exact-head closeout and hosted CI remain required; this pure foundation does not change current Menu behavior or close #193/#197.
