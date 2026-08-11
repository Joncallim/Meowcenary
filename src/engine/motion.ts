export function shouldUseHeavyMotion(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

export function motionDuration(baseMs: number, reducedMotion: boolean): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return 0;
  return reducedMotion ? 0 : baseMs;
}
