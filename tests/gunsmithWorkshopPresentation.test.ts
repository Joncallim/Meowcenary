import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { GunsmithController } from '../src/ui/gunsmithController';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { infuseTrait, mergeParts, type OwnedPart } from '../src/gameplay/gunsmith';
import { resolveEquipmentLoadoutPresentation } from '../src/ui/equipmentPresentation';
import { DataPartRegistry } from '../src/systems/parts';

function setup() {
  const data = loadGameData();
  const storage = new MemoryStorageAdapter();
  const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data,
    metaUpgrades: new DataMetaUpgradeRegistry(data), save: new SaveManager(storage, 'workshop-presentation', {}),
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data) });
  context.updateGunsmith((state) => ({ ...state, parts: {
    first: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    second: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    core: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
    unrelated: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
  }, builds: [
    { id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol', fitted: { barrel: 'first' }, traitParts: [] },
    { id: 'build:smg', name: 'Spray', baseWeaponFamily: 'smg', fitted: { barrel: 'second', receiver: 'unrelated' }, traitParts: ['core'] },
  ], selectedBuildId: 'build:pistol' }));
  const owned = (id: string): OwnedPart => ({ instanceId: id, ...context.saveData.gunsmith.parts[id] } as OwnedPart);
  const definitions = new DataPartRegistry({ gunParts: data.gunParts ?? [] }).asMap();
  return { context, storage, controller: new GunsmithController(context), owned, definitions };
}

function expectDeepFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach(expectDeepFrozen);
}

