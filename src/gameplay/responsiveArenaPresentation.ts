export interface ArenaPresentationBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

/** Presentation-only floor extent. Physics and spawn geometry retain the
 * authored arena bounds; this merely prevents wide cameras revealing an
 * unpainted void beyond the clearly rendered boundary. */
export function responsiveArenaPresentationBounds(
  arenaWidth: number,
  arenaHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  cameraZoom: number,
): ArenaPresentationBounds {
  const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
  const visibleWidth = Math.max(1, canvasWidth) / zoom;
  const visibleHeight = Math.max(1, canvasHeight) / zoom;
  const width = Math.max(arenaWidth, visibleWidth);
  const height = Math.max(arenaHeight, visibleHeight);
  return Object.freeze({
    x: (arenaWidth - width) / 2,
    y: (arenaHeight - height) / 2,
    width,
    height,
    centerX: arenaWidth / 2,
    centerY: arenaHeight / 2,
  });
}
