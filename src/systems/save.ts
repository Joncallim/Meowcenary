import { RuntimeConfig } from '../engine/config';

export interface Settings {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
}

export type MetaState = Record<string, never>;

export interface SaveDataV1 {
  version: 1;
  settings: Settings;
  meta: MetaState;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  reducedMotion: false,
};

export function createDefaultSave(): SaveDataV1 {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    meta: {},
  };
}

export function applySettingsPatch(settings: Settings, patch: Partial<Settings>): Settings {
  Object.assign(settings, migrateSettings({ ...settings, ...patch }, settings));
  return settings;
}

export function migrate(raw: unknown): SaveDataV1 {
  const parsed = parseRawSave(raw);
  if (!isRecord(parsed)) {
    return createDefaultSave();
  }

  switch (parsed.version) {
    case 1:
      return migrateV1(parsed);
    default:
      return createDefaultSave();
  }
}

export class SaveManager {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly key: string = RuntimeConfig.storageKey,
  ) {}

  load(): SaveDataV1 {
    try {
      return migrate(this.storage.getItem(this.key));
    } catch {
      return createDefaultSave();
    }
  }

  save(data: SaveDataV1): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(migrate(data)));
    } catch {
      // Persistence is best-effort; boot and settings recovery must stay non-fatal.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // Persistence is best-effort; storage-disabled browsers should still boot.
    }
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly localStorageRef: Storage | null;

  constructor(localStorageRef?: Storage) {
    this.localStorageRef = localStorageRef ?? getBrowserLocalStorage();
  }

  getItem(key: string): string | null {
    try {
      return this.localStorageRef?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.localStorageRef?.setItem(key, value);
    } catch {
      // Ignore blocked, full, or disabled storage.
    }
  }

  removeItem(key: string): void {
    try {
      this.localStorageRef?.removeItem(key);
    } catch {
      // Ignore blocked or disabled storage.
    }
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function parseRawSave(raw: unknown): unknown {
  if (typeof raw === 'string') {
    if (raw.trim() === '') {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  return raw;
}

function migrateV1(raw: Record<string, unknown>): SaveDataV1 {
  return {
    version: 1,
    settings: migrateSettings(raw.settings),
    meta: migrateMeta(raw.meta),
  };
}

function migrateSettings(raw: unknown, fallback: Settings = DEFAULT_SETTINGS): Settings {
  if (!isRecord(raw)) {
    return { ...fallback };
  }

  return {
    muted: typeof raw.muted === 'boolean' ? raw.muted : fallback.muted,
    musicVolume: clampVolume(raw.musicVolume, fallback.musicVolume),
    sfxVolume: clampVolume(raw.sfxVolume, fallback.sfxVolume),
    reducedMotion:
      typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : fallback.reducedMotion,
  };
}

function migrateMeta(raw: unknown): MetaState {
  if (!isRecord(raw)) {
    return {};
  }

  return {};
}

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getBrowserLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
