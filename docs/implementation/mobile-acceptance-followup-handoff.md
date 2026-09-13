# Mobile Acceptance Follow-up — Implementation Handoff

**Baseline:** PR #176 at `19622aa01dfb50ed172037c6184770a20d5ff3b5`.

**Authoritative plan:** [`../architecture/alpha-3-mobile-acceptance-followup.md`](../architecture/alpha-3-mobile-acceptance-followup.md).

Read `AGENTS.md`, the normal repo read-order docs, then the plan above. The plan is the implementation authority for this tranche; this file is only the dispatch note.

## Task

Implement the four real-device findings as one new PR stacked on #176:

1. add a blocking, truthful Contract-loading/failure surface;
2. make Career Achievement badges resolve the same semantic icon identity as terminal Achievements;
3. add clear presentation-only visual feedback for all current active abilities;
4. make phone landscape an explicit unsupported state with a rotate-device guard and frozen simulation. Do **not** build a second landscape gameplay layout.

Use the ordered slices, state ownership, regressions, reviewer traps and exact phone gate in the referenced plan. Start with RED reproductions on the exact baseline.

## Hard boundaries

- Keep scenes as composition/lifecycle glue.
- No content-ID branches for Achievement or ability presentation.
- Ability visuals must not change gameplay mechanics or timers.
- Loading/orientation states must block touch, keyboard and controller input consistently.
- No Save V4 change for presentation-only state.
- Preserve desktop landscape through the existing fitted portrait canvas.
- Do not close #87; assembled-weapon visuals remain a separate required follow-up.
- Do not merge #176 merely because this implementation is ready.

## Closeout

Run focused tests, then the full repo gates from `AGENTS.md` plus content/art/allocation validation where applicable. Deploy one exact SHA and complete the device journey in the referenced plan before recommending merge.