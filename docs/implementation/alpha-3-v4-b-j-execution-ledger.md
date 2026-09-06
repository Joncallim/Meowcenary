# Alpha 3 V4 B–J Execution Ledger

**Campaign branch:** `modelark/alpha3-v4-finish`
**Frozen base SHA:** `5efe56922dd7a9da9d1f073eca8ae4a251e67d37`

---

## Slice B — Universal Enemy Damage/Death Fact

### Architecture decisions

- Created `src/gameplay/enemyDamageResolver.ts` as the single narrow boundary
  for post-damage lethal settlement.
- `applyEnemyDamage()` delegates to `Enemy.takeDamage()` for health/shield/
  death-state logic, then on the one alive→dead transition increments
  `runState.kills` and emits exactly one canonical `enemy:killed` event.
- `abilities.ts` stays Phaser-free by receiving a `damageEnemy(target, amount)`
  runtime seam instead of exposing `takeDamage` directly on the enemy interface.
- `WeaponSystem.applyProjectileDamage()` now routes through `applyEnemyDamage()`
  and emits `projectile:hit` with the `killed` boolean from the resolver result.
- Burn ticks go through `applyProjectileDamage()` → `applyEnemyDamage()`.
- Explosive splash goes through `applyProjectileDamage()` → `applyEnemyDamage()`.
- All remaining direct `enemy.takeDamage()` calls are eliminated from non-Enemy
  source code (only `Player.takeDamage()` remains in SpawnSystem, which is
  correct).

### Files/domains changed

- `src/gameplay/enemyDamageResolver.ts` — NEW: universal lethal settlement
- `src/gameplay/abilities.ts` — Updated `AbilityRuntime` to use `damageEnemy`
  seam instead of exposing `takeDamage`; updated `applyAreaEffect` to use it
- `src/scenes/GameScene.ts` — Import `applyEnemyDamage`, wire `damageEnemy`
  callback in `activateCharacterAbility()`
- `src/systems/WeaponSystem.ts` — Replace direct `enemy.takeDamage()` with
  `applyEnemyDamage()`, remove duplicate kill counting and `enemy:killed` emit
- `tests/enemyDamageResolver.test.ts` — NEW: 15 tests covering lethal,
  non-lethal, overkill, post-death, shield, invalid input, exact-once,
  multiple enemies, abilities seam
- `tests/weaponSystem.test.ts` — Updated call order assertion
  (damaged < killed < hit instead of damaged < hit < killed)
- `tests/gameSceneAbilities.test.ts` — Mock `getGameContext` for the new
  `ctx.bus` dependency; updated heat-vent `takeDamage` assertion

### RED tests added

15 tests in `tests/enemyDamageResolver.test.ts`:
- projectile lethal
- splash lethal (via applyProjectileDamage → applyEnemyDamage)
- burn lethal (via applyProjectileDamage → applyEnemyDamage)
- overkill
- repeated damage after death
- shield block
- non-lethal
- non-finite damage
- zero damage
- already-dead enemy
- exact-once per alive→dead transition
- multiple independent enemies
- abilities damageEnemy seam
- killed event position/lootTableId

### Automated results

- `npx vitest run` (130 test files, 2204 tests): **ALL PASS**
- `npx tsc --noEmit`: **PASS**
- `npx vite build`: **PASS**

### Hostile-review findings

1. WeaponSystem test call order changed (damaged < killed < hit).
   - FIXED: Updated assertion to match new execution order.
2. GameScene abilities test needed mock GameContext for `getContext()`.
   - FIXED: Mocked `getGameContext` via `vi.mock()`.
3. Resolver `applied` semantics: shield block returns `applied: true`
   (hit connected with live target, shield just blocked health loss).
   - Confirmed: matches real `Enemy.takeDamage()` return value semantics.
4. No remaining direct `enemy.takeDamage()` calls outside Enemy class and
   the resolver.
   - VERIFIED: Only Player.takeDamage calls remain in SpawnSystem.

### Relevant issues updated

- #86: Universal enemy damage/death fact implemented.

### Known non-blocking debt

None.

---

## Slice C — Save V4 + Progression Truth

*Pending*

## Slice D — Template-clean Loadout/Equipment/Gunsmith

*Pending*

## Slice E — Logical Art/Resource Architecture

*Pending*

## Slice F — Contract-first Scalable UI

*Pending*

## Slice G — Product/Content Rebalance

*Pending*

## Slice H — Monster Compendium

*Pending*

## Slice I — Art Production Pass

*Pending*

## Slice J — Consolidated Acceptance Candidate

*Pending*
