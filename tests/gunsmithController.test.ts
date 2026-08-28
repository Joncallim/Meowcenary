import { describe, expect, it } from 'vitest';
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
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data,
    metaUpgrades: new DataMetaUpgradeRegistry(data), save: new SaveManager(storage, 'gunsmith', {}),
    characters: new DataCharacterRegistry(data), arenas: new DataArenaRegistry(data),
  });
  return { context, controller: new GunsmithController(context) };
}

describe('GunsmithController durable commands', () => {
  it('creates, selects and fits an owned instance through the Save V3 boundary', () => {
    const { context, controller } = setup();
    expect(context.updateGunsmith((state) => ({ ...state, parts: {
      'owned:barrel': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } })).persisted).toBe(true);
    expect(controller.createBuild('pistol')).toMatchObject({ ok: true });
    expect(controller.fitPart('owned:barrel')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.selectedBuildId).toBe('build:pistol');
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBe('owned:barrel');
    expect(controller.snapshot().parts[0]).toMatchObject({ name: 'Standard Barrel', compatible: true });
  });

  it('consumes a trait source and preserves the infused owned target', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      target: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      fire: { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
    } }));
    controller.createBuild('pistol');
    expect(controller.infuse('target', 'fire')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.parts.target.infusedTraits).toEqual(['FIRE']);
    expect(context.saveData.gunsmith.parts.fire).toBeUndefined();
  });

  it('removes consumed merged instances from every fitted build', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state,
      parts: {
        a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      },
      builds: [{ id: 'build:pistol', name: 'Main', baseWeaponFamily: 'pistol', fitted: { barrel: 'a' }, traitParts: [] }],
      selectedBuildId: 'build:pistol',
    }));
    expect(controller.merge('a', 'b')).toMatchObject({ ok: true });
    expect(context.saveData.gunsmith.parts.a).toBeUndefined();
    expect(context.saveData.gunsmith.parts.b).toBeUndefined();
    expect(context.saveData.gunsmith.builds[0].fitted.barrel).toBeUndefined();
    expect(Object.values(context.saveData.gunsmith.parts)[0].tier).toBe(2);
  });
});
