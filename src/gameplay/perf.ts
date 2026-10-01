export interface PerfSnapshot {
  readonly sampleCount: number;
  readonly averageFrameMs: number;
  readonly averageFps: number;
  readonly overBudgetFrames: number;
  readonly overBudgetRatio: number;
}

export interface PerfOwnerDefinition {
  readonly name: string;
  /** Defaults to the frame budget; this is a reporting threshold, not an inferred owner target. */
  readonly budgetMs?: number;
}

export interface PerfDistributionSnapshot {
  readonly sampleCount: number;
  readonly averageMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
  readonly budgetMs: number;
  readonly overBudgetSamples: number;
  readonly overBudgetRatio: number;
}

export interface PerfDetailedSnapshot {
  readonly frame: PerfDistributionSnapshot;
  /** One independent window per registered owner, in registration order. */
  readonly owners: readonly (PerfDistributionSnapshot & { readonly name: string })[];
}

export interface PerfSampler {
  recordFrame(dtMs: number): void;
  /** Caller supplies elapsed time; unknown owners and invalid durations are ignored. Zero is valid. */
  recordOwner(name: string, elapsedMs: number): void;
  /** Cheap rolling aggregates for the per-frame HUD; never sorts sample windows. */
  snapshot(): PerfSnapshot;
  /** Explicit diagnostic read: copies and sorts windows using nearest-rank percentiles. */
  detailedSnapshot(): PerfDetailedSnapshot;
  reset(): void;
}

/** Opt-in only: ordinary production samplers allocate no owner windows. */
export const GAMEPLAY_PERF_OWNERS: readonly PerfOwnerDefinition[] = Object.freeze(
  ['input', 'stage', 'player', 'spawning', 'passives', 'hazards', 'weapons', 'drops', 'feedback', 'hud', 'audio']
    .map(name => Object.freeze({ name })),
);

const DEFAULT_TARGET_FPS = 60;
const DEFAULT_WINDOW_SIZE = 120;

function sanitize(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Fixed storage and constant-time recording; detailed reads alone allocate/sort. */
function createTimingWindow(windowSize: number, budgetMs: number) {
  const times = new Float64Array(windowSize);
  let index = 0;
  let count = 0;
  let sum = 0;
  let overBudgetCount = 0;

  return {
    record(durationMs: number): void {
      if (count === windowSize) {
        sum -= times[index];
        if (times[index] > budgetMs) overBudgetCount -= 1;
      } else {
        count += 1;
      }
      times[index] = durationMs;
      sum += durationMs;
      if (durationMs > budgetMs) overBudgetCount += 1;
      index = (index + 1) % windowSize;
    },
    snapshot(): PerfSnapshot {
      const averageFrameMs = count > 0 ? sanitize(sum / count) : 0;
      return {
        sampleCount: count,
        averageFrameMs,
        averageFps: sanitize(averageFrameMs > 0 ? 1000 / averageFrameMs : 0),
        overBudgetFrames: overBudgetCount,
        overBudgetRatio: count > 0 ? overBudgetCount / count : 0,
      };
    },
    detailedSnapshot(): PerfDistributionSnapshot {
      const sorted = count > 0 ? times.slice(0, count).sort() : undefined;
      const percentile = (fraction: number): number => sorted?.[Math.ceil(count * fraction) - 1] ?? 0;
      return {
        sampleCount: count,
        averageMs: count > 0 ? sanitize(sum / count) : 0,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        worstMs: sorted?.[count - 1] ?? 0,
        budgetMs,
        overBudgetSamples: overBudgetCount,
        overBudgetRatio: count > 0 ? overBudgetCount / count : 0,
      };
    },
    reset(): void {
      index = 0;
      count = 0;
      sum = 0;
      overBudgetCount = 0;
      times.fill(0);
    },
  };
}

export function createPerfSampler(
  windowSize = DEFAULT_WINDOW_SIZE,
  targetFps = DEFAULT_TARGET_FPS,
  ownerDefinitions: readonly PerfOwnerDefinition[] = [],
): PerfSampler {
  if (!Number.isFinite(windowSize) || !Number.isInteger(windowSize) || windowSize < 1) {
    throw new Error('PerfSampler windowSize must be a finite integer >= 1');
  }
  if (!Number.isFinite(targetFps) || targetFps <= 0) {
    throw new Error('PerfSampler targetFps must be finite and positive');
  }

  const budgetMs = 1000 / targetFps;
  const frame = createTimingWindow(windowSize, budgetMs);
  const owners = new Map<string, ReturnType<typeof createTimingWindow>>();
  for (const definition of ownerDefinitions) {
    if (!definition.name.trim() || owners.has(definition.name)) {
      throw new Error('PerfSampler owner names must be nonempty and unique');
    }
    const ownerBudgetMs = definition.budgetMs ?? budgetMs;
    if (!Number.isFinite(ownerBudgetMs) || ownerBudgetMs <= 0) {
      throw new Error('PerfSampler owner budgetMs must be finite and positive');
    }
    owners.set(definition.name, createTimingWindow(windowSize, ownerBudgetMs));
  }

  return {
    recordFrame(dtMs: number): void {
      if (Number.isFinite(dtMs) && dtMs > 0) frame.record(dtMs);
    },
    recordOwner(name: string, elapsedMs: number): void {
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0) owners.get(name)?.record(elapsedMs);
    },
    snapshot: () => frame.snapshot(),
    detailedSnapshot: () => ({
      frame: frame.detailedSnapshot(),
      owners: Array.from(owners, ([name, window]) => ({ name, ...window.detailedSnapshot() })),
    }),
    reset(): void {
      frame.reset();
      for (const window of owners.values()) window.reset();
    },
  };
}
