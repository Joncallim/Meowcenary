import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import { ProgressionController } from '../src/ui/progressionController';
import { DataArenaRegistry } from '../src/systems/arenas';
import { DataCharacterRegistry } from '../src/systems/characters';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

describe('headless ProgressionController (V4 retired)', () => {
  it('reports scrap and empty upgrades', () => {
    const { controller } = setup();
    const snapshot = controller.snapshot();
    expect(snapshot.scrap).toBe(0);
    expect(snapshot.upgrades).toEqual([]);
  });

  it('purchase always fails with retired-in-v4', () => {
    const { controller } = setup();
    expect(controller.purchase('anything')).toMatchObject({ ok: false, reason: 'retired-in-v4' });
  });

  it('reset requires confirmation', () => {
    const { context, controller } = setup();
    const before = context.saveData.progression;
    expect(controller.reset(false)).toEqual({ ok: false, meta: before, reason: 'confirmation-required' });
    expect(context.saveData.progression).toBe(before);
  });

  it('confirmed reset wipes progression', () => {
    const { context, controller } = setup();
    context.updateMeta((meta) => ({ ...meta, scrap: 100 }));
    const result = controller.reset(true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.scrap).toBe(0);
      expect(result.persisted).toBe(true);
    }
  });
});

export function setup() {
  const data = loadGameData();
  const arenas = new DataArenaRegistry(data);
  const characters = new DataCharacterRegistry(data);
  const context = createGameContext({
    bus: createEventBus(), menuRng: createRng(1), data, arenas, characters,
    save: new SaveManager(new MemoryStorageAdapter(), 'controller'),
  });
  return { context, controller: new ProgressionController(context) };
}
