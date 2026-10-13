import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  DEFAULT_SETTINGS,
  MemoryStorageAdapter,
  SaveManager,
  applySettingsPatch,
  createDefaultSaveV4,
  migrate,
  type Settings,
} from '../src/systems/save';

// #241 architecture §3.1: additive Save V4 preference, default Left. These
// regressions describe the approved missing feature, not a baseline defect.
const invalidSides = [undefined, null, '', 'Left', 'RIGHT', ' left', 'right ', 1, true, [], {}, new String('right')];
const legacySettings = Object.freeze({ muted: true, musicVolume: 0.25, sfxVolume: 0.45, reducedMotion: true });
const key = 'ability-side-preference-test';

function historicalSave(version: number, settings: unknown) {
  return {
    ...createDefaultSaveV4(),
    version,
    settings,
    meta: { scrap: 37, unlocks: ['character:bolt-hound'], permanentUpgrades: {} },
    progression: { scrap: 37, unlocks: ['character:bolt-hound'], permanentUpgrades: {} },
    stages: { 'stage:test': { completed: true, bestTimeMs: 1234 } },
    achievements: { 'achievement:test': { completed: true, completedAt: 123 } },
    characters: { 'bolt-hound': { tier: 2, xp: 17 } },
    items: { 'item:test': 3 },
    bosses: { 'boss-test': { defeated: true } },
    // Compendium is introduced in V4; V3 migration creates its empty state.
    compendium: version === 4 ? { 'enemy:test': 'defeated' } : {},
    selectedCharacterId: 'bolt-hound',
  };
}

function rawPatch(abilityButtonSide: unknown): Readonly<Partial<Settings>> {
  return { abilityButtonSide } as Readonly<Partial<Settings>>;
}

