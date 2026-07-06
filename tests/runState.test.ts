import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import {
  createRunState,
  endRun,
  pauseRun,
  resumeRun,
  startRun,
  tickRun,
} from '../src/gameplay/runState';

describe('RunState', () => {
  it('creates intro run state with initial progression values', () => {
    const runState = createRunState({ seed: 42, characterId: 'starter', arenaId: 'junkyard' });

    expect(runState.status).toBe('intro');
    expect(runState.seed).toBe(42);
    expect(runState.level).toBe(1);
    expect(runState.xp).toBe(0);
    expect(runState.kills).toBe(0);
    expect(runState.pauseReason).toBeNull();
  });

  it('starts, pauses, and resumes with events', () => {
    const runState = createRunState({ seed: 42, characterId: 'starter', arenaId: 'junkyard' });
    const bus = createEventBus();
    const started = vi.fn();
    const paused = vi.fn();
    const resumed = vi.fn();
    bus.on('run:start', started);
    bus.on('run:paused', paused);
    bus.on('run:resumed', resumed);

    startRun(runState, bus);
    pauseRun(runState, bus);
    resumeRun(runState, bus, 'manual');

    expect(runState.status).toBe('active');
    expect(runState.pauseReason).toBeNull();
    expect(started).toHaveBeenCalledWith({
      characterId: 'starter',
      arenaId: 'junkyard',
      seed: 42,
    });
    expect(paused).toHaveBeenCalledWith({});
    expect(resumed).toHaveBeenCalledWith({});
  });

  it('tracks pause reasons and clears them on matching resume', () => {
    const manual = createRunState({ seed: 42, characterId: 'starter', arenaId: 'junkyard' });
    const levelUp = createRunState({ seed: 43, characterId: 'starter', arenaId: 'junkyard' });
    startRun(manual);
    startRun(levelUp);

    pauseRun(manual, undefined, 'manual');
    pauseRun(levelUp, undefined, 'levelUp');

    expect(manual.pauseReason).toBe('manual');
    expect(levelUp.pauseReason).toBe('levelUp');

    resumeRun(manual, undefined, 'manual');

    expect(manual.status).toBe('active');
    expect(manual.pauseReason).toBeNull();
  });

  it('does not resume a level-up pause through a manual resume', () => {
    const runState = createRunState({ seed: 42, characterId: 'starter', arenaId: 'junkyard' });
    startRun(runState);
    pauseRun(runState, undefined, 'levelUp');

    resumeRun(runState, undefined, 'manual');

    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
  });

  it('does not use startRun as a generic paused-run resume', () => {
    const runState = createRunState({ seed: 42, characterId: 'starter', arenaId: 'junkyard' });
    startRun(runState);
    pauseRun(runState, undefined, 'levelUp');

    startRun(runState);

    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
  });

  it('ticks only while active', () => {
    const runState = createRunState({ seed: 42, characterId: 'starter', arenaId: 'junkyard' });

    tickRun(runState, 1000);
    startRun(runState);
    tickRun(runState, 1000);
    pauseRun(runState);
    tickRun(runState, 1000);

    expect(runState.timeMs).toBe(1000);
  });

  it('ends active runs as won or lost', () => {
    const won = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    const lost = createRunState({ seed: 2, characterId: 'starter', arenaId: 'arena' });
    const bus = createEventBus();
    const wonListener = vi.fn();
    const lostListener = vi.fn();
    bus.on('run:won', wonListener);
    bus.on('run:lost', lostListener);
    startRun(won);
    startRun(lost);
    won.kills = 2;
    lost.level = 3;

    endRun(won, 'won', bus);
    endRun(lost, 'lost', bus);

    expect(won.status).toBe('won');
    expect(won.outcome).toBe('won');
    expect(lost.status).toBe('lost');
    expect(lost.outcome).toBe('lost');
    expect(wonListener).toHaveBeenCalledWith({ timeMs: 0, level: 1, kills: 2 });
    expect(lostListener).toHaveBeenCalledWith({ timeMs: 0, level: 3, kills: 0 });
  });

  it('ignores illegal transitions', () => {
    const runState = createRunState({ seed: 42, characterId: 'starter', arenaId: 'junkyard' });

    pauseRun(runState);
    endRun(runState, 'lost');
    startRun(runState);
    endRun(runState, 'won');
    pauseRun(runState);
    resumeRun(runState);

    expect(runState.status).toBe('won');
    expect(runState.outcome).toBe('won');
  });
});
