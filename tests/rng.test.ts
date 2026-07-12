import { describe, expect, it, vi } from 'vitest';
import { createRng, nextRunSeed } from '../src/engine/rng';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const first = createRng(1234);
    const second = createRng(1234);

    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });

  it('gives different sequences for different seeds', () => {
    const first = createRng(1234);
    const second = createRng(5678);

    expect([first.next(), first.next(), first.next()]).not.toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });

  it('allows pick to be destructured', () => {
    const { pick } = createRng(1234);

    expect(['a', 'b', 'c']).toContain(pick(['a', 'b', 'c']));
  });

  it('generates run seeds across the full uint32 range without precision truncation', () => {
    const int = vi.fn(() => 123);

    expect(nextRunSeed({ int })).toBe(123);
    expect(int).toHaveBeenCalledWith(0, 0xffff_ffff);

    const menuRng = createRng(1234);
    const seeds = Array.from({ length: 8 }, () => nextRunSeed(menuRng));
    const lowTwentyOneBits = 0x1f_ffff;
    expect(seeds.some((seed) => (seed & lowTwentyOneBits) !== 0)).toBe(true);
  });
});
