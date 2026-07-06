export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(minInclusive: number, maxInclusive: number): number {
    const min = Math.ceil(Math.min(minInclusive, maxInclusive));
    const max = Math.floor(Math.max(minInclusive, maxInclusive));
    return Math.floor(next() * (max - min + 1)) + min;
  }

  return {
    next,
    int,

    pick(items) {
      if (items.length === 0) {
        throw new Error('Rng.pick requires at least one item');
      }

      return items[int(0, items.length - 1)];
    },

    weighted(entries) {
      const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
      if (entries.length === 0 || total <= 0) {
        throw new Error('Rng.weighted requires at least one positive weight');
      }

      let cursor = next() * total;
      for (const entry of entries) {
        cursor -= Math.max(0, entry.weight);
        if (cursor < 0) {
          return entry.item;
        }
      }

      return entries[entries.length - 1].item;
    },
  };
}
