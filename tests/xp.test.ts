import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState, startRun } from '../src/gameplay/runState';
import { applyXp, xpToNext } from '../src/gameplay/xp';

describe('xp helpers', () => {
  it('returns a tunable increasing XP threshold', () => {
    expect(xpToNext(1)).toBe(5);
    expect(xpToNext(2)).toBeGreaterThan(xpToNext(1));
    expect(xpToNext(0)).toBe(xpToNext(1));
  });

  it('applies XP and emits gained events', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    const bus = createEventBus();
    const gained = vi.fn();
    bus.on('xp:gained', gained);
    startRun(runState);

    expect(applyXp(runState, 2, bus)).toBe(0);

    expect(runState.xp).toBe(2);
    expect(gained).toHaveBeenCalledWith({ amount: 2, total: 2 });
  });

  it('supports multi-level gains and emits once per level', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    const bus = createEventBus();
    const levelUp = vi.fn();
    bus.on('level:up', levelUp);
    startRun(runState);

    expect(applyXp(runState, 22, bus)).toBe(3);

    expect(runState.level).toBe(4);
    expect(levelUp).toHaveBeenNthCalledWith(1, { level: 2 });
    expect(levelUp).toHaveBeenNthCalledWith(2, { level: 3 });
    expect(levelUp).toHaveBeenNthCalledWith(3, { level: 4 });
  });

  it('multiplies incoming XP by xpGain', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    runState.stats.add({ stat: 'xpGain', op: 'mult', value: 2, sourceId: 'test' });
    startRun(runState);

    applyXp(runState, 2);

    expect(runState.xp).toBe(4);
  });

  it('does not subtract or corrupt XP when the resolved gain is unusable', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    const bus = createEventBus();
    const gained = vi.fn();
    bus.on('xp:gained', gained);
    runState.stats.add({ stat: 'xpGain', op: 'mult', value: -1, sourceId: 'invalid' });
    startRun(runState);

    expect(applyXp(runState, 2, bus)).toBe(0);
    expect(runState.xp).toBe(0);
    expect(gained).not.toHaveBeenCalled();
  });

  it('no-ops when the run is not active', () => {
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });

    expect(applyXp(runState, 99)).toBe(0);
    expect(runState.xp).toBe(0);
  });
});
