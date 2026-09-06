import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  DEFAULT_SETTINGS,
  MemoryStorageAdapter,
  SaveManager,
  createDefaultProgression,
  createDefaultSaveV4,
  migrate,
  sanitizeProgression,
  type SaveDataV4,
} from '../src/systems/save';

const limits = Object.freeze({ 'reinforced-vest': 5 });

describe('Save V4 migration (V1/V2/V3→V4)', () => {
  it('CURRENT_SAVE_VERSION is 4', () => {
    expect(CURRENT_SAVE_VERSION).toBe(4);
  });

  it('creates fresh deeply frozen V4 defaults', () => {
    const first = createDefaultSaveV4();
    const second = createDefaultSaveV4();
    expect(first).toEqual({
      version: 4,
      settings: DEFAULT_SETTINGS,
      progression: createDefaultProgression(),
      stages: {},
      achievements: {},
      achievementMetrics: {},
      characters: {},
      gunsmith: { builds: [], parts: {} },
      equipment: {},
      equipmentLoadout: {},
      items: {},
      bosses: {},
      compendium: {},
      pendingAchievementReports: [],
      appliedGrantTransactions: {},
      grantTransactionFingerprints: {},
    });
    expect(first).not.toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.settings)).toBe(true);
    expect(Object.isFrozen(first.progression.unlocks)).toBe(true);
    expect(Object.isFrozen(first.stages)).toBe(true);
    expect(Object.isFrozen(first.achievements)).toBe(true);
    expect(Object.isFrozen(first.achievementMetrics)).toBe(true);
  });

  it('freezes nested durable records and preserves canonical achievement metrics across reload', () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, 'v4-nested-freeze');
    const save = migrate({
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: { 'stage:junkyard-01': { completed: true } },
      achievements: { 'achievement:first-victory': { completed: true, progress: 1 } },
      achievementMetrics: { 'metric:enemies-defeated': 17 },
      characters: { 'scrap-tabby': { tier: 1, xp: 4 } },
      gunsmith: {
        builds: [{ id: 'build-a', name: 'A', baseWeaponFamily: 'pistol', fitted: { barrel: 'owned-a' }, traitParts: [] }],
        parts: { 'owned-a': { partId: 'part:barrel-standard', tier: 2, infusedTraits: ['FIRE'] } },
      },
      equipment: { 'owned-helmet': { equipmentId: 'equipment:commando-helmet', tier: 1 } },
      bosses: { 'boss-crusher': { defeated: true } },
    }, limits) as SaveDataV4;
    expect(Object.isFrozen(save.stages['stage:junkyard-01'])).toBe(true);
    expect(Object.isFrozen(save.gunsmith.parts['owned-a'])).toBe(true);
    expect(Object.isFrozen(save.gunsmith.parts['owned-a'].infusedTraits)).toBe(true);
    expect(Object.isFrozen(save.gunsmith.builds[0].fitted)).toBe(true);
    expect(Object.isFrozen(save.equipment['owned-helmet'])).toBe(true);
    expect(Object.isFrozen(save.bosses['boss-crusher'])).toBe(true);
    expect(manager.save(save)).toBe(true);
    expect(manager.load().achievementMetrics).toEqual({ 'metric:enemies-defeated': 17 });
  });

  it('migrates V2 → V4 preserving scrap and unlocks', () => {
    const v2 = {
      version: 2,
      settings: { ...DEFAULT_SETTINGS, muted: true },
      meta: {
        scrap: 500,
        unlocks: ['character:bolt-hound', 'stage:junkyard-01'],
        permanentUpgrades: { 'reinforced-vest': 3 },
      },
    };
    const v4 = migrate(v2, limits) as SaveDataV4;
    expect(v4.version).toBe(4);
    expect(v4.settings.muted).toBe(true);
    expect(v4.progression.scrap).toBe(500);
    expect(v4.progression.unlocks).toEqual(['character:bolt-hound', 'stage:junkyard-01']);
    expect(v4.stages).toEqual({});
    expect(v4.characters).toEqual({});
    expect(v4.gunsmith).toEqual({ builds: [], parts: {} });
    expect(v4.equipment).toEqual({});
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
    const v4 = migrate(v2, limits) as SaveDataV4;
    expect(v4.achievements['achievement:first-victory']).toEqual({
      completed: true,
      completedAt: undefined,
    });
    expect(v4.progression.unlocks).toContain('achievement:first-victory');
  });

  it('reconciles the legacy 100-kill character grant to Scrap Weasel without dropping old unlocks', () => {
    const save = migrate({
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: { scrap: 0, unlocks: ['character:bolt-hound'], permanentUpgrades: {} },
      stages: {},
      achievements: { 'achievement:kill-milestone-100': { completed: true, progress: 100 } },
      achievementMetrics: { 'metric:enemies-defeated': 100 },
      characters: {}, gunsmith: { builds: [], parts: {} }, equipment: {}, equipmentLoadout: {}, items: {}, bosses: {},
      pendingAchievementReports: [], appliedGrantTransactions: {}, grantTransactionFingerprints: {},
    }, limits) as SaveDataV4;
    expect(save.progression.unlocks).toContain('character:bolt-hound');
    expect(save.progression.unlocks).toContain('character:scrap-weasel');
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
    const v4 = migrate(v2, limits) as SaveDataV4;
    expect(v4.achievements).toEqual({});
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
    const v4 = migrate(v2, limits);
    const v4Again = migrate(v2, limits);
    expect(v4Again).toEqual(v4);
    expect(migrate(v4, limits)).toEqual(v4);
  });
});

