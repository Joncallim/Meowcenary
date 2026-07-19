# Epic Architecture Index

This file gives a simple overview of the Meowcenary backlog and defines the
**shared contracts** every epic builds on. GitHub issues are the default source
for each epic's implementation plan; a linked repository architecture document
may explicitly supersede older issue wording, as Epics 5, 6, and 7 do. This file
is the source of truth for the module names, data shapes, and events epics share.

## Documentation Standard

Every epic should use the same structure:

1. **Plain-English Goal** — what the epic is for.
2. **Owns** — what this epic is responsible for.
3. **Does Not Own** — what belongs somewhere else.
4. **Contracts** — the exact modules, types, data files, and events this epic
   adds or consumes. This is the part that makes the epic implementable.
5. **Architecture Rules** — boundaries that keep the code simple.
6. **Implementation Plan** — the order Codex/GPT-5.5 should build in.
7. **Tests and Checks** — how to verify the work.
8. **Done When** — the definition of done.
9. **Codex Handoff** — short instructions for the implementation agent.

Keep documentation practical. Avoid long theory, duplicated design notes, or
vague wording. When an epic needs a type or event that already exists in the
Shared Foundation Contracts below, **reference it by name — do not redefine it.**

## Repository Layout (canonical)

Epics must place code in these paths so ownership stays obvious:

```text
src/
  engine/        Framework-agnostic primitives (no Phaser imports)
    config.ts        RuntimeConfig constants
    sceneKeys.ts     SceneKey values
    eventBus.ts      Typed event emitter + GameEventMap
    rng.ts           Seeded Rng + createRng(seed)
    vector.ts        Vec2 + math helpers
    cadence.ts       Cadence accumulator for fixed-interval ticks
    pool.ts          Generic object Pool<T> (added in Epic 12)
  entities/      Phaser display/physics objects: Player, Enemy, Projectile, Drop
  gameplay/      Pure run rules (no Phaser imports): runState, stats, xp,
                 targeting, weapons, merge, upgrades, spawnDirector, loot, reward,
                 characterSelection, arenaSelection (Epic 7), spawnRegion (Epic 7)
  systems/       Phaser-aware coordinators: input, save, validation, weapons,
                 enemies, arenas (Epic 7), debug, audio, types.ts
  scenes/        BootScene, GameScene (thin coordinators only)
  ui/            hud, cards, inventory, menus, settings
  data/          *.json gameplay definitions
tests/           *.test.ts (Vitest)
```

Rule of thumb: anything under `engine/` and `gameplay/` **must not import
Phaser** so it stays unit-testable. `entities/`, `systems/`, `scenes/`, and
`ui/` may use Phaser.

## Shared Foundation Contracts

These are defined once (mostly in Epic 0 and Epic 1) and reused everywhere.

### Event bus (Epic 0 owns `src/engine/eventBus.ts`)

A tiny typed emitter: `on`, `off`, `emit`. Gameplay systems **emit**; audio, UI,
debug, and polish **subscribe**. Systems never call each other directly for
feedback. The event map is additive — each epic appends its events:

```ts
interface GameEventMap {
  'run:start':        { characterId: string; arenaId: string; seed: number };
  'run:paused':       Record<string, never>;
  'run:resumed':      Record<string, never>;
  'run:won':          { timeMs: number; level: number; kills: number };
  'run:lost':         { timeMs: number; level: number; kills: number };
  'player:damaged':   { amount: number; healthRemaining: number };
  'player:died':      Record<string, never>;
  'enemy:spawned':    { instanceId: number; enemyId: string; x: number; y: number };
  'enemy:damaged':    { instanceId: number; amount: number; x: number; y: number };
  'enemy:killed':     { instanceId: number; enemyId: string; xpValue: number; x: number; y: number };
  'weapon:fired':     { weaponId: string; x: number; y: number };
  'projectile:hit':   { x: number; y: number; damage: number; killed: boolean };
  'xp:gained':        { amount: number; total: number };
  'level:up':         { level: number };
  'card:offered':     { offerId: number; choices: readonly string[] }; // token + upgrade ids
  'card:chosen':      { upgradeId: string };
  'weapon:merged':    { fromId: string; toId: string };
  'drop:collected':   { kind: 'xp' | 'scrap'; amount: number; x: number; y: number };
  'currency:changed': { runTotal: number };
  'hazard:triggered': { hazardId: string; damage: number; x: number; y: number }; // Epic 7; damage applied this tick
}
```

### Seeded RNG (Epic 0 owns `src/engine/rng.ts`)

All randomness (card offers, loot, spawn jitter, crits) flows through
deterministic run-scoped streams derived from the run seed so runs are
reproducible and rules are testable. A stream is created once per owner and is
not recreated per decision.

```ts
interface Rng {
  next(): number;                              // [0, 1)
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T;
}
function createRng(seed: number): Rng;         // deterministic (mulberry32)
function deriveRunSeed(seed: number, stream: string): number; // stable named stream
```

