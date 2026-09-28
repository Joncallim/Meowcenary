import { describe, expect, it } from 'vitest';
import { RuntimeConfig } from '../src/engine/config';
import { responsiveArenaPresentationBounds } from '../src/gameplay/responsiveArenaPresentation';
import {
  GAMEPLAY_ZOOM,
  minimumHitTarget,
  responsiveGameUiViewport,
  responsiveContentInsets,
  responsiveUiViewport,
  safeDisplayScale,
} from '../src/ui/layout';

const VIEWPORTS = [
  { name: 'compact phone', width: 360, height: 640 },
  { name: 'conventional phone', width: 390, height: 844 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'foldable wide', width: 1114, height: 720 },
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'large desktop', width: 1920, height: 1080 },
] as const;

describe('full-viewport responsive scaling contract', () => {
  it.each(VIEWPORTS)('uses the full $name viewport as the menu canvas', ({ width, height }) => {
    const viewport = responsiveUiViewport(width, height);
    expect(viewport.canvasWidth).toBe(width);
    expect(viewport.canvasHeight).toBe(height);
    expect(viewport.displayWidth).toBe(width);
    expect(viewport.displayHeight).toBe(height);
    expect(safeDisplayScale(viewport)).toBe(1);
    expect(minimumHitTarget(viewport)).toBe(44);
  });

  it.each(VIEWPORTS)('expands $name gameplay field of view without changing actor size', ({ width, height }) => {
    const viewport = responsiveGameUiViewport(width, height);
    expect(viewport.canvasWidth).toBeCloseTo(width / GAMEPLAY_ZOOM, 6);
    expect(viewport.canvasHeight).toBeCloseTo(height / GAMEPLAY_ZOOM, 6);
    expect(viewport.originX).toBeCloseTo((width - width / GAMEPLAY_ZOOM) / 2, 6);
    expect(viewport.originY).toBeCloseTo((height - height / GAMEPLAY_ZOOM) / 2, 6);
    expect(minimumHitTarget(viewport) * GAMEPLAY_ZOOM).toBeCloseTo(44, 6);

    const renderedCharacterCssPixels = 28 * 1.3 * GAMEPLAY_ZOOM;
    expect(renderedCharacterCssPixels).toBeCloseTo(45.5, 6);
  });

  it('falls back to the canonical canvas only for invalid dimensions', () => {
    const viewport = responsiveUiViewport(Number.NaN, 0);
    expect(viewport.canvasWidth).toBe(RuntimeConfig.canvas.width);
    expect(viewport.canvasHeight).toBe(RuntimeConfig.canvas.height);
  });

  it('projects safe areas directly for menus and through the fixed camera zoom for gameplay', () => {
    const insets = { top: 59, right: 18, bottom: 34, left: 12 } as const;
    expect(responsiveUiViewport(390, 844, insets).layoutInsets).toEqual(insets);
    expect(responsiveGameUiViewport(390, 844, insets).layoutInsets).toEqual({
      top: 59 / GAMEPLAY_ZOOM,
      right: 18 / GAMEPLAY_ZOOM,
      bottom: 34 / GAMEPLAY_ZOOM,
      left: 12 / GAMEPLAY_ZOOM,
    });
  });

  it.each([
    [390, 0, 0],
    [1114, 137, 137],
    [1920, 540, 540],
  ] as const)('centres a bounded 840px content lane inside %ipx', (width, left, right) => {
    expect(responsiveContentInsets(width, 0, 0, 840)).toEqual({ left, right });
  });

  it('overscans presentation without changing the authored gameplay arena', () => {
    expect(responsiveArenaPresentationBounds(768, 1344, 1920, 1080, GAMEPLAY_ZOOM)).toEqual({
      x: -384,
      y: 0,
      width: 1536,
      height: 1344,
      centerX: 384,
      centerY: 672,
    });
  });
});
