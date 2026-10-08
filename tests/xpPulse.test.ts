import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { createRunState, pauseRun, startRun } from '../src/gameplay/runState';
import { applyXp, withActivatedXpPulse } from '../src/gameplay/xp';

function setup() {
  const run = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
  const bus = createEventBus();
  startRun(run);
  return { run, bus };
}

describe('activated XP pulse grant scope', () => {
  it.each(['manual', 'levelUp', 'intro', 'won', 'lost'] as const)(
    'does not issue a grant capability when entry state is %s', (state) => {
      const { run, bus } = setup();
      if (state === 'manual' || state === 'levelUp') pauseRun(run, bus, state);
      else run.status = state;
      const collect = vi.fn();
      expect(withActivatedXpPulse(run, bus, collect)).toBeUndefined();
      expect(collect).not.toHaveBeenCalled();
      expect(run.xp).toBe(0);
    },
  );

  it.each(['return', 'throw'] as const)('revokes a retained grant on callback %s', (exit) => {
    const { run, bus } = setup();
    let retained!: (amount: number) => number;
    const collect = () => withActivatedXpPulse(run, bus, (grant) => {
      retained = grant;
      grant(1);
      if (exit === 'throw') throw new Error('collection interrupted');
      return 17;
    });
    if (exit === 'throw') expect(collect).toThrow('collection interrupted');
    else expect(collect()).toBe(17);
    expect(run.xp).toBe(1);
    expect(retained(2)).toBe(0);
    expect(run.xp).toBe(1);
  });

  it('continues its own level-up grants without admitting ordinary paused XP', () => {
    const { run, bus } = setup();
    const events: string[] = [];
    bus.on('xp:gained', ({ amount }) => events.push(`xp:${amount}`));
    bus.on('level:up', ({ level }) => {
      events.push(`level:${level}`);
      pauseRun(run, bus, 'levelUp');
    });
    const resumed = vi.fn();
    bus.on('run:resumed', resumed);
    withActivatedXpPulse(run, bus, (grant) => {
      expect(grant(5)).toBe(1);
      expect(run.status).toBe('paused');
      expect(applyXp(run, 99, bus)).toBe(0);
      expect(grant(8)).toBe(1);
    });
    expect(events).toEqual(['xp:5', 'level:2', 'xp:8', 'level:3']);
    expect(run.level).toBe(3);
    expect(run.xp).toBe(1);
    expect(run.status).toBe('paused');
    expect(run.pauseReason).toBe('levelUp');
    expect(resumed).not.toHaveBeenCalled();
  });

  it.each(['manual', 'won', 'lost'] as const)('rejects later XP after continuation changes to %s', (state) => {
    const { run, bus } = setup();
    const gained = vi.fn();
    bus.on('xp:gained', gained);
    withActivatedXpPulse(run, bus, (grant) => {
      grant(1);
      if (state === 'manual') pauseRun(run, bus, 'manual');
      else run.status = state;
      expect(grant(99)).toBe(0);
    });
    expect(run.level).toBe(1);
    expect(run.xp).toBe(1);
    expect(gained).toHaveBeenCalledOnce();
  });
});
