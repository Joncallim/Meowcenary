import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import {
  createSpawnDirector,
  type SpawnDirectorContext,
  type SpawnRequest,
} from '../src/gameplay/spawnDirector';
import type { SpawnCurveDefinition, SpawnWaveDefinition } from '../src/systems/types';

function curve(
  waves: SpawnWaveDefinition[],
  durationSeconds = 10,
): SpawnCurveDefinition {
  return {
    id: 'test-curve',
    durationSeconds,
    scaling: { healthPerMinute: 0.1, damagePerMinute: 0.1 },
    waves,
  };
}

function context(activeCounts: Record<string, number> = {}): SpawnDirectorContext {
  return {
    activeCounts,
    spawnPoint: (rng) => ({ x: rng.int(0, 1_000), y: rng.int(0, 1_000) }),
  };
}

describe('createSpawnDirector', () => {
  it('emits chronological requests with JSON order as the tie breaker', () => {
    const director = createSpawnDirector(
      curve([
        { startSecond: 0, enemyId: 'slow-layer', spawnEveryMs: 200, maxAlive: 10 },
        { startSecond: 0, enemyId: 'fast-layer', spawnEveryMs: 100, maxAlive: 10 },
      ]),
      createRng(1),
    );

    expect(director.update(99, context())).toEqual([]);
    const first = director.update(101, context());

    expect(first.map(({ enemyId, scheduledAtMs }) => ({ enemyId, scheduledAtMs }))).toEqual([
      { enemyId: 'fast-layer', scheduledAtMs: 100 },
      { enemyId: 'slow-layer', scheduledAtMs: 200 },
      { enemyId: 'fast-layer', scheduledAtMs: 200 },
    ]);
    expect(director.elapsedMs).toBe(200);
  });

  it('respects active and same-update maxAlive counts without backlog bursts', () => {
    const director = createSpawnDirector(
      curve([{ startSecond: 0, enemyId: 'mite', spawnEveryMs: 100, maxAlive: 2 }]),
      createRng(2),
    );

    expect(director.update(300, context({ mite: 1 }))).toHaveLength(1);
    const afterCapacityReturns = director.update(100, context({ mite: 0 }));
    expect(afterCapacityReturns).toHaveLength(1);
    expect(afterCapacityReturns[0].scheduledAtMs).toBe(400);
  });

  it('starts wave cadence only after its configured start time', () => {
    const director = createSpawnDirector(
      curve([
        { startSecond: 0, enemyId: 'opening', spawnEveryMs: 2_000, maxAlive: 1 },
        { startSecond: 1, enemyId: 'later', spawnEveryMs: 100, maxAlive: 3 },
      ]),
      createRng(3),
    );

    expect(director.update(1_050, context())).toEqual([]);
    expect(director.update(49, context())).toEqual([]);
    expect(director.update(1, context()).map((request) => request.scheduledAtMs)).toEqual([1_100]);
  });

  it('is chunk-invariant and deterministic for the same injected seed', () => {
    const definition = curve([
      { startSecond: 0, enemyId: 'a', spawnEveryMs: 100, maxAlive: 20 },
      { startSecond: 1, enemyId: 'b', spawnEveryMs: 250, maxAlive: 20 },
    ]);
    const single = createSpawnDirector(definition, createRng(99));
    const chunked = createSpawnDirector(definition, createRng(99));

    const singleRequests = single.update(1_500, context());
    const chunkedRequests: SpawnRequest[] = [];
    for (const dtMs of [90, 410, 501, 499]) {
      chunkedRequests.push(...chunked.update(dtMs, context()));
    }

    expect(chunkedRequests).toEqual(singleRequests);
  });

  it('never schedules a spawn at or after the curve end', () => {
    const director = createSpawnDirector(
      curve([{ startSecond: 0, enemyId: 'mite', spawnEveryMs: 100, maxAlive: 20 }], 1),
      createRng(4),
    );

    const requests = director.update(5_000, context());
    expect(requests).toHaveLength(9);
    expect(requests.at(-1)?.scheduledAtMs).toBe(900);
    expect(director.elapsedMs).toBe(1_000);
    expect(director.update(100, context())).toEqual([]);
  });

  it('bounds high-frequency catch-up work by maxAlive capacity', () => {
    const director = createSpawnDirector(
      curve([{ startSecond: 0, enemyId: 'mite', spawnEveryMs: 1, maxAlive: 2 }], 2),
      createRng(4),
    );

    const requests = director.update(2_000, context());
    expect(requests.map((request) => request.scheduledAtMs)).toEqual([1, 2]);
    expect(director.elapsedMs).toBe(2_000);
  });

  it('does not advance for invalid or stopped time', () => {
    const director = createSpawnDirector(
      curve([{ startSecond: 0, enemyId: 'mite', spawnEveryMs: 100, maxAlive: 2 }]),
      createRng(5),
    );

    expect(director.update(Number.NaN, context())).toEqual([]);
    expect(director.update(-10, context())).toEqual([]);
    expect(director.elapsedMs).toBe(0);
    expect(director.update(100, context())).toHaveLength(1);
  });

  it('owns an immutable schedule snapshot after construction', () => {
    const source = curve([
      { startSecond: 0, enemyId: 'original', spawnEveryMs: 100, maxAlive: 2 },
    ]);
    const director = createSpawnDirector(source, createRng(6));
    source.waves[0].enemyId = 'mutated';
    source.waves[0].spawnEveryMs = 1;
    source.waves[0].maxAlive = 99;

    const requests = director.update(100, context());
    expect(requests).toHaveLength(1);
    expect(requests[0].enemyId).toBe('original');
    expect(requests[0].scheduledAtMs).toBe(100);
  });

  it('validates and schedules from one stable accessor snapshot', () => {
    const source = curve([
      { startSecond: 0, enemyId: 'stable', spawnEveryMs: 100, maxAlive: 1 },
    ]);
    let durationReads = 0;
    Object.defineProperty(source, 'durationSeconds', {
      enumerable: true,
      get() {
        durationReads += 1;
        return durationReads === 1 ? 10 : Number.NaN;
      },
    });

    const director = createSpawnDirector(source, createRng(6));
    expect(director.update(100, context())).toHaveLength(1);
    expect(durationReads).toBe(1);
  });

  it('rejects invalid direct curves and non-finite spawn points', () => {
    expect(() =>
      createSpawnDirector(
        curve([{ startSecond: 1, enemyId: 'late', spawnEveryMs: 100, maxAlive: 1 }]),
        createRng(7),
      ),
    ).toThrow();
    expect(() =>
      createSpawnDirector(
        curve([
          { startSecond: 0, enemyId: 'same', spawnEveryMs: 100, maxAlive: 1 },
          { startSecond: 1, enemyId: 'same', spawnEveryMs: 100, maxAlive: 1 },
        ]),
        createRng(7),
      ),
    ).toThrow();

    const director = createSpawnDirector(
      curve([{ startSecond: 0, enemyId: 'mite', spawnEveryMs: 100, maxAlive: 1 }]),
      createRng(7),
    );
    expect(() =>
      director.update(100, {
        activeCounts: {},
        spawnPoint: () => ({ x: Number.NaN, y: 0 }),
      }),
    ).toThrow();

    const invalidCounts = createSpawnDirector(
      curve([{ startSecond: 0, enemyId: 'mite', spawnEveryMs: 100, maxAlive: 1 }]),
      createRng(7),
    );
    expect(() => invalidCounts.update(100, context({ mite: Number.NaN }))).toThrow();
  });
});
