import { describe, expect, it } from 'vitest';
import gunPartsJson from '../src/data/gun-parts.json';
import { loadGameData, validateGameData } from '../src/systems/validation';
import { DataPartRegistry } from '../src/systems/parts';
import {
  BEHAVIOR_TRAITS,
  MAX_TRAITS_PER_PART,
  PART_SLOTS,
  WEAPON_SLOT_COMPATIBILITY,
  buildHasTrait,
  compatibleSlotsFor,
  equipPart,
  infuseTrait,
  isSlotCompatible,
  mergeParts,
  resolveBuildModifiers,
  resolveBuildTraitModifiers,
  unequipPart,
  type OwnedPart,
  type PartDefinition,
  type WeaponBuild,
} from '../src/gameplay/gunsmith';
import { createDefaultSaveV3, SaveManager, MemoryStorageAdapter } from '../src/systems/save';

const definitions = gunPartsJson as unknown as PartDefinition[];
const defMap = new Map(definitions.map((d) => [d.id, d]));

function part(partId: string, infusedTraits: readonly string[] = [], tier = 1): OwnedPart {
  return { instanceId: `inst-${partId}-${Math.random().toString(36).slice(2, 8)}`, partId, tier, infusedTraits: [...infusedTraits] as OwnedPart['infusedTraits'] };
}

function ownedMap(...parts: readonly OwnedPart[]): ReadonlyMap<string, OwnedPart> {
  return new Map(parts.map((owned) => [owned.instanceId, owned]));
}

function smgBuild(): WeaponBuild {
  return { id: 'build-1', name: 'Rack SMG', baseWeaponFamily: 'smg', fitted: {}, traitParts: [] };
}

describe('Epic 23 part catalog conformance', () => {
  it('ships a catalog with stable unique part: IDs across distinct slots', () => {
    expect(definitions.length).toBeGreaterThanOrEqual(8);
    const ids = definitions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^part:[a-z0-9-]+$/);
    const slots = new Set(definitions.map((d) => d.slot));
    expect(slots.size).toBeGreaterThanOrEqual(5);
  });

  it('validates through the aggregate game-data validation', () => {
    const data = loadGameData();
    expect(data.gunParts?.length).toBe(definitions.length);
    expect(validateGameData(data)).toBeTruthy();
  });

  it('every part slot is a legal slot and every trait is a legal trait', () => {
    for (const d of definitions) {
      expect(PART_SLOTS).toContain(d.slot);
      for (const trait of d.traits) expect(BEHAVIOR_TRAITS).toContain(trait);
      expect(d.traits.length).toBeLessThanOrEqual(MAX_TRAITS_PER_PART);
    }
  });

  it('effect sourceIds equal the owning part id', () => {
    for (const d of definitions) {
      for (const effect of d.effects) expect(effect.sourceId).toBe(d.id);
    }
  });

  it('slot compatibility covers every family', () => {
    for (const family of ['pistol', 'smg', 'shotgun']) {
      expect(compatibleSlotsFor(family).length).toBeGreaterThan(0);
      for (const slot of compatibleSlotsFor(family)) {
        expect(isSlotCompatible(family, slot)).toBe(true);
      }
    }
    // A family the table does not know is incompatible with everything.
    expect(isSlotCompatible('unknown-family', 'barrel')).toBe(false);
  });
});

