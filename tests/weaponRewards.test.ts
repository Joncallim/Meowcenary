import { describe, expect, it, vi } from 'vitest';
import { RuntimeConfig } from '../src/engine/config';
import { createRng, deriveRunSeed } from '../src/engine/rng';
import type { Rng } from '../src/engine/rng';
import {
  assertWeaponRewardTiming,
  firstWeaponRewardDeadlineMs,
  firstWeaponRewardGrant,
  nextWeaponRewardDeadlineMs,
  resolveLaterWeaponReward,
  WEAPON_REWARD_TABLE_ID,
  type WeaponRewardTimingConfig,
} from '../src/gameplay/weaponRewards';
import { createRunState } from '../src/gameplay/runState';
import { WeaponRewardSystem } from '../src/systems/WeaponRewardSystem';
import { DataLootTableRegistry } from '../src/systems/lootTables';
import type { LootTableLookup } from '../src/systems/lootTables';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';

const CONFIG = RuntimeConfig.gameplay.weaponRewards;
const T1_IDS = ['scrap-pistol-t1', 'can-smg-t1', 'bolt-shotgun-t1'] as const;
const STARTING_ID = 'scrap-pistol-t1';

const data = loadGameData();
const lootTables = new DataLootTableRegistry(data);
const weaponRegistry = new DataWeaponRegistry(data);

function rewardRng(seed: number) {
  return createRng(deriveRunSeed(seed, 'weapon-rewards'));
}

/** Replays the system's exact RNG consumption to produce the expected spawn
 *  sequence: one int() per deadline at construction, then per due reward.
 *  `lookup` must model what the system sees: a failed table resolution
 *  consumes no draw (fail soft) but still advances the schedule. */
function expectedSchedule(
  seed: number,
  startingDefinitionId: string | undefined,
  count: number,
  lookup: LootTableLookup = lootTables,
): Array<{ at: number; definitionId: string }> {
  const rng = rewardRng(seed);
  const out: Array<{ at: number; definitionId: string }> = [];
  let deadline = firstWeaponRewardDeadlineMs(rng, CONFIG);
  for (let index = 0; index < count; index += 1) {
    let definitionId: string;
    if (index === 0 && startingDefinitionId !== undefined) {
      definitionId = firstWeaponRewardGrant(startingDefinitionId).definitionId;
    } else {
      try {
        const grant = resolveLaterWeaponReward(lookup, rng);
        definitionId = grant.kind === 'weapon' ? grant.definitionId : '<non-weapon>';
      } catch {
        definitionId = '<failed>';
      }
    }
    out.push({ at: deadline, definitionId });
    deadline = nextWeaponRewardDeadlineMs(deadline, rng, CONFIG);
  }
  return out;
}

interface Harness {
  system: WeaponRewardSystem;
  runState: ReturnType<typeof createRunState>;
  spawns: Array<{ x: number; y: number; definitionId: string }>;
}

function createHarness(options: {
  seed?: number;
  startingDefinitionId?: string | undefined;
  playerPosition?: () => { x: number; y: number };
  arenaBounds?: { width: number; height: number };
  obstacles?: Array<{ x: number; y: number; w: number; h: number }>;
  lootTableLookup?: LootTableLookup;
} = {}): Harness {
  const runState = createRunState({
    seed: options.seed ?? 1,
    characterId: 'starter',
    arenaId: 'arena',
  });
  runState.status = 'active';
  const startingId = options.startingDefinitionId;
  if (startingId !== undefined) {
    const def = weaponRegistry.weaponById(startingId);
    if (!def) throw new Error(`missing definition ${startingId}`);
    runState.equipped = [weaponRegistry.createWeaponInstance(def)];
  }
  const spawns: Harness['spawns'] = [];
  const system = new WeaponRewardSystem({
    runState,
    rng: rewardRng(options.seed ?? 1),
    lootTables: options.lootTableLookup ?? lootTables,
    config: CONFIG,
    dropRadius: 8,
    spawnDrop: (x, y, grant) => {
      spawns.push({ x, y, definitionId: grant.kind === 'weapon' ? grant.definitionId : '' });
    },
    playerPosition: options.playerPosition ?? (() => ({ x: 300, y: 300 })),
    arenaBounds: options.arenaBounds ?? { width: 900, height: 900 },
    obstacles: options.obstacles ?? [],
  });
  // The harness drives runState.timeMs directly.
  return { system, runState, spawns };
}

