export interface Cadence {
  update(dtMs: number): number;
  reset(): void;
}

export function createCadence(intervalMs: number): Cadence {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('Cadence interval must be a positive number');
  }

  let accumulatedMs = 0;

  return {
    update(dtMs) {
      if (!Number.isFinite(dtMs) || dtMs <= 0) {
        return 0;
      }

      accumulatedMs += dtMs;
      const ticks = Math.floor(accumulatedMs / intervalMs);
      accumulatedMs -= ticks * intervalMs;
      return ticks;
    },

    reset() {
      accumulatedMs = 0;
    },
  };
}

