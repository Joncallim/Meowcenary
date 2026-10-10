import type { HazardDefinition, ObstacleDefinition } from '../systems/types';

/** First contact along a swept centre segment. A raised block wins an exact
 * tie. Ground dressing never provides cover; player auto-fire remains clear. */
export function enemyProjectileImpact(ax: number, ay: number, bx: number, by: number, radius: number,
  playerX: number, playerY: number, playerRadius: number, obstacles: readonly ObstacleDefinition[]): 'cover' | 'player' | undefined {
  const dx = bx - ax; const dy = by - ay;
  let cover = Infinity;
  for (const r of obstacles) {
    if (!r.blocksEnemyProjectiles) continue;
    let enter = 0; let leave = 1;
    for (const [origin, delta, min, max] of [[ax, dx, r.x - radius, r.x + r.w + radius], [ay, dy, r.y - radius, r.y + r.h + radius]]) {
      if (delta === 0) { if (origin < min || origin > max) { enter = Infinity; break; } }
      else { const t1 = (min - origin) / delta; const t2 = (max - origin) / delta; enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2)); }
    }
    if (enter <= leave) cover = Math.min(cover, enter);
  }
  const px = ax - playerX; const py = ay - playerY; const rr = radius + playerRadius;
  const a = dx * dx + dy * dy; const b = 2 * (px * dx + py * dy); const c = px * px + py * py - rr * rr;
  const discriminant = b * b - 4 * a * c;
  const t = c <= 0 ? 0 : a > 0 && discriminant >= 0 ? (-b - Math.sqrt(discriminant)) / (2 * a) : Infinity;
  const player = t >= 0 && t <= 1 ? t : Infinity;
  return cover !== Infinity && cover <= player ? 'cover' : player !== Infinity ? 'player' : undefined;
}

export function hazardPhase(hazard: HazardDefinition, elapsedMs: number): 'safe' | 'warning' | 'active' {
  const pulse = hazard.pulse;
  if (!pulse) return 'active';
  const position = (Math.max(0, elapsedMs) + pulse.offsetMs) % (pulse.safeMs + pulse.warningMs + pulse.activeMs);
  return position < pulse.safeMs ? 'safe' : position < pulse.safeMs + pulse.warningMs ? 'warning' : 'active';
}

/** Integrate exact active time across boundaries and arbitrarily many cycles.
 * This prevents damage depending on the device's frame rate. */
export function hazardActiveDuration(hazard: HazardDefinition, startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  const pulse = hazard.pulse;
  if (!pulse) return endMs - startMs;
  const cycle = pulse.safeMs + pulse.warningMs + pulse.activeMs;
  const activeStart = pulse.safeMs + pulse.warningMs;
  const integral = (time: number): number => {
    const t = Math.max(0, time) + pulse.offsetMs;
    return Math.floor(t / cycle) * pulse.activeMs + Math.max(0, t % cycle - activeStart);
  };
  return integral(endMs) - integral(startMs);
}