describe('Epic 23 equip/unequip (transactional)', () => {
  it('equips a compatible part and rejects incompatible slots', () => {
    let build = smgBuild();
    const barrel = part('part:barrel-standard');
    const result = equipPart(build, barrel, defMap);
    expect(result.ok).toBe(true);
    if (result.ok) build = result.build;
    expect(build.fitted.barrel).toBe(barrel.instanceId);

    // A shotgun-only underbarrel cannot fit an SMG.
    const underbarrel = part('part:underbarrel-grenade');
    expect(equipPart(build, underbarrel, defMap)).toMatchObject({ ok: false, reason: 'slot-incompatible' });
    // Unknown part id fails closed.
    expect(equipPart(build, part('part:does-not-exist'), defMap)).toMatchObject({ ok: false, reason: 'unknown-part' });
  });

  it('rejects equipping into an occupied slot without losing the existing part', () => {
    let build = smgBuild();
    const barrel = part('part:barrel-standard');
    build = (equipPart(build, barrel, defMap) as { ok: true; build: WeaponBuild }).build;
    const secondBarrel = part('part:barrel-long');
    const result = equipPart(build, secondBarrel, defMap);
    expect(result).toMatchObject({ ok: false, reason: 'slot-full' });
    expect(build.fitted.barrel).toBe(barrel.instanceId);
  });

  it('never fits one owned instance into more than one slot', () => {
    const build: WeaponBuild = { ...smgBuild(), fitted: { barrel: 'inst-shared' } };
    const shared = { instanceId: 'inst-shared', partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] } as OwnedPart;
    expect(equipPart(build, shared, defMap)).toMatchObject({ ok: false, reason: 'slot-full' });
  });

  it('unequips exactly the fitted part and no other state', () => {
    let build = smgBuild();
    const barrel = part('part:barrel-standard');
    build = (equipPart(build, barrel, defMap) as { ok: true; build: WeaponBuild }).build;
    const result = unequipPart(build, barrel.instanceId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.build.fitted.barrel).toBeUndefined();
      expect(result.build.fitted.receiver).toBeUndefined();
    }
    expect(unequipPart(build, 'part:not-fitted')).toMatchObject({ ok: false, reason: 'unknown-part' });
  });

  it('trait parts accumulate up to the cap', () => {
    let build = smgBuild();
    build = (equipPart(build, part('part:trait-fire'), defMap) as { ok: true; build: WeaponBuild }).build;
    build = (equipPart(build, part('part:trait-fire'), defMap) as { ok: true; build: WeaponBuild }).build;
    expect(build.traitParts.length).toBe(2);
    const third = equipPart(build, part('part:trait-fire'), defMap);
    expect(third).toMatchObject({ ok: false, reason: 'slot-full' });
  });
});

describe('Epic 23 merge (exactly documented inputs/outputs)', () => {
  it('merges two copies of the same part into one consumed-output pair', () => {
    const first = part('part:barrel-standard');
    const second = part('part:barrel-standard');
    const result = mergeParts(first, second, defMap);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.consumed).toEqual([first.instanceId, second.instanceId]);
      expect(result.output.partId).toBe('part:barrel-standard');
      expect(result.output.instanceId).not.toBe(first.instanceId);
      expect(result.output.tier).toBe(2);
    }
  });

  it('rejects merging different parts or a part with itself', () => {
    expect(mergeParts(part('part:barrel-standard'), part('part:barrel-long'), defMap))
      .toMatchObject({ ok: false, reason: 'different-parts' });
    const single = part('part:barrel-standard');
    expect(mergeParts(single, single, defMap)).toMatchObject({ ok: false, reason: 'missing-parts' });
  });

  it('merge unions and caps infused traits', () => {
    const first = { ...part('part:barrel-standard'), infusedTraits: ['FIRE'] as const };
    const second = { ...part('part:barrel-standard'), infusedTraits: ['FIRE', 'CRYO'] as const };
    const result = mergeParts(first, second, defMap);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.infusedTraits).toEqual(['FIRE', 'CRYO']);
      expect(result.output.infusedTraits.length).toBeLessThanOrEqual(MAX_TRAITS_PER_PART);
    }
  });

  it('refuses a merge across different owned upgrade tiers', () => {
    expect(mergeParts(part('part:barrel-standard', [], 1), part('part:barrel-standard', [], 2), defMap))
      .toMatchObject({ ok: false, reason: 'different-tiers' });
  });
});

describe('Epic 23 trait infusion (hybrid outcomes)', () => {
  it('a conventional barrel acquires FIRE through the intended infusion path', () => {
    const barrel = part('part:barrel-standard');
    const fireCore = part('part:trait-fire');
    const result = infuseTrait(barrel, fireCore, defMap);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output.infusedTraits).toContain('FIRE');
      // The resulting part is the same base definition with a transferable trait.
      expect(result.output.partId).toBe('part:barrel-standard');
    }
  });

  it('rejects invalid infusion combinations deterministically', () => {
    const barrel = part('part:barrel-standard');
    expect(infuseTrait(barrel, part('part:barrel-long'), defMap)).toMatchObject({ ok: false, reason: 'unknown-trait' });
    expect(infuseTrait(barrel, part('part:underbarrel-grenade'), defMap)).toMatchObject({ ok: false, reason: 'unknown-trait' });
    const capped = { ...barrel, infusedTraits: ['FIRE', 'CRYO'] as const };
    expect(infuseTrait(capped, part('part:trait-fire'), defMap)).toMatchObject({ ok: false, reason: 'trait-cap-reached' });
    const duplicate = { ...barrel, infusedTraits: ['FIRE'] as const };
    expect(infuseTrait(duplicate, part('part:trait-fire'), defMap)).toMatchObject({ ok: false, reason: 'trait-cap-reached' });
  });
});

