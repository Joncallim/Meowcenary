import { describe, expect, it } from 'vitest';
import { logicalCanvasViewport, safeDisplayScale } from '../src/ui/layout';
import { computeWeaponRackLayout } from '../src/ui/weaponRackLayout';

function expectRectInsideCanvas(
  rect: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): void {
  expect(rect.x - rect.width / 2).toBeGreaterThanOrEqual(0);
  expect(rect.y - rect.height / 2).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width / 2).toBeLessThanOrEqual(width);
  expect(rect.y + rect.height / 2).toBeLessThanOrEqual(height);
}

describe('computeWeaponRackLayout', () => {
  it('keeps the detailed two-column rack at the canonical portrait size', () => {
    const viewport = logicalCanvasViewport(390, 844);
    const layout = computeWeaponRackLayout(viewport, 6);

    expect(layout.compact).toBe(false);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(3);
    expect(layout.cardHeight).toBe(106);
    expect(layout.keyHintY).toBeDefined();
    expectRectInsideCanvas(layout.mergeAction, 390, 844);
    expectRectInsideCanvas(layout.backAction, 390, 844);
  });

  it('reflows to a bounded 3x2 rack on a wide FIT display', () => {
    const viewport = logicalCanvasViewport(180, 390, 844, 390);
    const layout = computeWeaponRackLayout(viewport, 6);
    const scale = safeDisplayScale(viewport);
    const gridBottom = layout.gridTop
      + layout.rows * layout.cardHeight
      + (layout.rows - 1) * layout.gap;

    expect(layout.compact).toBe(true);
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.keyHintY).toBeUndefined();
    expect(layout.cardHeight * scale).toBeGreaterThanOrEqual(44);
    expect(layout.preview.height * scale).toBeGreaterThanOrEqual(122);
    expect(gridBottom).toBeLessThanOrEqual(layout.preview.y);
    expect(layout.preview.y + layout.preview.height).toBeLessThanOrEqual(
      layout.mergeAction.y - layout.mergeAction.height / 2,
    );
    expectRectInsideCanvas(layout.mergeAction, 390, 844);
    expectRectInsideCanvas(layout.backAction, 390, 844);
  });

  it('recomputes physical metrics when display orientation changes', () => {
    const portrait = computeWeaponRackLayout(logicalCanvasViewport(390, 844), 6);
    const landscape = computeWeaponRackLayout(
      logicalCanvasViewport(180, 390, 844, 390),
      6,
    );

    expect(landscape.hitTarget).toBeGreaterThan(portrait.hitTarget);
    expect(landscape.cardHeight).not.toBe(portrait.cardHeight);
    expect(landscape.columns).not.toBe(portrait.columns);
  });

  it('keeps every numeric region finite for a collapsed display', () => {
    const layout = computeWeaponRackLayout(logicalCanvasViewport(0, 0), 6);
    const values = [
      layout.margin,
      layout.hitTarget,
      layout.gridTop,
      layout.cardWidth,
      layout.cardHeight,
      layout.preview.y,
      layout.preview.height,
      layout.mergeAction.y,
      layout.backAction.y,
    ];
    expect(values.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  });
});
