import type { Rng } from '../engine/rng';

/**
 * Shared pure curve helpers (Epic 11 §4). One definition for lerp/clamp/
 * growth/linearGrowth/weightedPick; the existing scalers (costOf, scaleEnemy,
 * xpToNext, spawn-region clamping) route through them with byte-identical
 * outputs. Strict finite guards — inputs and results — match the repo's
 * gameplay style (enemyScaling, stats.resolve throw on non-finite).
 */

export function lerp(a: number, b: number, t: number): number {
  requireFinite('lerp', a);
  requireFinite('lerp', b);
  requireFinite('lerp', t);
  const result = a + (b - a) * t;
  if (!Number.isFinite(result)) {
    throw new Error('Curve lerp result must be finite');
  }
  return result;
}

export function clamp(value: number, min: number, max: number): number {
  requireFinite('clamp', value);
  requireFinite('clamp', min);
  requireFinite('clamp', max);
  if (min > max) {
    throw new Error('Curve clamp min must not exceed max');
  }
  return Math.min(max, Math.max(min, value));
}

export function growth(base: number, rate: number, step: number): number {
  requireFinite('growth', base);
  requireFinite('growth', rate);
  requireFinite('growth', step);
  const result = base * rate ** step;
  if (!Number.isFinite(result)) {
    throw new Error('Curve growth result must be finite');
  }
  return result;
}

export function linearGrowth(base: number, ratePerStep: number, steps: number): number {
  requireFinite('linearGrowth', base);
  requireFinite('linearGrowth', ratePerStep);
  requireFinite('linearGrowth', steps);
  const result = base * (1 + ratePerStep * steps);
  if (!Number.isFinite(result)) {
    throw new Error('Curve linearGrowth result must be finite');
  }
  return result;
}

export function weightedPick<T>(
  entries: ReadonlyArray<{ item: T; weight: number }>,
  rng: Rng,
): T {
  // Thin delegate to rng.weighted (Epic 11 §4): zero/negative weights and
  // empty selections keep the existing Rng error behavior, so Rng is the
  // single validation surface and no finite-weight guard is added here.
  // Deliberately no production callers yet — the export exists so future
  // balance tables read as curve helpers and call sites stay uniform.
  return rng.weighted(entries);
}

function requireFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Curve ${name} inputs must be finite`);
  }
}
