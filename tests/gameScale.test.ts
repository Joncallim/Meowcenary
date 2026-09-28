import { describe, expect, it } from 'vitest';
import './__mocks__/phaser';
import Phaser from 'phaser';
import { responsiveScaleConfig } from '../src/platform/gameScale';

describe('browser canvas scaling policy', () => {
  it('uses Phaser RESIZE with a full-parent canvas rather than fixed FIT letterboxing', () => {
    expect(responsiveScaleConfig()).toEqual({
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
      fullscreenTarget: 'game-root',
    });
  });
});
