export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: ReadonlyArray<{ item: T; weight: number }>): T;
}

const MAX_UINT32 = 0xffff_ffff;
const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const FNV1A_PRIME = 0x01000193;

export function nextRunSeed(rng: Pick<Rng, 'int'>): number {
  return rng.int(0, MAX_UINT32);
}

/**
 * Derives a stable uint32 seed for one named gameplay stream. The input is the
 * normalized run seed plus the stream name, hashed as UTF-16 code units with
 * standard 32-bit FNV-1a. Owners create one RNG from the result and reuse it.
 */
export function deriveRunSeed(seed: number, stream: string): number {
  if (!Number.isFinite(seed)) {
    throw new Error('Run seed derivation requires a finite seed');
  }
  if (stream.length === 0) {
    throw new Error('Run seed derivation requires a non-empty stream name');
  }

  const input = `${seed >>> 0}:${stream}`;
  let hash = FNV1A_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    const codeUnit = input.charCodeAt(index);
    hash ^= codeUnit & 0xff;
    hash = Math.imul(hash, FNV1A_PRIME);
    hash ^= codeUnit >>> 8;
    hash = Math.imul(hash, FNV1A_PRIME);
  }

  return hash >>> 0;
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
    if (!Number.isFinite(minInclusive) || !Number.isFinite(maxInclusive)) {
      throw new Error('Rng.int requires finite bounds');
    }

    const min = Math.ceil(Math.min(minInclusive, maxInclusive));
    const max = Math.floor(Math.max(minInclusive, maxInclusive));
    if (min > max) {
      throw new Error('Rng.int bounds must contain at least one integer');
    }

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
      const candidates = entries
        .map((entry) => ({
          item: entry.item,
          weight: Number.isFinite(entry.weight) ? Math.max(0, entry.weight) : 0,
        }))
        .filter((entry) => entry.weight > 0);
      const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
      if (candidates.length === 0 || !Number.isFinite(total) || total <= 0) {
        throw new Error('Rng.weighted requires at least one positive weight');
      }

      let cursor = next() * total;
      for (const entry of candidates) {
        cursor -= entry.weight;
        if (cursor < 0) {
          return entry.item;
        }
      }

      return candidates[candidates.length - 1].item;
    },
  };
}
