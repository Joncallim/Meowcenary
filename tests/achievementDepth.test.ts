import { describe, expect, it, vi } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { createDefaultSaveV4, MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData, validateGameData } from '../src/systems/validation';
import { DataAchievementRegistry, metricExtractor } from '../src/systems/achievements';
import { evaluateAchievements, type AchievementDefinition, type AchievementFacts } from '../src/gameplay/achievementSystem';
import { AchievementsController } from '../src/ui/achievementsController';
import { EquipmentController } from '../src/ui/equipmentController';
import type { AchievementPlatformAdapter } from '../src/gameplay/achievementPlatform';
import { upgradeCost } from '../src/gameplay/equipment';

class Storage extends MemoryStorageAdapter {
  succeeds = true;
  writes = 0;
  override setItem(key: string, value: string) { this.writes++; return this.succeeds && super.setItem(key, value); }
}
function harness(initial = createDefaultSaveV4(), storage = new Storage(), achievementPlatform?: AchievementPlatformAdapter) {
  const data = loadGameData();
  storage.setItem('depth', JSON.stringify(initial));
  const reload = () => createGameContext({ bus: createEventBus(), menuRng: createRng(1), data,
    achievementPlatform, arenas: new DataArenaRegistry(data), characters: new DataCharacterRegistry(data),
    metaUpgrades: new DataMetaUpgradeRegistry(data), save: new SaveManager(storage, 'depth', {}) });
  return { data, storage, context: reload(), reload };
}
function metric(id: string, facts: AchievementFacts) { return metricExtractor(`metric:${id}`)!(facts); }

