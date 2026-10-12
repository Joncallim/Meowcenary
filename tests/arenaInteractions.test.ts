import { describe, expect, it } from 'vitest';
import { enemyProjectileImpact, hazardActiveDuration, hazardPhase } from '../src/gameplay/arenaInteractions';
import type { HazardDefinition } from '../src/systems/types';
const cover = [{ id: 'raised', x: 80, y: 20, w: 40, h: 60, blocksEnemyProjectiles: true }];
const pulse: HazardDefinition = { id: 'heat', kind: 'heat', x: 0, y: 0, w: 64, h: 32, damagePerSecond: 10, pulse: { safeMs: 2400, warningMs: 900, activeMs: 1700, offsetMs: 0 } };
describe('raised cover and timed hazard rules', () => {
  it('sweeps fast hostile shots into cover before the player behind it', () => {
    expect(enemyProjectileImpact(0, 50, 300, 50, 6, 200, 50, 14, cover)).toBe('cover');
  });
  it('hits a player in front of cover first', () => {
    expect(enemyProjectileImpact(0, 50, 300, 50, 6, 40, 50, 14, cover)).toBe('player');
  });
  it('does not grant cover to decorative or low obstacles', () => {
    expect(enemyProjectileImpact(0, 50, 300, 50, 6, 200, 50, 14, [{ ...cover[0]!, blocksEnemyProjectiles: false }])).toBe('player');
    expect(enemyProjectileImpact(0, 120, 300, 120, 6, 200, 50, 14, cover)).toBeUndefined();
  });
  it('absorbs a shot originating in raised cover and handles stationary contact', () => {
    expect(enemyProjectileImpact(90, 50, 300, 50, 6, 200, 50, 14, cover)).toBe('cover');
    expect(enemyProjectileImpact(200, 50, 200, 50, 6, 200, 50, 14, cover)).toBe('player');
  });
  it('has safe, warning and active phases with exact boundaries', () => {
    expect([0, 2399, 2400, 3299, 3300, 4999, 5000].map(t => hazardPhase(pulse, t))).toEqual(['safe', 'safe', 'warning', 'warning', 'active', 'active', 'safe']);
  });
  it('integrates damage across phase boundaries independent of update slices', () => {
    expect(hazardActiveDuration(pulse, 3200, 3500)).toBe(200);
    expect(hazardActiveDuration(pulse, 0, 10000)).toBe(3400);
    let duration = 0;
    for (let t = 0; t < 10000; t += 10) duration += hazardActiveDuration(pulse, t, t + 10);
    expect(duration).toBe(hazardActiveDuration(pulse, 0, 10000));
  });
});
