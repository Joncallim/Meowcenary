export interface ArenaPresentationBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface ActorPresentationPadding {
  readonly x: number;
  readonly y: number;
}

export interface ArenaCameraFraming {
  readonly bounds: ArenaPresentationBounds;
  readonly follow: boolean;
}

/** Account for the part of a visible actor that extends beyond its world-bound
 * body. A single symmetric inset per axis covers both sides as the body moves
 * to either authored edge, including asymmetric art and fallback geometry. */
export function resolveActorPresentationPadding(
  visualBounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  bodyCenter: Readonly<{ x: number; y: number }>,
  bodyRadius: number,
): ActorPresentationPadding {
  return Object.freeze({
    x: Math.max(0, bodyCenter.x - visualBounds.x - bodyRadius,
      visualBounds.x + visualBounds.width - bodyCenter.x - bodyRadius),
    y: Math.max(0, bodyCenter.y - visualBounds.y - bodyRadius,
      visualBounds.y + visualBounds.height - bodyCenter.y - bodyRadius),
  });
}

function nonnegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
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
  actorPadding: Readonly<ActorPresentationPadding> = { x: 0, y: 0 },
): ArenaPresentationBounds {
  const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
  const visibleWidth = Math.max(1, canvasWidth) / zoom;
  const visibleHeight = Math.max(1, canvasHeight) / zoom;
  const width = Math.max(arenaWidth + 2 * nonnegativeFinite(actorPadding.x), visibleWidth);
  const height = Math.max(arenaHeight + 2 * nonnegativeFinite(actorPadding.y), visibleHeight);
  return Object.freeze({
    x: (arenaWidth - width) / 2,
    y: (arenaHeight - height) / 2,
    width,
    height,
    centerX: arenaWidth / 2,
    centerY: arenaHeight / 2,
  });
}

/** Follow once the padded playable extent exceeds the visible world, including
 * an arena that exactly fits the viewport before actor art is considered.
 * Otherwise a static, centered camera can show every reachable actor position. */
export function resolveArenaCameraFraming(
  arena: Readonly<{ width: number; height: number }>,
  canvas: Readonly<{ width: number; height: number }>,
  cameraZoom: number,
  actorPadding: Readonly<ActorPresentationPadding> = { x: 0, y: 0 },
): ArenaCameraFraming {
  const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
  const visibleWidth = Math.max(1, canvas.width) / zoom;
  const visibleHeight = Math.max(1, canvas.height) / zoom;
  const paddedWidth = arena.width + 2 * nonnegativeFinite(actorPadding.x);
  const paddedHeight = arena.height + 2 * nonnegativeFinite(actorPadding.y);
  return Object.freeze({
    bounds: responsiveArenaPresentationBounds(
      arena.width, arena.height, canvas.width, canvas.height, cameraZoom, actorPadding,
    ),
    follow: paddedWidth > visibleWidth || paddedHeight > visibleHeight,
  });
}
