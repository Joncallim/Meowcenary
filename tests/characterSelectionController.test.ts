import { describe, expect, it } from 'vitest';
import { CharacterSelectionController } from '../src/ui/characterSelectionController';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

function setup() {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const save = new SaveManager(new MemoryStorageAdapter(), 'controller-test', metaUpgrades.maxLevels());
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data, arenas, metaUpgrades, characters, save,
  });
  return { context, controller: new CharacterSelectionController(context) };
}

describe('CharacterSelectionController', () => {
  it('snapshot returns frozen, registry-ordered view with locked flags', () => {
    const { controller } = setup();
    const snapshot = controller.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.characters)).toBe(true);
    expect(snapshot.selectedCharacterId).toBe('scrap-tabby');
    expect(snapshot.revision).toBe(1);
    expect(snapshot.characters).toHaveLength(8);
    expect(snapshot.characters[0]).toMatchObject({ id: 'scrap-tabby', locked: false, selected: true });
    expect(snapshot.characters[0]).toMatchObject({ abilityName: expect.any(String), abilityDescription: expect.any(String) });
    expect(snapshot.characters[0]).toMatchObject({
      baseStatsSummary: expect.stringContaining('health'),
      passiveSummary: expect.stringContaining('Scrap Hoarder'),
      startingWeaponSummary: expect.any(String),
      unlockRequirement: 'Available from the start.',
    });
    expect(snapshot.characters.find((character) => character.id === 'brass-boar')).toMatchObject({
      locked: true,
      unlockRequirement: 'Defeat boss-crusher.',
    });
    // Only the default character is unlocked on a fresh save.
    const unlocked = snapshot.characters.filter((c) => !c.locked);
    expect(unlocked.map((c) => c.id)).toEqual(['scrap-tabby']);
  });

  it('select enforces revision token', () => {
    const { controller } = setup();
    const result = controller.select('scrap-tabby', 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale-selection');
    }
    expect(result.snapshot.selectedCharacterId).toBe('scrap-tabby');
  });

  it('select rejects locked characters', () => {
    const { controller } = setup();
    const result = controller.select('bolt-hound', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('locked');
    }
    expect(result.snapshot.selectedCharacterId).toBe('scrap-tabby');
  });

  it('select rejects unknown characters', () => {
    const { controller } = setup();
    const result = controller.select('nonexistent', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-character');
    }
  });

  it('select succeeds for unlocked character and returns updated snapshot', () => {
    const { context, controller } = setup();
    expect(context.commitAchievementTransaction(
      { ...context.saveData.achievements, 'achievement:first-victory': { completed: true, progress: 1 } },
      context.saveData.achievementMetrics,
      { id: 'achievement:first-victory:controller-fixture', grants: [{ type: 'achievement-completed', achievementId: 'achievement:first-victory' }] },
    )).toBe(true);
    const revision = context.selectionRevision;
    const result = controller.select('bolt-hound', revision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.selectedCharacterId).toBe('bolt-hound');
      expect(result.snapshot.revision).toBe(revision + 1);
      expect(result.snapshot.characters.find((c) => c.id === 'bolt-hound')?.selected).toBe(true);
    }
  });
});
