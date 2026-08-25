import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { logicalCanvasViewport, zoomedGameUiViewport } from '../src/ui/layout';
import { readSafeAreaInsets } from '../src/platform/safeArea';

describe('safe-area projection', () => {
  it.each([
    { name: 'portrait', values: { '--safe-top': '59px', '--safe-right': '0px', '--safe-bottom': '34px', '--safe-left': '0px' } },
    { name: 'landscape', values: { '--safe-top': '0px', '--safe-right': '59px', '--safe-bottom': '21px', '--safe-left': '59px' } },
  ])('reads $name CSS probe values through the injectable seam', ({ values }) => {
    expect(readSafeAreaInsets((property) => values[property as keyof typeof values])).toEqual({
      top: Number.parseFloat(values['--safe-top']),
      right: Number.parseFloat(values['--safe-right']),
      bottom: Number.parseFloat(values['--safe-bottom']),
      left: Number.parseFloat(values['--safe-left']),
    });
  });

  it('falls back to zero for missing, malformed, unsupported, negative, and non-finite values', () => {
    const values: Record<string, string> = {
      '--safe-top': 'env(safe-area-inset-top)',
      '--safe-right': '-2px',
      '--safe-bottom': 'NaNpx',
      '--safe-left': '12rem',
    };
    expect(readSafeAreaInsets((property) => values[property])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('has a dedicated zero fallback when the reader is absent or undefined', () => {
    expect(readSafeAreaInsets(() => undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(readSafeAreaInsets(undefined)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('projects raw insets through centered FIT letterbox without changing canvas geometry', () => {
    const raw = { top: 59, right: 0, bottom: 34, left: 0 } as const;
    const viewport = zoomedGameUiViewport(430, 930.5641, 430, 932, raw);
    expect(viewport.canvasWidth).toBeCloseTo(312, 6);
    expect(viewport.canvasHeight).toBeCloseTo(675.2, 6);
    expect(viewport.originX).toBeCloseTo(39, 6);
    expect(viewport.originY).toBeCloseTo(84.4, 6);
    expect(viewport.layoutInsets.top).toBeCloseTo(42.2884, 3);
    expect(viewport.layoutInsets.bottom).toBeCloseTo(24.1488, 3);

    const landscape = zoomedGameUiViewport(390 * (390 / 844), 390, 844, 390,
      { top: 0, right: 59, bottom: 21, left: 59 });
    expect(landscape.layoutInsets.left).toBe(0);
    expect(landscape.layoutInsets.right).toBe(0);
    expect(landscape.layoutInsets.bottom).toBeGreaterThan(0);
  });

  it('keeps the shell full bleed and probe variables on the root', () => {
    const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
    expect(css).toContain('inset: 0;');
    expect(css).toContain('height: 100vh;');
    expect(css).toContain('height: 100dvh;');
    expect(css).not.toMatch(/#game-root[\s\S]*inset:\s*env\(/);
  });

  it('preserves the zero-inset logical canvas factory', () => {
    const viewport = logicalCanvasViewport(390, 844, 390, 844, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(viewport.layoutInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('clamps hostile inset magnitudes to the containing surface before projection', () => {
    const viewport = logicalCanvasViewport(390, 844, 390, 844, {
      top: 50_000,
      right: 50_000,
      bottom: 50_000,
      left: 50_000,
    });
    expect(viewport.layoutInsets.top).toBeLessThanOrEqual(844);
    expect(viewport.layoutInsets.bottom).toBeLessThanOrEqual(844);
    expect(viewport.layoutInsets.left).toBeLessThanOrEqual(390);
    expect(viewport.layoutInsets.right).toBeLessThanOrEqual(390);
  });
});
