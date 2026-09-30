import { describe, expect, it } from 'vitest';
import catalog from '../src/data/equipment-visuals.json';
import { collectGameDataErrors, loadGameData } from '../src/systems/validation';
import type { VisualArtLookup } from '../src/systems/visualArt';
import type { ResolvedVisualArtBinding } from '../src/systems/types';
import type { EquipmentDefinition } from '../src/gameplay/equipment';
import { createEquipmentVisualRegistry, DataEquipmentVisualRegistry } from '../src/presentation/equipmentVisuals';

type VisualRow = { equipmentId: string; tiers: Array<{ tier: number; iconArtId: string; wearableArtId: string }> };

function fixtures(rows: readonly VisualRow[] = catalog as VisualRow[], equipment?: readonly EquipmentDefinition[]) {
  const active = equipment ?? loadGameData().equipment!;
  const ids = new Set(rows.flatMap((row) => row.tiers.flatMap((tier) => [tier.iconArtId, tier.wearableArtId])));
  const bindings = new Map([...ids].map((id) => [id, Object.freeze({ id, kind: 'icon' as const, required: true,
    display: { width: 32, height: 32 }, textureKey: 'test', url: 'test.png', sampling: 'nearest' as const,
    load: { type: 'image' as const } }) as ResolvedVisualArtBinding]));
  const art: Pick<VisualArtLookup, 'bindingById'> = {
    bindingById: (id) => bindings.get(id),
  };
  return { active, art, rows };
}

function makeRows(equipment: readonly EquipmentDefinition[]): VisualRow[] {
  return equipment.map((definition) => {
    const base = `${definition.setId.replace(/^set:/, '')}-${definition.slot}`;
    return { equipmentId: definition.id, tiers: [1, 2, 3, 4].map((tier) => ({
      tier,
      iconArtId: tier === 1 ? definition.icon : `equipment-icon:${base}:t${tier}`,
      wearableArtId: `equipment-wearable:${base}:t${tier}`,
    })) };
  });
}

