import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createRunState, startRun } from '../src/gameplay/runState';
import { createSpawnDirector } from '../src/gameplay/spawnDirector';
import type { SpawnCurveDefinition } from '../src/systems/types';
import { applyXp } from '../src/gameplay/xp';
import type { Player } from '../src/entities/Player';

// No DebugOverlay is constructed here, so the Phaser mock only needs the
// shape required to evaluate `systems/debug.ts` and its imports.
vi.mock('phaser', () => ({ default: {} }));

import {
  DEBUG_CHEAT_SOURCE,
  DEFAULT_DEBUG_FLAGS,
  DebugCheatSystem,
  debugCheatModifiers,
  debugCheatsActive,
  readDebugFlags,
  scaleSpawnCurveIntervals,
} from '../src/systems/debug';

describe('readDebugFlags parser', () => {
  it('returns DEFAULT_DEBUG_FLAGS by identity for an empty query', () => {
    expect(readDebugFlags('')).toBe(DEFAULT_DEBUG_FLAGS);
  });

  it('returns defaults by identity when the master switch is missing', () => {
    expect(readDebugFlags('?god=1&xp=4&scrap=3&spawn=2')).toBe(DEFAULT_DEBUG_FLAGS);
  });

  it('returns a frozen enabled/neutral object for the master switch alone', () => {
    const flags = readDebugFlags('?cheats=1');
    expect(flags).not.toBe(DEFAULT_DEBUG_FLAGS);
    expect(flags).toEqual({
      enabled: true,
      godMode: false,
      xpMultiplier: 1,
      scrapMultiplier: 1,
      spawnMultiplier: 1,
    });
    expect(Object.isFrozen(flags)).toBe(true);
  });

  it('parses exact values from the full valid query', () => {
    const flags = readDebugFlags('?cheats=1&god=1&xp=4&scrap=3&spawn=2');
    expect(flags).toEqual({
      enabled: true,
      godMode: true,
      xpMultiplier: 4,
      scrapMultiplier: 3,
      spawnMultiplier: 2,
    });
  });

  it('parses the exact inclusive boundaries', () => {
    const low = readDebugFlags('?cheats=1&xp=0.1&scrap=0.1&spawn=1');
    expect(low.xpMultiplier).toBe(0.1);
    expect(low.scrapMultiplier).toBe(0.1);
    expect(low.spawnMultiplier).toBe(1);

    const high = readDebugFlags('?cheats=1&xp=100&scrap=100&spawn=20');
    expect(high.xpMultiplier).toBe(100);
    expect(high.scrapMultiplier).toBe(100);
    expect(high.spawnMultiplier).toBe(20);
  });

  it.each([
    ['missing', '?cheats=1&scrap=3&spawn=2'],
    ['empty', '?cheats=1&xp=&scrap=3&spawn=2'],
    ['NaN', '?cheats=1&xp=NaN&scrap=3&spawn=2'],
    ['Infinity', '?cheats=1&xp=Infinity&scrap=3&spawn=2'],
    ['partial', '?cheats=1&xp=2x&scrap=3&spawn=2'],
    ['out-of-range low', '?cheats=1&xp=0&scrap=3&spawn=2'],
    ['out-of-range high', '?cheats=1&xp=100.5&scrap=3&spawn=2'],
    ['negative', '?cheats=1&xp=-2&scrap=3&spawn=2'],
  ])('falls back only the invalid xp field to 1 when %s', (_name, query) => {
    const flags = readDebugFlags(query);
    expect(flags.enabled).toBe(true);
    expect(flags.xpMultiplier).toBe(1);
    expect(flags.scrapMultiplier).toBe(3);
    expect(flags.spawnMultiplier).toBe(2);
  });

  it.each([
    ['missing', '?cheats=1&xp=4&spawn=2'],
    ['empty', '?cheats=1&xp=4&scrap=&spawn=2'],
    ['NaN', '?cheats=1&xp=4&scrap=NaN&spawn=2'],
    ['out-of-range low', '?cheats=1&xp=4&scrap=0&spawn=2'],
    ['out-of-range high', '?cheats=1&xp=4&scrap=100.1&spawn=2'],
  ])('falls back only the invalid scrap field to 1 when %s', (_name, query) => {
    const flags = readDebugFlags(query);
    expect(flags.xpMultiplier).toBe(4);
    expect(flags.scrapMultiplier).toBe(1);
    expect(flags.spawnMultiplier).toBe(2);
  });

  it.each([
    ['below range', '?cheats=1&xp=4&scrap=3&spawn=0.5'],
    ['above range', '?cheats=1&xp=4&scrap=3&spawn=21'],
  ])('falls back only the invalid spawn field to 1 when %s', (_name, query) => {
    const flags = readDebugFlags(query);
    expect(flags.xpMultiplier).toBe(4);
    expect(flags.scrapMultiplier).toBe(3);
    expect(flags.spawnMultiplier).toBe(1);
  });

  it('accepts fractional in-range spawn values', () => {
    expect(readDebugFlags('?cheats=1&spawn=2.5').spawnMultiplier).toBe(2.5);
  });

  it('falls back scrap independently without touching xp', () => {
    const flags = readDebugFlags('?cheats=1&xp=4&scrap=nan');
    expect(flags.xpMultiplier).toBe(4);
    expect(flags.scrapMultiplier).toBe(1);
  });

  it('stays disabled for non-"1" master values', () => {
    for (const query of ['?cheats=true&god=1', '?cheats=on', '?cheats=0', '?cheats=']) {
      expect(readDebugFlags(query)).toBe(DEFAULT_DEBUG_FLAGS);
    }
  });

  it('ignores unknown parameters', () => {
    const flags = readDebugFlags('?cheats=1&foo=bar&god=1&baz=2&xp=4');
    expect(flags.godMode).toBe(true);
    expect(flags.xpMultiplier).toBe(4);
  });

  it('uses the first value for duplicate parameters', () => {
    const flags = readDebugFlags('?cheats=1&xp=4&xp=9');
    expect(flags.xpMultiplier).toBe(4);
  });

  it('never throws for arbitrary string input', () => {
    for (const query of ['%', '?cheats=1&xp=%zz', '?cheats=1&god=', '??']) {
      expect(() => readDebugFlags(query)).not.toThrow();
    }
  });

  it('returned enabled flags cannot be mutated', () => {
    const flags = readDebugFlags('?cheats=1&xp=4');
    expect(Object.isFrozen(flags)).toBe(true);
    expect(() => {
      (flags as { xpMultiplier: number }).xpMultiplier = 9;
    }).toThrow(TypeError);
  });
});