describe('Epic 23 effective stat resolution', () => {
  it('ignores duplicate, wrong-slot, and incompatible saved references', () => {
    const barrel = { instanceId: 'shared', partId: 'part:barrel-standard', tier: 2, infusedTraits: [] } as OwnedPart;
    const invalid: WeaponBuild = {
      ...smgBuild(),
      fitted: { barrel: 'shared', optic: 'shared', underbarrel: 'shared', forged: 'shared' } as WeaponBuild['fitted'],
      traitParts: ['shared'],
    };
    const modifiers = resolveBuildModifiers(invalid, defMap, ownedMap(barrel));
    expect(modifiers).toHaveLength(defMap.get('part:barrel-standard')!.effects.length);
    expect(modifiers.every((modifier) => modifier.sourceId === 'shared')).toBe(true);
  });

  it('resolves build modifiers from fitted parts (single source of truth)', () => {
    let build = smgBuild();
    const barrel = part('part:barrel-long', [], 2);
    const optic = part('part:optic-red-dot');
    build = (equipPart(build, barrel, defMap) as { ok: true; build: WeaponBuild }).build;
    build = (equipPart(build, optic, defMap) as { ok: true; build: WeaponBuild }).build;
    const modifiers = resolveBuildModifiers(build, defMap, ownedMap(barrel, optic));
    expect(modifiers.some((m) => m.stat === 'range' && m.value === 70 && m.sourceId === barrel.instanceId)).toBe(true);
    expect(modifiers.some((m) => m.stat === 'spreadDeg' && m.value === -2 && m.sourceId === optic.instanceId)).toBe(true);
    expect(modifiers.every((m) => m.sourceId.startsWith('inst-'))).toBe(true);
  });

  it('buildHasTrait reflects fitted trait parts and definitions', () => {
    // underbarrel-grenade is shotgun-only; an SMG equip must fail closed.
    const smg = smgBuild();
    const smgEquip = equipPart(smg, part('part:underbarrel-grenade'), defMap);
    expect(smgEquip).toMatchObject({ ok: false, reason: 'slot-incompatible' });
    expect(buildHasTrait(smg, 'EXPLOSIVE', defMap, ownedMap())).toBe(false);

    // A shotgun accepts it and the EXPLOSIVE trait resolves from the build.
    const shotgunBuild: WeaponBuild = { id: 'b', name: 'S', baseWeaponFamily: 'shotgun', fitted: {}, traitParts: [] };
    const grenade = part('part:underbarrel-grenade');
    const equipped = equipPart(shotgunBuild, grenade, defMap);
    expect(equipped.ok).toBe(true);
    if (equipped.ok) {
      expect(buildHasTrait(equipped.build, 'EXPLOSIVE', defMap, ownedMap(grenade))).toBe(true);
    }
  });

  it('resolves an infused fire trait into the real family-scoped weapon stat path', () => {
    const barrel = part('part:barrel-standard', ['FIRE']);
    const build = (equipPart({ id: 'build:pistol', name: 'Pistol', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] }, barrel, defMap) as { ok: true; build: WeaponBuild }).build;
    expect(resolveBuildTraitModifiers(build, defMap, ownedMap(barrel))).toEqual([
      expect.objectContaining({ stat: 'damage', op: 'mult', value: 1.15, scope: { kind: 'weapon-family', family: 'pistol' } }),
    ]);
  });
});