describe('Equipment visual presentation registry', () => {
  it('rejects identical tier artwork even when distinct logical IDs alias one frame', () => {
    const { active, art, rows } = fixtures();
    const repeated = rows.map((row, index) => index === 0 ? { ...row, tiers: row.tiers.map((tier) => tier.tier === 2
      ? { ...tier, iconArtId: row.tiers[0]!.iconArtId } : tier) } : row);
    expect(() => new DataEquipmentVisualRegistry(repeated, active, art)).toThrow(/reuses icon artwork/);
    const firstIcon = rows[0]!.tiers[0]!.iconArtId;
    const secondIcon = rows[0]!.tiers[1]!.iconArtId;
    const aliases = { bindingById: (id: string) => {
      const binding = art.bindingById(id);
      return binding && (id === firstIcon || id === secondIcon)
        ? { ...binding, resourceId: 'resource:test', frameKey: firstIcon } : binding;
    } };
    expect(() => new DataEquipmentVisualRegistry(rows, active, aliases)).toThrow(/reuses icon artwork/);
  });
  it('rejects distinct logical tiers aliasing the same whole-image resource', () => {
    const { active, art, rows } = fixtures();
    const iconIds = new Set(rows[0]!.tiers.slice(0, 2).map((tier) => tier.iconArtId));
    const wearableIds = new Set(rows[0]!.tiers.slice(0, 2).map((tier) => tier.wearableArtId));
    for (const roleIds of [iconIds, wearableIds]) {
      const aliases = { bindingById: (id: string) => {
        const binding = art.bindingById(id);
        return binding && roleIds.has(id)
          ? { ...binding, resourceId: 'resource:whole-image' } : binding;
      } };
      expect(() => new DataEquipmentVisualRegistry(rows, active, aliases)).toThrow(/reuses .* artwork/);
    }
  });

  it('wires the shipped catalog through the real validated visual-art bindings', () => {
    const data = loadGameData();
    const registry = createEquipmentVisualRegistry(data)!;
    expect(data.equipmentVisuals).toEqual(catalog);
    expect(registry.resolveEquipmentVisual(data.equipment![0]!.id, 4)?.wearableArtId).toMatch(/:t4$/);
    expect(createEquipmentVisualRegistry({ ...data, equipmentVisuals: undefined })).toBeUndefined();
  });

  it('runs row schema and exact-coverage checks through aggregate validation', () => {
    const data = loadGameData();
    const missingTier = data.equipmentVisuals!.map((row, index) => index === 0
      ? { ...row, tiers: row.tiers.filter((tier) => tier.tier !== 3) }
      : row);
    expect(collectGameDataErrors({ ...data, equipmentVisuals: missingTier })
      .some((issue) => issue.file === 'equipment-visuals.json' && /missing tier 3/.test(issue.message))).toBe(true);

    const malformed = data.equipmentVisuals!.map((row, index) => index === 0
      ? { ...row, tiers: row.tiers.map((tier, tierIndex) => tierIndex === 0 ? { ...tier, stray: true } : tier) }
      : row);
    expect(collectGameDataErrors({ ...data, equipmentVisuals: malformed })
      .some((issue) => issue.file === 'equipment-visuals.json' && /unknown field/.test(issue.message))).toBe(true);
  });

  it('requires all four visual tiers for every active Equipment definition', () => {
    const { active, art, rows } = fixtures();
    const missing = rows.map((row) => row.equipmentId === active[0]!.id
      ? { ...row, tiers: row.tiers.filter((tier) => tier.tier !== 3) }
      : row);
    expect(() => new DataEquipmentVisualRegistry(missing, active, art)).toThrow(/tier 3/);
  });

  it('resolves tier-one catalog icons and tier-specific icons and wearables without content branches', () => {
    const { active, art, rows } = fixtures();
    const registry = new DataEquipmentVisualRegistry(rows, active, art);
    for (const definition of active) {
      for (const tier of [1, 2, 3, 4] as const) {
        const visual = registry.resolveEquipmentVisual(definition.id, tier)!;
        expect(visual).toEqual({
          equipmentId: definition.id,
          tier,
          iconArtId: tier === 1 ? definition.icon : expect.stringMatching(new RegExp(`:t${tier}$`)),
          wearableArtId: expect.stringMatching(new RegExp(`:t${tier}$`)),
        });
        expect(Object.isFrozen(visual)).toBe(true);
      }
    }
    expect(registry.resolveEquipmentVisual('equipment:missing', 1)).toBeUndefined();
    expect(registry.resolveEquipmentVisual(active[0]!.id, 5)).toBeUndefined();
  });

  it('accepts a future catalog addition from its definition and data row alone', () => {
    const active = [...loadGameData().equipment!];
    const future: EquipmentDefinition = {
      id: 'equipment:future-hood', name: 'Future Hood', setId: 'set:future', slot: 'helmet',
      icon: 'equipment-icon:future-hood', effects: [],
    };
    active.push(future);
    const rows = makeRows(active);
    // Presentation IDs are authored data. A future source/importer can use
    // its own logical names without changing this resolver or UI code.
    rows[rows.length - 1] = { equipmentId: future.id, tiers: [1, 2, 3, 4].map((tier) => ({
      tier, iconArtId: tier === 1 ? future.icon : `future-hood-icon:${tier}`,
      wearableArtId: `future-hood-wearable:${tier}`,
    })) };
    const { art } = fixtures(rows, active);
    const registry = new DataEquipmentVisualRegistry(rows, active, art);
    expect(registry.resolveEquipmentVisual(future.id, 4)).toEqual({
      equipmentId: future.id, tier: 4,
      iconArtId: 'future-hood-icon:4',
      wearableArtId: 'future-hood-wearable:4',
    });
  });

  it.each([
    ['duplicate item', (rows: VisualRow[]) => [...rows, rows[0]!]],
    ['missing item', (rows: VisualRow[]) => rows.slice(1)],
    ['extra item', (rows: VisualRow[]) => [...rows, { equipmentId: 'equipment:retired', tiers: rows[0]!.tiers }]],
    ['duplicate tier', (rows: VisualRow[]) => rows.map((row, index) => index === 0 ? { ...row, tiers: [...row.tiers, row.tiers[0]!] } : row)],
    ['unknown icon binding', (rows: VisualRow[]) => rows.map((row, index) => index === 0 ? { ...row, tiers: row.tiers.map((tier) => tier.tier === 2 ? { ...tier, iconArtId: 'equipment-icon:missing' } : tier) } : row)],
  ])('rejects %s visual data', (_label, mutate) => {
    const { active, art, rows } = fixtures();
    expect(() => new DataEquipmentVisualRegistry(mutate([...rows]), active, art)).toThrow();
  });

  it('rejects invalid tier values, noncanonical tier bindings, and wrong art kinds', () => {
    const { active, art, rows } = fixtures();
    const invalidTier = rows.map((row, index) => index === 0 ? { ...row, tiers: row.tiers.map((tier) => tier.tier === 2 ? { ...tier, tier: 5 } : tier) } : row);
    expect(() => new DataEquipmentVisualRegistry(invalidTier, active, art)).toThrow(/tier/);
    const wrongLogical = rows.map((row, index) => index === 0 ? { ...row, tiers: row.tiers.map((tier) => tier.tier === 3 ? { ...tier, wearableArtId: 'equipment-wearable:wrong-slot:t3' } : tier) } : row);
    expect(() => new DataEquipmentVisualRegistry(wrongLogical, active, art)).toThrow(/wearable/);
    const wrongKind: Pick<VisualArtLookup, 'bindingById'> = { ...art, bindingById: (id) => {
      const binding = art.bindingById(id);
      return binding?.id === rows[0]!.tiers[0]!.wearableArtId ? { ...binding, kind: 'portrait' as const } : binding;
    } };
    expect(() => new DataEquipmentVisualRegistry(rows, active, wrongKind)).toThrow(/kind/);
    const optional: Pick<VisualArtLookup, 'bindingById'> = { ...art, bindingById: (id) => {
      const binding = art.bindingById(id);
      return binding?.id === rows[0]!.tiers[0]!.iconArtId ? { ...binding, required: false } : binding;
    } };
    expect(() => new DataEquipmentVisualRegistry(rows, active, optional)).toThrow(/required/);
  });
});
