import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  DEFAULT_SETTINGS,
  MemoryStorageAdapter,
  SaveManager,
  createDefaultProgression,
  createDefaultSaveV3,
  migrate,
  migrateV2ToV3,
  sanitizeProgression,
  type SaveDataV3,
} from '../src/systems/save';

const limits = Object.freeze({ 'reinforced-vest': 5 });

describe('Save V3 migration (V2→V3)', () => {
  it('CURRENT_SAVE_VERSION is 3', () => {
    expect(CURRENT_SAVE_VERSION).toBe(3);
  });

  it('creates fresh deeply frozen V3 defaults', () => {
    const first = createDefaultSaveV3();
    const second = createDefaultSaveV3();
    expect(first).toEqual({
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: createDefaultProgression(),
      stages: {},
      achievements: {},
      achievementMetrics: {},
      characters: {},
      gunsmith: { builds: [], parts: {} },
      equipment: {},
      bosses: {},
      appliedGrantTransactions: {},
    });
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.settings)).toBe(true);
    expect(Object.isFrozen(first.progression.unlocks)).toBe(true);
    expect(Object.isFrozen(first.progression.permanentUpgrades)).toBe(true);
    expect(Object.isFrozen(first.stages)).toBe(true);
    expect(Object.isFrozen(first.achievements)).toBe(true);
    expect(Object.isFrozen(first.achievementMetrics)).toBe(true);
  });

  it('migrates V2 → V3 preserving scrap and unlocks', () => {
    const v2 = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS, muted: true },
      meta: {
        scrap: 500,
        unlocks: ['character:bolt-hound', 'stage:junkyard-01'],
        permanentUpgrades: { 'reinforced-vest': 3 },
      },
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.version).toBe(3);
    expect(v3.settings.muted).toBe(true);
    expect(v3.progression.scrap).toBe(500);
    expect(v3.progression.unlocks).toEqual(['character:bolt-hound', 'stage:junkyard-01']);
    expect(v3.progression.permanentUpgrades).toEqual({ 'reinforced-vest': 3 });
    expect(v3.stages).toEqual({});
    expect(v3.characters).toEqual({});
    expect(v3.gunsmith).toEqual({ builds: [], parts: {} });
    expect(v3.equipment).toEqual({});
  });

  it('migrates achievement:first-victory to achievements map', () => {
    const v2 = {
      version: 2,
      settings: DEFAULT_SETTINGS,
      meta: {
        scrap: 100,
        unlocks: ['achievement:first-victory', 'character:cat'],
        permanentUpgrades: {},
      },
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.achievements['achievement:first-victory']).toEqual({
      completed: true,
      completedAt: undefined,
    });
    // The unlock is still in progression.unlocks (it's preserved)
    expect(v3.progression.unlocks).toContain('achievement:first-victory');
  });

  it('does not create achievement entries when first-victory not unlocked', () => {
    const v2 = {
      version: 2,
      settings: DEFAULT_SETTINGS,
      meta: {
        scrap: 0,
        unlocks: ['character:cat'],
        permanentUpgrades: {},
      },
    };
    const v3 = migrateV2ToV3(v2);
    expect(v3.achievements).toEqual({});
  });

  it('migration round-trip is stable', () => {
    const v2 = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS, musicVolume: 0.5 },
      meta: {
        scrap: 42,
        unlocks: ['achievement:first-victory'],
        permanentUpgrades: { 'reinforced-vest': 2 },
      },
    };
    const v3 = migrateV2ToV3(v2);
    // Migrate again — should produce the same result
    const v3Again = migrate(v2, limits);
    expect(v3Again).toEqual(v3);
    // Migrating V3 itself should return equivalent V3
    expect(migrate(v3, limits)).toEqual(v3);
  });
});

