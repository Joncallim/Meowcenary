import { describe, expect, it } from 'vitest';
import { shouldPlay } from '../src/engine/cooldown';

describe('shouldPlay', () => {
  it('allows when the key never played', () => {
    expect(shouldPlay(undefined, 1000, 500)).toBe(true);
  });

  it('allows when cooldownMs is not positive (no gate)', () => {
    expect(shouldPlay(0, 1000, 0)).toBe(true);
    expect(shouldPlay(0, 1000, -10)).toBe(true);
  });

  it('blocks while inside the cooldown window', () => {
    expect(shouldPlay(1000, 1499, 500)).toBe(false);
  });

  it('plays at the exact boundary', () => {
    expect(shouldPlay(1000, 1500, 500)).toBe(true);
  });

  it('blocks when nowMs is non-finite (clock must stay finite)', () => {
    expect(shouldPlay(1000, Number.NaN, 500)).toBe(false);
    expect(shouldPlay(1000, Number.POSITIVE_INFINITY, 500)).toBe(false);
  });

  it('treats non-finite lastPlayedMs as never played', () => {
    expect(shouldPlay(Number.NaN, 1000, 500)).toBe(true);
    expect(shouldPlay(Number.POSITIVE_INFINITY, 1000, 500)).toBe(true);
    expect(shouldPlay(Number.NEGATIVE_INFINITY, 1000, 500)).toBe(true);
  });
});
