import { describe, expect, it } from 'vitest';
import { createRunState } from '../src/gameplay/runState';
import {
  addUnlocks, bankReward, canPurchase, computeRunReward, costOf,
  isUnlocked, permanentModifiers, purchase,
} from '../src/gameplay/meta';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { createDefaultMeta, sanitizeMeta, type MetaState } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

const registry = new DataMetaUpgradeRegistry(loadGameData());
const vest = registry.metaUpgradeById('reinforced-vest')!;

describe('pure meta progression rules', () => {
  it('calculates deterministic zero-based rounded costs and rejects invalid levels', () => {
    expect([0, 1, 2, 3, 4].map((level) => costOf(vest, level))).toEqual([10, 16, 26, 41, 66]);
    expect(costOf(vest, -1)).toBeNull();
    expect(costOf(vest, 1.5)).toBeNull();
    expect(costOf(vest, 5)).toBeNull();
  });

  it.each([
    ['reinforced-vest', [10, 16, 26, 41, 66]],
    ['quick-paws-training', [15, 24, 38, 61, 98]],
    ['sharpened-ammo', [20, 34, 58, 98, 167]],
    ['magnetic-whiskers', [10, 15, 23, 34, 51]],
  ] as const)('pins the exact cost trajectory for %s', (id, expectedCosts) => {
    const definition = registry.metaUpgradeById(id)!;
    const levels = Array.from({ length: definition.maxLevel }, (_, level) => level);
    expect(levels.map((level) => costOf(definition, level))).toEqual(expectedCosts);
    expect(costOf(definition, definition.maxLevel)).toBeNull();
  });

  it('reports unknown, insufficient, max-level, and successful purchase contracts', () => {
    const empty = createDefaultMeta();
    expect(canPurchase(empty, 'unknown', registry)).toEqual({
      ok: false, reason: 'unknown-upgrade', currentLevel: 0, cost: null,
    });
    expect(canPurchase(empty, vest.id, registry)).toEqual({
      ok: false, reason: 'insufficient-scrap', currentLevel: 0, cost: 10,
    });
    const maxed = meta(100, { [vest.id]: 5 });
    expect(canPurchase(maxed, vest.id, registry)).toMatchObject({ ok: false, reason: 'max-level' });
    const source = meta(20, { 'future-upgrade': 7 });
    const result = purchase(source, vest.id, registry);
    expect(result).toEqual({ ok: true, meta: {
      scrap: 10, unlocks: [], permanentUpgrades: { 'future-upgrade': 7, [vest.id]: 1 },
    }, cost: 10, newLevel: 1 });
    expect(result.ok && result.meta).not.toBe(source);
    expect(source.scrap).toBe(20);
    const failure = purchase(empty, vest.id, registry);
    expect(failure.meta).toBe(empty);
  });

  it('handles default unlock semantics through rules and preserves unknown well-formed IDs', () => {
    const source = meta(0, {}, ['character:starter']);
    expect(isUnlocked(source, 'character:starter')).toBe(true);
    expect(isUnlocked(source, 'bad')).toBe(false);
    expect(addUnlocks(source, ['character:starter', 'future:thing', 'bad'])).toEqual({
      ...source, unlocks: ['character:starter', 'future:thing'],
    });
    expect(addUnlocks(source, ['character:starter', 'bad'])).toBe(source);
  });

  it.each([
    ['won', 12.9, 12], ['lost', 12.9, 12], ['won', 0, 0], ['lost', -1, 0],
    ['won', Number.NaN, 0], ['won', Number.POSITIVE_INFINITY, 0],
    ['won', Number.MAX_VALUE, Number.MAX_SAFE_INTEGER],
  ] as const)('computes %s currency %s as %s scrap', (status, currency, scrap) => {
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = status; run.currency = currency; run.xp = 999; run.level = 99; run.kills = 99;
    expect(computeRunReward(run)).toEqual({ scrap, unlocks: [] });
  });

  it('rejects non-terminal rewards and banks purely with saturation and unlock dedupe', () => {
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    for (const status of ['intro', 'active', 'paused'] as const) {
      run.status = status; expect(computeRunReward(run)).toBeNull();
    }
    const source = meta(Number.MAX_SAFE_INTEGER - 2, {}, ['character:cat']);
    const banked = bankReward(source, { scrap: 9.8, unlocks: ['character:cat', 'weapon:new'] });
    expect(banked).toEqual({ ...source, scrap: Number.MAX_SAFE_INTEGER, unlocks: ['character:cat', 'weapon:new'] });
    expect(source.scrap).toBe(Number.MAX_SAFE_INTEGER - 2);
    expect(bankReward(source, { scrap: 0, unlocks: [] })).toBe(source);
    const once = bankReward(createDefaultMeta(), { scrap: 3, unlocks: [] });
    expect(bankReward(once, { scrap: 3, unlocks: [] }).scrap).toBe(6);
  });

  it('expands additive and multiplicative effects per level with unique level sources', () => {
    const additive = permanentModifiers(vest, 3);
    expect(additive.map((modifier) => [modifier.value, modifier.sourceId])).toEqual([
      [10, 'meta:reinforced-vest:1'], [10, 'meta:reinforced-vest:2'], [10, 'meta:reinforced-vest:3'],
    ]);
    const speed = registry.metaUpgradeById('quick-paws-training')!;
    const mult = permanentModifiers(speed, 3);
    expect(mult.map((modifier) => modifier.value)).toEqual([1.03, 1.03, 1.03]);
    expect(Object.isFrozen(mult)).toBe(true);
    expect(Object.isFrozen(mult[0])).toBe(true);
    expect(permanentModifiers(speed, Number.NaN)).toEqual([]);
    expect(permanentModifiers(speed, 1.5)).toEqual([]);
    expect(permanentModifiers(speed, 999)).toHaveLength(speed.maxLevel);
  });
});

function meta(scrap: number, permanentUpgrades: Record<string, number>, unlocks: string[] = []): MetaState {
  return sanitizeMeta({ scrap, unlocks, permanentUpgrades }, registry.maxLevels());
}
