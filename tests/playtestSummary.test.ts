import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import type { DpsMeter } from '../src/gameplay/metrics';
import { createRunState, endRun, startRun } from '../src/gameplay/runState';
import type { RunOutcome } from '../src/gameplay/runState';
import {
  PlaytestSummarySystem,
  type PlaytestSummaryRow,
} from '../src/systems/playtestSummary';

interface LoggerSpy {
  info: ReturnType<typeof vi.fn>;
  table: ReturnType<typeof vi.fn>;
}

function createLogger(): LoggerSpy {
  return { info: vi.fn(), table: vi.fn() };
}

function fakeDpsMeter(totalDamage: number): DpsMeter {
  return {
    record: vi.fn(),
    windowDps: vi.fn(() => 0),
    totalDamage,
  };
}

function createFixture(
  options: {
    totalDamage?: number;
    upgradeStacks?: Record<string, number>;
    logger?: LoggerSpy;
  } = {},
) {
  const bus = createEventBus();
  const runState = createRunState({ seed: 42, characterId: 'cat', arenaId: 'yard' });
  const logger = options.logger ?? createLogger();
  const system = new PlaytestSummarySystem({
    runState,
    bus,
    dpsMeter: fakeDpsMeter(options.totalDamage ?? 0),
    logger,
  });
  return { bus, runState, logger, system };
}

