import { describe, expect, it } from 'vitest';
import { logicalCanvasViewport, safeDisplayScale } from '../src/ui/layout';
import {
  computeMergePreviewTextLayout,
  computeWeaponRackLayout,
} from '../src/ui/weaponRackLayout';

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
    expect(layout.preview.height).toBeGreaterThanOrEqual(
      computeMergePreviewTextLayout(viewport, true).minimumHeight,
    );
    expect(gridBottom).toBeLessThanOrEqual(layout.preview.y);
    expect(layout.preview.y + layout.preview.height).toBeLessThanOrEqual(
      layout.mergeAction.y - layout.mergeAction.height / 2,
    );
    expectRectInsideCanvas(layout.mergeAction, 390, 844);
    expectRectInsideCanvas(layout.backAction, 390, 844);
  });

  it('preserves targets and all-delta preview space on a 568x320 phone', () => {
    const viewport = logicalCanvasViewport(148, 320, 568, 320);
    const layout = computeWeaponRackLayout(viewport, 6);
    const scale = safeDisplayScale(viewport);

    expect(layout.compact).toBe(true);
    expect(layout.cardWidth * scale).toBeGreaterThanOrEqual(44);
    expect(layout.cardHeight * scale).toBeGreaterThanOrEqual(44);
    expect(layout.preview.height).toBeGreaterThanOrEqual(
      computeMergePreviewTextLayout(viewport, true).minimumHeight,
    );
    expect(layout.mergeAction.width * scale).toBeGreaterThanOrEqual(44);
    expect(layout.backAction.width * scale).toBeGreaterThanOrEqual(44);
  });

  it('reserves every delta row on a 320x568 portrait phone', () => {
    const viewport = logicalCanvasViewport(263, 568, 320, 568);
    const layout = computeWeaponRackLayout(viewport, 6);
    const scale = safeDisplayScale(viewport);

    expect(layout.compact).toBe(false);
    expect(layout.cardWidth * scale).toBeGreaterThanOrEqual(44);
    expect(layout.cardHeight * scale).toBeGreaterThanOrEqual(44);
    expect(layout.preview.height).toBeGreaterThanOrEqual(
      computeMergePreviewTextLayout(viewport, false).minimumHeight,
    );
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

  it.each([
    { name: 'portrait', display: [390, 844, 390, 844] as const, raw: { top: 59, right: 0, bottom: 34, left: 0 } },
    { name: 'landscape', display: [390 * (390 / 844), 390, 844, 390] as const, raw: { top: 0, right: 59, bottom: 21, left: 59 } },
  ])('keeps rack heading and actions in the projected safe rect on $name', ({ display, raw }) => {
    const viewport = logicalCanvasViewport(display[0], display[1], display[2], display[3], raw);
    const layout = computeWeaponRackLayout(viewport, 6);
    expect(layout.topMargin).toBeGreaterThanOrEqual(viewport.layoutInsets.top);
    expect(layout.mergeAction.y + layout.mergeAction.height / 2)
      .toBeLessThanOrEqual(viewport.canvasHeight - viewport.layoutInsets.bottom + 0.001);
    expect(layout.backAction.y + layout.backAction.height / 2)
      .toBeLessThanOrEqual(viewport.canvasHeight - viewport.layoutInsets.bottom + 0.001);
    expect(layout.preview.x).toBeGreaterThanOrEqual(viewport.layoutInsets.left);
    expect(layout.preview.x + layout.preview.width)
      .toBeLessThanOrEqual(viewport.canvasWidth - viewport.layoutInsets.right + 0.001);
  });
});
