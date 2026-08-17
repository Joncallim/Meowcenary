import { describe, expect, it } from 'vitest';
import { ModifierStack } from '../src/gameplay/stats';

describe('ModifierStack', () => {
  it('resolves additive modifiers before multiplicative modifiers', () => {
    const stats = new ModifierStack();
    stats.add({ stat: 'damage', op: 'mult', value: 2, sourceId: 'double' });
    stats.add({ stat: 'damage', op: 'add', value: 5, sourceId: 'bonus' });

    expect(stats.resolve('damage', 10)).toBe(30);
  });

  it('removes every modifier from a source', () => {
    const stats = new ModifierStack();
    stats.add({ stat: 'damage', op: 'add', value: 5, sourceId: 'upgrade-a' });
    stats.add({ stat: 'moveSpeed', op: 'add', value: 10, sourceId: 'upgrade-a' });
    stats.add({ stat: 'damage', op: 'add', value: 2, sourceId: 'upgrade-b' });

    stats.remove('upgrade-a');

    expect(stats.resolve('damage', 10)).toBe(12);
    expect(stats.resolve('moveSpeed', 100)).toBe(100);
  });

  it('counts modifiers by source', () => {
    const stats = new ModifierStack();
    stats.add({ stat: 'xpGain', op: 'mult', value: 1.25, sourceId: 'catnip' });
    stats.add({ stat: 'damage', op: 'add', value: 1, sourceId: 'catnip' });

    expect(stats.countBySource('catnip')).toBe(2);
    expect(stats.countBySource('missing')).toBe(0);
  });

  it('rejects non-finite inputs and resolved overflow', () => {
    const stats = new ModifierStack();

    expect(() =>
      stats.add({ stat: 'damage', op: 'add', value: Number.NaN, sourceId: 'invalid' }),
    ).toThrow(/finite/);
    expect(() => stats.resolve('damage', Number.POSITIVE_INFINITY)).toThrow(/finite/);

    stats.add({ stat: 'damage', op: 'mult', value: 2, sourceId: 'overflow' });
    expect(() => stats.resolve('damage', Number.MAX_VALUE)).toThrow(/finite/);
  });

  describe('resolveWeapon (Epic 18 D4)', () => {
    it('applies an unscoped modifier to any family, identically to resolve()', () => {
      const stats = new ModifierStack();
      stats.add({ stat: 'damage', op: 'add', value: 5, sourceId: 'global' });
      stats.add({ stat: 'damage', op: 'mult', value: 2, sourceId: 'global-mult' });

      expect(stats.resolveWeapon('damage', 10, 'pistol')).toBe(stats.resolve('damage', 10));
      expect(stats.resolveWeapon('damage', 10, 'shotgun')).toBe(stats.resolve('damage', 10));
    });

    it('applies a family-scoped modifier only to the matching family', () => {
      const stats = new ModifierStack();
      stats.add({
        stat: 'damage',
        op: 'mult',
        value: 2,
        sourceId: 'pistol-only',
        scope: { kind: 'weapon-family', family: 'pistol' },
      });

      expect(stats.resolveWeapon('damage', 10, 'pistol')).toBe(20);
      expect(stats.resolveWeapon('damage', 10, 'shotgun')).toBe(10);
    });

    it('composes global and matching-family effects in two-pass insertion-order add-then-multiply', () => {
      const stats = new ModifierStack();
      stats.add({ stat: 'damage', op: 'add', value: 5, sourceId: 'global-add' });
      stats.add({
        stat: 'damage',
        op: 'add',
        value: 3,
        sourceId: 'pistol-add',
        scope: { kind: 'weapon-family', family: 'pistol' },
      });
      stats.add({ stat: 'damage', op: 'mult', value: 2, sourceId: 'global-mult' });
      stats.add({
        stat: 'damage',
        op: 'mult',
        value: 1.5,
        sourceId: 'pistol-mult',
        scope: { kind: 'weapon-family', family: 'pistol' },
      });

      // add pass: 10 + 5 + 3 = 18; mult pass: 18 * 2 * 1.5 = 54.
      expect(stats.resolveWeapon('damage', 10, 'pistol')).toBe(54);
      // Non-matching family only sees the unscoped effects: (10 + 5) * 2 = 30.
      expect(stats.resolveWeapon('damage', 10, 'smg')).toBe(30);
    });

    it('defensively copies a modifier scope so caller mutation cannot retarget a stored modifier', () => {
      const stats = new ModifierStack();
      const scope = { kind: 'weapon-family' as const, family: 'pistol' };
      stats.add({ stat: 'damage', op: 'add', value: 100, sourceId: 'scoped', scope });
      scope.family = 'shotgun';

      expect(stats.resolveWeapon('damage', 0, 'pistol')).toBe(100);
      expect(stats.resolveWeapon('damage', 0, 'shotgun')).toBe(0);
    });

    it('rejects a non-finite base value and a non-finite resolved aggregate', () => {
      const stats = new ModifierStack();
      expect(() => stats.resolveWeapon('damage', Number.NaN, 'pistol')).toThrow(/finite/);

      stats.add({ stat: 'damage', op: 'mult', value: 2, sourceId: 'overflow' });
      expect(() => stats.resolveWeapon('damage', Number.MAX_VALUE, 'pistol')).toThrow(/finite/);
    });
  });
});
