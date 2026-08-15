import Phaser from 'phaser';
import type { VisualArtBinding } from '../systems/types';

export interface HeldWeaponPresentation {
  show(binding: Readonly<VisualArtBinding>, x: number, y: number, angle: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

/** One presentation node for the most recent shot. It carries no weapon or
 * combat state; repeated rack shots replace its texture and restart the short
 * visibility window. */
export class HeldWeaponView implements HeldWeaponPresentation {
  private readonly image: Phaser.GameObjects.Image;
  private remainingMs = 0;

  constructor(scene: Phaser.Scene, private readonly visibleMs = 110) {
    this.image = scene.add.image(0, 0, '__DEFAULT')
      .setDepth(6)
      .setOrigin(0.18, 0.5)
      .setActive(false)
      .setVisible(false);
  }

  show(binding: Readonly<VisualArtBinding>, x: number, y: number, angle: number): void {
    if (binding.kind !== 'weapon-held') return;
    const pointsLeft = Math.cos(angle) < 0;
    this.image
      .setTexture(binding.textureKey)
      .setDisplaySize(binding.display.width, binding.display.height)
      .setPosition(x, y)
      .setRotation(angle + (pointsLeft ? Math.PI : 0))
      .setFlipY(pointsLeft)
      .setActive(true)
      .setVisible(true);
    this.remainingMs = this.visibleMs;
  }

  update(dtMs: number): void {
    if (this.remainingMs <= 0 || !Number.isFinite(dtMs) || dtMs <= 0) return;
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    if (this.remainingMs === 0) this.image.setActive(false).setVisible(false);
  }

  destroy(): void {
    this.remainingMs = 0;
    this.image.destroy();
  }
}
