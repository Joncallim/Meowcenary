import { describe, expect, it } from 'vitest';
import { createGameContext } from '../src/engine/context';
import { createEventBus } from '../src/engine/eventBus';
import { createRng } from '../src/engine/rng';
import type { System } from '../src/engine/system';
import { DataMetaUpgradeRegistry } from '../src/systems/metaUpgrades';
import { MemoryStorageAdapter, SaveManager } from '../src/systems/save';
import { loadGameData } from '../src/systems/validation';

describe('GameContext persistence boundary', () => {
  it('loads once and keeps settings/meta in one immutable current snapshot', () => {
    const { context, storage } = setup();
    const original = context.saveData;
    const settingsUpdate = context.updateSettings({ muted: true, sfxVolume: 0.25 });
    expect(settingsUpdate).toMatchObject({ persisted: true, value: { muted: true, sfxVolume: 0.25 } });
    expect(context.settings).toBe(context.saveData.settings);
    expect(context.saveData.meta).toBe(original.meta);
    expect(context.saveData).not.toBe(original);

    const metaUpdate = context.updateMeta((meta) => ({ ...meta, scrap: 42 }));
    expect(metaUpdate.persisted).toBe(true);
    expect(context.saveData.settings).toBe(settingsUpdate.value);
    expect(context.saveData.meta.scrap).toBe(42);
    expect(Object.isFrozen(context.saveData)).toBe(true);
    expect(Reflect.set(context.saveData.meta as object, 'scrap', 999)).toBe(false);
    expect(context.saveData.meta.scrap).toBe(42);
    expect(storage.getCalls).toBe(1);
    expect(storage.setCalls).toBe(2);
  });

  it('reset preserves settings and failed persistence retains the new snapshot', () => {
    const { context, storage } = setup();
    context.updateSettings({ reducedMotion: true });
    context.updateMeta((meta) => ({ ...meta, scrap: 10 }));
    storage.succeed = false;
    const reset = context.resetProgression();
    expect(reset.persisted).toBe(false);
    expect(reset.value.scrap).toBe(0);
    expect(context.settings.reducedMotion).toBe(true);
  });

  it('does not change state or persist when a transform throws', () => {
    const { context, storage } = setup();
    const before = context.saveData;
    const calls = storage.setCalls;
    expect(() => context.updateMeta(() => { throw new Error('programmer error'); })).toThrow('programmer error');
    expect(context.saveData).toBe(before);
    expect(storage.setCalls).toBe(calls);
  });

  it('defines the minimal System lifecycle', () => {
    const calls: number[] = [];
    const system: System = { update: (dt) => calls.push(dt), destroy: () => { calls.push(-1); } };
    system.update(16.67); system.destroy();
    expect(calls).toEqual([16.67, -1]);
  });
});

class CountingStorage extends MemoryStorageAdapter {
  getCalls = 0; setCalls = 0; succeed = true;
  override getItem(key: string): string | null { this.getCalls += 1; return super.getItem(key); }
  override setItem(key: string, value: string): boolean {
    this.setCalls += 1;
    return this.succeed && super.setItem(key, value);
  }
}

function setup() {
  const data = loadGameData();
  const registry = new DataMetaUpgradeRegistry(data);
  const storage = new CountingStorage();
  const save = new SaveManager(storage, 'context-test', registry.maxLevels());
  return {
    storage,
    context: createGameContext({
      bus: createEventBus(), menuRng: createRng(1), data,
      metaUpgrades: registry, save,
    }),
  };
}
