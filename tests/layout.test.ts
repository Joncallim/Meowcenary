import { describe, expect, it } from 'vitest';
import { RuntimeConfig } from '../src/engine/config';
import {
  minimumHitTarget,
  physicalToLogical,
  safeDisplayScale,
  type UiViewport,
} from '../src/ui/layout';

const CANVAS = {
  width: RuntimeConfig.canvas.width,
  height: RuntimeConfig.canvas.height,
};

function viewport(displayWidth: number, displayHeight: number): UiViewport {
  return {
    canvasWidth: CANVAS.width,
    canvasHeight: CANVAS.height,
    displayWidth,
    displayHeight,
  };
}

describe('safeDisplayScale', () => {
  it('returns 1 when display matches logical canvas', () => {
    expect(safeDisplayScale(viewport(CANVAS.width, CANVAS.height))).toBe(1);
  });

  it.each([
    { name: 'compact phone', width: 320, height: 568 },
    { name: 'portrait target', width: 390, height: 844 },
    { name: 'landscape viewport', width: 844, height: 390 },
    { name: 'desktop viewport', width: 1280, height: 720 },
  ])('keeps a finite positive scale for $name', ({ width, height }) => {
    const scale = safeDisplayScale(viewport(width, height));
    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThan(0);
  });

  it('clamps to a minimum positive scale for collapsed displays', () => {
    const collapsed = [
      { width: 0, height: 0 },
      { width: 1, height: 1 },
      { width: 1, height: 844 },
      { width: 390, height: 1 },
    ];
    for (const { width, height } of collapsed) {
      const scale = safeDisplayScale(viewport(width, height));
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeGreaterThan(0);
    }
  });

  it('matches the FIT scale used by the Phaser config', () => {
    const width = 844;
    const height = 390;
    const expected = Math.min(width / CANVAS.width, height / CANVAS.height);
    expect(safeDisplayScale(viewport(width, height))).toBeCloseTo(expected);
  });
});

describe('physicalToLogical', () => {
  it('converts physical pixels to logical canvas pixels using the safe scale', () => {
    const vp = viewport(390, 844);
    expect(physicalToLogical(44, vp)).toBe(44);
  });

  it('scales down on larger displays', () => {
    const vp = viewport(1280, 720);
    const scale = safeDisplayScale(vp);
    expect(physicalToLogical(44, vp)).toBeCloseTo(44 / scale);
  });
});

describe('minimumHitTarget', () => {
  it('returns the logical size for a 44 physical pixel target', () => {
    const vp = viewport(390, 844);
    expect(minimumHitTarget(vp)).toBe(44);
  });

  it('remains finite for collapsed displays', () => {
    const vp = viewport(0, 0);
    expect(Number.isFinite(minimumHitTarget(vp))).toBe(true);
    expect(minimumHitTarget(vp)).toBeGreaterThan(0);
  });
});
