import { describe, expect, it, vi } from 'vitest';
import { createGameContext, type GameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { EquipmentController } from '../src/ui/equipmentController';

class CountingStorage extends MemoryStorageAdapter {
  writes = 0;
  succeed = true;
  override setItem(key: string, value: string): boolean {
    this.writes += 1;
    return this.succeed && super.setItem(key, value);
  }
}

function setup(equipped = false) {
  const data = loadGameData();
  const storage = new CountingStorage();
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data,
    save: new SaveManager(storage, 'equipment-controller-test'),
    arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
  });
  context.updateEquipment(() => ({
    equipment: {
      'owned:helmet': { equipmentId: 'equipment:commando-helmet', tier: 1 },
      'owned:other-helmet': { equipmentId: 'equipment:recon-helmet', tier: 1 },
    },
    loadout: equipped ? { helmet: 'owned:helmet' } : {},
  }));
  storage.writes = 0;
  return { context, storage, controller: new EquipmentController(context) };
}

// Inject a separate successful command after the controller's preview/read,
// immediately before its transform runs against the real persistence owner.
function beforeEquipmentTransform(context: GameContext, change: () => void) {
  const update = context.updateEquipment.bind(context);
  vi.spyOn(context, 'updateEquipment').mockImplementationOnce((transform) => {
    change();
    return update(transform);
  });
  return update;
}

