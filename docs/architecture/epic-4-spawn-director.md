# Epic 4 Slice 4: Deterministic Spawn Director

Slice 4 adds the Phaser-free scheduling policy in
`src/gameplay/spawnDirector.ts`. Rendering and enemy construction remain in the
runtime coordinator for the next slice.

## Scheduling contract

- The director snapshots the supplied curve at construction so later caller
  mutation cannot rewrite a running schedule.
- Each wave owns a `Cadence` that begins only at its configured `startSecond`.
- Due ticks from every wave are merged by exact scheduled time. JSON wave order
  is the deterministic tie-breaker.
- `maxAlive` is enforced per enemy against supplied active counts and requests
  already accepted in the current update.
- Ticks blocked by the cap are skipped, not queued, so released capacity cannot
  cause a backlog burst.
- No request is emitted at or after the curve duration.

`SpawnRequest.scheduledAtMs` records the exact cadence time, independent of
frame batching. The runtime integration slice uses that value for spawn-time
health and damage scaling.

## Randomness boundary

The director owns one injected run-scoped `Rng` and passes it to the supplied
spawn-point provider only when a request survives cap gating. The schedule
itself consumes no random values, equal seeds reproduce positions, and blocked
ticks do not perturb later scheduling decisions.

## Deferred boundaries

This slice does not create Phaser objects, replace `SpawnSystem`, apply scaling,
change contact damage, tune shipped data, add elite/boss spawning, implement
ranged attacks, resolve loot/currency, or begin another epic.
