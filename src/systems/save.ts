import { RuntimeConfig } from '../engine/config';
import { isContentId, isGrantTransactionId, isInstanceId, isUnlockId } from './ids';

export interface Settings {
  readonly muted: boolean;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly reducedMotion: boolean;
}

export type MetaStateV1 = Readonly<Record<string, never>>;

/** ProgressionState replaces the flat MetaState in V3. Same shape, new name
 *  per Alpha 3 architecture §4.2. */
export interface ProgressionState {
  readonly scrap: number;
  readonly unlocks: readonly string[];
  readonly permanentUpgrades: Readonly<Record<string, number>>;
}

/** Durable receipt IDs for source-owned progression transactions. */
export type AppliedGrantTransactions = Readonly<Record<string, true>>;

export interface BossProgress { readonly defeated: boolean; readonly firstDefeatedAt?: number }
export type BossProgressState = Readonly<Record<string, BossProgress>>;

/** Backward-compatible alias: all existing gameplay functions accept MetaState. */
export type MetaState = ProgressionState;

export interface StageProgress {
  readonly completed: boolean;
  readonly bestTimeMs?: number;
}

export interface AchievementProgress {
  readonly completed: boolean;
  readonly progress?: number;
  readonly completedAt?: number;
}

export interface MasteryProgress {
  readonly tier: number;
  readonly xp: number;
}

/** Persistent player-owned weapon build (Epic 23). */
export interface Build {
  readonly id: string;
  readonly name: string;
  readonly baseWeaponFamily: string;
  readonly fitted: Readonly<Partial<Record<string, string>>>;
  readonly traitParts: readonly string[];
}

/** Persistent player-owned part instance (Epic 23). */
export interface PartInstance {
  readonly partId: string;
  readonly infusedTraits: readonly string[];
}

/** Placeholder: Equipment instance. Epic 25 defines the real shape. */
export interface EquipmentInstance {
  /** Exact equipment catalog definition ID; never a set-derived alias. */
  readonly equipmentId: string;
  readonly tier: number;
}

export interface GunsmithState {
  readonly builds: readonly Build[];
  readonly parts: Record<string, PartInstance>;
}

export type StageProgressState = Record<string, StageProgress>;
export type AchievementProgressState = Record<string, AchievementProgress>;
/** Monotonic authoritative counters consumed by achievement metric extractors. */
export type AchievementMetricState = Readonly<Record<string, number>>;
export type CharacterMasteryState = Record<string, MasteryProgress>;
export type EquipmentState = Record<string, EquipmentInstance>;

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

export interface SaveDataV3 {
  readonly version: 3;
  readonly settings: Settings;
  readonly progression: ProgressionState;
  readonly stages: StageProgressState;
  readonly achievements: AchievementProgressState;
  readonly achievementMetrics: AchievementMetricState;
  readonly characters: CharacterMasteryState;
  readonly gunsmith: GunsmithState;
  readonly equipment: EquipmentState;
  readonly bosses: BossProgressState;
  readonly appliedGrantTransactions: AppliedGrantTransactions;
}

export type SaveData = SaveDataV3;
export type MetaUpgradeMaxLevels = Readonly<Record<string, number>>;

/** Current save format version. Incremented to 3 per Alpha 3 architecture §4. */
export const CURRENT_SAVE_VERSION = 3;

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

export function createDefaultProgression(): ProgressionState {
  return freezeProgression({ scrap: 0, unlocks: [], permanentUpgrades: {} });
}

/** @deprecated Use createDefaultProgression() for V3. */
export function createDefaultMeta(): MetaState {
  return createDefaultProgression();
}

