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
  return {
    canvasWidth: ZOOMED_UI_WIDTH,
    canvasHeight: ZOOMED_UI_HEIGHT,
    displayWidth,
    displayHeight,
    containerWidth,
    containerHeight,
    originX: ZOOMED_UI_ORIGIN_X,
    originY: ZOOMED_UI_ORIGIN_Y,
  };
}