describe('EquipmentController authoritative commands', () => {
  it('keeps current-item selection free of self-displacement and freezes unavailable snapshot rows', () => {
    const { context, controller } = setup(true);
    context.updateEquipment(({ equipment, loadout }) => ({
      equipment: { ...equipment, unknown: { equipmentId: 'equipment:retired', tier: 1 } }, loadout,
    }));
    controller.selectSlot('helmet');
    const snapshot = controller.snapshot();
    expect(snapshot.selectedInstanceId).toBe('owned:helmet');
    expect(snapshot.comparison).toBeUndefined();
    expect(Object.isFrozen(snapshot.unavailable[0])).toBe(true);
  });

  it('retains selected stable identities across snapshot repaint and changes from blueprint to stored item after fabrication', () => {
    const { context, controller } = setup();
    context.updateMeta((state) => ({ ...state, scrap: 500 }));
    expect(controller.selectSlot('boots')).toBe(true);
    expect(controller.selectCandidate('owned:helmet')).toBe(false);
    expect(controller.selectBlueprint('equipment:commando-boots')).toBe(true);
    expect(controller.snapshot().selectedBlueprintId).toBe('equipment:commando-boots');
    expect(controller.snapshot().selectedBlueprintId).toBe('equipment:commando-boots');
    expect(controller.fabricate('equipment:commando-boots')).toBe(true);
    const snapshot = controller.snapshot();
    expect(snapshot.selectedBlueprintId).toBeUndefined();
    expect(snapshot.selectedInstanceId).toBe('owned:equipment-commando-boots');
    expect(snapshot.presentation.slots[3]!.candidates[0]!.state).toBe('STORED');
    expect(snapshot.equipped.boots).toBeUndefined();
  });
  it('equips against current ownership/loadout without overwriting a newer other-slot change', () => {
    const { context, storage, controller } = setup();
    let update: GameContext['updateEquipment'];
    update = beforeEquipmentTransform(context, () => {
      update(({ equipment, loadout }) => ({
        equipment: { ...equipment, 'owned:boots': { equipmentId: 'equipment:commando-boots', tier: 1 } },
        loadout: { ...loadout, boots: 'owned:boots' },
      }));
      storage.writes = 0;
    });

    expect(controller.equip('owned:helmet')).toBe(true);
    expect(context.saveData.equipment['owned:boots']).toBeDefined();
    expect(context.saveData.equipmentLoadout).toEqual({ helmet: 'owned:helmet', boots: 'owned:boots' });
    expect(storage.writes).toBe(1);
  });

  it('rejects an instance removed since preview without resurrecting it or writing', () => {
    const { context, storage, controller } = setup();
    expect(controller.snapshot().owned.some((item) => item.instanceId === 'owned:helmet')).toBe(true);
    let update: GameContext['updateEquipment'];
    let current = context.saveData;
    update = beforeEquipmentTransform(context, () => {
      update(({ equipment, loadout }) => ({
        equipment: { 'owned:other-helmet': equipment['owned:other-helmet'] }, loadout,
      }));
      current = context.saveData;
      storage.writes = 0;
    });

    expect(controller.equip('owned:helmet')).toBe(false);
    expect(context.saveData).toBe(current);
    expect(context.saveData.equipment['owned:helmet']).toBeUndefined();
    expect(storage.writes).toBe(0);
  });

  it('unequips the current slot while preserving newer equipment and other slots', () => {
    const { context, storage, controller } = setup(true);
    let update: GameContext['updateEquipment'];
    update = beforeEquipmentTransform(context, () => {
      update(({ equipment, loadout }) => ({
        equipment: { ...equipment, 'owned:boots': { equipmentId: 'equipment:commando-boots', tier: 1 } },
        loadout: { ...loadout, boots: 'owned:boots' },
      }));
      storage.writes = 0;
    });

    expect(controller.unequip('helmet')).toBe(true);
    expect(context.saveData.equipment['owned:boots']).toBeDefined();
    expect(context.saveData.equipmentLoadout).toEqual({ boots: 'owned:boots' });
    expect(storage.writes).toBe(1);
  });

  it('rejects a slot emptied between read and transform with zero additional writes', () => {
    const { context, storage, controller } = setup(true);
    let update: GameContext['updateEquipment'];
    let current = context.saveData;
    update = beforeEquipmentTransform(context, () => {
      update(({ equipment }) => ({ equipment, loadout: {} }));
      current = context.saveData;
      storage.writes = 0;
    });

    expect(controller.unequip('helmet')).toBe(false);
    expect(context.saveData).toBe(current);
    expect(storage.writes).toBe(0);
  });

  it('rejects missing, unknown-definition, repeated-equip and empty-slot requests without writes', () => {
    const { context, storage, controller } = setup(true);
    context.updateEquipment(({ equipment, loadout }) => ({
      equipment: { ...equipment, 'owned:unavailable': { equipmentId: 'equipment:retired', tier: 1 } }, loadout,
    }));
    storage.writes = 0;
    const current = context.saveData;

    expect(controller.equip('owned:missing')).toBe(false);
    expect(controller.equip('owned:unavailable')).toBe(false);
    expect(controller.equip('owned:helmet')).toBe(false);
    expect(controller.unequip('boots')).toBe(false);
    expect(context.saveData).toBe(current);
    expect(storage.writes).toBe(0);
  });

  it('atomically replaces one slot in a single durable write', () => {
    const { context, storage, controller } = setup(true);
    expect(controller.equip('owned:other-helmet')).toBe(true);
    expect(context.saveData.equipmentLoadout).toEqual({ helmet: 'owned:other-helmet' });
    expect(storage.writes).toBe(1);
  });

  it.each(['equip', 'unequip'] as const)('%s save failure preserves all published identities', (action) => {
    const { context, storage, controller } = setup(true);
    const current = context.saveData;
    storage.succeed = false;

    expect(action === 'equip' ? controller.equip('owned:other-helmet') : controller.unequip('helmet')).toBe(false);
    expect(context.saveData).toBe(current);
    expect(context.saveData.equipment).toBe(current.equipment);
    expect(context.saveData.equipmentLoadout).toBe(current.equipmentLoadout);
    expect(storage.writes).toBe(1);
  });

  it('rejects a transform without writing and returns the published equipment identity', () => {
    const { context, storage } = setup();
    const current = context.saveData;

    const result = context.updateEquipment(() => undefined);

    expect(result).toEqual({ persisted: false, value: current.equipment });
    expect(result.value).toBe(current.equipment);
    expect(context.saveData).toBe(current);
    expect(storage.writes).toBe(0);
  });

  it.each(['removed', 'upgraded'] as const)('rejects an upgrade whose owned item was %s after the controller read', (change) => {
    const { context, storage, controller } = setup();
    context.updateMeta((progression) => ({
      ...progression, scrap: 500, unlocks: [...progression.unlocks, 'capability:equipment-tier-2'],
    }));
    const commit = context.commitEquipmentUpgrade.bind(context);
    let current = context.saveData;
    vi.spyOn(context, 'commitEquipmentUpgrade').mockImplementationOnce((...args) => {
      context.updateEquipment(({ equipment, loadout }) => {
        const next = { ...equipment };
        if (change === 'removed') delete next['owned:helmet'];
        else next['owned:helmet'] = { ...next['owned:helmet'], tier: 2 };
        return { equipment: next, loadout };
      });
      current = context.saveData;
      storage.writes = 0;
      return commit(...args);
    });

    expect(controller.upgrade('owned:helmet')).toBe(false);
    expect(context.saveData).toBe(current);
    expect(context.saveData.progression.scrap).toBe(500);
    expect(storage.writes).toBe(0);
  });

  it('rejects a changed tier between displaying an upgrade preview and confirming it', () => {
    const { context, storage, controller } = setup(true);
    const displayedTier = controller.snapshot().owned.find((item) => item.instanceId === 'owned:helmet')!.tier;
    context.updateMeta((progression) => ({
      ...progression, scrap: 500, unlocks: [...progression.unlocks, 'capability:equipment-tier-3'],
    }));
    context.updateEquipment(({ equipment, loadout }) => ({
      equipment: { ...equipment, 'owned:helmet': { ...equipment['owned:helmet'], tier: 2 } }, loadout,
    }));
    const current = context.saveData;
    storage.writes = 0;

    expect(controller.upgrade('owned:helmet', displayedTier)).toBe(false);
    expect(context.saveData).toBe(current);
    expect(context.saveData.progression.scrap).toBe(500);
    expect(storage.writes).toBe(0);
  });

  it('keeps fresher loadout and ownership when an upgrade commits', () => {
    const { context, storage, controller } = setup(true);
    context.updateMeta((progression) => ({
      ...progression, scrap: 500, unlocks: [...progression.unlocks, 'capability:equipment-tier-2'],
    }));
    const commit = context.commitEquipmentUpgrade.bind(context);
    vi.spyOn(context, 'commitEquipmentUpgrade').mockImplementationOnce((...args) => {
      context.updateEquipment(({ equipment, loadout }) => ({
        equipment: { ...equipment, 'owned:boots': { equipmentId: 'equipment:commando-boots', tier: 1 } },
        loadout: { ...loadout, boots: 'owned:boots' },
      }));
      storage.writes = 0;
      return commit(...args);
    });

    expect(controller.upgrade('owned:helmet')).toBe(true);
    expect(context.saveData.equipment['owned:helmet'].tier).toBe(2);
    expect(context.saveData.equipment['owned:boots']).toBeDefined();
    expect(context.saveData.equipmentLoadout).toEqual({ helmet: 'owned:helmet', boots: 'owned:boots' });
    expect(context.saveData.progression.scrap).toBe(400);
    expect(storage.writes).toBe(1);
  });

  it('rejects upgrading an unavailable definition at the authoritative boundary without writing', () => {
    const { context, storage } = setup();
    context.updateMeta((progression) => ({
      ...progression, scrap: 500, unlocks: [...progression.unlocks, 'capability:equipment-tier-2'],
    }));
    context.updateEquipment(({ equipment, loadout }) => ({
      equipment: { ...equipment, 'owned:unavailable': { equipmentId: 'equipment:retired', tier: 1 } }, loadout,
    }));
    const current = context.saveData;
    expect(current.equipment['owned:unavailable']).toBeDefined();
    storage.writes = 0;

    expect(context.commitEquipmentUpgrade('owned:unavailable', 1, 2, 100)).toBe(false);
    expect(context.saveData).toBe(current);
    expect(storage.writes).toBe(0);
  });

  it('upgrade save failure publishes neither tier nor Scrap change', () => {
    const { context, storage, controller } = setup(true);
    context.updateMeta((progression) => ({
      ...progression, scrap: 500, unlocks: [...progression.unlocks, 'capability:equipment-tier-2'],
    }));
    const current = context.saveData;
    storage.writes = 0;
    storage.succeed = false;

    expect(controller.upgrade('owned:helmet')).toBe(false);
    expect(context.saveData).toBe(current);
    expect(context.saveData.equipment).toBe(current.equipment);
    expect(context.saveData.equipmentLoadout).toBe(current.equipmentLoadout);
    expect(context.saveData.progression).toBe(current.progression);
    expect(storage.writes).toBe(1);
  });
});
