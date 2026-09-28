import { RuntimeConfig } from '../engine/config';
import { clampSafeAreaInsets, readSafeAreaInsets, type SafeAreaInsetsPx } from '../platform/safeArea';

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
  /** Effective safe-area inset in logical UI units after FIT letterbox projection. */
  readonly layoutInsets: SafeAreaInsetsPx;
}

export const GAMEPLAY_ZOOM = 1.25;
const ZOOMED_UI_WIDTH = RuntimeConfig.canvas.width / GAMEPLAY_ZOOM;
const ZOOMED_UI_HEIGHT = RuntimeConfig.canvas.height / GAMEPLAY_ZOOM;
const ZOOMED_UI_ORIGIN_X = (RuntimeConfig.canvas.width / 2) * (1 - 1 / GAMEPLAY_ZOOM);
const ZOOMED_UI_ORIGIN_Y = (RuntimeConfig.canvas.height / 2) * (1 - 1 / GAMEPLAY_ZOOM);

const MIN_LAYOUT_SCALE = 0.25;

/** Full-viewport menu coordinate space used with Phaser Scale.RESIZE. Game
 * coordinates and CSS pixels are intentionally 1:1 so widening the browser
 * reveals more presentation space instead of stretching a fixed canvas. */
export function responsiveUiViewport(
  canvasWidth: number,
  canvasHeight: number,
  rawInsets: SafeAreaInsetsPx = readSafeAreaInsets(),
): UiViewport {
  const width = positiveFinite(canvasWidth, RuntimeConfig.canvas.width);
  const height = positiveFinite(canvasHeight, RuntimeConfig.canvas.height);
  return createViewport({
    canvasWidth: width,
    canvasHeight: height,
    displayWidth: width,
    displayHeight: height,
    containerWidth: width,
    containerHeight: height,
  }, rawInsets);
}

/** Full-viewport GameScene UI space. The world camera keeps one fixed zoom,
 * so actors retain a stable CSS-pixel size while the visible world expands
 * with the viewport. Scroll-factor-zero children use this compensated space. */
export function responsiveGameUiViewport(
  canvasWidth: number,
  canvasHeight: number,
  rawInsets: SafeAreaInsetsPx = readSafeAreaInsets(),
): UiViewport {
  const width = positiveFinite(canvasWidth, RuntimeConfig.canvas.width);
  const height = positiveFinite(canvasHeight, RuntimeConfig.canvas.height);
  return createViewport({
    canvasWidth: width / GAMEPLAY_ZOOM,
    canvasHeight: height / GAMEPLAY_ZOOM,
    displayWidth: width,
    displayHeight: height,
    containerWidth: width,
    containerHeight: height,
    originX: (width - width / GAMEPLAY_ZOOM) / 2,
    originY: (height - height / GAMEPLAY_ZOOM) / 2,
  }, rawInsets);
}

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

/** Centre a readable content lane while preserving larger safe-area edges. */
export function responsiveContentInsets(
  canvasWidth: number,
  safeLeft: number,
  safeRight: number,
  maxContentWidth: number,
): { readonly left: number; readonly right: number } {
  const width = Math.max(1, Number.isFinite(canvasWidth) ? canvasWidth : 1);
  const lane = Math.max(1, Math.min(width, Number.isFinite(maxContentWidth) ? maxContentWidth : width));
  const centering = Math.max(0, (width - lane) / 2);
  return {
    left: Math.max(centering, Math.max(0, safeLeft)),
    right: Math.max(centering, Math.max(0, safeRight)),
  };
}

export type LayoutEdge = keyof SafeAreaInsetsPx;

export function edgeMargin(viewport: UiViewport, edge: LayoutEdge, basePx = 12): number {
  return physicalToLogical(basePx, viewport) + viewport.layoutInsets[edge];
}

export function logicalCanvasViewport(
  displayWidth: number = RuntimeConfig.canvas.width,
  displayHeight: number = RuntimeConfig.canvas.height,
  containerWidth: number = displayWidth,
  containerHeight: number = displayHeight,
  rawInsets: SafeAreaInsetsPx = readSafeAreaInsets(),
): UiViewport {
  return createViewport({
    canvasWidth: RuntimeConfig.canvas.width,
    canvasHeight: RuntimeConfig.canvas.height,
    displayWidth,
    displayHeight,
    containerWidth,
    containerHeight,
  }, rawInsets);
}

/** Camera-zoomed UI coordinate space for every GameScene presentation root. */
export function zoomedGameUiViewport(
  displayWidth: number = RuntimeConfig.canvas.width,
  displayHeight: number = RuntimeConfig.canvas.height,
  containerWidth: number = displayWidth,
  containerHeight: number = displayHeight,
  rawInsets: SafeAreaInsetsPx = readSafeAreaInsets(),
): UiViewport {
  const safeDisplayWidth = positiveFinite(displayWidth, RuntimeConfig.canvas.width);
  const safeDisplayHeight = positiveFinite(displayHeight, RuntimeConfig.canvas.height);
  const safeContainerWidth = positiveFinite(containerWidth, safeDisplayWidth);
  const safeContainerHeight = positiveFinite(containerHeight, safeDisplayHeight);
  return createViewport({
    canvasWidth: ZOOMED_UI_WIDTH,
    canvasHeight: ZOOMED_UI_HEIGHT,
    displayWidth: safeDisplayWidth,
    displayHeight: safeDisplayHeight,
    containerWidth: safeContainerWidth,
    containerHeight: safeContainerHeight,
    originX: ZOOMED_UI_ORIGIN_X,
    originY: ZOOMED_UI_ORIGIN_Y,
  }, rawInsets);
}

function createViewport(
  viewport: Omit<UiViewport, 'layoutInsets'>,
  rawInsets: SafeAreaInsetsPx,
): UiViewport {
  const containerWidth = positiveFinite(viewport.containerWidth ?? viewport.displayWidth, viewport.displayWidth);
  const containerHeight = positiveFinite(viewport.containerHeight ?? viewport.displayHeight, viewport.displayHeight);
  const displayWidth = positiveFinite(viewport.displayWidth, viewport.canvasWidth);
  const displayHeight = positiveFinite(viewport.displayHeight, viewport.canvasHeight);
  const letterboxX = Math.max(0, (containerWidth - displayWidth) / 2);
  const letterboxY = Math.max(0, (containerHeight - displayHeight) / 2);
  const scale = safeDisplayScale(viewport as UiViewport);
  const boundedInsets = clampSafeAreaInsets(rawInsets, containerWidth, containerHeight);
  const projected = {
    top: Math.max(0, boundedInsets.top - letterboxY) / scale,
    right: Math.max(0, boundedInsets.right - letterboxX) / scale,
    bottom: Math.max(0, boundedInsets.bottom - letterboxY) / scale,
    left: Math.max(0, boundedInsets.left - letterboxX) / scale,
  };
  return Object.freeze({ ...viewport, layoutInsets: Object.freeze(projected) });
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
