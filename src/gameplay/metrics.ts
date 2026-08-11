/**
 * Pure rolling DPS meter (Epic 11 remainder §7). No Phaser, browser globals,
 * event bus, or scene imports.
 *
 * Samples are stamped with run-clock milliseconds (`RunState.timeMs`) so the
 * window pauses with the run. The meter is fail-soft: malformed, backdated,
 * or overflow-causing input is dropped without throwing from an event
 * listener. `totalDamage` is the lifetime accepted sum and never decreases
 * when the rolling window prunes.
 */

export interface DpsMeter {
  record(amount: number, atMs: number): void;
  windowDps(nowMs: number): number;
  readonly totalDamage: number;
}

interface DamageSample {
  readonly amount: number;
  readonly atMs: number;
}

export function createDpsMeter(windowMs = 5000): DpsMeter {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('DPS window must be a positive finite number');
  }

  let latestMs = 0;
  let rollingDamage = 0;
  let lifetimeDamage = 0;
  const samples: DamageSample[] = [];
  let head = 0;

  function prune(beforeMs: number): void {
    while (head < samples.length && samples[head].atMs < beforeMs) {
      rollingDamage -= samples[head].amount;
      head += 1;
    }
    // Compact only when the discarded prefix is materially large; compaction
    // never changes the retained samples or the rolling sum.
    if (head >= 256 && head * 2 >= samples.length) {
      samples.splice(0, head);
      head = 0;
    }
  }

  return {
    record(amount, atMs) {
      if (
        !Number.isFinite(amount) ||
        !Number.isFinite(atMs) ||
        amount < 0 ||
        atMs < 0 ||
        atMs < latestMs
      ) {
        return;
      }

      latestMs = atMs;
      prune(atMs - windowMs);
      if (amount === 0) {
        return;
      }
      if (
        !Number.isFinite(rollingDamage + amount) ||
        !Number.isFinite(lifetimeDamage + amount)
      ) {
        return;
      }

      samples.push({ amount, atMs });
      rollingDamage += amount;
      lifetimeDamage += amount;
    },

    windowDps(nowMs) {
      if (!Number.isFinite(nowMs) || nowMs < 0 || nowMs < latestMs) {
        return 0;
      }

      latestMs = nowMs;
      prune(nowMs - windowMs);
      const dps = rollingDamage / (windowMs / 1000);
      return dps === 0 ? 0 : dps;
    },

    get totalDamage() {
      return lifetimeDamage;
    },
  };
}
