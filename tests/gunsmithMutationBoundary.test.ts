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

describe('Gunsmith current-state mutation boundary', () => {
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

  it('rejects a Gunsmith transform without touching storage or publishing a new snapshot', () => {
    const { context, storage } = setup();
    const before = context.saveData;
    const write = vi.spyOn(storage, 'setItem');
    expect(context.updateGunsmith(() => undefined)).toEqual({ persisted: false, value: before.gunsmith });
    expect(write).not.toHaveBeenCalled();
    expect(context.saveData).toBe(before);
  });

});
