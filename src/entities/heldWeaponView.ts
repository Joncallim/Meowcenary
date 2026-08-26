import Phaser from 'phaser';
import type { VisualArtBinding } from '../systems/types';
import { VisualDepth } from '../systems/visualDepths';
import { ACTOR_VISUAL_SCALE_BY_KIND } from './actorView';

// A held weapon is anchored at the character's grip, so its display and
// recoil must follow the character's presentation scale rather than combat.
const HELD_WEAPON_VISUAL_FACTOR = ACTOR_VISUAL_SCALE_BY_KIND.character;

export interface HeldWeaponPresentation {
  show(binding: Readonly<VisualArtBinding>, x: number, y: number, angle: number, recoilPx?: number): void;
  /** Advance the visibility window while anchoring the presentation to the
   * caller-provided world position, so a moving player never leaves the held
   * weapon behind at its firing coordinates. */
  update(dtMs: number, x: number, y: number): void;
  destroy(): void;
}

/** One presentation node for the most recent shot. It carries no weapon or
 * combat state; repeated rack shots replace its texture and restart the short
 * visibility window. */
export class HeldWeaponView implements HeldWeaponPresentation {
  private readonly image: Phaser.GameObjects.Image;
  private remainingMs = 0;
  private recoilOffsetX = 0;
  private recoilOffsetY = 0;

  constructor(scene: Phaser.Scene, private readonly visibleMs = 110) {
    this.image = scene.add.image(0, 0, '__DEFAULT')
      .setDepth(VisualDepth.heldWeapon)
      .setOrigin(0.18, 0.5)
      .setActive(false)
      .setVisible(false);
  }

  /** recoilPx (Epic 17, presentation-only) kicks the muzzle a few pixels
   *  back along the firing angle for the flash's visible window — a static
   *  offset, not an animated tween, per this codebase's dt-driven cosmetic
   *  convention. */
  show(binding: Readonly<VisualArtBinding>, x: number, y: number, angle: number, recoilPx = 0): void {
    if (binding.kind !== 'weapon-held') return;
    const pointsLeft = Math.cos(angle) < 0;
    this.recoilOffsetX = -Math.cos(angle) * recoilPx * HELD_WEAPON_VISUAL_FACTOR;
    this.recoilOffsetY = -Math.sin(angle) * recoilPx * HELD_WEAPON_VISUAL_FACTOR;
    this.image
      .setTexture(binding.textureKey)
      .setDisplaySize(
        binding.display.width * HELD_WEAPON_VISUAL_FACTOR,
        binding.display.height * HELD_WEAPON_VISUAL_FACTOR,
      )
      .setPosition(x + this.recoilOffsetX, y + this.recoilOffsetY)
      // The held-weapon sheets point along local +X, so the raw firing angle
      // already aims the barrel at the target. The vertical mirror only turns
      // the silhouette into its off-hand grip; adding π would reverse the
      // barrel away from a left-side target.
      .setRotation(angle)
      .setFlipY(pointsLeft)
      .setActive(true)
      .setVisible(true);
    this.remainingMs = this.visibleMs;
  }

  update(dtMs: number, x: number, y: number): void {
    if (this.remainingMs <= 0 || !Number.isFinite(dtMs) || dtMs <= 0) return;
    // Anchor to the live player position while preserving the shot's static
    // recoil offset for the whole visibility window.
    this.image.setPosition(x + this.recoilOffsetX, y + this.recoilOffsetY);
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
    if (this.remainingMs === 0) this.image.setActive(false).setVisible(false);
  }

  destroy(): void {
    this.remainingMs = 0;
    this.image.destroy();
  }
}
