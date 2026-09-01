/** Bounded, data-resolved projectile behaviors.  These are intentionally
 * independent of Phaser and weapon-part IDs so a new part can reuse a
 * behavior without touching combat composition. */
export type ProjectileEffect = ExplosiveProjectileEffect | BurnProjectileEffect;

export interface ExplosiveProjectileEffect {
  readonly kind: 'explosive';
  readonly radius: number;
  /** Splash damage as a fraction of the direct hit. */
  readonly damageMultiplier: number;
}

/** A bounded on-hit damage-over-time payload.  It lives on the projectile so
 * Gunsmith traits affect the real weapon path without component-ID checks. */
export interface BurnProjectileEffect {
  readonly kind: 'burn';
  readonly durationMs: number;
  readonly tickIntervalMs: number;
  readonly damageMultiplier: number;
}
