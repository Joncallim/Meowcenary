export interface Pool<T> {
  acquire(): T;
  release(item: T): void;
  active(): number;
}

export function createPool<T>(
  factory: () => T,
  reset: (item: T) => void,
): Pool<T> {
  const free: T[] = [];
  const leased = new Set<T>();

  return {
    acquire(): T {
      const item = free.pop() ?? factory();
      if (leased.has(item)) {
        throw new Error('Pool factory returned an already-active item');
      }
      leased.add(item);
      return item;
    },

    release(item: T): void {
      if (!leased.has(item)) {
        throw new Error('Cannot release an item that is not active in this pool');
      }
      reset(item);
      leased.delete(item);
      free.push(item);
    },

    active(): number {
      return leased.size;
    },
  };
}
