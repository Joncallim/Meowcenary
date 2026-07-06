import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';

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
});