describe('weapon reward timing configuration (Epic 14 §D11)', () => {
  it('accepts the shipped RuntimeConfig values', () => {
    expect(() => assertWeaponRewardTiming(CONFIG)).not.toThrow();
  });

  it.each([
    ['firstMinMs above firstMaxMs', { ...CONFIG, firstMinMs: 41_000, firstMaxMs: 20_000 }],
    ['repeatMinMs above repeatMaxMs', { ...CONFIG, repeatMinMs: 46_000, repeatMaxMs: 30_000 }],
    ['zero firstMinMs', { ...CONFIG, firstMinMs: 0 }],
    ['negative firstMaxMs', { ...CONFIG, firstMaxMs: -1 }],
    ['fractional firstMinMs', { ...CONFIG, firstMinMs: 20.5 }],
    ['zero spawnOffset', { ...CONFIG, spawnOffset: 0 }],
    ['negative spawnOffset', { ...CONFIG, spawnOffset: -8 }],
    ['non-finite spawnOffset', { ...CONFIG, spawnOffset: Number.NaN }],
  ] as const)('rejects %s', (_label, config) => {
    expect(() => assertWeaponRewardTiming(config as WeaponRewardTimingConfig)).toThrow();
  });
});

describe('reward schedule helpers', () => {
  it('first deadline always lies in the inclusive [20_000, 40_000] window', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const deadline = firstWeaponRewardDeadlineMs(rewardRng(seed), CONFIG);
      expect(deadline).toBeGreaterThanOrEqual(CONFIG.firstMinMs);
      expect(deadline).toBeLessThanOrEqual(CONFIG.firstMaxMs);
    }
  });

  it('subsequent deadlines advance from the previous deadline within the repeat window', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = rewardRng(seed);
      let deadline = firstWeaponRewardDeadlineMs(rng, CONFIG);
      for (let step = 0; step < 5; step += 1) {
        const next = nextWeaponRewardDeadlineMs(deadline, rng, CONFIG);
        const delta = next - deadline;
        expect(delta).toBeGreaterThanOrEqual(CONFIG.repeatMinMs);
        expect(delta).toBeLessThanOrEqual(CONFIG.repeatMaxMs);
        deadline = next;
      }
    }
  });

  it('same run seed reproduces the same deadlines', () => {
    const first = expectedSchedule(42, STARTING_ID, 4);
    const second = expectedSchedule(42, STARTING_ID, 4);
    expect(first.map((entry) => entry.at)).toEqual(second.map((entry) => entry.at));
  });

  it('reward index 0 returns the starting definition without consuming RNG', () => {
    const next = vi.fn(() => 0.5);
    const grant = firstWeaponRewardGrant(STARTING_ID);
    expect(grant).toEqual({ kind: 'weapon', definitionId: STARTING_ID });
    expect(next).not.toHaveBeenCalled();
  });

  it('later rewards resolve only T1 weapon grants from weapon-world', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const grant = resolveLaterWeaponReward(lootTables, rewardRng(seed));
      expect(grant.kind).toBe('weapon');
      if (grant.kind !== 'weapon') throw new Error('unreachable');
      expect(T1_IDS).toContain(grant.definitionId);
    }
  });

  it('throws when the reward table is missing or resolves a non-weapon grant', () => {
    expect(() => resolveLaterWeaponReward({ lootTableById: () => undefined }, rewardRng(1)))
      .toThrow(/not found/);
    const xpLookup = {
      lootTableById: (id: string) =>
        id === WEAPON_REWARD_TABLE_ID
          ? { id: WEAPON_REWARD_TABLE_ID, entries: [{ kind: 'xp' as const, amount: 5, weight: 1 }] }
          : undefined,
    };
    expect(() => resolveLaterWeaponReward(xpLookup, rewardRng(1)))
      .toThrow(/must resolve exactly one weapon grant/);
  });
});