Never call `Math.random()` in gameplay code. The run seed lives in `RunState`.
`GameContext.menuRng` is boot/menu-scoped only; combat, loot, spawns, and cards
must create/use run-scoped RNGs from `RunState.seed`. Named streams are derived
by the shared helper rather than scene-local constants so one subsystem's RNG
consumption cannot silently perturb another's sequence.

### Stats and modifiers (primitive owned by Epic 1 `src/gameplay/stats.ts`)

One shared way to combine base stats with additive/multiplicative modifiers.
Epic 3 (upgrades), Epic 5 (permanent upgrades), and Epic 6 (character passives)
all *produce* `Modifier`s; weapons, player, and loot *read* resolved values.
Nobody invents their own multiplier bag.

```ts
type StatKey =
  | 'moveSpeed' | 'maxHealth' | 'armor'
  | 'damage' | 'attackSpeed' | 'projectileSpeed' | 'projectileCount' | 'range'
  | 'critChance' | 'pickupRadius' | 'xpGain' | 'currencyGain';

interface Modifier { stat: StatKey; op: 'add' | 'mult'; value: number; sourceId: string; }

interface ModifierStack {
  add(mod: Modifier): void;
  remove(sourceId: string): void;
  countBySource(sourceId: string): number;     // diagnostics/removal grouping, not stack authority
  resolve(stat: StatKey, base: number): number; // all 'add' first, then all 'mult'
}
```

Convention: **higher is always better.** Fire cadence is modelled as
`attackSpeed` (default 1), and effective interval is `baseFireRateMs / attackSpeed`
— never apply a modifier directly to a `*Ms` field.

`RunState.upgradeStacks` is the authority for upgrade stack limits. A single
card can add multiple modifiers, so modifier count must never be interpreted as
the number of times that card was selected.

### Run state (Epic 1 owns `src/gameplay/runState.ts`)

The single mutable object describing the current run. Every gameplay system
reads and writes it through helper functions, not by reaching into the scene.

```ts
type RunStatus = 'intro' | 'active' | 'paused' | 'won' | 'lost';
type PauseReason = 'manual' | 'levelUp';
type RunOutcome = 'won' | 'lost';

interface RunState {
  status: RunStatus;
  seed: number;
  characterId: string;
  arenaId: string;
  timeMs: number;
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  currency: number;                 // scrap collected this run (not yet banked)
  stats: ModifierStack;             // player/global stats
  equipped: WeaponInstance[];       // Epic 2 populates and types
  upgradeStacks: Record<string, number>; // Epic 3 populates
  pauseReason: PauseReason | null;
  outcome?: RunOutcome;
}
```

When `RunState.status !== 'active'`, gameplay simulation must not advance:
run timer, spawn cadence, weapon cadence, projectile movement, pickup side
effects, and damage callbacks all pause.

### Weapon runtime state (Epic 2 owns `src/gameplay/weapons.ts`)

Weapon data is static; weapon instances are runtime state. Keep them separate.

```ts
interface WeaponInstance {
  instanceId: string;
  defId: string;
  family: string;
  tier: number;
}
```

Rules:

- `WeaponInstance` must stay Phaser-free and serializable.
- `RunState.equipped` stores weapon instances.
- `WeaponSystem` owns runtime machinery such as `Cadence`, Phaser groups, and
  projectile objects; those do not belong in `RunState`.
- Merge helpers live in `src/gameplay/merge.ts` and stay pure.
- Weapon data lives in `src/data/weapons.json` and is validated at load time.

### Upgrade selection state (Epic 3 owns `src/gameplay/upgrades.ts`)

Upgrade effects are data, but their runtime source identity is assigned when a
card is chosen:

```ts
interface UpgradeEffect {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
}

interface UpgradeDefinition {
  id: string;
  name: string;
  rarity: Rarity;
  target: 'player' | 'weapon' | 'economy' | 'run';
  description: string;
  maxStacks: number;
  effects: UpgradeEffect[];
}
```

Rules:

- JSON effects omit `sourceId`; `applyCard` assigns a stable per-stack source.
- The source is `card:<upgradeId>:<one-based stack>`; Epic 5 owns the shared
  namespace contract with permanent and character modifiers.
- `RunState.upgradeStacks[id]` is the only stack-limit authority.
- `maxStacks` is a positive integer.
- `applyCard` preflights every effect and applies a card transactionally; a
  `false` result leaves both stack history and modifiers unchanged.
- Epic 3 modifiers are run-global. Per-weapon targeting is deferred until a
  typed weapon-modifier store exists; player copy must describe the real scope.
- `target` is classification/presentation metadata in Epic 3, not an
  instruction to select a weapon instance.
- Multi-level gains queue one choice per emitted `level:up`. The run resumes
  only after every queued choice is resolved.
- One coordination group per `RunState` owns the upgrade subscription, FIFO,
  offer, run-scoped RNG, and pause lease; duplicate `UpgradeSystem` facades join
  it without duplicating state or draws.
- `card:offered` publishes a monotonically increasing per-run `offerId` with
  eligible IDs. Commands require both token and ID, so an old UI command cannot
  select the same ID from a later offer.
