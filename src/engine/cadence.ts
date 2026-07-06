export interface Cadence {
  update(dtMs: number): number;
  setInterval(intervalMs: number): void;
  reset(): void;
}

export function createCadence(intervalMs: number): Cadence {
  let currentIntervalMs = validateInterval(intervalMs);
  let accumulatedMs = 0;

  return {
    update(dtMs) {
      if (!Number.isFinite(dtMs) || dtMs <= 0) {
        return 0;
      }

      accumulatedMs += dtMs;
      const ticks = Math.floor(accumulatedMs / currentIntervalMs);
      accumulatedMs -= ticks * currentIntervalMs;
      return ticks;
    },

    setInterval(nextIntervalMs) {
      currentIntervalMs = validateInterval(nextIntervalMs);
    },

    reset() {
      accumulatedMs = 0;
    },
  };
}

function validateInterval(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error('Cadence interval must be a positive number');
  }

  return intervalMs;
}
