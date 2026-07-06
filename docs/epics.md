# Epic Architecture Index

This file gives a simple overview of the Meowcenary backlog and defines the
**shared contracts** every epic builds on. The GitHub issues are the source of
truth for each epic's implementation plan; this file is the source of truth for
the module names, data shapes, and events they share.

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
                 targeting, merge, upgrades, spawnDirector, loot, reward
  systems/       Phaser-aware coordinators: input, save, validation, weapons,
                 enemies, debug, audio, types.ts
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
  'enemy:killed':     { instanceId: number; enemyId: string; x: number; y: number };
  'weapon:fired':     { weaponId: string; x: number; y: number };
  'projectile:hit':   { x: number; y: number; damage: number; killed: boolean };
  'xp:gained':        { amount: number; total: number };
  'level:up':         { level: number };
  'card:offered':     { choices: string[] };      // upgrade ids
  'card:chosen':      { upgradeId: string };
  'weapon:merged':    { fromId: string; toId: string };
  'drop:collected':   { kind: 'xp' | 'scrap'; amount: number; x: number; y: number };
  'currency:changed': { runTotal: number };
}
```

### Seeded RNG (Epic 0 owns `src/engine/rng.ts`)

All randomness (card offers, loot, spawn jitter, crits) flows through one
seeded generator so runs are reproducible and rules are testable.

```ts
interface Rng {
  next(): number;                              // [0, 1)
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T;
}
function createRng(seed: number): Rng;         // deterministic (mulberry32)
```

Never call `Math.random()` in gameplay code. The run seed lives in `RunState`.

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
  countBySource(sourceId: string): number;     // for stack limits
  resolve(stat: StatKey, base: number): number; // all 'add' first, then all 'mult'
}
```

Convention: **higher is always better.** Fire rate is modelled as `attackSpeed`
(default 1), and effective interval is `baseFireRateMs / attackSpeed` — never
apply a modifier directly to a `*Ms` field.

### Run state (Epic 1 owns `src/gameplay/runState.ts`)

The single mutable object describing the current run. Every gameplay system
reads and writes it through helper functions, not by reaching into the scene.

```ts
type RunStatus = 'intro' | 'active' | 'paused' | 'won' | 'lost';

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
  equipped: WeaponInstance[];       // Epic 2 populates
  upgradeStacks: Record<string, number>; // Epic 3 populates
}
```

### Save data (Epic 0 owns `src/systems/save.ts`)

```ts
interface SaveDataV1 { version: 1; settings: Settings; meta: MetaState; }
interface Settings { muted: boolean; musicVolume: number; sfxVolume: number; reducedMotion: boolean; }
// MetaState starts empty ({}-shaped) in Epic 0 and is extended by Epic 5.
```

`SaveManager` takes a `StorageAdapter` (LocalStorage in the browser, in-memory
in tests) and runs `migrate(raw: unknown): SaveDataV1`, which repairs or resets
corrupt data. Every content epic that persists data bumps `version` and adds a
migration step — it never mutates the shape in place.

### Time source

Systems in `gameplay/` receive elapsed milliseconds (`dtMs`) as an argument to
their `update(dtMs, ...)` methods. They must not read Phaser's clock directly,
so schedules (fire cadence, spawn timing) stay deterministic in tests.

## Epic Order

| Epic | Issue | Purpose |
| --- | --- | --- |
| Epic 0 | #1 Project Foundation | Config, event bus, RNG, data validation, save/settings, input, debug, audio shell, tests, CI. |
| Epic 1 | #2 Core Gameplay Loop | First playable loop: move, auto-shoot, survive, level up, win or lose; owns RunState + stats primitive. |
| Epic 2 | #3 Weapons and Merge System | Automatic weapons, projectiles, inventory state, pure merge rules. |
| Epic 3 | #4 Upgrade Cards | Readable run-only level-up choices that emit real `Modifier`s. |
| Epic 4 | #5 Enemy AI and Spawn Director | Simple enemy behaviours and data-driven wave pressure. |
| Epic 5 | #6 Meta Progression | Earned permanent progress: banks RunState rewards, no ads/payments/timers. |
| Epic 6 | #7 Characters | Selectable characters with starting stats, loadouts, passives, unlock hooks. |
| Epic 7 | #8 Maps and Arenas | Data-defined arenas, spawn regions, obstacles, hazard hooks. |
| Epic 8 | #9 Loot and Economy | In-run XP/scrap drops, loot tables, pickup behaviour. |
| Epic 9 | #10 UI and UX | Readable, controllable on phone and desktop. |
| Epic 10 | #11 Audio | Respectful, muteable, event-driven sound and music. |
| Epic 11 | #12 Balancing and Developer Tooling | Fast tuning through data, validation, debug tools, playtest helpers. |
| Epic 12 | #13 Polish and Performance | Feedback, animation polish, object pooling, reduced motion, performance checks. |

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
`RunState.currency` and `RunState.xp` while the run is live. **Epic 5** owns
*end-of-run banking* — `computeRunReward(runState)` converts the finished
`RunState` into persistent `MetaState` changes exactly once, at `run:won` /
`run:lost`. Neither epic reimplements the other's half.

## Suggested Build Sequence

1. Finish Epic 0 first (event bus, RNG, save, validation, CI are prerequisites).
2. Build Epic 1 until the game is playable (RunState + stats primitive land here).
3. Add Epic 2 and Epic 3 for weapon/upgrade depth.
4. Add Epic 4 and Epic 8 to improve combat pressure and rewards.
5. Add Epic 5 and Epic 6 for replayability.
6. Add Epic 7, Epic 9, and Epic 10 once the core loop is stable.
7. Use Epic 11 throughout tuning.
8. Save Epic 12 for late-stage polish and performance.
