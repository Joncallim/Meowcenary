import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/engine/pool';

interface Poolable {
  value: number;
  resetCount: number;
}

function createPoolable(): Poolable {
  return { value: 0, resetCount: 0 };
}

function resetPoolable(item: Poolable): void {
  item.value = 0;
  item.resetCount += 1;
}

describe('createPool', () => {
  it('calls the factory once on first acquire and reports one active', () => {
    const factory = vi.fn(createPoolable);
    const pool = createPool(factory, resetPoolable);

    const item = pool.acquire();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(pool.active()).toBe(1);
    expect(item).toBeDefined();
  });

  it('grows the pool and tracks active count across multiple acquires', () => {
    const factory = vi.fn(createPoolable);
    const pool = createPool(factory, resetPoolable);

    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();

    expect(factory).toHaveBeenCalledTimes(3);
    expect(pool.active()).toBe(3);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it('reports zero active on a fresh pool', () => {
    const pool = createPool(createPoolable, resetPoolable);
    expect(pool.active()).toBe(0);
  });

  it('invokes reset exactly once and decrements active on release', () => {
    const reset = vi.fn(resetPoolable);
    const pool = createPool(createPoolable, reset);
    const item = pool.acquire();

    pool.release(item);

    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledWith(item);
    expect(pool.active()).toBe(0);
  });

  it('reuses the exact released object without a new factory call', () => {
    const factory = vi.fn(createPoolable);
    const pool = createPool(factory, resetPoolable);
    const item = pool.acquire();

    pool.release(item);
    const reused = pool.acquire();

    expect(reused).toBe(item);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(pool.active()).toBe(1);
  });

  it('reuses in LIFO order when multiple items are released', () => {
    const pool = createPool(createPoolable, resetPoolable);
    const first = pool.acquire();
    const second = pool.acquire();

    pool.release(first);
    pool.release(second);
    const reused = pool.acquire();

    expect(reused).toBe(second);
    expect(pool.active()).toBe(1);
  });

  it('throws on double release and does not call reset twice', () => {
    const reset = vi.fn(resetPoolable);
    const pool = createPool(createPoolable, reset);
    const item = pool.acquire();

    pool.release(item);
    expect(() => pool.release(item)).toThrow('Cannot release an item that is not active in this pool');
    expect(reset).toHaveBeenCalledTimes(1);
    expect(pool.active()).toBe(0);
  });

  it('throws when releasing a foreign object', () => {
    const pool = createPool(createPoolable, resetPoolable);
    pool.acquire();

    expect(() => pool.release(createPoolable())).toThrow('Cannot release an item that is not active in this pool');
  });

  it('keeps the item leased when reset throws', () => {
    const reset = vi.fn(() => {
      throw new Error('reset failure');
    });
    const pool = createPool(createPoolable, reset);
    const item = pool.acquire();

    expect(() => pool.release(item)).toThrow('reset failure');
    expect(pool.active()).toBe(1);
  });

  it('leaves active count unchanged when factory throws', () => {
    const factory = vi.fn(() => {
      throw new Error('factory failure');
    });
    const pool = createPool(factory, resetPoolable);

    expect(() => pool.acquire()).toThrow('factory failure');
    expect(pool.active()).toBe(0);
  });

  it('throws when factory returns an already-active item', () => {
    const factory = vi.fn(createPoolable);
    const pool = createPool(factory, resetPoolable);
    const item = pool.acquire();
    factory.mockImplementationOnce(() => item);

    expect(() => pool.acquire()).toThrow('Pool factory returned an already-active item');
  });
});
