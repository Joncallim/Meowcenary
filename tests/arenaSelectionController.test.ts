import { describe, expect, it } from 'vitest';
import { ArenaSelectionController } from '../src/ui/arenaSelectionController';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { TEST_ARENA_VISUAL } from './helpers/arena';

function setup() {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const save = new SaveManager(new MemoryStorageAdapter(), 'arena-controller-test', metaUpgrades.maxLevels());
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data, arenas, metaUpgrades, characters, save,
  });
  return { context, controller: new ArenaSelectionController(context) };
}

function setupWithFixture() {
  const data = loadGameData();
  const arenas = new DataArenaRegistry({
    arenas: [
      ...data.arenas,
      {
        id: 'voltage-alley',
        name: 'Voltage Alley',
        size: { width: 800, height: 600 },
        spawnCurveId: 'junkyard-intro',
        spawnRegions: [{ kind: 'edges', margin: 28 }],
        obstacles: [],
        hazards: [],
        visual: TEST_ARENA_VISUAL,
        unlock: { type: 'meta', requiresUnlockId: 'achievement:first-victory' },
      },
    ],
  });
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const save = new SaveManager(new MemoryStorageAdapter(), 'arena-ctrl-fixture', metaUpgrades.maxLevels());
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data, arenas, metaUpgrades, characters, save,
  });
  return { context, controller: new ArenaSelectionController(context) };
}

describe('ArenaSelectionController', () => {
  it('snapshot returns frozen, registry-ordered view with locked flags', () => {
    const { controller } = setup();
    const snapshot = controller.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.arenas)).toBe(true);
    expect(snapshot.selectedArenaId).toBe('junkyard-lot');
    expect(snapshot.revision).toBe(1);
    expect(snapshot.arenas).toHaveLength(1);
    expect(snapshot.arenas[0]).toMatchObject({ id: 'junkyard-lot', locked: false, selected: true });
  });

  it('shows locked flags and registry order with two-arena fixture', () => {
    const { controller } = setupWithFixture();
    const snapshot = controller.snapshot();
    expect(snapshot.arenas).toHaveLength(2);
    expect(snapshot.arenas[0]).toMatchObject({ id: 'junkyard-lot', locked: false, selected: true });
    expect(snapshot.arenas[1]).toMatchObject({ id: 'voltage-alley', locked: true, selected: false });
  });

  it('select enforces revision token', () => {
    const { controller } = setupWithFixture();
    const result = controller.select('junkyard-lot', 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('stale-selection');
    }
  });

  it('select rejects locked arenas', () => {
    const { controller } = setupWithFixture();
    const result = controller.select('voltage-alley', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('locked');
    }
  });

  it('select rejects unknown arenas', () => {
    const { controller } = setup();
    const result = controller.select('nonexistent', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('unknown-arena');
    }
  });

  it('unlock then select changes snapshot with bumped revision', () => {
    const { context, controller } = setupWithFixture();

    // Unlock voltage-alley
    context.updateMeta((meta) => ({
      ...meta,
      unlocks: [...meta.unlocks, 'achievement:first-victory'],
    }));
    const revision = context.arenaSelectionRevision;

    const result = controller.select('voltage-alley', revision);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.selectedArenaId).toBe('voltage-alley');
      expect(result.snapshot.revision).toBe(revision + 1);
      expect(result.snapshot.arenas[1]).toMatchObject({
        id: 'voltage-alley', locked: false, selected: true,
      });
    }
  });
});
