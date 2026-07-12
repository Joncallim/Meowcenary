import { describe, expect, it } from 'vitest';
import { PendingLevelUps } from '../src/gameplay/levelUpQueue';

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
});