describe('V1 → V4 migration chain', () => {
  it('migrates V1 → V4 preserving settings and producing defaults', () => {
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
    const v4 = migrate(v1, limits) as SaveDataV4;
    expect(v4.version).toBe(4);
    expect(v4.settings).toEqual({
      muted: true,
      musicVolume: 0.4,
      sfxVolume: 0.6,
      reducedMotion: true,
    });
    expect(v4.progression.scrap).toBe(0);
    expect(v4.progression.unlocks).toEqual([]);
    expect(v4.stages).toEqual({});
    expect(v4.achievements).toEqual({});
  });
});

describe('V4 domain sanitizers', () => {
  it('preserves distinct opaque owned instances and durable receipt IDs', () => {
    const raw = {
      version: 3,
      settings: DEFAULT_SETTINGS,
      progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: {}, achievements: {}, characters: {},
      gunsmith: { builds: [], parts: {
        'part-copy-a': { partId: 'part:barrel-standard', tier: Number.MAX_SAFE_INTEGER, infusedTraits: ['FIRE', 'FIRE', 'NOT_A_TRAIT', 'EXPLOSIVE', 'TOXIC'] },
        'part-copy-b': { partId: 'part:barrel-standard', infusedTraits: [] },
      } },
      equipment: {
        'equip-copy-a': { equipmentId: 'equipment:commando-helmet', tier: 1 },
        'equip-copy-b': { equipmentId: 'equipment:commando-helmet', tier: 3 },
        'equipment:legacy-definition': { setId: 'commando', tier: 2 },
        'invalid-equipment-instance': { equipmentId: 'stage:junkyard-01', tier: 2 },
      },
      bosses: { 'boss-crusher': { defeated: true } },
      appliedGrantTransactions: { 'stage:junkyard-01:first-clear': true, constructor: true },
      grantTransactionFingerprints: {
        'stage:junkyard-01:first-clear': '[{"amount":25,"type":"grant-scrap"}]',
        'stage:junkyard-01:empty': '',
        constructor: 'hostile',
      },
    };
    const v4 = migrate(raw, limits) as SaveDataV4;
    expect(v4.gunsmith.parts['part-copy-a'].partId).toBe('part:barrel-standard');
    expect(v4.gunsmith.parts['part-copy-a']).toMatchObject({ tier: 5, infusedTraits: ['FIRE', 'EXPLOSIVE'] });
    expect(v4.gunsmith.parts['part-copy-b']).toBeDefined();
    expect(v4.equipment['equip-copy-a']).toMatchObject({ equipmentId: 'equipment:commando-helmet', tier: 1 });
    expect(v4.equipment['equip-copy-b']).toMatchObject({ equipmentId: 'equipment:commando-helmet', tier: 3 });
    expect(v4.equipment['equipment:legacy-definition']).toMatchObject({ equipmentId: 'equipment:legacy-definition', tier: 2 });
    expect(v4.equipment['invalid-equipment-instance']).toBeUndefined();
    expect(v4.appliedGrantTransactions['stage:junkyard-01:first-clear']).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(v4.appliedGrantTransactions, 'constructor')).toBe(false);
    expect(v4.grantTransactionFingerprints).toEqual({
      'stage:junkyard-01:first-clear': '[{"amount":25,"type":"grant-scrap"}]',
    });
  });

  it('keeps only owned equipment instance references in the equipped loadout', () => {
    const v4 = migrate({ version: 3, settings: DEFAULT_SETTINGS, progression: { scrap: 0, unlocks: [], permanentUpgrades: {} }, stages: {}, achievements: {}, characters: {}, gunsmith: { builds: [], parts: {} }, equipment: { 'equip-a': { equipmentId: 'equipment:commando-helmet', tier: 2 } }, equipmentLoadout: { helmet: 'equip-a', boots: 'missing' } }, limits) as SaveDataV4;
    expect(v4.equipmentLoadout).toEqual({ helmet: 'equip-a' });
  });

  it('drops cross-domain and reconstructed definition IDs from owned parts', () => {
    const v4 = migrate({
      version: 3, settings: DEFAULT_SETTINGS, progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: {}, achievements: {}, characters: {}, equipment: {},
      gunsmith: { builds: [], parts: {
        'valid-owned': { partId: 'part:barrel-standard', tier: 1, infusedTraits: [] },
        'cross-domain': { partId: 'character:bolt-hound', tier: 1, infusedTraits: [] },
        reconstructed: { partId: 'part:part:barrel-standard', tier: 1, infusedTraits: [] },
      } },
    }, limits) as SaveDataV4;
    expect(Object.keys(v4.gunsmith.parts)).toEqual(['valid-owned']);
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
    const v4 = migrate(raw, limits) as SaveDataV4;
    expect(v4.stages['stage:junkyard-01']).toEqual({ completed: true, bestTimeMs: 45000 });
    expect(v4.stages['stage:junkyard-02']).toEqual({ completed: false });
    expect(v4.stages['bad-key!!!']).toBeUndefined();
    expect(v4.stages['stage:junkyard-03']).toBeUndefined();
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
    const v4 = migrate(raw, limits) as SaveDataV4;
    expect(v4.achievements['achievement:first-victory']).toEqual({
      completed: true, progress: 1, completedAt: 1700000000000,
    });
    expect(v4.achievements['achievement:kill-100']).toEqual({
      completed: false, progress: 50,
    });
    expect(v4.achievements['bad-id']).toBeUndefined();
    expect(v4.achievements['achievement:bad-type']).toBeUndefined();
  });

  it('drops cross-domain identities from fact and inventory domains', () => {
    const v4 = migrate({
      version: 3, settings: DEFAULT_SETTINGS, progression: { scrap: 0, unlocks: [], permanentUpgrades: {} },
      stages: { 'stage:junkyard-01': { completed: true }, 'character:bolt-hound': { completed: true } },
      achievements: { 'achievement:first-victory': { completed: true }, 'character:bolt-hound': { completed: true } },
      achievementMetrics: { 'metric:enemies-defeated': 1, 'achievement:first-victory': 1, 'stage:junkyard-01': 1 },
      characters: {}, gunsmith: { builds: [], parts: {} }, equipment: {},
      items: { 'item:scrap-shot': 2, 'achievement:first-victory': 99 },
      bosses: { 'boss-crusher': { defeated: true }, 'stage:junkyard-01': { defeated: true } },
    }, limits) as SaveDataV4;
    expect(v4.stages).toEqual({ 'stage:junkyard-01': { completed: true } });
    expect(v4.achievements).toEqual({ 'achievement:first-victory': { completed: true } });
    expect(v4.achievementMetrics).toEqual({ 'metric:enemies-defeated': 1 });
    expect(v4.items).toEqual({ 'item:scrap-shot': 2 });
    expect(v4.bosses).toEqual({ 'boss-crusher': { defeated: true } });
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
    const v4 = migrate(raw, limits) as SaveDataV4;
    expect(v4.characters['scrap-tabby']).toEqual({ tier: 3, xp: 450 });
    expect(v4.characters['bad char']).toBeUndefined();
  });
});

