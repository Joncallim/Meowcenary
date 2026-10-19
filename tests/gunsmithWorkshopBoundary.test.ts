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
  const data = loadGameData();
  const storage = new MemoryStorageAdapter();
  const context = createGameContext({ bus: createEventBus(), menuRng: createRng(1), data,
    metaUpgrades: new DataMetaUpgradeRegistry(data), save: new SaveManager(storage, 'workshop-boundary', {}),
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data) });
  context.updateGunsmith((state) => ({ ...state, parts: {
    target: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
    spare: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] },
    core: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
  }, builds: [{ id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol',
    fitted: { receiver: 'target' }, traitParts: [] }], selectedBuildId: 'build:pistol' }));
  return { context, storage, controller: new GunsmithController(context) };
}

describe('Workshop confirmation persistence boundary', () => {
  for (const kind of ['merge', 'infuse'] as const) {
    it(`rejects ${kind} when current inputs change inside the persistence transform`, () => {
      const { context, storage, controller } = setup();
      const request = kind === 'merge'
        ? { kind, firstInstanceId: 'target', secondInstanceId: 'spare' }
        : { kind, targetInstanceId: 'target', traitInstanceId: 'core' };
      expect(controller.requestWorkshop(request)).toMatchObject({ ok: true });
      const write = vi.spyOn(storage, 'setItem');
      const update = context.updateGunsmith.bind(context);
      context.updateGunsmith = (transform) => {
        update((state) => ({ ...state, parts: { ...state.parts,
          target: { ...state.parts.target, tier: 2 }, spare: { ...state.parts.spare, tier: 2 } } }));
        return update(transform);
      };
      expect(controller.confirmWorkshop()).toEqual({ ok: false, reason: 'workshop-operation-unavailable' });
      expect(write).toHaveBeenCalledTimes(1); // Intervening command only.
      expect(context.saveData.gunsmith.parts.target.tier).toBe(2);
      expect(context.saveData.gunsmith.parts.spare.tier).toBe(2);
      expect(context.saveData.gunsmith.parts.core).toBeDefined();
      expect(context.saveData.gunsmith.builds[0].fitted.receiver).toBe('target');
    });
  }

  it('rejects a stale merge when an intervening donor change alters the reviewed shared trait consequence', () => {
    const { context, storage, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        first: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
        second: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
        other: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol', fitted: {}, traitParts: ['first', 'other'] }],
      selectedBuildId: 'build:pistol',
    }));
    expect(controller.requestWorkshop({ kind: 'merge', firstInstanceId: 'first', secondInstanceId: 'second' })).toMatchObject({ ok: true });

    const write = vi.spyOn(storage, 'setItem');
    const update = context.updateGunsmith.bind(context);
    context.updateGunsmith = (transform) => {
      update((state) => ({ ...state,
        parts: Object.fromEntries(Object.entries(state.parts).filter(([id]) => id !== 'other')),
        builds: state.builds.map((build) => build.id === 'build:pistol' ? { ...build, traitParts: build.traitParts.filter((id) => id !== 'other') } : build),
      }));
      return update(transform);
    };

    expect(controller.confirmWorkshop()).toEqual({ ok: false, reason: 'workshop-operation-unavailable' });
    expect(write).toHaveBeenCalledTimes(1); // Only the intervening donor edit persisted.
    expect(context.saveData.gunsmith.parts.first).toBeDefined();
    expect(context.saveData.gunsmith.parts.second).toBeDefined();
    expect(context.saveData.gunsmith.parts.other).toBeUndefined();
    expect(context.saveData.gunsmith.builds[0]?.traitParts).toEqual(['first']);
  });

  it('allows an unrelated build update while preserving the reviewed Workshop consequence', () => {
    const { context, storage, controller } = setup();
    expect(controller.requestWorkshop({ kind: 'merge', firstInstanceId: 'target', secondInstanceId: 'spare' })).toMatchObject({ ok: true });

    const write = vi.spyOn(storage, 'setItem');
    const update = context.updateGunsmith.bind(context);
    context.updateGunsmith = (transform) => {
      update((state) => ({ ...state,
        parts: { ...state.parts, unrelated: { partId: 'part:stock-padded', tier: 1, infusedTraits: [] } },
        builds: [...state.builds, { id: 'build:smg', name: 'Unrelated', baseWeaponFamily: 'smg', fitted: { stock: 'unrelated' }, traitParts: [] }],
      }));
      return update(transform);
    };

    expect(controller.confirmWorkshop()).toEqual({ ok: true, persisted: true });
    expect(write).toHaveBeenCalledTimes(2); // Unrelated update plus the accepted merge.
    expect(context.saveData.gunsmith.parts.unrelated).toBeDefined();
    expect(context.saveData.gunsmith.builds.find((build) => build.id === 'build:smg')?.fitted.stock).toBe('unrelated');
    expect(Object.values(context.saveData.gunsmith.parts)).toHaveLength(3);
  });

  it('rejects infusion when a nonselected retained target gains a newly effective trait after review', () => {
    const { context, storage, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: { ...state.parts, other: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] } },
      builds: [
        { id: 'build:pistol', name: 'Sidearm', baseWeaponFamily: 'pistol', fitted: {}, traitParts: [] },
        { id: 'build:smg', name: 'Infusion SMG', baseWeaponFamily: 'smg', fitted: { receiver: 'target' }, traitParts: ['other'] },
      ], selectedBuildId: 'build:pistol',
    }));
    expect(controller.requestWorkshop({ kind: 'infuse', targetInstanceId: 'target', traitInstanceId: 'core' })).toMatchObject({ ok: true });
    const write = vi.spyOn(storage, 'setItem');
    const update = context.updateGunsmith.bind(context);
    context.updateGunsmith = (transform) => {
      update((state) => ({ ...state,
        parts: Object.fromEntries(Object.entries(state.parts).filter(([id]) => id !== 'other')),
        builds: state.builds.map((build) => build.id === 'build:smg' ? { ...build, traitParts: [] } : build),
      }));
      return update(transform);
    };
    expect(controller.confirmWorkshop()).toEqual({ ok: false, reason: 'workshop-operation-unavailable' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(context.saveData.gunsmith.parts.target.infusedTraits).toEqual([]);
    expect(context.saveData.gunsmith.parts.core).toBeDefined();
  });
});