describe('Workshop structured consequence presentation', () => {
  it('previews both consumed merge inputs, the pure STORED output, and every cleared fitting without a write', () => {
    const { context, storage, controller, owned, definitions } = setup();
    const before = context.saveData;
    const write = vi.spyOn(storage, 'setItem');
    const pure = mergeParts(owned('first'), owned('second'), definitions);
    expect(pure.ok).toBe(true);
    if (!pure.ok) throw new Error('fixture merge unavailable');
    expect(controller.requestWorkshop({ kind: 'merge', firstInstanceId: 'first', secondInstanceId: 'second' })).toMatchObject({ ok: true, persisted: false });
    const confirmation = controller.snapshot().confirmation as any;
    expect(confirmation.inputs.map((part: any) => part.instanceId)).toEqual(['first', 'second']);
    expect(confirmation.output).toMatchObject({ instanceId: pure.output.instanceId, partId: pure.output.partId,
      tier: pure.output.tier, stateLabel: 'STORED', fittingLocations: [], iconArtId: 'gun-part-icon:barrel-standard:t2' });
    expect(confirmation.consumedInstanceIds).toEqual(pure.consumed);
    expect(confirmation.preservedInstanceIds).toEqual([]);
    expect(confirmation.clearedFittings).toEqual([
      { buildId: 'build:pistol', buildName: 'Sidearm', familyId: 'pistol', slot: 'barrel', instanceId: 'first' },
      { buildId: 'build:smg', buildName: 'Spray', familyId: 'smg', slot: 'barrel', instanceId: 'second' },
    ]);
    expect(confirmation.sideEffectLines).toContain('Output remains STORED. Fit it separately.');
    expect(confirmation.sideEffectLines).toContain('Clears Sidearm • Barrel.');
    expect(confirmation.sideEffectLines).toContain('Clears Spray • Barrel.');
    expectDeepFrozen(confirmation);
    expect(confirmation.comparison.before).toEqual(resolveEquipmentLoadoutPresentation(before, context.data).runTruth);
    expect(confirmation.output.statChips).toEqual(['+20 Range']);
    const rangeLine = confirmation.comparison.lines.find((line: string) => line.includes(' Range '));
    const range = rangeLine?.match(/Range ([\d.]+) to ([\d.]+)/);
    expect(range).toBeDefined(); expect(Number(range[1])).toBeGreaterThan(Number(range[2]));
    expect(write).not.toHaveBeenCalled(); expect(context.saveData).toBe(before);
    expect(controller.confirmWorkshop()).toMatchObject({ ok: true, persisted: true });
    expect(context.saveData.gunsmith.parts[pure.output.instanceId].tier).toBe(confirmation.output.tier);
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBeUndefined();
    expect(context.saveData.gunsmith.builds[1].fitted.barrel).toBeUndefined();
    expect(context.saveData.gunsmith.builds[1].fitted.receiver).toBe('unrelated');
    expect(confirmation.comparison.after).toEqual(resolveEquipmentLoadoutPresentation(context.saveData, context.data).runTruth);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('previews infusion retaining the target identity/fitting and consuming only its fitted source core', () => {
    const { context, storage, controller, owned, definitions } = setup();
    const before = context.saveData;
    const write = vi.spyOn(storage, 'setItem');
    const pure = infuseTrait(owned('first'), owned('core'), definitions);
    if (!pure.ok) throw new Error('fixture infusion unavailable');
    expect(controller.requestWorkshop({ kind: 'infuse', targetInstanceId: 'first', traitInstanceId: 'core' })).toMatchObject({ ok: true, persisted: false });
    const confirmation = controller.snapshot().confirmation as any;
    expect(confirmation.inputs.map((part: any) => part.instanceId)).toEqual(['first', 'core']);
    expect(confirmation.consumedInstanceIds).toEqual(['core']);
    expect(confirmation.preservedInstanceIds).toEqual(['first']);
    expect(confirmation.output).toMatchObject({ instanceId: 'first', tier: 1, stateLabel: 'EQUIPPED', traitLines: ['FIRE'], effectScope: 'Pistol' });
    expect(confirmation.output.traitIcons).toEqual([{ trait: 'FIRE', iconArtId: 'trait-icon:fire' }]);
    expect(confirmation.clearedFittings).toEqual([{ buildId: 'build:smg', buildName: 'Spray', familyId: 'smg', slot: 'trait', instanceId: 'core' }]);
    expect(confirmation.preservedFittings).toEqual([{ buildId: 'build:pistol', buildName: 'Sidearm', familyId: 'pistol', slot: 'barrel', instanceId: 'first' }]);
    expect(confirmation.output.fittingLocations).toEqual(confirmation.preservedFittings);
    expect(confirmation.sideEffectLines).toContain('Keeps Sidearm • Barrel fitted.');
    expectDeepFrozen(confirmation);
    expect(() => { confirmation.output.traitLines.push('EXPLOSIVE'); }).toThrow();
    expect(context.saveData).toBe(before); expect(write).not.toHaveBeenCalled();
    expect(controller.confirmWorkshop()).toMatchObject({ ok: true, persisted: true });
    expect(context.saveData.gunsmith.parts.first.infusedTraits).toEqual(pure.output.infusedTraits);
    expect(context.saveData.gunsmith.parts.core).toBeUndefined();
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('first');
    expect(context.saveData.gunsmith.builds[1].traitParts).toEqual([]);
  });

  it('exposes concise chips and acquisition source without removing the selected full effect/comparison detail', () => {
    const { controller } = setup();
    const snapshot = controller.snapshot();
    const owned = snapshot.parts.find((part) => part.instanceId === 'first') as any;
    expect(owned.statChips).toEqual(['+10 Range']);
    expect(owned.sourceLabel).toContain('Fabricate');
    expect(owned.effectLines).toEqual(['+10 Range']);
    expect(owned.comparisonSummary).toContain('Current build:');
    const catalog = snapshot.catalog.find((part) => part.partId === owned.partId) as any;
    expect(catalog.statChips).toEqual(owned.statChips);
    expect(Object.isFrozen(owned.statChips)).toBe(true);
  });

  it('resolves Equipment plus infused FIRE as one shared family package in the full comparison', () => {
    const { context, controller } = setup();
    context.updateEquipment(() => ({ equipment: {
      helmet: { equipmentId: 'equipment:pyro-helmet', tier: 1 },
      armour: { equipmentId: 'equipment:pyro-armour', tier: 1 },
    }, loadout: { helmet: 'helmet', armour: 'armour' } }));
    expect(controller.requestWorkshop({ kind: 'infuse', targetInstanceId: 'first', traitInstanceId: 'core' })).toMatchObject({ ok: true });
    const confirmation = controller.snapshot().confirmation!;
    const before = confirmation.comparison.before.families.find((family) => family.familyId === 'pistol')!;
    const after = confirmation.comparison.after.families.find((family) => family.familyId === 'pistol')!;
    expect(before.traits.filter((trait) => trait.trait === 'FIRE')).toHaveLength(1);
    expect(after.traits.filter((trait) => trait.trait === 'FIRE')).toHaveLength(1);
    expect(after.traits.find((trait) => trait.trait === 'FIRE')).toMatchObject({ deduplicated: true });
    expect(after.projectileEffects.filter((effect) => effect.kind === 'burn')).toHaveLength(1);
    const traitModifiers = confirmation.comparison.after.modifiers.filter((modifier) => modifier.sourceId.startsWith('trait:pistol:'));
    expect(traitModifiers).toHaveLength(1);
    expect(confirmation.comparison.lines).toContain('Pistol traits FIRE to FIRE (shared; applied once)');
    expectDeepFrozen(confirmation.comparison);
  });

  for (const kind of ['merge', 'infuse'] as const) {
    it(`rejects stale ${kind} fitting consequences changed inside the production persistence transform`, () => {
      const { context, storage, controller } = setup();
      const request = kind === 'merge'
        ? { kind, firstInstanceId: 'first', secondInstanceId: 'second' }
        : { kind, targetInstanceId: 'first', traitInstanceId: 'core' };
      expect(controller.requestWorkshop(request)).toMatchObject({ ok: true });
      const pending = controller.snapshot().confirmation;
      const write = vi.spyOn(storage, 'setItem');
      const update = context.updateGunsmith.bind(context);
      context.updateGunsmith = (transform) => {
        update((state) => ({ ...state, builds: state.builds.map((build) => build.id === 'build:pistol'
          ? { ...build, fitted: {} } : build) }));
        return update(transform);
      };
      expect(controller.confirmWorkshop()).toEqual({ ok: false, reason: 'workshop-operation-unavailable' });
      expect(write).toHaveBeenCalledTimes(1); // Only the intervening authoritative unfitting.
      expect(context.saveData.gunsmith.parts.first).toBeDefined();
      expect(context.saveData.gunsmith.parts.second).toBeDefined();
      expect(context.saveData.gunsmith.parts.core).toBeDefined();
      expect(context.saveData.gunsmith.builds[0].fitted).toEqual({});
      expect(pending?.inputs[0].fittingLocations).toHaveLength(1);
      expect(controller.snapshot().confirmation).toBeUndefined();
    });

    it(`retains ${kind} confirmation and durable identity after storage failure`, () => {
      const { context, storage, controller } = setup();
      const request = kind === 'merge'
        ? { kind, firstInstanceId: 'first', secondInstanceId: 'second' }
        : { kind, targetInstanceId: 'first', traitInstanceId: 'core' };
      expect(controller.requestWorkshop(request)).toMatchObject({ ok: true });
      const before = context.saveData;
      const confirmation = controller.snapshot().confirmation;
      vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('simulated storage failure'); });
      expect(controller.confirmWorkshop()).toEqual({ ok: false, reason: 'save-failed' });
      expect(context.saveData).toBe(before);
      expect(controller.snapshot().confirmation).toBe(confirmation);
      expectDeepFrozen(confirmation);
    });
  }


  for (const kind of ['merge', 'infuse'] as const) {
    it(`preserves unrelated fresh ${kind} state published before the persistence transform resolves`, () => {
      const { context, storage, controller } = setup();
      const request = kind === 'merge'
        ? { kind, firstInstanceId: 'first', secondInstanceId: 'second' }
        : { kind, targetInstanceId: 'first', traitInstanceId: 'core' };
      expect(controller.requestWorkshop(request)).toMatchObject({ ok: true });
      const write = vi.spyOn(storage, 'setItem');
      const update = context.updateGunsmith.bind(context);
      context.updateGunsmith = (transform) => {
        update((state) => ({ ...state, parts: { ...state.parts,
          unrelated: { ...state.parts.unrelated, tier: 2 } } }));
        return update(transform);
      };
      expect(controller.confirmWorkshop()).toMatchObject({ ok: true, persisted: true });
      expect(context.saveData.gunsmith.parts.unrelated.tier).toBe(2);
      expect(context.saveData.gunsmith.builds[1].fitted.receiver).toBe('unrelated');
      expect(write).toHaveBeenCalledTimes(2); // Intervening command + confirmed outcome.
    });
  }

});
