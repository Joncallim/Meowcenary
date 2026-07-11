import { beforeEach, describe, expect, it } from 'vitest';
import { canMerge, mergeResult, replaceMergedWeapons } from '../src/gameplay/merge';
import { createWeaponInstance } from '../src/gameplay/weapons';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { loadGameData } from '../src/systems/validation';

describe('weapon merge rules', () => {
  let registry: DataWeaponRegistry;

  beforeEach(() => {
    registry = new DataWeaponRegistry(loadGameData());
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

  it('rejects stale instance state that disagrees with the second definition', () => {
    const pistol = registry.weaponById('scrap-pistol-t1');
    const smg = registry.weaponById('can-smg-t1');
    if (!pistol || !smg) {
      throw new Error('missing test weapon');
    }

    const a = createWeaponInstance(pistol, 'a');
    const stale = {
      ...createWeaponInstance(smg, 'b'),
      family: 'pistol',
    };

    expect(canMerge(a, stale, registry)).toBe(false);
    expect(mergeResult(a, stale, registry)).toBeNull();
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

  it('does not mint a result when either input is absent or duplicated', () => {
    const pistol = registry.weaponById('scrap-pistol-t1');
    const tier2 = registry.weaponById('scrap-pistol-t2');
    if (!pistol || !tier2) {
      throw new Error('missing test weapon');
    }

    const a = createWeaponInstance(pistol, 'a');
    const b = createWeaponInstance(pistol, 'b');
    const result = createWeaponInstance(tier2, 'result');

    expect(replaceMergedWeapons([a], a, b, result)).toEqual([a]);
    expect(replaceMergedWeapons([a, a, b], a, b, result)).toEqual([a, a, b]);
  });

  it('does not insert a result whose instance id already exists', () => {
    const pistol = registry.weaponById('scrap-pistol-t1');
    const tier2 = registry.weaponById('scrap-pistol-t2');
    if (!pistol || !tier2) {
      throw new Error('missing test weapon');
    }

    const a = createWeaponInstance(pistol, 'a');
    const b = createWeaponInstance(pistol, 'b');
    const result = createWeaponInstance(tier2, 'a');

    expect(replaceMergedWeapons([a, b], a, b, result)).toEqual([a, b]);
  });
});