describe('session cache and environment gate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reads a stubbed location once and returns the same cached object on repeated calls', async () => {
    vi.resetModules();
    let reads = 0;
    vi.stubGlobal('location', {
      get search() {
        reads += 1;
        return '?cheats=1&xp=2';
      },
    });
    const mod = await import('../src/systems/debug');
    const first = mod.getDebugFlags();
    const second = mod.getDebugFlags();
    expect(reads).toBe(1);
    expect(first).toBe(second);
    expect(first.enabled).toBe(true);
    expect(first.xpMultiplier).toBe(2);
  });

  it('returns DEFAULT_DEBUG_FLAGS without reading the location outside dev', async () => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    const readSearch = vi.fn(() => '?cheats=1&xp=4');
    vi.stubGlobal('location', {
      get search() {
        readSearch();
        return '?cheats=1&xp=4';
      },
    });
    const mod = await import('../src/systems/debug');
    expect(mod.getDebugFlags()).toBe(mod.DEFAULT_DEBUG_FLAGS);
    expect(readSearch).not.toHaveBeenCalled();
  });

  it('debugCheatsActive requires both the environment and the master flag', () => {
    expect(debugCheatsActive(DEFAULT_DEBUG_FLAGS, true)).toBe(false);
    expect(debugCheatsActive(DEFAULT_DEBUG_FLAGS, false)).toBe(false);
    const enabled = readDebugFlags('?cheats=1');
    expect(debugCheatsActive(enabled, true)).toBe(true);
    expect(debugCheatsActive(enabled, false)).toBe(false);
  });
});

