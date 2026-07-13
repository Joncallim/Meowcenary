import { describe, expect, it, vi } from 'vitest';
import { createRng, deriveRunSeed, nextRunSeed } from '../src/engine/rng';

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

  it('rejects non-finite or empty integer bounds', () => {
    const { int } = createRng(1234);

    expect(() => int(Number.NaN, 1)).toThrow(/finite bounds/);
    expect(() => int(0.2, 0.8)).toThrow(/at least one integer/);
  });

  it('ignores non-finite weighted entries instead of selecting them', () => {
    const { weighted } = createRng(1234);

    expect(
      weighted([
        { item: 'valid', weight: 1 },
        { item: 'invalid', weight: Number.NaN },
      ]),
    ).toBe('valid');
    expect(() => weighted([{ item: 'invalid', weight: Number.POSITIVE_INFINITY }])).toThrow(
      /positive weight/,
    );
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

  it('derives stable, distinct named run streams', () => {
    expect(deriveRunSeed(1234, 'upgrades')).toBe(1938223080);
    expect(deriveRunSeed(42, '升级')).toBe(1112862886);
    expect(deriveRunSeed(42, '🐱')).toBe(2374925705);
    expect(deriveRunSeed(1234, 'upgrades')).not.toBe(deriveRunSeed(1234, 'spawns'));
    expect(deriveRunSeed(1234, 'upgrades')).not.toBe(deriveRunSeed(5678, 'upgrades'));
  });

  it('normalizes finite run seeds to uint32 before derivation', () => {
    expect(deriveRunSeed(-1, 'upgrades')).toBe(deriveRunSeed(0xffff_ffff, 'upgrades'));
    expect(deriveRunSeed(1.9, 'upgrades')).toBe(deriveRunSeed(1, 'upgrades'));
    expect(deriveRunSeed(0x1_0000_0001, 'upgrades')).toBe(deriveRunSeed(1, 'upgrades'));
    expect(deriveRunSeed(-0, 'upgrades')).toBe(deriveRunSeed(0, 'upgrades'));
  });

  it('rejects invalid named stream inputs', () => {
    expect(() => deriveRunSeed(Number.NaN, 'upgrades')).toThrow(/finite seed/);
    expect(() => deriveRunSeed(Number.POSITIVE_INFINITY, 'upgrades')).toThrow(/finite seed/);
    expect(() => deriveRunSeed(Number.NEGATIVE_INFINITY, 'upgrades')).toThrow(/finite seed/);
    expect(() => deriveRunSeed(1234, '')).toThrow(/non-empty stream/);
  });
});
