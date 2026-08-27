import { describe, expect, it } from 'vitest';
import v1Fixture from './fixtures/save-v1.json';
import {
  DEFAULT_SETTINGS,
  LocalStorageAdapter,
  MemoryStorageAdapter,
  SaveManager,
  applySettingsPatch,
  createDefaultProgression,
  createDefaultSaveV3,
  migrate,
  sanitizeMeta,
  type StorageAdapter,
} from '../src/systems/save';

const key = 'test-save';
const limits = Object.freeze({ 'reinforced-vest': 5 });

describe('Save V2/V3 migration and persistence', () => {
  it('creates fresh deeply frozen V3 defaults', () => {
    const first = createDefaultSaveV3();
    const second = createDefaultSaveV3();
    expect(first).toMatchObject({
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: createDefaultProgression(),
      stages: {},
      achievements: {},
      characters: {},
      equipment: {},
    });
    expect(first).not.toBe(second);
    expect(first.progression).not.toBe(second.progression);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.settings)).toBe(true);
    expect(Object.isFrozen(first.progression.unlocks)).toBe(true);
    expect(Object.isFrozen(first.progression.permanentUpgrades)).toBe(true);
  });

  it('migrates valid V1 and independently recovers corrupt V1 settings', () => {
    expect(migrate(v1Fixture, limits)).toMatchObject({
      version: 3,
      settings: v1Fixture.settings,
      progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
    });
    expect(migrate({ version: 1, settings: { muted: true, musicVolume: 'bad' }, meta: { old: 1 } }, limits).settings)
      .toEqual({ ...DEFAULT_SETTINGS, muted: true });
  });

  it('recovers V2 fields independently and is stable across repeated migration', () => {
    const migrated = migrate({
      version: 2,
      settings: { ...DEFAULT_SETTINGS, muted: true, musicVolume: 4, sfxVolume: Number.NaN },
      meta: {
        scrap: 12,
        unlocks: ['character:cat', 'bad', 'character:cat', 'future:thing'],
        permanentUpgrades: {
          'reinforced-vest': 99,
          'future-upgrade': 7,
          'bad:id': 2,
          zero: 0,
          fractional: 1.5,
        },
      },
    }, limits);
    expect(migrated).toMatchObject({
      version: 3,
      settings: { ...DEFAULT_SETTINGS, muted: true, musicVolume: 1 },
      progression: {
        scrap: 12,
        unlocks: ['character:cat', 'future:thing'],
        permanentUpgrades: { 'reinforced-vest': 5, 'future-upgrade': 7 },
      },
    });
    expect(migrate(migrated, limits)).toEqual(migrated);
  });

  it.each(['', '{broken', 'null', '[]', '{}'])(
    'returns a complete default for malformed or versionless input %j',
    (raw) => expect(migrate(raw, limits)).toEqual(createDefaultSaveV3()),
  );

  it.each([
    {}, { version: 0 }, { version: -1 }, { version: 1.5 }, { version: Number.NaN }, { version: 3.5 },
  ])('returns complete defaults for invalid versions', (raw) => {
    expect(migrate(raw, limits)).toEqual(createDefaultSaveV3());
  });

  it('does not read inherited versions or prototype-polluting record keys', () => {
    const inherited = Object.create({ version: 2 });
    inherited.settings = { ...DEFAULT_SETTINGS, muted: true };
    expect(migrate(inherited, limits)).toEqual(createDefaultSaveV3());
    const upgrades = Object.create(null) as Record<string, number>;
    Object.defineProperty(upgrades, '__proto__', { value: 3, enumerable: true });
    upgrades['safe-upgrade'] = 2;
    expect(sanitizeMeta({ scrap: 1, unlocks: [], permanentUpgrades: upgrades }, limits))
      .toEqual({ scrap: 1, unlocks: [], permanentUpgrades: { 'safe-upgrade': 2 } });
  });

  it('remains total for hostile accessors and proxies', () => {
    const accessor = Object.defineProperty({}, 'version', { enumerable: true, get() { throw new Error('no'); } });
    expect(migrate(accessor, limits)).toEqual(createDefaultSaveV3());
    const proxy = new Proxy({}, { getPrototypeOf() { throw new Error('no'); } });
    expect(migrate(proxy, limits)).toEqual(createDefaultSaveV3());
  });

  it('keeps valid patch values immutable and invalid patch fields at current values', () => {
    const current = migrate({ version: 2, settings: { ...DEFAULT_SETTINGS, sfxVolume: 0.25 }, meta: {} }).settings;
    const next = applySettingsPatch(current, { musicVolume: 2, sfxVolume: Number.NaN });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 1, sfxVolume: 0.25 });
    expect(next).not.toBe(current);
    expect(applySettingsPatch(next, { sfxVolume: Number.NaN })).toBe(next);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it('loads once without writing and accurately reports save/clear', () => {
    const storage = new CountingStorage();
    storage.setItem(key, JSON.stringify(v1Fixture));
    storage.setCalls = 0;
    const manager = new SaveManager(storage, key, limits);
    expect(manager.load().version).toBe(3);
    expect(storage.getCalls).toBe(1);
    expect(storage.setCalls).toBe(0);
    expect(manager.save(createDefaultSaveV3())).toBe(true);
    expect(storage.setCalls).toBe(1);
    expect(manager.clear()).toBe(true);
  });

  it('write-protects future saves until successful explicit clear', () => {
    const storage = new CountingStorage();
    storage.setItem(key, JSON.stringify({ version: 4, settings: { muted: true }, meta: { scrap: 99 } }));
    storage.setCalls = 0;
    const manager = new SaveManager(storage, key, limits);
    expect(manager.load()).toEqual(createDefaultSaveV3());
    expect(manager.save(createDefaultSaveV3())).toBe(false);
    expect(storage.setCalls).toBe(0);
    storage.removeItem(key);
    expect(manager.load()).toEqual(createDefaultSaveV3());
    expect(manager.save(createDefaultSaveV3())).toBe(false);
    expect(manager.clear()).toBe(true);
    expect(manager.save(createDefaultSaveV3())).toBe(true);
  });

  it('reads a meta descriptor-backed field once so an alternating proxy cannot smuggle an invalid published value', () => {
    let scrapCalls = 0;
    const raw = new Proxy({ unlocks: [], permanentUpgrades: {} } as Record<string, unknown>, {
      getOwnPropertyDescriptor(target, prop) {
        if (prop === 'scrap') {
          scrapCalls += 1;
          return { value: scrapCalls === 1 ? 5 : -1, writable: true, enumerable: true, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    });
    expect(sanitizeMeta(raw, limits).scrap).toBe(5);
    expect(scrapCalls).toBe(1);
  });

  it('reads a settings descriptor-backed boolean once so an alternating proxy cannot smuggle an invalid published value', () => {
    let mutedCalls = 0;
    const settingsRaw = new Proxy({ musicVolume: 0.5, sfxVolume: 0.5, reducedMotion: false } as Record<string, unknown>, {
      getOwnPropertyDescriptor(target, prop) {
        if (prop === 'muted') {
          mutedCalls += 1;
          return { value: mutedCalls === 1 ? true : 'not-a-boolean', writable: true, enumerable: true, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    });
    const result = migrate({ version: 2, settings: settingsRaw, meta: {} }, limits);
    expect(result.settings.muted).toBe(true);
    expect(mutedCalls).toBe(1);
  });

  it('recovers from storage exceptions and localStorage adapter reports failures', () => {
    const manager = new SaveManager(new ThrowingAdapter(), key, limits);
    expect(manager.load()).toEqual(createDefaultSaveV3());
    expect(manager.save(createDefaultSaveV3())).toBe(false);
    expect(manager.clear()).toBe(false);
    const local = new LocalStorageAdapter(new ThrowingStorage());
    expect(local.getItem(key)).toBeNull();
    expect(local.setItem(key, '{}')).toBe(false);
    expect(local.removeItem(key)).toBe(false);
  });
});

class CountingStorage extends MemoryStorageAdapter {
  getCalls = 0;
  setCalls = 0;
  override getItem(key: string): string | null { this.getCalls += 1; return super.getItem(key); }
  override setItem(key: string, value: string): boolean {
    this.setCalls += 1;
    return super.setItem(key, value);
  }
}

class ThrowingAdapter implements StorageAdapter {
  getItem(): string | null { throw new Error('blocked'); }
  setItem(): boolean { throw new Error('blocked'); }
  removeItem(): boolean { throw new Error('blocked'); }
}

class ThrowingStorage implements Storage {
  readonly length = 0;
  clear(): void { throw new Error('blocked'); }
  getItem(): string | null { throw new Error('blocked'); }
  key(): string | null { throw new Error('blocked'); }
  removeItem(): void { throw new Error('blocked'); }
  setItem(): void { throw new Error('blocked'); }
}
