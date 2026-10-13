import { describe, expect, it, vi } from 'vitest';
import { resolveDropPresentation } from '../src/presentation/dropPresentation';
import { loadGameData } from '../src/systems/validation';
import { DataWeaponRegistry } from '../src/systems/weaponRegistry';
import { DataVisualArtRegistry } from '../src/systems/visualArt';
import { resolveRunPhysicalResources } from '../src/systems/resourceLoader';

const data = loadGameData();
const weaponRegistry = new DataWeaponRegistry(data);
const visualArt = new DataVisualArtRegistry(data);
const artByKind = {
  xp: visualArt.bindingById('drop:xp'),
  scrap: visualArt.bindingById('drop:scrap'),
  chest: visualArt.bindingById('drop:chest'),
  weapon: visualArt.bindingById('drop:weapon'),
};

describe('drop grant presentation resolution', () => {
  it('closes every exact pickup resource for both authored biomes before spawning', () => {
    for (const arena of data.arenas) {
      const resources = resolveRunPhysicalResources({ data, arena,
        characterId: 'scrap-tabby', encounterEnemyIds: [] });
      const keys = new Set(resources.map(resource => resource.textureKey));
      const grants = [{ kind: 'xp', amount: 1 }, { kind: 'scrap', amount: 1 },
        { kind: 'chest', amount: 0, tableId: 'chest-standard' },
        ...data.weapons.map(definition => ({ kind: 'weapon', definitionId: definition.id }))] as import('../src/gameplay/loot').LootGrant[];
      for (const grant of grants) {
        const plan = resolveDropPresentation(grant, { weaponRegistry, visualArt });
        expect(keys.has(plan.binding.textureKey), `${arena.id}: ${plan.artId}`).toBe(true);
      }
      expect(keys.size).toBe(resources.length);
    }
  });
  it.each(data.weapons.map((definition) => [definition.id, definition] as const))(
    'resolves %s to its registered exact tier icon without creating an instance',
    (definitionId, definition) => {
      const resolved = resolveDropPresentation({ kind: 'weapon', definitionId }, { weaponRegistry, visualArt });
      expect(resolved.binding).toEqual(visualArt.bindingById(definition.art.iconId));
      expect(resolved.binding?.kind).toBe('weapon-icon');
      expect(resolved.weapon).toEqual({ definitionId, family: definition.family, tier: definition.mergeTier });
      expect(Math.max(resolved.display!.width, resolved.display!.height)).toBe(20);
      expect(resolved.display!.width / resolved.display!.height).toBeCloseTo(resolved.binding!.display.width / resolved.binding!.display.height);
      expect(resolved.binding).not.toBe(artByKind.weapon);
    },
  );

  it('preserves the registered non-weapon bindings and leaves grants unchanged', () => {
    const grants = [
      { kind: 'xp', amount: 2 },
      { kind: 'scrap', amount: 3 },
      { kind: 'chest', amount: 0, tableId: 'chest-standard' },
    ] as const;
    for (const grant of grants) {
      const before = { ...grant };
      expect(resolveDropPresentation(grant, { weaponRegistry, visualArt }).binding).toEqual(artByKind[grant.kind]);
      expect(grant).toEqual(before);
    }
  });

  it('never substitutes generic weapon art for unknown definitions or headless resolution', () => {
    expect(() => resolveDropPresentation({ kind: 'weapon', definitionId: 'missing' }, { weaponRegistry, visualArt })).toThrow(/missing/);
    expect(() => resolveDropPresentation({ kind: 'weapon', definitionId: 'scrap-pistol-t1' }, undefined as never)).toThrow();
  });

  it('fails closed for absent non-weapon production art instead of borrowing a stale binding', () => {
    const missing = { bindingById: () => undefined };
    for (const grant of [{ kind: 'xp', amount: 1 }, { kind: 'scrap', amount: 2 }, { kind: 'chest', amount: 0, tableId: 'a' }] as const)
      expect(() => resolveDropPresentation(grant, { weaponRegistry, visualArt: missing })).toThrow(/requires registered drop art/);
  });

  it('fails closed for missing or wrong-kind exact registered weapon icons', () => {
    const grant = { kind: 'weapon', definitionId: 'scrap-pistol-t1' } as const;
    expect(() => resolveDropPresentation(grant, { weaponRegistry, visualArt: { bindingById: () => undefined } })).toThrow(/requires registered weapon-icon art/);
    expect(() => resolveDropPresentation(grant, { weaponRegistry, visualArt: { bindingById: () => artByKind.xp } })).toThrow(/requires registered weapon-icon art/);
  });
});

// The recovered implementation must not retain mutable fixture registry data.
it('returns a detached deeply immutable plan and exact stable weapon identity', () => {
  const weapon = structuredClone(data.weapons[0]);
  const binding = structuredClone(visualArt.bindingById(weapon.art.iconId)!);
  const deps = { weaponRegistry: { weaponById: () => weapon }, visualArt: { bindingById: () => binding } };
  const plan = resolveDropPresentation({ kind: 'weapon', definitionId: weapon.id }, deps);
  expect(plan).toMatchObject({ artId: weapon.art.iconId, kind: 'weapon', weapon: { definitionId: weapon.id, family: weapon.family, tier: weapon.mergeTier } });
  expect(plan.binding).not.toBe(binding);
  expect(Object.isFrozen(plan)).toBe(true); expect(Object.isFrozen(plan.display)).toBe(true);
  expect(Object.isFrozen(plan.weapon)).toBe(true); expect(Object.isFrozen(plan.binding)).toBe(true); expect(Object.isFrozen(plan.binding!.display)).toBe(true);
  (binding.display as { width: number }).width = 1; weapon.family = 'changed'; weapon.mergeTier = 9;
  expect(plan.binding!.display.width).not.toBe(1); expect(plan.weapon!.family).not.toBe('changed'); expect(plan.weapon!.tier).toBe(1);
});