export function createDefaultSaveV3(): SaveDataV3 {
  return freezeSaveV3({
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
}

export function createDefaultSave(): SaveData {
  return createDefaultSaveV3();
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

export function sanitizeProgression(raw: unknown, maxLevels: MetaUpgradeMaxLevels): ProgressionState {
  try {
    return sanitizeProgressionRecord(raw, maxLevels);
  } catch {
    return createDefaultProgression();
  }
}

/** @deprecated Use sanitizeProgression() for V3. */
export function sanitizeMeta(raw: unknown, maxLevels: MetaUpgradeMaxLevels): MetaState {
  return sanitizeProgression(raw, maxLevels);
}

function sanitizeProgressionRecord(raw: unknown, maxLevels: MetaUpgradeMaxLevels): ProgressionState {
  if (!isPlainRecord(raw)) return createDefaultProgression();
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
  return freezeProgression({ scrap, unlocks, permanentUpgrades });
}

/** V2 → V3 migration per Alpha 3 architecture §4.4.
 *  Preserves: scrap → progression.scrap, unlocks → progression.unlocks,
 *  permanentUpgrades → progression.permanentUpgrades,
 *  achievement:first-victory → achievements['achievement:first-victory']. */
export function migrateV2ToV3(raw: Readonly<Record<string, unknown>>, maxLevels: MetaUpgradeMaxLevels = {}): SaveDataV3 {
  const v2Progression = sanitizeProgression(readOwn(raw, 'meta'), maxLevels);
  return freezeSaveV3({
    version: 3,
    settings: sanitizeSettings(readOwn(raw, 'settings'), DEFAULT_SETTINGS),
    progression: v2Progression,
    stages: {},
    achievements: migrateAchievementsFromV2(v2Progression),
    achievementMetrics: {},
    characters: {},
    gunsmith: { builds: [], parts: {} },
    equipment: {},
    bosses: {},
    appliedGrantTransactions: {},
  });
}

function migrateAchievementsFromV2(progression: ProgressionState): AchievementProgressState {
  const achievements: AchievementProgressState = {};
  if (progression.unlocks.includes('achievement:first-victory')) {
    achievements['achievement:first-victory'] = {
      completed: true,
    };
  }
  return achievements;
}

export function migrate(raw: unknown, maxLevels: MetaUpgradeMaxLevels = {}): SaveData {
  try { return decodeSave(raw, maxLevels).data; } catch { return createDefaultSaveV3(); }
}

interface SaveDecodeResult {
  readonly data: SaveData;
  readonly unsupportedFutureVersion: boolean;
}

function decodeSave(raw: unknown, maxLevels: MetaUpgradeMaxLevels): SaveDecodeResult {
  const parsed = parseRawSave(raw);
  if (!isPlainRecord(parsed)) return { data: createDefaultSaveV3(), unsupportedFutureVersion: false };
  const version = readOwn(parsed, 'version');
  if (version === 1) return { data: migrateV1ToV3(parsed), unsupportedFutureVersion: false };
  if (version === 2) return { data: migrateV2ToV3(parsed, maxLevels), unsupportedFutureVersion: false };
  if (version === 3) {
    return {
      data: freezeSaveV3({
        version: 3,
        settings: sanitizeSettings(readOwn(parsed, 'settings'), DEFAULT_SETTINGS),
        progression: sanitizeProgression(readOwn(parsed, 'progression'), maxLevels),
        stages: sanitizeStageProgress(readOwn(parsed, 'stages')),
        achievements: sanitizeAchievementProgress(readOwn(parsed, 'achievements')),
        achievementMetrics: sanitizeAchievementMetrics(readOwn(parsed, 'achievementMetrics')),
        characters: sanitizeCharacterMastery(readOwn(parsed, 'characters')),
        gunsmith: sanitizeGunsmithState(readOwn(parsed, 'gunsmith')),
        equipment: sanitizeEquipmentState(readOwn(parsed, 'equipment')),
        bosses: sanitizeBossProgress(readOwn(parsed, 'bosses')),
        appliedGrantTransactions: sanitizeAppliedGrantTransactions(readOwn(parsed, 'appliedGrantTransactions')),
      }),
      unsupportedFutureVersion: false,
    };
  }
  return {
    data: createDefaultSaveV3(),
    unsupportedFutureVersion: Number.isSafeInteger(version) && (version as number) > 3,
  };
}

function migrateV1ToV3(raw: Readonly<Record<string, unknown>>): SaveDataV3 {
  return freezeSaveV3({
    version: 3,
    settings: sanitizeSettings(readOwn(raw, 'settings'), DEFAULT_SETTINGS),
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
}

// ── V3 domain sanitizers ────────────────────────────────────────────

function sanitizeStageProgress(raw: unknown): StageProgressState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, StageProgress> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isContentId(key) && !isUnlockId(key)) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const completed = readOwn(entry, 'completed');
    const bestTimeMs = readOwn(entry, 'bestTimeMs');
    result[key] = {
      completed: typeof completed === 'boolean' ? completed : false,
      ...(Number.isSafeInteger(bestTimeMs) && (bestTimeMs as number) > 0
        ? { bestTimeMs: bestTimeMs as number }
        : {}),
    };
  }
  return result;
}

function sanitizeAchievementProgress(raw: unknown): AchievementProgressState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, AchievementProgress> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isUnlockId(key)) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const completed = readOwn(entry, 'completed');
    const progress = readOwn(entry, 'progress');
    const completedAt = readOwn(entry, 'completedAt');
    result[key] = {
      completed: typeof completed === 'boolean' ? completed : false,
      ...(Number.isSafeInteger(progress) && (progress as number) >= 0
        ? { progress: progress as number }
        : {}),
      ...(Number.isSafeInteger(completedAt) && (completedAt as number) > 0
        ? { completedAt: completedAt as number }
        : {}),
    };
  }
  return result;
}

