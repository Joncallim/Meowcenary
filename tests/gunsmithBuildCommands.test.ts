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

function setup() {
  const data = structuredClone(loadGameData());
  const storage = new MemoryStorageAdapter();
  const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data,
    metaUpgrades: new DataMetaUpgradeRegistry(data), save: new SaveManager(storage, 'commands', {}),
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data) });
  context.updateGunsmith((state) => ({ ...state, parts: {
    standard: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    long: { partId: 'part:barrel-long', tier: 2, infusedTraits: [] },
  }, builds: [{ id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol',
    fitted: { barrel: 'standard' }, traitParts: [] }], selectedBuildId: 'build:pistol' }));
  return { data, context, storage, controller: new GunsmithController(context) };
}

describe('Gunsmith Build commands', () => {
  it('replaces an occupied slot in one durable write while preserving displaced ownership', () => {
    const { controller, context, storage } = setup();
    const write = vi.spyOn(storage, 'setItem');
    expect(controller.fitPart('long')).toMatchObject({ ok: true, persisted: true });
    expect(write).toHaveBeenCalledTimes(1);
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('long');
    expect(context.saveData.gunsmith.parts.standard).toBeDefined();
  });

  it('resolves fitting inside the transform and never resurrects a consumed instance or stale state', () => {
    const { controller, context, storage } = setup();
    context.updateGunsmith((state) => ({ ...state, builds: state.builds.map((build) => ({ ...build, fitted: {} })) }));
    const update = context.updateGunsmith.bind(context);
    context.updateGunsmith = (transform) => {
      update((current) => ({ ...current, parts: { standard: current.parts.standard,
        fresh: { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] } } }));
      return update(transform);
    };
    const write = vi.spyOn(storage, 'setItem');
    expect(controller.fitPart('long')).toMatchObject({ ok: false, reason: 'unknown-part' });
    expect(write).toHaveBeenCalledTimes(1); // Only the simulated intervening command.
    expect(context.saveData.gunsmith.parts.long).toBeUndefined();
    expect(context.saveData.gunsmith.parts.fresh).toBeDefined();
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBeUndefined();
  });

  it('rejects a Gunsmith transform without touching storage or publishing a new snapshot', () => {
    const { context, storage } = setup();
    const before = context.saveData;
    const write = vi.spyOn(storage, 'setItem');
    expect(context.updateGunsmith(() => undefined)).toEqual({ persisted: false, value: before.gunsmith });
    expect(write).not.toHaveBeenCalled();
    expect(context.saveData).toBe(before);
  });

  it('previews without saving and commits the same immutable assembly', () => {
    const { controller, context, storage } = setup();
    const write = vi.spyOn(storage, 'setItem');
    controller.selectSlot('barrel');
    expect(controller.previewPart('long')).toMatchObject({ ok: true });
    const preview = controller.snapshot();
    expect(preview.candidateComparison?.displacedInstanceId).toBe('standard');
    expect(preview.candidatePreview?.layers[0].instanceId).toBe('long');
    expect(write).not.toHaveBeenCalled();
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('standard');
    expect(controller.commitPreview()).toMatchObject({ ok: true, persisted: true });
    expect(controller.snapshot().selectedBuild?.preview).toEqual(preview.candidatePreview);
    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(preview.candidatePreview?.layers)).toBe(true);
  });

  it('does not let a stale preview overwrite a newly occupied slot', () => {
    const { controller, context, storage } = setup();
    controller.selectSlot('barrel');
    controller.previewPart('long');
    context.updateGunsmith((state) => ({ ...state, builds: state.builds.map((build) => ({ ...build, fitted: {} })) }));
    const write = vi.spyOn(storage, 'setItem');
    expect(controller.commitPreview()).toMatchObject({ ok: false, reason: 'stale-target' });
    expect(write).not.toHaveBeenCalled();
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBeUndefined();
  });

  it('uses a presentation-owned chassis even when every tier-one weapon art changes', () => {
    const { controller, data } = setup();
    for (const weapon of data.weapons) if (weapon.mergeTier === 1) {
      Object.assign(weapon.art, { gunsmithPreviewBaseArtId: 'wrong-weapon-chassis' });
    }
    expect(controller.snapshot().selectedBuild?.preview?.baseArtId).toBe('gun-build-base:pistol');
    expect(controller.snapshot().families.find((family) => family.id === 'pistol')?.previewBaseArtId).toBe('gun-build-base:pistol');
  });

  it('re-resolves unequipping inside the transform without dropping a newly fitted optic', () => {
    const { controller, context } = setup();
    const update = context.updateGunsmith.bind(context);
    context.updateGunsmith = (transform) => {
      update((state) => ({ ...state, parts: { ...state.parts, optic: { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] } },
        builds: state.builds.map((build) => ({ ...build, fitted: { ...build.fitted, optic: 'optic' } })) }));
      return update(transform);
    };
    expect(controller.unequipPart('standard')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.builds[0].fitted).toEqual({ optic: 'optic' });
  });

  it('clears a candidate when selecting a different active family', () => {
    const { controller } = setup();
    controller.selectSlot('barrel');
    controller.previewPart('long');
    controller.createBuild('smg');
    expect(controller.snapshot().selectedCandidateInstanceId).toBeUndefined();
    expect(controller.snapshot().candidatePreview).toBeUndefined();
  });

  it('keeps a failed commit unpublished and allows retrying the unchanged candidate', () => {
    const { controller, context, storage } = setup();
    controller.selectSlot('barrel');
    controller.previewPart('long');
    const before = context.saveData;
    const preview = controller.snapshot().candidatePreview;
    const write = vi.spyOn(storage, 'setItem').mockReturnValue(false);
    expect(controller.commitPreview()).toEqual({ ok: false, reason: 'save-failed' });
    expect(context.saveData).toBe(before);
    expect(controller.snapshot().candidatePreview).toBe(preview);
    write.mockRestore();
    expect(controller.commitPreview()).toMatchObject({ ok: true });
    expect(controller.snapshot().selectedBuild?.preview).toEqual(preview);
  });

  it('normalizes both displayed and commanded slots after changing weapon family', () => {
    const { controller, context } = setup();
    controller.createBuild('smg');
    controller.selectSlot('stock');
    controller.selectBuild('build:pistol');
    context.updateGunsmith((state) => ({ ...state, parts: { ...state.parts,
      receiver: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] } } }));
    expect(controller.snapshot().selectedSlot).toBe('receiver');
    expect(controller.previewPart('receiver')).toMatchObject({ ok: true });
  });

  it('selects an existing family build by its stable ID instead of creating a duplicate chassis', () => {
    const { controller, context } = setup();
    context.updateGunsmith((state) => ({ ...state, builds: state.builds.map((build) => ({ ...build, id: 'legacy:pistol' })), selectedBuildId: 'legacy:pistol' }));
    expect(controller.createBuild('pistol')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.builds).toHaveLength(1);
    expect(context.saveData.gunsmith.selectedBuildId).toBe('legacy:pistol');
  });

  it('does not display removed candidate art after resetting progression', () => {
    const { controller, context } = setup();
    controller.selectSlot('barrel');
    controller.previewPart('long');
    context.resetProgression();
    expect(controller.snapshot().selectedCandidateInstanceId).toBeUndefined();
    expect(controller.snapshot().candidatePreview).toBeUndefined();
  });

  it('selects a full trait socket by stable instance ID and previews an atomic replacement', () => {
    const { controller, context, storage } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: { ...state.parts,
      fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
      mastered: { partId: 'part:trait-fire-mastered', tier: 3, infusedTraits: [] },
      spare: { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
    }, builds: state.builds.map((build) => ({ ...build, traitParts: ['fire', 'mastered'] })) }));
    controller.selectSlot('trait');
    expect(controller.snapshot().slots.find((slot) => slot.slot === 'trait')?.traitFitted?.map((part) => part.instanceId)).toEqual(['fire', 'mastered']);
    controller.selectTraitSocket('mastered');
    expect(controller.snapshot().selectedTraitInstanceId).toBe('mastered');
    expect(controller.snapshot().slots.find((slot) => slot.slot === 'trait')?.candidates.some((part) => part.instanceId === 'spare')).toBe(true);
    const write = vi.spyOn(storage, 'setItem');
    expect(controller.previewPart('spare')).toMatchObject({ ok: true });
    expect(controller.snapshot().candidateComparison?.displacedInstanceId).toBe('mastered');
    expect(write).not.toHaveBeenCalled();
    expect(controller.commitPreview()).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.builds[0].traitParts).toEqual(['fire', 'spare']);
    expect(context.saveData.gunsmith.parts.mastered).toBeDefined();
    expect(write).toHaveBeenCalledTimes(1);
  });
});
