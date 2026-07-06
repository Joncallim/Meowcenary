import { distanceSq, type Vec2 } from '../engine/vector';

export interface Target {
  id: number | string;
  x: number;
  y: number;
  active: boolean;
}

export function nearestTarget<T extends Target>(
  origin: Vec2,
  targets: readonly T[],
  range: number,
): T | null {
  if (!Number.isFinite(range) || range <= 0) {
    return null;
  }

  const maxDistanceSq = range * range;
  let best: T | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const target of targets) {
    if (!target.active) {
      continue;
    }

    const candidateDistanceSq = distanceSq(origin, target);
    if (candidateDistanceSq <= maxDistanceSq && candidateDistanceSq < bestDistanceSq) {
      best = target;
      bestDistanceSq = candidateDistanceSq;
    }
  }

  return best;
}
