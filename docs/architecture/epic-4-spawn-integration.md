# Epic 4 Slice 5: Spawn and Difficulty Integration

Slice 5 replaces the legacy wave loop in `SpawnSystem` with the pure director
and completes the runtime path for Epic 4.

## Spawn pipeline

For every active frame:

1. `SpawnSystem` counts live instances by stable definition ID.
2. `SpawnDirector` advances only while the run is active and returns accepted
   requests with exact cadence timestamps and seeded edge-ring positions.
3. `DataEnemyRegistry` supplies the immutable spawnable definition.
4. `scaleEnemy` applies the curve health and damage pressure at
   `scheduledAtMs`, not at the batched frame time.
5. `Enemy` owns the resulting immutable runtime definition before its sprite is
   grouped and `enemy:spawned` is emitted.

This keeps equal schedules chunk-invariant: two spawns delivered in one large
frame receive the same stats they would have received in separate frames.
Source data and registry snapshots are never mutated.

## Contact and pause boundaries

`SpawnSystem` owns the player/enemy overlap callback. Damage is accepted only
while the run is active and both participants are live, and only definitions
with `contactDamage: true` may apply their scaled damage. Player invulnerability
and run-loss behavior remain owned by `Player`.

Paused, won, and lost runs do not advance the director. Live enemies are
stopped, inactive enemies are normalized through idempotent cleanup, and no
paused-time spawn backlog accumulates.

## Randomness and deferred content

`GameScene` derives one named `spawns` RNG stream from the run seed. The
director passes that stream to the screen-edge spawn-point provider only for
accepted requests, isolating spawn randomness from upgrades and other systems.

Ranged, elite, and boss definitions remain validated hooks only. This slice
does not spawn them, add ranged projectiles or boss fights, resolve scrap or
loot, add VFX, tune shipped data, or begin another epic.
