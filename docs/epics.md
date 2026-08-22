# Epic Architecture Index

This file gives a simple overview of the Meowcenary backlog and defines the
**shared contracts** every epic builds on. GitHub issues are the default source
for each epic's product scope; a linked repository architecture document may
explicitly supersede older issue wording. This file is the cross-epic source of
truth for shared module names, data shapes, boundaries, and sequencing.

## Documentation Standard

Every epic should use the same structure:

1. **Plain-English Goal** — what the epic is for.
2. **Owns** — what this epic is responsible for.
3. **Does Not Own** — what belongs somewhere else.
4. **Contracts** — the exact modules, types, data files, and events this epic
   adds or consumes.
5. **Architecture Rules** — boundaries that keep the code simple.
6. **Implementation Plan** — dependency-ordered slices.
7. **Tests and Checks** — automated and manual verification.
8. **Done When** — definition of done.
9. **Codex Handoff** — implementation-agent instructions.

Keep documentation practical. Avoid long theory, duplicated design notes, or
vague wording. When an epic needs a type or event that already exists below,
**reference it by name — do not redefine it.**

## Repository Layout (canonical)

```text
src/
  engine/        Framework-agnostic primitives (no Phaser imports)
    config.ts
    sceneKeys.ts
    eventBus.ts
    rng.ts
    vector.ts
    cadence.ts
    cooldown.ts
    pool.ts
    motion.ts
    context.ts
  entities/      Phaser display/physics objects
  gameplay/      Pure run/progression rules (no Phaser imports)
  systems/       Phaser-aware coordinators + registries/validation/save
  scenes/        BootScene, MenuScene, GameScene — thin coordinators only
  ui/            HUD, cards, rack/inventory, menus, settings, future meta UI
  data/          Validated gameplay definitions
tests/           Vitest
```

Rule of thumb: anything under `engine/` and `gameplay/` **must not import
Phaser**. `entities/`, `systems/`, `scenes/`, and `ui/` may use Phaser.

## Shared Foundation Contracts

### Event bus

Gameplay systems emit; audio/UI/debug/feedback subscribe. Systems do not call
each other directly for presentation feedback. `GameEventMap` is additive and
must remain typed.

Current event families include:

```text
run:start / paused / resumed / won / lost
player:damaged / died
enemy:spawned / damaged / killed
weapon:fired / merged / acquired / pickup-blocked
projectile:hit
xp:gained / level:up / card:offered / card:chosen
drop:collected / currency:changed / hazard:triggered
settings:changed
ui:navigate / ui:confirm / ui:back
```

When a new epic needs a signal, extend an existing payload where that is the
real domain event; add a new event only for a genuinely new domain action.

Epic 22 may add achievement/mastery domain signals only where no existing
authoritative fact is sufficient. Achievement progress must never be derived
from cosmetic feedback events when an authoritative gameplay/progression fact
exists.

### Seeded RNG

All gameplay randomness flows through deterministic run-scoped streams derived
from the run seed.

```ts
interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T;
}

function createRng(seed: number): Rng;
function deriveRunSeed(seed: number, stream: string): number;
```

Never call `Math.random()` in gameplay code. `GameContext.menuRng` is menu-only.
Subsystems own named streams so one subsystem's RNG consumption cannot silently
perturb another.

### Stats and modifiers

One shared `ModifierStack` combines base stats and effects.

```ts
type StatKey =
  | 'moveSpeed' | 'maxHealth' | 'armor'
  | 'damage' | 'attackSpeed' | 'projectileSpeed' | 'projectileCount' | 'range'
  | 'critChance' | 'pickupRadius' | 'xpGain' | 'currencyGain';

interface Modifier {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
  sourceId: string;
}

interface ModifierStack {
  add(mod: Modifier): void;
  remove(sourceId: string): void;
  countBySource(sourceId: string): number;
  resolve(stat: StatKey, base: number): number;
}
```

All additive modifiers resolve before multiplicative modifiers. Higher is
better. Fire cadence is represented by `attackSpeed`, not a direct negative
modifier to an interval field.

`RunState.upgradeStacks` remains the authority for temporary-card stack counts;
modifier count is not card count.