describe('WeaponRewardSystem', () => {
  it('emits reward 0 as the starting definition and later rewards from weapon-world', () => {
    const harness = createHarness({ seed: 7, startingDefinitionId: STARTING_ID });
    const expected = expectedSchedule(7, STARTING_ID, 4);
    const { runState } = harness;

    for (const entry of expected) {
      runState.timeMs = entry.at;
      harness.system.update(0);
    }

    expect(harness.spawns.map((spawn) => spawn.definitionId)).toEqual(
      expected.map((entry) => entry.definitionId),
    );
    expect(harness.spawns[0].definitionId).toBe(STARTING_ID);
    // Later rewards come from the T1 pool and are not necessarily the starter.
    expect(T1_IDS).toContain(harness.spawns[1].definitionId);
  });

  it('reproduces the identical spawn sequence for the same run seed', () => {
    const first = createHarness({ seed: 2024, startingDefinitionId: STARTING_ID });
    const second = createHarness({ seed: 2024, startingDefinitionId: STARTING_ID });
    const expected = expectedSchedule(2024, STARTING_ID, 8);
    for (const harness of [first, second]) {
      const { runState } = harness;
      for (const entry of expected) {
        runState.timeMs = entry.at;
        harness.system.update(0);
      }
    }

    expect(first.spawns.map((spawn) => spawn.definitionId)).toEqual(
      second.spawns.map((spawn) => spawn.definitionId),
    );
    expect(first.spawns).toEqual(second.spawns);
  });

  it('spawns nothing before the first deadline and nothing between deadlines', () => {
    const harness = createHarness({ seed: 3, startingDefinitionId: STARTING_ID });
    const expected = expectedSchedule(3, STARTING_ID, 2);
    const { runState } = harness;

    runState.timeMs = expected[0].at - 1;
    harness.system.update(16);
    expect(harness.spawns).toHaveLength(0);

    runState.timeMs = expected[0].at;
    harness.system.update(16);
    expect(harness.spawns).toHaveLength(1);

    // Next deadline advances from the prior deadline, not from frame time.
    runState.timeMs = expected[1].at - 1;
    harness.system.update(16);
    expect(harness.spawns).toHaveLength(1);

    runState.timeMs = expected[1].at;
    harness.system.update(16);
    expect(harness.spawns).toHaveLength(2);
    expect(harness.spawns[1].definitionId).toBe(expected[1].definitionId);
  });

  it('a coarse time jump processes every due reward deterministically in one update', () => {
    const harness = createHarness({ seed: 99, startingDefinitionId: STARTING_ID });
    const expected = expectedSchedule(99, STARTING_ID, 50);
    const due = expected.filter((entry) => entry.at <= 600_000);
    const { runState } = harness;

    runState.timeMs = 600_000;
    harness.system.update(600_000);

    expect(harness.spawns).toHaveLength(due.length);
    expect(harness.spawns.map((spawn) => spawn.definitionId)).toEqual(
      due.map((entry) => entry.definitionId),
    );
  });

  it('pauses do not consume schedule time', () => {
    const harness = createHarness({ seed: 5, startingDefinitionId: STARTING_ID });
    const expected = expectedSchedule(5, STARTING_ID, 50);
    const due = expected.filter((entry) => entry.at <= 500_000);
    const { runState } = harness;

    // While paused, timeMs cannot advance in the real loop; even a forced jump
    // must not fire rewards.
    runState.status = 'paused';
    runState.timeMs = 500_000;
    harness.system.update(16);
    expect(harness.spawns).toHaveLength(0);

    // Resume: every due reward fires on the next active update.
    runState.status = 'active';
    harness.system.update(16);
    expect(harness.spawns.map((spawn) => spawn.definitionId)).toEqual(
      due.map((entry) => entry.definitionId),
    );
  });

  it('fails soft once per due reward for a missing table and advances the schedule', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missingLookup = { lootTableById: () => undefined };
    // Empty rack: even reward 0 must resolve from the (missing) table.
    const harness = createHarness({ seed: 11, startingDefinitionId: undefined, lootTableLookup: missingLookup });
    const { runState } = harness;

    runState.timeMs = 500_000;
    harness.system.update(500_000);

    // Every due reward warned once and advanced; the update terminated.
    const expected = expectedSchedule(11, undefined, 50, missingLookup);
    const due = expected.filter((entry) => entry.at <= 500_000);
    expect(warn).toHaveBeenCalledTimes(due.length);
    expect(due.length).toBeGreaterThan(1);
    expect(harness.spawns).toHaveLength(0);

    warn.mockRestore();
  });

  it('does not retry a failed reward on subsequent frames', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missingLookup = { lootTableById: () => undefined };
    const harness = createHarness({ seed: 11, startingDefinitionId: undefined, lootTableLookup: missingLookup });
    const { runState } = harness;

    runState.timeMs = 500_000;
    harness.system.update(500_000);
    const warnCount = warn.mock.calls.length;
    harness.system.update(16);
    harness.system.update(16);

    expect(warn.mock.calls.length).toBe(warnCount);
    expect(harness.spawns).toHaveLength(0);

    warn.mockRestore();
  });
});

