export interface Vec2 {
  x: number;
  y: number;
}

export const ZERO_VEC2: Vec2 = { x: 0, y: 0 };

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distanceSq(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

export function normalize(v: Vec2): Vec2 {
  const magnitude = length(v);
  if (magnitude === 0) {
    return { ...ZERO_VEC2 };
  }

  return { x: v.x / magnitude, y: v.y / magnitude };
}

export function clampLength(v: Vec2, max: number): Vec2 {
  if (max <= 0) {
    return { ...ZERO_VEC2 };
  }

  const magnitude = length(v);
  if (magnitude === 0 || magnitude <= max) {
    return { ...v };
  }

  const scale = max / magnitude;
  return { x: v.x * scale, y: v.y * scale };
}

export function towards(from: Vec2, to: Vec2): Vec2 {
  return normalize({ x: to.x - from.x, y: to.y - from.y });
}