### Run state

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
  currency: number;
  stats: ModifierStack;
  equipped: WeaponInstance[];
  upgradeStacks: Record<string, number>;
  pauseReason: PauseReason | null;
  outcome?: RunOutcome;
}
```

When `RunState.status !== 'active'`, gameplay simulation must not advance.
Future stage/contract state should either be resolved into/alongside RunState by
a dedicated pure owner or explicitly version RunState in its architecture pass;
do not hide mission state in `GameScene`.

### Weapon runtime state

Static definitions and runtime instances remain separate.

```ts
interface WeaponInstance {
  instanceId: string;
  defId: string;
  family: string;
  tier: number;
}
```

`RunState.equipped` is the temporary six-slot active rack. `WeaponSystem` owns
runtime cadence/projectiles. Run merging stays pure and separate from Epic 23's
future persistent Gunsmith.

### Upgrade selection state

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

Rules inherited from Epic 3:

- JSON effects omit `sourceId`; application assigns stable per-stack sources.
- `RunState.upgradeStacks[id]` is the stack-limit authority.
- Card application is transactional.
- Multi-level gains queue one offer per level.
- `card:offered` uses a per-run monotonically increasing `offerId`; stale-token
  commands cannot select a later offer.
- Empty eligible pools cannot deadlock the run.

Epic 18 extends this presentation/read-model contract without breaking the offer
ownership semantics:

- target ~15–20 meaningful upgrade definitions;
- normally 4–5 visible choices per offer;
- owned/current/max-stack state is exposed by authoritative read models;
- every shipped upgrade has placeholder icon/image presentation metadata and a
  resolvable placeholder visual;
- final art may replace placeholders without changing gameplay IDs/rules;
- temporary cards stay separate from persistent Gunsmith progression.

### Unified input/action boundary

Epic 19's additive-frozen Alpha 2 input vocabulary, analog movement separation,
source semantics, mappings, routing, and evidence rules are authoritative in
[`architecture/epic-19-player-ux-and-alpha-2-gate.md`](architecture/epic-19-player-ux-and-alpha-2-gate.md),
especially D1–D13 and §§4–6. Delivery status and real-device evidence live in
[`delivery/epic-19-player-experience-gate.md`](delivery/epic-19-player-experience-gate.md).

Rules:

- Gameplay/UI rules consume logical actions, not Xbox/PlayStation button names,
  keyboard scan codes, or touch-widget identities.
- Controller support covers the **entire** player journey, not combat only.
- Controller-only play must not require pointer hover, drag, touch, or a hidden
  cursor fallback.
- Controller connect/disconnect/input-source switching clears stale held state
  and must not double-confirm or lose focus.
- Auto-fire remains primary across all devices; required right-stick/manual aim
  is outside the product direction.
- Epic 24 character abilities must consume the same logical action layer rather
  than adding a character-specific device path.
- Future native wrappers may add input adapters, but do not fork gameplay rules.

### Save and persistent state

Current save ownership remains `SaveManager` + `GameContext` with linear,
versioned migrations. Existing meta state holds persistent currency, unlocks,
and legacy permanent-upgrade state.

Post-Alpha-2 epics may require new persistent structures for stage completion,
achievement/mastery progress, Gunsmith parts/builds, character abilities, and
equipment ownership. Those must be introduced through explicit versioned
migrations; do not append ad-hoc LocalStorage keys per feature.

### Achievement/mastery authority

Epic 22 introduces a game-owned persistent achievement/mastery primitive before
the systems that consume it.

Core boundary:

```text
authoritative gameplay/progression facts
                ↓
Meowcenary achievement/mastery state  ← source of truth
                ↓
      optional platform adapters
        /                    \
 Apple Game Center      Google Play Games
