import { describe, expect, it } from 'vitest';
import { installPortraitOrientationGuard, isPortraitOrientationBlocked, isPortraitRequiredButUnavailable } from '../src/platform/orientation';

describe('portrait-only phone orientation policy', () => {
  it.each([
    ['portrait coarse pointer', { viewportWidth: 390, viewportHeight: 844, coarsePrimaryPointer: true }, false],
    ['landscape coarse pointer', { viewportWidth: 844, viewportHeight: 390, coarsePrimaryPointer: true }, true],
    ['landscape fine pointer desktop', { viewportWidth: 1440, viewportHeight: 900, coarsePrimaryPointer: false }, false],
    ['square coarse pointer', { viewportWidth: 600, viewportHeight: 600, coarsePrimaryPointer: true }, false],
  ] as const)('%s is %s', (_name, evidence, expected) => {
    expect(isPortraitRequiredButUnavailable(evidence)).toBe(expected);
  });

  it('disposes the prior installation on reload so stale listeners cannot block an invisible menu', () => {
    const resizeListeners = new Set<() => void>();
    const win = {
      innerWidth: 844,
      innerHeight: 390,
      addEventListener(event: string, listener: () => void) { if (event === 'resize') resizeListeners.add(listener); },
      removeEventListener(event: string, listener: () => void) { if (event === 'resize') resizeListeners.delete(listener); },
      matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    };
    const element = () => ({ id: '', hidden: false, innerHTML: '', setAttribute() {}, remove() {}, parentNode: undefined });
    const doc = {
      body: { appendChild() {} },
      createElement: element,
      getElementById: () => undefined,
    };

    const first = installPortraitOrientationGuard(win as never, doc as never);
    expect(isPortraitOrientationBlocked()).toBe(true);
    expect(resizeListeners.size).toBe(1);

    const second = installPortraitOrientationGuard(win as never, doc as never);
    expect(resizeListeners.size).toBe(1);
    first.dispose();
    expect(isPortraitOrientationBlocked()).toBe(true);

    second.dispose();
    expect(isPortraitOrientationBlocked()).toBe(false);
  });
});
