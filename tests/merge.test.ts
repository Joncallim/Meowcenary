import { beforeEach, describe, expect, it } from 'vitest';
import { canMerge, mergeResult, replaceMergedWeapons } from '../src/gameplay/merge';
import {
  createWeaponInstance,
  resetWeaponInstanceIdsForTests,
} from '../src/gameplay/weapons';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';

describe('weapon merge rules', () => {
  const registry = new DataWeaponRegistry(loadGameData());

  beforeEach(() => {
    resetWeaponInstanceIdsForTests();
  });

  it('accepts same family and same tier below max', () => {
    const def = registry.weaponById('scrap-pistol-t1');
    if (!def) {
      throw new Error('missing test weapon');
    }

    expect(
      canMerge(
        createWeaponInstance(def, 'a'),
        createWeaponInstance(def, 'b'),
        registry,
      ),
    ).toBe(true);
  });

  it('rejects mismatched family', () => {
    const pistol = registry.weaponById('scrap-pistol-t1');
    const smg = registry.weaponById('can-smg-t1');
    if (!pistol || !smg) {
      throw new Error('missing test weapon');
    }

    expect(canMerge(createWeaponInstance(pistol, 'a'), createWeaponInstance(smg, 'b'), registry)).toBe(
      false,
    );
  });

  it('rejects mismatched tier', () => {
    const tier1 = registry.weaponById('scrap-pistol-t1');
    const tier2 = registry.weaponById('scrap-pistol-t2');
    if (!tier1 || !tier2) {
      throw new Error('missing test weapon');
    }

    expect(
      canMerge(createWeaponInstance(tier1, 'a'), createWeaponInstance(tier2, 'b'), registry),
    ).toBe(false);
  });

  it('rejects max-tier weapons', () => {
    const maxTier = registry.weaponById('scrap-pistol-t3');
    if (!maxTier) {
      throw new Error('missing test weapon');
    }

    expect(
      canMerge(
        createWeaponInstance(maxTier, 'a'),
        createWeaponInstance(maxTier, 'b'),
        registry,
      ),
    ).toBe(false);
  });

  it('returns a next-tier merge result', () => {
    const tier1 = registry.weaponById('scrap-pistol-t1');
    if (!tier1) {
      throw new Error('missing test weapon');
    }

    const result = mergeResult(
      createWeaponInstance(tier1, 'a'),
      createWeaponInstance(tier1, 'b'),
      registry,
    );

    expect(result).toMatchObject({
      defId: 'scrap-pistol-t2',
      family: 'pistol',
      tier: 2,
    });
    expect(result?.instanceId).toBe('weapon-1');
  });

  it('consumes two input weapons and inserts one result', () => {
    const pistol = registry.weaponById('scrap-pistol-t1');
    const smg = registry.weaponById('can-smg-t1');
    const tier2 = registry.weaponById('scrap-pistol-t2');
    if (!pistol || !smg || !tier2) {
      throw new Error('missing test weapon');
    }

    const a = createWeaponInstance(pistol, 'a');
    const b = createWeaponInstance(pistol, 'b');
    const kept = createWeaponInstance(smg, 'kept');
    const result = createWeaponInstance(tier2, 'merged');

    expect(replaceMergedWeapons([a, kept, b], a, b, result)).toEqual([kept, result]);
  });
});
