import { RuntimeConfig } from '../engine/config';
import { isContentId, isUnlockId } from './ids';

export interface Settings {
  readonly muted: boolean;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
}

export type MetaStateV1 = Readonly<Record<string, never>>;

export interface MetaState {
  readonly scrap: number;
  readonly unlocks: readonly string[];
  readonly permanentUpgrades: Readonly<Record<string, number>>;
}

export interface SaveDataV1 {
  readonly version: 1;
  readonly settings: Settings;
  readonly meta: MetaStateV1;
}

export interface SaveDataV2 {
  readonly version: 2;
  readonly settings: Settings;
  readonly meta: MetaState;
}

export type SaveData = SaveDataV2;
export type MetaUpgradeMaxLevels = Readonly<Record<string, number>>;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  muted: false,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  reducedMotion: false,
});

export function createDefaultMeta(): MetaState {
  return freezeMeta({ scrap: 0, unlocks: [], permanentUpgrades: {} });
}

export function createDefaultSave(): SaveData {
  return freezeSave({ version: 2, settings: DEFAULT_SETTINGS, meta: createDefaultMeta() });
}

export function applySettingsPatch(
  settings: Settings,
  patch: Readonly<Partial<Settings>>,
): Settings {
  try {
    const next = sanitizeSettings(isPlainRecord(patch) ? { ...settings, ...patch } : settings, settings);
    return settingsEqual(settings, next) ? settings : next;
  } catch {
    return settings;
  }
}

export function sanitizeMeta(raw: unknown, maxLevels: MetaUpgradeMaxLevels): MetaState {
  try {
    return sanitizeMetaRecord(raw, maxLevels);
  } catch {
    return createDefaultMeta();
  }
}

function sanitizeMetaRecord(raw: unknown, maxLevels: MetaUpgradeMaxLevels): MetaState {
  if (!isPlainRecord(raw)) return createDefaultMeta();
  const scrapRaw = readOwn(raw, 'scrap');
  const scrap = isNonNegativeSafeInteger(scrapRaw) ? scrapRaw : 0;
  const unlocksRaw = readOwn(raw, 'unlocks');
  const unlocks: string[] = [];
  const seenUnlocks = new Set<string>();
  if (Array.isArray(unlocksRaw)) {
    for (const id of unlocksRaw) {
      if (typeof id === 'string' && isUnlockId(id) && !seenUnlocks.has(id)) {
        seenUnlocks.add(id);
        unlocks.push(id);
      }
    }
  }

  const permanentUpgrades: Record<string, number> = Object.create(null) as Record<string, number>;
  const upgradesRaw = readOwn(raw, 'permanentUpgrades');
  if (isPlainRecord(upgradesRaw)) {
    for (const id of Object.keys(upgradesRaw)) {
      const level = readOwn(upgradesRaw, id);
      if (!isContentId(id) || !Number.isSafeInteger(level) || (level as number) <= 0) continue;
      const max = readOwnMaxLevel(maxLevels, id);
      permanentUpgrades[id] = max === undefined ? level as number : Math.min(level as number, max);
    }
  }
  return freezeMeta({ scrap, unlocks, permanentUpgrades });
}

export function migrate(raw: unknown, maxLevels: MetaUpgradeMaxLevels = {}): SaveData {
  try { return decodeSave(raw, maxLevels).data; } catch { return createDefaultSave(); }
}

interface SaveDecodeResult {
  readonly data: SaveData;
  readonly unsupportedFutureVersion: boolean;
}

function decodeSave(raw: unknown, maxLevels: MetaUpgradeMaxLevels): SaveDecodeResult {
  const parsed = parseRawSave(raw);
  if (!isPlainRecord(parsed)) return { data: createDefaultSave(), unsupportedFutureVersion: false };
  const version = readOwn(parsed, 'version');
  if (version === 1) return { data: migrateV1ToV2(parsed), unsupportedFutureVersion: false };
  if (version === 2) {
    return {
      data: freezeSave({
        version: 2,
        settings: sanitizeSettings(readOwn(parsed, 'settings'), DEFAULT_SETTINGS),
        meta: sanitizeMeta(readOwn(parsed, 'meta'), maxLevels),
      }),
      unsupportedFutureVersion: false,
    };
  }
  return {
    data: createDefaultSave(),
    unsupportedFutureVersion: Number.isSafeInteger(version) && (version as number) > 2,
  };
}

