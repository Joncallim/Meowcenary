import { minimumHitTarget, physicalToLogical, type UiViewport } from './layout';
import { ThemeFont } from './theme';

export interface WeaponRackRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WeaponRackLayout {
  readonly compact: boolean;
  readonly margin: number;
  readonly hitTarget: number;
  readonly headingSize: number;
  readonly labelSize: number;
  readonly guideY: number;
  readonly keyHintY?: number;
  readonly gridTop: number;
  readonly gap: number;
  readonly columns: number;
  readonly rows: number;
  readonly cardWidth: number;
  readonly cardHeight: number;
  readonly preview: WeaponRackRect;
  readonly mergeAction: WeaponRackRect;
  readonly backAction: WeaponRackRect;
}

/**
 * Computes the whole rack surface from the live FIT display size. A wide
 * physical display still has the canonical portrait logical canvas, so the
 * compact 3x2 mode keys off display orientation rather than canvas shape.
 */
export function computeWeaponRackLayout(
  viewport: UiViewport,
  capacity: number,
): WeaponRackLayout {
  const physical = (pixels: number): number => physicalToLogical(pixels, viewport);
  const width = Math.max(1, viewport.canvasWidth);
  const height = Math.max(1, viewport.canvasHeight);
  const orientationWidth = viewport.containerWidth ?? viewport.displayWidth;
  const orientationHeight = viewport.containerHeight ?? viewport.displayHeight;
  const compact = orientationWidth > orientationHeight;
  // Short landscape phones have only ~148 physical pixels of fitted canvas
  // width. A compact 4px margin and 2px gutter still leave three 44px cards.
  const margin = physical(compact ? 4 : 12);
  const gap = physical(compact ? 2 : 8);
  const hitTarget = minimumHitTarget(viewport);
  const headingSize = physical(ThemeFont.headingMin);
  const labelSize = physical(ThemeFont.labelMin);
  const guideY = margin + headingSize + physical(2);
  const keyHintY = compact ? undefined : guideY + labelSize + physical(4);
  const gridTop = (keyHintY ?? guideY) + labelSize + physical(compact ? 8 : 12);
  const columns = compact ? 3 : 2;
  const rows = Math.max(1, Math.ceil(Math.max(1, capacity) / columns));
  const gridWidth = Math.max(1, width - margin * 2);
  const cardWidth = Math.max(1, (gridWidth - gap * (columns - 1)) / columns);

  let mergeAction: WeaponRackRect;
  let backAction: WeaponRackRect;
  let actionTop: number;
  if (compact) {
    const actionWidth = Math.max(1, (gridWidth - gap) / 2);
    const actionY = height - margin - hitTarget / 2;
    mergeAction = {
      x: margin + actionWidth / 2,
      y: actionY,
      width: actionWidth,
      height: hitTarget,
    };
    backAction = {
      x: width - margin - actionWidth / 2,
      y: actionY,
      width: actionWidth,
      height: hitTarget,
    };
    actionTop = actionY - hitTarget / 2;
  } else {
    const actionWidth = gridWidth;
    const mergeY = height - margin - hitTarget * 2 - physical(20);
    const backY = mergeY + hitTarget + physical(12);
    mergeAction = {
      x: width / 2,
      y: mergeY,
      width: actionWidth,
      height: hitTarget,
    };
    backAction = {
      x: width / 2,
      y: backY,
      width: actionWidth,
      height: hitTarget,
    };
    actionTop = mergeY - hitTarget / 2;
  }

  const previewBottom = Math.max(gridTop + 2, actionTop - gap);
  const available = Math.max(2, previewBottom - gridTop);
  const rowGaps = gap * (rows - 1);
  const desiredCardHeight = physical(106);
  const minimumPreviewHeight = physical(compact ? 122 : 144);
  const desiredGridHeight = desiredCardHeight * rows + rowGaps;
  const cardHeight = available - desiredGridHeight - gap >= minimumPreviewHeight
    ? desiredCardHeight
    : Math.max(
        1,
        (available - gap - minimumPreviewHeight - rowGaps) / rows,
      );
  const gridBottom = gridTop + cardHeight * rows + rowGaps;
  const previewTop = gridBottom + gap;
  const previewHeight = Math.max(1, previewBottom - previewTop);

  return {
    compact,
    margin,
    hitTarget,
    headingSize,
    labelSize,
    guideY,
    ...(keyHintY === undefined ? {} : { keyHintY }),
    gridTop,
    gap,
    columns,
    rows,
    cardWidth,
    cardHeight,
    preview: {
      x: margin,
      y: previewTop,
      width: gridWidth,
      height: previewHeight,
    },
    mergeAction,
    backAction,
  };
}
