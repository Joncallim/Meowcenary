import { describe, expect, it } from 'vitest';
import { CharacterSelectionController } from '../src/ui/characterSelectionController';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

function setup() {
  const data = loadGameData();
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const save = new SaveManager(new MemoryStorageAdapter(), 'controller-test', metaUpgrades.maxLevels());
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data, metaUpgrades, characters, save,
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
    expect(snapshot.characters).toHaveLength(2);
    expect(snapshot.characters[0]).toMatchObject({ id: 'scrap-tabby', locked: false, selected: true });
    expect(snapshot.characters[1]).toMatchObject({ id: 'bolt-hound', locked: true, selected: false });
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
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory'],
    }));
    const revision = context.selectionRevision;
    const result = controller.select('bolt-hound', revision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.selectedCharacterId).toBe('bolt-hound');
      expect(result.snapshot.revision).toBe(revision + 1);
      expect(result.snapshot.characters.find((c) => c.id === 'bolt-hound')?.selected).toBe(true);
    }
  });

  it('buildRunRequest produces deterministic frozen request from current selection', () => {
    const { controller } = setup();
    const rng = createRng(42);
    const request = controller.buildRunRequest(rng);
    expect(Object.isFrozen(request)).toBe(true);
    expect(request.characterId).toBe('scrap-tabby');
    expect(request.arenaId).toBe('junkyard-intro');
    expect(Number.isSafeInteger(request.seed)).toBe(true);
  });

  it('buildRunRequest uses character-driven arena id', () => {
    const { controller } = setup();
    const rng = createRng(99);
    const request = controller.buildRunRequest(rng);
    expect(request.arenaId).toBe('junkyard-intro');
  });
});
