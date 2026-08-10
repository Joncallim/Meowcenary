/**
 * Pure cooldown gate for sound keys (Epic 10). No Phaser, no mutable state —
 * the AudioManager owns the per-key last-played map and the update-driven
 * clock (docs/architecture/epic-10-audio.md §7).
 *
 * Frozen semantics:
 * - `lastPlayedMs === undefined` → true (never played);
 * - `cooldownMs <= 0` → true (no gate);
 * - non-finite `nowMs` → false (defensive; the clock must stay finite);
 * - non-finite `lastPlayedMs` → true (treat as never played);
 * - otherwise `nowMs - lastPlayedMs >= cooldownMs` (boundary plays).
 */
export function shouldPlay(
  lastPlayedMs: number | undefined,
  nowMs: number,
  cooldownMs: number,
): boolean {
  if (lastPlayedMs === undefined) return true;
  if (cooldownMs <= 0) return true;
  if (!Number.isFinite(nowMs)) return false;
  if (!Number.isFinite(lastPlayedMs)) return true;
  return nowMs - lastPlayedMs >= cooldownMs;
}