describe('V1 → V3 migration chain', () => {
  it('migrates V1 → V3 preserving settings and producing defaults', () => {
    const v1 = {
      version: 1,
      settings: {
        muted: true,
        musicVolume: 0.4,
        sfxVolume: 0.6,
        reducedMotion: true,
      },
      meta: {},
    };
    const v3 = migrate(v1, limits) as SaveDataV3;
    expect(v3.version).toBe(3);
    expect(v3.settings).toEqual({
      muted: true,
      musicVolume: 0.4,
      sfxVolume: 0.6,
      reducedMotion: true,
    });
    expect(v3.progression.scrap).toBe(0);
    expect(v3.progression.unlocks).toEqual([]);
    expect(v3.progression.permanentUpgrades).toEqual({});
    expect(v3.stages).toEqual({});
    expect(v3.achievements).toEqual({});
  });
});

describe('V3 domain sanitizers', () => {
  it('preserves distinct opaque owned instances and durable receipt IDs', () => {
    const raw = {
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: {}, achievements: {}, characters: {},
      gunsmith: { builds: [], parts: {
        'part-copy-a': { partId: 'part:barrel-standard', infusedTraits: ['FIRE'] },
        'part-copy-b': { partId: 'part:barrel-standard', infusedTraits: [] },
      } },
      equipment: {
        'equip-copy-a': { equipmentId: 'equipment:commando-helmet', tier: 1 },
        'equip-copy-b': { equipmentId: 'equipment:commando-helmet', tier: 3 },
        'legacy-definition': { setId: 'commando', tier: 2 },
      },
      bosses: { 'boss-crusher': { defeated: true } },
      appliedGrantTransactions: { 'stage:junkyard-01:first-clear': true, constructor: true },
    };
    const v3 = migrate(raw, limits) as SaveDataV3;
    expect(v3.gunsmith.parts['part-copy-a'].partId).toBe('part:barrel-standard');
    expect(v3.gunsmith.parts['part-copy-b']).toBeDefined();
    expect(v3.equipment['equip-copy-a']).toMatchObject({ equipmentId: 'equipment:commando-helmet', tier: 1 });
    expect(v3.equipment['equip-copy-b']).toMatchObject({ equipmentId: 'equipment:commando-helmet', tier: 3 });
    expect(v3.equipment['legacy-definition']).toMatchObject({ equipmentId: 'legacy-definition', tier: 2 });
    expect(v3.appliedGrantTransactions['stage:junkyard-01:first-clear']).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(v3.appliedGrantTransactions, 'constructor')).toBe(false);
  });

  it('sanitizes stage progress with valid keys and invalid entries', () => {
    const raw = {
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: {
        'stage:junkyard-01': { completed: true, bestTimeMs: 45000 },
        'bad-key!!!': { completed: true },
        'stage:junkyard-02': { completed: false },
        'stage:junkyard-03': 'not-an-object',
      },
      achievements: {},
      characters: {},
      gunsmith: { builds: [], parts: {} },
      equipment: {},
    };
    const v3 = migrate(raw, limits) as SaveDataV3;
    expect(v3.stages['stage:junkyard-01']).toEqual({ completed: true, bestTimeMs: 45000 });
    expect(v3.stages['stage:junkyard-02']).toEqual({ completed: false });
    expect(v3.stages['bad-key!!!']).toBeUndefined();
    expect(v3.stages['stage:junkyard-03']).toBeUndefined();
  });

  it('sanitizes achievement progress', () => {
    const raw = {
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: {},
      achievements: {
        'achievement:first-victory': { completed: true, progress: 1, completedAt: 1700000000000 },
        'achievement:kill-100': { completed: false, progress: 50 },
        'bad-id': { completed: true },
        'achievement:bad-type': 'not-an-object',
      },
      characters: {},
      gunsmith: { builds: [], parts: {} },
      equipment: {},
    };
    const v3 = migrate(raw, limits) as SaveDataV3;
    expect(v3.achievements['achievement:first-victory']).toEqual({
      completed: true, progress: 1, completedAt: 1700000000000,
    });
    expect(v3.achievements['achievement:kill-100']).toEqual({
      completed: false, progress: 50,
    });
    expect(v3.achievements['bad-id']).toBeUndefined();
    expect(v3.achievements['achievement:bad-type']).toBeUndefined();
  });

  it('sanitizes character mastery', () => {
    const raw = {
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: {},
      achievements: {},
      characters: {
        'scrap-tabby': { tier: 3, xp: 450 },
        'bad char': { tier: 1, xp: 10 },
      },
      gunsmith: { builds: [], parts: {} },
      equipment: {},
    };
    const v3 = migrate(raw, limits) as SaveDataV3;
    expect(v3.characters['scrap-tabby']).toEqual({ tier: 3, xp: 450 });
    expect(v3.characters['bad char']).toBeUndefined();
  });
});

