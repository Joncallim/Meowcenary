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

  it('routes Gunsmith merge/infuse through explicit confirmation and rejects duplicate confirm', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      target: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      fire: { partId: 'part:trait-fire', tier: 2, infusedTraits: [] },
    } }));
    expect(controller.requestGunWorkshop({ kind: 'merge', firstInstanceId: 'a', secondInstanceId: 'b' }).gunsmith.confirmation).toBeDefined();
    expect(context.saveData.gunsmith.parts.a).toBeDefined();
    expect(controller.cancelGunWorkshop().gunsmith.confirmation).toBeUndefined();
    controller.requestGunWorkshop({ kind: 'merge', firstInstanceId: 'a', secondInstanceId: 'b' });
    expect(controller.confirmGunWorkshop().notice).toBeUndefined();
    expect(controller.confirmGunWorkshop().notice).toBe('Choose a Workshop operation first');
    expect(controller.requestGunWorkshop({ kind: 'infuse', targetInstanceId: 'target', traitInstanceId: 'fire' }).gunsmith.confirmation).toBeDefined();
    expect(controller.confirmGunWorkshop().notice).toBeUndefined();
    expect(context.saveData.gunsmith.parts.target.infusedTraits).toEqual(['FIRE']);

    context.updateMeta((meta) => ({ ...meta, scrap: 100 }));
    expect(context.completeStage('stage:junkyard-02', 1)).toBe(true);
    expect(context.completeStage('stage:junkyard-03', 1)).toBe(true);
    context.updateEquipment(() => ({
      equipment: { helmet: { equipmentId: 'equipment:commando-helmet', tier: 1 } }, loadout: {},
    }));
    expect(controller.open('equipment').equipment.owned).toHaveLength(1);
    expect(controller.open('equipment').equipment.owned[0]).toMatchObject({ setName: 'Commando', effectSummary: ['+5% Fire Rate'] });
    expect(controller.equipEquipment('helmet').equipment.equipped.helmet).toBe('helmet');
    expect(controller.snapshot().equipment.activeSets).toMatchObject([{ name: 'Commando', emblemArtId: 'equipment-set-icon:commando', pieces: 1, activeThresholds: [], bonusSummary: [] }]);
    expect(controller.upgradeEquipment('helmet').equipment.owned[0].tier).toBe(2);
    expect(controller.snapshot().equipment.owned[0].effectSummary).toEqual(['+10% Fire Rate']);
    // The stage command now banks its profile-owned first-clear reward.
    expect(controller.snapshot().progressionOverview.completedStages).toBeGreaterThanOrEqual(1);
  });

  it('uses Back to cancel a pending Workshop confirmation before leaving Gunsmith', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } }));
    controller.open('gunsmith');
    controller.requestGunWorkshop({ kind: 'merge', firstInstanceId: 'a', secondInstanceId: 'b' });

    const cancelled = controller.back();
    expect(cancelled.panel).toBe('gunsmith');
    expect(cancelled.gunsmith.confirmation).toBeUndefined();
    expect(context.saveData.gunsmith.parts).toHaveProperty('a');
    expect(controller.back().panel).toBe('home');
  });

  it('uses Back to unwind Workshop confirmation and each merge-selection layer', () => {
    const { context, controller } = setup();
    context.updateGunsmith((state) => ({ ...state, parts: {
      a: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
      b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
    } }));
    const gunsmith = controller.open('gunsmith').gunsmith;
    const group = gunsmith.workshop.find((entry) => entry.kind === 'merge')!;
    let snapshot = controller.beginGunMerge(group.groupId);
    expect(snapshot.gunsmith.mergeSelection?.step).toBe('first');
    snapshot = controller.selectGunMergeInput('a');
    expect(snapshot.gunsmith.mergeSelection?.step).toBe('second');
    snapshot = controller.selectGunMergeInput('b');
    expect(snapshot.gunsmith.confirmation).toBeDefined();

    snapshot = controller.back();
    expect(snapshot.gunsmith.confirmation).toBeUndefined();
    expect(snapshot.gunsmith.mergeSelection?.step).toBe('second');
    snapshot = controller.back();
    expect(snapshot.gunsmith.mergeSelection?.step).toBe('first');
    snapshot = controller.back();
    expect(snapshot.panel).toBe('gunsmith');
    expect(snapshot.gunsmith.mergeSelection).toBeUndefined();
    expect(controller.back().panel).toBe('home');
  });

  it('exposes unlocked Equipment blueprints and fabricates them through the durable menu command', () => {
    const { context, controller } = setup();
    context.updateMeta((meta) => ({ ...meta, scrap: 100 }));

    const equipment = controller.open('equipment').equipment;
    const blueprint = equipment.blueprints.find(
      (candidate) => candidate.equipmentId === 'equipment:commando-helmet',
    );
    expect(blueprint).toMatchObject({
      name: 'Commando Helmet',
      setName: 'Commando',
      setEmblemArtId: 'equipment-set-icon:commando',
      slot: 'helmet',
      fabricationCost: 100,
      effectSummary: ['+5% Fire Rate'],
    });

    const fabricated = controller.fabricateEquipment('equipment:commando-helmet');

    expect(fabricated.notice).toBeUndefined();
    expect(fabricated.equipment.blueprints).not.toContainEqual(
      expect.objectContaining({ equipmentId: 'equipment:commando-helmet' }),
    );
    expect(fabricated.equipment.owned).toContainEqual(expect.objectContaining({
      instanceId: 'owned:equipment-commando-helmet',
      equipmentId: 'equipment:commando-helmet',
      tier: 1,
    }));
    expect(context.saveData.progression.scrap).toBe(0);
  });

  it('never offers or duplicates a definition already owned under a reward instance ID', () => {
    const { context, controller } = setup();
    context.updateMeta((meta) => ({ ...meta, scrap: 100 }));
    context.updateEquipment(() => ({
      equipment: {
        'reward:crusher-commando-helmet': {
          equipmentId: 'equipment:commando-helmet',
          tier: 1,
        },
      },
      loadout: {},
    }));

    expect(controller.open('equipment').equipment.blueprints).not.toContainEqual(
      expect.objectContaining({ equipmentId: 'equipment:commando-helmet' }),
    );

    const rejected = controller.fabricateEquipment('equipment:commando-helmet');

    expect(rejected.notice).toBe('Equipment: fabrication unavailable');
    expect(context.saveData.progression.scrap).toBe(100);
    expect(context.saveData.equipment).toEqual({
      'reward:crusher-commando-helmet': {
        equipmentId: 'equipment:commando-helmet',
        tier: 1,
      },
    });
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