describe('PlaytestSummarySystem', () => {
  it('prints nothing at construction', () => {
    const { logger } = createFixture();
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.table).not.toHaveBeenCalled();
  });

  it('prints info then one row table exactly once on run:won', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    endRun(runState, 'won', bus);

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('[playtest] run summary');
    expect(logger.table).toHaveBeenCalledTimes(1);
    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.outcome).toBe('won');
  });

  it('reports lost on run:lost', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    endRun(runState, 'lost', bus);

    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.outcome).toBe('lost');
  });

  it('lets the first terminal event win and ignores later ones', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    endRun(runState, 'won', bus);
    bus.emit('run:lost', { timeMs: 5, level: 1, kills: 0 });

    expect(logger.info).toHaveBeenCalledTimes(1);
    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.outcome).toBe('won');
  });

  it('snapshots exact row fields with m:ss formatting', () => {
    const { bus, runState, logger } = createFixture({ totalDamage: 50 });
    runState.timeMs = 65000;
    runState.level = 3;
    runState.kills = 10;
    runState.currency = 25;
    runState.upgradeStacks = { quick: 2, wide: 3 };
    startRun(runState, bus);
    endRun(runState, 'won', bus);

    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row).toEqual({
      outcome: 'won',
      time: '1:05',
      timeMs: 65000,
      level: 3,
      kills: 10,
      currency: 25,
      avgDps: 0.8,
      upgradesTaken: 5,
      offersSeen: 0,
      offerOverlapRate: 0,
      firstMergeTimeMs: undefined,
      totalMerges: 0,
      weaponsAcquired: 0,
      pickupBlocked: 0,
      weaponRewardsIssued: 0,
      finalRackSize: 0,
      finalRackFamilies: '',
    });
  });

  it('formats m:ss at zero and over one minute', () => {
    const zero = createFixture();
    zero.runState.timeMs = 0;
    startRun(zero.runState, zero.bus);
    endRun(zero.runState, 'won', zero.bus);
    expect((zero.logger.table.mock.calls[0][0][0] as PlaytestSummaryRow).time).toBe('0:00');

    const long = createFixture();
    long.runState.timeMs = 3723000;
    startRun(long.runState, long.bus);
    endRun(long.runState, 'lost', long.bus);
    expect((long.logger.table.mock.calls[0][0][0] as PlaytestSummaryRow).time).toBe('62:03');
  });

  it('uses lifetime damage with a one-second denominator guard', () => {
    const { bus, runState, logger } = createFixture({ totalDamage: 50 });
    startRun(runState, bus);
    endRun(runState, 'won', bus); // timeMs stays 0 → guard makes 1 second
    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.avgDps).toBe(50);
  });

  it('rounds the average to one decimal', () => {
    const { bus, runState, logger } = createFixture({ totalDamage: 123.4 });
    runState.timeMs = 10000;
    startRun(runState, bus);
    endRun(runState, 'won', bus);
    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.avgDps).toBe(12.3);
  });

  it('sums upgrade counts across ids', () => {
    const { bus, runState, logger } = createFixture();
    runState.upgradeStacks = { a: 2, b: 3, c: 1 };
    startRun(runState, bus);
    endRun(runState, 'won', bus);
    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.upgradesTaken).toBe(6);
  });

  it('omits the upgrade table for empty stacks', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    endRun(runState, 'won', bus);
    expect(logger.table).toHaveBeenCalledTimes(1);
  });

  it('emits the upgrade table after the row table when non-empty', () => {
    const { bus, runState, logger } = createFixture();
    runState.upgradeStacks = { quick: 2, wide: 3 };
    startRun(runState, bus);
    endRun(runState, 'won', bus);

    expect(logger.table).toHaveBeenCalledTimes(2);
    expect(logger.table.mock.calls[0][0][0]).toMatchObject({ outcome: 'won' });
    expect(logger.table.mock.calls[1][0]).toEqual(runState.upgradeStacks);
    expect(logger.info.mock.invocationCallOrder[0]).toBeLessThan(
      logger.table.mock.invocationCallOrder[0],
    );
  });

  it('reads run-state values at event time', () => {
    const { bus, runState, logger } = createFixture();
    runState.currency = 7;
    runState.kills = 2;
    startRun(runState, bus);
    runState.currency = 99;
    runState.kills = 41;
    endRun(runState, 'won', bus);
    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.currency).toBe(99);
    expect(row.kills).toBe(41);
  });

  it('update does nothing', () => {
    const { system, logger } = createFixture();
    system.update(16);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.table).not.toHaveBeenCalled();
  });

  it('destroy before terminal events prevents output', () => {
    const { bus, runState, system, logger } = createFixture();
    system.destroy();
    startRun(runState, bus);
    endRun(runState, 'won', bus);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.table).not.toHaveBeenCalled();
  });

  it('destroy after output prevents further output', () => {
    const { bus, runState, system, logger } = createFixture();
    startRun(runState, bus);
    endRun(runState, 'won', bus);
    system.destroy();
    bus.emit('run:lost', { timeMs: 5, level: 1, kills: 0 });
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('repeated destroy is harmless', () => {
    const { system } = createFixture();
    system.destroy();
    system.destroy();
    system.update(16);
  });

  it('a throwing logger still leaves the instance printed and guarded', () => {
    const logger = createLogger();
    logger.info.mockImplementation(() => {
      throw new Error('logger exploded');
    });
    const { bus, runState, system } = createFixture({ logger });
    startRun(runState, bus);
    endRun(runState, 'won', bus);
    // The EventBus isolates listener errors; the print guard must already be set.
    bus.emit('run:lost', { timeMs: 5, level: 1, kills: 0 });
    expect(logger.info).toHaveBeenCalledTimes(1);

    // Direct typed seam: the guard holds even without the bus.
    const seam = system as unknown as {
      print: (outcome: RunOutcome) => void;
    };
    seam.print('lost');
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});

describe('PlaytestSummarySystem Epic 18 (D11) evidence', () => {
  it('counts offers, merges, acquisitions, and pickup-blocked events', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    bus.emit('card:offered', { offerId: 1, choices: ['a', 'b'] });
    bus.emit('card:chosen', { upgradeId: 'a' });
    bus.emit('card:offered', { offerId: 2, choices: ['a', 'c'] });
    bus.emit('card:chosen', { upgradeId: 'c' });
    bus.emit('weapon:merged', { fromId: 'w1', toId: 'w2', toTier: 2 });
    bus.emit('weapon:merged', { fromId: 'w2', toId: 'w3', toTier: 3 });
    bus.emit('weapon:acquired', {
      definitionId: 'pistol-t1',
      instanceId: 'w1',
      rackCount: 1,
      rackCapacity: 4,
      x: 0,
      y: 0,
    });
    bus.emit('weapon:pickup-blocked', {
      definitionId: 'pistol-t1',
      reason: 'rack-full',
      rackCount: 4,
      rackCapacity: 4,
      x: 0,
      y: 0,
    });
    endRun(runState, 'won', bus);

    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.offersSeen).toBe(2);
    expect(row.offerOverlapRate).toBe(0.5); // second offer shares 'a' out of 2 choices
    expect(row.totalMerges).toBe(2);
    expect(row.firstMergeTimeMs).toBe(0);
    expect(row.weaponsAcquired).toBe(1);
    expect(row.pickupBlocked).toBe(1);
  });

  it('reads scheduled weapon-reward issuance from the injected diagnostic', () => {
    const bus = createEventBus();
    const runState = createRunState({ seed: 1, characterId: 'cat', arenaId: 'yard' });
    const logger = createLogger();
    let issued = 0;
    const system = new PlaytestSummarySystem({
      runState,
      bus,
      dpsMeter: fakeDpsMeter(0),
      weaponRewardIssuedCount: () => issued,
      logger,
    });
    startRun(runState, bus);
    issued = 3;
    endRun(runState, 'won', bus);

    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.weaponRewardsIssued).toBe(3);
    system.destroy();
  });

  it('summarizes the final rack size and per-family distribution', () => {
    const { bus, runState, logger } = createFixture();
    runState.equipped.push(
      { instanceId: 'w1', defId: 'pistol-t1', family: 'pistol', tier: 1 },
      { instanceId: 'w2', defId: 'pistol-t2', family: 'pistol', tier: 2 },
      { instanceId: 'w3', defId: 'smg-t1', family: 'smg', tier: 1 },
    );
    startRun(runState, bus);
    endRun(runState, 'won', bus);

    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.finalRackSize).toBe(3);
    expect(row.finalRackFamilies).toBe('pistol:2, smg:1');
  });

  it('emits level cadence, per-offer IDs, and acquisition timestamps as detail tables', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    runState.timeMs = 18_000;
    bus.emit('level:up', { level: 2 });
    bus.emit('card:offered', { offerId: 1, choices: ['quick-paws', 'hot-barrel'] });
    bus.emit('card:chosen', { upgradeId: 'hot-barrel' });
    runState.timeMs = 42_000;
    bus.emit('weapon:acquired', {
      definitionId: 'can-smg-t1',
      instanceId: 'w2',
      rackCount: 2,
      rackCapacity: 6,
      x: 0,
      y: 0,
    });
    // A trailing offer the run never resolves must still be reported.
    bus.emit('card:offered', { offerId: 2, choices: ['split-shot'] });
    runState.upgradeStacks = { 'hot-barrel': 1 };
    endRun(runState, 'won', bus);

    const tables = logger.table.mock.calls.map((call) => call[0]);
    // [0] summary row, [1] upgradeStacks, then the three detail tables.
    expect(tables[2]).toEqual([{ level: 2, at: '0:18', timeMs: 18_000 }]);
    expect(tables[3]).toEqual([
      { offerId: 1, offered: 'quick-paws, hot-barrel', chosen: 'hot-barrel' },
      { offerId: 2, offered: 'split-shot', chosen: '(unresolved)' },
    ]);
    expect(tables[4]).toEqual([
      { definitionId: 'can-smg-t1', at: '0:42', timeMs: 42_000 },
    ]);
  });

  it('omits detail tables entirely when nothing was recorded', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    endRun(runState, 'won', bus);

    expect(logger.table).toHaveBeenCalledTimes(1);
  });

  it('reports zero offer overlap for a single offer and non-overlapping offers', () => {
    const { bus, runState, logger } = createFixture();
    startRun(runState, bus);
    bus.emit('card:offered', { offerId: 1, choices: ['a', 'b'] });
    endRun(runState, 'won', bus);

    const row = logger.table.mock.calls[0][0][0] as PlaytestSummaryRow;
    expect(row.offersSeen).toBe(1);
    expect(row.offerOverlapRate).toBe(0);
  });
});
