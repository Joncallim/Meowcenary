# Epic 4 Slice 3: Enemy Movement and Charger Timing

Slice 3 adds deterministic movement rules without adding spawn policy. Pure
helpers live in `src/gameplay/enemyMovement.ts`; `Enemy` only translates their
planned displacement into an immediate Phaser body reset and publishes the
resulting runtime state. Arcade Physics runs before `GameScene.update`, so this
same-step reset keeps sprite position, body position, zero residual velocity,
phase, and timer synchronized for every frame size.

## Movement contract

- `chaseStep` moves directly toward a target by `speed * dt`, clamps at the
  target, never mutates inputs, and rejects non-finite domains.
- Chasers and tanks use the same readable pursuit rule. Their shipped speed and
  health data create the intended fast/light and slow/heavy distinction.
- Ranged and boss shells remain stationary because their behavior is deferred.
- Resolved elite shells may inherit their base chaser, tank, or charger movement
  contract, but this slice does not make elite rows spawnable.

## Charger phases

`chargerStep` is Phaser-free and returns a new movement snapshot:

1. `pursuing` moves at base speed until the target is within `triggerRange`.
2. `winding` remains still for `telegraphMs`.
3. `attacking` locks the direction at windup completion and moves at
   `dashSpeed` for `dashDurationMs`.
4. `idle` remains still for `cooldownMs`, then returns to pursuit.

One update may cross multiple phase boundaries, so results remain deterministic
for both small and large frame deltas. Paused or invalid runtime deltas produce
zero velocity and do not advance state.

## Deferred boundaries

This slice does not replace spawn scheduling, apply time scaling at spawn,
change contact damage, add visuals or VFX, implement ranged attacks, spawn
elite/boss enemies, resolve loot/currency, or begin another epic.
