import Phaser from 'phaser';

/** Fixed high-DPI backing resolution for every Phaser UI text canvas. */
export const UI_TEXT_RESOLUTION = 2;

/** The sole production UI Text constructor. Caller style is merged first so
 * resolution is always authoritative and cannot be weakened at call sites. */
export function createUiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, value, { ...style, resolution: UI_TEXT_RESOLUTION });
}

/** Convert a logical Phaser UI rectangle to the backing-canvas crop space.
 * Text is rendered at UI_TEXT_RESOLUTION, while Phaser's crop API takes
 * source-canvas pixels. */
export function uiTextCrop(width: number, height: number): readonly [number, number, number, number] {
  return [0, 0, width * UI_TEXT_RESOLUTION, height * UI_TEXT_RESOLUTION];
}
