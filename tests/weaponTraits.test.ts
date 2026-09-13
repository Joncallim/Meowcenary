import { describe, expect, it } from 'vitest';
import { resolveFamilyTraits, resolveTraitModifiers, resolveTraitProjectileEffects, TRAIT_BEHAVIORS } from '../src/gameplay/weaponTraits';

describe('Weapon Traits', () => {
  it('deduplicates traits from multiple sources', () => {
    const result = resolveFamilyTraits([['FIRE'], ['FIRE', 'EXPLOSIVE']]);
    expect(result).toEqual(['FIRE', 'EXPLOSIVE']);
  });

  it('resolves trait modifiers deduped', () => {
    const modifiers = resolveTraitModifiers(['FIRE', 'FIRE', 'PIERCING']);
    // FIRE contributes a damage mult, PIERCING contributes pierce add
    const damageMult = modifiers.find((m) => m.stat === 'damage');
    expect(damageMult).toBeDefined();
    expect(damageMult!.value).toBe(1.15);
    const pierceAdd = modifiers.find((m) => m.stat === 'pierce');
    expect(pierceAdd).toBeDefined();
  });

  it('resolves projectile effects deduped by kind', () => {
    const effects = resolveTraitProjectileEffects(['FIRE', 'FIRE']);
    expect(effects.length).toBe(1);
    expect(effects[0].kind).toBe('burn');
  });

  it('TRAIT_BEHAVIORS contains all traits', () => {
    expect(TRAIT_BEHAVIORS.FIRE).toBeDefined();
    expect(TRAIT_BEHAVIORS.EXPLOSIVE).toBeDefined();
    expect(TRAIT_BEHAVIORS.PIERCING).toBeDefined();
  });
});
