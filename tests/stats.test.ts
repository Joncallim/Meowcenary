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
});
