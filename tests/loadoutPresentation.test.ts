import { describe, expect, it } from 'vitest';
import { STAT_KEYS, WEAPON_BEHAVIOR_STAT_KEYS, WEAPON_MODIFIER_STAT_KEYS } from '../src/gameplay/stats';
import { loadoutStatImprovement, presentLoadoutModifier, presentLoadoutRunTruthComparison, presentLoadoutTrait } from '../src/ui/loadoutPresentation';

describe('shared Loadout effect language', () => {
  it('classifies every registered stat using the same weapon-facing vocabulary as gameplay', () => {
    for (const stat of [...STAT_KEYS, ...WEAPON_BEHAVIOR_STAT_KEYS]) {
      const row = presentLoadoutModifier({ stat, op: 'add', value: 1 });
      expect(row.label).not.toBe(stat);
      expect(row.target.kind).toBe((WEAPON_MODIFIER_STAT_KEYS as readonly string[]).includes(stat) ? 'all-weapons' : 'mercenary');
      expect(Object.isFrozen(row.modifier)).toBe(true);
    }
  });

  it('scales effects once and resolves family scope explicitly', () => {
    expect(presentLoadoutModifier({ stat: 'attackSpeed', op: 'mult', value: 1.05 }, 3)).toMatchObject({
      label: 'Fire Rate', value: '+15%', target: { label: 'All Weapons' },
    });
    expect(presentLoadoutModifier({ stat: 'attackSpeed', op: 'mult', value: 1.05 }, 3).modifier.value).toBeCloseTo(1.15);
    expect(presentLoadoutModifier({ stat: 'damage', op: 'add', value: 3, scope: { kind: 'weapon-family', family: 'pistol' } }, 2))
      .toMatchObject({ value: '+6', target: { kind: 'weapon-family', familyId: 'pistol', label: 'Pistol' } });
    expect(presentLoadoutTrait('FIRE')).toMatchObject({ target: { kind: 'all-weapons' } });
    expect(presentLoadoutTrait('FIRE', 'pistol')).toMatchObject({ target: { kind: 'weapon-family', familyId: 'pistol' } });
  });

  it('presents lower spread as better accuracy using correct additive or multiplicative units', () => {
    expect(presentLoadoutModifier({ stat: 'spreadDeg', op: 'add', value: -2 }).value).toBe('+2°');
    expect(presentLoadoutModifier({ stat: 'spreadDeg', op: 'mult', value: 0.9 }).value).toBe('+10%');
    expect(loadoutStatImprovement('spreadDeg', 8, 6)).toBe('better');
    expect(loadoutStatImprovement('damage', 8, 6)).toBe('worse');
    expect(loadoutStatImprovement('damage', 8, 8)).toBe('same');
  });

  it('fails explicitly on unsupported future scopes rather than mislabelling them as global', () => {
    expect(() => presentLoadoutModifier({ stat: 'damage', op: 'add', value: 1, scope: { kind: 'future' } } as never)).toThrow('Unsupported Loadout modifier scope');
  });

  it('compares typed modifier, trait, target, and projectile truth without parsing surface copy', () => {
    const before = {
      modifiers: [{ stat: 'damage' as const, op: 'add' as const, value: 2, sourceId: 'part:old' }],
      families: [{ familyId: 'pistol', projectileEffects: [], traits: [{ trait: 'FIRE' as const, sourceIds: ['part:old'], sourceLabels: ['Old'], deduplicated: false }] }],
    };
    const after = {
      modifiers: [{ stat: 'damage' as const, op: 'add' as const, value: 4, sourceId: 'part:old' }],
      families: [{ familyId: 'pistol', projectileEffects: [{ kind: 'burn' as const, durationMs: 500, tickIntervalMs: 100, damageMultiplier: 0.5 }], traits: [{ trait: 'FIRE' as const, sourceIds: ['part:old', 'set:pyro'], sourceLabels: ['Old', 'Pyro'], deduplicated: true }] }],
    };
    const comparison = presentLoadoutRunTruthComparison(before, after);
    expect(comparison.modifiers).toMatchObject([{ state: 'changed', label: 'Damage', target: { label: 'All Weapons' }, beforeValue: '+2', afterValue: '+4' }]);
    expect(comparison.traits).toMatchObject([{ familyId: 'pistol', trait: 'FIRE', before: true, after: true, beforeDeduplicated: false, afterDeduplicated: true }]);
    expect(comparison.projectileEffects).toHaveLength(1);
    expect(Object.isFrozen(comparison)).toBe(true);
    expect(Object.isFrozen(comparison.modifiers[0])).toBe(true);
  });

  it('retains provenance-only trait source changes as typed deltas', () => {
    const before = { modifiers: [], families: [{ familyId: 'pistol', projectileEffects: [], traits: [{ trait: 'FIRE' as const, sourceIds: ['old'], sourceLabels: ['Old source'], deduplicated: false }] }] };
    const after = { modifiers: [], families: [{ familyId: 'pistol', projectileEffects: [], traits: [{ trait: 'FIRE' as const, sourceIds: ['new'], sourceLabels: ['New source'], deduplicated: false }] }] };
    expect(presentLoadoutRunTruthComparison(before, after).traits).toMatchObject([{ trait: 'FIRE', sourceChanged: true, beforeSourceLabels: ['Old source'], afterSourceLabels: ['New source'] }]);
  });
});
