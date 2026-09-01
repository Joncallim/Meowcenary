/** Bounded, data-resolved projectile behaviors.  These are intentionally
 * independent of Phaser and weapon-part IDs so a new part can reuse a
 * behavior without touching combat composition. */
export type ProjectileEffect = ExplosiveProjectileEffect;

export interface ExplosiveProjectileEffect {
  readonly kind: 'explosive';
  readonly radius: number;
  /** Splash damage as a fraction of the direct hit. */
  readonly damageMultiplier: number;
}
