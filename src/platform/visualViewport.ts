import type Phaser from 'phaser';

/** Keep Phaser's canvas bounds current while mobile browser chrome moves.
 * Pointer coordinates are deliberately left to Phaser's normal FIT transform. */
export function bindVisualViewportRefresh(game: Phaser.Game): () => void {
  const viewport = globalThis.visualViewport;
  if (!viewport) return () => undefined;

  let frame = 0;
  const refresh = (): void => {
    frame = 0;
    game.scale.refresh();
  };
  const schedule = (): void => {
    if (frame !== 0) return;
    frame = globalThis.requestAnimationFrame(refresh);
  };
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  return () => {
    viewport.removeEventListener('resize', schedule);
    viewport.removeEventListener('scroll', schedule);
    if (frame !== 0) globalThis.cancelAnimationFrame(frame);
    frame = 0;
  };
}
