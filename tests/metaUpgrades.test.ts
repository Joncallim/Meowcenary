import { describe, expect, it } from 'vitest';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { loadGameData, validateMetaUpgradeCatalog } from '../src/systems/validation';

describe('meta upgrade validation and registry', () => {
  it('loads the shipped catalog in stable order with immutable detached definitions', () => {
    const data = loadGameData();
    const registry = new DataMetaUpgradeRegistry(data);
    expect(registry.all().map((item) => item.id)).toEqual([
      'reinforced-vest', 'quick-paws-training', 'sharpened-ammo', 'magnetic-whiskers',
    ]);
    expect(registry.metaUpgradeById('missing')).toBeUndefined();
    expect(registry.maxLevels()).toEqual({
      'reinforced-vest': 5, 'quick-paws-training': 5, 'sharpened-ammo': 5, 'magnetic-whiskers': 5,
    });
    expect(Object.isFrozen(registry.all())).toBe(true);
    expect(Object.isFrozen(registry.all()[0]?.effects[0])).toBe(true);
    expect(Object.isFrozen(registry.maxLevels())).toBe(true);
    expect(registry.all()[0]).not.toBe(data.metaUpgrades[0]);
  });

  it.each([
    ['invalid id', { id: 'Bad ID' }],
    ['invalid max', { maxLevel: 0 }],
    ['invalid base', { cost: { base: 0, growth: 1.5 } }],
    ['invalid growth', { cost: { base: 10, growth: 0.9 } }],
    ['unknown stat', { effects: [{ stat: 'luck', op: 'add', value: 1 }] }],
    ['invalid op', { effects: [{ stat: 'damage', op: 'set', value: 1 }] }],
    ['invalid add', { effects: [{ stat: 'damage', op: 'add', value: 0 }] }],
    ['invalid mult', { effects: [{ stat: 'damage', op: 'mult', value: 1 }] }],
    ['empty effects', { effects: [] }],
    ['untrimmed name', { name: ' Test Upgrade' }],
    ['empty description', { description: '' }],
    ['excessive max', { maxLevel: 101 }],
    ['fractional base', { cost: { base: 1.5, growth: 1.5 } }],
  ])('rejects %s', (_label, patch) => {
    const valid = definition();
    expect(() => validateMetaUpgradeCatalog([{ ...valid, ...patch }])).toThrow(/meta-upgrades\.json/);
  });

  it('rejects duplicates, duplicate effect pairs, unsafe costs, and unknown fields', () => {
    expect(() => validateMetaUpgradeCatalog([definition(), definition()])).toThrow(/duplicate id/);
    expect(() => validateMetaUpgradeCatalog([{ ...definition(), effects: [
      { stat: 'damage', op: 'add', value: 1 }, { stat: 'damage', op: 'add', value: 2 },
    ] }])).toThrow(/duplicate stat\/op pair/);
    expect(() => validateMetaUpgradeCatalog([{ ...definition(), maxLevel: 100, cost: {
      base: Number.MAX_SAFE_INTEGER, growth: 2,
    } }])).toThrow(/rounded cost/);
    expect(() => validateMetaUpgradeCatalog([{ ...definition(), extra: true }])).toThrow(/unknown field/);
    expect(() => validateMetaUpgradeCatalog([{ ...definition(), cost: { ...definition().cost, extra: true } }]))
      .toThrow(/unknown field/);
    expect(() => validateMetaUpgradeCatalog([{ ...definition(), effects: [
      { stat: 'damage', op: 'mult', value: Number.MAX_VALUE },
    ] }])).toThrow(/non-JSON-safe number|aggregate/);
  });
});

function definition() {
  return {
    id: 'test-upgrade', name: 'Test Upgrade', description: 'A test.', maxLevel: 5,
    cost: { base: 10, growth: 1.5 },
    effects: [{ stat: 'damage', op: 'add', value: 1 }],
  };
}
