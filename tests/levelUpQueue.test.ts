import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../src/engine/eventBus';
import { PendingLevelUps } from '../src/gameplay/levelUpQueue';
import {
  createRunState,
  pauseRun,
  resumeRun,
  startRun,
} from '../src/gameplay/runState';
import { applyXp } from '../src/gameplay/xp';

describe('PendingLevelUps', () => {
  it('preserves every level in FIFO order', () => {
    const queue = new PendingLevelUps();

    expect(queue.enqueue(2)).toBe(true);
    expect(queue.enqueue(3)).toBe(false);
    expect(queue.enqueue(4)).toBe(false);
    expect(queue.pendingCount).toBe(3);
    expect(queue.current()).toBe(2);

    expect(queue.completeCurrent()).toBe(3);
    expect(queue.completeCurrent()).toBe(4);
    expect(queue.completeCurrent()).toBeUndefined();
    expect(queue.pendingCount).toBe(0);
  });

  it('rejects invalid levels and can be cleared on scene shutdown', () => {
    const queue = new PendingLevelUps();

    expect(() => queue.enqueue(Number.NaN)).toThrow(/positive integer/);
    expect(() => queue.enqueue(1.5)).toThrow(/positive integer/);
    expect(() => queue.enqueue(0)).toThrow(/positive integer/);

    queue.enqueue(2);
    queue.clear();
    expect(queue.current()).toBeUndefined();
    expect(queue.pendingCount).toBe(0);
  });

  it('keeps the real multi-level event flow paused until every level is acknowledged', () => {
    const queue = new PendingLevelUps();
    const bus = createEventBus();
    const runState = createRunState({ seed: 1, characterId: 'starter', arenaId: 'arena' });
    const chosen = vi.fn();

    bus.on('level:up', ({ level }) => {
      if (queue.enqueue(level)) {
        pauseRun(runState, bus, 'levelUp');
      }
    });
    bus.on('card:chosen', chosen);
    startRun(runState, bus);

    expect(applyXp(runState, 22, bus)).toBe(3);
    expect(runState.status).toBe('paused');
    expect(runState.pauseReason).toBe('levelUp');
    expect(queue.pendingCount).toBe(3);
    expect(queue.current()).toBe(2);

    const acknowledgeCurrent = (): boolean => {
      if (
        runState.status !== 'paused' ||
        runState.pauseReason !== 'levelUp' ||
        queue.current() === undefined
      ) {
        return false;
      }

      bus.emit('card:chosen', { upgradeId: 'placeholder-upgrade' });
      queue.completeCurrent();
      if (queue.pendingCount === 0) {
        resumeRun(runState, bus, 'levelUp');
      }
      return true;
    };

    expect(acknowledgeCurrent()).toBe(true);
    expect(queue.current()).toBe(3);
    expect(runState.status).toBe('paused');
    expect(acknowledgeCurrent()).toBe(true);
    expect(queue.current()).toBe(4);
    expect(runState.status).toBe('paused');
    expect(acknowledgeCurrent()).toBe(true);
    expect(queue.current()).toBeUndefined();
    expect(runState.status).toBe('active');
    expect(runState.pauseReason).toBeNull();
    expect(chosen).toHaveBeenCalledTimes(3);

    expect(acknowledgeCurrent()).toBe(false);
    expect(chosen).toHaveBeenCalledTimes(3);
  });
});
