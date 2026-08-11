# Data-Driven Balancing

## Rule

If a value changes how the game feels, it should probably live in data.

## Why

Data-driven balancing lets AI agents and humans tune the game quickly without changing engine code. It also makes playtest feedback easier to apply because balance changes become small, reviewable diffs.

## Common Tuning Targets

| What you want to change | File |
| --- | --- |
| Weapon feel (damage, fire rate, projectiles, range) | `src/data/weapons.json` |
| Enemy durability / reward (health, damage, speed, XP, scrap) | `src/data/enemies.json` |
| Wave pressure / scaling (timing, caps, difficulty growth) | `src/data/spawn-curves.json` |
| Cards (effects, rarity, stack limits) | `src/data/upgrades.json` |
| Character starting profile / passive data | `src/data/characters.json` |
| Run loot (drop tables and entries) | `src/data/loot-tables.json` |
| Permanent costs / effects | `src/data/meta-upgrades.json` |
| Arena geometry / hazards | `src/data/arenas.json` |

## Units and Direction

- Time fields are explicit milliseconds (`*Ms`) or seconds (`*Second`) — never bare frames or tick counts.
- **Higher is slower** for interval fields: a higher `fireRateMs` or `spawnEveryMs` means a longer wait between actions.
- Stat multipliers are normalized by `ModifierStack` (`add` first, then `mult`), and **higher is always better** on stat keys such as `attackSpeed` (a higher value makes fire cadence faster). Never apply a multiplier directly to a `*Ms` field.

## Safe Tuning Loop

1. Write down one hypothesis ("this weapon is weak in wave 2").
2. Change **one related data family** (one JSON catalog).
3. Run focused validation/full tests: `npx vitest run tests/validateAllData.test.ts` then `npm test`.
4. Compare runs using a **fixed seed** so results are reproducible.
5. Use development cheat URLs only to accelerate observation (faster spawns, XP/scrap multipliers, god-mode refill) — never in production.
6. Inspect F3 (run lines, enemy/projectile/drop counts, `DPS(5s)`) and the terminal console summary at run end.
7. Record the result, then commit the tuning change separately from tooling or architecture work.

## Interpreting Metrics

- **Rolling DPS (`DPS(5s)` in F3)** is effective enemy health removed over the last five **run-time** seconds; the window pauses while the run is paused.
- **Average DPS** in the terminal summary is lifetime effective damage divided by total run time.
- Spawn caps (`maxAlive`) can hide cadence increases — faster spawn intervals still saturate at existing caps.
- Currency/XP cheats make economy outcomes non-comparable to normal runs; do not balance the economy from cheated runs.

## Guardrails

- Keep units explicit in field names, such as `fireRateMs`.
- No hidden multipliers in engine or scene code — tuning lives in data.
- No multi-system tuning bundles; change one family at a time.
- No production flags or production-reachable cheat paths.
- No data change is committed without a green `validateAllData()` / aggregate validation run.
- Prefer additive modifiers first, then introduce multiplicative stacking only where needed.
- Keep early-run numbers small enough to reason about manually.