```

Rules:

- Meowcenary IDs/state are authoritative for progression and unlocks.
- Web/offline play earns achievements normally with no platform account.
- Platform services are best-effort, idempotent mirrors only.
- Failed/missing platform sync never revokes or blocks locally earned progress.
- Standard, incremental, hidden, and mastery definitions are planned first-class
  concepts.
- Achievement-triggered rewards route through the normal progression/save
  boundary exactly once.
- Epics 23–26 reference Epic 22 IDs/state; they do not create parallel
  achievement counters.

### Time

Pure gameplay systems receive `dtMs`; they must not read Phaser clocks directly.

## Epic Order

| Epic / Gate | Issue | Status | Purpose |
| --- | --- | --- | --- |
| Epic 0 | #1 Project Foundation | Complete | Config, event bus, RNG, validation, save/settings, input, debug/audio shells, CI. |
| Epic 1 | #2 Core Gameplay Loop | Complete | Movement, auto-combat, XP, level-up, win/loss; owns RunState + stats primitive. |
| Epic 2 | #3 Weapons and Merge System | Complete | Automatic weapons, projectiles, runtime weapon state, pure merge rules. |
| Epic 3 | #4 Upgrade Cards | Complete | Deterministic run-only level-up choices and modifier application. |
| Epic 4 | #5 Enemy AI and Spawn Director | Complete | Enemy behavior foundation and data-driven wave pressure. |
| Epic 5 | #6 Meta Progression | Complete | Earned persistent currency/upgrades/unlocks and migration boundary. |
| Epic 6 | #7 Characters | Complete | Character data/selection/passive hooks and run contribution. |
| Epic 7 | #8 Maps and Arenas | Complete | Data-defined arenas, spawn regions, obstacles, hazards. |
| Epic 8 | #9 Loot and Economy | Complete | Event-driven loot, poolable drops, scrap economy, chest shell. |
| Epic 9 | #10 UI and UX | Complete · PR #64 | Production menu/HUD/settings/touch/pause/inventory/chooser/summary foundation. |
| Epic 10 | #11 Audio | Complete · PRs #65/#68 | Game-scoped audio manager, event-driven SFX/music, settings, placeholders. |
| Epic 11 | #12 Balancing and Developer Tooling | Complete · PRs #66/#70 | Aggregate validation, curves, dev cheats, metrics, summaries. |
| Epic 12 | #13 Polish and Performance | Complete · PR #71 | Pooling, deterministic feedback, reduced motion, perf/FIT diagnostics. |
| Epic 13 | #72 Presentation Runtime and Physics Stability | Complete · PR #79 | Physics-debug gating, actor-view seam, art catalog/pipeline, movement stability. |
| Epic 14 | #73 Weapon Acquisition and Rack Economy | Complete · PR #80 | Six-slot run rack, weapon pickups, no-loss full rack, deterministic reward stream. |
| Epic 15 | #74 Inventory and Merge Experience | Complete · PR #81 | Visual rack, merge compatibility/preview, HUD entry, mobile-first tap interaction. |
| Epic 16 | #75 Visual Identity and Junkyard World | Complete · PRs #82/#83 | Production actor/weapon/pickup/world art and coherent Junkyard presentation. |
| Epic 17 | #76 Combat Feel and Weapon Identity | Complete · PRs #96–#102 | Weapon family/tier presentation and audio identity, enemy telegraph presentation, and one SMG tier data change; architecture and delivery record in [`architecture/epic-17-combat-feel-and-weapon-identity.md`](architecture/epic-17-combat-feel-and-weapon-identity.md). |
| Epic 18 | #77 Build Variety and Golden Run Pacing | Complete · PR #106 | Delivered the Golden Run/card expansion and pacing record. |
| Epic 19 | #78 Player UX and Alpha 2 Gate | Open · Slices 1–4 merged; Slice 5/evidence pending | Frozen contract, shared input/focus journey, touch diagnostics, and gate closeout. |
| **Alpha 2 certification gate** | **#94** | **Open · blocked by Epic 19** | Full repository architecture/quality/maintainability audit + remediation; fix all P0/P1 and downstream-relevant P2 findings before Alpha 3 architecture. |
| **Alpha 3 shared foundation gate** | **#92** | **Open · blocked by #94** | Freeze Stage/ResolvedRunPlan, Save V3, shared conditions/grants, catalog/conformance, content-version and bundle seams from the certified Alpha 2 baseline. |
| Epic 20 | #85 Contracts, Objectives, and Stage Progression | Open · Alpha 3 | Objective-based stage ladder, ~3-minute frontier pressure, chapter/boss-stage cadence. |
| Epic 21 | #86 Enemy Roster Expansion and Boss Framework | Open · Alpha 3 | ~8 behavioral archetypes, projectile threats, encounter composition, unique bosses. |
| Epic 22 | #91 Achievements, Mastery, and Platform Sync | Open · Alpha 3 | Game-owned standard/incremental/hidden/mastery achievements; offline/web authority; optional Game Center/Google Play mirrors. |
| Epic 23 | #87 Persistent Gunsmith and Weapon-Part Crafting | Open · Alpha 3 | Persistent modular guns/parts, out-of-combat crafting, merging, bounded trait infusion. |
| Epic 24 | #88 Mercenary Roster Expansion | Open · Alpha 3 | >3 playable characters; target ~8 with distinct passives/start identities, simple abilities, controller parity. |
| Epic 25 | #89 Armour Sets and Equipment Progression | Open · Alpha 3 | Helmet/Armour/Gloves/Boots, ~8 set families, 2/4-piece bonuses, coin upgrades + milestone-tier unlocks. |
| Epic 26 | #90 Meta Progression Rebalance and Depth Integration | Open · Alpha 3 | Give each reward/progression layer one clear role and integrate stages/bosses/achievements/Gunsmith/armour/characters. |

## Cross-Epic Rules

- Keep code modular, easy to read, and as simple as possible.
- `engine/` and `gameplay/` must not import Phaser.
- Keep Phaser scenes thin.
- Keep tuning/data definitions in validated data where practical.
- Feedback flows through the event bus.
- All randomness flows through seeded run-scoped RNG streams.
- All ordinary stat changes flow through approved stat/effect contracts; do not
  hand-roll multiplier bags.
- Touch, keyboard, and controller input converge on logical actions; device
  adapters do not own gameplay rules.
- Controller support is end-to-end UI + gameplay support, not combat-only.
- No required manual/right-stick aiming.
- Meowcenary achievement/mastery state is authoritative; native achievement
  services are optional mirrors only.
- No ads, paid power, subscriptions, energy systems, forced waiting, or
  manipulative progression pressure.
- Product/architecture decisions must be tested against actual phone-scale
  readability, touch ergonomics, and controller focus/navigation.
- New persistent systems need explicit migration-safe ownership and must have a
  unique progression role.
- After Epic 19, #94 is a mandatory fix gate: credible downstream debt is remediated rather than knowingly passed into #92.

## Progression-Layer Boundary

Post-Alpha-2 work must preserve this separation unless a dedicated architecture
pass deliberately supersedes it:

| Layer | Scope | Purpose |
| --- | --- | --- |
| Upgrade cards | Current contract/run | Temporary build direction and run-to-run variety |
| Six-slot weapon rack / run merges | Current run | Short-term combat escalation |
| Achievements/mastery | Persistent | Game-owned accomplishment/progression primitive; optional native mirrors |
| Gunsmith | Persistent | Engineer/personalize guns and parts between runs |
| Armour/equipment | Persistent | Mercenary loadout, set bonuses, gear upgrading |
| Mercenary roster | Persistent selection | Distinct passive/active play styles |
| Stages/bosses | Persistent progression | Content milestones and authoritative accomplishment facts |
| Coins/scrap | Persistent resource | Improve appropriate owned gear/items; not universal milestone access |

If two systems are doing the same job, simplify one rather than preserving
feature count.

## Reward-calculation Boundary

In-run loot owns live run rewards. Persistent progression owns exactly-once
banking/unlocks. Future contract/stage completion must preserve the same
principle: gameplay systems report authoritative completion/reward facts;
progression/save code owns durable mutation. Epic 22 may observe those facts for
achievement/mastery state but never makes platform sync a prerequisite for
banking or unlocks.

## Suggested Build Sequence

1. Epics 0–16 are complete foundations for the current product.
2. Epic 17: make the existing weapons/enemies feel distinct while preserving a reusable effect seam where actual Alpha 2 behavior needs it.
3. Epic 18: expand upgrade-card variety/presentation and tune the Golden Run.
4. Epic 19: run holistic Alpha 2 player-experience QA, including real-device touch combat and full controller-only validation; freeze shared logical actions and movement-only vs movement+dash based on evidence.
5. **Stop feature work and execute #94 against the fully merged post-Epic-19 `main`.** Perform the exhaustive orthogonal architecture/code-quality/modularity/reuse/testing/performance/portability/security/documentation audit, fix all P0/P1 and downstream-relevant P2 findings, rerun full validation, and complete an independent re-review.
6. **Only after #94 closes PASS, complete #92** against the certified Alpha 2 baseline.
7. Epic 20: introduce contracts/stage progression from #92's shared contracts.
8. Epic 21: expand enemy behaviors and bosses against the stage framework.
9. Epic 22: establish game-owned achievements/mastery + optional platform-sync adapters before downstream systems depend on achievement IDs.
10. Epic 23: build the persistent Gunsmith as a separate between-run progression system.
11. Epic 24: expand the mercenary roster and simple active-ability path using Epic 19's shared input baseline and Epic 22 mastery IDs.
12. Epic 25: add armour/equipment sets and progression/achievement-gated tiers.
13. Epic 26: integrate/rebalance the persistent progression economy and simplify redundant legacy progression.
