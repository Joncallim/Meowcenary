import Phaser from 'phaser';

/** Browser game canvas policy. RESIZE keeps one game unit equal to one CSS
 * pixel and lets cameras decide world magnification. This is deliberately not
 * FIT: a fixed-aspect canvas would letterbox wide screens and resize actors. */
export function responsiveScaleConfig(): Phaser.Types.Core.ScaleConfig {
  return {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
    fullscreenTarget: 'game-root',
  };
}
