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
  unequipPart,
  type OwnedPart,
  type PartDefinition,
  type WeaponBuild,
} from '../src/gameplay/gunsmith';
import { createDefaultSaveV3, SaveManager, MemoryStorageAdapter } from '../src/systems/save';

const definitions = gunPartsJson as unknown as PartDefinition[];
const defMap = new Map(definitions.map((d) => [d.id, d]));

function part(partId: string, infusedTraits: readonly string[] = []): OwnedPart {
  return { instanceId: `inst-${partId}-${Math.random().toString(36).slice(2, 8)}`, partId, infusedTraits: [...infusedTraits] as OwnedPart['infusedTraits'] };
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
    expect(build.fitted.barrel).toBe('part:barrel-standard');

    // A shotgun-only underbarrel cannot fit an SMG.
    const underbarrel = part('part:underbarrel-grenade');
    expect(equipPart(build, underbarrel, defMap)).toMatchObject({ ok: false, reason: 'slot-incompatible' });
    // Unknown part id fails closed.
    expect(equipPart(build, part('part:does-not-exist'), defMap)).toMatchObject({ ok: false, reason: 'unknown-part' });
  });

  it('rejects equipping into an occupied slot without losing the existing part', () => {
    let build = smgBuild();
    build = (equipPart(build, part('part:barrel-standard'), defMap) as { ok: true; build: WeaponBuild }).build;
    const secondBarrel = part('part:barrel-long');
    const result = equipPart(build, secondBarrel, defMap);
    expect(result).toMatchObject({ ok: false, reason: 'slot-full' });
    expect(build.fitted.barrel).toBe('part:barrel-standard');
  });

  it('unequips exactly the fitted part and no other state', () => {
    let build = smgBuild();
    build = (equipPart(build, part('part:barrel-standard'), defMap) as { ok: true; build: WeaponBuild }).build;
    const result = unequipPart(build, 'part:barrel-standard');
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
    const capped = { ...barrel, infusedTraits: ['FIRE', 'CRYO'] as const };
    expect(infuseTrait(capped, part('part:trait-fire'), defMap)).toMatchObject({ ok: false, reason: 'trait-cap-reached' });
    const duplicate = { ...barrel, infusedTraits: ['FIRE'] as const };
    expect(infuseTrait(duplicate, part('part:trait-fire'), defMap)).toMatchObject({ ok: false, reason: 'trait-cap-reached' });
  });
});

describe('Epic 23 effective stat resolution', () => {
  it('resolves build modifiers from fitted parts (single source of truth)', () => {
    let build = smgBuild();
    build = (equipPart(build, part('part:barrel-long'), defMap) as { ok: true; build: WeaponBuild }).build;
    build = (equipPart(build, part('part:optic-red-dot'), defMap) as { ok: true; build: WeaponBuild }).build;
    const modifiers = resolveBuildModifiers(build, defMap);
    expect(modifiers.some((m) => m.stat === 'range' && m.value === 35 && m.sourceId === 'part:barrel-long')).toBe(true);
    expect(modifiers.some((m) => m.stat === 'spreadDeg' && m.value === -2 && m.sourceId === 'part:optic-red-dot')).toBe(true);
    // Modifiers carry their owning part source ids.
    expect(modifiers.every((m) => m.sourceId.startsWith('part:'))).toBe(true);
  });

  it('buildHasTrait reflects fitted trait parts and definitions', () => {
    // underbarrel-grenade is shotgun-only; an SMG equip must fail closed.
    const smg = smgBuild();
    const smgEquip = equipPart(smg, part('part:underbarrel-grenade'), defMap);
    expect(smgEquip).toMatchObject({ ok: false, reason: 'slot-incompatible' });
    expect(buildHasTrait(smg, 'EXPLOSIVE', defMap)).toBe(false);

    // A shotgun accepts it and the EXPLOSIVE trait resolves from the build.
    const shotgunBuild: WeaponBuild = { id: 'b', name: 'S', baseWeaponFamily: 'shotgun', fitted: {}, traitParts: [] };
    const equipped = equipPart(shotgunBuild, part('part:underbarrel-grenade'), defMap);
    expect(equipped.ok).toBe(true);
    if (equipped.ok) {
      expect(buildHasTrait(equipped.build, 'EXPLOSIVE', defMap)).toBe(true);
    }
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
        builds: [{ id: 'build-1', name: 'Rack SMG', baseWeaponFamily: 'smg', fitted: { barrel: 'part:barrel-standard' }, traitParts: [] }],
        parts: { 'inst-1': { partId: 'part:barrel-standard', infusedTraits: ['FIRE'] } },
      },
    };
    manager.save(withBuild);
    const loaded = manager.load();
    expect(loaded.gunsmith.builds[0].fitted.barrel).toBe('part:barrel-standard');
    expect(loaded.gunsmith.parts['inst-1'].infusedTraits).toContain('FIRE');
  });

  it('stale/unknown part ids in saves fail soft (no save bricking)', () => {
    const save = createDefaultSaveV3();
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, 'test', {});
    manager.save({
      ...save,
      gunsmith: { builds: [], parts: { 'stale-inst': { partId: 'part:removed-catalog', infusedTraits: [] } } },
    });
    const loaded = manager.load();
    // The stale entry survives; the save remains loadable.
    expect(loaded.gunsmith.parts['stale-inst']).toBeDefined();
    expect(loaded.version).toBe(3);
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
    const result = equipPart(build, part('part:proof-sight'), defs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const modifiers = resolveBuildModifiers(result.build, defs);
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
