import { RuntimeConfig } from '../engine/config';

export interface UiViewport {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

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
): UiViewport {
  return {
    canvasWidth: RuntimeConfig.canvas.width,
    canvasHeight: RuntimeConfig.canvas.height,
    displayWidth,
    displayHeight,
  };
}
