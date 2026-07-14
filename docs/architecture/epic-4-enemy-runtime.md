# Epic 4 Slice 2: Enemy Runtime State and Lifecycle

Slice 2 adds the runtime state and lifecycle-event contract from Epic 4. It is
stacked on the approved Slice 1 data foundation and does not implement later
movement, attack, spawning-policy, or rendering work.

## Runtime state

`Enemy` implements `EnemyInstance` with:

- stable `instanceId`, `defId`, and resolved `archetype` identity;
- a current `pos` snapshot derived from the Phaser sprite;
- mutable `health`, immutable `maxHealth`, `state`, and `stateTimerMs`;
- states `idle`, `pursuing`, `winding`, `attacking`, and `dead`.

The existing runtime already pursues immediately, so new instances start in
`pursuing` with `stateTimerMs` zero. Slice 2 does not add state-machine timing;
`idle`, `winding`, and `attacking` are reserved for later movement/charger
slices. Lethal damage and explicit removal transition the instance to `dead`,
zero health, and reset the state timer. Removal is idempotent.

The constructor accepts stat-bearing `ResolvedEnemyDefinition` values. This
keeps unresolved elite shells out of the runtime while preserving the complete
archetype identity for a future registry-resolved elite path. Slice 2 does not
wire shell or elite spawning. Each instance deep-clones and freezes its resolved
definition so runtime identity, movement inputs, and rewards remain stable if a
caller later mutates its source, and sibling instances share no mutable state.

## Lifecycle events

- `SpawnSystem` emits `enemy:spawned` only after the sprite joins the enemy
  group. The payload contains instance ID, definition ID, and position.
- `Enemy.takeDamage` emits `enemy:damaged` only for accepted positive finite
  damage while the instance is live.
- After lethal damage, `WeaponSystem` increments the run kill count and emits
  `enemy:killed` once with instance ID, definition ID, XP value, and the hit
  position. XP drop creation remains the existing coordinator side effect.

The combat ordering remains `enemy:damaged`, `projectile:hit`, then
`enemy:killed`. Cleanup removal does not emit a combat kill event. Event payload
positions are captured before the Phaser sprite is destroyed.

## Deferred boundaries

This slice does not add spawn-time scaling wiring, movement helpers, charger
windup/dash/cooldown behavior, spawn-director scheduling, contact-damage rules,
visuals or telegraphs, ranged projectiles, elite/boss runtime behavior, loot or
currency resolution, GameScene flow changes, shipped-data tuning, Slice 3, or
work from another epic.
