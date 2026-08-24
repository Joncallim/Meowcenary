import { RuntimeConfig } from '../engine/config';

export interface UiViewport {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** Browser/container size before FIT pillarboxing. Display orientation can
   *  differ from the fitted canvas orientation on wide screens. */
  readonly containerWidth?: number;
  readonly containerHeight?: number;
  /** World-space origin used by GameScene's camera-zoomed UI roots. */
  readonly originX?: number;
  readonly originY?: number;
}

export const GAMEPLAY_ZOOM = 1.25;
const ZOOMED_UI_WIDTH = RuntimeConfig.canvas.width / GAMEPLAY_ZOOM;
const ZOOMED_UI_HEIGHT = RuntimeConfig.canvas.height / GAMEPLAY_ZOOM;
const ZOOMED_UI_ORIGIN_X = (RuntimeConfig.canvas.width / 2) * (1 - 1 / GAMEPLAY_ZOOM);
const ZOOMED_UI_ORIGIN_Y = (RuntimeConfig.canvas.height / 2) * (1 - 1 / GAMEPLAY_ZOOM);

const MIN_LAYOUT_SCALE = 0.25;

export function safeDisplayScale(viewport: UiViewport): number {
  const widthScale = viewport.displayWidth / viewport.canvasWidth;
  const heightScale = viewport.displayHeight / viewport.canvasHeight;
  const scale = Math.min(widthScale, heightScale);
  return Number.isFinite(scale) && scale > 0
    ? Math.max(MIN_LAYOUT_SCALE, scale)
    : MIN_LAYOUT_SCALE;
}

export function physicalToLogical(px: number, viewport: UiViewport): number {
  return px / safeDisplayScale(viewport);
}

export function minimumHitTarget(viewport: UiViewport): number {
  return physicalToLogical(44, viewport);
}

export function logicalCanvasViewport(
  displayWidth: number = RuntimeConfig.canvas.width,
  displayHeight: number = RuntimeConfig.canvas.height,
  containerWidth: number = displayWidth,
  containerHeight: number = displayHeight,
): UiViewport {
  return {
    canvasWidth: RuntimeConfig.canvas.width,
    canvasHeight: RuntimeConfig.canvas.height,
    displayWidth,
    displayHeight,
    containerWidth,
    containerHeight,
  };
}

/** Camera-zoomed UI coordinate space for every GameScene presentation root. */
export function zoomedGameUiViewport(
  displayWidth: number = RuntimeConfig.canvas.width,
  displayHeight: number = RuntimeConfig.canvas.height,
  containerWidth: number = displayWidth,
  containerHeight: number = displayHeight,
): UiViewport {
  const safeDisplayWidth = positiveFinite(displayWidth, RuntimeConfig.canvas.width);
  const safeDisplayHeight = positiveFinite(displayHeight, RuntimeConfig.canvas.height);
  const safeContainerWidth = positiveFinite(containerWidth, safeDisplayWidth);
  const safeContainerHeight = positiveFinite(containerHeight, safeDisplayHeight);
  return {
    canvasWidth: ZOOMED_UI_WIDTH,
    canvasHeight: ZOOMED_UI_HEIGHT,
    displayWidth: safeDisplayWidth,
    displayHeight: safeDisplayHeight,
    containerWidth: safeContainerWidth,
    containerHeight: safeContainerHeight,
    originX: ZOOMED_UI_ORIGIN_X,
    originY: ZOOMED_UI_ORIGIN_Y,
  };
}

/** M-07 (U7): map a canvas-space pointer to the LOCAL space of a
 *  scrollFactor-0 UI root child. Root children live in world space, where the
 *  gameplay camera zoom maps local coords 1.25× onto the canvas (local =
 *  pointer / zoom — independent of camera scroll); the unzoomed menu root has
 *  no origin and scale 1, so its divisor is 1. This is the PRODUCTION
 *  transform the playtest pointer funnel regressions must drive, not a
 *  test-local copy. */
export function pointerToRootLocal(
  pointer: { readonly x: number; readonly y: number },
  viewport: Pick<UiViewport, 'originX' | 'originY'>,
): { readonly x: number; readonly y: number } {
  const zoom = viewport.originX === undefined ? 1 : GAMEPLAY_ZOOM;
  return { x: pointer.x / zoom, y: pointer.y / zoom };
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