describe('#241 save-only ability button side preference', () => {
  it('adds a frozen Left preference without changing the save version', () => {
    expect(DEFAULT_SETTINGS.abilityButtonSide).toBe('left');
    expect(createDefaultSaveV4().settings.abilityButtonSide).toBe('left');
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(CURRENT_SAVE_VERSION).toBe(4);
  });

  it.each([1, 2, 3, 4])('loads supported V%i without a preference and preserves its other settings and progression', (version) => {
    const storage = new MemoryStorageAdapter();
    const raw = historicalSave(version, legacySettings);
    const serialized = JSON.stringify(raw);
    storage.setItem(key, serialized);
    const loaded = new SaveManager(storage, key).load();
    expect(loaded.settings).toEqual({ ...legacySettings, abilityButtonSide: 'left' });
    expect(Object.isFrozen(loaded.settings)).toBe(true);
    expect(loaded.version).toBe(4);
    expect(loaded.progression.scrap).toBe(version === 1 ? 0 : 37);
    if (version > 1) expect(loaded.progression.unlocks).toContain('character:bolt-hound');
    if (version >= 3) {
      expect(loaded.stages).toEqual(raw.stages);
      expect(loaded.achievements).toMatchObject(raw.achievements);
      expect(loaded.characters).toEqual(raw.characters);
      expect(loaded.items).toEqual(raw.items);
      expect(loaded.bosses).toMatchObject(raw.bosses);
      expect(loaded.compendium).toEqual(raw.compendium);
      expect(loaded.selectedCharacterId).toBe('bolt-hound');
    }
    expect(storage.getItem(key)).toBe(serialized);
  });

  it.each([1, 2, 3, 4])('retains exact own Right from supported V%i', (version) => {
    expect(migrate(historicalSave(version, { ...legacySettings, abilityButtonSide: 'right' })).settings)
      .toEqual({ ...legacySettings, abilityButtonSide: 'right' });
  });

  it.each(invalidSides.map((side) => [side]))('defaults an invalid durable side %j to Left', (side) => {
    const loaded = migrate(historicalSave(4, { ...legacySettings, abilityButtonSide: side }));
    expect(loaded.settings).toEqual({ ...legacySettings, abilityButtonSide: 'left' });
  });

  it('accepts a nonenumerable own primitive side on a null-prototype record', () => {
    const settings = Object.assign(Object.create(null), legacySettings);
    Object.defineProperty(settings, 'abilityButtonSide', { value: 'right' });
    expect(migrate(historicalSave(4, settings)).settings)
      .toEqual({ ...legacySettings, abilityButtonSide: 'right' });
    expect(applySettingsPatch(DEFAULT_SETTINGS, settings).abilityButtonSide).toBe('right');
  });

  it('rejects inherited and accessor durable values without invoking getters', () => {
    const getter = vi.fn(() => 'right');
    const settings = Object.defineProperty({ ...legacySettings }, 'abilityButtonSide', { enumerable: true, get: getter });
    expect(migrate(historicalSave(4, settings)).settings)
      .toEqual({ ...legacySettings, abilityButtonSide: 'left' });
    expect(getter).not.toHaveBeenCalled();
    expect(migrate(historicalSave(4, Object.create({ abilityButtonSide: 'right' }))).settings.abilityButtonSide)
      .toBe('left');
  });

  it.each(invalidSides.map((side) => [side]))('retains current Right and identity for invalid runtime side %j', (side) => {
    const current = applySettingsPatch(DEFAULT_SETTINGS, { abilityButtonSide: 'right' });
    expect(current.abilityButtonSide).toBe('right');
    expect(applySettingsPatch(current, rawPatch(side))).toBe(current);
    expect(applySettingsPatch(DEFAULT_SETTINGS, rawPatch(side))).toBe(DEFAULT_SETTINGS);
  });

  it('rejects runtime inherited/accessor sides, leaving Right unchanged without reading getters', () => {
    const current = applySettingsPatch(DEFAULT_SETTINGS, { abilityButtonSide: 'right' });
    const getter = vi.fn(() => 'left');
    const accessor = Object.defineProperty({}, 'abilityButtonSide', { enumerable: true, get: getter });
    expect(applySettingsPatch(current, accessor)).toBe(current);
    expect(getter).not.toHaveBeenCalled();
    expect(applySettingsPatch(current, Object.create({ abilityButtonSide: 'left' }))).toBe(current);
  });

  it('reads a descriptor-backed durable side once and publishes only its validated value', () => {
    let sideReads = 0;
    const settings = new Proxy({ ...legacySettings }, {
      getOwnPropertyDescriptor(target, property) {
        if (property === 'abilityButtonSide') {
          sideReads += 1;
          return { configurable: true, enumerable: true, value: sideReads === 1 ? 'right' : 'RIGHT' };
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    expect(migrate(historicalSave(4, settings)).settings.abilityButtonSide).toBe('right');
    expect(sideReads).toBe(1);
  });

  it('preserves omitted preference and sanitizes unrelated fields in a mixed invalid patch', () => {
    const current = applySettingsPatch(DEFAULT_SETTINGS, { abilityButtonSide: 'right' });
    const mixed = applySettingsPatch(current, { ...rawPatch('RIGHT'), musicVolume: 2 });
    expect(mixed).toEqual({ ...DEFAULT_SETTINGS, abilityButtonSide: 'right', musicVolume: 1 });
    expect(applySettingsPatch(mixed, {})).toBe(mixed);
    expect(applySettingsPatch(mixed, { musicVolume: 1 })).toBe(mixed);
    expect(Object.isFrozen(mixed)).toBe(true);
  });

  it('changes Left and Right once by identity, with frozen results and no-op identity', () => {
    const right = applySettingsPatch(DEFAULT_SETTINGS, { abilityButtonSide: 'right' });
    expect(right).not.toBe(DEFAULT_SETTINGS);
    expect(right).toEqual({ ...DEFAULT_SETTINGS, abilityButtonSide: 'right' });
    expect(Object.isFrozen(right)).toBe(true);
    expect(applySettingsPatch(right, { abilityButtonSide: 'right' })).toBe(right);
    const left = applySettingsPatch(right, { abilityButtonSide: 'left' });
    expect(left).not.toBe(right);
    expect(left).toEqual(DEFAULT_SETTINGS);
    expect(Object.isFrozen(left)).toBe(true);
  });

  it('round-trips Right in V4 through the same key while preserving unrelated domains', () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SaveManager(storage, key);
    const original = migrate(historicalSave(4, { ...legacySettings, abilityButtonSide: 'right' }));
    expect(manager.save(original)).toBe(true);
    expect(manager.load()).toEqual(original);
    expect(new SaveManager(storage, key).load().settings.abilityButtonSide).toBe('right');
    const raw = JSON.parse(storage.getItem(key)!);
    expect(raw.version).toBe(4);
    expect(raw.settings.abilityButtonSide).toBe('right');
  });
});