- Offered-listener commands are deferred until every listener can read the
  matching snapshot. `card:chosen` is emitted only after a valid current-token
  choice has been applied and its pending level retired.
- If no eligible cards remain, the queue advances without deadlocking the run.

### Save data (Epic 0 storage seam, Epic 5 current schema)

```ts
interface SaveDataV1 {
  version: 1;
  settings: Settings;
  meta: Readonly<Record<string, never>>;
}
interface MetaState {
  scrap: number;
  unlocks: readonly string[];
  permanentUpgrades: Readonly<Record<string, number>>;
}
interface SaveDataV2 { version: 2; settings: Settings; meta: MetaState; }
type SaveData = SaveDataV2;
interface Settings { muted: boolean; musicVolume: number; sfxVolume: number; reducedMotion: boolean; }
```

`SaveManager` takes a `StorageAdapter` (LocalStorage in the browser, in-memory
in tests). Epic 5 adds the linear `SaveDataV1` to `SaveDataV2` migration and
keeps V1's empty meta meaning unchanged. Unknown future versions fail closed to
a default current save. `GameContext` owns the current loaded snapshot and is
the only runtime persistence boundary. See
[`architecture/epic-5-meta-progression.md`](architecture/epic-5-meta-progression.md)
for exact recovery and mutation contracts.

### Time source

Systems in `gameplay/` receive elapsed milliseconds (`dtMs`) as an argument to
their `update(dtMs, ...)` methods. They must not read Phaser's clock directly,
so schedules (fire cadence, spawn timing) stay deterministic in tests.

## Epic Order

| Epic | Issue | Status | Purpose |
| --- | --- | --- | --- |
| Epic 0 | #1 Project Foundation | Complete | Config, event bus, RNG, data validation, save/settings, input, debug, audio shell, tests, CI. |
| Epic 1 | #2 Core Gameplay Loop | Complete | First playable loop: move, auto-shoot, survive, level up, win or lose; owns RunState + stats primitive. |
| Epic 2 | #3 Weapons and Merge System | Complete | Automatic weapons, projectiles, inventory state, pure merge rules. |
| Epic 3 | #4 Upgrade Cards | Complete | Readable run-only level-up choices that emit real `Modifier`s. |
| Epic 4 | #5 Enemy AI and Spawn Director | Complete | Simple enemy behaviours and data-driven wave pressure. |
| Epic 5 | #6 Meta Progression | Complete | Earned permanent progress: banks RunState rewards, no ads/payments/timers. |
| Epic 6 | #7 Characters | Complete | Selectable characters with starting stats, loadouts, passives, unlock hooks. |
| Epic 7 | #8 Maps and Arenas | In Progress | Data-defined arenas, spawn regions, obstacles, hazard hooks. |
| Epic 8 | #9 Loot and Economy | Open | In-run XP/scrap drops, loot tables, pickup behaviour. |
| Epic 9 | #10 UI and UX | Open | Readable, controllable on phone and desktop. |
| Epic 10 | #11 Audio | Open | Respectful, muteable, event-driven sound and music. |
| Epic 11 | #12 Balancing and Developer Tooling | Open | Fast tuning through data, validation, debug tools, playtest helpers. |
| Epic 12 | #13 Polish and Performance | Open | Feedback, animation polish, object pooling, reduced motion, performance checks. |

## Cross-Epic Rules

- Keep code modular, easy to read, and as simple as possible.
- `engine/` and `gameplay/` must not import Phaser; keep them pure and tested.
- Keep Phaser scenes thin; scenes wire systems together and forward `update`.
- Keep gameplay tuning in `src/data/*.json`; no hidden multipliers in scenes.
- Feedback flows through the event bus, not direct system-to-system calls.
- All randomness flows through the seeded `Rng`; never call `Math.random()`.
- All stat changes flow through `ModifierStack`; never hand-roll multipliers.
- No ads, paid power, subscriptions, energy systems, or manipulative pacing.
- Implement each epic in small PRs rather than one large rewrite.

### Reward-calculation boundary (Epic 8 vs Epic 5)

To avoid duplicated logic: **Epic 8** owns *in-run* collection — drops add to
`RunState.currency` and `RunState.xp` while the run is live. **Epic 5** can ship
first and owns *end-of-run banking* of the current currency, including zero.
One `ProgressionSystem` funnels both `run:won` and `run:lost` into one guarded
banking method; scenes do not implement reward or persistence rules. Epic 8
later changes only how currency is generated and never writes `MetaState`.

## Suggested Build Sequence

1. Epic 0 is complete (event bus, RNG, save, validation, CI).
2. Epic 1 is complete (playable loop, RunState, stats primitive).
3. Epics 2, 3, and 4 are complete.
4. Implement Epic 5 from its seven architecture slices; it does not wait for
   Epic 8.
5. Epic 6 is complete (character selection, the pre-run `RunRequest` boundary,
   and the reactive-passive seam).
6. Add Epic 7 against Epic 6's `RunRequest`/`GameContext` selection seams, then
   Epics 8, 9, and 10 as their dependencies become available.
7. Use Epic 11 throughout tuning.
8. Save Epic 12 for late-stage polish and performance.
