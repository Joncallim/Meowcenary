import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import {
  MemoryStorageAdapter,
  SaveManager,
  type StorageAdapter,
} from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { MainMenuController } from '../src/ui/menus';

function setup(storage?: StorageAdapter) {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const save = new SaveManager(
    storage ?? new MemoryStorageAdapter(),
    'menu-controller-test',
  );
  const menuRng = createRng(1);
  const context = createGameContext({
    bus: createEventBus(),
    menuRng,
    data,
    arenas,
    characters,
    save,
  });
  return { context, controller: new MainMenuController(context), menuRng };
}

class FailingStorageAdapter implements StorageAdapter {
  getItem(): string | null { return null; }
  setItem(): boolean { return false; }
  removeItem(): boolean { return false; }
}

describe('MainMenuController', () => {
  it('starts on the home panel with frozen snapshots from each sub-controller', () => {
    const { controller } = setup();
    const snapshot = controller.snapshot();

    expect(snapshot.panel).toBe('home');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.character.selectedCharacterId).toBe('scrap-tabby');
    expect(snapshot.arena.selectedArenaId).toBe('junkyard-lot');
    expect(snapshot.settings.musicVolume).toBe(0.7);
    expect(snapshot.notice).toBeUndefined();
  });

  it('opens sub-panels and returns to home via back', () => {
    const { controller } = setup();

    expect(controller.open('character').panel).toBe('character');
    expect(controller.open('arena').panel).toBe('arena');
    expect(controller.open('stage').panel).toBe('stage');
    expect(controller.open('settings').panel).toBe('settings');

    const backToHome = controller.back();
    expect(backToHome.panel).toBe('home');
    expect(backToHome.notice).toBeUndefined();
  });

  it('selectCharacter delegates revision checking and surfaces failure notices', () => {
    const { controller } = setup();
    controller.open('character');

    const stale = controller.selectCharacter('scrap-tabby', 999);
    expect(stale.notice).toBe('Selection changed; please retry');

    const unknown = controller.selectCharacter('nonexistent', stale.character.revision);
    expect(unknown.notice).toBe('Selection not found');

    const locked = controller.selectCharacter('bolt-hound', unknown.character.revision);
    expect(locked.notice).toBe('Selection is locked');
  });

  it('selectArena delegates revision checking and surfaces failure notices', () => {
    const { controller } = setup();
    controller.open('arena');

    const stale = controller.selectArena('junkyard-lot', 999);
    expect(stale.notice).toBe('Selection changed; please retry');

    const unknown = controller.selectArena('nonexistent', stale.arena.revision);
    expect(unknown.notice).toBe('Selection not found');
  });

  it('setSettings delegates to SettingsController and surfaces persistence notice', () => {
    const { controller } = setup(new FailingStorageAdapter());
    controller.open('settings');

    const result = controller.setSettings({ muted: true });

    expect(result.panel).toBe('settings');
    expect(result.settings.muted).toBe(true);
    expect(result.notice).toBe('Saved for this session only');
  });

  it('clears notices when navigating between panels', () => {
    const { controller } = setup();
    controller.open('character');
    controller.selectCharacter('nonexistent', 1);

    expect(controller.snapshot().notice).toBe('Selection not found');
    expect(controller.open('arena').notice).toBeUndefined();
  });

  it('routes Gunsmith merge/infuse and equipment upgrade through durable menu commands', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      target: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      fire: { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
    } }));
    expect(controller.mergeGunParts('a', 'b').notice).toBeUndefined();
    expect(controller.infuseGunPart('target', 'fire').notice).toBeUndefined();
    expect(context.saveData.gunsmith.parts.target.infusedTraits).toEqual(['FIRE']);

    context.updateMeta((meta) => ({ ...meta, scrap: 100 }));
    expect(context.completeStage('stage:junkyard-02', 1)).toBe(true);
    context.updateEquipment(() => ({
      equipment: { helmet: { equipmentId: 'equipment:commando-helmet', tier: 1 } }, loadout: {},
    }));
    expect(controller.open('equipment').equipment.owned).toHaveLength(1);
    expect(controller.open('equipment').equipment.owned[0]).toMatchObject({ setId: 'set:commando', iconArtId: 'upgrade-icon:smg-overclock', effectSummary: ['Fire rate 5%'] });
    expect(controller.equipEquipment('helmet').equipment.equipped.helmet).toBe('helmet');
    expect(controller.snapshot().equipment.activeSets).toMatchObject([{ setId: 'set:commando', pieces: 1, activeThresholds: [], bonusSummary: expect.arrayContaining(['2-piece: Fire rate 10%']) }]);
    expect(controller.upgradeEquipment('helmet').equipment.owned[0].tier).toBe(2);
    expect(controller.snapshot().equipment.owned[0].effectSummary).toEqual(['Fire rate 10%']);
    // The stage command now banks its profile-owned first-clear reward.
    expect(controller.snapshot().progressionOverview.completedStages).toBeGreaterThanOrEqual(1);
  });

  it('keeps stale equipment definitions visible as recoverable unavailable state', () => {
    const { context, controller } = setup();
    context.updateEquipment(() => ({
      equipment: { legacy: { equipmentId: 'equipment:retired-piece', tier: 1 } }, loadout: {},
    }));
    const snapshot = controller.open('equipment').equipment;
    expect(snapshot.owned).toEqual([]);
    expect(snapshot.unavailable).toEqual([{ instanceId: 'legacy', equipmentId: 'equipment:retired-piece' }]);
  });

  it('does not consume menu RNG', () => {
    const { controller, menuRng } = setup();
    const spy = vi.spyOn(menuRng, 'next');

    controller.open('character');
    controller.selectCharacter('nonexistent', 1);
    controller.open('arena');
    controller.selectArena('nonexistent', 1);
    controller.open('stage');
    controller.setSettings({ muted: true });

    expect(spy).not.toHaveBeenCalled();
  });
});
