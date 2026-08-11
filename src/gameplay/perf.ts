export interface PerfSnapshot {
  readonly sampleCount: number;
  readonly averageFrameMs: number;
  readonly averageFps: number;
  readonly overBudgetFrames: number;
  readonly overBudgetRatio: number;
}

export interface PerfSampler {
  recordFrame(dtMs: number): void;
  snapshot(): PerfSnapshot;
  reset(): void;
}

const DEFAULT_TARGET_FPS = 60;
const DEFAULT_WINDOW_SIZE = 120;

function sanitize(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function createPerfSampler(
  windowSize = DEFAULT_WINDOW_SIZE,
  targetFps = DEFAULT_TARGET_FPS,
): PerfSampler {
  if (!Number.isFinite(windowSize) || !Number.isInteger(windowSize) || windowSize < 1) {
    throw new Error('PerfSampler windowSize must be a finite integer >= 1');
  }
  if (!Number.isFinite(targetFps) || targetFps <= 0) {
    throw new Error('PerfSampler targetFps must be finite and positive');
  }

  const times = new Float64Array(windowSize);
  const slowFlags = new Uint8Array(windowSize);
  const budgetMs = 1000 / targetFps;

  let index = 0;
  let count = 0;
  let sum = 0;
  let overBudgetCount = 0;

  return {
    recordFrame(dtMs: number): void {
      if (!Number.isFinite(dtMs) || dtMs <= 0) {
        return;
      }

      const isOverBudget = dtMs > budgetMs;
      const slot = index % windowSize;
      if (count < windowSize) {
        times[slot] = dtMs;
        slowFlags[slot] = isOverBudget ? 1 : 0;
        sum += dtMs;
        if (isOverBudget) overBudgetCount += 1;
        count += 1;
      } else {
        const oldTime = times[slot];
        const oldSlow = slowFlags[slot];
        sum -= oldTime;
        if (oldSlow) overBudgetCount -= 1;

        times[slot] = dtMs;
        slowFlags[slot] = isOverBudget ? 1 : 0;
        sum += dtMs;
        if (isOverBudget) overBudgetCount += 1;
      }
      index = (index + 1) % windowSize;
    },

    snapshot(): PerfSnapshot {
      if (count === 0) {
        return {
          sampleCount: 0,
          averageFrameMs: 0,
          averageFps: 0,
          overBudgetFrames: 0,
          overBudgetRatio: 0,
        };
      }

      const averageFrameMs = sanitize(sum / count);
      const averageFps = sanitize(averageFrameMs > 0 ? 1000 / averageFrameMs : 0);
      return {
        sampleCount: count,
        averageFrameMs,
        averageFps,
        overBudgetFrames: overBudgetCount,
        overBudgetRatio: sanitize(overBudgetCount / count),
      };
    },

    reset(): void {
      index = 0;
      count = 0;
      sum = 0;
      overBudgetCount = 0;
      times.fill(0);
      slowFlags.fill(0);
    },
  };
}