describe('V4 write-protection for future versions', () => {
  it('write-protects version > 4', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({ version: 99, settings: { muted: true }, progression: { scrap: 99 } }));
    const manager = new SaveManager(storage, 'test');
    const loaded = manager.load();
    expect(loaded.version).toBe(4); // defaults returned
    expect(loaded.progression.scrap).toBe(0); // not 99
    expect(manager.save(createDefaultSaveV4())).toBe(false);
  });

  it('write-protects version 5', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({ version: 5, settings: DEFAULT_SETTINGS, progression: { scrap: 999 } }));
    const manager = new SaveManager(storage, 'test');
    const loaded = manager.load();
    expect(loaded.version).toBe(4);
    expect(loaded.progression.scrap).toBe(0);
    expect(manager.save(createDefaultSaveV4())).toBe(false);
  });

  it('clearing removes write-protection', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem('test', JSON.stringify({ version: 5, settings: DEFAULT_SETTINGS, progression: { scrap: 999 } }));
    const manager = new SaveManager(storage, 'test');
    manager.load();
    expect(manager.save(createDefaultSaveV4())).toBe(false);
    expect(manager.clear()).toBe(true);
    expect(manager.save(createDefaultSaveV4())).toBe(true);
  });
});

describe('malformed save fallback', () => {
  it.each(['', '{broken', 'null', '[]', '{}'])(
    'returns a complete default V4 for malformed input %j',
    (raw) => expect(migrate(raw, limits)).toEqual(createDefaultSaveV4()),
  );

  it('returns defaults for invalid versions', () => {
    expect(migrate({}, limits)).toEqual(createDefaultSaveV4());
    expect(migrate({ version: 0 }, limits)).toEqual(createDefaultSaveV4());
    expect(migrate({ version: -1 }, limits)).toEqual(createDefaultSaveV4());
    expect(migrate({ version: 1.5 }, limits)).toEqual(createDefaultSaveV4());
  });

  it('recovers from hostile proxies', () => {
    const accessor = Object.defineProperty({}, 'version', { enumerable: true, get() { throw new Error('no'); } });
    expect(migrate(accessor, limits)).toEqual(createDefaultSaveV4());
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