describe('debugCheatModifiers', () => {
  it('produces no modifiers for disabled or enabled-neutral flags', () => {
    expect(debugCheatModifiers(DEFAULT_DEBUG_FLAGS)).toEqual([]);
    expect(debugCheatModifiers(readDebugFlags('?cheats=1'))).toEqual([]);
  });

  it('produces exact ordered modifiers with the debug source id', () => {
    const xp = debugCheatModifiers(readDebugFlags('?cheats=1&xp=4'));
    expect(xp).toEqual([
      { stat: 'xpGain', op: 'mult', value: 4, sourceId: DEBUG_CHEAT_SOURCE },
    ]);

    const scrap = debugCheatModifiers(readDebugFlags('?cheats=1&scrap=3'));
    expect(scrap).toEqual([
      { stat: 'currencyGain', op: 'mult', value: 3, sourceId: DEBUG_CHEAT_SOURCE },
    ]);

    const both = debugCheatModifiers(readDebugFlags('?cheats=1&xp=4&scrap=3'));
    expect(both).toEqual([
      { stat: 'xpGain', op: 'mult', value: 4, sourceId: DEBUG_CHEAT_SOURCE },
      { stat: 'currencyGain', op: 'mult', value: 3, sourceId: DEBUG_CHEAT_SOURCE },
    ]);
  });

  it('returns fresh modifier objects on each call', () => {
    const flags = readDebugFlags('?cheats=1&xp=4');
    expect(debugCheatModifiers(flags)).not.toBe(debugCheatModifiers(flags));
  });

  it('never generates god or spawn modifiers', () => {
    const flags = readDebugFlags('?cheats=1&god=1&xp=4&spawn=2');
    expect(debugCheatModifiers(flags)).toEqual([
      { stat: 'xpGain', op: 'mult', value: 4, sourceId: DEBUG_CHEAT_SOURCE },
    ]);
  });

  it('does not mutate the input flags', () => {
    const flags = readDebugFlags('?cheats=1&xp=4&scrap=3');
    debugCheatModifiers(flags);
    expect(flags).toEqual({
      enabled: true,
      godMode: false,
      xpMultiplier: 4,
      scrapMultiplier: 3,
      spawnMultiplier: 1,
    });
  });

  it('applying generated modifiers changes applyXp and currency resolution; removal restores neutral', () => {
    const bus = createEventBus();
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'yard' });
    startRun(runState, bus);
    const gained: number[] = [];
    bus.on('xp:gained', ({ amount }) => gained.push(amount));

    for (const modifier of debugCheatModifiers(readDebugFlags('?cheats=1&xp=4&scrap=3'))) {
      runState.stats.add(modifier);
    }
    expect(runState.stats.resolve('xpGain', 1)).toBe(4);
    expect(runState.stats.resolve('currencyGain', 1)).toBe(3);
    expect(applyXp(runState, 10, bus)).toBeGreaterThan(0);
    expect(gained).toEqual([40]);

    runState.stats.remove(DEBUG_CHEAT_SOURCE);
    expect(runState.stats.resolve('xpGain', 1)).toBe(1);
    expect(runState.stats.resolve('currencyGain', 1)).toBe(1);
    applyXp(runState, 10, bus);
    expect(gained).toEqual([40, 10]);
  });
});

describe('scaleSpawnCurveIntervals', () => {
  function validCurve(): SpawnCurveDefinition {
    return {
      id: 'test-curve',
      durationSeconds: 60,
      scaling: { healthPerMinute: 10, damagePerMinute: 5 },
      waves: [
        { startSecond: 0, enemyId: 'chaser-a', spawnEveryMs: 1000, maxAlive: 3 },
        { startSecond: 10, enemyId: 'chaser-b', spawnEveryMs: 999, maxAlive: 2 },
        { startSecond: 20, enemyId: 'charger-a', spawnEveryMs: 1, maxAlive: 1 },
      ],
    };
  }

  it('fails neutral by returning the original reference for non-finite or <= 1 multipliers', () => {
    const curve = validCurve();
    expect(scaleSpawnCurveIntervals(curve, Number.NaN)).toBe(curve);
    expect(scaleSpawnCurveIntervals(curve, Number.POSITIVE_INFINITY)).toBe(curve);
    expect(scaleSpawnCurveIntervals(curve, 1)).toBe(curve);
    expect(scaleSpawnCurveIntervals(curve, 0.5)).toBe(curve);
    expect(scaleSpawnCurveIntervals(curve, -2)).toBe(curve);
  });

  it('returns a copied curve and copied waves with exact rounded intervals for > 1', () => {
    const curve = validCurve();
    const scaled = scaleSpawnCurveIntervals(curve, 2);
    expect(scaled).not.toBe(curve);
    expect(scaled.waves).not.toBe(curve.waves);
    expect(scaled.waves[0]).not.toBe(curve.waves[0]);
    expect(scaled.waves.map((wave) => wave.spawnEveryMs)).toEqual([500, 500, 1]);
  });

  it('clamps every interval to a minimum of 1', () => {
    const curve = validCurve();
    const scaled = scaleSpawnCurveIntervals(curve, 20);
    expect(scaled.waves.map((wave) => wave.spawnEveryMs)).toEqual([50, 50, 1]);
  });

  it('keeps all non-interval values and references byte-equivalent', () => {
    const curve = validCurve();
    const scaled = scaleSpawnCurveIntervals(curve, 4);
    expect(scaled.id).toBe(curve.id);
    expect(scaled.durationSeconds).toBe(curve.durationSeconds);
    expect(scaled.scaling).toBe(curve.scaling);
    expect(scaled.waves.length).toBe(curve.waves.length);
    for (let index = 0; index < curve.waves.length; index += 1) {
      expect(scaled.waves[index].startSecond).toBe(curve.waves[index].startSecond);
      expect(scaled.waves[index].enemyId).toBe(curve.waves[index].enemyId);
      expect(scaled.waves[index].maxAlive).toBe(curve.waves[index].maxAlive);
    }
  });

  it('does not mutate a deeply frozen input', () => {
    const curve = Object.freeze({
      ...validCurve(),
      scaling: Object.freeze({ ...validCurve().scaling }),
      waves: Object.freeze(
        validCurve().waves.map((wave) => Object.freeze({ ...wave })),
      ),
    }) as unknown as SpawnCurveDefinition;
    const scaled = scaleSpawnCurveIntervals(curve, 3);
    expect(scaled.waves[0].spawnEveryMs).toBe(333);
    expect(curve.waves[0].spawnEveryMs).toBe(1000);
  });

  it('produces a curve the spawn director accepts', () => {
    const scaled = scaleSpawnCurveIntervals(validCurve(), 3);
    expect(() => createSpawnDirector(scaled, createRng(1))).not.toThrow();
  });
});

