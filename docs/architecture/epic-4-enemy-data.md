# Epic 4 Slice 1: Enemy Data and Spawn Curves

This note is the repository-owned contract for Epic 4's data foundation. Slice
1 defines data admission, immutable lookup, elite stat composition, and pure
spawn-time scaling only. The GitHub epic remains the source for later runtime
work.

## Enemy catalog

`EnemyDefinition` is a discriminated union over `chaser`, `charger`, `ranged`,
`tank`, `elite`, and `boss`. Every object rejects unknown fields.

- Chaser and tank contain `id`, `name`, `archetype`, `health`, `damage`,
  `speed`, `xpValue`, `scrapValue`, and `contactDamage: true`.
- Charger contains the same fields plus `attack.triggerRange`,
  `attack.telegraphMs`, `attack.dashSpeed`, `attack.dashDurationMs`, and
  `attack.cooldownMs`.
- Ranged contains all direct stats, `contactDamage: false`, and
  `attack.range`, `attack.telegraphMs`, and `attack.cooldownMs`.
- Boss contains all direct stats and `contactDamage: false`; it has no attack
  object in this slice.
- Elite contains only `id`, `name`, `archetype: 'elite'`, and `baseEnemyId`.
  Its base must be a direct chaser, charger, or tank; elite chains and
  ranged/boss bases are invalid.

IDs and names are nonempty and trimmed, and IDs are unique. Direct health is a
finite number above zero. Direct damage and speed are finite and nonnegative.
XP and scrap are nonnegative safe integers, except directly spawnable enemies
require positive XP, damage, and speed. Charger attack numbers are positive;
millisecond fields are positive safe integers and dash speed exceeds base
speed. Ranged range is positive and its timing fields are positive safe
integers. JSON data must use enumerable, string-keyed data properties; accessors,
non-enumerable fields, symbol keys, inherited values, and custom array properties
are rejected recursively before canonical cloning.

The single direct-spawnability authority is
`SPAWNABLE_ENEMY_ARCHETYPES`: chaser, charger, and tank. Spawn curves, elite
bases, the registry, and legacy spawn runtime all use its type guard. Ranged,
elite, and boss definitions are shells and cannot appear in normal curves.

## Registry and elite resolution

`DataEnemyRegistry` validates a complete enemy catalog before cloning or
populating lookup maps. It deep-clones and recursively freezes canonical
definitions and its catalog snapshot, so later caller mutations cannot alter
the registry.

Elite resolution preserves `archetype: 'elite'`, records the base archetype,
and inherits contact behavior and attack configuration. It applies these fixed
multipliers without changing the base: health `2`, damage `1.5`, speed `1.1`,
XP `2`, and scrap `2`.
Registry construction rejects an elite if any multiplied combat stat is not
finite and positive, if multiplied XP is not a positive safe integer, or if
multiplied scrap is not a nonnegative safe integer.

## Spawn curves

A curve has a unique trimmed ID, an integer duration from 1 through 3600
seconds, health and damage scaling rates from 0 through 1, and at least one
wave. A wave has a nonnegative safe-integer start, a direct-spawnable enemy ID,
a positive safe-integer cadence, and a `maxAlive` cap from 1 through 256.

The first wave starts at zero. Starts are nondecreasing and below the curve
duration. Equal starts are allowed for different enemies and retain JSON order
as their tie order. Each enemy ID may have only one layer per curve. Layers are
persistent from their start through the curve end, so different enemy layers
may overlap. The first cadence-due spawn must occur strictly before the curve
ends. The sum of layer caps cannot exceed 256.

## Spawn-time scaling

Elite multipliers are resolved before `scaleEnemy` is called. Scaling then uses
the scheduled spawn time without rounding:

```text
minutes = max(0, scheduledAtMs) / 60000
maxHealth = baseHealth * (1 + healthPerMinute * minutes)
damage = baseDamage * (1 + damagePerMinute * minutes)
```

Negative scheduled time intentionally clamps to zero. Fractional milliseconds
are accepted. Non-finite inputs/results and rates outside 0 through 1 throw.
Speed, XP, and scrap remain unchanged.

## Deferred runtime boundaries

This slice does not implement or wire Phaser enemy behavior, GameScene changes,
movement, charger state, telegraphs or visuals, contact damage, ranged
projectiles, spawn-director runtime, loot/currency resolution, boss behavior,
or any later Epic 4 or other-epic work. Legacy runtime seams accept only direct
or directly spawnable definitions until later slices explicitly consume
registry-resolved shells.