function migrateV1ToV2(raw: Readonly<Record<string, unknown>>): SaveDataV2 {
  return freezeSave({
    version: 2,
    settings: sanitizeSettings(readOwn(raw, 'settings'), DEFAULT_SETTINGS),
    meta: createDefaultMeta(),
  });
}

export class SaveManager {
  private writeProtected = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly key: string = RuntimeConfig.storageKey,
    private readonly maxLevels: MetaUpgradeMaxLevels = {},
  ) {}

  load(): SaveData {
    try {
      const decoded = decodeSave(this.storage.getItem(this.key), this.maxLevels);
      this.writeProtected ||= decoded.unsupportedFutureVersion;
      return decoded.data;
    } catch {
      return createDefaultSave();
    }
  }

  save(data: SaveData): boolean {
    if (this.writeProtected) return false;
    try {
      const sanitized = freezeSave({
        version: 2,
        settings: sanitizeSettings(data.settings, DEFAULT_SETTINGS),
        meta: sanitizeMeta(data.meta, this.maxLevels),
      });
      return this.storage.setItem(this.key, JSON.stringify(sanitized)) === true;
    } catch {
      return false;
    }
  }

  clear(): boolean {
    try {
      const cleared = this.storage.removeItem(this.key) === true;
      if (cleared) this.writeProtected = false;
      return cleared;
    } catch {
      return false;
    }
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly localStorageRef: Storage | null;

  constructor(localStorageRef?: Storage) {
    this.localStorageRef = localStorageRef ?? getBrowserLocalStorage();
  }

  getItem(key: string): string | null {
    try { return this.localStorageRef?.getItem(key) ?? null; } catch { return null; }
  }

  setItem(key: string, value: string): boolean {
    try {
      if (!this.localStorageRef) return false;
      this.localStorageRef.setItem(key, value);
      return true;
    } catch { return false; }
  }

  removeItem(key: string): boolean {
    try {
      if (!this.localStorageRef) return false;
      this.localStorageRef.removeItem(key);
      return true;
    } catch { return false; }
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): boolean { this.values.set(key, value); return true; }
  removeItem(key: string): boolean { this.values.delete(key); return true; }
}

function sanitizeSettings(raw: unknown, fallback: Settings): Settings {
  if (!isPlainRecord(raw)) return freezeSettings(fallback);
  const mutedRaw = readOwn(raw, 'muted');
  const reducedMotionRaw = readOwn(raw, 'reducedMotion');
  return freezeSettings({
    muted: typeof mutedRaw === 'boolean' ? mutedRaw : fallback.muted,
    musicVolume: clampVolume(readOwn(raw, 'musicVolume'), fallback.musicVolume),
    sfxVolume: clampVolume(readOwn(raw, 'sfxVolume'), fallback.sfxVolume),
    reducedMotion: typeof reducedMotionRaw === 'boolean' ? reducedMotionRaw : fallback.reducedMotion,
  });
}

function freezeSettings(settings: Settings): Settings {
  return Object.freeze({ ...settings });
}

function freezeMeta(meta: MetaState): MetaState {
  return Object.freeze({
    scrap: meta.scrap,
    unlocks: Object.freeze([...meta.unlocks]),
    permanentUpgrades: Object.freeze({ ...meta.permanentUpgrades }),
  });
}

function freezeSave(save: SaveDataV2): SaveDataV2 {
  return Object.freeze({
    version: 2,
    settings: Object.isFrozen(save.settings) ? save.settings : freezeSettings(save.settings),
    meta: Object.isFrozen(save.meta) ? save.meta : freezeMeta(save.meta),
  });
}

function settingsEqual(a: Settings, b: Settings): boolean {
  return a.muted === b.muted && a.musicVolume === b.musicVolume &&
    a.sfxVolume === b.sfxVolume && a.reducedMotion === b.reducedMotion;
}

function parseRawSave(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  if (raw.trim() === '') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function readOwn(record: Readonly<Record<string, unknown>>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function readOwnMaxLevel(levels: MetaUpgradeMaxLevels, id: string): number | undefined {
  const value = Object.hasOwn(levels, id) ? levels[id] : undefined;
  return Number.isSafeInteger(value) && (value as number) > 0 ? value : undefined;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch { return false; }
}

function getBrowserLocalStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