describe('V3 write-protection for future versions', () => {
  it('write-protects version > 3', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({ version: 99, settings: { muted: true }, meta: { scrap: 99 } }));
    const manager = new SaveManager(storage, 'test', limits);
    const loaded = manager.load();
    expect(loaded.version).toBe(3); // defaults returned
    expect(loaded.progression.scrap).toBe(0); // not 99
    // Write-protection is active
    expect(manager.save(createDefaultSaveV3())).toBe(false);
  });

  it('write-protects version 4', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({ version: 4, settings: DEFAULT_SETTINGS, meta: { scrap: 999 } }));
    const manager = new SaveManager(storage, 'test', limits);
    const loaded = manager.load();
    expect(loaded.version).toBe(3);
    expect(loaded.progression.scrap).toBe(0);
    expect(manager.save(createDefaultSaveV3())).toBe(false);
  });

  it('clearing removes write-protection', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({ version: 4, settings: DEFAULT_SETTINGS, meta: { scrap: 999 } }));
    const manager = new SaveManager(storage, 'test', limits);
    manager.load();
    expect(manager.save(createDefaultSaveV3())).toBe(false);
    expect(manager.clear()).toBe(true);
    expect(manager.save(createDefaultSaveV3())).toBe(true);
  });
});

describe('malformed save fallback', () => {
  it.each(['', '{broken', 'null', '[]', '{}'])(
    'returns a complete default V3 for malformed input %j',
    (raw) => expect(migrate(raw, limits)).toEqual(createDefaultSaveV3()),
  );

  it('returns defaults for invalid versions', () => {
    expect(migrate({}, limits)).toEqual(createDefaultSaveV3());
    expect(migrate({ version: 0 }, limits)).toEqual(createDefaultSaveV3());
    expect(migrate({ version: -1 }, limits)).toEqual(createDefaultSaveV3());
    expect(migrate({ version: 1.5 }, limits)).toEqual(createDefaultSaveV3());
  });

  it('recovers from hostile proxies', () => {
    const accessor = Object.defineProperty({}, 'version', { enumerable: true, get() { throw new Error('no'); } });
    expect(migrate(accessor, limits)).toEqual(createDefaultSaveV3());
  });
});

describe('sanitizeProgression edge cases', () => {
  it('clamps permanentUpgrade levels to maxLevels', () => {
    const raw = {
      scrap: 10,
      unlocks: [],
      permanentUpgrades: { 'reinforced-vest': 99 },
    };
    expect(sanitizeProgression(raw, limits).permanentUpgrades).toEqual({ 'reinforced-vest': 5 });
  });

  it('filters non-unlock-id unlocks', () => {
    const raw = {
      scrap: 0,
    unlocks: ['character:cat', 'bad value', 'character:cat', 'also bad'],
      permanentUpgrades: {},
    };
    const result = sanitizeProgression(raw, limits);
    expect(result.unlocks).toEqual(['character:cat']);
  });

  it('reads descriptor-backed field once', () => {
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
    expect(sanitizeProgression(raw, limits).scrap).toBe(5);
    expect(scrapCalls).toBe(1);
  });
});
