import { normalize, towards, type Vec2 } from '../engine/vector';

export interface ProjectilePatternOptions {
  origin: Vec2;
  target: Vec2;
  projectileCount: number;
  spreadDeg: number;
}

export function projectileDirections({
  origin,
  target,
  projectileCount,
  spreadDeg,
}: ProjectilePatternOptions): Vec2[] {
  const count = Math.max(1, Math.floor(projectileCount));
  const direct = towards(origin, target);

  if (count === 1) {
    return [direct];
  }

  if (spreadDeg <= 0) {
    return Array.from({ length: count }, () => direct);
  }

  const halfSpreadRad = degreesToRadians(spreadDeg) / 2;
  const step = count === 1 ? 0 : (halfSpreadRad * 2) / (count - 1);
  const baseAngle = Math.atan2(direct.y, direct.x) - halfSpreadRad;

  return Array.from({ length: count }, (_, index) =>
    normalize({
      x: Math.cos(baseAngle + step * index),
      y: Math.sin(baseAngle + step * index),
    }),
  );
}

export function angleBetweenDeg(a: Vec2, b: Vec2): number {
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  const dot = normalizedA.x * normalizedB.x + normalizedA.y * normalizedB.y;
  const clamped = Math.max(-1, Math.min(1, dot));
  return radiansToDegrees(Math.acos(clamped));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
