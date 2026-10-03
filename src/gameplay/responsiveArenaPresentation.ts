export interface ArenaPresentationBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

export interface ActorPresentationPadding {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ArenaCameraFraming {
  readonly bounds: ArenaPresentationBounds;
  readonly follow: boolean;
}

/** Account for each side of the visible actor outside its world-bound body.
 * Offset art and shadows may need different room at opposite arena edges. */
export function resolveActorPresentationPadding(
  visualBounds: Readonly<{ x: number; y: number; width: number; height: number }>,
  bodyCenter: Readonly<{ x: number; y: number }>,
  bodyRadius: number,
): ActorPresentationPadding {
  return Object.freeze({
    left: Math.max(0, bodyCenter.x - visualBounds.x - bodyRadius),
    right: Math.max(0, visualBounds.x + visualBounds.width - bodyCenter.x - bodyRadius),
    top: Math.max(0, bodyCenter.y - visualBounds.y - bodyRadius),
    bottom: Math.max(0, visualBounds.y + visualBounds.height - bodyCenter.y - bodyRadius),
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
  actorPadding: Readonly<ActorPresentationPadding> = { left: 0, right: 0, top: 0, bottom: 0 },
): ArenaPresentationBounds {
  const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
  const visibleWidth = Math.max(1, canvasWidth) / zoom;
  const visibleHeight = Math.max(1, canvasHeight) / zoom;
  const left = nonnegativeFinite(actorPadding.left);
  const right = nonnegativeFinite(actorPadding.right);
  const top = nonnegativeFinite(actorPadding.top);
  const bottom = nonnegativeFinite(actorPadding.bottom);
  const centerX = (arenaWidth + right - left) / 2;
  const centerY = (arenaHeight + bottom - top) / 2;
  const width = Math.max(arenaWidth + left + right, visibleWidth);
  const height = Math.max(arenaHeight + top + bottom, visibleHeight);
  return Object.freeze({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    centerX,
    centerY,
  });
}

/** Follow once the padded playable extent exceeds the visible world, including
 * an arena that exactly fits the viewport before actor art is considered.
 * Otherwise a static, centered camera can show every reachable actor position. */
export function resolveArenaCameraFraming(
  arena: Readonly<{ width: number; height: number }>,
  canvas: Readonly<{ width: number; height: number }>,
  cameraZoom: number,
  actorPadding: Readonly<ActorPresentationPadding> = { left: 0, right: 0, top: 0, bottom: 0 },
): ArenaCameraFraming {
  const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
  const visibleWidth = Math.max(1, canvas.width) / zoom;
  const visibleHeight = Math.max(1, canvas.height) / zoom;
  const paddedWidth = arena.width + nonnegativeFinite(actorPadding.left) + nonnegativeFinite(actorPadding.right);
  const paddedHeight = arena.height + nonnegativeFinite(actorPadding.top) + nonnegativeFinite(actorPadding.bottom);
  return Object.freeze({
    bounds: responsiveArenaPresentationBounds(
      arena.width, arena.height, canvas.width, canvas.height, cameraZoom, actorPadding,
    ),
    follow: paddedWidth > visibleWidth || paddedHeight > visibleHeight,
  });
}
