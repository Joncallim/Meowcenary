/**
 * Shared weapon behavior traits — gameplay-owned, not Gunsmith-owned.
 *
 * V4 (Slice D): FIRE, EXPLOSIVE, PIERCING are shared gameplay primitives
 * that can be contributed by both Gunsmith Parts and Equipment Set
 * thresholds. The behavior is deduplicated once per weapon family.
 */
import type { Modifier } from './stats';
import type { ProjectileEffect } from './projectileEffects';

export type BehaviorTrait = 'FIRE' | 'EXPLOSIVE' | 'PIERCING';

export const BEHAVIOR_TRAITS: readonly BehaviorTrait[] = ['FIRE', 'EXPLOSIVE', 'PIERCING'];

/** Registered live behavior for transferable traits. */
export interface TraitBehavior {
  readonly modifier?: Omit<Modifier, 'sourceId' | 'scope'>;
  readonly projectileEffect?: ProjectileEffect;
}

export const TRAIT_BEHAVIORS: Readonly<Record<BehaviorTrait, TraitBehavior>> = Object.freeze({
  FIRE: {
    modifier: { stat: 'damage', op: 'mult', value: 1.15 },
    projectileEffect: { kind: 'burn', durationMs: 2_000, tickIntervalMs: 500, damageMultiplier: 0.2 },
  },
  EXPLOSIVE: { projectileEffect: { kind: 'explosive', radius: 80, damageMultiplier: 0.65 } },
  PIERCING: { modifier: { stat: 'pierce', op: 'add', value: 1 } },
});

/** Resolve unique traits for a weapon family, deduplicating the same trait
 *  from multiple sources. */
export function resolveFamilyTraits(
  sources: (readonly BehaviorTrait[])[],
): readonly BehaviorTrait[] {
  const seen = new Set<BehaviorTrait>();
  const result: BehaviorTrait[] = [];
  for (const source of sources) {
    for (const trait of source) {
      if (!seen.has(trait)) {
        seen.add(trait);
        result.push(trait);
      }
    }
  }
  return result;
}

/** Get the combined modifier contribution for a set of traits (deduped). */
export function resolveTraitModifiers(
  traits: readonly BehaviorTrait[],
): readonly Omit<Modifier, 'sourceId' | 'scope'>[] {
  const modifiers: Omit<Modifier, 'sourceId' | 'scope'>[] = [];
  const seen = new Set<string>();
  for (const trait of traits) {
    const behavior = TRAIT_BEHAVIORS[trait];
    if (behavior?.modifier) {
      const key = `${behavior.modifier.stat}:${behavior.modifier.op}`;
      if (!seen.has(key)) {
        seen.add(key);
        modifiers.push(behavior.modifier);
      }
    }
  }
  return modifiers;
}

/** Get the combined projectile effects for a set of traits (deduped by kind). */
export function resolveTraitProjectileEffects(
  traits: readonly BehaviorTrait[],
): readonly ProjectileEffect[] {
  const effects: ProjectileEffect[] = [];
  const seen = new Set<string>();
  for (const trait of traits) {
    const behavior = TRAIT_BEHAVIORS[trait];
    if (behavior?.projectileEffect) {
      const kind = behavior.projectileEffect.kind;
      if (!seen.has(kind)) {
        seen.add(kind);
        effects.push(behavior.projectileEffect);
      }
    }
  }
  return effects;
}
