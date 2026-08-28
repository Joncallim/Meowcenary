import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { createRunState } from '../src/gameplay/runState';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import type { StorageAdapter } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

describe('ProgressionSystem terminal lifecycle', () => {
  it.each(['won', 'lost'] as const)('banks a %s run once for duplicate and mixed events', (status) => {
    const { bus, context } = setup();
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = status; run.currency = 12.9;
    const system = new ProgressionSystem({ runState: run, bus, context });
    bus.emit(status === 'won' ? 'run:won' : 'run:lost', { timeMs: 0, level: 1, kills: 0 });
    bus.emit('run:won', { timeMs: 0, level: 1, kills: 0 });
    bus.emit('run:lost', { timeMs: 0, level: 1, kills: 0 });
    expect(context.saveData.progression.scrap).toBe(12);
    expect(system.hasBanked).toBe(true);
    expect(system.lastBankedRun).toMatchObject({ reward: { scrap: 12 }, persisted: true });
  });

  it('shares the guard across adapters and handles zero reward once', () => {
    const { bus, context } = setup();
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = 'won';
    const first = new ProgressionSystem({ runState: run, bus, context });
    const second = new ProgressionSystem({ runState: run, bus, context });
    expect(first.bankFinishedRun()).toMatchObject({ reward: { scrap: 0 } });
    expect(second.bankFinishedRun()).toBeNull();
    expect(context.saveData.progression.scrap).toBe(0);
  });

  it('does not consume non-terminal runs, destroys subscriptions, and a new run banks independently', () => {
    const { bus, context } = setup();
    const firstRun = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    const first = new ProgressionSystem({ runState: firstRun, bus, context });
    expect(first.bankFinishedRun()).toBeNull();
    expect(first.hasBanked).toBe(false);
    first.destroy(); first.destroy();
    firstRun.status = 'won'; firstRun.currency = 5;
    bus.emit('run:won', { timeMs: 0, level: 1, kills: 0 });
    expect(context.saveData.progression.scrap).toBe(0);

    const nextRun = createRunState({ seed: 2, characterId: 'cat', arenaId: 'arena' });
    nextRun.status = 'lost'; nextRun.currency = 7;
    const next = new ProgressionSystem({ runState: nextRun, bus, context });
    expect(next.bankFinishedRun()).toMatchObject({ reward: { scrap: 7 } });
    expect(context.saveData.progression.scrap).toBe(7);
  });

  it('reports persistence failure without crashing or retrying the handled run', () => {
    const data = loadGameData();
    const arenas = new DataArenaRegistry(data);
    const metaUpgrades = new DataMetaUpgradeRegistry(data);
    const characters = new DataCharacterRegistry(data);
    const bus = createEventBus();
    const context = createGameContext({
      bus, menuRng: createRng(1), data, arenas, metaUpgrades, characters,
      save: new SaveManager(new FailingWrites(), 'failed', metaUpgrades.maxLevels()),
    });
    const run = createRunState({ seed: 1, characterId: 'cat', arenaId: 'arena' });
    run.status = 'won'; run.currency = 4;
    const system = new ProgressionSystem({ runState: run, bus, context });
    expect(system.bankFinishedRun()).toMatchObject({ persisted: false, meta: { scrap: 0 } });
    expect(system.bankFinishedRun()).toMatchObject({ persisted: false, meta: { scrap: 0 } });
    expect(context.saveData.progression.scrap).toBe(0);
  });
});

class FailingWrites implements StorageAdapter {
  getItem(): string | null { return null; }
  setItem(): boolean { return false; }
  removeItem(): boolean { return false; }
}

function setup() {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const metaUpgrades = new DataMetaUpgradeRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const bus = createEventBus();
  return {
    bus,
    context: createGameContext({
      bus, menuRng: createRng(1), data, arenas, metaUpgrades, characters,
      save: new SaveManager(new MemoryStorageAdapter(), 'progression-system', metaUpgrades.maxLevels()),
    }),
  };
}