describe('strict registry identity and bounded world display', () => {
  const grant = { kind: 'weapon', definitionId: data.weapons[0].id } as const;
  const source = visualArt.bindingById(data.weapons[0].art.iconId)!;
  it.each([
    ['logical id', { id: 'weapon-icon:wrong' }],
    ['optional', { required: false }],
    ['texture identity', { textureKey: '' }],
    ['image URL', { url: '' }],
    ['named atlas frame', { load: { type: 'atlas' }, frameKey: undefined }],
    ['zero display', { display: { width: 0, height: 20 } }],
    ['negative display', { display: { width: 20, height: -1 } }],
    ['infinite display', { display: { width: Infinity, height: 20 } }],
    ['NaN display', { display: { width: 20, height: NaN } }],
  ] as const)('rejects invalid %s', (_label, patch) => {
    expect(() => resolveDropPresentation(grant, { weaponRegistry, visualArt: { bindingById: () => ({ ...source, ...patch }) as typeof source } })).toThrow(/Pickup/);
  });
  it('rejects a mismatched weapon lookup rather than adopting another identity', () => {
    expect(() => resolveDropPresentation(grant, { weaponRegistry: { weaponById: () => data.weapons[1] }, visualArt })).toThrow(/Unknown weapon/);
  });
  it.each([{ family: '' }, { mergeTier: 0 }, { mergeTier: 1.5 }, { mergeTier: Infinity }])('rejects invalid weapon identity %j', patch => {
    expect(() => resolveDropPresentation(grant, { weaponRegistry: { weaponById: () => ({ ...data.weapons[0], ...patch }) }, visualArt })).toThrow(/invalid family\/tier/);
  });
  it('rejects an unsupported grant kind without querying an art identity', () => {
    const bindingById = vi.fn();
    expect(() => resolveDropPresentation({ kind: 'future-loot' } as never, { weaponRegistry, visualArt: { bindingById } })).toThrow(/Unsupported/);
    expect(bindingById).not.toHaveBeenCalled();
  });
  it('does not enlarge a smaller icon and preserves an oblong icon aspect ratio', () => {
    for (const display of [{ width: 12, height: 8 }, { width: 80, height: 20 }]) {
      const result = resolveDropPresentation(grant, { weaponRegistry, visualArt: { bindingById: () => ({ ...source, display }) } });
      expect(result.display).toEqual(display.width === 12 ? display : { width: 20, height: 5 });
    }
  });
  it('supports a ninth/new family identity only through registered definition data', () => {
    const definition = { ...data.weapons[0], id: 'custom-stable-id', name: 'Name unrelated to art', family: 'new-family', mergeTier: 7, art: { ...data.weapons[0].art, iconId: 'weapon-icon:registered-proof' } };
    const calls: string[] = [];
    const createWeaponInstance = vi.fn(() => { throw new Error('No instance creation allowed'); });
    const weaponLookup = { weaponById: () => definition, createWeaponInstance };
    const result = resolveDropPresentation({ kind: 'weapon', definitionId: definition.id }, { weaponRegistry: weaponLookup, visualArt: { bindingById: id => { calls.push(id); return { ...source, id }; } } });
    expect(calls).toEqual([definition.art.iconId]);
    expect(result.weapon).toEqual({ definitionId: definition.id, family: 'new-family', tier: 7 });
    expect(createWeaponInstance).not.toHaveBeenCalled();
  });
  it('copies nested animation data without freezing or retaining the input binding', () => {
    const input = structuredClone(visualArt.bindingById('drop:xp')!);
    const result = resolveDropPresentation({ kind: 'xp', amount: 9 }, { weaponRegistry, visualArt: { bindingById: () => input } });
    expect(Object.isFrozen(input)).toBe(false); expect(Object.isFrozen(input.clips!.idle)).toBe(false);
    expect(Object.isFrozen(result.binding.clips!.idle)).toBe(true);
    (input.clips!.idle as { start: number }).start = 2;
    expect(result.binding.clips!.idle.start).toBe(0);
    expect(result.display).toEqual({ width: 16, height: 16 });
    expect(result).not.toHaveProperty('weapon');
  });
  it('retains the exact existing ordinary display and canonical art identities', () => {
    for (const kind of ['xp', 'scrap', 'chest'] as const) {
      const item = kind === 'chest' ? { kind, amount: 0 as const, tableId: 'unchanged' } : { kind, amount: 4 };
      const result = resolveDropPresentation(item, { weaponRegistry, visualArt });
      expect(result.artId).toBe(`drop:${kind}`); expect(result.display).toEqual(artByKind[kind]!.display);
      expect(result.binding.frameKey).toBe(artByKind[kind]!.frameKey); expect(result.binding.resourceId).toBe(artByKind[kind]!.resourceId);
    }
  });
});
