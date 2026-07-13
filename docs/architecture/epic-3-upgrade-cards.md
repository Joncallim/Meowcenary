# Epic 3 Architecture: Upgrade Cards

## Decision

Epic 3 adds a pure upgrade rule module and a small runtime coordinator. It does
not put card rules in `GameScene`, and it does not wait for Epic 9's polished UI
before making level-up choices playable.

The implementation boundary is:

```text
validated upgrades.json
        |
        v
gameplay/upgrades.ts  <-- pure offer/apply rules, injected RNG
        |
        v
systems/UpgradeSystem.ts  <-- pending levels, current offer, pause/resume
        |
        +--> card:offered / card:chosen events
        |
        v
GameScene minimal chooser  <-- displays choices and sends chooseCard(id)
```

Epic 9 can replace the minimal chooser without changing offer or application
rules.

## Baseline Already Available

- `RunState.stats` is a guarded `ModifierStack`.
- `RunState.upgradeStacks` exists and starts empty.
- `level:up`, `card:offered`, and `card:chosen` are typed events.
- `PauseReason` distinguishes manual and level-up pauses.
- Game randomness is created from `RunState.seed`; `menuRng` is never used.
- Weapon, player, and XP consumers already resolve global modifiers.
- `PendingLevelUps` preserves every level when one XP gain crosses several
  thresholds. Epic 3's coordinator should own and reuse this queue.

## Data Contract

`UpgradeDefinition.effects` uses a JSON-safe effect shape without `sourceId`:

```ts
interface UpgradeEffect {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
}
```

Validation must reject:

- empty effects;
- unknown stat keys or operations;
- non-finite numeric values;
- non-positive or non-integer `maxStacks`;
- duplicate upgrade IDs.

Player-facing descriptions must match actual scope. Epic 3 applies global run
modifiers, so a card cannot claim to modify only one equipped weapon. Targeted
weapon-instance modifiers require a future typed store and are out of scope.
`target` remains classification/presentation metadata in Epic 3; it must not
select a weapon instance or change the run-global application path.

`currencyGain` is valid data but has no visible consumer until Epic 8 adds scrap
drops. The initial offer pool should prioritize effects consumed by the current
runtime (`moveSpeed`, `maxHealth`, `damage`, `attackSpeed`, `projectileSpeed`,
`projectileCount`, `range`, `pickupRadius`, and `xpGain`).

## Pure Rules

`src/gameplay/upgrades.ts` owns:

```ts
function offerCards(
  definitions: readonly UpgradeDefinition[],
  stacks: Readonly<Record<string, number>>,
  rng: Rng,
  count?: number,
): UpgradeDefinition[];

function applyCard(run: RunState, definition: UpgradeDefinition): boolean;
```

`offerCards` filters maxed definitions and draws distinct entries without
replacement using rarity weights. It returns fewer than `count` only when the
eligible pool is smaller. It never mutates definitions or stack state.

The rarity-weight table is complete and fixed for Epic 3: `common: 100`,
`uncommon: 60`, `rare: 30`, `epic: 10`, and `legendary: 3`. Every supported
rarity therefore maps to a positive finite weight. `offerCards` must reject an
invalid or non-finite total before calling the injected RNG; it must never pass
zero, invalid, or overflowed totals to `Rng.weighted`.

`applyCard` validates the stack limit again, derives the next one-based stack
number, and assigns each effect a stable source:

```text
upgrade:<definition id>:stack:<one-based stack number>
```

The boolean result reports whether application occurred. Stack limits come
only from `upgradeStacks`; modifier count is not equivalent because one card
can contain several effects.

Application is transactional. `applyCard` preflights the stack limit and every
effect before mutating either `upgradeStacks` or `ModifierStack`. A maxed or
invalid definition returns `false` without mutation. Only after the complete
preflight succeeds may it add every effect and commit the one stack increment,
so a later effect cannot leave a partial card applied.

## Runtime Flow

`UpgradeSystem` owns pending level-ups and the current offer:

1. `level:up` enqueues the emitted level.
2. If no offer is active, pause with reason `levelUp` and generate one offer.
3. Emit `card:offered` with eligible IDs.
4. The minimal chooser calls `chooseCard(upgradeId)`.
5. Reject IDs not present in the current offer without changing state.
6. Apply the valid card, then emit `card:chosen`.
7. If another level is queued, generate its offer while remaining paused.
8. Resume only when the queue is empty.

If no cards are eligible, consume that pending level and continue the queue. A
depleted pool must never leave the run permanently paused.

The coordinator owns event subscriptions and exposes an idempotent `destroy()`
that unsubscribes and clears pending/current state. `GameScene` must invoke it
from both Phaser `SHUTDOWN` (stop/restart) and `DESTROY` (direct scene removal)
lifecycle paths so neither path can retain listeners or pending offers.

## Randomness

Card generation receives a dedicated run-scoped RNG created once for the named
upgrade stream. Its seed is derived deterministically from `RunState.seed` by a
documented and tested engine helper. Do not create a new RNG for every offer,
reuse the spawn stream, or use `GameContext.menuRng`. The named stream keeps the
offer sequence independent from spawn RNG consumption; do not hide derivation
behind an undocumented XOR constant in scene code.

## Minimal UI Boundary

Epic 3 owns a functional text/card chooser sufficient for playtesting. It may
use Phaser text and keyboard/pointer input, but it only:

- renders the definitions in the current offer;
- sends the selected ID to `UpgradeSystem.chooseCard`;
- reflects invalid/no-op commands without mutating gameplay state.

Responsive layout, final visuals, inventory integration, and accessibility
polish remain Epic 9.

## Implementation Slices

1. Data/type/validation changes plus shipped upgrade effects.
2. Pure `offerCards` and `applyCard` with deterministic tests.
3. `UpgradeSystem` queue, commands, lifecycle, and event-order tests.
4. Replace the placeholder overlay with the minimal chooser.
5. Browser smoke for single-level, multi-level, manual-pause isolation, and
   scene restart.

Each slice must keep lint, tests, and production build green.

## Acceptance Gate

- The same run/upgrade seed and state produce the same offer sequence.
- Choices are distinct and maxed upgrades are excluded.
- Invalid or stale choices do nothing and keep the current offer active.
- One valid choice produces one stack increment and the declared modifiers.
- A failed multi-effect application leaves stacks and modifiers unchanged.
- Multi-level XP produces one resolved choice per level in FIFO order.
- No eligible cards cannot deadlock the run.
- Manual pause cannot resolve or resume a level-up pause.
- Scene restart and direct destruction leave no upgrade listeners or pending
  selections behind; repeated cleanup is harmless.
- Spawn-stream consumption does not change the named upgrade offer sequence.
- At least one shipped card visibly changes movement or combat in a browser
  playtest.