describe('long-term achievement facts and atomic workshop rewards', () => {
  it('uses the combat trait resolver for distinct hybrid traits, including slotted cores', () => {
    const data = loadGameData();
    const facts: AchievementFacts = { metrics: {}, catalog: data, gunsmith: {
      builds: [{ id: 'build:hybrid', name: 'Hybrid', baseWeaponFamily: 'shotgun', fitted: { barrel: 'pierce', underbarrel: 'explode' }, traitParts: ['fire', 'fire-again'] }],
      parts: { pierce: { partId: 'part:barrel-piercing', tier: 1, infusedTraits: [] }, explode: { partId: 'part:underbarrel-grenade', tier: 1, infusedTraits: [] }, fire: { partId: 'part:trait-fire', tier: 1, infusedTraits: [] }, 'fire-again': { partId: 'part:trait-fire', tier: 1, infusedTraits: [] } },
    } };
    expect(metric('engineered-traits', facts)).toBe(3);
  });
  it('shows current simultaneous build progress instead of a stale saved peak', () => {
    const { context, data } = harness({ ...createDefaultSaveV4(), achievements: { 'achievement:engineered-arsenal': { completed: false, progress: 2 } } });
    const view = new AchievementsController(context, new DataAchievementRegistry({ achievements: data.achievements })).snapshot().achievements.find((row) => row.id === 'achievement:engineered-arsenal');
    expect(view).toMatchObject({ progress: 0, target: 3, status: 'locked' });
  });
  it('mirrors a workshop completion only after its complete candidate persists and never regrants it', async () => {
    const report = vi.fn(async () => undefined);
    const { context, storage, reload } = harness(createDefaultSaveV4(), new Storage(), { report });
    const engineer = () => context.updateGunsmith((state) => ({ ...state,
      builds: [{ id: 'build:test', name: 'Test', baseWeaponFamily: 'pistol', fitted: { receiver: 'a', barrel: 'b', optic: 'c' }, traitParts: [] }],
      parts: { a: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] }, b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }, c: { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] } },
    }));
    storage.succeeds = false;
    expect(engineer().persisted).toBe(false);
    await Promise.resolve();
    expect(report).not.toHaveBeenCalled();
    expect(context.saveData.achievements['achievement:engineered-family']).toBeUndefined();
    storage.succeeds = true;
    expect(engineer().persisted).toBe(true);
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('achievement:engineered-family', expect.objectContaining({ completed: true })));
    expect(context.saveData.progression.scrap).toBe(75);
    expect(engineer().persisted).toBe(true);
    expect(reload().saveData.progression.scrap).toBe(75);
  });
  it('counts distinct known fast Contracts with a positive completed best time only', () => {
    const data = loadGameData();
    expect(metric('contracts-cleared-under-180s', { metrics: {}, catalog: data, stages: {
      'stage:junkyard-01': { completed: true, bestTimeMs: 180000 },
      'stage:junkyard-02': { completed: true, bestTimeMs: 180001 },
      'stage:junkyard-03': { completed: true, bestTimeMs: 120000 }, // fixed-time survival is not a speed feat
      'stage:forge-02': { completed: true, bestTimeMs: 120000 },
      'stage:junkyard-04': { completed: true, bestTimeMs: 0 },
      'stage:retired': { completed: true, bestTimeMs: 1 },
    } })).toBe(1);
  });
  it('ignores stale/incompatible parts and duplicate builds of one family', () => {
    const data = loadGameData();
    const gunsmith = { builds: [
      { id: 'build:one', name: 'One', baseWeaponFamily: 'pistol', fitted: { receiver: 'a', barrel: 'b', optic: 'c' }, traitParts: [] },
      { id: 'build:two', name: 'Two', baseWeaponFamily: 'pistol', fitted: { receiver: 'a', barrel: 'b', optic: 'c' }, traitParts: [] },
      { id: 'build:bad', name: 'Bad', baseWeaponFamily: 'smg', fitted: { receiver: 'b', barrel: 'a', optic: 'stale' }, traitParts: [] },
    ], parts: { a: { partId: 'part:receiver-compact', tier: 1, infusedTraits: [] }, b: { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] }, c: { partId: 'part:optic-red-dot', tier: 1, infusedTraits: [] }, stale: { partId: 'part:retired', tier: 5, infusedTraits: [] } } };
    expect(metric('engineered-families', { metrics: {}, catalog: data, gunsmith })).toBe(1);
    expect(metric('equipment-tier-4', { metrics: {}, catalog: data, equipment: {
      a: { equipmentId: 'equipment:commando-helmet', tier: 4 }, b: { equipmentId: 'equipment:commando-helmet', tier: 4 }, stale: { equipmentId: 'equipment:retired', tier: 4 },
    } })).toBe(1);
  });
  it('commits the fourth T4 piece, milestone and reward in one write; failed saves and reload cannot duplicate it', () => {
    const save = createDefaultSaveV4();
    const initial = { ...save, progression: { ...save.progression, scrap: 5000, unlocks: ['equipment-tier:4'] },
      equipment: Object.fromEntries(['helmet','armour','gloves','boots'].map((slot, i) => [`owned:commando-${slot}`, { equipmentId: `equipment:commando-${slot}`, tier: i === 3 ? 3 : 4 }])) };
    // Tier policy's authoritative milestone is Forge Warden.
    initial.bosses = { 'boss-forge': { defeated: true } };
    const { context, storage, reload } = harness(initial);
    const before = context.saveData;
    const cost = upgradeCost(3);
    storage.succeeds = false;
    expect(context.commitEquipmentUpgrade('owned:commando-boots', 3, 4, cost)).toBe(false);
    expect(context.saveData).toBe(before);
    storage.succeeds = true;
    const writes = storage.writes;
    expect(context.commitEquipmentUpgrade('owned:commando-boots', 3, 4, cost)).toBe(true);
    expect(storage.writes).toBe(writes + 1);
    expect(context.saveData.achievements['achievement:equipment-capstone']).toMatchObject({ completed: true, progress: 4 });
    expect(context.saveData.progression.scrap).toBe(before.progression.scrap - cost + 200);
    expect(context.saveData.appliedGrantTransactions['achievement:equipment-capstone:completion']).toBe(true);
    const earned = context.saveData.progression.scrap;
    expect(reload().saveData.progression.scrap).toBe(earned);
    expect(context.commitEquipmentUpgrade('owned:commando-boots', 3, 4, cost)).toBe(false);
  });
  it('shows partial chapter/mastery progress and retains completed and retired history', () => {
    const save = createDefaultSaveV4();
    const { context, data } = harness({ ...save, stages: { 'stage:junkyard-01': { completed: true } }, characters: { 'scrap-tabby': { tier: 3, xp: 300 } },
      achievements: { 'achievement:retired-proof': { completed: true }, 'achievement:first-kill': { completed: true } } });
    const views = new AchievementsController(context, new DataAchievementRegistry({ achievements: data.achievements })).snapshot().achievements;
    expect(views.find((a) => a.id === 'achievement:chapter-junkyard')).toMatchObject({ progress: 1, target: 5, status: 'in-progress' });
    expect(views.find((a) => a.id === 'achievement:veteran-scrap-tabby')).toMatchObject({ progress: 3, target: 5 });
    expect(context.saveData.achievements['achievement:retired-proof']?.completed).toBe(true);
    expect(context.saveData.progression.scrap).toBe(75); // Tabby tier 1 reconciles; First Blood does not replay.
  });
  it('accepts a second data-only engineering goal and never revokes its earned milestone', () => {
    const data = structuredClone(loadGameData());
    const definition: AchievementDefinition = { id: 'achievement:second-engineering-fixture', name: 'Two families', description: 'Engineer two families.', kind: 'incremental', target: 2, metricId: 'metric:engineered-families', presentation: { iconArtId: 'achievement-icon:first-merge' } };
    const extended = { ...data, achievements: [...data.achievements!, definition] };
    expect(validateGameData(extended)).toBeTruthy();
    const state = { [definition.id]: { completed: true, progress: 2 } };
    const result = evaluateAchievements(state, { metrics: {}, catalog: data }, { definitions: new Map([[definition.id, definition]]), metrics: new Map([[definition.metricId!, metricExtractor(definition.metricId!)!]]) }, 1);
    expect(result.state).toBe(state);
    expect(result.rewards).toEqual([]);
  });
  it('removes the fabrication offer after real acquisition and reload while preserving its blueprint cost', () => {
    const initial = createDefaultSaveV4();
    const { context, reload } = harness({ ...initial, progression: { ...initial.progression, scrap: 200 } });
    const controller = new EquipmentController(context);
    expect(controller.fabricate('equipment:commando-helmet')).toBe(true);
    expect(context.saveData.progression.scrap).toBe(100);
    for (const current of [context, reload()]) {
      const equipment = new EquipmentController(current);
      const route = equipment.snapshot().acquisition.find((row) => row.equipmentId === 'equipment:commando-helmet');
      expect(route).toMatchObject({ owned: true, available: true });
      expect(route?.summary).toContain('Blueprint cost: 100 Scrap');
      expect(route?.summary).toContain('No additional copy can be fabricated');
      expect(route?.summary).not.toContain('Fabricate for');
      expect(equipment.fabricable()).not.toContain('equipment:commando-helmet');
      expect(equipment.fabricate('equipment:commando-helmet')).toBe(false);
      expect(current.saveData.progression.scrap).toBe(100);
    }
  });
  it('equipment read models distinguish available blueprints and actual ownership without grants', () => {
    const { context } = harness();
    const controller = new EquipmentController(context);
    const before = controller.snapshot().acquisition.find((row) => row.equipmentId === 'equipment:commando-helmet');
    expect(before).toMatchObject({ available: true, owned: false });
    expect(before?.summary).toContain('not owned');
    expect(context.saveData.equipment).toEqual({});
  });
});
