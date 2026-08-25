import type Phaser from 'phaser';

/** The narrow scene seam bindVisualViewportRefresh consults: a scene is
 *  gesture-active exactly when its input controller holds a live pointer
 *  start+current pair. */
export interface GestureSnapshotSource {
  inputController?: {
    getPresentationSnapshot(): { pointerStart: unknown; pointerCurrent: unknown } | null | undefined;
  };
}

/** P1: a gesture is active exactly when the scene's input controller reports
 *  a live pointer start AND current pair. Scenes without an inputController
 *  (e.g. the always-active BootScene) or with a null/undefined snapshot are
 *  INERT — `undefined !== null` must never read as an active gesture, or the
 *  visualViewport refresh arming would defer forever (and re-arm into a
 *  per-frame rAF loop). The parameter is `unknown` so the production gate
 *  (`game.scene.getScenes(true).some(isGestureActive)`) can drive it with
 *  Phaser Scene instances that lack a typed inputController property. */
export function isGestureActive(scene: unknown): boolean {
  const source = scene as GestureSnapshotSource | undefined;
  const snapshot = source?.inputController?.getPresentationSnapshot();
  return snapshot != null && snapshot.pointerStart !== null && snapshot.pointerCurrent !== null;
}

/** Keep Phaser's canvas bounds current while mobile browser chrome moves.
 * Pointer coordinates are deliberately left to Phaser's normal FIT transform. */
export function bindVisualViewportRefresh(game: Phaser.Game, isGestureActive: () => boolean = () => false): () => void {
  const viewport = globalThis.visualViewport;
  const documentTarget = typeof document === 'undefined' ? undefined : document;
  if (!viewport && !documentTarget) return () => undefined;

  let frame = 0;
  let refreshing = false;
  const refresh = (): void => {
    if (isGestureActive()) {
      frame = globalThis.requestAnimationFrame(refresh);
      return;
    }
    refreshing = true;
    try { game.scale.refresh(); } finally { refreshing = false; frame = 0; }
  };
  const schedule = (): void => {
    if (frame !== 0 || refreshing) return;
    frame = globalThis.requestAnimationFrame(refresh);
  };
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  documentTarget?.addEventListener('visibilitychange', schedule);
  return () => {
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    documentTarget?.removeEventListener('visibilitychange', schedule);
    if (frame !== 0) globalThis.cancelAnimationFrame(frame);
    frame = 0;
  };
}