describe('WeaponRewardSystem placement (Epic 14 §D12)', () => {
  it('places reward 0 at (+spawnOffset, 0) and cycles through the four offsets', () => {
    const harness = createHarness({ seed: 21, startingDefinitionId: STARTING_ID });
    const expected = expectedSchedule(21, STARTING_ID, 5);
    const { runState } = harness;

    for (const entry of expected) {
      runState.timeMs = entry.at;
      harness.system.update(0);
    }

    expect(harness.spawns.map((spawn) => [spawn.x, spawn.y])).toEqual([
      [300 + CONFIG.spawnOffset, 300],
      [300, 300 + CONFIG.spawnOffset],
      [300 - CONFIG.spawnOffset, 300],
      [300, 300 - CONFIG.spawnOffset],
      [300 + CONFIG.spawnOffset, 300],
    ]);
  });

  it('consumes no reward RNG for placement of reward 0', () => {
    // The closure-based Rng.int draws through an internal `next` that a
    // `vi.spyOn(rng, 'next')` cannot observe, so record the whole public RNG
    // surface instead. Reward 0's definition and placement must draw nothing:
    // the only draw after construction is the schedule-advance `int` that
    // follows the fired reward.
    const base = rewardRng(31);
    const draws: string[] = [];
    const rng: Rng = {
      next: () => {
        draws.push('next');
        return base.next();
      },
      int: (min, max) => {
        draws.push('int');
        return base.int(min, max);
      },
      pick: (items) => {
        draws.push('pick');
        return base.pick(items);
      },
      weighted: (entries) => {
        draws.push('weighted');
        return base.weighted(entries);
      },
    };
    const runState = createRunState({ seed: 31, characterId: 'starter', arenaId: 'arena' });
    runState.status = 'active';
    const def = weaponRegistry.weaponById(STARTING_ID);
    if (!def) throw new Error('missing definition');
    runState.equipped = [weaponRegistry.createWeaponInstance(def)];
    const spawns: Array<{ x: number; y: number }> = [];
    const system = new WeaponRewardSystem({
      runState,
      rng,
      lootTables,
      config: CONFIG,
      dropRadius: 8,
      spawnDrop: (x, y) => { spawns.push({ x, y }); },
      playerPosition: () => ({ x: 300, y: 300 }),
      arenaBounds: { width: 900, height: 900 },
      obstacles: [],
    });
    draws.length = 0; // ignore the construction deadline draw

    runState.timeMs = 40_000;
    system.update(0);

    expect(spawns).toHaveLength(1);
    // Exactly one `int` (the schedule advance); no `next` — reward 0 never
    // draws from the weighted table, and placement draws nothing at all.
    expect(draws).toEqual(['int']);
  });

  it('clamps candidates inside arena bounds by at least the drop radius', () => {
    const harness = createHarness({
      seed: 41,
      startingDefinitionId: STARTING_ID,
      playerPosition: () => ({ x: -100, y: -100 }),
      arenaBounds: { width: 100, height: 100 },
    });
    const { runState } = harness;

    runState.timeMs = 40_000;
    harness.system.update(0);

    // Candidate (-36, -100) clamps to the drop radius margin (8) on both axes.
    expect([harness.spawns[0].x, harness.spawns[0].y]).toEqual([8, 8]);
  });

  it('skips obstacle-expanded candidates in cycle order and falls back to the player position', () => {
    // Obstacle covering the first candidate (+64, 0) expanded by radius 8.
    const obstacles = [{ x: 300 + CONFIG.spawnOffset - 8, y: 292, w: 16, h: 16 }];
    const harness = createHarness({
      seed: 51,
      startingDefinitionId: STARTING_ID,
      obstacles,
    });
    const { runState } = harness;

    runState.timeMs = 40_000;
    harness.system.update(0);

    // First candidate blocked → second cycle position (0, +64).
    expect([harness.spawns[0].x, harness.spawns[0].y]).toEqual([300, 300 + CONFIG.spawnOffset]);
  });

  it('falls back to the bounded player position with a warning when every candidate is blocked', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const margin = 8;
    const obstacles = [
      { x: 300 + CONFIG.spawnOffset - margin, y: 300 - margin, w: 2 * margin, h: 2 * margin },
      { x: 300 - margin, y: 300 + CONFIG.spawnOffset - margin, w: 2 * margin, h: 2 * margin },
      { x: 300 - CONFIG.spawnOffset - margin, y: 300 - margin, w: 2 * margin, h: 2 * margin },
      { x: 300 - margin, y: 300 - CONFIG.spawnOffset - margin, w: 2 * margin, h: 2 * margin },
    ];
    const harness = createHarness({
      seed: 61,
      startingDefinitionId: STARTING_ID,
      obstacles,
      playerPosition: () => ({ x: 300, y: 300 }),
      arenaBounds: { width: 900, height: 900 },
    });
    const { runState } = harness;

    runState.timeMs = 40_000;
    harness.system.update(0);

    expect([harness.spawns[0].x, harness.spawns[0].y]).toEqual([300, 300]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('falling back');

    warn.mockRestore();
  });
});
