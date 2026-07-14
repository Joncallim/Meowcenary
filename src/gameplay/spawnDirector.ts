import { createCadence, type Cadence } from '../engine/cadence';
import type { Rng } from '../engine/rng';
import type { Vec2 } from '../engine/vector';
import type { SpawnCurveDefinition, SpawnWaveDefinition } from '../systems/types';

export interface SpawnRequest {
  readonly enemyId: string;
  readonly pos: Vec2;
  readonly scheduledAtMs: number;
}

export interface SpawnDirectorContext {
  readonly activeCounts: Readonly<Record<string, number>>;
  readonly spawnPoint: (rng: Rng) => Vec2;
}

export interface SpawnDirector {
  readonly elapsedMs: number;
  update(dtMs: number, context: SpawnDirectorContext): SpawnRequest[];
}

interface WaveRuntime {
  readonly definition: Readonly<SpawnWaveDefinition>;
  readonly index: number;
  readonly cadence: Cadence;
  tickCount: number;
}

interface DueWindow {
  readonly runtime: WaveRuntime;
  nextTick: number;
  readonly endTick: number;
}

export function createSpawnDirector(curve: SpawnCurveDefinition, rng: Rng): SpawnDirector {
  const definition = snapshotCurve(curve);
  const durationMs = definition.durationSeconds * 1_000;
  const waves: WaveRuntime[] = definition.waves.map((wave, index) => ({
    definition: wave,
    index,
    cadence: createCadence(wave.spawnEveryMs),
    tickCount: 0,
  }));
  let elapsedMs = 0;

  return {
    get elapsedMs() {
      return elapsedMs;
    },

    update(dtMs, context) {
      if (!Number.isFinite(dtMs) || dtMs <= 0 || elapsedMs >= durationMs) return [];

      const previousMs = elapsedMs;
      elapsedMs = Math.min(durationMs, elapsedMs + dtMs);
      const due: DueWindow[] = [];

      for (const runtime of waves) {
        const startMs = runtime.definition.startSecond * 1_000;
        const activeStartMs = Math.max(previousMs, startMs);
        const activeEndMs = Math.max(activeStartMs, elapsedMs);
        const ticks = runtime.cadence.update(activeEndMs - activeStartMs);
        if (ticks > 0) {
          due.push({
            runtime,
            nextTick: runtime.tickCount + 1,
            endTick: runtime.tickCount + ticks,
          });
        }
        runtime.tickCount += ticks;
      }

      const activeCounts = new Map<string, number>();
      for (const runtime of waves) {
        const enemyId = runtime.definition.enemyId;
        if (activeCounts.has(enemyId)) continue;
        const supplied = context.activeCounts[enemyId];
        if (supplied !== undefined && (!Number.isSafeInteger(supplied) || supplied < 0)) {
          throw new Error(`Active count for "${enemyId}" must be a nonnegative safe integer`);
        }
        activeCounts.set(enemyId, supplied ?? 0);
      }

      const requests: SpawnRequest[] = [];
      while (true) {
        let next: { window: DueWindow; scheduledAtMs: number } | undefined;
        for (const window of due) {
          if (window.nextTick > window.endTick) continue;
          const { enemyId, maxAlive, startSecond, spawnEveryMs } = window.runtime.definition;
          if ((activeCounts.get(enemyId) ?? 0) >= maxAlive) {
            window.nextTick = window.endTick + 1;
            continue;
          }

          const scheduledAtMs = startSecond * 1_000 + window.nextTick * spawnEveryMs;
          if (scheduledAtMs >= durationMs) {
            window.nextTick = window.endTick + 1;
            continue;
          }
          if (
            !next ||
            scheduledAtMs < next.scheduledAtMs ||
            (scheduledAtMs === next.scheduledAtMs &&
              window.runtime.index < next.window.runtime.index)
          ) {
            next = { window, scheduledAtMs };
          }
        }
        if (!next) break;

        const { enemyId } = next.window.runtime.definition;
        const active = activeCounts.get(enemyId) ?? 0;

        const pos = context.spawnPoint(rng);
        if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
          throw new Error('Spawn point must contain finite coordinates');
        }
        requests.push({ enemyId, pos: { ...pos }, scheduledAtMs: next.scheduledAtMs });
        activeCounts.set(enemyId, active + 1);
        next.window.nextTick += 1;
      }

      return requests;
    },
  };
}

function snapshotCurve(curve: SpawnCurveDefinition): Readonly<SpawnCurveDefinition> {
  const snapshot = structuredClone(curve);
  if (!Number.isInteger(snapshot.durationSeconds) || snapshot.durationSeconds <= 0) {
    throw new Error('Spawn director duration must be a positive integer');
  }
  if (!Array.isArray(snapshot.waves) || snapshot.waves.length === 0) {
    throw new Error('Spawn director requires at least one wave');
  }

  const durationMs = snapshot.durationSeconds * 1_000;
  const seenEnemyIds = new Set<string>();
  let previousStartSecond = -1;
  let totalMaxAlive = 0;
  for (const [index, wave] of snapshot.waves.entries()) {
    if (
      typeof wave.enemyId !== 'string' ||
      wave.enemyId.length === 0 ||
      wave.enemyId.trim() !== wave.enemyId ||
      seenEnemyIds.has(wave.enemyId) ||
      !Number.isInteger(wave.startSecond) ||
      wave.startSecond < 0 ||
      wave.startSecond < previousStartSecond ||
      wave.startSecond >= snapshot.durationSeconds ||
      !Number.isInteger(wave.spawnEveryMs) ||
      wave.spawnEveryMs <= 0 ||
      !Number.isInteger(wave.maxAlive) ||
      wave.maxAlive <= 0 ||
      wave.maxAlive > 256 ||
      wave.startSecond * 1_000 + wave.spawnEveryMs >= durationMs
    ) {
      throw new Error('Spawn director received an invalid wave');
    }
    if (index === 0 && wave.startSecond !== 0) {
      throw new Error('Spawn director first wave must start at zero');
    }
    seenEnemyIds.add(wave.enemyId);
    previousStartSecond = wave.startSecond;
    totalMaxAlive += wave.maxAlive;
  }
  if (totalMaxAlive > 256) throw new Error('Spawn director active cap exceeds 256');

  return deepFreeze(snapshot);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
