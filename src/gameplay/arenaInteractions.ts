import type { HazardDefinition, ObstacleDefinition } from '../systems/types';

/** First contact along a swept centre segment. A raised block wins an exact
 * tie. Ground dressing never provides cover; player auto-fire remains clear. */
export function enemyProjectileImpact(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
  playerX: number,
  playerY: number,
  playerRadius: number,
  obstacles: readonly ObstacleDefinition[],
): 'cover' | 'player' | undefined {
  const dx = bx - ax;
  const dy = by - ay;
  let cover = Infinity;
  for (const obstacle of obstacles) {
    if (!obstacle.blocksEnemyProjectiles) continue;
    const contact = segmentBoxContact(
      ax,
      ay,
      dx,
      dy,
      obstacle.x - radius,
      obstacle.y - radius,
      obstacle.x + obstacle.w + radius,
      obstacle.y + obstacle.h + radius,
    );
    cover = Math.min(cover, contact);
  }
  const px = ax - playerX;
  const py = ay - playerY;
  const rr = radius + playerRadius;
  const a = dx * dx + dy * dy;
  const b = 2 * (px * dx + py * dy);
  const c = px * px + py * py - rr * rr;
  const discriminant = b * b - 4 * a * c;
  const t =
    c <= 0
      ? 0
      : a > 0 && discriminant >= 0
        ? (-b - Math.sqrt(discriminant)) / (2 * a)
        : Infinity;
  const player = t >= 0 && t <= 1 ? t : Infinity;
  return cover !== Infinity && cover <= player
    ? 'cover'
    : player !== Infinity
      ? 'player'
      : undefined;
}

export function hazardPhase(
  hazard: HazardDefinition,
  elapsedMs: number,
): 'safe' | 'warning' | 'active' {
  const pulse = hazard.pulse;
  if (!pulse) return 'active';
  const position =
    (Math.max(0, elapsedMs) + pulse.offsetMs) %
    (pulse.safeMs + pulse.warningMs + pulse.activeMs);
  return position < pulse.safeMs
    ? 'safe'
    : position < pulse.safeMs + pulse.warningMs
      ? 'warning'
      : 'active';
}

/** Integrate exact active time across boundaries and arbitrarily many cycles.
 * This prevents damage depending on the device's frame rate. */
export function hazardActiveDuration(
  hazard: HazardDefinition,
  startMs: number,
  endMs: number,
): number {
  if (endMs <= startMs) return 0;
  const pulse = hazard.pulse;
  if (!pulse) return endMs - startMs;
  const cycle = pulse.safeMs + pulse.warningMs + pulse.activeMs;
  const activeStart = pulse.safeMs + pulse.warningMs;
  const integral = (time: number): number => {
    const t = Math.max(0, time) + pulse.offsetMs;
    return (
      Math.floor(t / cycle) * pulse.activeMs +
      Math.max(0, (t % cycle) - activeStart)
    );
  };
  return integral(endMs) - integral(startMs);
}

/** Scalar slab intersection keeps pooled hostile-shot updates allocation-free. */
function segmentBoxContact(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  let enter = 0;
  let leave = 1;
  if (dx === 0) {
    if (ax < minX || ax > maxX) return Infinity;
  } else {
    const first = (minX - ax) / dx;
    const second = (maxX - ax) / dx;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
  }
  if (dy === 0) {
    if (ay < minY || ay > maxY) return Infinity;
  } else {
    const first = (minY - ay) / dy;
    const second = (maxY - ay) / dy;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
  }
  return enter <= leave ? enter : Infinity;
}
