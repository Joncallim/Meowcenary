# Epic 5: Meta Progression Architecture

Epic 5 introduces persistent, earned-only progression without coupling the
persistent model to Phaser or to Epic 8's future loot implementation.

## Architectural goals

- A run can finish and bank its current `RunState.currency` before Epic 8 exists.
- Epic 8 later changes only how currency is earned during a run; it does not
  change the banking contract.
- Save schema changes are explicit and migratable.
- Permanent, character, and run-card modifiers have deterministic ordering and
  source identities.
- Pure progression rules can be tested without scenes, storage, or Phaser.

## Save schema and migration

Do not mutate the meaning of `SaveDataV1`. Introduce `SaveDataV2`:

```ts
interface MetaState {
  scrap: number;
  unlocks: string[];
  permanentUpgrades: Record<string, number>;
}

interface SaveDataV2 {
  version: 2;
  settings: Settings;
  meta: MetaState;
}

type SaveData = SaveDataV2;
```

`migrate(raw)` accepts unknown input and returns the current `SaveData`.
Migration is a linear pipeline:

1. Parse and structurally recover the raw value.
2. Convert a valid or partially valid V1 payload to V2.
3. Sanitize V2 fields, preserving valid values and replacing invalid fields
   with defaults.
4. Unknown future versions fail closed to a default current save; they must not
   be interpreted as V2.

Keep a fixture for each supported historic version. `createDefaultMeta()` is the
single source of truth used by new saves, migration recovery, and reset.

## Runtime ownership

`GameContext` owns the loaded current save snapshot in addition to `SaveManager`:

```ts
interface GameContext {
  // existing fields...
  saveData: SaveData;
  updateMeta(transform: (meta: MetaState) => MetaState): MetaState;
  resetProgression(): MetaState;
}
```

`updateMeta` applies a pure transform, replaces `saveData.meta`, persists the
whole save through `SaveManager`, and returns the new meta. Scenes may coordinate
these calls, but cannot contain reward, purchase, cost, or unlock calculations.

## End-of-run reward boundary

Epic 5 owns conversion and persistence:

```ts
interface RunReward {
  scrap: number;
  unlocks: string[];
}

function computeRunReward(run: Readonly<RunState>): RunReward;
function bankReward(meta: Readonly<MetaState>, reward: Readonly<RunReward>): MetaState;
```

`computeRunReward` reads the finished run's existing `currency` and achievement
facts. It does not inspect drops, enemies, scenes, storage, or loot tables.
Epic 8 later fills `RunState.currency` during active play and therefore plugs
into this boundary without changing it.

Banking is coordinated once by a dedicated runtime adapter (for example,
`ProgressionSystem`), not by independent `run:won` and `run:lost` listeners.
The adapter tracks whether it has handled the current in-memory run and ignores
repeated terminal notifications. `bankReward` remains a pure value transform;
scene lifecycle idempotency is an adapter responsibility.

A zero-currency run is valid and banks zero scrap. This allows Epic 5 to ship
before Epic 8.

## Permanent upgrade definitions

```ts
interface MetaUpgradeDefinition {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  cost: { base: number; growth: number };
  effects: Modifier[];
}
```

Validation requires unique IDs, positive integer `maxLevel`, finite non-negative
cost values, `growth >= 1`, known stat keys, finite modifier values, and unique
`sourceId` values after runtime expansion.

## Level scaling semantics

A definition's effect is the per-level effect. Expand it into one runtime
modifier per owned level instead of multiplying the raw value:

```ts
function permanentModifiers(
  def: MetaUpgradeDefinition,
  ownedLevel: number,
): Modifier[];
```

For level `n`, emit `n` modifiers with deterministic source IDs such as
`meta:<upgradeId>:1` through `meta:<upgradeId>:n`.

This preserves the existing `ModifierStack` semantics:

- additive effects add once per level;
- multiplicative effects multiply once per level;
- no special-case arithmetic is hidden in progression code.

## Run-start modifier order

Run construction is a pipeline, not a set of loosely ordered event listeners:

1. Create an empty `RunState` and base player/weapon state.
2. Apply permanent upgrade modifiers.
3. Apply the selected character's base stats and passive modifiers (Epic 6).
4. Equip character starting weapons (Epic 6 / Epic 2 boundary).
5. Start the run.
6. Apply run-card modifiers only when chosen (Epic 3).

Use source namespaces to avoid collisions:

- `meta:<upgradeId>:<level>`
- `character:<characterId>:<passiveId>`
- `card:<upgradeId>:<stack>`

The order above must be documented and covered by an integration test because
Epics 6 and 9 depend on it.

## Pure rules

`src/gameplay/meta.ts` owns:

```ts
function costOf(def: MetaUpgradeDefinition, currentLevel: number): number;
function canPurchase(meta: Readonly<MetaState>, def: MetaUpgradeDefinition): boolean;
function purchase(meta: Readonly<MetaState>, def: MetaUpgradeDefinition): MetaState;
function isUnlocked(meta: Readonly<MetaState>, id: string): boolean;
function computeRunReward(run: Readonly<RunState>): RunReward;
function bankReward(meta: Readonly<MetaState>, reward: Readonly<RunReward>): MetaState;
function permanentModifiers(def: MetaUpgradeDefinition, ownedLevel: number): Modifier[];
```

Invalid purchase attempts should return the original value or a typed result;
do not use exceptions for expected UI decisions. Choose one contract and use it
consistently. Inputs are never mutated.

## Progression runtime adapter

A small non-Phaser system coordinates lifecycle integration:

```ts
class ProgressionSystem implements System {
  applyOwnedProgression(run: RunState, meta: Readonly<MetaState>): void;
  bankFinishedRun(run: Readonly<RunState>): RunReward | null;
  update(): void;
  destroy(): void;
}
```

It may subscribe to the event bus or be called explicitly by `GameScene`, but
there must be one terminal banking path. It delegates all calculations to pure
functions and all persistence to `GameContext.updateMeta`.

## UI boundary

Epic 5 may expose a minimal progression model/controller for testing purchases
and reset. It must not build the final menu. Epic 9 owns rendering, navigation,
confirmation dialogs, accessibility, and responsive layout.

## Required tests

- V1-to-V2 migration and corrupt-field recovery.
- Unknown future version recovery.
- Cost rounding and max-level boundaries.
- Pure purchase behavior and no input mutation.
- Additive and multiplicative per-level expansion.
- Permanent → character → card modifier ordering.
- Reward calculation from a finished run with zero and non-zero currency.
- Duplicate terminal notification banks only once in one runtime.
- Reset uses the same default meta factory as new saves.

## Deferred work

- Epic 6 supplies characters and character passives.
- Epic 8 supplies in-run scrap/drop generation.
- Epic 9 supplies the production progression UI.
- Cloud sync, accounts, ads, paid currency, timers, and daily pressure remain out
  of scope.