function sanitizeAchievementMetrics(raw: unknown): AchievementMetricState {
  if (!isPlainRecord(raw)) return Object.freeze({});
  const result: Record<string, number> = Object.create(null);
  for (const id of Object.keys(raw)) {
    const value = readOwn(raw, id);
    if (isUnlockId(id) && Number.isSafeInteger(value) && (value as number) >= 0) result[id] = value as number;
  }
  return Object.freeze(result);
}

function sanitizeCharacterMastery(raw: unknown): CharacterMasteryState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, MasteryProgress> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isContentId(key)) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const tier = readOwn(entry, 'tier');
    const xp = readOwn(entry, 'xp');
    result[key] = {
      tier: Number.isSafeInteger(tier) && (tier as number) >= 0 ? tier as number : 0,
      xp: Number.isSafeInteger(xp) && (xp as number) >= 0 ? xp as number : 0,
    };
  }
  return result;
}

function sanitizeGunsmithState(raw: unknown): GunsmithState {
  if (!isPlainRecord(raw)) return { builds: [], parts: {} };
  const buildsRaw = readOwn(raw, 'builds');
  const partsRaw = readOwn(raw, 'parts');
  const builds: Build[] = Array.isArray(buildsRaw)
    ? buildsRaw.filter((b): b is Record<string, unknown> => isPlainRecord(b) && typeof readOwn(b, 'id') === 'string')
        .map((b) => ({
          id: readOwn(b, 'id') as string,
          name: typeof readOwn(b, 'name') === 'string' ? readOwn(b, 'name') as string : readOwn(b, 'id') as string,
          baseWeaponFamily: typeof readOwn(b, 'baseWeaponFamily') === 'string' ? readOwn(b, 'baseWeaponFamily') as string : 'pistol',
          fitted: sanitizeFittedParts(readOwn(b, 'fitted')),
          traitParts: Array.isArray(readOwn(b, 'traitParts'))
            ? (readOwn(b, 'traitParts') as unknown[]).filter((t): t is string => typeof t === 'string')
            : [],
        }))
    : [];
  const parts: Record<string, PartInstance> = Object.create(null);
  if (isPlainRecord(partsRaw)) {
    for (const key of Object.keys(partsRaw)) {
      if (!isInstanceId(key)) continue;
      const entry = readOwn(partsRaw as Record<string, unknown>, key);
      if (isPlainRecord(entry) && typeof readOwn(entry, 'partId') === 'string') {
        const infused = readOwn(entry, 'infusedTraits');
        parts[key] = {
          partId: readOwn(entry, 'partId') as string,
          infusedTraits: Array.isArray(infused)
            ? (infused as unknown[]).filter((t): t is string => typeof t === 'string')
            : [],
        };
      }
    }
  }
  return { builds, parts };
}

function sanitizeFittedParts(raw: unknown): Readonly<Partial<Record<string, string>>> {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, string> = {};
  for (const [slot, partId] of Object.entries(raw)) {
    if (typeof partId === 'string' && isUnlockId(partId) && partId.startsWith('part:')) {
      result[slot] = partId;
    }
  }
  return Object.freeze(result);
}