describe('Epic 23 persistence round-trip', () => {
  it('gunsmith state round-trips through Save V3 with the real shapes', () => {
    const save = createDefaultSaveV3();
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, 'test', {});
    const withBuild = {
      ...save,
      gunsmith: {
        builds: [{ id: 'build-1', name: 'Rack SMG', baseWeaponFamily: 'smg', fitted: { barrel: 'inst-1' }, traitParts: [] }],
        parts: { 'inst-1': { partId: 'part:barrel-standard', tier: 2, infusedTraits: ['FIRE'] } },
      },
    };
    manager.save(withBuild);
    const loaded = manager.load();
    expect(loaded.gunsmith.builds[0].fitted.barrel).toBe('inst-1');
    expect(loaded.gunsmith.parts['inst-1'].infusedTraits).toContain('FIRE');
    expect(loaded.gunsmith.parts['inst-1'].tier).toBe(2);
  });

  it('stale/unknown part ids in saves fail soft (no save bricking)', () => {
    const save = createDefaultSaveV3();
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, 'test', {});
    manager.save({
      ...save,
      gunsmith: { builds: [], parts: { 'stale-inst': { partId: 'part:removed-catalog', tier: 1, infusedTraits: [] } } },
    });
    const loaded = manager.load();
    // The stale entry survives; the save remains loadable.
    expect(loaded.gunsmith.parts['stale-inst']).toBeDefined();
    expect(loaded.version).toBe(3);
  });

  it('migrates a legacy definition reference only when exactly one owned instance matches', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({
      version: 3,
      settings: {}, progression: {}, stages: {}, achievements: {}, achievementMetrics: {}, characters: {}, equipment: {}, bosses: {}, appliedGrantTransactions: {},
      gunsmith: {
        builds: [{ id: 'legacy', name: 'Legacy', baseWeaponFamily: 'smg', fitted: { barrel: 'part:barrel-standard' }, traitParts: [] }],
        parts: { 'owned-barrel': { partId: 'part:barrel-standard', infusedTraits: [] } },
      },
    }));
    const loaded = new SaveManager(storage, 'test', {}).load();
    expect(loaded.gunsmith.builds[0].fitted.barrel).toBe('owned-barrel');
    expect(loaded.gunsmith.parts['owned-barrel'].tier).toBe(1);
  });

  it('drops an ambiguous legacy definition reference instead of selecting the wrong owned copy', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({
      version: 3,
      settings: {}, progression: {}, stages: {}, achievements: {}, achievementMetrics: {}, characters: {}, equipment: {}, bosses: {}, appliedGrantTransactions: {},
      gunsmith: {
        builds: [{ id: 'legacy', name: 'Legacy', baseWeaponFamily: 'smg', fitted: { barrel: 'part:barrel-standard' }, traitParts: [] }],
        parts: {
          'owned-a': { partId: 'part:barrel-standard', infusedTraits: ['FIRE'] },
          'owned-b': { partId: 'part:barrel-standard', infusedTraits: ['CRYO'] },
        },
      },
    }));
    const loaded = new SaveManager(storage, 'test', {}).load();
    expect(loaded.gunsmith.builds[0].fitted.barrel).toBeUndefined();
    expect(Object.keys(loaded.gunsmith.parts)).toEqual(['owned-a', 'owned-b']);
  });
});

describe('Epic 23 second-fixture proof (data-only extensibility)', () => {
  it('adding a part with existing slot/effect/trait primitives needs no core edit', () => {
    const extra: PartDefinition = {
      id: 'part:proof-sight',
      name: 'Proof Sight',
      slot: 'optic',
      rarity: 'rare',
      tier: 3,
      effects: [{ stat: 'range', op: 'add', value: 20, sourceId: 'part:proof-sight' }],
      traits: [],
    };
    const defs = new Map(defMap);
    defs.set(extra.id, extra);
    const build = smgBuild();
    const sight = part('part:proof-sight');
    const result = equipPart(build, sight, defs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const modifiers = resolveBuildModifiers(result.build, defs, ownedMap(sight));
      expect(modifiers.some((m) => m.stat === 'range' && m.value === 20)).toBe(true);
    }
    // Shipped catalog untouched.
    expect(defMap.has('part:proof-sight')).toBe(false);
  });

  it('the registry accepts a fresh second representative part through data only', () => {
    const registry = new DataPartRegistry({ gunParts: [...gunPartsJson, {
      id: 'part:proof-stock',
      name: 'Proof Stock',
      slot: 'stock',
      rarity: 'common',
      tier: 1,
      effects: [{ stat: 'spreadDeg', op: 'add', value: -1, sourceId: 'part:proof-stock' }],
      traits: [],
    }] });
    expect(registry.partById('part:proof-stock')?.slot).toBe('stock');
    expect(WEAPON_SLOT_COMPATIBILITY.smg).toContain('stock');
  });
});
