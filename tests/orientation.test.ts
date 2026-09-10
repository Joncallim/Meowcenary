import { describe, expect, it } from 'vitest';
import { isPortraitRequiredButUnavailable } from '../src/platform/orientation';

describe('portrait-only phone orientation policy', () => {
  it.each([
    ['portrait coarse pointer', { viewportWidth: 390, viewportHeight: 844, coarsePrimaryPointer: true }, false],
    ['landscape coarse pointer', { viewportWidth: 844, viewportHeight: 390, coarsePrimaryPointer: true }, true],
    ['landscape fine pointer desktop', { viewportWidth: 1440, viewportHeight: 900, coarsePrimaryPointer: false }, false],
    ['square coarse pointer', { viewportWidth: 600, viewportHeight: 600, coarsePrimaryPointer: true }, false],
  ] as const)('%s is %s', (_name, evidence, expected) => {
    expect(isPortraitRequiredButUnavailable(evidence)).toBe(expected);
  });
});