describe('DebugCheatSystem', () => {
  function fakePlayer(health = 50, maxHealth = 100) {
    return { health, maxHealth };
  }

  it('adds the exact modifiers and emits one exact diagnostic line', () => {
    const info = vi.fn();
    const runState = createRunState({ seed: 7, characterId: 'cat', arenaId: 'yard' });
    const system = new DebugCheatSystem({
      runState,
      player: fakePlayer() as unknown as Player,
      flags: readDebugFlags('?cheats=1&god=1&xp=4&scrap=3&spawn=2'),
      logger: { info },
    });
    expect(runState.stats.countBySource(DEBUG_CHEAT_SOURCE)).toBe(2);
    expect(runState.stats.resolve('xpGain', 1)).toBe(4);
    expect(runState.stats.resolve('currencyGain', 1)).toBe(3);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('[cheats] god=on xp=4x scrap=3x spawn=2x');
    system.destroy();
  });

  it('emits one neutral diagnostic for a bare master switch', () => {
    const info = vi.fn();
    const runState = createRunState({ seed: 7, characterId: 'cat', arenaId: 'yard' });
    const system = new DebugCheatSystem({
      runState,
      player: fakePlayer() as unknown as Player,
      flags: readDebugFlags('?cheats=1'),
      logger: { info },
    });
    expect(runState.stats.countBySource(DEBUG_CHEAT_SOURCE)).toBe(0);
    expect(info).toHaveBeenCalledWith('[cheats] god=off xp=1x scrap=1x spawn=1x');
    system.destroy();
  });

  it('refills health once per active update when god mode is on', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'yard' });
    const player = fakePlayer(30);
    const system = new DebugCheatSystem({
      runState,
      player: player as unknown as Player,
      flags: readDebugFlags('?cheats=1&god=1'),
      logger: { info: () => {} },
    });
    runState.status = 'active';
    system.update(16);
    expect(player.health).toBe(100);
    player.health = 40;
    system.update(16);
    expect(player.health).toBe(100);
    system.destroy();
  });

  it.each(['intro', 'paused', 'won', 'lost'] as const)(
    'does not refill while the run is %s',
    (status) => {
      const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'yard' });
      runState.status = status;
      const player = fakePlayer(30);
      const system = new DebugCheatSystem({
        runState,
        player: player as unknown as Player,
        flags: readDebugFlags('?cheats=1&god=1'),
        logger: { info: () => {} },
      });
      system.update(16);
      expect(player.health).toBe(30);
      system.destroy();
    },
  );

  it('does not refill when god mode is off', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'yard' });
    const player = fakePlayer(30);
    const system = new DebugCheatSystem({
      runState,
      player: player as unknown as Player,
      flags: readDebugFlags('?cheats=1&xp=4'),
      logger: { info: () => {} },
    });
    runState.status = 'active';
    system.update(16);
    expect(player.health).toBe(30);
    system.destroy();
  });

  it('destroy removes all debug-source modifiers, is idempotent, and keeps unrelated modifiers', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'yard' });
    runState.stats.add({ stat: 'damage', op: 'mult', value: 2, sourceId: 'unrelated' });
    const system = new DebugCheatSystem({
      runState,
      player: fakePlayer() as unknown as Player,
      flags: readDebugFlags('?cheats=1&xp=4&scrap=3'),
      logger: { info: () => {} },
    });
    expect(runState.stats.countBySource(DEBUG_CHEAT_SOURCE)).toBe(2);

    system.destroy();
    system.destroy();

    expect(runState.stats.countBySource(DEBUG_CHEAT_SOURCE)).toBe(0);
    expect(runState.stats.resolve('damage', 1)).toBe(2);
  });

  it('destroy does not mutate the player, curve, or flags', () => {
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'yard' });
    const player = fakePlayer(30);
    const flags = readDebugFlags('?cheats=1&god=1&xp=4');
    const system = new DebugCheatSystem({
      runState,
      player: player as unknown as Player,
      flags,
      logger: { info: () => {} },
    });
    system.destroy();
    expect(player.health).toBe(30);
    expect(flags.godMode).toBe(true);
    expect(flags.xpMultiplier).toBe(4);
  });
});
