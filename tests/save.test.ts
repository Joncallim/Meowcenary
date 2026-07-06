import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MemoryStorageAdapter,
  SaveManager,
  createDefaultSave,
  migrate,
} from '../src/systems/save';

const saveKey = 'test-save';

describe('SaveManager', () => {
  it('recovers empty storage to default', () => {
    const manager = new SaveManager(new MemoryStorageAdapter(), saveKey);

    expect(manager.load()).toEqual(createDefaultSave());
  });

  it('recovers corrupt JSON to default', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem(saveKey, '{broken');
    const manager = new SaveManager(storage, saveKey);

    expect(manager.load()).toEqual(createDefaultSave());
  });

  it('recovers unknown versions to default', () => {
    expect(migrate({ version: 999, settings: {}, meta: {} })).toEqual(createDefaultSave());
  });

  it('round-trips a valid save', () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, saveKey);
    const save = {
      version: 1 as const,
      settings: {
        ...DEFAULT_SETTINGS,
        muted: true,
        musicVolume: 1.5,
        sfxVolume: -1,
      },
      meta: {},
    };

    manager.save(save);

    expect(manager.load()).toEqual({
      version: 1,
      settings: {
        ...DEFAULT_SETTINGS,
        muted: true,
        musicVolume: 1,
        sfxVolume: 0,
      },
      meta: {},
    });
  });
});

