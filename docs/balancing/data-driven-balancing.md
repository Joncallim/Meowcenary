# Data-Driven Balancing

## Rule

If a value changes how the game feels, it should probably live in data.

## Data Categories

- Weapon stats.
- Enemy stats.
- Upgrade effects.
- Spawn curves.
- Meta progression costs.
- Loot tables.
- Character stats.

## Why

Data-driven balancing lets AI agents and humans tune the game quickly without changing engine code. It also makes playtest feedback easier to apply because balance changes become small, reviewable diffs.

## Guardrails

- Keep units explicit in field names, such as `fireRateMs`.
- Avoid hidden multipliers in scene code.
- Prefer additive modifiers first, then introduce multiplicative stacking only where needed.
- Keep early-run numbers small enough to reason about manually.
