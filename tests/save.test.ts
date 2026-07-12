import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  LocalStorageAdapter,
  MemoryStorageAdapter,
  SaveManager,
  type StorageAdapter,
  applySettingsPatch,
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

  it('sanitizes live settings patches while preserving shared object identity', () => {
    const settings = { ...DEFAULT_SETTINGS, sfxVolume: 0.25 };

    const result = applySettingsPatch(settings, {
      musicVolume: 2,
      sfxVolume: Number.NaN,
    });

    expect(result).toBe(settings);
    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      musicVolume: 1,
      sfxVolume: 0.25,
    });
  });

  it('does not write while loading', () => {
    const storage = new CountingStorageAdapter();
    storage.setItem(saveKey, JSON.stringify(createDefaultSave()));
    storage.setCalls = 0;

    const manager = new SaveManager(storage, saveKey);

    expect(manager.load()).toEqual(createDefaultSave());
    expect(storage.setCalls).toBe(0);
  });

  it('recovers when storage operations throw', () => {
    const manager = new SaveManager(new ThrowingStorageAdapter(), saveKey);

    expect(manager.load()).toEqual(createDefaultSave());
    expect(() => manager.save(createDefaultSave())).not.toThrow();
    expect(() => manager.clear()).not.toThrow();
  });

  it('localStorage adapter treats storage failures as non-fatal', () => {
    const adapter = new LocalStorageAdapter(new ThrowingStorage());

    expect(adapter.getItem(saveKey)).toBeNull();
    expect(() => adapter.setItem(saveKey, '{}')).not.toThrow();
    expect(() => adapter.removeItem(saveKey)).not.toThrow();
  });
});

class CountingStorageAdapter extends MemoryStorageAdapter {
  setCalls = 0;

  override setItem(key: string, value: string): void {
    this.setCalls += 1;
    super.setItem(key, value);
  }
}

class ThrowingStorageAdapter implements StorageAdapter {
  getItem(): string | null {
    throw new Error('blocked');
  }

  setItem(): void {
    throw new Error('blocked');
  }

  removeItem(): void {
    throw new Error('blocked');
  }
}

class ThrowingStorage implements Storage {
  readonly length = 0;

  clear(): void {
    throw new Error('blocked');
  }

  getItem(): string | null {
    throw new Error('blocked');
  }

  key(): string | null {
    throw new Error('blocked');
  }

  removeItem(): void {
    throw new Error('blocked');
  }

  setItem(): void {
    throw new Error('blocked');
  }
}