function sanitizeEquipmentState(raw: unknown): EquipmentState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, EquipmentInstance> = Object.create(null);
  for (const key of Object.keys(raw)) {
    if (!isInstanceId(key)) continue;
    const entry = readOwn(raw as Record<string, unknown>, key);
    if (!isPlainRecord(entry)) continue;
    const equipmentId = readOwn(entry, 'equipmentId');
    const tier = readOwn(entry, 'tier');
    // Existing V3 entries used { setId, tier } under an instance/definition
    // key. Preserve the key and recover the definition ID from it once.
    // Old V3 stored a definition key with `{ setId, tier }`.  Only migrate
    // that unambiguous form; an arbitrary instance key is not a definition.
    const canonicalId = typeof equipmentId === 'string'
      ? equipmentId
      : (isContentId(key) || isUnlockId(key) ? key : undefined);
    if (canonicalId !== undefined && (isContentId(canonicalId) || isUnlockId(canonicalId))) {
      result[key] = {
        equipmentId: canonicalId,
        tier: Number.isSafeInteger(tier) && (tier as number) >= 0 ? tier as number : 0,
      };
    }
  }
  return result;
}

function sanitizeBossProgress(raw: unknown): BossProgressState {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, BossProgress> = Object.create(null);
  for (const id of Object.keys(raw)) {
    if (!isContentId(id) && !isUnlockId(id)) continue;
    const value = readOwn(raw, id);
    if (!isPlainRecord(value) || readOwn(value, 'defeated') !== true) continue;
    const firstDefeatedAt = readOwn(value, 'firstDefeatedAt');
    result[id] = { defeated: true, ...(Number.isSafeInteger(firstDefeatedAt) && (firstDefeatedAt as number) > 0 ? { firstDefeatedAt: firstDefeatedAt as number } : {}) };
  }
  return Object.freeze(result);
}

function sanitizeAppliedGrantTransactions(raw: unknown): AppliedGrantTransactions {
  if (!isPlainRecord(raw)) return {};
  const result: Record<string, true> = Object.create(null);
  for (const id of Object.keys(raw)) if (isGrantTransactionId(id)) result[id] = true;
  return Object.freeze(result);
}

// ── SaveManager ──────────────────────────────────────────────────────

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
      return createDefaultSaveV3();
    }
  }

  /** V3-aware load: decodes V1/V2/V3, write-protects > 3 per architecture §4.6. */
  loadV3(): SaveDataV3 {
    return this.load();
  }

  save(data: SaveData): boolean {
    if (this.writeProtected) return false;
    try {
      const sanitized = freezeSaveV3({
        version: 3,
        settings: sanitizeSettings(data.settings, DEFAULT_SETTINGS),
        progression: sanitizeProgression(data.progression, this.maxLevels),
        stages: sanitizeStageProgress(data.stages),
        achievements: sanitizeAchievementProgress(data.achievements),
        achievementMetrics: sanitizeAchievementMetrics(data.achievementMetrics),
        characters: sanitizeCharacterMastery(data.characters),
        gunsmith: sanitizeGunsmithState(data.gunsmith),
        equipment: sanitizeEquipmentState(data.equipment),
        bosses: sanitizeBossProgress(data.bosses),
        appliedGrantTransactions: sanitizeAppliedGrantTransactions(data.appliedGrantTransactions),
      });
      return this.storage.setItem(this.key, JSON.stringify(sanitized)) === true;
    } catch {
      return false;
    }
  }

  /** V3-aware save per architecture §4.6. */
  saveV3(data: SaveDataV3): boolean {
    return this.save(data);
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

// ── Internal helpers ─────────────────────────────────────────────────

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

function freezeProgression(p: ProgressionState): ProgressionState {
  return Object.freeze({
    scrap: p.scrap,
    unlocks: Object.freeze([...p.unlocks]),
    permanentUpgrades: Object.freeze({ ...p.permanentUpgrades }),
  });
}

function freezeSaveV3(save: SaveDataV3): SaveDataV3 {
  return Object.freeze({
    version: 3,
    settings: Object.isFrozen(save.settings) ? save.settings : freezeSettings(save.settings),
    progression: Object.isFrozen(save.progression) ? save.progression : freezeProgression(save.progression),
    stages: Object.freeze({ ...save.stages }),
    achievements: Object.freeze({ ...save.achievements }),
    achievementMetrics: Object.freeze({ ...save.achievementMetrics }),
    characters: Object.freeze({ ...save.characters }),
    gunsmith: Object.freeze({
      builds: Object.freeze([...save.gunsmith.builds]),
      parts: Object.freeze({ ...save.gunsmith.parts }),
    }),
    equipment: Object.freeze({ ...save.equipment }),
    bosses: Object.freeze({ ...save.bosses }),
    appliedGrantTransactions: Object.freeze({ ...save.appliedGrantTransactions }),
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
